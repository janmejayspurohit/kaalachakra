/**
 * The five angas, with end-times.
 *
 * The value of an anga at sunrise is trivial arithmetic. What a real panchanga
 * prints - and what every observance depends on - is the MOMENT each one ends.
 * That is what this module is actually for.
 *
 * Two structural facts drive the design:
 *
 *  - Tithi and karana come from (moon - sun), so the ayanamsa CANCELS. They are
 *    ayanamsa-invariant. Nakshatra and yoga use sidereal longitudes and are
 *    ayanamsa-DEPENDENT. Choosing an ayanamsa can never change a tithi but can
 *    flip a nakshatra at a boundary.
 *  - An anga can be SKIPPED (kshaya) or REPEATED (vriddhi) within one day.
 *    A panchanga that ignores this is wrong roughly monthly.
 */
import { norm360, unwrapAngles, inverseLagrange } from './angles.js';
import { lunarPhase, panchangaSun, panchangaMoon } from './ephemeris.js';

export const TITHI_ARC = 12;          // 360 / 30
export const KARANA_ARC = 6;          // 360 / 60
export const NAKSHATRA_ARC = 360 / 27; // 13 deg 20 min
export const YOGA_ARC = 360 / 27;

/**
 * Sample offsets in days used for end-time interpolation.
 *
 * The window must outlast the longest anga measured from sunrise: a tithi can
 * run ~26.8 h, a nakshatra ~27.2 h (Moon at its slowest), a yoga ~25 h. A
 * one-day window returned a null end on ~3% of tithis and ~4% of nakshatras
 * across 1900-2200 - exactly the vriddhi days, where the end time (printed
 * past 24:00) is what the reader needs. 1.25 days covers all of them; against
 * exact bisection the interpolation stays within milliseconds.
 */
const SAMPLE_OFFSETS = [0, 0.3125, 0.625, 0.9375, 1.25];

/**
 * Find when a monotonically increasing angular quantity reaches `target`.
 *
 * `valueAt(jd)` must return the raw (wrapped) angle. We sample, unwrap across
 * the 360 seam, then invert. Returns null if the target is not bracketed by
 * the samples, which is how a caller learns the event is not in this window -
 * far better than extrapolating off the end of the polynomial.
 */
function solveCrossing(jdStart, valueAt, target, offsets = SAMPLE_OFFSETS) {
  const x = offsets.map((o) => jdStart + o);
  const raw = x.map(valueAt);
  const y = unwrapAngles(raw);

  // Lift the target into the same unwrapped frame as y[0].
  let t = target;
  while (t < y[0]) t += 360;

  if (t > y[y.length - 1]) return null; // not reached within the window
  return inverseLagrange(x, y, t);
}

/* ------------------------------------------------------------------ tithi */

/**
 * Tithi at `jdUt`, with its end time.
 *
 * index is 1..30. 15 = Purnima, 30 = Amavasya.
 * paksha: shukla for 1..15, krishna for 16..30.
 */
export function tithi(jdUt) {
  const phase = lunarPhase(jdUt);
  const index = Math.floor(phase / TITHI_ARC) + 1;
  const target = index * TITHI_ARC;

  const endJd = solveCrossing(jdUt, (j) => lunarPhase(j), target % 360);

  return {
    index,
    paksha: index <= 15 ? 'shukla' : 'krishna',
    numberInPaksha: index <= 15 ? index : index - 15,
    // Index 15 is Purnima and index 30 is AMAVASYA - they are not the same
    // name. A bare `TITHI_NAMES[(index-1) % 15]` labels index 30 "Purnima",
    // which is wrong by half a month and was caught while deriving the
    // aradhana table: Purandara Dasa's aradhana is Pushya Amavasya and came
    // out labelled "Pushya Purnima".
    name: index === 30 ? 'Amavasya' : TITHI_NAMES[(index - 1) % 15],
    isPurnima: index === 15,
    isAmavasya: index === 30,
    elongation: phase,
    degreesRemaining: target - phase,
    endJd,
  };
}

/* ----------------------------------------------------------------- karana */

/**
 * Karana - half a tithi, 6 degrees of elongation.
 *
 * There are 60 karana slots per lunar month but only 11 names: 7 movable
 * (chara) repeating 8 times, and 4 fixed (sthira) that occur once each. The
 * mapping is positional, not modular, which is why it needs the table below
 * rather than an index % 7.
 */
export function karana(jdUt) {
  const phase = lunarPhase(jdUt);
  const slot = Math.floor(phase / KARANA_ARC) + 1; // 1..60
  const target = slot * KARANA_ARC;
  const endJd = solveCrossing(jdUt, (j) => lunarPhase(j), target % 360);

  return {
    slot,
    name: karanaName(slot),
    isFixed: FIXED_KARANA_SLOTS.has(slot),
    degreesRemaining: target - phase,
    endJd,
  };
}

const CHARA_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
const FIXED_KARANA_SLOTS = new Map([
  [1, 'Kimstughna'],
  [58, 'Shakuni'],
  [59, 'Chatushpada'],
  [60, 'Naga'],
]);

function karanaName(slot) {
  if (FIXED_KARANA_SLOTS.has(slot)) return FIXED_KARANA_SLOTS.get(slot);
  // Slots 2..57 are the seven movable karanas cycling eight times.
  return CHARA_KARANAS[(slot - 2) % 7];
}

/* -------------------------------------------------------------- nakshatra */

/**
 * Nakshatra of the Moon, with pada and end time.
 * AYANAMSA-DEPENDENT: a different ayanamsa can shift the boundary by ~2 min.
 */
export function nakshatra(jdUt, ayanamsaName) {
  const lon = panchangaMoon(jdUt, ayanamsaName);
  const index = Math.floor(lon / NAKSHATRA_ARC) + 1; // 1..27
  const target = index * NAKSHATRA_ARC;

  const within = lon - (index - 1) * NAKSHATRA_ARC;
  const pada = Math.floor(within / (NAKSHATRA_ARC / 4)) + 1; // 1..4

  const endJd = solveCrossing(
    jdUt,
    (j) => panchangaMoon(j, ayanamsaName),
    target % 360
  );

  return {
    index,
    name: NAKSHATRA_NAMES[index - 1],
    pada,
    longitude: lon,
    degreesRemaining: target - lon,
    endJd,
  };
}

/* ------------------------------------------------------------------- yoga */

/**
 * Yoga - the 27-fold division of (sidereal sun + sidereal moon).
 * AYANAMSA-DEPENDENT.
 */
export function yoga(jdUt, ayanamsaName) {
  const sum = yogaSum(jdUt, ayanamsaName);
  const index = Math.floor(sum / YOGA_ARC) + 1;
  const target = index * YOGA_ARC;

  const endJd = solveCrossing(jdUt, (j) => yogaSum(j, ayanamsaName), target % 360);

  return {
    index,
    name: YOGA_NAMES[index - 1],
    degreesRemaining: target - sum,
    endJd,
  };
}

function yogaSum(jdUt, ayanamsaName) {
  const s = panchangaSun(jdUt, ayanamsaName);
  const m = panchangaMoon(jdUt, ayanamsaName);
  return norm360(s + m);
}

/* ------------------------------------------------------------------- vara */

/**
 * Vara (weekday). The Hindu day runs SUNRISE TO SUNRISE, not midnight to
 * midnight - so the vara is determined by the sunrise that opened the current
 * day, never by the calendar date of a timestamp.
 */
export const VARA_NAMES = [
  'Ravivara', 'Somavara', 'Mangalavara', 'Budhavara',
  'Guruvara', 'Shukravara', 'Shanivara',
];

export function vara(sunriseJd, tzOffsetHours) {
  // The weekday belongs to the LOCAL civil date of the sunrise, so the offset
  // is required. Taking it from the UT date instead was a real bug: any
  // sunrise earlier than the zone's offset falls on the previous UT day, which
  // gave the wrong vara - and so the wrong Rahu Kala, Gulika, Yamaganda and
  // horas - on 59% of days at Guwahati, 48% at Kolkata, 9% at Delhi and 100%
  // at Tokyo or Sydney, while Bengaluru (sunrise always after 05:30 IST)
  // happened to be unaffected, which is why it went unnoticed.
  if (!Number.isFinite(tzOffsetHours)) {
    throw new TypeError(`vara needs the local tzOffsetHours, got ${tzOffsetHours}`);
  }
  // JD 0.0 is a Monday noon; +1.5 puts the day boundary at midnight and shifts
  // the origin to Sunday, matching the conventional weekday indexing.
  const index = Math.floor(sunriseJd + tzOffsetHours / 24 + 1.5) % 7;
  return { index, name: VARA_NAMES[index] };
}

/* ------------------------------------------------------- skipped/repeated */

/**
 * Detect kshaya (skipped) and vriddhi (repeated) angas across one solar day.
 *
 * If the index at tomorrow's sunrise is more than one ahead of today's, an
 * entire anga began and ended between the two sunrises and never touched
 * either - it is skipped. If the index is unchanged, the same anga spans both
 * sunrises and is repeated.
 */
export function angaTransitions(indexToday, indexTomorrow, total) {
  const fwd = (indexTomorrow - indexToday + total) % total;
  return {
    skipped: fwd > 1,
    repeated: fwd === 0,
    advanced: fwd,
  };
}

/* ----------------------------------------------------------------- tables */

export const TITHI_NAMES = [
  'Prathama', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashti', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima',
];

export const NAKSHATRA_NAMES = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni',
  'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha',
  'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana',
  'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

export const YOGA_NAMES = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda',
  'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata',
  'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva',
  'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];

export const RASHI_NAMES = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
];
