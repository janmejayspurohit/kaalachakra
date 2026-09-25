/**
 * Profiles are private to their owner; the owner can share them, view-only or
 * editable. Another user's profile must be indistinguishable from a missing
 * one on every route that takes a profile id.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/server.js';

const Q = 'year=2026&month=5&day=6&latitude=12.97&longitude=77.59&timezone=Asia/Kolkata';
const BODY = {
  name: 'Test A', gender: 'male',
  birth: { year: 1990, month: 1, day: 1, hour: 6, minute: 0 },
  place: { latitude: 12.97194, longitude: 77.59369, altitude: 920, timezone: 'Asia/Kolkata', name: 'Bengaluru' },
};

const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'kc-share-')), 's.db'), logger: false, adminInitialPassword: 'Initial-Admin-Pass-1' });
await app.ready();
test.after(() => app.close());

function client() {
  let cookie = null;
  return async (method, url, body) => {
    const r = await app.inject({
      method, url,
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers['set-cookie'];
    if (sc) { const m = /^kc_session=([^;]*)/.exec([].concat(sc)[0]); cookie = m && m[1] ? `kc_session=${m[1]}` : null; }
    let json = null; try { json = r.body ? JSON.parse(r.body) : null; } catch { json = null; }
    return { status: r.statusCode, json };
  };
}

async function signedIn(email, password, next) {
  const c = client();
  assert.equal((await c('POST', '/auth/login', { email, password })).status, 200);
  assert.equal((await c('POST', '/auth/password', { currentPassword: password, newPassword: next })).status, 204);
  return c;
}

const admin = await signedIn('admin@janmejay.info', 'Initial-Admin-Pass-1', 'Admin-New-Pass-2026');
const made = {};
for (const email of ['a@example.com', 'b@example.com']) {
  const r = await admin('POST', '/admin/users', { email });
  made[email] = { id: r.json.user.id, c: await signedIn(email, r.json.temporaryPassword, `${email}-Pass-2026`) };
}
const A = made['a@example.com'].c, B = made['b@example.com'].c;
const bId = made['b@example.com'].id, aId = made['a@example.com'].id;
let id;

test('a new profile is visible only to its owner', async () => {
  const r = await A('POST', '/profiles', BODY);
  assert.equal(r.status, 201);
  id = r.json.id;
  assert.ok((await A('GET', '/profiles')).json.profiles.some((p) => p.id === id && p.access === 'owner'));
  assert.ok(!(await B('GET', '/profiles')).json.profiles.some((p) => p.id === id));
});

test('every route taking a profile id treats a stranger\'s profile as missing', async () => {
  assert.equal((await B('GET', `/profiles/${id}`)).status, 404);
  assert.equal((await B('GET', `/profiles/${id}/chart`)).status, 404);
  assert.equal((await B('GET', `/profiles/${id}/dasha`)).status, 404);
  assert.equal((await B('GET', `/muhurta?${Q}&profileId=${id}`)).status, 404);
  const m = await B('POST', '/match', { brideProfileId: id, groom: { nakshatra: 4, pada: 1 } });
  assert.equal(m.status, 400);
  assert.match(m.json.error, /not found/);
  const p = await B('GET', `/panchanga?${Q}&profileId=${id}`);
  assert.equal(p.status, 200);
  assert.deepEqual(p.json.summaries, []);
  assert.equal((await B('PUT', `/profiles/${id}`, BODY)).status, 404);
  assert.equal((await B('DELETE', `/profiles/${id}`)).status, 404);
  assert.equal((await B('GET', `/profiles/${id}/shares`)).status, 404);
});

test('the admin is not a superuser for data', async () => {
  assert.equal((await admin('GET', `/profiles/${id}`)).status, 404);
  assert.ok(!(await admin('GET', '/profiles')).json.profiles.some((p) => p.id === id));
});

test('a view share: read, but not change, delete or manage sharing', async () => {
  assert.equal((await A('POST', `/profiles/${id}/shares`, { email: 'b@example.com', permission: 'view' })).status, 204);
  const listed = (await B('GET', '/profiles')).json.profiles.find((p) => p.id === id);
  assert.equal(listed.access, 'view');
  assert.equal(listed.ownerEmail, 'a@example.com');
  assert.equal((await B('GET', `/profiles/${id}`)).status, 200);
  assert.equal((await B('GET', `/profiles/${id}/chart`)).status, 200);
  assert.equal((await B('GET', `/muhurta?${Q}&profileId=${id}`)).status, 200);
  const put = await B('PUT', `/profiles/${id}`, { ...BODY, name: 'Changed' });
  assert.equal(put.status, 403);
  assert.equal(put.json.error, 'read-only share');
  assert.equal((await B('DELETE', `/profiles/${id}`)).status, 403);
  assert.equal((await B('GET', `/profiles/${id}/shares`)).status, 403);
  assert.deepEqual((await A('GET', `/profiles/${id}/shares`)).json.shares, [{ userId: bId, email: 'b@example.com', permission: 'view' }]);
});

test('an edit share: change, but still not delete', async () => {
  assert.equal((await A('POST', `/profiles/${id}/shares`, { email: 'b@example.com', permission: 'edit' })).status, 204);
  assert.equal((await A('GET', `/profiles/${id}/shares`)).json.shares.length, 1, 'upsert, not a second row');
  assert.equal((await B('PUT', `/profiles/${id}`, { ...BODY, name: 'Changed by B' })).status, 200);
  assert.equal((await A('GET', `/profiles/${id}`)).json.name, 'Changed by B');
  const del = await B('DELETE', `/profiles/${id}`);
  assert.equal(del.status, 403);
  assert.equal(del.json.error, 'only the owner can delete');
});

test('sharing errors', async () => {
  assert.equal((await A('POST', `/profiles/${id}/shares`, { email: 'nobody@example.com', permission: 'view' })).status, 404);
  assert.equal((await A('POST', `/profiles/${id}/shares`, { email: 'a@example.com', permission: 'view' })).status, 400);
  assert.equal((await A('POST', `/profiles/${id}/shares`, { email: 'b@example.com', permission: 'admin' })).status, 400);
});

test('the person shared with can leave; then it is gone for them', async () => {
  assert.equal((await B('DELETE', `/profiles/${id}/shares/${bId}`)).status, 204);
  assert.equal((await B('GET', `/profiles/${id}`)).status, 404);
  assert.equal((await A('DELETE', `/profiles/${id}/shares/${bId}`)).status, 404, 'no such share any more');
});

test('deleting a profile removes its shares', async () => {
  await A('POST', `/profiles/${id}/shares`, { email: 'b@example.com', permission: 'view' });
  assert.equal((await A('DELETE', `/profiles/${id}`)).status, 204);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM profile_shares WHERE profile_id = ?').get(id).n, 0);
});

test('deleting an account moves its profiles to the deleting admin', async () => {
  const second = await A('POST', '/profiles', { ...BODY, name: 'Test A2' });
  assert.equal((await admin('DELETE', `/admin/users/${aId}`)).status, 204);
  const mine = (await admin('GET', '/profiles')).json.profiles.find((p) => p.id === second.json.id);
  assert.equal(mine?.access, 'owner');
});
