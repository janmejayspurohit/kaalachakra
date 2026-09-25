/**
 * Regression tests for the calendar and nirnaya layer.
 *
 * Every expectation here is a PUBLISHED date or name, not a value produced by
 * this engine. Tests that assert an engine's own output back at it prove only
 * that it is deterministic.
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
  sunrise, localToJd, jdToIso, masa, samvatsara, findTithiDates,
  ekadashis, chaturmasya, SAMVATSARA_NAMES,
} from '../src/index.js';

const BLR = { latitude: 12.9716, longitude: 77.5946, altitude: 920, tzOffsetHours: 5.5 };
const AY = 'trueCitra';
const sr = (jd) => sunrise(jd, BLR);
const day = (y, m, d) => localToJd({ year: y, month: m, day: d, hour: 0 }, 5.5);
const iso = (jd) => jdToIso(jd, 5.5).slice(0, 10);

function samvatsaraFor(year) {
  const s = sr(day(year, 6, 15));
  return samvatsara(s, masa(s, AY).index).name;
}

describe('samvatsara (southern / mean reckoning)', () => {
  // drik-panchanga's formula gives Durmathi for 2026-27; the published
  // Kannada and Telugu panchangas say Parabhava. These nine anchors are the
  // reason the offset is +12 and not +27.
  const PUBLISHED = {
    2020: 'Sharvari', 2021: 'Plava', 2022: 'Shubhakrit', 2023: 'Shobhakrit',
    2024: 'Krodhi', 2025: 'Vishvavasu', 2026: 'Parabhava', 2027: 'Plavanga',
    2028: 'Kilaka',
  };

  for (const [year, expected] of Object.entries(PUBLISHED)) {
    test(`${year}-${Number(year) + 1} is ${expected}`, () => {
      assert.equal(samvatsaraFor(Number(year)), expected);
    });
  }

  test('advances by exactly one name per year across 1950-2150', () => {
    let prev = null;
    for (let y = 1950; y <= 2150; y++) {
      const i = SAMVATSARA_NAMES.indexOf(samvatsaraFor(y));
      assert.notEqual(i, -1, `unknown samvatsara name in ${y}`);
      if (prev !== null) {
        assert.equal(((i - prev) + 60) % 60, 1, `discontinuity at ${y}`);
      }
      prev = i;
    }
  });

  test('repeats with a period of exactly 60 years', () => {
    for (let y = 1950; y <= 2090; y += 7) {
      assert.equal(samvatsaraFor(y), samvatsaraFor(y + 60), `period broken at ${y}`);
    }
  });
});

describe('ugadi (Chaitra Shukla Pratipada) including kshaya', () => {
  // 2026 is the interesting one: Pratipada never touches a sunrise, so a
  // sunrise-only search finds nothing. Published Ugadi is 19 March.
  const PUBLISHED = { 2024: '2024-04-09', 2025: '2025-03-30', 2026: '2026-03-19' };

  for (const [year, expected] of Object.entries(PUBLISHED)) {
    test(`Ugadi ${year} falls on ${expected}`, () => {
      const hits = findTithiDates({
        masaName: 'Chaitra', paksha: 'shukla', tithiNumber: 1,
        fromJd: day(Number(year), 2, 20), toJd: day(Number(year), 4, 30),
        ayanamsaName: AY, sunriseFn: sr,
      });
      assert.ok(hits.length > 0, 'no Chaitra Shukla Pratipada found at all');
      assert.equal(iso(hits[0].jd), expected);
    });
  }

  test('2026 is resolved via the kshaya path, not a sunrise match', () => {
    const [hit] = findTithiDates({
      masaName: 'Chaitra', paksha: 'shukla', tithiNumber: 1,
      fromJd: day(2026, 2, 20), toJd: day(2026, 4, 30),
      ayanamsaName: AY, sunriseFn: sr,
    });
    assert.equal(hit.resolution, 'kshaya');
  });
});

describe('ekadashi nirnaya (arunodaya vedha)', () => {
  // Published Smarta/Vaishnava calendar for Independence, Missouri.
  // Only the VAISHNAVA (Madhwa) side is asserted - see nirnaya.js on why the
  // Smarta side is deliberately not claimed.
  const KC = { latitude: 39.0911, longitude: -94.4155, altitude: 275, tzOffsetHours: -5 };
  const KC_WINTER = { ...KC, tzOffsetHours: -6 };

  test('Aja Ekadashi 2026 is a kshaya Ekadashi observed on 7 September', () => {
    const place = KC;
    const list = ekadashis({
      fromJd: localToJd({ year: 2026, month: 9, day: 3, hour: 0 }, place.tzOffsetHours),
      toJd: localToJd({ year: 2026, month: 9, day: 10, hour: 0 }, place.tzOffsetHours),
      sunriseFn: (jd) => sunrise(jd, place),
      ayanamsaName: AY,
    });
    assert.equal(list.length, 1, 'kshaya Ekadashi was not found at all');
    const n = list[0].nirnaya;
    assert.equal(n.kshayaEkadashi, true);
    assert.equal(jdToIso(n.madhwaSunriseJd, place.tzOffsetHours).slice(0, 10), '2026-09-07');
  });

  test('Vaikuntha Ekadashi 2026 is observed on 20 December', () => {
    const place = KC_WINTER;
    const list = ekadashis({
      fromJd: localToJd({ year: 2026, month: 12, day: 16, hour: 0 }, place.tzOffsetHours),
      toJd: localToJd({ year: 2026, month: 12, day: 23, hour: 0 }, place.tzOffsetHours),
      sunriseFn: (jd) => sunrise(jd, place),
      ayanamsaName: AY,
    });
    assert.equal(list.length, 1);
    assert.equal(
      jdToIso(list[0].nirnaya.madhwaSunriseJd, place.tzOffsetHours).slice(0, 10),
      '2026-12-20'
    );
  });

  test('a year yields 24-26 Ekadashis, each with a paarane window or a stated reason', () => {
    const list = ekadashis({
      fromJd: day(2026, 1, 1), toJd: day(2026, 12, 31),
      sunriseFn: sr, ayanamsaName: AY,
    });
    assert.ok(list.length >= 24 && list.length <= 26, `got ${list.length}`);
    for (const e of list) {
      const p = e.paarane;
      assert.ok(p && (p.window || p.reason), 'paarane neither computed nor explained');
    }
  });
});

describe('chaturmasya', () => {
  test('Shaka Vrata 2026 begins on the published 25 July', () => {
    const c = chaturmasya({ year: 2026, sunriseFn: sr, ayanamsaName: AY, localToJd });
    assert.equal(iso(c.vratas[0].startJd), '2026-07-25');
  });

  test('the four vratas are contiguous and in order', () => {
    const c = chaturmasya({ year: 2026, sunriseFn: sr, ayanamsaName: AY, localToJd });
    assert.equal(c.vratas.length, 4);
    for (const v of c.vratas) assert.equal(v.incomplete, false, `${v.name} incomplete`);
    for (let i = 1; i < 4; i++) {
      assert.ok(
        c.vratas[i].startJd > c.vratas[i - 1].endJd,
        `${c.vratas[i].name} starts before ${c.vratas[i - 1].name} ends`
      );
    }
  });

  test('the encompassing span is flagged for review rather than asserted', () => {
    const c = chaturmasya({ year: 2026, sunriseFn: sr, ayanamsaName: AY, localToJd });
    assert.equal(c.overall.confidence, 'review');
  });
});
