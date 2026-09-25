/**
 * Profile CRUD over HTTP, exercised the way the BROWSER exercises it.
 *
 * This file exists because of a bug that reached the user: deleting a profile
 * failed with a 500. Every hand-run curl check passed, because curl sends no
 * `content-type` on a bodyless DELETE and the browser's fetch wrapper sent
 * `application/json` on every request. Fastify's JSON parser then rejected the
 * empty body. The lesson is in how these tests are written: they reproduce the
 * REQUEST THE CLIENT ACTUALLY SENDS, headers included, not a convenient
 * equivalent of it.
 *
 * `app.inject()` is used rather than a live socket - same routing, same
 * parsers, same error handler, no port.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/server.js';

const dir = mkdtempSync(join(tmpdir(), 'kaalachakra-test-'));
const app = await build({ dbPath: join(dir, 'test.db'), logger: false, adminInitialPassword: 'Initial-Admin-Pass-1' });
await app.ready();

// Every route now needs a signed-in user: sign in once (changing the generated
// password, as a first sign-in must) and send the session cookie on every
// request below, exactly as the browser does.
async function signIn() {
  const login = await app.inject({
    method: 'POST', url: '/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: { email: 'admin@janmejay.info', password: 'Initial-Admin-Pass-1' },
  });
  const cookie = /^kc_session=[^;]*/.exec([].concat(login.headers['set-cookie'])[0])[0];
  const change = await app.inject({
    method: 'POST', url: '/auth/password',
    headers: { 'content-type': 'application/json', cookie },
    payload: { currentPassword: 'Initial-Admin-Pass-1', newPassword: 'Admin-New-Pass-2026' },
  });
  if (change.statusCode !== 204) throw new Error(`sign-in setup failed: ${change.statusCode}`);
  return cookie;
}
const cookie = await signIn();
const inject = (opts) => app.inject({ ...opts, headers: { ...(opts.headers ?? {}), cookie } });

test.after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const SAMPLE = {
  name: 'Test Subject',
  gender: 'other',
  birth: { year: 2000, month: 1, day: 1, hour: 12, minute: 0 },
  place: {
    latitude: 12.97194, longitude: 77.59369, altitude: 920,
    timezone: 'Asia/Kolkata', name: 'Bengaluru',
  },
};

async function create(overrides = {}) {
  const res = await inject({
    method: 'POST', url: '/profiles',
    headers: { 'content-type': 'application/json' },
    payload: { ...SAMPLE, ...overrides },
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}

test('a profile round-trips through create, read and delete', async () => {
  const made = await create({ name: 'Round Trip' });
  assert.ok(made.id, 'a created profile must have an id');

  const got = await inject({ method: 'GET', url: `/profiles/${made.id}` });
  assert.equal(got.statusCode, 200);
  assert.equal(got.json().name ?? got.json().profile?.name, 'Round Trip');

  const del = await inject({ method: 'DELETE', url: `/profiles/${made.id}` });
  assert.equal(del.statusCode, 204);

  const after = await inject({ method: 'GET', url: `/profiles/${made.id}` });
  assert.equal(after.statusCode, 404, 'the profile must actually be gone');
});

test('DELETE succeeds with the JSON content-type the browser sends', async () => {
  // The regression. A bodyless DELETE carrying `content-type: application/json`
  // used to be answered with 500 "internal error".
  const made = await create({ name: 'Header Case' });
  const res = await inject({
    method: 'DELETE',
    url: `/profiles/${made.id}`,
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.statusCode, 204, `expected 204, got ${res.statusCode}: ${res.body}`);

  const list = await inject({ method: 'GET', url: '/profiles' });
  assert.ok(
    !list.json().profiles.some((p) => p.id === made.id),
    'the deleted profile must not come back in the list'
  );
});

test('deleting something that is not there is a 404, not a 500', async () => {
  const res = await inject({
    method: 'DELETE',
    url: '/profiles/00000000-0000-0000-0000-000000000000',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.statusCode, 404);
});

test('a client error is reported as a client error', async () => {
  // The error handler used to flatten every non-validation error to 500,
  // which is what turned the delete bug into "internal error" and sent the
  // search for it to the wrong side of the wire.
  const malformed = await inject({
    method: 'POST', url: '/profiles',
    headers: { 'content-type': 'application/json' },
    payload: '{ not json',
  });
  assert.equal(malformed.statusCode, 400, malformed.body);
  assert.notEqual(malformed.json().error, 'internal error');

  const invalid = await inject({
    method: 'POST', url: '/profiles',
    headers: { 'content-type': 'application/json' },
    payload: { ...SAMPLE, gender: 'not-a-gender' },
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
});

test('the year bounds are the EPHEMERIS range, not the working range', async () => {
  const at = (year) => inject({
    method: 'GET',
    url: `/panchanga?year=${year}&month=1&day=1&latitude=12.97194&longitude=77.59369`,
  });
  // schemas.js accepts 1200-2800 deliberately: the bundled ephemeris covers
  // it, and hard-coding the narrower 1900-2100 working range would surprise
  // someone entering a great-grandparent's birth year. So 1799 is ACCEPTED -
  // asserting a 400 there tests an assumption, not the code.
  assert.equal((await at(1799)).statusCode, 200);
  assert.equal((await at(2500)).statusCode, 200);

  for (const year of [1199, 2801]) {
    const res = await at(year);
    assert.equal(res.statusCode, 400, `year ${year} should be rejected`);
    assert.ok(res.json().error, 'a rejection must carry a message');
  }
});

test('panchanga is computed for the place it is asked for', async () => {
  // The other bug this session: four routes ignored the requested place.
  const at = (lat, lon) => inject({
    method: 'GET',
    url: `/panchanga?year=2026&month=9&day=23&latitude=${lat}&longitude=${lon}&timezone=Asia/Kolkata`,
  });
  const blr = (await at(12.97194, 77.59369)).json().panchanga;
  const ghy = (await at(26.1844, 91.7458)).json().panchanga;
  assert.notEqual(blr.sun.rise, ghy.sun.rise,
    'sunrise 14 degrees of longitude apart must not be identical');
});
