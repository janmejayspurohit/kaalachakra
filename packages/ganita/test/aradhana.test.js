/**
 * Aradhana calendar regression tests.
 *
 * The table's tithi triples were DERIVED from published punyatithi Gregorian
 * dates, so the strongest available check is a round trip: project the triples
 * back onto the years those published dates fall in, and require every one to
 * reappear.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setProcessGanita } from '../src/ephemeris.js';

// This suite was validated against DRIK sources (published calendars computed
// with modern ephemerides, and a table derived with the drik engine), so it
// runs under drik. The Surya Siddhanta default is covered by
// suryasiddhanta.test.js against Surya Siddhanta sources.
setProcessGanita('drik');
import {
  sunrise, sunset, localToJd, jdToIso, aradhanaForYear, ARADHANA_TABLE, withGanita, utcToLocalParts,
} from '../src/index.js';

const localIso = (jd) => {
  const p = utcToLocalParts(new Date((jd - 2440587.5) * 86400000), 'America/New_York');
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

// Mantralayam - seat of the Raghavendra Mutt.
const MTL = { latitude: 15.94285, longitude: 77.42534, altitude: 305, tzOffsetHours: 5.5 };
const sr = (jd) => sunrise(jd, MTL);
const ss = (jd) => sunset(jd, MTL);
const AY = 'trueCitra';

function project(years, opts = {}) {
  const out = [];
  for (const y of years) {
    out.push(...aradhanaForYear({
      year: y, sunriseFn: sr, sunsetFn: ss, ayanamsaName: AY, localToJd, ...opts,
    }));
  }
  return out;
}

describe('aradhana calendar', () => {
  test('the table has 37 saints, all with a complete triple', () => {
    assert.equal(ARADHANA_TABLE.length, 37);
    for (const r of ARADHANA_TABLE) {
      assert.ok(r.name, 'missing name');
      assert.ok(['shukla', 'krishna'].includes(r.paksha), `bad paksha for ${r.name}`);
      assert.ok(r.tithi >= 1 && r.tithi <= 15, `bad tithi for ${r.name}`);
      // Either the original derivation, or a correction established by the
      // Math's own editions - which must then say so and keep the old value.
      if (r.correctedFrom) {
        assert.match(r.confidence, /^uttaradi-math-published/, r.name);
        assert.ok(r.correctedFrom.masa && r.correctedFrom.paksha, r.name);
      } else {
        assert.equal(r.confidence, 'derived-from-published-gregorian', r.name);
      }
    }
  });

  test('the seven Math-corrected saints resolve to the Math\'s published 2026-27 dates', () => {
    // Sri Uttaradi Math panchanga 2026-27, Washington DC edition (the dates are
    // the same in its Chicago edition). Checked under Surya Siddhanta, the
    // Math's own ganita, at Washington.
    const W = { latitude: 38.9072, longitude: -77.0369, altitude: 20 };
    const MATH = {
      'Vyasaraja Tirtha': '2027-03-25', 'Vadiraja Tirtha': '2027-03-24',
      'Satyabodha Tirtha': '2027-03-22', 'Raghunatha Tirtha': '2026-12-24',
      'Satyanatha Tirtha': '2026-12-19', 'Vedanidhi Tirtha': '2026-11-20',
      'Vidyanidhi Tirtha': '2026-11-27',
    };
    const got = withGanita('surya', () => [2026, 2027].flatMap((y) => aradhanaForYear({
      year: y, sunriseFn: (j) => sunrise(j, W), sunsetFn: (j) => sunset(j, W),
      ayanamsaName: AY, localToJd,
      tzOffsetHours: y === 2026 ? -4 : -5,
    })));
    for (const [name, date] of Object.entries(MATH)) {
      const dates = got.filter((a) => a.name === name && a.jd !== null).map((a) => localIso(a.jd));
      assert.ok(dates.includes(date), `${name}: Math ${date}, engine ${dates.join(', ')}`);
    }
  });

  test('every uncorrected published punyatithi date is reproduced (round trip)', () => {
    const all = project([2025, 2026]);
    const byName = new Map();
    for (const a of all) {
      if (a.jd === null) continue;
      const list = byName.get(a.name) ?? [];
      list.push(jdToIso(a.jd, 5.5).slice(0, 10));
      byName.set(a.name, list);
    }
    // Only rows still carrying their original derivation: the seven the Math
    // corrected no longer reproduce their old source date, by design.
    const missing = ARADHANA_TABLE.filter((r) => !r.correctedFrom).filter(
      (r) => !(byName.get(r.name) ?? []).includes(r.sourceDate)
    ).map((r) => `${r.name} (expected ${r.sourceDate})`);
    assert.deepEqual(missing, [], `not reproduced: ${missing.join('; ')}`);
  });

  // The window must COVER 31 December, not stop at its midnight - Raghottama
  // Tirtha's 2025-12-31 aradhana was dropped by exactly that off-by-one.
  test('an aradhana on 31 December is inside the year window', () => {
    const list = project([2025]);
    const dates = list.map((a) => jdToIso(a.jd, 5.5).slice(0, 10));
    assert.ok(dates.includes('2025-12-31'), '31 December aradhana missing');
  });

  // Emitting the same saint twice on consecutive days makes the list
  // untrustworthy; a vriddhi tithi must resolve to exactly one day.
  test('no saint appears on two consecutive days in a year', () => {
    for (const y of [2025, 2026, 2027]) {
      const byName = new Map();
      for (const a of project([y])) {
        const list = byName.get(a.name) ?? [];
        list.push(a.jd);
        byName.set(a.name, list);
      }
      for (const [name, jds] of byName) {
        jds.sort((x, z) => x - z);
        for (let i = 1; i < jds.length; i++) {
          assert.ok(jds[i] - jds[i - 1] > 1.5,
            `${name} appears on consecutive days in ${y} - unresolved vriddhi`);
        }
      }
    }
  });

  test('three independently sourced tithis are correct', () => {
    const find = (n) => ARADHANA_TABLE.find((r) => r.name === n);
    assert.deepEqual(
      (({ masa, paksha, tithi }) => ({ masa, paksha, tithi }))(find('Raghavendra Tirtha')),
      { masa: 'Shravana', paksha: 'krishna', tithi: 2 });
    assert.deepEqual(
      (({ masa, paksha, tithi }) => ({ masa, paksha, tithi }))(find('Madhwacharya (Madhwa Navami)')),
      { masa: 'Magha', paksha: 'shukla', tithi: 9 });
    assert.deepEqual(
      (({ masa, paksha, tithi }) => ({ masa, paksha, tithi }))(find('Kavindra Tirtha')),
      { masa: 'Chaitra', paksha: 'shukla', tithi: 9 });
  });

  test('Purandara Dasa is Pushya Amavasya, not Pushya Purnima', () => {
    const r = ARADHANA_TABLE.find((x) => x.name === 'Purandara Dasa');
    assert.equal(r.tithiName, 'Amavasya');
    assert.equal(r.paksha, 'krishna');
  });
});
