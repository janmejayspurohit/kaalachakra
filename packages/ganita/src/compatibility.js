/**
 * Deep vivaha (marriage) compatibility, beyond the kuta count.
 *
 * WHAT THIS FILE IS CAREFUL ABOUT
 *
 * The kuta score is arithmetic on two nakshatras: given the same pair of
 * nakshatras every astrologer in India computes the same 36-point total. The
 * material below is not like that. Mangala dosha, its pariharas and the
 * weighting of papa grahas are places where authorities genuinely disagree -
 * on which houses count, on which reference point they are counted from, and
 * on which cancellations apply. An engine that silently picks one school and
 * prints a verdict is not being accurate, it is being confident.
 *
 * So every finding here carries:
 *   - `basis`: the positions it was derived from, so it can be checked;
 *   - `authority`: which tradition states the rule;
 *   - `agreement`: 'settled' where the schools concur, 'varies' where they do
 *     not, in which case BOTH readings are returned rather than one.
 *
 * And there is deliberately NO overall verdict, for the same reason
 * matchKutas() does not return one: the decision is the astrologer's and the
 * family's, and a single number invites it to be made by a number.
 */
import {
  GRAHAS, RASHIS, RASHI_LORD, RASHI_QUALITY, NODE_DRISHTI_NOTE,
  aspectsOnHouse, aspectsRashi, houseFrom, occupantsOf,
} from './chart.js';
import { asthaStatus } from './muhurta.js';

/* ------------------------------------- Sri Uttaradi Math's Mangala dosha */

/**
 * The Math's own statement (Sanskrit-script edition 2024-25, page 46; Kannada
 * printed in Devanagari, rendered here in Kannada script):
 *
 *   ಮಂಗಳದೋಷ: ಜನ್ಮಲಗ್ನದಲ್ಲಿ ಮತ್ತು ಲಗ್ನದಿಂದ 4, 7, 8, 12 ಹೀಗೆ 5 ಸ್ಥಳಗಳಲ್ಲಿ
 *   ಮಂಗಳನು ಇದ್ದರೆ ಮಂಗಳದೋಷವೆಂದು ತಿಳಿಯಬೇಕು. ವಧೂವರರ ಕುಂಡಲಿಯಲ್ಲಿ ಮೇಲೆ
 *   ಹೇಳಿದ ಸ್ಥಳಗಳಲ್ಲಿ ಸಮಬಲ ಮಂಗಳನು ಇದ್ದರೆ ದೋಷವಿಲ್ಲ. ಎರಡೂ ಜನ್ಮಕುಂಡಲಿಗಳೊಳಗೆ
 *   ಒಂದರಲ್ಲಿದ್ದು ಇನ್ನೊಂದರಲ್ಲಿ ಇರದಿದ್ದರೆ ವಿವಾಹವನ್ನು ಮಾಡಬಾರದು.
 *   ಮಂಗಳದೋಷ ಪರಿಹಾರ: 1. ನೀಚ (ಕರ್ಕದಲ್ಲಿರುವ), 2. ಶತ್ರುಗ್ರಹೀ (ಮಿಥುನ ಕನ್ಯಾ
 *   ರಾಶಿಗಳಲ್ಲಿರುವ), 3. ಅಸ್ತಂಗತ ಅಥವಾ ವಕ್ರೀ, 4. ಶುಭಗ್ರಹದಿಂದ ಪೂರ್ಣ ದೃಷ್ಟಿ
 *   ಇದ್ದರೆ, 5. ರಾಹು ಮತ್ತು ಶನಿಯು 1,4,7,8,12ರಲ್ಲಿದ್ದರೆ, 6. ಬಲಿಷ್ಠ ಗುರು-ಶುಕ್ರರು
 *   1,7ರಲ್ಲಿ ಇದ್ದರೆ, 7. 1ರಲ್ಲಿ ಮೇಷದ, 4ರಲ್ಲಿ ವೃಶ್ಚಿಕದ, 7ರಲ್ಲಿ ಮಕರದ,
 *   8ರಲ್ಲಿ ಸಿಂಹದ, 12ರಲ್ಲಿ ಧನುವಿನ ಮಂಗಳನಿದ್ದರೆ ಮಂಗಳದೋಷವಿಲ್ಲ.
 *
 * "Mangala dosha: Mars in the janma lagna or in the 4th, 7th, 8th or 12th
 * from it. If both charts have Mars of equal strength in those places there
 * is no dosha; if one has it and the other does not, the marriage should not
 * be performed. Pariharas: (1) Mars debilitated (in Karka); (2) in an enemy's
 * sign (Mithuna, Kanya); (3) combust or retrograde; (4) under the full
 * aspect of a benefic; (5) Rahu and Shani in the 1st, 4th, 7th, 8th or 12th;
 * (6) a strong Guru or Shukra in the 1st or 7th; (7) Mars in Mesha in the 1st,
 * Vrischika in the 4th, Makara in the 7th, Simha in the 8th, Dhanu in the
 * 12th - no Mangala dosha."
 */
export const UM_MANGALA_SOURCE = 'Sri Uttaradi Math panchanga (Sanskrit-script edition 2024-25, page 46)';
const UM_MANGALA_HOUSES = [1, 4, 7, 8, 12];
const UM_SIGN_HOUSE = { 1: 1, 4: 8, 7: 10, 8: 5, 12: 9 };
/** Full drishti, from the Math's navagraha table ("ಸಂಪೂರ್ಣ ದೃಷ್ಟಿಃ"): 7th for all; Guru also 5th and 9th. */
const UM_BENEFIC_FULL_ASPECT = { chandra: [7], budha: [7], guru: [5, 7, 9], shukra: [7] };

function uttaradiMathMangala(chart) {
  const m = chart.positions.mangala;
  const house = houseFrom(m.rashi, chart.lagna.rashi);
  const afflicts = UM_MANGALA_HOUSES.includes(house);
  const pariharas = [];
  const add = (n, rule, holds, note = null) => pariharas.push({ number: n, rule, holds, ...(note ? { note } : {}) });
  add(1, 'Mangala neecha (in Karka)', m.rashi === 4);
  add(2, 'Mangala in an enemy\'s rashi (Mithuna or Kanya)', m.rashi === 3 || m.rashi === 6);
  let combust = null;
  try { combust = asthaStatus(chart.jdUt).bhouma.combust; } catch { combust = null; }
  add(3, 'Mangala combust or retrograde', Boolean(m.retrograde || combust),
    `retrograde: ${m.retrograde ? 'yes' : 'no'}; combust: ${combust === null ? 'not computed' : combust ? 'yes' : 'no'} (orb as fitted to the Math's printed Bhouma astha dates)`);
  const aspecting = Object.entries(UM_BENEFIC_FULL_ASPECT)
    .filter(([g, hs]) => hs.some((h) => houseFrom(m.rashi, chart.positions[g].rashi) === h)).map(([g]) => g);
  add(4, 'full aspect of a benefic on Mangala', aspecting.length > 0, aspecting.length ? `aspected by ${aspecting.join(', ')}` : null);
  const inKendraSet = (g) => UM_MANGALA_HOUSES.includes(houseFrom(chart.positions[g].rashi, chart.lagna.rashi));
  add(5, 'Rahu and Shani in the 1st, 4th, 7th, 8th or 12th', inKendraSet('rahu') && inKendraSet('shani'),
    'The text says "Rahu and Shani"; both are required here. It does not say whether one suffices.');
  const gs = ['guru', 'shukra'].filter((g) => [1, 7].includes(houseFrom(chart.positions[g].rashi, chart.lagna.rashi)));
  add(6, 'a strong Guru or Shukra in the 1st or 7th', null,
    gs.length ? `${gs.join(' and ')} in the 1st or 7th - whether strong (balishtha) is for an astrologer to judge` : 'neither Guru nor Shukra is in the 1st or 7th');
  if (!gs.length) pariharas[pariharas.length - 1].holds = false;
  add(7, 'Mangala in Mesha in the 1st, Vrischika in the 4th, Makara in the 7th, Simha in the 8th or Dhanu in the 12th', UM_SIGN_HOUSE[house] === m.rashi);
  const cancelled = pariharas.some((x) => x.holds === true);
  return {
    house, afflicts,
    present: afflicts && !cancelled,
    needsJudgment: afflicts && !cancelled && pariharas.some((x) => x.holds === null),
    pariharas: afflicts ? pariharas : [],
    authority: UM_MANGALA_SOURCE,
  };
}

/* ------------------------------------------------------- mangala dosha */

/**
 * The houses in which Mangala is held to afflict marriage.
 *
 * 1, 4, 7, 8 and 12 are agreed by every school. The 2nd is the contested one:
 * South Indian practice (and most North Indian practice) includes it because
 * the 2nd is the kutumba bhava; a minority of authorities do not. Both counts
 * are therefore returned, and the caller is told which houses drove each.
 */
const DOSHA_HOUSES_WITH_SECOND = [1, 2, 4, 7, 8, 12];
const DOSHA_HOUSES_WITHOUT_SECOND = [1, 4, 7, 8, 12];

/**
 * Sign-specific exemptions, by the house Mangala occupies.
 *
 * These are the classical "Mangala loses its power to harm" placements, where
 * the sign itself disarms the position - Mangala in the 2nd in a sign of
 * Budha, in the 4th in its own sign, and so on. Attested across the standard
 * compilations and consistent between them, which is why they are applied;
 * the age-based and "after 28" rules circulating widely are NOT applied,
 * because no classical source states them.
 */
const SIGN_EXEMPTIONS = {
  1: { rashis: [1], why: 'Mangala in Mesha', alsoCited: [8],
       alsoWhy: 'some versions extend this to Vrischika, Mangala\'s other own rashi' },
  2: { rashis: [3, 6], why: 'Mangala in a rashi of Budha' },
  4: { rashis: [1, 8], why: 'Mangala in its own rashi' },
  7: { rashis: [4, 10], why: 'Mangala in Karka or Makara' },
  8: { rashis: [9, 12], why: 'Mangala in a rashi of Guru' },
  12: { rashis: [2, 7], why: 'Mangala in a rashi of Shukra' },
};

/**
 * The exemption table is stated by the sources FOR THE LAGNA RECKONING.
 *
 * Applying it to the Chandra and Shukra reckonings is an extrapolation - a
 * reasonable one, since those reckonings are themselves analogies of the
 * lagna one, but not something a text says. Such an application is therefore
 * marked `extrapolated` so a reader can see the difference, because whether
 * an exemption holds can flip the whole comparison between the two charts
 * from one-sided to samya.
 */
export const EXEMPTION_SOURCE_NOTE =
  'The sign-based pariharas are stated in the sources for the lagna ' +
  'reckoning. Where one is applied to the Chandra or Shukra reckoning it is ' +
  'flagged as extrapolated. These parihara lists are the least settled part ' +
  'of this analysis and vary between compilations.';

/**
 * Mangala dosha for one chart, reckoned from all three classical references.
 *
 * Lagna is the primary reference everywhere. Chandra is added by almost all
 * schools. Shukra is the specifically South Indian addition, and it is the
 * one most often left out elsewhere - so it is computed but reported
 * separately rather than folded into a single yes/no.
 */
export function mangalaDosha(chart) {
  const mangala = chart.positions.mangala;

  const from = (label, fromRashi) => {
    const house = houseFrom(mangala.rashi, fromRashi);
    const withSecond = DOSHA_HOUSES_WITH_SECOND.includes(house);
    const withoutSecond = DOSHA_HOUSES_WITHOUT_SECOND.includes(house);
    const exemption = SIGN_EXEMPTIONS[house];
    const exempt = Boolean(exemption && exemption.rashis.includes(mangala.rashi));
    const exemptOnlyInSomeVersions = Boolean(
      exemption && !exempt && exemption.alsoCited?.includes(mangala.rashi)
    );
    return {
      reference: label,
      house,
      afflicts: withSecond,
      afflictsExcludingSecond: withoutSecond,
      contested: withSecond && !withoutSecond, // i.e. it is the 2nd house
      exempt,
      // The reason names the reference it was counted from, so an exemption
      // reached from Shukra cannot read as though it came from the lagna.
      exemptionReason: exempt
        ? `${exemption.why}, in the ${ordinal(house)} from ${label}`
        : null,
      extrapolated: exempt && label !== 'lagna',
      exemptOnlyInSomeVersions,
      exemptionVariantNote: exemptOnlyInSomeVersions ? exemption.alsoWhy : null,
    };
  };

  const readings = [
    from('lagna', chart.lagna.rashi),
    from('chandra', chart.chandraRashi),
    from('shukra', chart.shukraRashi),
  ];

  // Dignity-based mitigation, stated separately from the sign exemptions
  // because it applies wherever Mangala sits.
  const dignified = mangala.dignity === 'swakshetra' || mangala.dignity === 'uccha';

  // Guru's drishti on Mangala is the most widely cited mitigating aspect.
  const guruAspectsMangala = aspectsRashi(chart, 'guru', mangala.rashi);

  const present = readings.some((r) => r.afflicts && !r.exempt);
  const presentStrict = readings.some((r) => r.afflictsExcludingSecond && !r.exempt);

  return {
    present,
    presentExcludingSecond: presentStrict,
    // The Math's own reading, kept apart from the multi-school one above.
    uttaradiMath: uttaradiMathMangala(chart),
    mangala: {
      rashi: mangala.rashi, rashiName: mangala.rashiName,
      degreeInRashi: mangala.degreeInRashi,
      dignity: mangala.dignity, retrograde: mangala.retrograde,
      navamsaName: mangala.navamsaName,
    },
    readings,
    mitigations: [
      ...(dignified ? [{
        rule: `Mangala is ${mangala.dignity} in ${mangala.rashiName}`,
        effect: 'a graha in its own or exalted rashi is held to do less harm',
        agreement: 'settled',
      }] : []),
      ...(guruAspectsMangala ? [{
        rule: 'Guru aspects Mangala',
        effect: "Guru's drishti is the most widely cited mitigating aspect",
        agreement: 'settled',
      }] : []),
      ...readings.filter((r) => r.exempt).map((r) => ({
        rule: r.exemptionReason,
        effect: `the placement in the ${ordinal(r.house)} from ${r.reference} is exempt`,
        agreement: r.extrapolated ? 'varies' : 'settled',
        extrapolated: r.extrapolated,
      })),
    ],
    notes: [
      present !== presentStrict
        ? 'This reading depends on whether the 2nd house counts. It is included by South Indian and most North Indian practice and excluded by a minority; both results are given.'
        : null,
      readings.some((r) => r.extrapolated)
        ? EXEMPTION_SOURCE_NOTE
        : null,
      readings.some((r) => r.exemptOnlyInSomeVersions)
        ? 'A placement here is exempt under some versions of the parihara list and not others; it has NOT been treated as exempt.'
        : null,
    ].filter(Boolean),
    authority: 'classical vivaha texts; house set and pariharas as compiled in standard South Indian practice',
    agreement: present === presentStrict ? 'settled' : 'varies',
  };
}

/**
 * Compare the two charts' Mangala dosha.
 *
 * The one rule every school agrees on: if BOTH have it, it is cancelled. That
 * is dosha samya, and it is the reason the comparison matters more than
 * either chart's reading on its own.
 */
export function mangalaComparison(brideDosha, groomDosha) {
  const both = brideDosha.present && groomDosha.present;
  const neither = !brideDosha.present && !groomDosha.present;
  const oneSided = !both && !neither;

  const status = both ? 'samya' : neither ? 'absent' : 'one-sided';
  const strictStatus =
    brideDosha.presentExcludingSecond && groomDosha.presentExcludingSecond
      ? 'samya'
      : !brideDosha.presentExcludingSecond && !groomDosha.presentExcludingSecond
        ? 'absent' : 'one-sided';

  /*
   * The comparison is only "settled" if NOTHING about it depends on which
   * authority you follow. Three things can make it depend on that, and an
   * earlier version checked only the first:
   *   1. the result is one-sided, which is where the schools prescribe
   *      different remedies;
   *   2. the answer CHANGES when the contested 2nd house is excluded - it
   *      reported "schools agree" while the body of the same card said the
   *      reading flips to one-sided under the minority view, which is a
   *      contradiction printed in two places at once;
   *   3. either side's own reading rests on a contested house or an
   *      extrapolated parihara.
   * A badge that says "settled" has to mean it.
   */
  const statusesDiffer = status !== strictStatus;
  const sideVaries =
    brideDosha.agreement === 'varies' || groomDosha.agreement === 'varies';

  const ub = brideDosha.uttaradiMath?.present, ug = groomDosha.uttaradiMath?.present;
  const uttaradiMath = brideDosha.uttaradiMath && groomDosha.uttaradiMath ? {
    status: ub && ug ? 'samya' : !ub && !ug ? 'absent' : 'one-sided',
    statement: ub && ug
      ? 'Both charts carry Mangala dosha by the Math\'s rule: "if both have Mars of equal strength in these places, there is no dosha" (equal strength is for an astrologer to confirm).'
      : !ub && !ug
        ? 'Neither chart carries Mangala dosha by the Math\'s rule (houses 1, 4, 7, 8, 12 from the lagna, after its seven pariharas).'
        : `Only the ${ub ? 'bride' : 'groom'}'s chart carries Mangala dosha by the Math's rule, which says: "if one has it and the other does not, the marriage should not be performed".`,
    authority: UM_MANGALA_SOURCE,
  } : null;

  return {
    bride: brideDosha.present,
    groom: groomDosha.present,
    uttaradiMath,
    cancelledByBoth: both,
    status,
    statement: both
      ? 'Both charts carry Mangala dosha, which cancels it (dosha samya). This is the one cancellation every school agrees on.'
      : neither
        ? 'Neither chart carries Mangala dosha.'
        : `Only the ${brideDosha.present ? 'bride' : 'groom'}'s chart carries Mangala dosha. This is the case the pariharas below are weighed against.`,
    // The 2nd-house question can flip a one-sided result to samya, so it is
    // surfaced rather than hidden behind the primary reading.
    excludingSecondHouse: {
      bride: brideDosha.presentExcludingSecond,
      groom: groomDosha.presentExcludingSecond,
      status: strictStatus,
    },
    agreement: (oneSided || statusesDiffer || sideVaries) ? 'varies' : 'settled',
    /** Why the schools differ, when they do - so the badge can say. */
    agreementReasons: [
      oneSided ? 'the dosha falls on one side only, and the authorities prescribe different remedies for that case' : null,
      statusesDiffer ? `the result changes to "${strictStatus}" under the reading that excludes the 2nd house` : null,
      sideVaries && !statusesDiffer ? 'one of the two readings rests on a contested house or an extrapolated parihara' : null,
    ].filter(Boolean),
  };
}

/* ---------------------------------------------------------- papa samya */

/**
 * Malefic load on the marriage-sensitive houses, for one chart.
 *
 * WHY THIS IS A COUNT AND NOT A SCORE. The classical practice is papa samya -
 * equalising the affliction on both sides - and several published tables
 * assign weighted "papa points" per graha per house. Those tables DISAGREE
 * with one another on the weights, and inventing or picking one would produce
 * a precise-looking number with no authority behind it. So what is returned
 * is the thing every school computes identically: which papa grahas fall in
 * which of the sensitive houses, from each of the three references. The
 * comparison is then like-for-like and the astrologer applies their own
 * weighting.
 */
const SENSITIVE_HOUSES = [1, 2, 4, 7, 8, 12];
const PAPA_GRAHAS = ['surya', 'mangala', 'shani', 'rahu', 'ketu'];

export function papaLoad(chart) {
  const byReference = {};
  for (const [label, fromRashi] of [
    ['lagna', chart.lagna.rashi],
    ['chandra', chart.chandraRashi],
    ['shukra', chart.shukraRashi],
  ]) {
    const hits = [];
    for (const graha of PAPA_GRAHAS) {
      const p = chart.positions[graha];
      const house = houseFrom(p.rashi, fromRashi);
      if (SENSITIVE_HOUSES.includes(house)) {
        hits.push({ graha, house, rashiName: p.rashiName, dignity: p.dignity });
      }
    }
    byReference[label] = { count: hits.length, grahas: hits };
  }
  const total = Object.values(byReference).reduce((s, r) => s + r.count, 0);
  return { total, byReference, houses: SENSITIVE_HOUSES, grahas: PAPA_GRAHAS };
}

export function papaSamya(brideLoad, groomLoad) {
  const diff = Math.abs(brideLoad.total - groomLoad.total);
  return {
    bride: brideLoad.total,
    groom: groomLoad.total,
    difference: diff,
    // "Balanced" is defined here as a difference of at most one placement,
    // and that threshold is OURS, stated plainly rather than presented as
    // classical - the texts require equality without quantifying tolerance.
    balanced: diff <= 1,
    threshold: 1,
    statement: diff === 0
      ? 'The malefic load is equal on both sides.'
      : `The two sides differ by ${diff} malefic placement${diff === 1 ? '' : 's'} across the three references (${brideLoad.total} for the bride, ${groomLoad.total} for the groom).`,
    caveat:
      'Counts, not weighted papa points. Published papa-point tables disagree ' +
      'on the weights, so a weighted total here would look precise without ' +
      'being authoritative. The tolerance of one placement is this engine\'s ' +
      'own, not a classical figure.',
    agreement: 'varies',
  };
}

/* ------------------------------------------------- the house of marriage */

/**
 * The 7th bhava, its lord, occupants and aspects - for one chart.
 *
 * Also the kalatra karaka. Shukra signifies the wife and Guru the husband, so
 * WHICH karaka matters depends on the person's role in the marriage; both are
 * returned with a note, rather than the function trying to infer gender.
 */
export function seventhHouse(chart) {
  const seventhRashi = ((chart.lagna.rashi + 6 - 1) % 12) + 1;
  const lord = RASHI_LORD[seventhRashi - 1];
  const lordPos = chart.positions[lord];

  const occupants = occupantsOf(chart, 7).map(summarise);
  const aspects = aspectsOnHouse(chart, 7);

  // The same questions in the navamsa, which is the varga of marriage - a 7th
  // house that is afflicted in the rashi chart but clean in the D9 is a
  // materially different reading, and vice versa.
  const navamsaSeventh = ((chart.lagna.navamsa + 6 - 1) % 12) + 1;
  const navamsaOccupants = GRAHAS
    .filter((g) => chart.positions[g].navamsa === navamsaSeventh)
    .map((g) => summarise(chart.positions[g]));

  return {
    rashi: seventhRashi,
    rashiName: RASHIS[seventhRashi - 1],
    quality: RASHI_QUALITY[seventhRashi - 1],
    lord: {
      graha: lord,
      rashiName: lordPos.rashiName,
      house: lordPos.house,
      dignity: lordPos.dignity,
      retrograde: lordPos.retrograde,
      navamsaName: lordPos.navamsaName,
    },
    occupants,
    aspects: aspects.map((a) => ({ ...a, nature: a.nature })),
    maleficAspects: aspects.filter((a) => a.nature === 'malefic').length,
    beneficAspects: aspects.filter((a) => a.nature === 'benefic').length,
    navamsa: {
      rashi: navamsaSeventh,
      rashiName: RASHIS[navamsaSeventh - 1],
      occupants: navamsaOccupants,
      note: 'The navamsa is the varga of marriage; the rashi chart alone is an incomplete reading of the 7th.',
    },
    karakas: {
      shukra: summarise(chart.positions.shukra),
      guru: summarise(chart.positions.guru),
      note: 'Shukra is the kalatra karaka (signifying the wife) and Guru the pati karaka (the husband). Which applies depends on the role in the marriage, so both are given.',
    },
    drishtiConvention: NODE_DRISHTI_NOTE,
  };
}

/**
 * A graha reduced to what a reading or a drawn chart needs.
 *
 * Carries the rashi and navamsa INDICES as well as their names. A kundali is
 * drawn by placing each graha in a numbered box, so a summary that gives only
 * "Vrishabha" forces the renderer to map names back to numbers - a lookup
 * that exists solely because the number was thrown away here.
 */
function summarise(p) {
  return {
    graha: p.graha,
    rashi: p.rashi, rashiName: p.rashiName,
    degreeInRashi: p.degreeInRashi,
    house: p.house,
    dignity: p.dignity, retrograde: p.retrograde,
    navamsa: p.navamsa, navamsaName: p.navamsaName,
    nature: p.nature,
  };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ------------------------------------------------- the whole assessment */

/**
 * Everything the engine can say about a pairing, given two full charts.
 *
 * Takes CHARTS, not nakshatra numbers. That is the whole point of this
 * module: the kuta layer needs only two nakshatras, which is why it was the
 * only analysis the API could offer while /match accepted nothing else. The
 * 7th house, Mangala dosha and the malefic balance all need the birth time
 * and place, so they need charts.
 *
 * There is no overall verdict and no combined percentage. Each section
 * carries its own `agreement` field, and the sections genuinely disagree in
 * kind - a kuta total and a Mangala reading are not commensurable, and
 * averaging them would invent a quantity no tradition recognises.
 */
export function deepCompatibility({ brideChart, groomChart, kutas }) {
  const brideMangala = mangalaDosha(brideChart);
  const groomMangala = mangalaDosha(groomChart);
  const bridePapa = papaLoad(brideChart);
  const groomPapa = papaLoad(groomChart);

  return {
    mangala: {
      bride: brideMangala,
      groom: groomMangala,
      comparison: mangalaComparison(brideMangala, groomMangala),
    },
    papaSamya: {
      bride: bridePapa,
      groom: groomPapa,
      comparison: papaSamya(bridePapa, groomPapa),
    },
    seventhHouse: {
      bride: seventhHouse(brideChart),
      groom: seventhHouse(groomChart),
    },
    charts: {
      bride: chartSummary(brideChart),
      groom: chartSummary(groomChart),
    },
    kutas: kutas ?? null,
    disclaimer:
      'Every section above is a computed position plus a classical rule, with ' +
      'the rule\'s authority and the degree of agreement between schools ' +
      'stated. Where authorities differ, both readings are given rather than ' +
      'one being chosen. Nothing here is a prediction about a particular ' +
      'marriage, and the engine deliberately returns no overall verdict.',
  };
}

/** The chart, reduced to what a compatibility reading needs to show. */
export function chartSummary(chart) {
  return {
    lagna: chart.lagna,
    paksha: chart.paksha,
    positions: GRAHAS.map((g) => summarise(chart.positions[g])),
  };
}
