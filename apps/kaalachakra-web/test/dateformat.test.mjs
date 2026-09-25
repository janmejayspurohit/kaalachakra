/**
 * Every date format the settings menu offers.
 *
 * Two things here can be wrong without looking wrong. The weekday patterns do
 * calendar arithmetic - "Tue, 23 Sep 2026" is exactly as plausible as "Wed,
 * 23 Sep 2026" to a reader - and `dd/mm` versus `mm/dd` are indistinguishable
 * on any date whose day is 12 or less. Both are checked against dates where
 * the answer is independently known.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_FORMATS, formatDate } from '../src/dateformat.js';

test('every offered format renders, and renders differently where it should', () => {
  // On the SAMPLE date, which is picked precisely so that all of them differ.
  const rendered = DATE_FORMATS.map((f) => [f.id, formatDate('2026-09-03', f.id)]);
  for (const [id, out] of rendered) {
    assert.match(out, /2026/, `${id} should contain the year, got "${out}"`);
    assert.ok(!out.includes('undefined') && !out.includes('NaN'), `${id} rendered "${out}"`);
  }
  // No two patterns may be aliases of each other on this sample - the menu
  // would then offer the same thing twice under two names.
  const outs = rendered.map(([, o]) => o);
  assert.equal(new Set(outs).size, outs.length,
    `duplicate renderings: ${outs.join(' | ')}`);
  console.log('  ' + rendered.map(([id, o]) => `${id} -> ${o}`).join('\n  '));
});

test('the menu example is what the formatter actually produces', () => {
  // The examples are derived, so this guards the derivation rather than a
  // hand-written string - the thing that used to drift.
  for (const f of DATE_FORMATS) {
    assert.equal(f.example, formatDate('2026-09-03', f.id), `${f.id}'s example is stale`);
  }
});

test('day-first and month-first are not confused', () => {
  assert.equal(formatDate('2026-09-23', 'dd-mm-yyyy'), '23-09-2026');
  assert.equal(formatDate('2026-09-23', 'dd/mm/yyyy'), '23/09/2026');
  assert.equal(formatDate('2026-09-23', 'dd.mm.yyyy'), '23.09.2026');
  assert.equal(formatDate('2026-09-23', 'mm/dd/yyyy'), '09/23/2026');
  assert.equal(formatDate('2026-09-23', 'yyyy-mm-dd'), '2026-09-23');
  assert.equal(formatDate('2026-09-23', 'yyyy/mm/dd'), '2026/09/23');
  // The ambiguous case: 10 February must not silently render as 2 October.
  assert.equal(formatDate('2026-02-10', 'dd/mm/yyyy'), '10/02/2026');
  assert.equal(formatDate('2026-02-10', 'mm/dd/yyyy'), '02/10/2026');
});

test('month names, padded and unpadded days', () => {
  assert.equal(formatDate('2026-09-03', 'd mmm yyyy'), '3 Sep 2026');
  assert.equal(formatDate('2026-09-03', 'dd mmm yyyy'), '03 Sep 2026');
  assert.equal(formatDate('2026-09-03', 'dd mmmm yyyy'), '03 September 2026');
  assert.equal(formatDate('2026-09-03', 'mmm dd, yyyy'), 'Sep 03, 2026');
  assert.equal(formatDate('2026-09-03', 'mmmm dd, yyyy'), 'September 03, 2026');
  assert.equal(formatDate('2026-01-01', 'dd mmmm yyyy'), '01 January 2026');
  assert.equal(formatDate('2026-12-31', 'dd mmmm yyyy'), '31 December 2026');
});

test('weekdays are right, including across the range and on leap days', () => {
  // Independently known days of the week.
  const cases = [
    ['2026-09-23', 'Wed', 'Wednesday'],
    ['2000-01-01', 'Sat', 'Saturday'],
    ['2024-02-29', 'Thu', 'Thursday'],  // leap day
    ['1900-01-01', 'Mon', 'Monday'],    // 1900 was NOT a leap year
    ['1900-03-01', 'Thu', 'Thursday'],
    ['2100-01-01', 'Fri', 'Friday'],    // nor is 2100
    ['1947-08-15', 'Fri', 'Friday'],    // Indian independence
    ['1948-01-30', 'Fri', 'Friday'],
  ];
  for (const [iso, short, full] of cases) {
    assert.equal(formatDate(iso, 'ddd, dd mmm yyyy').split(',')[0], short, `${iso} short weekday`);
    assert.equal(formatDate(iso, 'dddd, dd mmmm yyyy').split(',')[0], full, `${iso} full weekday`);
  }
});

test('early years are not silently mapped into the 1900s', () => {
  // `new Date(Date.UTC(y, ...))` maps years 0-99 onto 1900-1999. The panchanga
  // routes accept back to 1200, so the weekday must not quietly come from the
  // wrong millennium.
  const out = formatDate('1200-01-01', 'dddd, dd mmmm yyyy');
  assert.match(out, /1200$/, `got "${out}"`);
  // Saturday, cross-checked against Python's datetime, which uses the same
  // proleptic Gregorian calendar JS does.
  assert.equal(out, 'Saturday, 01 January 1200');
});

test('absent and malformed values do not throw', () => {
  for (const f of DATE_FORMATS) {
    assert.equal(formatDate(null, f.id), '—');
    assert.equal(formatDate(undefined, f.id), '—');
    assert.equal(formatDate('', f.id), '—');
    assert.equal(formatDate('not a date', f.id), 'not a date');
    assert.equal(formatDate(new Date(NaN), f.id), '—');
  }
  // An unknown format id falls back to the default rather than rendering blank.
  assert.equal(formatDate('2026-09-23', 'no-such-format'), '23-09-2026');
});

test('a Date object formats the same as its ISO string', () => {
  const d = new Date(2026, 8, 23); // local midnight, 23 Sep 2026
  for (const f of DATE_FORMATS) {
    assert.equal(formatDate(d, f.id), formatDate('2026-09-23', f.id), f.id);
  }
});
