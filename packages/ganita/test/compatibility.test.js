/**
 * Vivaha compatibility: the rules, and the honesty of their reporting.
 *
 * These tests use SYNTHETIC charts. That is deliberate. A Mangala dosha rule
 * is a claim about "Mars in the 8th from the Moon", and the cleanest way to
 * test it is to place Mars in the 8th from the Moon and assert the rule
 * fires - not to search the ephemeris for a birth that happens to do so and
 * then depend on the ephemeris to keep doing it.
 *
 * Several tests below assert on PROVENANCE rather than on a verdict: that a
 * contested reading is marked contested, that an extrapolated exemption is
 * marked extrapolated. Those flags are the feature - they are what stops the
 * output claiming more authority than the sources give it - so they are
 * tested like any other behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mangalaDosha, mangalaComparison, papaLoad, papaSamya, seventhHouse,
  deepCompatibility,
} from '../src/compatibility.js';
import { RASHIS, RASHI_LORD, GRAHAS, NATURAL_NATURE, navamsaOfLongitude, houseFrom } from '../src/chart.js';
import { KUTA_MEANING, SCORE_BANDS, scoreBand } from '../src/kuta-meaning.js';
import { matchKutas } from '../src/kuta.js';

/**
 * Build a chart with grahas placed in named rashis.
 *
 * Mirrors the shape natalChart() produces, so the functions under test cannot
 * tell the difference; anything unspecified is parked in Mesha.
 */
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
    jdUt: 0, ayanamsa: 'trueCitra',
    lagna: {
      longitude: (lagna - 1) * 30 + 15, rashi: lagna, rashiName: RASHIS[lagna - 1],
      lord: RASHI_LORD[lagna - 1], navamsa: navamsaOfLongitude((lagna - 1) * 30 + 15),
      quality: ['chara', 'sthira', 'dwisvabhava'][(lagna - 1) % 3],
    },
    positions,
    chandraRashi: positions.chandra.rashi,
    shukraRashi: positions.shukra.rashi,
    paksha: 'shukla', chandraElongation: 90,
  };
}

/* ----------------------------------------------------- mangala dosha */

test('Mangala in the agreed dosha houses raises the dosha', () => {
  // 1, 4, 7, 8 and 12 from the lagna are agreed by every school.
  for (const house of [1, 4, 7, 8, 12]) {
    const c = chartOf({ lagna: 1, mangala: house, chandra: 1, shukra: 1 });
    const d = mangalaDosha(c);
    const fromLagna = d.readings.find((r) => r.reference === 'lagna');
    assert.equal(fromLagna.house, house);
    assert.equal(fromLagna.afflicts, true, `house ${house} should afflict`);
    assert.equal(fromLagna.afflictsExcludingSecond, true, `house ${house} is not the contested one`);
  }
});

test('the neutral houses raise nothing', () => {
  for (const house of [3, 5, 6, 9, 10, 11]) {
    const c = chartOf({ lagna: 1, mangala: house, chandra: 1, shukra: 1 });
    const fromLagna = mangalaDosha(c).readings.find((r) => r.reference === 'lagna');
    assert.equal(fromLagna.afflicts, false, `house ${house} should not afflict`);
  }
});

test('the 2nd house is reported as contested, and BOTH readings are given', () => {
  // Mangala in Vrishabha with Mesha lagna: the 2nd. Vrishabha is not one of
  // the exempt signs for the 2nd (those are Budha's, Mithuna and Kanya).
  const c = chartOf({ lagna: 1, mangala: 2, chandra: 1, shukra: 1 });
  const d = mangalaDosha(c);
  const r = d.readings.find((x) => x.reference === 'lagna');
  assert.equal(r.house, 2);
  assert.equal(r.contested, true, 'the 2nd must be flagged as the contested house');
  assert.equal(r.afflicts, true, 'included by South Indian practice');
  assert.equal(r.afflictsExcludingSecond, false, 'excluded by the minority reading');
  assert.equal(d.present, true);
  assert.equal(d.presentExcludingSecond, false);
  assert.equal(d.agreement, 'varies', 'a split reading must not be reported as settled');
  assert.ok(d.notes.some((n) => /2nd house/.test(n)), 'the split must be explained');
});

test('a sign exemption from the LAGNA is not marked extrapolated; one from Shukra is', () => {
  // Mangala in Mithuna (a rashi of Budha) in the 2nd from a Vrishabha lagna.
  const fromLagna = mangalaDosha(chartOf({ lagna: 2, mangala: 3, chandra: 2, shukra: 2 }));
  const lagnaReading = fromLagna.readings.find((r) => r.reference === 'lagna');
  assert.equal(lagnaReading.house, 2);
  assert.equal(lagnaReading.exempt, true);
  assert.equal(lagnaReading.extrapolated, false);
  assert.match(lagnaReading.exemptionReason, /from lagna/);

  // The same placement reached from Shukra instead.
  const fromShukra = mangalaDosha(chartOf({ lagna: 6, mangala: 3, chandra: 6, shukra: 2 }));
  const shukraReading = fromShukra.readings.find((r) => r.reference === 'shukra');
  assert.equal(shukraReading.house, 2);
  assert.equal(shukraReading.exempt, true);
  assert.equal(shukraReading.extrapolated, true, 'the sources state these for the lagna only');
  assert.match(shukraReading.exemptionReason, /from shukra/);
  assert.ok(fromShukra.notes.some((n) => /extrapolated/.test(n)));
});

test('a placement exempt only in SOME versions is not treated as exempt', () => {
  // Mangala in Vrischika in the 1st. Some parihara lists extend the "own
  // rashi in the 1st" exemption to Vrischika; the commonly published one
  // names Mesha only. The engine takes the narrower reading and says so.
  const c = chartOf({ lagna: 8, mangala: 8, chandra: 8, shukra: 8 });
  const r = mangalaDosha(c).readings.find((x) => x.reference === 'lagna');
  assert.equal(r.house, 1);
  assert.equal(r.exempt, false, 'the narrower reading must win');
  assert.equal(r.exemptOnlyInSomeVersions, true);
  assert.ok(mangalaDosha(c).notes.some((n) => /some versions/.test(n)));

  // Mesha in the 1st IS exempt in every version.
  const mesha = chartOf({ lagna: 1, mangala: 1, chandra: 1, shukra: 1 });
  const rm = mangalaDosha(mesha).readings.find((x) => x.reference === 'lagna');
  assert.equal(rm.exempt, true);
});

test('all three references are reckoned, not just the lagna', () => {
  // Mangala harmless from the lagna but in the 7th from Chandra.
  const c = chartOf({ lagna: 1, chandra: 5, mangala: 11, shukra: 1 });
  const d = mangalaDosha(c);
  assert.equal(d.readings.find((r) => r.reference === 'lagna').afflicts, false);
  assert.equal(d.readings.find((r) => r.reference === 'chandra').house, 7);
  assert.equal(d.readings.find((r) => r.reference === 'chandra').afflicts, true);
  assert.equal(d.present, true, 'a dosha from Chandra alone still counts');
  assert.deepEqual(d.readings.map((r) => r.reference), ['lagna', 'chandra', 'shukra']);
});

test('dosha samya: both sides carrying it cancels it', () => {
  const afflicted = mangalaDosha(chartOf({ lagna: 1, mangala: 8, chandra: 1, shukra: 1 }));
  const clean = mangalaDosha(chartOf({ lagna: 1, mangala: 5, chandra: 1, shukra: 1 }));
  assert.equal(afflicted.present, true);
  assert.equal(clean.present, false);

  assert.equal(mangalaComparison(afflicted, afflicted).status, 'samya');
  assert.equal(mangalaComparison(afflicted, afflicted).cancelledByBoth, true);
  assert.equal(mangalaComparison(clean, clean).status, 'absent');
  assert.equal(mangalaComparison(afflicted, clean).status, 'one-sided');
  assert.equal(mangalaComparison(clean, afflicted).status, 'one-sided');
  // Only the one-sided case is where schools diverge on what to do next.
  assert.equal(mangalaComparison(afflicted, afflicted).agreement, 'settled');
  assert.equal(mangalaComparison(afflicted, clean).agreement, 'varies');
});

test('"all schools agree" is never claimed while the reading can still flip', () => {
  /*
   * The regression this pins. The badge was computed from one-sidedness
   * alone, so a pair whose primary reading was `samya` but which became
   * `one-sided` once the contested 2nd house was excluded was labelled
   * "schools agree" - directly above a sentence in the same card saying the
   * reading changes under the other school. A badge that says settled has to
   * mean nothing about the result depends on which authority you follow.
   */
  const contestedOnly = mangalaDosha(chartOf({ lagna: 1, mangala: 2, chandra: 1, shukra: 1 }));
  assert.equal(contestedOnly.present, true);
  assert.equal(contestedOnly.presentExcludingSecond, false, 'this dosha rests on the 2nd house alone');

  const solid = mangalaDosha(chartOf({ lagna: 1, mangala: 8, chandra: 1, shukra: 1 }));
  assert.equal(solid.present, true);
  assert.equal(solid.presentExcludingSecond, true);

  const c = mangalaComparison(contestedOnly, solid);
  assert.equal(c.status, 'samya', 'both carry it on the primary reading');
  assert.equal(c.excludingSecondHouse.status, 'one-sided', 'but not on the strict one');
  assert.equal(c.agreement, 'varies', 'so the badge must NOT say the schools agree');
  assert.ok(c.agreementReasons.length > 0, 'and it must say why');
  assert.ok(c.agreementReasons.some((r) => /2nd house/.test(r)));
});

test('a contested or extrapolated side is never reported as settled', () => {
  // Both sides solidly afflicted from the lagna: nothing contested anywhere.
  const solid = mangalaDosha(chartOf({ lagna: 1, mangala: 8, chandra: 1, shukra: 1 }));
  assert.equal(solid.agreement, 'settled');
  assert.equal(mangalaComparison(solid, solid).agreement, 'settled');
  assert.deepEqual(mangalaComparison(solid, solid).agreementReasons, []);

  // A side whose own reading varies must propagate to the comparison even
  // when both statuses happen to match.
  const varies = { ...solid, agreement: 'varies' };
  assert.equal(mangalaComparison(varies, solid).agreement, 'varies');
  assert.ok(mangalaComparison(varies, solid).agreementReasons.length > 0);
});

/* --------------------------------------------------------- papa samya */

test('papa load counts only malefics, only in the sensitive houses', () => {
  // Everything in Mesha with a Mesha lagna: all five malefics land in the 1st.
  const all = papaLoad(chartOf({ lagna: 1 }));
  assert.equal(all.byReference.lagna.count, 5);
  assert.deepEqual(all.byReference.lagna.grahas.map((g) => g.graha).sort(),
    ['ketu', 'mangala', 'rahu', 'shani', 'surya']);
  assert.ok(!all.byReference.lagna.grahas.some((g) => ['guru', 'shukra', 'budha', 'chandra'].includes(g.graha)),
    'benefics and conditional grahas are not papa grahas');

  // Push every malefic into the 3rd, which is not a sensitive house.
  const clean = papaLoad(chartOf({
    lagna: 1, surya: 3, mangala: 3, shani: 3, rahu: 3, ketu: 3, chandra: 1, shukra: 1,
  }));
  assert.equal(clean.byReference.lagna.count, 0);
});

test('papa samya compares like for like and states its own tolerance', () => {
  const heavy = papaLoad(chartOf({ lagna: 1 }));
  const light = papaLoad(chartOf({
    lagna: 1, surya: 3, mangala: 3, shani: 3, rahu: 3, ketu: 3, chandra: 1, shukra: 1,
  }));
  const equal = papaSamya(heavy, heavy);
  assert.equal(equal.difference, 0);
  assert.equal(equal.balanced, true);

  const unequal = papaSamya(heavy, light);
  assert.equal(unequal.difference, Math.abs(heavy.total - light.total));
  assert.equal(unequal.balanced, false);
  // The threshold is ours, and the output must say so rather than implying
  // a classical figure.
  assert.equal(unequal.threshold, 1);
  assert.match(unequal.caveat, /this engine's own/i);
  assert.match(unequal.caveat, /disagree on the weights/i);
  assert.equal(unequal.agreement, 'varies');
});

/* ------------------------------------------------------- 7th house */

test('the 7th house and its lord are read from the lagna', () => {
  const c = chartOf({ lagna: 1, shani: 7, guru: 7 });   // Mesha lagna -> 7th is Tula
  const h = seventhHouse(c);
  assert.equal(h.rashiName, 'Tula');
  assert.equal(h.lord.graha, 'shukra', 'Tula is ruled by Shukra');
  assert.deepEqual(h.occupants.map((o) => o.graha).sort(), ['guru', 'shani']);
  assert.equal(h.maleficAspects + h.beneficAspects <= 9, true);
  // Both karakas are offered rather than one being guessed from a gender.
  assert.ok(h.karakas.shukra && h.karakas.guru);
  assert.match(h.karakas.note, /both are given/i);
  assert.ok(h.navamsa.rashiName, 'the D9 seventh must be reported too');
});

test('the 7th house wraps correctly from every lagna', () => {
  for (let lagna = 1; lagna <= 12; lagna += 1) {
    const h = seventhHouse(chartOf({ lagna }));
    assert.equal(h.rashi, ((lagna + 5) % 12) + 1, `7th from ${RASHIS[lagna - 1]}`);
    assert.equal(h.lord.graha, RASHI_LORD[h.rashi - 1]);
  }
});

/* --------------------------------------------- kuta meaning and bands */

test('every kuta factor has a meaning, and every meaning has a factor', () => {
  // Joined on the factor's own name, so this is what stops the two drifting.
  const names = new Set(matchKutas({ nakshatra: 5, pada: 3 }, { nakshatra: 13, pada: 2 })
    .factors.map((f) => f.name));
  const meanings = new Set(Object.keys(KUTA_MEANING));
  assert.deepEqual([...names].filter((n) => !meanings.has(n)), [], 'factors missing a meaning');
  assert.deepEqual([...meanings].filter((m) => !names.has(m)), [], 'meanings with no factor');
});

test('the qualifiers (four classical, two Sri Uttaradi Math) are marked as carrying no points', () => {
  const r = matchKutas({ nakshatra: 5, pada: 3 }, { nakshatra: 13, pada: 2 });
  for (const f of r.factors) {
    const m = KUTA_MEANING[f.name];
    assert.equal(m.qualifier, f.max === 0,
      `${f.name}: qualifier flag must match whether it scores (max ${f.max})`);
  }
  const qualifiers = Object.entries(KUTA_MEANING).filter(([, m]) => m.qualifier).map(([k]) => k);
  assert.deepEqual(qualifiers.sort(), ['Eka nakshatra', 'Kanya nakshatra', 'Mahendra', 'Rajju', 'Stree Deergha', 'Vedha']);
});

test('the scored factors add up to exactly 36', () => {
  const r = matchKutas({ nakshatra: 1, pada: 1 }, { nakshatra: 1, pada: 1 });
  assert.equal(r.factors.reduce((s, f) => s + f.max, 0), 36);
});

test('score bands cover 0..36 with no gap and no overlap', () => {
  for (let n = 0; n <= 36; n += 1) {
    const hits = SCORE_BANDS.filter((b) => n >= b.min && n <= b.max);
    assert.equal(hits.length, 1, `score ${n} matched ${hits.length} bands`);
    assert.equal(scoreBand(n), hits[0]);
  }
});

test('the bands are the standard classification, hinged on 18 of 36', () => {
  // 18 is the conventional minimum and the one boundary every published
  // table agrees on. A scheme without a boundary there is not the standard
  // classification however its tiers are labelled - an evenly divided
  // 0/10/20/30 looks tidy and puts the accept-reject line in the wrong place.
  assert.equal(scoreBand(17).label, 'Not recommended');
  assert.equal(scoreBand(18).label, 'Average', '18 must be the first acceptable score');
  assert.notEqual(scoreBand(17).tone, scoreBand(18).tone, 'the tier must change at 18');

  assert.deepEqual(
    SCORE_BANDS.map((b) => [b.min, b.max, b.label]),
    [
      [0, 17, 'Not recommended'],
      [18, 24, 'Average'],
      [25, 31, 'Very good'],
      [32, 36, 'Excellent'],
    ]
  );
});

test('each band names a distinct severity tone, ordered worst to best', () => {
  assert.deepEqual(SCORE_BANDS.map((b) => b.tone),
    ['critical', 'warning', 'good', 'excellent']);
  // The tone is a severity slot, not a colour: the stylesheet maps it, and it
  // must map differently on light and dark surfaces.
  for (const b of SCORE_BANDS) {
    assert.ok(!/#|rgb|green|red|orange/i.test(b.tone),
      `band tone "${b.tone}" must not name a colour`);
    assert.ok(b.meaning && b.meaning.length > 20, `${b.label} needs a meaning`);
  }
  // Higher bands carry the tradition's own term; the failing band does not.
  assert.equal(SCORE_BANDS[0].sanskrit, null);
  assert.deepEqual(SCORE_BANDS.slice(1).map((b) => b.sanskrit),
    ['madhyama', 'uttama', 'ati-uttama']);
});

/* ------------------------------------------------------- assembly */

test('the assembled report carries no overall verdict', () => {
  const bride = chartOf({ lagna: 1, mangala: 8, chandra: 3, shukra: 2 });
  const groom = chartOf({ lagna: 5, mangala: 12, chandra: 9, shukra: 4 });
  const d = deepCompatibility({ brideChart: bride, groomChart: groom });

  assert.ok(d.mangala && d.papaSamya && d.seventhHouse && d.charts);
  // The absence is the design: no score, no verdict, no recommendation.
  for (const key of ['verdict', 'score', 'percentage', 'recommendation', 'overall']) {
    assert.equal(key in d, false, `the report must not carry a "${key}"`);
  }
  assert.match(d.disclaimer, /no overall verdict/i);
  assert.match(d.disclaimer, /both readings are given/i);
});

test('every section states how much the schools agree', () => {
  const bride = chartOf({ lagna: 1, mangala: 8, chandra: 3, shukra: 2 });
  const groom = chartOf({ lagna: 5, mangala: 5, chandra: 9, shukra: 4 });
  const d = deepCompatibility({ brideChart: bride, groomChart: groom });
  for (const a of [
    d.mangala.bride.agreement, d.mangala.groom.agreement,
    d.mangala.comparison.agreement, d.papaSamya.comparison.agreement,
  ]) {
    assert.ok(['settled', 'varies'].includes(a), `bad agreement value: ${a}`);
  }
});
