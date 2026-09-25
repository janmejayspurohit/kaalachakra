/**
 * The natal chart (janma kundali) as a set of FACTS.
 *
 * Everything here is computed and checkable: where each graha sits, which
 * bhava it falls in counted from a given reference, its navamsa, whether it is
 * in its own sign or exalted, and what aspects it throws. No interpretation
 * lives in this file - that belongs in compatibility.js, where each rule can
 * carry its source, because the rules are where the schools disagree and the
 * positions are where they do not.
 *
 * HOUSES ARE WHOLE-SIGN (rashi chakra), which is the reckoning South Indian
 * and Madhwa practice uses for graha placement: the sign the lagna falls in IS
 * the first house, entire. This is deliberately NOT the Placidus cusp system
 * the /panchanga route's `houses()` returns - that is used only for the
 * ascendant degree. Mixing the two is a classic way to move a planet a whole
 * bhava.
 */
import { houses, siderealLongitude, panchangaSun, panchangaMoon, ganita, swe } from './ephemeris.js';
import { norm360 } from './angles.js';

export const RASHIS = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
];

/** Lords of the twelve rashis, 1-indexed by rashi. */
export const RASHI_LORD = [
  'mangala', 'shukra', 'budha', 'chandra', 'surya', 'budha',
  'shukra', 'mangala', 'guru', 'shani', 'shani', 'guru',
];

/**
 * Sign qualities. Chara = movable, sthira = fixed, dwisvabhava = dual.
 * Used by several parihara rules, which are stated in these terms.
 */
export const RASHI_QUALITY = [
  'chara', 'sthira', 'dwisvabhava', 'chara', 'sthira', 'dwisvabhava',
  'chara', 'sthira', 'dwisvabhava', 'chara', 'sthira', 'dwisvabhava',
];

/** The grahas, in the traditional order. Rahu and Ketu are chhaya grahas. */
export const GRAHAS = [
  'surya', 'chandra', 'mangala', 'budha', 'guru', 'shukra', 'shani', 'rahu', 'ketu',
];

/**
 * Natural malefics (papa grahas) and benefics (shubha grahas).
 *
 * Budha and Chandra are conditional in classical texts - Budha takes the
 * nature of its associates, and Chandra is benefic when waxing and malefic
 * when deeply waning. Both are therefore reported as 'conditional' rather than
 * forced into a column, and the waxing/waning state of Chandra is computed so
 * a caller can decide.
 */
export const NATURAL_NATURE = {
  surya: 'malefic', mangala: 'malefic', shani: 'malefic',
  rahu: 'malefic', ketu: 'malefic',
  guru: 'benefic', shukra: 'benefic',
  budha: 'conditional', chandra: 'conditional',
};

/** Own signs (swakshetra), 1-indexed rashi numbers. */
const OWN_SIGNS = {
  surya: [5], chandra: [4], mangala: [1, 8], budha: [3, 6],
  guru: [9, 12], shukra: [2, 7], shani: [10, 11],
};

/** Exaltation (uccha) and debilitation (neecha) signs. */
const UCCHA = {
  surya: 1, chandra: 2, mangala: 10, budha: 6, guru: 4, shukra: 12, shani: 7,
};
const NEECHA = {
  surya: 7, chandra: 8, mangala: 4, budha: 12, guru: 10, shukra: 6, shani: 1,
};

/**
 * Special aspects (graha drishti), as house counts forward from the graha.
 *
 * Every graha aspects the 7th. Mangala additionally aspects the 4th and 8th,
 * Guru the 5th and 9th, Shani the 3rd and 10th. Rahu and Ketu are given the
 * 5th, 7th and 9th, which is the commonly followed convention but NOT
 * universal - several authorities give the nodes no drishti of their own. The
 * convention used is reported alongside the result rather than assumed.
 */
const SPECIAL_DRISHTI = {
  mangala: [4, 7, 8],
  guru: [5, 7, 9],
  shani: [3, 7, 10],
  rahu: [5, 7, 9],
  ketu: [5, 7, 9],
};
const DEFAULT_DRISHTI = [7];

export const NODE_DRISHTI_NOTE =
  'Rahu and Ketu are given 5th/7th/9th drishti here. This is the common ' +
  'convention but not universal - several authorities give the nodes no ' +
  'drishti of their own.';

/** 1-indexed rashi of a sidereal longitude. */
export const rashiOfLongitude = (lon) => Math.floor(norm360(lon) / 30) + 1;

/**
 * Navamsa (D9) rashi of a sidereal longitude.
 *
 * The zodiac holds 108 navamsas of 3 degrees 20 minutes. Numbering them from
 * 0 degrees Mesha and taking the result modulo 12 reproduces the classical
 * chara/sthira/dwisvabhava starting rule exactly - a movable sign's navamsas
 * begin at itself, a fixed sign's at the 9th from it, a dual sign's at the
 * 5th - so the rule does not need to be written out and cannot be mis-stated.
 */
export const navamsaOfLongitude = (lon) =>
  (Math.floor(norm360(lon) / (30 / 9)) % 12) + 1;

/** Whole-sign house of `rashi` counted from `fromRashi`, 1..12. */
export const houseFrom = (rashi, fromRashi) =>
  ((rashi - fromRashi + 12) % 12) + 1;

/** Dignity of a graha in a rashi. Chhaya grahas have no classical dignity. */
function dignityOf(graha, rashi) {
  if (graha === 'rahu' || graha === 'ketu') return null;
  if (UCCHA[graha] === rashi) return 'uccha';
  if (NEECHA[graha] === rashi) return 'neecha';
  if (OWN_SIGNS[graha]?.includes(rashi)) return 'swakshetra';
  return null;
}

/** The houses a graha aspects, counted from wherever it sits. */
export function drishtiOf(graha) {
  return SPECIAL_DRISHTI[graha] ?? DEFAULT_DRISHTI;
}

const SE_BODY = {
  surya: 'SE_SUN', chandra: 'SE_MOON', mangala: 'SE_MARS', budha: 'SE_MERCURY',
  guru: 'SE_JUPITER', shukra: 'SE_VENUS', shani: 'SE_SATURN',
};

/**
 * Build a natal chart.
 *
 * `place` must carry latitude, longitude and tzOffsetHours - the ascendant is
 * the one element that genuinely depends on the birthplace and the minute, so
 * a chart built without a real place is not a chart.
 */
export function natalChart(birthJdUt, place, ayanamsaName, { nodeType = 'mean' } = {}) {
  if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
    throw new TypeError('natalChart needs a place with latitude and longitude');
  }

  // Only the ascendant is taken from here, and the ascendant does not depend
  // on the house system. Whole-sign ('W') is asked for because it is defined
  // at every latitude; the default Placidus is undefined inside the polar
  // circles, and made every chart for a birth north of ~66 deg (Tromso,
  // Murmansk, northern Alaska) fail with a 500.
  const h = houses(birthJdUt, place, ayanamsaName, 'W');
  const lagnaLongitude = norm360(h.ascendant);
  const lagnaRashi = rashiOfLongitude(lagnaLongitude);

  // SURYA AND CHANDRA follow the active ganita; the tara-grahas and the nodes
  // are drik. This is Sri Uttaradi Math's own mix, MEASURED, not assumed:
  //  - its sankrantis match the Surya Siddhanta Sun to minutes, and its
  //    nakshatras the Surya Siddhanta Moon (98% of 5,597 grid days);
  //  - its 652 printed planetary ingresses (2025-27) track the modern
  //    ephemeris with a Lahiri-type ayanamsa (implied 24.15-24.33 deg for
  //    Rahu, Guru, Shani), about a day later than the exact instant, while
  //    the Siddhanta's own planets (suryasiddhanta.js planetLongitude) miss
  //    them by 0.9-7 deg - Guru's 2026 Karka ingress by 20 days.
  // So under Surya Siddhanta the kundali's Sun and Moon agree with the janma
  // rashi and nakshatra, and the other grahas stay where the Math puts them.
  const positions = {};
  for (const [graha, key] of Object.entries(SE_BODY)) {
    const p = siderealLongitude(birthJdUt, swe[key], ayanamsaName);
    let lon = p.longitude;
    if (graha === 'surya') lon = panchangaSun(birthJdUt, ayanamsaName);
    if (graha === 'chandra') lon = panchangaMoon(birthJdUt, ayanamsaName);
    positions[graha] = makeGraha(graha, lon, p.speed, lagnaRashi);
  }

  // The nodes are always exactly opposite, so Ketu is derived rather than
  // queried - asking the ephemeris twice would invite them to disagree.
  const rahuLon = norm360(nodeLongitude(birthJdUt, ayanamsaName, nodeType));
  positions.rahu = makeGraha('rahu', rahuLon, -1, lagnaRashi);
  positions.ketu = makeGraha('ketu', norm360(rahuLon + 180), -1, lagnaRashi);

  // Chandra waxing or waning decides whether it counts as a benefic. Measured
  // by elongation from Surya rather than by tithi, so it does not depend on
  // the panchanga layer.
  const elongation = norm360(positions.chandra.longitude - positions.surya.longitude);
  const paksha = elongation < 180 ? 'shukla' : 'krishna';

  return {
    jdUt: birthJdUt,
    ayanamsa: ayanamsaName,
    ganita: ganita(),
    lagna: {
      longitude: lagnaLongitude,
      rashi: lagnaRashi,
      rashiName: RASHIS[lagnaRashi - 1],
      lord: RASHI_LORD[lagnaRashi - 1],
      navamsa: navamsaOfLongitude(lagnaLongitude),
      quality: RASHI_QUALITY[lagnaRashi - 1],
    },
    positions,
    chandraRashi: positions.chandra.rashi,
    shukraRashi: positions.shukra.rashi,
    paksha,
    // Chandra is benefic when waxing and increasingly malefic as it wanes to
    // new moon; the elongation is reported so a rule can apply its own cutoff
    // rather than inheriting one chosen here.
    chandraElongation: elongation,
  };
}

function makeGraha(graha, longitude, speed, lagnaRashi) {
  const lon = norm360(longitude);
  const rashi = rashiOfLongitude(lon);
  return {
    graha,
    longitude: lon,
    degreeInRashi: lon % 30,
    rashi,
    rashiName: RASHIS[rashi - 1],
    navamsa: navamsaOfLongitude(lon),
    navamsaName: RASHIS[navamsaOfLongitude(lon) - 1],
    house: houseFrom(rashi, lagnaRashi),
    dignity: dignityOf(graha, rashi),
    retrograde: speed < 0,
    nature: NATURAL_NATURE[graha],
  };
}

function nodeLongitude(jdUt, ayanamsaName, nodeType) {
  const body = nodeType === 'true' ? swe.SE_TRUE_NODE : swe.SE_MEAN_NODE;
  return siderealLongitude(jdUt, body, ayanamsaName).longitude;
}

/**
 * Which grahas aspect a given house, counted from a reference rashi.
 *
 * Returns the aspecting graha names with the drishti that reaches - useful
 * for "what falls on the 7th", which is the question every marriage reading
 * starts from.
 */
export function aspectsOnHouse(chart, house, fromRashi = chart.lagna.rashi) {
  const out = [];
  for (const graha of GRAHAS) {
    const p = chart.positions[graha];
    const its = houseFrom(p.rashi, fromRashi);
    for (const d of drishtiOf(graha)) {
      if (aspectedHouse(its, d) === house) {
        out.push({ graha, drishti: d, nature: p.nature, from: its });
        break;
      }
    }
  }
  return out;
}

/**
 * The house a graha in `fromHouse` reaches with a drishti of `d`.
 *
 * Drishti counts INCLUSIVELY from the occupied house, as classical reckoning
 * does: a graha in the 1st casts its 7th on the 7th, not the 8th. Written
 * once, here, because getting the fencepost wrong moves every aspect in the
 * chart by one bhava and still looks plausible.
 */
export const aspectedHouse = (fromHouse, d) => ((fromHouse + d - 2) % 12) + 1;

/** Does `graha` aspect the rashi `targetRashi` sits in? */
export function aspectsRashi(chart, graha, targetRashi) {
  const p = chart.positions[graha];
  return drishtiOf(graha).includes(houseFrom(targetRashi, p.rashi));
}

/** The grahas sitting in a given house, counted from a reference rashi. */
export function occupantsOf(chart, house, fromRashi = chart.lagna.rashi) {
  return GRAHAS
    .filter((g) => houseFrom(chart.positions[g].rashi, fromRashi) === house)
    .map((g) => chart.positions[g]);
}
