/**
 * Regression tests from the 1900-2200 accuracy and robustness audit
 * (2026-09-23).
 *
 * Every case here was a real defect, reproduced before it was fixed. Where
 * possible the expectation is an external fact - a civil weekday, a
 * published Uttaradi Math date, the IANA database - rather than this
 * engine's own output.
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
  computeDay, sunrise, sunset, localToJd, jdToIso, tithi, nakshatra,
  natalChart, resolveBirthOffset, localToUtc, ekadashis, aradhanaForYear,
  sunset as sunsetAt, utcToLocalParts,
} from '../src/index.js';
import { sunrisesBetween } from '../src/masa.js';
import { parseGmtOffset } from '../src/timezone.js';

const AY = 'trueCitra';
const GUWAHATI = { latitude: 26.1445, longitude: 91.7362, altitude: 55, tzOffsetHours: 5.5 };
const DELHI = { latitude: 28.6139, longitude: 77.209, altitude: 216, tzOffsetHours: 5.5 };
const TOKYO = { latitude: 35.68, longitude: 139.69, altitude: 40, tzOffsetHours: 9 };
const localDate = (jd, zone) => {
  const p = utcToLocalParts(new Date((jd - 2440587.5) * 86400000), zone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

describe('vara is the LOCAL weekday of sunrise', () => {
  // Sunrise before the zone offset (05:30 IST) falls on the previous UT day.
  // Taking the weekday from the UT date was wrong on 59% of Guwahati days and
  // on every Tokyo day.
  for (const [name, place] of [['Guwahati', GUWAHATI], ['Delhi', DELHI], ['Tokyo', TOKYO]]) {
    test(`${name}: every sampled day of 2026 matches the civil weekday`, () => {
      for (let m = 1; m <= 12; m++) {
        for (const d of [3, 17]) {
          const day = computeDay({ date: { year: 2026, month: m, day: d }, place });
          const civil = new Date(Date.UTC(2026, m - 1, d)).getUTCDay();
          assert.equal(day.vara.index, civil, `2026-${m}-${d} sunrise ${day.sun.rise}`);
        }
      }
    });
  }
});

describe('scans visit every Hindu day exactly once', () => {
  // Stepping from UT midnights (05:30 IST) skipped one day and doubled the
  // next wherever sunrise crosses 05:30 - Delhi does every May and July.
  test('Delhi 2026: consecutive sunrises are always ~1 day apart', () => {
    const from = localToJd({ year: 2026, month: 1, day: 1 }, 5.5);
    const srs = sunrisesBetween(from, from + 366, (j) => sunrise(j, DELHI));
    assert.ok(srs.length >= 365);
    for (let i = 1; i < srs.length; i++) {
      const gap = srs[i] - srs[i - 1];
      assert.ok(gap > 0.97 && gap < 1.03, `gap ${gap} after ${jdToIso(srs[i - 1], 5.5)}`);
    }
  });

  test('Guwahati 1920: Vedavyasa Tirtha is Chaitra Shukla Dwitiya, 22 March', () => {
    // 22 March 1920 at Guwahati holds Dwitiya at sunrise; the skipped-sunrise
    // bug reported the 21st (a Prathama) as a kshaya Dwitiya.
    const list = aradhanaForYear({
      year: 1920,
      sunriseFn: (j) => sunrise(j, GUWAHATI), sunsetFn: (j) => sunsetAt(j, GUWAHATI),
      ayanamsaName: AY, localToJd, tzOffsetHours: 5.5,
    });
    const v = list.find((a) => a.name === 'Vedavyasa Tirtha');
    assert.equal(jdToIso(v.jd, 5.5).slice(0, 10), '1920-03-22');
  });
});

describe('anga end times', () => {
  test('never null across 1900-2200 samples (window outlasts the longest anga)', () => {
    // A one-day interpolation window returned null for ~3% of tithis and ~4%
    // of nakshatras - exactly the vriddhi days.
    const P = { latitude: 12.97, longitude: 77.59, altitude: 920 };
    for (let y = 1900; y <= 2200; y += 20) {
      for (let d = 0; d < 60; d++) {
        const sr = sunrise(localToJd({ year: y, month: 1, day: 1 }, 5.5) + d, P);
        assert.notEqual(tithi(sr).endJd, null, `tithi ${y}+${d}`);
        assert.notEqual(nakshatra(sr, AY).endJd, null, `nakshatra ${y}+${d}`);
      }
    }
  });
});

describe('timezones before standard time', () => {
  test('offsets carrying seconds parse (local mean time)', () => {
    assert.equal(parseGmtOffset('GMT+05:21:10'), 5 * 60 + 21 + 10 / 60);
    assert.equal(parseGmtOffset('GMT-04:56:02'), -(4 * 60 + 56 + 2 / 60));
  });

  test('an Indian birth in 1901 resolves to Madras time, +05:21:10', () => {
    const r = resolveBirthOffset({ birth: { year: 1901, month: 3, day: 4, hour: 9, minute: 0 }, ianaZone: 'Asia/Kolkata' });
    assert.ok(Math.abs(r.offsetHours - (5 + 21 / 60 + 10 / 3600)) < 1e-9);
  });

  test('India 1943 is +06:30 (war time)', () => {
    assert.equal(localToUtc({ year: 1943, month: 6, day: 1, hour: 9 }, 'Asia/Kolkata').offsetHours, 6.5);
  });

  test('fall-back wall time is reported as repeated, first occurrence returned', () => {
    const r = localToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
    assert.equal(r.ambiguity, 'repeated');
    assert.equal(r.date.toISOString(), '2026-11-01T05:30:00.000Z'); // 01:30 EDT
  });

  test('spring-forward wall time is skipped, read with the pre-gap offset', () => {
    const r = localToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York');
    assert.equal(r.ambiguity, 'skipped');
    assert.equal(r.offsetHours, -5);
    assert.equal(r.date.toISOString(), '2026-03-08T07:30:00.000Z'); // = 03:30 EDT
  });
});

describe('input robustness', () => {
  test('30 February is rejected, not normalised to 2 March', () => {
    assert.throws(() => localToJd({ year: 2026, month: 2, day: 30 }, 5.5), RangeError);
    assert.throws(() => localToUtc({ year: 2025, month: 2, day: 29 }, 'Asia/Kolkata'), RangeError);
    assert.doesNotThrow(() => localToJd({ year: 2000, month: 2, day: 29 }, 5.5));
    assert.throws(() => localToJd({ year: 1900, month: 2, day: 29 }, 5.5), RangeError);
  });

  test('a birth chart can be drawn inside the Arctic circle', () => {
    // Placidus is undefined above ~66 deg; the ascendant does not need it.
    const tromso = { latitude: 69.65, longitude: 18.96, altitude: 10 };
    const c = natalChart(localToJd({ year: 1990, month: 12, day: 15, hour: 10 }, 1), tromso, AY);
    assert.ok(c.lagna.rashi >= 1 && c.lagna.rashi <= 12);
  });

  test('1900-01-01 and 2200-12-31 both compute', () => {
    const P = { latitude: 12.97, longitude: 77.59, altitude: 920, tzOffsetHours: 5.5 };
    assert.ok(computeDay({ date: { year: 1900, month: 1, day: 1 }, place: P }).tithi.name);
    assert.ok(computeDay({ date: { year: 2200, month: 12, day: 31 }, place: P }).tithi.name);
  });
});

describe('Ekadashi observance across its days', () => {
  const W = { latitude: 38.9072, longitude: -77.0369, altitude: 20, tzOffsetHours: -4 };

  test('the SHIFTED fast day itself is marked as the fast day', () => {
    // Previously only the candidate day carried Ekadashi data, marked "not
    // today", so a shifted fast was unmarked everywhere in the month grid.
    const roles = [12, 13, 14].map((d) =>
      computeDay({ date: { year: 2026, month: 5, day: d }, place: W }).ekadashi?.role);
    assert.deepEqual(roles, ['candidate', 'fast', 'paarane']);
  });

  test('Athiriktha Vaishnava Ekadashi: Denver 14 Jan 2026 (Uttaradi Math, Denver 2025-26)', () => {
    // Published: 13 Jan Sarvathra Ekadashi (Shat-thila), 14 Jan Athiriktha
    // Vaishnava Ekadashi, 15 Jan "Alpa Dwadashi. Parane Before 7:29".
    const P = { latitude: 39.7392, longitude: -104.9903, altitude: 1609 };
    const list = ekadashis({
      fromJd: localToJd({ year: 2026, month: 1, day: 10 }, -7),
      toJd: localToJd({ year: 2026, month: 1, day: 16 }, -7),
      sunriseFn: (j) => sunrise(j, P), sunsetFn: (j) => sunset(j, P), ayanamsaName: AY,
    });
    assert.equal(list.length, 1);
    const e = list[0];
    assert.equal(localDate(e.nirnaya.madhwaSunriseJd, 'America/Denver'), '2026-01-13');
    assert.equal(localDate(e.paarane.athiriktha.jd, 'America/Denver'), '2026-01-14');
    assert.equal(localDate(e.paarane.window.startJd, 'America/Denver'), '2026-01-15');
  });

  test('Athiriktha is rare, not every Dwadashi longer than 24 h', () => {
    // The Math's London 2025-26 edition: "This year NO OCCASSION".
    const P = { latitude: 51.5074, longitude: -0.1278, altitude: 20 };
    const list = ekadashis({
      fromJd: localToJd({ year: 2025, month: 3, day: 30 }, 0),
      toJd: localToJd({ year: 2026, month: 3, day: 18 }, 0),
      sunriseFn: (j) => sunrise(j, P), sunsetFn: (j) => sunset(j, P), ayanamsaName: AY,
    });
    assert.equal(list.filter((e) => e.paarane?.athiriktha).length, 0);
  });

  test('paarane windows never open at night or outside their Dwadashi', () => {
    const P = { latitude: 12.97, longitude: 77.59, altitude: 920 };
    for (const y of [1900, 1950, 2026, 2100, 2200]) {
      const list = ekadashis({
        fromJd: localToJd({ year: y, month: 1, day: 1 }, 5.5),
        toJd: localToJd({ year: y, month: 12, day: 31 }, 5.5) + 1,
        sunriseFn: (j) => sunrise(j, P), sunsetFn: (j) => sunset(j, P), ayanamsaName: AY,
      });
      for (const e of list) {
        const p = e.paarane;
        if (!p.window) { assert.ok(p.reason, 'a missing window must say why'); continue; }
        assert.ok(p.window.startJd >= p.paaraneSunriseJd - 1e-9);
        assert.ok(p.window.startJd >= p.harivasara.endJd - 1e-9);
        assert.ok(p.window.endJd <= p.dwadashiEndJd + 1e-9);
        assert.ok(p.window.startJd < sunrise(p.paaraneSunriseJd + 0.5, P));
      }
    }
  });
});

describe('samvatsara in an Adhika Chaitra year', () => {
  test('2029: Adhika Chaitra keeps the old year (Kilaka); Nija Chaitra opens Saumya', () => {
    // Ugadi 2029 is 14 April (Nija Chaitra) per drikpanchang; the Math puts
    // annual observances of a doubled month in the nija month.
    const P = { latitude: 12.9719, longitude: 77.5937, altitude: 920, tzOffsetHours: 5.5 };
    const a = computeDay({ date: { year: 2029, month: 3, day: 20 }, place: P });
    const n = computeDay({ date: { year: 2029, month: 4, day: 20 }, place: P });
    assert.equal(a.masa.displayName, 'Adhika Chaitra');
    assert.equal(a.samvatsara.name, 'Kilaka');
    assert.equal(n.masa.displayName, 'Chaitra');
    assert.equal(n.samvatsara.name, 'Saumya');
  });
});
