/**
 * @kaalachakra/swisseph
 *
 * Thin ESM wrapper over the vendored Swiss Ephemeris N-API binding.
 *
 * The ephemeris path is set once, at import, to the `ephe/` directory shipped
 * inside this package. That directory holds sepl_{12,18,24}.se1 and
 * semo_{12,18,24}.se1, giving continuous coverage of roughly 1200-2799 CE.
 * Outside that span swe_calc_ut falls back to the Moshier analytic theory,
 * which is lower precision - `assertInEphemerisRange` exists to make that
 * explicit rather than silent.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** @type {Record<string, any>} */
const swe = require('../build/Release/swisseph.node');

export const EPHE_PATH = join(here, '..', 'ephe');
swe.swe_set_ephe_path(EPHE_PATH);

/**
 * Julian day bounds of the bundled .se1 files.
 * sepl_12 starts 1200 CE; sepl_24 ends 2800 CE.
 */
export const EPHEMERIS_RANGE = Object.freeze({
  startJd: 2159350.5, // 1200-01-01 gregorian
  endJd: 2743364.5,   // 2800-01-01 gregorian
  startYear: 1200,
  endYear: 2800,
});

/**
 * Throw if `jd` falls outside the bundled ephemeris files.
 *
 * Swiss Ephemeris does not error here - it silently degrades to Moshier, which
 * is accurate to arcseconds rather than milliarcseconds. For a panchanga that
 * is usually fine; for a birth chart claimed to be precise it is not. Callers
 * that genuinely want the fallback can skip this check deliberately.
 */
export function assertInEphemerisRange(jd) {
  if (!Number.isFinite(jd)) {
    throw new TypeError(`julian day must be a finite number, got ${jd}`);
  }
  if (jd < EPHEMERIS_RANGE.startJd || jd > EPHEMERIS_RANGE.endJd) {
    throw new RangeError(
      `julian day ${jd} is outside the bundled ephemeris range ` +
        `(${EPHEMERIS_RANGE.startYear}-${EPHEMERIS_RANGE.endYear} CE). ` +
        `Swiss Ephemeris would silently fall back to the lower-precision ` +
        `Moshier theory. Add the relevant .se1 files to ephe/ to extend coverage.`
    );
  }
}

/** Normalise any angle into [0, 360). */
export function norm360(deg) {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/**
 * Ayanamsa modes exposed by name.
 *
 * `trueCitra` is the Kaalachakra default, following sudhyk's Ahoratra
 * coreserver (`ayanamsha=chitrapaksha`). It is NOT the same as Lahiri.
 * `suryasiddhanta` exists for the Raghavendra (Rayara) Mutt ganita profile.
 */
export const AYANAMSA = Object.freeze({
  trueCitra: swe.SE_SIDM_TRUE_CITRA,
  lahiri: swe.SE_SIDM_LAHIRI,
  raman: swe.SE_SIDM_RAMAN,
  krishnamurti: swe.SE_SIDM_KRISHNAMURTI,
  trueRevati: swe.SE_SIDM_TRUE_REVATI,
  truePushya: swe.SE_SIDM_TRUE_PUSHYA,
  suryasiddhanta: swe.SE_SIDM_SURYASIDDHANTA,
  suryasiddhantaMeanSun: swe.SE_SIDM_SURYASIDDHANTA_MSUN,
});

/**
 * The Vedic sunrise/sunset flag set.
 *
 * Taken from sudhyk's coreserver `SunRiseType.vedic`. Disc centre, no
 * refraction, geocentric with no ecliptic latitude. This differs from the
 * common `SE_BIT_DISC_CENTER`-only convention by roughly 2-4 minutes, and
 * sunrise sets both the vara boundary and the tithi-at-sunrise - so this
 * constant silently determines the whole day's panchanga. Do not change it
 * without re-baselining every fixture.
 */
export const VEDIC_RISE =
  swe.SE_CALC_RISE |
  swe.SE_BIT_DISC_CENTER |
  swe.SE_BIT_NO_REFRACTION |
  swe.SE_BIT_GEOCTR_NO_ECL_LAT;

export const VEDIC_SET =
  swe.SE_CALC_SET |
  swe.SE_BIT_DISC_CENTER |
  swe.SE_BIT_NO_REFRACTION |
  swe.SE_BIT_GEOCTR_NO_ECL_LAT;

export default swe;
export const {
  swe_set_ephe_path,
  swe_set_sid_mode,
  swe_close,
  swe_version,
  swe_julday,
  swe_revjul,
  swe_utc_to_jd,
  swe_deltat,
  swe_calc_ut,
  swe_get_ayanamsa_ut,
  swe_get_ayanamsa_ex_ut,
  swe_get_planet_name,
  swe_houses_ex,
  swe_rise_trans,
} = swe;
