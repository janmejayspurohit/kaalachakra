/**
 * The ganita layer's only door to Swiss Ephemeris.
 *
 * Nothing else in this package may import @kaalachakra/swisseph directly. That
 * keeps two promises:
 *   1. The ayanamsa rule (always `swe_get_ayanamsa_ex_ut`, never the plain
 *      form - see docs/decisions.md ADR-002) is enforced in one place.
 *   2. A second longitude provider - Surya Siddhanta, for the Raghavendra
 *      Mutt ganita profile - can be slotted in behind this interface without
 *      touching the panchanga code.
 */
import swe, {
  AYANAMSA,
  VEDIC_RISE,
  VEDIC_SET,
  assertInEphemerisRange,
} from '@kaalachakra/swisseph';
import { norm360 } from './angles.js';
import * as SS from './suryasiddhanta.js';

export const BASE_FLAGS = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;

/** Graha names follow sudhyk's coreserver vocabulary. */
export const GRAHA = Object.freeze({
  surya: swe.SE_SUN,
  chandra: swe.SE_MOON,
  mangala: swe.SE_MARS,
  budha: swe.SE_MERCURY,
  guru: swe.SE_JUPITER,
  shukra: swe.SE_VENUS,
  shani: swe.SE_SATURN,
  // rahu/ketu are the lunar nodes and are handled separately
  prajapati: swe.SE_URANUS,
  varuna: swe.SE_NEPTUNE,
  yama: swe.SE_PLUTO,
});

export const AYANAMSA_NAMES = Object.freeze(Object.keys(AYANAMSA));

/** Resolve an ayanamsa name to its Swiss Ephemeris sidereal mode. */
export function resolveAyanamsa(name) {
  if (!(name in AYANAMSA)) {
    throw new RangeError(
      `unknown ayanamsa "${name}". Known: ${AYANAMSA_NAMES.join(', ')}`
    );
  }
  return AYANAMSA[name];
}

/**
 * Swiss Ephemeris keeps the sidereal mode as process-global state. Every entry
 * point therefore sets it explicitly rather than trusting whatever ran last -
 * a stale mode would silently produce results under the wrong ayanamsa, which
 * is precisely the class of error we cannot allow.
 */
function applyAyanamsa(ayanamsaName) {
  swe.swe_set_sid_mode(resolveAyanamsa(ayanamsaName), 0, 0);
}

/**
 * The ayanamsa in degrees.
 *
 * ALWAYS `swe_get_ayanamsa_ex_ut`. The plain `swe_get_ayanamsa_ut` omits the
 * nutation in longitude and disagrees with the published almanac tables by up
 * to ~17 arcseconds. Measured at J2000: ex_ut 23.853222 vs published Lahiri
 * 23.85306 (0.6" match); plain ut gives 23.857092 (14.5" off). See ADR-002.
 */
export function ayanamsa(jdUt, ayanamsaName) {
  assertInEphemerisRange(jdUt);
  applyAyanamsa(ayanamsaName);
  const r = swe.swe_get_ayanamsa_ex_ut(jdUt, BASE_FLAGS);
  if (r.error) throw new Error(`ayanamsa failed: ${r.error}`);
  return r.ayanamsa;
}

/**
 * Sidereal (nirayana) longitude of a body, in degrees.
 *
 * Uses SEFLG_SIDEREAL rather than subtracting the ayanamsa by hand, because
 * Swiss Ephemeris handles the nutation bookkeeping internally and the two
 * routes differ. Verified equal to `apparent_tropical - ayanamsa_ex_ut` to
 * 1e-6 deg in packages/swisseph/test/accuracy.test.js.
 */
export function siderealLongitude(jdUt, body, ayanamsaName) {
  assertInEphemerisRange(jdUt);
  applyAyanamsa(ayanamsaName);
  const r = swe.swe_calc_ut(jdUt, body, BASE_FLAGS | swe.SEFLG_SIDEREAL);
  if (r.error) throw new Error(`swe_calc_ut failed for body ${body}: ${r.error}`);
  return { longitude: norm360(r.longitude), speed: r.longitudeSpeed, distance: r.distance };
}

/** Tropical (sayana) longitude - needed for tithi/karana, where ayanamsa cancels. */
export function tropicalLongitude(jdUt, body) {
  assertInEphemerisRange(jdUt);
  const r = swe.swe_calc_ut(jdUt, body, BASE_FLAGS);
  if (r.error) throw new Error(`swe_calc_ut failed for body ${body}: ${r.error}`);
  return { longitude: norm360(r.longitude), speed: r.longitudeSpeed, distance: r.distance };
}

/**
 * Sun and Moon tropical longitudes in one call.
 *
 * Tithi, karana and the lunar phase all derive from (moon - sun), where the
 * ayanamsa cancels exactly. Computing those from sidereal values would be
 * correct but needlessly couples them to an ayanamsa choice they do not have.
 */
export function sunMoon(jdUt) {
  return {
    sun: tropicalLongitude(jdUt, swe.SE_SUN),
    moon: tropicalLongitude(jdUt, swe.SE_MOON),
  };
}

/* ------------------------------------------------------------- ganita */

/**
 * Which ganita computes the PANCHANGA Sun and Moon.
 *
 *   'surya' - Surya Siddhanta (the Uttaradi Math's own ganita; the default)
 *   'drik'  - Swiss Ephemeris, the modern observational positions
 *
 * Only the panchanga quantities switch: tithi, karana, nakshatra, yoga,
 * masa, sankranti and everything decided from them (Ekadashi, aradhana,
 * muhurta). Birth charts - planets and lagna - always use the drik
 * ephemeris, because the Siddhanta's planetary theory is not implemented
 * and a chart must be drawn in one frame.
 *
 * Held as module state and set per call by withGanita(), which restores the
 * previous value in `finally`. Safe because every engine computation is
 * synchronous: nothing can interleave between set and restore.
 */
export const GANITAS = Object.freeze(['surya', 'drik']);
export const DEFAULT_GANITA = 'surya';
let currentGanita = DEFAULT_GANITA;

export function resolveGanita(name) {
  const g = name ?? DEFAULT_GANITA;
  if (!GANITAS.includes(g)) {
    throw new RangeError(`unknown ganita "${name}". Known: ${GANITAS.join(', ')}`);
  }
  return g;
}

/** Run `fn` with the given ganita in force, restoring the previous one after. */
export function withGanita(name, fn) {
  const g = resolveGanita(name);
  const previous = currentGanita;
  currentGanita = g;
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      throw new TypeError('withGanita: fn must be synchronous; an async body would leak the ganita');
    }
    return r;
  } finally {
    currentGanita = previous;
  }
}

export const ganita = () => currentGanita;

/**
 * Set the ganita for the rest of the process. FOR TEST SUITES ONLY: the
 * suites written and validated against drik sources pin drik this way so
 * their published-date assertions keep meaning what they say. Production
 * code must use withGanita().
 */
export function setProcessGanita(name) {
  currentGanita = resolveGanita(name);
}

/**
 * Sidereal longitude of the Sun for PANCHANGA use, in the active ganita.
 * Surya Siddhanta longitudes are sidereal in the Siddhanta's own frame, so
 * `ayanamsaName` applies only to drik.
 */
export function panchangaSun(jdUt, ayanamsaName) {
  if (currentGanita === 'surya') return SS.solarLongitude(SS.ujjainFromUt(jdUt));
  return siderealLongitude(jdUt, swe.SE_SUN, ayanamsaName).longitude;
}

/** Sidereal longitude of the Moon for PANCHANGA use, in the active ganita. */
export function panchangaMoon(jdUt, ayanamsaName) {
  if (currentGanita === 'surya') return SS.lunarLongitude(SS.ujjainFromUt(jdUt));
  return siderealLongitude(jdUt, swe.SE_MOON, ayanamsaName).longitude;
}

/** Elongation (moon - sun) in [0, 360) - the quantity behind tithi and karana. */
export function lunarPhase(jdUt) {
  if (currentGanita === 'surya') return SS.lunarPhase(SS.ujjainFromUt(jdUt));
  const { sun, moon } = sunMoon(jdUt);
  return norm360(moon.longitude - sun.longitude);
}

/**
 * Rahu (mean or true node) and Ketu, sidereal.
 * Ketu is always exactly opposite Rahu.
 */
export function nodes(jdUt, ayanamsaName, nodeType = 'mean') {
  assertInEphemerisRange(jdUt);
  applyAyanamsa(ayanamsaName);
  const body = nodeType === 'true' ? swe.SE_TRUE_NODE : swe.SE_MEAN_NODE;
  const r = swe.swe_calc_ut(jdUt, body, BASE_FLAGS | swe.SEFLG_SIDEREAL);
  if (r.error) throw new Error(`node calculation failed: ${r.error}`);
  const rahu = norm360(r.longitude);
  return {
    rahu: { longitude: rahu, speed: r.longitudeSpeed },
    ketu: { longitude: norm360(rahu + 180), speed: r.longitudeSpeed },
  };
}

/**
 * Vedic sunrise, as a Julian day (UT).
 *
 * Flags follow sudhyk's coreserver: disc centre, NO refraction, geocentric
 * with no ecliptic latitude. This differs from the common disc-centre-only
 * convention by 2-4 minutes. Sunrise fixes both the vara boundary and the
 * tithi-at-sunrise, so it decides the whole day's panchanga - including
 * whether a day IS Ekadashi. Do not change without re-baselining fixtures.
 *
 * Returns null when the event does not occur (polar day/night) rather than a
 * meaningless time.
 */
export function sunrise(jdUt, place) {
  return riseTrans(jdUt, swe.SE_SUN, VEDIC_RISE, place);
}

export function sunset(jdUt, place) {
  return riseTrans(jdUt, swe.SE_SUN, VEDIC_SET, place);
}

export function moonrise(jdUt, place) {
  return riseTrans(jdUt, swe.SE_MOON, VEDIC_RISE, place);
}

export function moonset(jdUt, place) {
  return riseTrans(jdUt, swe.SE_MOON, VEDIC_SET, place);
}

/**
 * Rise/set convention per ganita.
 *
 * 'surya' (Uttaradi Math reckoning) uses the CONVENTIONAL sunrise - upper
 * limb, standard refraction - because that is what the Math's own editions
 * print: 228 of 252 printed sunrise times (8 cities, 2026-27) match it within
 * 2 minutes, the rest being the editions' own DST slips. The Vedic set (disc
 * centre, no refraction) runs a median 4.7 minutes late against them, and
 * the Siddhanta's computed sunrise 7 minutes early.
 *
 * 'drik' keeps sudhyk's Vedic flags, with which that mode was validated.
 */
function riseFlags(flags) {
  if (currentGanita !== 'surya') return flags;
  return (flags & swe.SE_CALC_SET) ? swe.SE_CALC_SET : swe.SE_CALC_RISE;
}

export function sunriseConvention() {
  return currentGanita === 'surya'
    ? 'conventional:upper-limb,refraction (as printed by Sri Uttaradi Math)'
    : 'vedic:disc-center,no-refraction,geocentric-no-ecl-lat';
}

function riseTrans(jdUt, body, flags, place) {
  assertInEphemerisRange(jdUt);
  flags = riseFlags(flags);
  const r = swe.swe_rise_trans(
    jdUt, body, swe.SEFLG_SWIEPH, flags,
    place.longitude, place.latitude, place.altitude ?? 0
  );
  if (r.error) return null;
  return r.transitTime;
}

/**
 * Tropical ascendant (degrees). The muhurta layer subtracts its own
 * ayanamsa, because under Surya Siddhanta reckoning the Math's lagnas use
 * the Siddhantic ayanamsa rather than any of the Swiss Ephemeris modes.
 * Whole-sign is requested only because it is defined at every latitude; the
 * ascendant itself does not depend on the house system.
 */
export function tropicalAscendant(jdUt, place) {
  assertInEphemerisRange(jdUt);
  const r = swe.swe_houses_ex(jdUt, BASE_FLAGS, place.latitude, place.longitude, 'W'.charCodeAt(0));
  if (r.error) throw new Error(`swe_houses_ex failed: ${r.error}`);
  return norm360(r.ascendant);
}

/** House cusps and the ascendant, sidereal. */
export function houses(jdUt, place, ayanamsaName, system = 'P') {
  assertInEphemerisRange(jdUt);
  applyAyanamsa(ayanamsaName);
  const r = swe.swe_houses_ex(
    jdUt, BASE_FLAGS | swe.SEFLG_SIDEREAL,
    place.latitude, place.longitude, system.charCodeAt(0)
  );
  if (r.error) throw new Error(`swe_houses_ex failed: ${r.error}`);
  return r;
}

export { swe, assertInEphemerisRange };
