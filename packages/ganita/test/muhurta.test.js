/**
 * Muhurta layer - every table and rule checked against Sri Uttaradi Math's
 * own published data (fixtures/uttaradi-math-muhurta-2022-2027.json), under
 * the Math's ganita, Surya Siddhanta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  withGanita, computeDay, localToJd, localToUtc, dayQuality, GOWRI_TABLE, DURMUHURTA,
  evaluateDay, lagnaWindows, asthaStatus, computeMuhurta, janmaPoints, mathAyanamsa,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, 'fixtures', 'uttaradi-math-muhurta-2022-2027.json'), 'utf8'));
const CITIES = {
  washington: [38.9072, -77.0369, 20, 'America/New_York'], chicago: [41.8781, -87.6298, 180, 'America/Chicago'],
  denver: [39.7392, -104.9903, 1609, 'America/Denver'], los_angeles: [34.0522, -118.2437, 90, 'America/Los_Angeles'],
  london: [51.5074, -0.1278, 20, 'Europe/London'], dubai: [25.2048, 55.2708, 5, 'Asia/Dubai'],
  sydney: [-33.8688, 151.2093, 20, 'Australia/Sydney'], melbourne: [-37.8136, 144.9631, 30, 'Australia/Melbourne'],
};
const placeFor = (city, iso) => {
  const [lat, lon, alt, zone] = CITIES[city];
  const [y, m, d] = iso.split('-').map(Number);
  return { date: { year: y, month: m, day: d }, place: { latitude: lat, longitude: lon, altitude: alt, tzOffsetHours: localToUtc({ year: y, month: m, day: d, hour: 12 }, zone).offsetHours } };
};
const eachMathMuhurta = function* () {
  for (const [city, eds] of Object.entries(FX.muhurtas.editions)) for (const rows of Object.values(eds)) for (const r of rows) yield { city, ...r };
};

describe('tables transcribed from the Math', () => {
  test('vara-nakshatra day quality: all 189 cells match the decoded marks', () => {
    for (const [k, v] of Object.entries(FX.varaNakshatraMarks.cells)) {
      const [vara, nak] = k.split('|').map(Number);
      assert.equal(dayQuality(vara, nak).quality === 'good' ? '+' : '-', v.mark, `cell ${k}`);
    }
  });

  test('Gowri panchanga: identical to the table printed in all 16 editions', () => {
    assert.deepEqual(GOWRI_TABLE, FX.gowri.rows);
  });

  test('durmuhurta: Saturday = muhurtas 1+2, Tuesday = day 4 + night 7, Sunday = 14', () => {
    assert.deepEqual(DURMUHURTA[6], [1, 2]);
    assert.deepEqual(DURMUHURTA[2], [4, 22]);
    assert.deepEqual(DURMUHURTA[0], [14]);
  });

  test('the Siddhantic ayanamsa reproduces the Math\'s printed values within 30"', () => {
    const may26 = mathAyanamsa(localToJd({ year: 2026, month: 5, day: 15, hour: 12 }, 0)) * 3600;
    const mar27 = mathAyanamsa(localToJd({ year: 2027, month: 3, day: 20, hour: 12 }, 0)) * 3600;
    assert.ok(Math.abs(may26 - (22 * 3600 + 54 * 60 + 22)) < 30, `May 2026 ${may26}`);
    assert.ok(Math.abs(mar27 - (22 * 3600 + 55 * 60 + 10)) < 30, `Mar 2027 ${mar27}`);
  });
});

describe('the day rules against the Math\'s 501 published muhurtas', () => {
  test('every published muhurta day passes every hard day rule', () => {
    // Haridina and astha excluded: the Math's general lists deliberately include
    // them (Madhwas skip Haridinas; astha depends on the family's veda).
    const failures = [];
    withGanita('surya', () => {
      for (const r of eachMathMuhurta()) {
        const { date, place } = placeFor(r.city, r.date);
        const ev = evaluateDay(computeDay({ date, place }), { event: 'general', profile: { sampradaya: 'smarta' } });
        const hard = ev.points.filter((p) => p.status === 'fail' && !p.id.startsWith('astha'));
        if (hard.length) failures.push(`${r.city} ${r.date}: ${hard.map((p) => p.id).join(',')}`);
      }
    });
    assert.deepEqual(failures, []);
  });

  test('the Math\'s unstarred lagnas keep usable time under the Kannada-edition rules (measured 488/519 - must not regress)', () => {
    let n = 0, usable = 0;
    withGanita('surya', () => {
      for (const r of eachMathMuhurta()) {
        const { date, place } = placeFor(r.city, r.date);
        const lw = lagnaWindows(computeDay({ date, place }), place, { event: 'general' });
        for (const [rashi, starred] of r.lagnas) {
          if (starred) continue;
          const w = lw.windows.find((x) => x.rashi === rashi);
          n++;
          if (w && w.usable.length) usable++;
        }
      }
    });
    // The 31 without usable time, each explained: 24 lie wholly under a
    // nakshatra that is ashubha in BOTH frames (the Kannada edition takes the
    // nakshatra at the muhurta time; these English lists evidently use the
    // day's sunrise nakshatra), 5 are slivers at sunrise whose remaining
    // minutes are the lagna thyajya, 2 are slivers under 5 minutes.
    assert.ok(n === 519 && usable >= 488, `${usable}/${n}`);
  });
});

describe('astha (combustion) against the Math\'s printed windows 2022-26', () => {
  test('boundaries within one day, and at least 20 of 24 exact', () => {
    let exact = 0, total = 0;
    for (const [graha, from, to] of FX.astha) {
      const J = (iso) => { const [y, m, d] = iso.split('-').map(Number); return localToJd({ year: y, month: m, day: d, hour: 12 }, 5.5); };
      const inside = (jd) => asthaStatus(jd)[graha].combust;
      let s = J(from); while (inside(s - 1)) s -= 1; while (!inside(s)) s += 1;
      let e = J(to); while (inside(e + 1)) e += 1; while (!inside(e)) e -= 1;
      for (const err of [Math.round(s - J(from)), Math.round(e - J(to))]) {
        total++; if (err === 0) exact++;
        assert.ok(Math.abs(err) <= 1, `${graha} ${from}..${to}: boundary off by ${err} days`);
      }
    }
    assert.ok(exact >= 20, `${exact}/${total} exact`);
  });
});

describe('rules for a person', () => {
  const P = { latitude: 12.97194, longitude: 77.59369, altitude: 920, tzOffsetHours: 5.5 };

  test('Haridina is a failure for a Madhwa; Dashami for Vivaha only a caution', () => {
    withGanita('surya', () => {
      // November 2026 at Bengaluru: take its first Ekadashi and first Dashami.
      let ek = null, da = null;
      for (let d = 1; d <= 30 && (!ek || !da); d++) {
        const day = computeDay({ date: { year: 2026, month: 11, day: d }, place: P });
        if (day.tithi.numberInPaksha === 11 && !ek) ek = day;
        if (day.tithi.numberInPaksha === 10 && !da) da = day;
      }
      const e = evaluateDay(ek, { event: 'general', profile: { sampradaya: 'uttaradi' } });
      assert.equal(e.points.find((p) => p.id === 'haridina').status, 'fail');
      const v = evaluateDay(da, { event: 'vivaha', profile: { sampradaya: 'uttaradi' } });
      assert.equal(v.points.find((p) => p.id === 'haridina').status, 'warn');
      const s = evaluateDay(ek, { event: 'general', profile: { sampradaya: 'smarta' } });
      assert.equal(s.points.find((p) => p.id === 'haridina'), undefined);
    });
  });

  test('tarabala follows the Math\'s remainder rule (6 = Sadhana is best; 1,3,5,7 are doshas with daana)', () => {
    withGanita('surya', () => {
      const day = computeDay({ date: { year: 2026, month: 10, day: 1 }, place: P });
      const n = day.nakshatra.index;
      // janma nakshatra five before today's: count 6 -> Sadhana
      const janma = { nakshatra: { index: ((n - 6 + 27) % 27) + 1 }, rashi: { index: 1 } };
      const t = evaluateDay(day, { janma }).points.find((p) => p.id === 'tarabala');
      assert.equal(t.status, 'pass');
      assert.match(t.detail, /Sadhana tara/);
      const janma2 = { nakshatra: { index: ((n - 3 + 27) % 27) + 1 }, rashi: { index: 1 } }; // count 3 -> Vipat
      const t2 = evaluateDay(day, { janma: janma2 }).points.find((p) => p.id === 'tarabala');
      assert.equal(t2.status, 'fail');
      assert.match(t2.detail, /jaggery daana/);
    });
  });

  test('computeMuhurta returns the day\'s verdict, its lagna windows and the next shubha days, all with reasons', () => {
    const jd = localToJd({ year: 1990, month: 6, day: 15, hour: 10 }, 5.5);
    const janma = janmaPoints(jd, 'trueCitra');
    const r = withGanita('surya', () => computeMuhurta({
      date: { year: 2026, month: 11, day: 20 }, place: P, event: 'vivaha',
      profile: { sampradaya: 'uttaradi' }, janma, nextCount: 2, horizonDays: 150,
    }));
    assert.ok(['shubha', 'shubha-with-cautions', 'ashubha'].includes(r.evaluation.verdict));
    for (const p of r.evaluation.points) assert.ok(p.basis && p.detail, `point ${p.id} lacks its reason`);
    assert.ok(r.next.found.length >= 1, 'no shubha vivaha day in 150 days');
    for (const f of r.next.found) {
      assert.notEqual(f.evaluation.verdict, 'ashubha');
      assert.ok(f.windows.every((w) => w.verdict === 'shubha' && w.usable.length));
    }
  });
});
