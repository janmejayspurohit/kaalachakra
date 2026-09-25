/**
 * Coordinate resolution, and specifically the identity it now carries.
 *
 * The bug these guard against: a place chosen on the map resolved to a real
 * gazetteer settlement, but the answer described it only by NAME and
 * coordinate. The caller could not tell which record it was, so a UI trying
 * to reflect the choice had to guess by comparing coordinates - and the
 * coordinate it holds is deliberately the pin, not the city centre, so the
 * guess failed and the app reported that Bengaluru was "not in the list"
 * while Bengaluru sat in the list. Identity has to be returned, not inferred.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Gazetteer, haversineKm } from '../src/index.js';

const g = new Gazetteer();

/** A pin ~0.7 km from the Bengaluru centroid - a plausible map click. */
const PIN = { latitude: 12.9708, longitude: 77.5876 };

test('a resolved coordinate names the record it resolved to', () => {
  const r = g.resolveCoordinate(PIN.latitude, PIN.longitude);
  assert.equal(r.resolved, true);
  assert.equal(r.name, 'Bengaluru');
  assert.ok(Number.isInteger(r.id), `expected a GeoNames id, got ${r.id}`);

  const record = g.byId(r.id);
  assert.ok(record, 'the returned id must address a real row');
  assert.equal(record.name, r.name);
  assert.equal(record.timezone, r.timezone);
});

test('the pin is NOT snapped to the city centroid', () => {
  // The whole point: the chart is cast for where the user pointed. Snapping
  // to the centroid would silently move the birthplace by hundreds of metres.
  const r = g.resolveCoordinate(PIN.latitude, PIN.longitude);
  assert.equal(r.latitude, PIN.latitude);
  assert.equal(r.longitude, PIN.longitude);
  const centre = g.byId(r.id);
  const off = haversineKm(r.latitude, r.longitude, centre.latitude, centre.longitude);
  assert.ok(off > 0.1 && off < 2, `expected an off-centroid pin, got ${off.toFixed(3)} km`);
});

test('a pin near a major city resolves to a record in the dropdown list', () => {
  // This is the user's requirement stated as a test: any dropped pin matches
  // a city the picker can actually show as selected.
  const top = new Map(g.top('IN', 2000).map((p) => [p.id, p]));
  const cities = [
    { name: 'Bengaluru', latitude: 12.9708, longitude: 77.5876 },
    { name: 'Hyderabad', latitude: 17.3801, longitude: 78.4626 },
    { name: 'Delhi', latitude: 28.6400, longitude: 77.2200 },
    { name: 'Chennai', latitude: 13.0800, longitude: 80.2700 },
    { name: 'Kolkata', latitude: 22.5700, longitude: 88.3600 },
  ];
  for (const c of cities) {
    const r = g.resolveCoordinate(c.latitude, c.longitude);
    assert.equal(r.resolved, true, `${c.name} should resolve`);
    assert.ok(top.has(r.id), `${c.name} resolved to ${r.name} (${r.id}), which is not in the top 2000`);
  }
});

test('a pin in open country still resolves, and says how far away', () => {
  // Middle of the Thar desert.
  const r = g.resolveCoordinate(27.0, 71.0);
  assert.equal(r.resolved, true);
  assert.ok(Number.isInteger(r.id));
  assert.ok(r.distanceKm > 0, 'a remote pin must report its distance to the settlement');
});

test('an unresolvable coordinate refuses to guess a timezone', () => {
  // Deep in the southern Indian Ocean.
  const r = g.resolveCoordinate(-45.0, 80.0);
  assert.equal(r.resolved, false);
  assert.equal(r.timezone, null, 'guessing a zone from longitude would be an hour wrong');
  assert.equal(r.id, undefined);
});

test.after(() => g.close());
