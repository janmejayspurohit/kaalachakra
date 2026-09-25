/**
 * Completeness of the localisation tables.
 *
 * The app picks a language and then reads names out of these tables. A hole -
 * one nakshatra with no Kannada string, say - does not throw; it renders as a
 * blank or silently falls back to English in the middle of a Kannada
 * panchanga. That is the kind of defect nobody reports and everybody notices,
 * so the tables are checked for holes rather than spot-read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import locale, { LANGUAGES, TABLES, t, row } from '../src/index.js';

test('every table is populated in every language', () => {
  assert.ok(TABLES.length > 0, 'expected localisation tables');
  assert.ok(LANGUAGES.length >= 5, `expected 5 languages, got ${LANGUAGES.join(', ')}`);

  const holes = [];
  for (const table of TABLES) {
    const rows = locale[table];
    assert.ok(Array.isArray(rows) && rows.length > 0, `${table} should be a non-empty array`);
    rows.forEach((r, i) => {
      for (const lang of LANGUAGES) {
        const v = r[lang];
        if (typeof v !== 'string' || v.trim() === '') holes.push(`${table}[${i + 1}].${lang}`);
      }
    });
  }
  assert.deepEqual(holes, [], `missing strings: ${holes.slice(0, 10).join(', ')}`);
});

test('lookups are 1-based and never throw', () => {
  const table = TABLES[0];
  assert.equal(t(table, 1, 'english'), locale[table][0].english);
  assert.equal(row(table, 1), locale[table][0]);

  // Out of range, unknown table, unknown language: null, not an exception.
  assert.equal(t(table, 0), null);
  assert.equal(t(table, 10_000), null);
  assert.equal(t('no-such-table', 1), null);
  assert.equal(t(table, 1, 'klingon'), null);
  assert.equal(row('no-such-table', 1), null);
});

test('the known table sizes are what the engine indexes against', () => {
  // These counts are structural: 27 nakshatras, 12 rashis, and so on. A table
  // that silently changed length would shift every lookup past the change.
  // Read off the tables as they actually are, not as they are assumed to be:
  // tithi is 30, the full lunar month, not 15 - the table is indexed by tithi
  // number across both pakshas, which is why Amavasya is index 30 and not a
  // second Purnima. Karana is 11 distinct names, not 60 instances.
  const expected = {
    tithi: 30, paksha: 2, nakshatra: 27, masa: 12,
    vara: 7, yoga: 27, karana: 11, rashi: 12,
  };
  assert.deepEqual(
    Object.fromEntries(TABLES.map((t) => [t, locale[t].length])),
    expected
  );
});
