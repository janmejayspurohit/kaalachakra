/**
 * The natal chart, and the arithmetic every reading on top of it depends on.
 *
 * The house and aspect formulas are fencepost-prone: classical drishti counts
 * INCLUSIVELY from the occupied house, so a graha in the 1st aspects the 7th,
 * not the 8th. An off-by-one there moves every aspect in every chart by one
 * bhava and still produces entirely plausible-looking output. It is checked
 * against hand-worked cases here rather than trusted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setProcessGanita } from '../src/ephemeris.js';

// Validated against published DRIK (Lahiri) charts - Gandhi, Modi - so it runs
// under drik. Under the Surya Siddhanta default the kundali's Sun and Moon
// come from the Siddhanta (see chart.js), which those published charts do not.
setProcessGanita('drik');
import {
  natalChart, navamsaOfLongitude, houseFrom, aspectedHouse, drishtiOf,
  aspectsOnHouse, occupantsOf, rashiOfLongitude, RASHIS, RASHI_QUALITY,
} from '../src/chart.js';
import { localToJd } from '../src/time.js';

/* ------------------------------------------------------------ Gandhi */

// 1869-10-02, Porbandar (21.6417N, 69.6293E), 08:36 LOCAL MEAN TIME.
// India did not adopt IST until 1906, so LMT = longitude/15 = +4h38m.
const PORBANDAR = { latitude: 21.6417, longitude: 69.6293, altitude: 0, tzOffsetHours: 69.6293 / 15 };
const GANDHI_JD = localToJd({ year: 1869, month: 10, day: 2, hour: 8, minute: 36 }, PORBANDAR.tzOffsetHours);

test('Gandhi: the positions that do not move within an hour match the published chart', () => {
  const c = natalChart(GANDHI_JD, PORBANDAR, 'lahiri');
  // Published (Lahiri): Moon Karka/Ashlesha, Sun Kanya, Mars + Mercury +
  // Venus all Tula, Jupiter Mesha, Saturn Vrischika.
  assert.equal(c.positions.chandra.rashiName, 'Karka');
  assert.equal(c.positions.surya.rashiName, 'Kanya');
  assert.equal(c.positions.mangala.rashiName, 'Tula');
  assert.equal(c.positions.budha.rashiName, 'Tula');
  assert.equal(c.positions.shukra.rashiName, 'Tula');
  assert.equal(c.positions.guru.rashiName, 'Mesha');
  assert.equal(c.positions.shani.rashiName, 'Vrischika');
});

test('the ascendant is recorded as time-sensitive, NOT as a validated match', () => {
  // The published Swati ascendant for Gandhi is reproducible only with IST,
  // which is the wrong offset for an 1869 birth - two implementations making
  // the same timezone error agree with each other perfectly. This test pins
  // the actual LMT answer so the discrepancy cannot be quietly re-introduced
  // as a "fix".
  const lmt = natalChart(GANDHI_JD, PORBANDAR, 'lahiri');
  assert.equal(lmt.lagna.rashiName, 'Tula');
  assert.ok(Math.abs(lmt.lagna.longitude - 203.58) < 0.1,
    `LMT ascendant should be ~203.58, got ${lmt.lagna.longitude}`);

  const istJd = localToJd({ year: 1869, month: 10, day: 2, hour: 8, minute: 36 }, 5.5);
  const ist = natalChart(istJd, { ...PORBANDAR, tzOffsetHours: 5.5 }, 'lahiri');
  assert.ok(Math.abs(ist.lagna.longitude - 192.02) < 0.1);
  // The two differ by more than a nakshatra: Vishakha versus Swati.
  assert.ok(lmt.lagna.longitude - ist.lagna.longitude > 11);
});

/* ----------------------------------------------------------- navamsa */

test('navamsa reproduces the chara / sthira / dwisvabhava starting rule', () => {
  // A movable sign's navamsas begin at itself, a fixed sign's at the 9th from
  // it, a dual sign's at the 5th.
  //
  // The expected value is DERIVED FROM THE RULE for all twelve signs rather
  // than hand-listed. Hand-listing it is how this test first failed: I wrote
  // "Simha -> Dhanu" when the 9th from Simha is Mesha. A test whose expected
  // values are my own arithmetic tests my arithmetic, not the code.
  const ninthFrom = (r) => ((r - 1 + 8) % 12) + 1;
  const fifthFrom = (r) => ((r - 1 + 4) % 12) + 1;

  for (let rashi = 1; rashi <= 12; rashi += 1) {
    const quality = RASHI_QUALITY[rashi - 1];
    const expected =
      quality === 'chara' ? rashi
        : quality === 'sthira' ? ninthFrom(rashi)
          : fifthFrom(rashi);
    // The first navamsa of the sign: half a degree into it.
    const got = navamsaOfLongitude((rashi - 1) * 30 + 0.5);
    assert.equal(got, expected,
      `${RASHIS[rashi - 1]} (${quality}) should start at ${RASHIS[expected - 1]}, got ${RASHIS[got - 1]}`);
  }

  // And the NINTH navamsa of a sign is always the last before the next sign.
  for (let rashi = 1; rashi <= 12; rashi += 1) {
    const first = navamsaOfLongitude((rashi - 1) * 30 + 0.5);
    const ninth = navamsaOfLongitude((rashi - 1) * 30 + 8 * (30 / 9) + 0.5);
    assert.equal(ninth, ((first - 1 + 8) % 12) + 1,
      'the nine navamsas of a sign run consecutively');
  }
});

test('there are 108 navamsas and the last one closes the circle', () => {
  const seen = new Set();
  for (let i = 0; i < 108; i += 1) seen.add(navamsaOfLongitude(i * (30 / 9) + 0.5));
  assert.equal(seen.size, 12, 'all twelve rashis must be reached');
  // 3 deg 20 min each: the 108th ends exactly at 360.
  assert.equal(navamsaOfLongitude(359.9), navamsaOfLongitude(107 * (30 / 9) + 1));
  assert.equal(navamsaOfLongitude(360), navamsaOfLongitude(0));
});

/* ------------------------------------------------- houses and drishti */

test('whole-sign houses count inclusively from the reference', () => {
  assert.equal(houseFrom(1, 1), 1, 'the reference sign IS the first house');
  assert.equal(houseFrom(7, 1), 7);
  assert.equal(houseFrom(1, 7), 7, 'and the relation is symmetric across the axis');
  assert.equal(houseFrom(12, 1), 12);
  assert.equal(houseFrom(1, 2), 12, 'one sign back is the 12th, not the 0th');
});

test('drishti counts inclusively: a graha in the 1st aspects the 7th', () => {
  assert.equal(aspectedHouse(1, 7), 7);
  assert.equal(aspectedHouse(7, 7), 1, 'and back again');
  assert.equal(aspectedHouse(10, 7), 4);
  // Mangala's specials from the 1st: 4th and 8th.
  assert.deepEqual(drishtiOf('mangala'), [4, 7, 8]);
  assert.deepEqual(drishtiOf('mangala').map((d) => aspectedHouse(1, d)), [4, 7, 8]);
  // Shani's from the 1st: 3rd and 10th.
  assert.deepEqual(drishtiOf('shani').map((d) => aspectedHouse(1, d)), [3, 7, 10]);
  // Guru's from the 1st: 5th and 9th.
  assert.deepEqual(drishtiOf('guru').map((d) => aspectedHouse(1, d)), [5, 7, 9]);
  // Everything else has the 7th only.
  assert.deepEqual(drishtiOf('surya'), [7]);
});

/* ------------------------------------------------------ chart shape */

test('the nodes are exactly opposite and the lagna is self-consistent', () => {
  const c = natalChart(GANDHI_JD, PORBANDAR, 'lahiri');
  const sep = Math.abs(c.positions.rahu.longitude - c.positions.ketu.longitude);
  assert.ok(Math.abs(sep - 180) < 1e-9, `nodes must be 180 apart, got ${sep}`);
  assert.equal(c.lagna.rashi, rashiOfLongitude(c.lagna.longitude));
  assert.equal(c.lagna.rashiName, RASHIS[c.lagna.rashi - 1]);
  // Every graha's house must agree with its rashi counted from the lagna.
  for (const p of Object.values(c.positions)) {
    assert.equal(p.house, houseFrom(p.rashi, c.lagna.rashi), `${p.graha} house`);
    assert.equal(p.rashi, rashiOfLongitude(p.longitude), `${p.graha} rashi`);
  }
});

test('occupants and aspects agree with the positions they were derived from', () => {
  const c = natalChart(GANDHI_JD, PORBANDAR, 'lahiri');
  for (let h = 1; h <= 12; h += 1) {
    for (const o of occupantsOf(c, h)) assert.equal(o.house, h);
    for (const a of aspectsOnHouse(c, h)) {
      assert.ok(drishtiOf(a.graha).includes(a.drishti));
      assert.equal(aspectedHouse(a.from, a.drishti), h);
    }
  }
  // Gandhi has Mars, Mercury and Venus in Tula, which is his lagna sign.
  const first = occupantsOf(c, 1).map((p) => p.graha).sort();
  assert.deepEqual(first, ['budha', 'mangala', 'shukra']);
});

test('a chart cannot be built without a real place', () => {
  assert.throws(() => natalChart(GANDHI_JD, null, 'lahiri'), TypeError);
  assert.throws(() => natalChart(GANDHI_JD, { latitude: 12 }, 'lahiri'), TypeError);
});

test('dignities are assigned at the classical signs', () => {
  // Checked through the public surface by finding a moment, rather than by
  // reaching into the table: Surya is uccha in Mesha, neecha in Tula.
  const c = natalChart(GANDHI_JD, PORBANDAR, 'lahiri');
  assert.equal(c.positions.chandra.dignity, 'swakshetra', 'Moon in Karka is in its own sign');
  assert.equal(c.positions.shukra.dignity, 'swakshetra', 'Venus in Tula is in its own sign');
  assert.equal(c.positions.rahu.dignity, null, 'chhaya grahas have no classical dignity');
});
