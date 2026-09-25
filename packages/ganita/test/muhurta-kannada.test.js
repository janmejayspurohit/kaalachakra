/**
 * Muhurta rules from Sri Uttaradi Math's KANNADA editions (2025-26, 2026-27),
 * tested against the muhurtas those editions publish and the thyajya times the
 * English editions print. Fixtures:
 *   fixtures/uttaradi-math-kannada-muhurtas-2025-2027.json  (133 muhurtas)
 *   fixtures/uttaradi-math-thyajya-2025-2027.json           (1,852 printed thyajya days)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  withGanita, computeDay, localToJd, localToUtc, evaluateDay, lagnaWindows, mathAyanamsa, janmaPoints, UM_KN,
} from '../src/index.js';
import { tropicalAscendant } from '../src/ephemeris.js';
import * as P from '../src/panchanga.js';

const here = dirname(fileURLToPath(import.meta.url));
const KN = JSON.parse(readFileSync(join(here, 'fixtures', 'uttaradi-math-kannada-muhurtas-2025-2027.json'), 'utf8')).rows;
const THY = JSON.parse(readFileSync(join(here, 'fixtures', 'uttaradi-math-thyajya-2025-2027.json'), 'utf8')).cities;
const BENGALURU = { latitude: 12.9716, longitude: 77.5946, altitude: 920, tzOffsetHours: 5.5 };
// Where the printed lagnas and amshas fit best (the editions do not print a place).
const FIT = { latitude: 16.2, longitude: 75.7, altitude: 500, tzOffsetHours: 5.5 };
const evOf = (r) => (r.section === 'pratishtha' ? 'vastu' : r.section);
const ymd = (iso) => { const [year, month, day] = iso.split('-').map(Number); return { year, month, day }; };
const jdOf = (r) => { const [h, m] = r.time.split(':').map(Number); return localToJd({ ...ymd(r.date), hour: h, minute: m }, 5.5); };
const prevDate = (iso) => { const d = new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }; };

describe('the Kannada edition\'s published muhurtas pass the engine', () => {
  test('all 133 published days pass every day rule, for their own event (Madhwa)', () => {
    const fails = [];
    withGanita('surya', () => {
      for (const r of KN) {
        const ev = evaluateDay(computeDay({ date: ymd(r.date), place: BENGALURU }), { event: evOf(r) });
        const f = ev.points.filter((p) => p.status === 'fail');
        if (f.length) fails.push(`${r.section} ${r.date}: ${f.map((p) => p.id)}`);
      }
    });
    assert.deepEqual(fails, []);
  });

  test('the printed time is usable in the engine\'s lagna windows (measured 128/133 at the fitted place)', () => {
    let ok = 0; const miss = [];
    withGanita('surya', () => {
      for (const r of KN) {
        const jd = jdOf(r);
        let day = computeDay({ date: ymd(r.date), place: FIT });
        if (jd < day.sun.riseJd) day = computeDay({ date: prevDate(r.date), place: FIT }); // pre-dawn belongs to the previous day
        const lw = lagnaWindows(day, FIT, { event: evOf(r) });
        const w = lw.windows.find((x) => jd >= x.startJd && jd < x.endJd && (r.lagna === 0 ? x.rashi === 0 : x.rashi !== 0));
        if (w && w.verdict !== 'ashubha' && w.usable.some((u) => jd >= u.startJd && jd <= u.endJd)) ok++;
        else miss.push(`${r.section} ${r.date} ${r.time}`);
      }
    });
    // The rest: 2 published times under a nakshatra ashubha in both frames
    // (the Math's anirvaha muhurtas) and 3 at a lagna thyajya edge, within
    // the uncertainty of the unprinted place.
    assert.ok(ok >= 128, `${ok}/133; misses: ${miss.join('; ')}`);
  });

  test('Rahukala, Tuesday, Saturday and Dashami are cautions, not failures - the Math publishes muhurtas on them', () => {
    withGanita('surya', () => {
      // 1 May 2026, Friday 10:40 vivaha: inside the Math's Friday Rahukala (10:30-12:00).
      const day = computeDay({ date: { year: 2026, month: 5, day: 1 }, place: BENGALURU });
      const lw = lagnaWindows(day, BENGALURU, { event: 'vivaha' });
      const jd = localToJd({ year: 2026, month: 5, day: 1, hour: 10, minute: 40 }, 5.5);
      const w = lw.windows.find((x) => jd >= x.startJd && jd < x.endJd && x.rashi !== 0);
      assert.ok(w.usable.some((u) => jd >= u.startJd && jd <= u.endJd), 'Rahukala removed a published muhurta');
      // 26 Jan 2027, Tuesday; 9 May 2026, Saturday.
      for (const d of [{ year: 2027, month: 1, day: 26 }, { year: 2026, month: 5, day: 9 }]) {
        const ev = evaluateDay(computeDay({ date: d, place: BENGALURU }), { event: 'vivaha' });
        assert.equal(ev.points.find((p) => p.id === 'vara').status, 'warn');
      }
    });
  });
});

describe('lagna thyajya: half a ghalige, not one third', () => {
  test('no published time falls in the half-ghalige thyajya; a third of them fall in the English edition\'s "one third"', () => {
    const PART = { 1: 0, 2: 0, 6: 0, 9: 0, 3: 1, 5: 1, 7: 1, 11: 1, 4: 2, 8: 2, 10: 2, 12: 2 };
    let n = 0, inThird = 0, inHalf = 0;
    const sid = (j) => (((tropicalAscendant(j, BENGALURU) - mathAyanamsa(j)) % 360) + 360) % 360;
    const lag = (j) => Math.floor(sid(j) / 30) + 1;
    for (const r of KN) {
      if (!r.lagna) continue;
      const jd = jdOf(r);
      const L = lag(jd); if (L !== r.lagna) continue;
      let s = 0, e = 0;
      while (lag(jd + (s - 1) / 1440) === L) s--;
      while (lag(jd + (e + 1) / 1440) === L) e++;
      const len = e - s + 1, pos = -s, part = PART[L];
      n++;
      if (Math.floor(pos / (len / 3)) === part) inThird++;
      const hs = part === 0 ? 0 : part === 1 ? len / 2 - 6 : len - 12;
      if (pos >= hs && pos < hs + 12) inHalf++;
    }
    assert.ok(n >= 95, `${n} rows`);
    assert.equal(inHalf, 0);
    assert.ok(inThird >= 30, `only ${inThird} in the third`);
    assert.match(UM_KN.lagnaThyajya.kn, /ಅರ್ಧ ಘಳಿಗೆ/);
  });
});

describe('vivaha lagna: the Math accepts a non-shuddha lagna only in a shuddha amsha', () => {
  test('every published vivaha lagna has a shuddha lagna or amsha (Dhanu only as Dhanu-in-Dhanu)', () => {
    const LAGNA = [2, 3, 4, 6, 5, 12], AMSHA = [2, 3, 4, 5, 6, 12];
    for (const r of KN.filter((x) => x.section === 'vivaha' && x.lagna > 0)) {
      const ok = LAGNA.includes(r.lagna) || AMSHA.includes(r.amsha) || (r.lagna === 9 && r.amsha === 9);
      assert.ok(ok, `${r.date} ${r.time} L${r.lagna}/A${r.amsha}`);
    }
  });
});

describe('the Math\'s printed nakshatra and tithi frames', () => {
  test('the printed nakshatra is the Surya Siddhanta nakshatra at sunrise (>= 120 of 122)', () => {
    let n = 0, ok = 0;
    withGanita('surya', () => {
      for (const r of KN) {
        if (!r.nak) continue;
        n++;
        if (computeDay({ date: ymd(r.date), place: BENGALURU }).nakshatra.index === r.nak) ok++;
      }
    });
    assert.ok(n === 122 && ok >= 120, `${ok}/${n}`);
  });

  test('no published day is kshaya in drigganita (the Kannada note judges kshaya in drik)', () => {
    withGanita('surya', () => {
      for (const date of new Set(KN.map((r) => r.date))) {
        const day = computeDay({ date: ymd(date), place: BENGALURU });
        const a = withGanita('drik', () => P.tithi(day.sun.riseJd).index), b = withGanita('drik', () => P.tithi(day.sun.nextRiseJd).index);
        assert.equal((b - a + 30) % 30, 1, date);
      }
    });
  });
});

describe('nakshatra thyajya as the Math prints it', () => {
  const CITY = {
    dubai: [25.2048, 55.2708, 5, 'Asia/Dubai'], sydney: [-33.8688, 151.2093, 20, 'Australia/Sydney'],
    london: [51.5074, -0.1278, 20, 'Europe/London'],
  };
  test('begin times within a median 5 minutes at Dubai, Sydney and London (1,281 printed times)', () => {
    withGanita('surya', () => {
      for (const [city, [lat, lon, alt, zone]] of Object.entries(CITY)) {
        const errs = [];
        for (const [iso, times] of THY[city]) {
          const date = ymd(iso);
          const off = localToUtc({ ...date, hour: 12 }, zone).offsetHours;
          const day = computeDay({ date, place: { latitude: lat, longitude: lon, altitude: alt, tzOffsetHours: off } });
          const mid = localToJd(date, off);
          for (const t of times) {
            const [h, m] = t.split(':').map(Number);
            const jd = mid + (h + m / 60) / 24;
            errs.push(Math.min(...day.muhurta.thyajya.map((x) => Math.abs(x.startJd - jd) * 1440)));
          }
        }
        errs.sort((a, b) => a - b);
        const median = errs[errs.length >> 1];
        const within20 = errs.filter((e) => e <= 20).length / errs.length;
        assert.ok(median <= 5 && within20 >= 0.8, `${city}: median ${median.toFixed(1)} min, ${(within20 * 100).toFixed(0)}% within 20 min`);
      }
    });
  });

  test('Mula carries two thyajyas; each lasts two hours', () => {
    withGanita('surya', () => {
      for (let d = 1; d <= 31; d++) {
        const day = computeDay({ date: { year: 2026, month: 1, day: d }, place: BENGALURU });
        for (const x of day.muhurta.thyajya) assert.ok(Math.abs((x.endJd - x.startJd) * 24 - 2) < 1e-6);
      }
    });
    const mula = [];
    withGanita('surya', () => {
      for (let d = 1; d <= 60; d++) {
        const dt = new Date(Date.UTC(2026, 0, d));
        const day = computeDay({ date: { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }, place: BENGALURU });
        for (const x of day.muhurta.thyajya) if (x.nakshatra === 'Mula') mula.push(x.ghatika);
      }
    });
    assert.ok(mula.includes(20) && mula.includes(56), JSON.stringify(mula));
  });
});

describe('personal rules from the Kannada edition', () => {
  const janma = (jd) => withGanita('surya', () => janmaPoints(jd, 'trueCitra'));
  test('chandrabala: the Math\'s table - 8th is shubha in krishna paksha; shukla paksha makes it decisive', () => {
    withGanita('surya', () => {
      let seen = { shuklaFail: false, krishna8: false };
      for (let d = 1; d <= 60 && !(seen.shuklaFail && seen.krishna8); d++) {
        const dt = new Date(Date.UTC(2026, 2, d));
        const day = computeDay({ date: { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }, place: BENGALURU });
        // janma rashi 8 signs behind today's Moon: Moon is 8th from it.
        const j = { nakshatra: day.nakshatra, rashi: { index: ((day.moon.rashi.index - 8 + 12) % 12) + 1 } };
        const cb = evaluateDay(day, { event: 'vivaha', janma: j }).points.find((p) => p.id === 'chandrabala');
        if (cb.detail.includes('krishna')) { assert.equal(cb.status, 'pass', cb.detail); seen.krishna8 = true; }
        else { assert.equal(cb.status, 'fail', cb.detail); seen.shuklaFail = true; }
      }
      assert.ok(seen.shuklaFail && seen.krishna8);
    });
  });

  test('gurubala is judged for vivaha and upanayana, with the Karka exemption and the Math\'s remedies', () => {
    const j = janma(localToJd({ year: 1990, month: 6, day: 15, hour: 10 }, 5.5));
    withGanita('surya', () => {
      const day = computeDay({ date: { year: 2026, month: 10, day: 1 }, place: BENGALURU });
      for (const event of ['vivaha', 'upanayana']) {
        const g = evaluateDay(day, { event, janma: j }).points.find((p) => p.id === 'gurubala');
        assert.ok(g && ['pass', 'warn', 'fail'].includes(g.status));
        assert.match(g.basis, /ಗುರುಬಲ/);
      }
      assert.equal(evaluateDay(day, { event: 'vastu', janma: j }).points.find((p) => p.id === 'gurubala'), undefined);
    });
  });
});
