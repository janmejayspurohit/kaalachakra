/**
 * Daily auspicious / inauspicious windows.
 *
 * The daylight span (sunrise -> sunset) is divided into eight equal parts, and
 * each of Rahu Kala, Gulika Kala and Yamaganda occupies one of them, chosen by
 * weekday. The eighth is never Rahu Kala on any day, which is why the table is
 * indexed rather than computed.
 *
 * The offsets below are the STARTING fraction of the daylight span. They were
 * cross-checked against the classical rule before being adopted:
 *
 *   Rahu Kala part number by weekday - Sun 8th, Mon 2nd, Tue 7th, Wed 5th,
 *   Thu 6th, Fri 4th, Sat 3rd
 *     -> (8-1)/8, (2-1)/8, (7-1)/8, (5-1)/8, (6-1)/8, (4-1)/8, (3-1)/8
 *     -> 0.875, 0.125, 0.75, 0.5, 0.625, 0.375, 0.25   ... exact match.
 *
 * Index 0 = Sunday.
 */
export const KAALA_OFFSETS = Object.freeze({
  rahu:      [0.875, 0.125, 0.75, 0.5, 0.625, 0.375, 0.25],
  gulika:    [0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0.0],
  yamaganda: [0.5, 0.375, 0.25, 0.125, 0.0, 0.75, 0.625],
});

const ONE_EIGHTH = 1 / 8;

/**
 * The three kaala windows for a day.
 *
 * Requires BOTH sunrise and sunset: the windows are fractions of the actual
 * daylight span, which varies with latitude and season. Using a fixed 06:00
 * to 18:00 day - as many quick implementations do - is wrong everywhere except
 * the equator at equinox.
 */
export function kaalaWindows(sunriseJd, sunsetJd, varaIndex) {
  if (!Number.isFinite(sunriseJd) || !Number.isFinite(sunsetJd)) {
    throw new TypeError('kaalaWindows requires finite sunrise and sunset');
  }
  if (sunsetJd <= sunriseJd) {
    throw new RangeError(
      `sunset (${sunsetJd}) must be after sunrise (${sunriseJd}); ` +
        `at polar latitudes there may be no daylight span at all`
    );
  }
  const dayLength = sunsetJd - sunriseJd;
  const part = dayLength * ONE_EIGHTH;

  const build = (name) => {
    const startFraction = KAALA_OFFSETS[name][varaIndex];
    const start = sunriseJd + dayLength * startFraction;
    return {
      name,
      startJd: start,
      endJd: start + part,
      partNumber: Math.round(startFraction * 8) + 1,
    };
  };

  return {
    rahu: build('rahu'),
    gulika: build('gulika'),
    yamaganda: build('yamaganda'),
  };
}

/**
 * Abhijit muhurta - the 8th of fifteen equal muhurtas of the daylight span,
 * i.e. the one straddling local solar noon. Traditionally auspicious, and
 * traditionally NOT observed on Wednesday.
 */
export function abhijit(sunriseJd, sunsetJd, varaIndex) {
  const dayLength = sunsetJd - sunriseJd;
  const muhurta = dayLength / 15;
  const start = sunriseJd + muhurta * 7;
  return {
    name: 'abhijit',
    startJd: start,
    endJd: start + muhurta,
    applies: varaIndex !== 3, // not on Budhavara
  };
}

/**
 * Hora - the planetary hour.
 *
 * The daylight span is divided into 12 unequal hours, and the sequence of
 * ruling planets follows the Chaldean order starting from the lord of the
 * weekday. This returns the sequence for the daylight portion only.
 */
const CHALDEAN = ['shani', 'guru', 'mangala', 'surya', 'shukra', 'budha', 'chandra'];
const WEEKDAY_LORD = ['surya', 'chandra', 'mangala', 'budha', 'guru', 'shukra', 'shani'];

export function horas(sunriseJd, sunsetJd, varaIndex) {
  const dayLength = sunsetJd - sunriseJd;
  const hour = dayLength / 12;
  const startIdx = CHALDEAN.indexOf(WEEKDAY_LORD[varaIndex]);
  const out = [];
  for (let i = 0; i < 12; i++) {
    out.push({
      index: i + 1,
      lord: CHALDEAN[(startIdx + i) % 7],
      startJd: sunriseJd + hour * i,
      endJd: sunriseJd + hour * (i + 1),
    });
  }
  return out;
}
