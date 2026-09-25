/**
 * Surya Siddhanta ganita - the Sun and Moon as the Surya Siddhanta computes
 * them.
 *
 * WHY THIS EXISTS
 * ---------------
 * Sri Uttaradi Math's panchanga is Surya Siddhanta based. Its own editions
 * say so on every page ("Soorya Siddhantha, Chandramana Panchangam, Thanjavur
 * Panchangam"), print a Surya Siddhanta ayanamsa (22°54′ for 2026, against
 * Chitrapaksha's ~24°12′) and give the Surya Siddhanta sankranti as the
 * operative one, with the drik time only as a side note. Observance dates
 * that follow the Math therefore have to come from this ganita, not from a
 * modern ephemeris.
 *
 * WHAT IS IMPLEMENTED, EXACTLY
 * ----------------------------
 * The "modern Hindu calendar" of Reingold & Dershowitz, Calendrical
 * Calculations (Cambridge UP), which is the Surya Siddhanta reduced to
 * arithmetic: mean motions from the revolutions per mahayuga, the 24-entry
 * Hindu sine table (radius 3438), the manda (epicycle) correction with the
 * Siddhanta's pulsating epicycles, and the Siddhanta's sunrise with the
 * equation of time and ascensional difference. It is validated against the
 * authors' published test set (rd_hindu_lunisolar_modern.txt and
 * rd_hindu_solar_modern.txt, 33 dates from 529 BCE to 2094 CE) - see
 * test/suryasiddhanta.test.js.
 *
 * Longitudes here are SIDEREAL in the Siddhanta's own frame. There is no
 * separate ayanamsa to apply: the Siddhanta counts from its own fixed zero
 * point, which is exactly why its ayanamsa differs from Chitrapaksha.
 *
 * TIME SCALE: every `tee` in this file is a moment in Julian days of
 * UJJAIN LOCAL MEAN TIME, the Siddhanta's prime meridian. Use ujjainFromUt /
 * utFromUjjain at the boundary.
 *
 * The Sun and Moon drive the panchanga (tithi, nakshatra, yoga, karana, masa,
 * sankranti) and, under the Math's reckoning, the kundali's Surya and Chandra.
 *
 * The five tara-grahas and Rahu are ALSO implemented (planetLongitude,
 * rahuLongitude, grahaLongitudes - Burgess ch. I-II; apsides from the kalpa
 * revolutions, Rahu at 180 deg at the Kali epoch) but deliberately NOT used by the app: measured
 * against Sri Uttaradi Math's 652 printed planetary ingresses (2025-27), the
 * Siddhanta's own planets miss by 0.9-7 deg (Guru's 2026 Karka ingress by 20
 * days), whereas the modern ephemeris with a Lahiri-type ayanamsa lands
 * within about a day. The Math's charts therefore use modern planets; see
 * chart.js. Kept, tested, for anyone who wants the pure Siddhanta.
 */

/* ------------------------------------------------------------ constants */

/** Civil days in a mahayuga, and revolutions per mahayuga (Surya Siddhanta). */
const CIVIL_DAYS = 1577917828;

export const SIDEREAL_YEAR = 365 + 279457 / 1080000;           // = CIVIL_DAYS / 4320000
export const ANOMALISTIC_YEAR = 1577917828000 / (4320000000 - 387);
export const SIDEREAL_MONTH = 27 + 4644439 / 14438334;          // = CIVIL_DAYS / 57753336
export const SYNODIC_MONTH = 29 + 7087771 / 13358334;
export const ANOMALISTIC_MONTH = 1577917828 / (57753336 - 488199);

/** Kali Yuga epoch: midnight at Ujjain, 18 February 3102 BCE (Julian), as JD. */
export const KALI_EPOCH_JD = 588465.5;
/** Creation, from which mean positions are counted (Sun and Moon are both 0 at the Kali epoch). */
const CREATION = KALI_EPOCH_JD - 1955880000 * SIDEREAL_YEAR;

/** Ujjain, the Siddhanta's prime meridian: 23°9′ N, 75°46′6″ E. */
export const UJJAIN = Object.freeze({ latitude: 23 + 9 / 60, longitude: 75 + 46 / 60 + 6 / 3600 });

const ARC = 225 / 60;           // 225 arcminutes: the sine-table step, in degrees
const R = 3438;                 // the Hindu sine-table radius

const mod = (x, m) => x - m * Math.floor(x / m);
const DEG = Math.PI / 180;

/* ------------------------------------------------------------ time scale */

/** UT Julian day -> Julian day in Ujjain local mean time. */
export const ujjainFromUt = (jdUt) => jdUt + UJJAIN.longitude / 360;
/** Ujjain local mean time Julian day -> UT Julian day. */
export const utFromUjjain = (tee) => tee - UJJAIN.longitude / 360;

/* ------------------------------------------------------------ sine table */

/**
 * The Siddhanta's sine table: 24 sines at steps of 225′, radius 3438,
 * reproduced as the text gives them (the 0.215 term restores the rounding
 * of the traditional values).
 */
function sineTable(entry) {
  const exact = R * Math.sin(entry * ARC * DEG);
  const error = 0.215 * Math.sign(exact) * Math.sign(Math.abs(exact) - 1716);
  return Math.round(exact + error) / R;
}
const TABLE = Array.from({ length: 25 }, (_, i) => sineTable(i));
const tableAt = (i) => (i >= 0 && i <= 24 ? TABLE[i] : sineTable(i));

/** Sine by linear interpolation in the table (theta in degrees). */
export function hinduSine(theta) {
  const entry = theta / ARC;
  const fraction = mod(entry, 1);
  return fraction * tableAt(Math.ceil(entry)) + (1 - fraction) * tableAt(Math.floor(entry));
}

/** Inverse of hinduSine (result in degrees). */
export function hinduArcsin(amp) {
  if (amp < 0) return -hinduArcsin(-amp);
  let pos = 0;
  while (amp > tableAt(pos)) pos += 1;
  const below = tableAt(pos - 1);
  return ARC * (pos - 1 + (amp - below) / (tableAt(pos) - below));
}

/* ------------------------------------------------------------ positions */

/** Mean longitude (degrees) of a body with the given period, at Ujjain time `tee`. */
export function meanPosition(tee, period) {
  return 360 * mod((tee - CREATION) / period, 1);
}

/**
 * True longitude by the manda correction on a pulsating epicycle.
 * `size` is the epicycle as a fraction of the orbit, `change` how much it
 * contracts with the sine of the anomaly.
 */
function truePosition(tee, period, size, anomalistic, change) {
  const lambda = meanPosition(tee, period);
  const offset = hinduSine(meanPosition(tee, anomalistic));
  const contraction = Math.abs(offset) * change * size;
  const equation = hinduArcsin(offset * (size - contraction));
  return mod(lambda - equation, 360);
}

/** Sidereal longitude of the Sun (Siddhanta frame), degrees. */
export function solarLongitude(tee) {
  return truePosition(tee, SIDEREAL_YEAR, 14 / 360, ANOMALISTIC_YEAR, 1 / 42);
}

/** Sidereal longitude of the Moon (Siddhanta frame), degrees. */
export function lunarLongitude(tee) {
  return truePosition(tee, SIDEREAL_MONTH, 32 / 360, ANOMALISTIC_MONTH, 1 / 96);
}

/** Moon minus Sun, [0, 360). */
export function lunarPhase(tee) {
  return mod(lunarLongitude(tee) - solarLongitude(tee), 360);
}

/** Solar rashi 1..12 (1 = Mesha). */
export function zodiac(tee) {
  return Math.floor(solarLongitude(tee) / 30) + 1;
}

/** Lunar day (tithi) 1..30 at a moment. */
export function lunarDay(tee) {
  return Math.floor(lunarPhase(tee) / 12) + 1;
}

/** The new moon at or before `tee` (bisection on the phase). */
export function newMoonBefore(tee) {
  const tau = tee - (lunarPhase(tee) / 360) * SYNODIC_MONTH;
  let lo = tau - 1;
  let hi = Math.min(tee, tau + 1);
  for (let k = 0; k < 80 && hi - lo > 1e-9; k++) {
    const x = (lo + hi) / 2;
    if (lunarPhase(x) < 180) hi = x; else lo = x;
  }
  return (lo + hi) / 2;
}

/* -------------------------------------------------------------- planets */

/**
 * The five tara-grahas and the Moon's node, per the Surya Siddhanta
 * (Burgess's translation, ch. I-II).
 *
 *   revs      revolutions per mahayuga (I.29-34); for Budha and Shukra this
 *             is the revolution of the SHIGHROCCA, their mean place being the
 *             mean Sun's.
 *   apsisKalpa revolutions of the manda apsis per kalpa (I.41-42), counted
 *             from creation - the convention that reproduces Reingold &
 *             Dershowitz's Sun (their anomalistic year uses the Sun's 387).
 *   manda / shighra epicycles in degrees at the end of the even and the odd
 *             quadrant (II.34-37); in between the epicycle varies with the
 *             sine of the anomaly (II.38).
 */
const PLANETS = {
  mangala: { revs: 2296832, apsisKalpa: 204, manda: [75, 72], shighra: [235, 232], inner: false },
  budha: { revs: 17937060, apsisKalpa: 368, manda: [30, 28], shighra: [133, 132], inner: true },
  guru: { revs: 364220, apsisKalpa: 900, manda: [33, 32], shighra: [70, 72], inner: false },
  shukra: { revs: 7022376, apsisKalpa: 535, manda: [12, 11], shighra: [262, 260], inner: true },
  shani: { revs: 146568, apsisKalpa: 39, manda: [49, 48], shighra: [39, 40], inner: false },
};
const KALPA_DAYS = CIVIL_DAYS * 1000;
const MOON_NODE_REVS = 232238;

/** Epicycle at a given anomaly: even-quadrant value, moving to the odd-quadrant value with |sin|. */
const epicycle = ([even, odd], anomaly) => even + (odd - even) * Math.abs(hinduSine(anomaly));

/** Manda equation for anomaly (planet - apsis); subtracted from the planet. */
function mandaEquation(anomaly, cyc) {
  return hinduArcsin((epicycle(cyc, anomaly) / 360) * hinduSine(anomaly));
}

/** Shighra equation for kendra (shighrocca - planet); added to the planet. */
function shighraEquation(kendra, cyc) {
  const r = epicycle(cyc, kendra) / 360;
  const bhuja = r * hinduSine(kendra);
  const koti = r * hinduSine(90 + kendra);
  const karna = Math.sqrt((1 + koti) ** 2 + bhuja ** 2);
  return hinduArcsin(bhuja / karna);
}

/**
 * True sidereal longitude of a tara-graha by the Siddhanta's four steps
 * (II.43-44): half the shighra equation, then half the manda equation, then
 * the whole manda equation applied to the MEAN planet, then the whole shighra
 * equation.
 */
export function planetLongitude(tee, graha) {
  const P = PLANETS[graha];
  if (!P) throw new RangeError(`unknown graha "${graha}"`);
  const meanSun = meanPosition(tee, SIDEREAL_YEAR);
  const own = meanPosition(tee, CIVIL_DAYS / P.revs);
  const M = P.inner ? meanSun : own;         // mean planet
  const S = P.inner ? own : meanSun;         // shighrocca
  const A = meanPosition(tee, KALPA_DAYS / P.apsisKalpa); // manda apsis
  const m1 = M + shighraEquation(mod(S - M, 360), P.shighra) / 2;
  const m2 = m1 - mandaEquation(mod(m1 - A, 360), P.manda) / 2;
  const m3 = M - mandaEquation(mod(m2 - A, 360), P.manda);
  return mod(m3 + shighraEquation(mod(S - m3, 360), P.shighra), 360);
}

/** Rahu, the Moon's ascending node (mean; retrograde). 180 degrees at the Kali epoch. */
export function rahuLongitude(tee) {
  return mod(-meanPosition(tee, CIVIL_DAYS / MOON_NODE_REVS), 360);
}

/** All nine grahas at a moment (Ujjain time), with retrogression from the motion. */
export function grahaLongitudes(tee) {
  const at = (t) => ({
    surya: solarLongitude(t), chandra: lunarLongitude(t),
    mangala: planetLongitude(t, 'mangala'), budha: planetLongitude(t, 'budha'),
    guru: planetLongitude(t, 'guru'), shukra: planetLongitude(t, 'shukra'),
    shani: planetLongitude(t, 'shani'), rahu: rahuLongitude(t),
  });
  const now = at(tee), later = at(tee + 1 / 24);
  const out = {};
  for (const [g, lon] of Object.entries(now)) {
    const speed = (mod(later[g] - lon + 180, 360) - 180) * 24; // degrees per day
    out[g] = { longitude: lon, speed };
  }
  out.ketu = { longitude: mod(now.rahu + 180, 360), speed: out.rahu.speed };
  return out;
}

/* -------------------------------------------------------------- sunrise */

/** The Sun's daily motion (degrees/day) - varies with the anomaly. */
function dailyMotion(date) {
  const meanMotion = 360 / SIDEREAL_YEAR;
  const anomaly = meanPosition(date, ANOMALISTIC_YEAR);
  const epicycle = 14 / 360 - Math.abs(hinduSine(anomaly)) / 1080;
  const entry = Math.floor(anomaly / ARC);
  const sineTableStep = tableAt(entry + 1) - tableAt(entry);
  const factor = (-R / 225) * sineTableStep * epicycle;
  return meanMotion * (factor + 1);
}

/** Tropical longitude of the Sun per the Siddhanta's trepidation model. */
function tropicalLongitude(date) {
  // Days since 1 January 285 CE (Julian), JD 1825029.5 - the zero of the
  // Siddhanta's oscillating precession.
  const days = date - 1825029.5;
  const x = (600 / CIVIL_DAYS) * days - 1 / 4;
  const mod3 = -1 / 2 + mod(x + 1 / 2, 1);
  const precession = 27 - Math.abs(108 * mod3);
  // PLUS, not minus: tropical = sidereal + precession (the ayanamsa). Chosen
  // on two independent tests, not to fit one row: with '+' this module
  // reproduces all 33 rows of Reingold & Dershowitz's published lunisolar
  // table AND its Ujjain sunrise tracks the physical sunrise (Swiss
  // Ephemeris, disc centre, no refraction) to a median of 0.6 min, range
  // -9.5..+11.2 min over 2026. With '-' the sunrise error swings -34..+45 min
  // in an annual wave (declination taken ~52 deg out of phase) and one
  // published row fails.
  return mod(solarLongitude(date) + precession, 360);
}

/** Rising time of the Sun's sign, as a fraction of 30 degrees of arc. */
function risingSign(date) {
  const i = Math.floor(tropicalLongitude(date) / 30);
  return [1670, 1795, 1935, 1935, 1795, 1670][mod(i, 6)] / 1800;
}

/** Equation of time, in days. */
function equationOfTime(date) {
  const offset = hinduSine(meanPosition(date, ANOMALISTIC_YEAR));
  const equationSun = offset * (57 + 18 / 60) * (14 / 360 - Math.abs(offset) / 1080);
  return (dailyMotion(date) / 360) * (equationSun / 360) * SIDEREAL_YEAR;
}

/** Ascensional difference (chara) for a latitude, degrees. */
function ascensionalDifference(date, latitude) {
  const sinDelta = (1397 / 3438) * hinduSine(tropicalLongitude(date));
  const diurnalRadius = hinduSine(90 + hinduArcsin(sinDelta));
  const tanPhi = hinduSine(latitude) / hinduSine(90 + latitude);
  const earthSine = sinDelta * tanPhi;
  return hinduArcsin(-earthSine / diurnalRadius);
}

/**
 * Sunrise by the Siddhanta, for the civil date whose local-mean-time
 * midnight is `dateMidnight` (a Julian day in Ujjain time, ending in .5).
 *
 * `place` supplies latitude and longitude; the longitude enters as desantara
 * (the correction for distance from Ujjain's meridian). Returns Ujjain time.
 */
export function sunrise(dateMidnight, place = UJJAIN) {
  const date = dateMidnight;
  return date + 6 / 24
    + (UJJAIN.longitude - place.longitude) / 360
    - equationOfTime(date)
    + ((1577917828 / 1582237828) / 360)
      * (ascensionalDifference(date, place.latitude) + (1 / 4) * dailyMotion(date) * risingSign(date));
}

/* ---------------------------------------------- calendar (for validation) */

/** Elapsed sidereal year (Kali) at a moment. */
export function calendarYear(tee) {
  return Math.round((tee - KALI_EPOCH_JD) / SIDEREAL_YEAR - solarLongitude(tee) / 360);
}

const LUNAR_ERA = 3044;   // Vikrama
const SOLAR_ERA = 3179;   // Saka

/**
 * The Hindu lunisolar date of a civil date (amanta), exactly as Reingold &
 * Dershowitz define it. `dateMidnight` is the Ujjain-time JD of the date's
 * midnight. Used to validate this module against their published table.
 */
export function lunarDateOf(dateMidnight) {
  const critical = sunrise(dateMidnight);
  const day = lunarDay(critical);
  const leapDay = day === lunarDay(sunrise(dateMidnight - 1));
  const lastNewMoon = newMoonBefore(critical);
  const nextNewMoon = newMoonBefore(Math.floor(lastNewMoon - 0.5) + 0.5 + 35);
  const solarMonth = zodiac(lastNewMoon);
  const leapMonth = solarMonth === zodiac(nextNewMoon);
  const month = mod(solarMonth, 12) + 1;
  const year = calendarYear(month <= 2 ? dateMidnight + 180 : dateMidnight) - LUNAR_ERA;
  return { year, month, leapMonth, day, leapDay };
}

/** The Hindu solar date of a civil date (Saka era). */
export function solarDateOf(dateMidnight) {
  const critical = sunrise(dateMidnight + 1);
  const month = zodiac(critical);
  const year = calendarYear(critical) - SOLAR_ERA;
  const approx = dateMidnight - 3 - mod(Math.floor(solarLongitude(critical)), 30);
  let begin = approx;
  while (zodiac(sunrise(begin + 1)) !== month) begin += 1;
  return { year, month, day: dateMidnight - begin + 1 };
}
