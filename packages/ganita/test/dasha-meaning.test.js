/**
 * Dasha interpretation: the classical layer and the chart-specific layer.
 *
 * The chart-specific half is the part that can be silently wrong. Functional
 * nature is derived from house lordship counted from the lagna, and getting
 * that wrong produces a confident, completely inverted reading - it would
 * call the single most auspicious graha in a chart a malefic. So it is
 * checked against the canonical yogakaraka list, which is the one fact in
 * this area every authority states identically.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAHADASHA_MEANING, functionalNature, dashaOutlook, antardashaNote,
} from '../src/dasha-meaning.js';
import { DASHA_ORDER, MAHADASHA_YEARS } from '../src/dasha.js';
import { RASHIS, RASHI_LORD, GRAHAS, NATURAL_NATURE, navamsaOfLongitude, houseFrom } from '../src/chart.js';

function chartOf({ lagna = 1, ...places }) {
  const positions = {};
  for (const g of GRAHAS) {
    const rashi = places[g] ?? 1;
    const longitude = (rashi - 1) * 30 + 15;
    positions[g] = {
      graha: g, longitude, degreeInRashi: 15,
      rashi, rashiName: RASHIS[rashi - 1],
      navamsa: navamsaOfLongitude(longitude),
      navamsaName: RASHIS[navamsaOfLongitude(longitude) - 1],
      house: houseFrom(rashi, lagna),
      dignity: null, retrograde: false, nature: NATURAL_NATURE[g],
    };
  }
  return {
    lagna: {
      rashi: lagna, rashiName: RASHIS[lagna - 1], lord: RASHI_LORD[lagna - 1],
      longitude: (lagna - 1) * 30 + 15, navamsa: 1, quality: 'chara',
    },
    positions,
    chandraRashi: positions.chandra.rashi,
    shukraRashi: positions.shukra.rashi,
  };
}

test('every dasha lord has a meaning, and the years match the Vimshottari table', () => {
  assert.deepEqual(Object.keys(MAHADASHA_MEANING).sort(), [...DASHA_ORDER].sort());
  for (const g of DASHA_ORDER) {
    assert.equal(MAHADASHA_MEANING[g].years, MAHADASHA_YEARS[g],
      `${g}: the stated length must match the engine's own table`);
  }
  // 120 years, which is the whole point of the cycle.
  assert.equal(
    Object.values(MAHADASHA_MEANING).reduce((s, m) => s + m.years, 0), 120);
});

test('every meaning carries all four kinds of guidance', () => {
  for (const [g, m] of Object.entries(MAHADASHA_MEANING)) {
    for (const key of ['favourable', 'unfavourable', 'avoid', 'scope']) {
      assert.ok(Array.isArray(m[key]) && m[key].length > 0, `${g} is missing ${key}`);
    }
    assert.ok(m.theme && m.signifies && m.duration, `${g} is missing prose`);
  }
});

test('the yogakarakas are exactly the canonical six', () => {
  // Every authority states these identically: a graha lording both a kendra
  // and a trikona (other than the lagna itself).
  const found = [];
  for (let lagna = 1; lagna <= 12; lagna += 1) {
    for (const g of ['surya', 'chandra', 'mangala', 'budha', 'guru', 'shukra', 'shani']) {
      if (functionalNature(lagna, g).yogakaraka) found.push(`${RASHIS[lagna - 1]}:${g}`);
    }
  }
  assert.deepEqual(found.sort(), [
    'Karka:mangala', 'Kumbha:shukra', 'Makara:shukra',
    'Simha:mangala', 'Tula:shani', 'Vrishabha:shani',
  ]);
});

test('lordship of the lagna alone does not make a yogakaraka', () => {
  // The 1st is both a kendra and a trikona, so a naive rule makes every
  // lagna lord a yogakaraka - which would be six times too many.
  for (let lagna = 1; lagna <= 12; lagna += 1) {
    const lord = RASHI_LORD[lagna - 1];
    const fn = functionalNature(lagna, lord);
    assert.ok(fn.lordships.includes(1), `${lord} must lord the 1st for this lagna`);
    if (fn.yogakaraka) {
      assert.ok(fn.lordships.some((h) => [4, 7, 10].includes(h)),
        `${RASHIS[lagna - 1]}: ${lord} called yogakaraka on lagna lordship alone`);
      assert.ok(fn.lordships.some((h) => [5, 9].includes(h)));
    }
  }
});

test('divided lordship is reported as mixed, not resolved by code order', () => {
  // Shani for a Mesha lagna rules the 10th (a kendra, which makes a natural
  // malefic benefic) AND the 11th (held malefic). Neither pull may silently
  // win.
  const fn = functionalNature(1, 'shani');
  assert.deepEqual(fn.lordships, [10, 11]);
  assert.equal(fn.nature, 'mixed');
  assert.ok(fn.reasons.some((r) => /kendra/.test(r)), 'the benefic pull must be stated');
  assert.ok(fn.reasons.some((r) => /11th/.test(r)), 'and the malefic pull too');
});

test('the nodes are given no functional nature of their own', () => {
  for (const g of ['rahu', 'ketu']) {
    for (let lagna = 1; lagna <= 12; lagna += 1) {
      const fn = functionalNature(lagna, g);
      assert.equal(fn.nature, 'takes-on');
      assert.deepEqual(fn.lordships, [], 'the nodes rule no rashi');
      assert.equal(fn.yogakaraka, false);
      assert.match(fn.reasons[0], /dispositor/);
    }
  }
});

test('every graha lords either one rashi or two, and Surya and Chandra exactly one', () => {
  for (let lagna = 1; lagna <= 12; lagna += 1) {
    assert.equal(functionalNature(lagna, 'surya').lordships.length, 1);
    assert.equal(functionalNature(lagna, 'chandra').lordships.length, 1);
    for (const g of ['mangala', 'budha', 'guru', 'shukra', 'shani']) {
      assert.equal(functionalNature(lagna, g).lordships.length, 2, `${g} rules two rashis`);
    }
  }
});

test('the outlook separates the general from the chart-specific, and gives no verdict', () => {
  const chart = chartOf({ lagna: 7, shani: 10 }); // Tula lagna: Shani is the yogakaraka
  const o = dashaOutlook(chart, 'shani');

  assert.equal(o.inThisChart.functional.nature, 'yogakaraka');
  assert.match(o.inThisChart.summary, /is the yogakaraka/,
    'the phrase must read as prose, not as a bare enum value');

  // The classical layer is present and unchanged by the chart.
  assert.deepEqual(o.favourable, MAHADASHA_MEANING.shani.favourable);

  // And no verdict of any kind.
  for (const key of ['verdict', 'score', 'rating', 'good', 'bad', 'prediction']) {
    assert.equal(key in o, false, `the outlook must not carry a "${key}"`);
  }
  assert.match(o.disclaimer, /not a forecast/i);
});

test('dignity and house placement surface as strengths and weaknesses', () => {
  // Shani exalted in Tula, in the 4th from a Karka lagna (a kendra).
  const strong = dashaOutlook(chartOf({ lagna: 4, shani: 7 }), 'shani');
  assert.ok(strong.inThisChart.strengths.some((t) => /own rashi|exalted/.test(t)) ||
            strong.inThisChart.strengths.some((t) => /kendra/.test(t)));

  // Shani debilitated in Mesha.
  const chart = chartOf({ lagna: 1, shani: 1 });
  chart.positions.shani.dignity = 'neecha';
  const weak = dashaOutlook(chart, 'shani');
  assert.ok(weak.inThisChart.weaknesses.some((t) => /debilitated/.test(t)));
});

test('an unknown dasha lord is rejected rather than rendered blank', () => {
  assert.throws(() => dashaOutlook(chartOf({}), 'pluto'), RangeError);
});

test('antardasha notes name both lords', () => {
  const same = antardashaNote('shani', 'shani');
  assert.match(same.statement, /own antardasha/);
  const mixed = antardashaNote('shani', 'shukra');
  assert.equal(mixed.mahaTheme, MAHADASHA_MEANING.shani.theme);
  assert.equal(mixed.antarTheme, MAHADASHA_MEANING.shukra.theme);
  assert.equal(antardashaNote('shani', 'nonsense'), null);
});
