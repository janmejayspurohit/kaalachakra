/**
 * Surya Siddhanta ganita - validated against Surya Siddhanta sources only.
 *
 *  1. Reingold & Dershowitz's published "modern Hindu calendar" table, which
 *     is the Surya Siddhanta computed at Ujjain (fixtures/rd_*.txt).
 *  2. Physical sunrise at Ujjain, as a check on the Siddhanta's own sunrise
 *     (this is what separated the correct precession sign from a wrong fix
 *     that also happened to pass the table).
 *  3. Sri Uttaradi Math's published Ekadashi fast days: 400 of them across
 *     eight city editions for 2025-26 and 2026-27.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as SS from '../src/suryasiddhanta.js';
import {
  withGanita, ganita, sunrise, sunset, localToJd, localToUtc, utcToLocalParts,
  ekadashis, computeDay, lunarPhase, DEFAULT_GANITA,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(join(here, 'fixtures', f), 'utf8');
// The published files use commas, except one row with a PERIOD as its first
// separator ("709580.  1943, ...") - split on either.
const rows = (f) => fixture(f).split('\n').slice(1).filter((l) => l.trim())
  .map((l) => l.split(/[,.]\s*/).filter(Boolean).map(Number));
const RD_TO_JD = 1721424.5;

describe('Reingold & Dershowitz published table (Surya Siddhanta at Ujjain)', () => {
  test('lunisolar: 33/33 exact - year, month, adhika flag, tithi, vriddhi flag', () => {
    for (const [rd, y, m, lm, d, ld] of rows('rd_hindu_lunisolar_modern.txt')) {
      const r = SS.lunarDateOf(rd + RD_TO_JD);
      assert.deepEqual([r.year, r.month, +r.leapMonth, r.day, +r.leapDay], [y, m, lm, d, ld], `RD ${rd}`);
    }
  });

  test('solar: 33/33, with the one dataset typo corrected', () => {
    // RD -214193 is printed as year -644, but every other row sits exactly 78
    // years (the Saka offset) from its Gregorian year, and this row's
    // Gregorian year is -586: the consistent value is -664.
    const TYPO = new Map([[-214193, -664]]);
    for (const [rd, y, m, d] of rows('rd_hindu_solar_modern.txt')) {
      const r = SS.solarDateOf(rd + RD_TO_JD);
      assert.deepEqual([r.year, r.month, r.day], [TYPO.get(rd) ?? y, m, d], `RD ${rd}`);
    }
  });
});

describe('the Siddhanta sunrise is physically sane', () => {
  test('Ujjain 2026: within 12 minutes of the real sunrise all year, median within 2', () => {
    const U = { latitude: SS.UJJAIN.latitude, longitude: SS.UJJAIN.longitude, altitude: 0 };
    const diffs = [];
    withGanita('drik', () => { // drik = Vedic flags: disc centre, no refraction, like the Siddhanta
      for (let k = 0; k < 365; k += 7) {
        const midUt = localToJd({ year: 2026, month: 1, day: 1 }, U.longitude / 15) + k;
        const real = sunrise(midUt, U);
        diffs.push((SS.utFromUjjain(SS.sunrise(SS.ujjainFromUt(midUt))) - real) * 1440);
      }
    });
    diffs.sort((a, b) => a - b);
    assert.ok(Math.abs(diffs[diffs.length >> 1]) < 2, `median ${diffs[diffs.length >> 1]}`);
    assert.ok(diffs[0] > -12 && diffs.at(-1) < 12, `range ${diffs[0]}..${diffs.at(-1)}`);
  });
});

describe('ganita switch', () => {
  test('Surya Siddhanta is the default', () => {
    assert.equal(DEFAULT_GANITA, 'surya');
  });

  test('withGanita restores the previous ganita, even when the body throws', () => {
    const before = ganita();
    assert.throws(() => withGanita('drik', () => { throw new Error('boom'); }), /boom/);
    assert.equal(ganita(), before);
    assert.throws(() => withGanita('nonsense', () => 1), RangeError);
  });

  test('the two ganitas really differ for the Moon and agree to within a degree or two', () => {
    const jd = localToJd({ year: 2026, month: 5, day: 12, hour: 6 }, 5.5);
    const s = withGanita('surya', () => lunarPhase(jd));
    const d = withGanita('drik', () => lunarPhase(jd));
    const diff = Math.abs(((s - d + 540) % 360) - 180);
    assert.ok(diff > 0.01 && diff < 3, `elongation differs by ${diff} deg`);
  });

  test('computeDay reports which ganita and sunrise convention produced it', () => {
    const P = { latitude: 12.97, longitude: 77.59, altitude: 920, tzOffsetHours: 5.5 };
    const s = withGanita('surya', () => computeDay({ date: { year: 2026, month: 9, day: 23 }, place: P }));
    const d = withGanita('drik', () => computeDay({ date: { year: 2026, month: 9, day: 23 }, place: P }));
    assert.equal(s.meta.ganita, 'surya');
    assert.equal(d.meta.ganita, 'drik');
    assert.match(s.meta.sunriseConvention, /conventional/);
    assert.match(d.meta.sunriseConvention, /vedic/);
  });
});

describe("Sri Uttaradi Math's published Ekadashi fast days (400, 8 cities, 2025-27)", () => {
  const um = JSON.parse(fixture('uttaradi-math-ekadashi-2025-2027.json'));
  const CITIES = {
    washington: [38.9072, -77.0369, 20, 'America/New_York'],
    chicago: [41.8781, -87.6298, 180, 'America/Chicago'],
    denver: [39.7392, -104.9903, 1609, 'America/Denver'],
    los_angeles: [34.0522, -118.2437, 90, 'America/Los_Angeles'],
    london: [51.5074, -0.1278, 20, 'Europe/London'],
    dubai: [25.2048, 55.2708, 5, 'Asia/Dubai'],
    sydney: [-33.8688, 151.2093, 20, 'Australia/Sydney'],
    melbourne: [-37.8136, 144.9631, 30, 'Australia/Melbourne'],
  };
  const localDate = (jd, zone) => {
    const p = utcToLocalParts(new Date((jd - 2440587.5) * 86400000), zone);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  };
  const score = (g) => {
    let ok = 0, total = 0; const misses = [];
    withGanita(g, () => {
      for (const [city, editions] of Object.entries(um.editions)) {
        const [lat, lon, alt, zone] = CITIES[city];
        const place = { latitude: lat, longitude: lon, altitude: alt };
        for (const list of Object.values(editions)) {
          const dates = list.map((r) => r.date).sort();
          const [y0, m0, d0] = dates[0].split('-').map(Number);
          const [y1, m1, d1] = dates.at(-1).split('-').map(Number);
          const found = ekadashis({
            fromJd: localToJd({ year: y0, month: m0, day: d0 }, 0) - 3,
            toJd: localToJd({ year: y1, month: m1, day: d1 }, 0) + 3,
            sunriseFn: (j) => sunrise(j, place), sunsetFn: (j) => sunset(j, place), ayanamsaName: 'trueCitra',
          });
          const fastDays = new Set(found.map((e) => localDate(e.nirnaya.madhwaSunriseJd, zone)));
          for (const r of list) {
            total++;
            if (fastDays.has(r.date)) ok++; else misses.push(`${city} ${r.date} ${r.name}`);
          }
        }
      }
    });
    return { ok, total, misses };
  };

  test('Surya Siddhanta (default) reproduces at least 398 of 400', () => {
    const { ok, total, misses } = score('surya');
    assert.equal(total, 400);
    // The two known misses are both Denver, both inside the fitted vedha band.
    assert.ok(ok >= 398, `${ok}/${total}; misses: ${misses.join('; ')}`);
  });

  test('drik is measurably further from the Math (it is the modern-sky option, not the Math reckoning)', () => {
    const s = score('surya').ok, d = score('drik').ok;
    assert.ok(s > d, `surya ${s} vs drik ${d}`);
  });
});
