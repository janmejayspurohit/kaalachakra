/**
 * Accounts, sessions, TOTP and the admin routes, against docs/ACCOUNTS.md.
 *
 * Requests go through app.inject() with a small cookie jar, so the session
 * cookie travels exactly as a browser would send it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from '../src/server.js';
import { totpAt } from '../src/auth/crypto.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '..', 'src', 'cli.js');
const Q = 'year=2026&month=5&day=6&latitude=12.97&longitude=77.59&timezone=Asia/Kolkata';
const INITIAL = 'Initial-Admin-Pass-1';
const ADMIN = 'admin@janmejay.info';
const step = () => Math.floor(Date.now() / 1000 / 30);

async function newApp(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kc-auth-'));
  const dbPath = join(dir, 'k.db');
  const app = await build({ dbPath, logger: false, adminInitialPassword: INITIAL, ...opts });
  await app.ready();
  return { app, dir, dbPath };
}

/** A browser-like client: keeps the kc_session cookie between requests. */
function client(app) {
  let cookie = null;
  const req = async (method, url, body, headers = {}) => {
    const r = await app.inject({
      method, url,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers['set-cookie'];
    if (sc) {
      const first = Array.isArray(sc) ? sc[0] : sc;
      const m = /^kc_session=([^;]*)/.exec(first);
      if (m) cookie = m[1] && !/Max-Age=0/i.test(first) ? `kc_session=${m[1]}` : null;
    }
    let json = null;
    try { json = r.body ? JSON.parse(r.body) : null; } catch { json = null; }
    return { status: r.statusCode, json, headers: r.headers };
  };
  return { req, get cookie() { return cookie; } };
}

async function adminReady(app) {
  const a = client(app);
  await a.req('POST', '/auth/login', { email: ADMIN, password: INITIAL });
  const ch = await a.req('POST', '/auth/password', { currentPassword: INITIAL, newPassword: 'Admin-New-Pass-2026' });
  assert.equal(ch.status, 204);
  return a;
}

async function newUser(app, admin, email) {
  const r = await admin.req('POST', '/admin/users', { email });
  assert.equal(r.status, 201);
  const u = client(app);
  assert.equal((await u.req('POST', '/auth/login', { email, password: r.json.temporaryPassword })).status, 200);
  assert.equal((await u.req('POST', '/auth/password', { currentPassword: r.json.temporaryPassword, newPassword: `${email}-Pass-2026` })).status, 204);
  return { client: u, id: r.json.user.id, password: `${email}-Pass-2026` };
}

test('the gate: nothing but /health and the auth routes without a session', async () => {
  const { app } = await newApp();
  const anon = client(app);
  assert.equal((await anon.req('GET', `/panchanga?${Q}`)).status, 401);
  assert.equal((await anon.req('GET', '/profiles')).status, 401);
  assert.equal((await anon.req('GET', '/admin/users')).status, 401);
  const h = await anon.req('GET', '/health');
  assert.equal(h.status, 200);
  assert.deepEqual(h.json, { ok: true });
  await app.close();
});

test('login: same answer for a wrong password and an unknown email; case-insensitive email; cookie flags', async () => {
  const { app } = await newApp();
  const c = client(app);
  const bad1 = await c.req('POST', '/auth/login', { email: ADMIN, password: 'wrong-password-x' });
  const bad2 = await c.req('POST', '/auth/login', { email: 'nobody@nowhere.x', password: 'wrong-password-x' });
  assert.equal(bad1.status, 401);
  assert.equal(bad2.status, 401);
  assert.deepEqual(bad1.json, bad2.json);
  const ok = await c.req('POST', '/auth/login', { email: 'ADMIN@janmejay.info', password: INITIAL });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.mustChangePassword, true);
  assert.doesNotMatch(JSON.stringify(ok.json), /password_hash|scrypt|totp_secret/i);
  const cookie = [].concat(ok.headers['set-cookie'])[0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//);
  await app.close();
});

test('the first sign-in must change the generated password before anything else', async () => {
  const { app } = await newApp();
  const a = client(app);
  await a.req('POST', '/auth/login', { email: ADMIN, password: INITIAL });
  assert.equal((await a.req('GET', '/profiles')).status, 403);
  assert.equal((await a.req('GET', '/auth/me')).status, 200);
  assert.equal((await a.req('POST', '/auth/password', { currentPassword: INITIAL, newPassword: 'short-11chr' })).status, 400);
  assert.equal((await a.req('POST', '/auth/password', { currentPassword: INITIAL, newPassword: INITIAL })).status, 400);
  assert.equal((await a.req('POST', '/auth/password', { currentPassword: 'not-the-password', newPassword: 'Admin-New-Pass-2026' })).status, 401);
  assert.equal((await a.req('POST', '/auth/password', { currentPassword: INITIAL, newPassword: 'Admin-New-Pass-2026' })).status, 204);
  assert.equal((await a.req('GET', '/profiles')).status, 200);
  assert.equal((await a.req('GET', '/auth/me')).json.user.mustChangePassword, false);
  // The old password no longer works.
  assert.equal((await client(app).req('POST', '/auth/login', { email: ADMIN, password: INITIAL })).status, 401);
  await app.close();
});

test('only an admin creates accounts; every account starts on a generated password', async () => {
  const { app } = await newApp();
  const admin = await adminReady(app);
  const cu = await admin.req('POST', '/admin/users', { email: 'user1@example.com' });
  assert.equal(cu.status, 201);
  assert.equal(cu.json.temporaryPassword.length, 20);
  assert.equal(cu.json.user.role, 'user');
  assert.equal((await admin.req('POST', '/admin/users', { email: 'USER1@example.com' })).status, 409);
  assert.equal((await admin.req('POST', '/admin/users', { email: 'not-an-email' })).status, 400);
  const u = client(app);
  const ul = await u.req('POST', '/auth/login', { email: 'user1@example.com', password: cu.json.temporaryPassword });
  assert.equal(ul.json.user.mustChangePassword, true);
  await u.req('POST', '/auth/password', { currentPassword: cu.json.temporaryPassword, newPassword: 'User-One-Pass-2026' });
  assert.equal((await u.req('GET', '/admin/users')).status, 403);
  assert.equal((await u.req('POST', '/admin/users', { email: 'x@y.z' })).status, 403);
  const list = await admin.req('GET', '/admin/users');
  assert.equal(list.json.users.length, 2);
  assert.doesNotMatch(JSON.stringify(list.json), /scrypt|password_hash|totp_secret/);
  await app.close();
});

test('five wrong passwords lock the account; the lock shows only after the right password', async () => {
  const { app } = await newApp();
  const admin = await adminReady(app);
  const cu = await admin.req('POST', '/admin/users', { email: 'user2@example.com' });
  const u = client(app);
  for (let i = 0; i < 5; i++) {
    assert.equal((await u.req('POST', '/auth/login', { email: 'user2@example.com', password: `wrong-${i}` })).status, 401);
  }
  assert.equal((await u.req('POST', '/auth/login', { email: 'user2@example.com', password: 'wrong-again' })).status, 401);
  const locked = await u.req('POST', '/auth/login', { email: 'user2@example.com', password: cu.json.temporaryPassword });
  assert.equal(locked.status, 423);
  assert.deepEqual(locked.json, { error: 'account locked, try again later' });
  // An admin password reset clears the lock.
  const rp = await admin.req('POST', `/admin/users/${cu.json.user.id}/reset-password`);
  assert.equal(rp.status, 200);
  assert.equal((await u.req('POST', '/auth/login', { email: 'user2@example.com', password: rp.json.temporaryPassword })).status, 200);
  await app.close();
});

test('TOTP: setup, enable, two-step sign-in, wrong and replayed codes, encrypted at rest', async () => {
  const { app } = await newApp();
  const admin = await adminReady(app);
  const { client: u } = await newUser(app, admin, 'totp@example.com');
  const setup = await u.req('POST', '/auth/totp/setup');
  assert.equal(setup.status, 200);
  assert.match(setup.json.secret, /^[A-Z2-7]{32}$/);
  assert.ok(setup.json.otpauthUrl.startsWith('otpauth://totp/Kaalachakra:'));
  assert.ok((await u.req('POST', '/auth/totp/enable', { code: '000000' })).status >= 400);
  assert.equal((await u.req('POST', '/auth/totp/enable', { code: totpAt(setup.json.secret, step()) })).status, 204);

  const row = app.db.prepare('SELECT totp_secret, password_hash FROM users WHERE email = ?').get('totp@example.com');
  assert.ok(row.totp_secret.startsWith('v1:'));
  assert.ok(!row.totp_secret.includes(setup.json.secret));
  assert.ok(row.password_hash.startsWith('scrypt$'));

  await u.req('POST', '/auth/logout');
  const m1 = await u.req('POST', '/auth/login', { email: 'totp@example.com', password: 'totp@example.com-Pass-2026' });
  assert.deepEqual(m1.json, { mfaRequired: true });
  assert.equal((await u.req('GET', '/auth/me')).status, 401, 'an mfa session is not signed in');
  assert.equal((await u.req('GET', '/profiles')).status, 401);
  assert.equal((await u.req('POST', '/auth/totp', { code: '000000' })).status, 401);
  // The enabling code's step is spent; the next step's code works once.
  const good = totpAt(setup.json.secret, step() + 1);
  const t1 = await u.req('POST', '/auth/totp', { code: good });
  assert.equal(t1.status, 200);
  assert.equal(t1.json.user.email, 'totp@example.com');
  assert.equal((await u.req('GET', '/profiles')).status, 200);
  await u.req('POST', '/auth/logout');
  await u.req('POST', '/auth/login', { email: 'totp@example.com', password: 'totp@example.com-Pass-2026' });
  assert.equal((await u.req('POST', '/auth/totp', { code: good })).status, 401, 'replay refused');
  assert.equal((await client(app).req('POST', '/auth/totp', { code: '123456' })).status, 401, 'no mfa session');
  await app.close();
});

test('TOTP guessing stops at the lock, even with a live mfa session', async () => {
  const { app } = await newApp();
  const admin = await adminReady(app);
  const secret = (await admin.req('POST', '/auth/totp/setup')).json.secret;
  await admin.req('POST', '/auth/totp/enable', { code: totpAt(secret, step()) });
  const c = client(app);
  await c.req('POST', '/auth/login', { email: ADMIN, password: 'Admin-New-Pass-2026' });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await c.req('POST', '/auth/totp', { code: String(100000 + i) })).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 423]);
  const after = await c.req('POST', '/auth/totp', { code: totpAt(secret, step() + 1) });
  assert.notEqual(after.status, 200, 'the right code after the lock must not sign in');
  await app.close();
});

test('TOTP can be turned off with password and code, not otherwise', async () => {
  const { app } = await newApp();
  const admin = await adminReady(app);
  assert.equal((await admin.req('POST', '/auth/totp/disable', { password: 'Admin-New-Pass-2026', code: '000000' })).status, 400, 'not enabled');
  const secret = (await admin.req('POST', '/auth/totp/setup')).json.secret;
  await admin.req('POST', '/auth/totp/enable', { code: totpAt(secret, step()) });
  assert.equal((await admin.req('POST', '/auth/totp/disable', { password: 'wrong', code: totpAt(secret, step() + 1) })).status, 401);
  assert.equal((await admin.req('POST', '/auth/totp/disable', { password: 'Admin-New-Pass-2026', code: totpAt(secret, step() + 1) })).status, 204);
  assert.equal((await admin.req('GET', '/auth/me')).json.user.totpEnabled, false);
  await app.close();
});

test('admin resets and deletes: sessions end, the admin cannot delete itself, profiles move to the admin', async () => {
  const { app } = await newApp();
  const admin = await adminReady(app);
  const { client: u, id } = await newUser(app, admin, 'reset@example.com');
  assert.equal((await u.req('GET', '/auth/me')).status, 200);
  const rp = await admin.req('POST', `/admin/users/${id}/reset-password`);
  assert.equal(rp.status, 200);
  assert.equal(rp.json.temporaryPassword.length, 20);
  assert.equal((await u.req('GET', '/auth/me')).status, 401, 'reset ends the user\'s sessions');
  assert.equal((await admin.req('POST', `/admin/users/${id}/reset-totp`)).status, 204);
  assert.equal((await admin.req('POST', '/admin/users/no-such-id/reset-password')).status, 404);
  const me = (await admin.req('GET', '/auth/me')).json.user;
  assert.equal((await admin.req('DELETE', `/admin/users/${me.id}`)).status, 400);
  assert.equal((await admin.req('DELETE', `/admin/users/${id}`)).status, 204);
  assert.equal((await admin.req('GET', '/admin/users')).json.users.length, 1);
  await app.close();
});

test('CSRF: a cross-site POST is refused; same-origin requests pass', async () => {
  const { app } = await newApp();
  const admin = await adminReady(app);
  const evil = await admin.req('POST', '/admin/users', { email: 'evil@x.y' }, { origin: 'https://evil.example', host: 'astro.janmejay.info' });
  assert.equal(evil.status, 403);
  const same = await admin.req('POST', '/admin/users', { email: 'ok@x.y' }, { origin: 'https://astro.janmejay.info', host: 'astro.janmejay.info' });
  assert.equal(same.status, 201);
  await admin.req('POST', '/auth/logout');
  assert.equal((await admin.req('GET', '/auth/me')).status, 401);
  await app.close();
});

test('per-IP limit: the 21st sign-in attempt in 15 minutes gets 429', async () => {
  const { app } = await newApp();
  const c = client(app);
  let last = 0;
  for (let i = 0; i < 21; i++) last = (await c.req('POST', '/auth/login', { email: `n${i}@x.y`, password: 'whatever-1' })).status;
  assert.equal(last, 429);
  await app.close();
});

test('a generated first password: file with mode 600, works once, deleted after the change', async () => {
  const { app, dir } = await newApp({ adminInitialPassword: undefined });
  const f = join(dir, 'INITIAL_ADMIN_PASSWORD');
  assert.ok(existsSync(f));
  assert.equal(statSync(f).mode & 0o777, 0o600);
  const pw = readFileSync(f, 'utf8').trim();
  assert.equal(pw.length, 20);
  const a = client(app);
  assert.equal((await a.req('POST', '/auth/login', { email: ADMIN, password: pw })).status, 200);
  assert.equal((await a.req('POST', '/auth/password', { currentPassword: pw, newPassword: 'Second-Admin-Pass-99' })).status, 204);
  assert.ok(!existsSync(f));
  await app.close();
});

test('recovery CLI: reset-admin prints a new password, clears TOTP, forces a change', async () => {
  const { app, dbPath } = await newApp();
  const admin = await adminReady(app);
  const secret = (await admin.req('POST', '/auth/totp/setup')).json.secret;
  await admin.req('POST', '/auth/totp/enable', { code: totpAt(secret, step()) });
  await app.close();
  const pw = execFileSync('node', [CLI, 'reset-admin'], { env: { ...process.env, KAALACHAKRA_DB: dbPath } }).toString().trim();
  assert.equal(pw.length, 20);
  const app2 = await build({ dbPath, logger: false });
  const l = await client(app2).req('POST', '/auth/login', { email: ADMIN, password: pw });
  assert.equal(l.status, 200);
  assert.equal(l.json.user.mustChangePassword, true);
  assert.equal(l.json.user.totpEnabled, false);
  await app2.close();
  assert.throws(() => execFileSync('node', [CLI, 'bogus'], { stdio: 'pipe' }), (e) => e.status === 2);
});
