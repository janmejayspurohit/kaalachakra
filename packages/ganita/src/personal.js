/**
 * Person-relative day quality.
 *
 * Everything here answers "how is this day for THIS person", which requires
 * the person's janma (birth) nakshatra and janma rashi. Nothing in this file
 * is a general panchanga property.
 *
 * The three classical measures implemented:
 *   - Tarabala    : today's nakshatra counted from the janma nakshatra (9-fold)
 *   - Chandrabala : today's Moon rashi counted from the janma rashi (12-fold)
 *   - Sade Sati   : Saturn transiting the 12th / 1st / 2nd from the janma rashi
 */
import { norm360 } from './angles.js';
import { siderealLongitude, panchangaMoon, ganita, swe } from './ephemeris.js';
import { NAKSHATRA_ARC, NAKSHATRA_NAMES, RASHI_NAMES } from './panchanga.js';

/* --------------------------------------------------------------- tarabala */

/**
 * The nine taras, in order from the janma nakshatra.
 * `nature` drives display; do not infer it from the index elsewhere.
 */
export const TARAS = [
  { index: 1, name: 'Janma',        nature: 'caution', meaning: 'body, self; avoid new undertakings' },
  { index: 2, name: 'Sampat',       nature: 'good',    meaning: 'wealth, prosperity' },
  { index: 3, name: 'Vipat',        nature: 'bad',     meaning: 'danger, loss' },
  { index: 4, name: 'Kshema',       nature: 'good',    meaning: 'well-being, security' },
  { index: 5, name: 'Pratyak',      nature: 'bad',     meaning: 'obstacles, opposition' },
  { index: 6, name: 'Sadhaka',      nature: 'good',    meaning: 'accomplishment' },
  { index: 7, name: 'Vadha',        nature: 'bad',     meaning: 'the most adverse tara' },
  { index: 8, name: 'Mitra',        nature: 'good',    meaning: 'friendship, support' },
  { index: 9, name: 'Parama Mitra', nature: 'good',    meaning: 'the most favourable tara' },
];

/**
 * Tarabala for a day.
 * @param {number} janmaNakshatra  1..27
 * @param {number} todayNakshatra  1..27
 */
export function tarabala(janmaNakshatra, todayNakshatra) {
  assertRange(janmaNakshatra, 1, 27, 'janmaNakshatra');
  assertRange(todayNakshatra, 1, 27, 'todayNakshatra');

  // Inclusive count from janma to today, wrapping at 27.
  const count = ((todayNakshatra - janmaNakshatra + 27) % 27) + 1;
  const taraIndex = ((count - 1) % 9) + 1;
  // Which of the three cycles of nine - the 2nd and 3rd repetitions are
  // traditionally held to be progressively less severe.
  const cycle = Math.floor((count - 1) / 9) + 1;

  return {
    ...TARAS[taraIndex - 1],
    count,
    cycle,
    janmaNakshatra: { index: janmaNakshatra, name: NAKSHATRA_NAMES[janmaNakshatra - 1] },
    todayNakshatra: { index: todayNakshatra, name: NAKSHATRA_NAMES[todayNakshatra - 1] },
  };
}

/* ------------------------------------------------------------ chandrabala */

/**
 * Chandrabala - the Moon's rashi counted from the janma rashi.
 * The 4th, 8th and 12th are the adverse positions.
 */
const CHANDRA_BAD = new Set([4, 8, 12]);
const CHANDRA_BEST = new Set([1, 3, 6, 7, 10, 11]);

export function chandrabala(janmaRashi, todayMoonRashi) {
  assertRange(janmaRashi, 1, 12, 'janmaRashi');
  assertRange(todayMoonRashi, 1, 12, 'todayMoonRashi');

  const count = ((todayMoonRashi - janmaRashi + 12) % 12) + 1;
  const nature = CHANDRA_BAD.has(count) ? 'bad' : CHANDRA_BEST.has(count) ? 'good' : 'neutral';

  return {
    count,
    nature,
    janmaRashi: { index: janmaRashi, name: RASHI_NAMES[janmaRashi - 1] },
    moonRashi: { index: todayMoonRashi, name: RASHI_NAMES[todayMoonRashi - 1] },
    meaning: `Moon is in the ${ordinal(count)} from the janma rashi`,
  };
}

/* --------------------------------------------------------------- shani    */

/**
 * Saturn transits relative to the janma rashi.
 *
 * Sade Sati ("seven and a half") is Saturn in the 12th, 1st or 2nd from the
 * natal Moon's rashi, three phases of roughly 2.5 years each.
 * Also reported: Ashtama Shani (8th) and Kantaka / Ardhashtama Shani (4th).
 *
 * IMPORTANT LIMITATION, stated rather than hidden: this reports the status at
 * a single instant. It does NOT compute phase start/end dates, because Saturn
 * can cross a rashi boundary, turn retrograde and cross back, splitting a
 * phase into several intervals. Any date range must be produced by scanning
 * for boundary crossings, not by dividing 7.5 years into three - that shortcut
 * gets every boundary date wrong.
 */
export function shaniStatus(jdUt, janmaRashi, ayanamsaName) {
  assertRange(janmaRashi, 1, 12, 'janmaRashi');
  const saturn = siderealLongitude(jdUt, swe.SE_SATURN, ayanamsaName);
  const satRashi = Math.floor(norm360(saturn.longitude) / 30) + 1;
  const from = ((satRashi - janmaRashi + 12) % 12) + 1;

  const sadeSatiPhase =
    from === 12 ? 'rising' : from === 1 ? 'peak' : from === 2 ? 'setting' : null;

  return {
    saturnRashi: { index: satRashi, name: RASHI_NAMES[satRashi - 1] },
    saturnLongitude: saturn.longitude,
    retrograde: saturn.speed < 0,
    positionFromJanmaRashi: from,
    sadeSati: {
      active: sadeSatiPhase !== null,
      phase: sadeSatiPhase,
      description: sadeSatiPhase
        ? `Sade Sati, ${sadeSatiPhase} phase (Saturn in the ${ordinal(from)} from janma rashi)`
        : 'Sade Sati is not active',
    },
    ashtamaShani: {
      active: from === 8,
      description: from === 8 ? 'Ashtama Shani (Saturn in the 8th from janma rashi)' : null,
    },
    kantakaShani: {
      active: from === 4,
      description: from === 4 ? 'Kantaka / Ardhashtama Shani (Saturn in the 4th)' : null,
    },
  };
}

/* ------------------------------------------------------------- assembly   */

/**
 * The day-summary for one profile.
 *
 * `severity` is the single field the UI should colour on. It is derived from
 * the worst contributing factor, because a day with a good Chandrabala and a
 * Vadha tara is not an average day - the adverse factor dominates.
 */
export function daySummary({ jdUt, janmaNakshatra, janmaRashi, todayNakshatra, todayMoonRashi, ayanamsaName }) {
  const tara = tarabala(janmaNakshatra, todayNakshatra);
  const chandra = chandrabala(janmaRashi, todayMoonRashi);
  const shani = shaniStatus(jdUt, janmaRashi, ayanamsaName);

  const highlights = [];
  if (tara.nature === 'bad') {
    highlights.push({ severity: 'bad', kind: 'tarabala', text: `${tara.name} tara - ${tara.meaning}` });
  } else if (tara.nature === 'caution') {
    highlights.push({ severity: 'warn', kind: 'tarabala', text: `${tara.name} tara - ${tara.meaning}` });
  } else {
    highlights.push({ severity: 'good', kind: 'tarabala', text: `${tara.name} tara - ${tara.meaning}` });
  }

  highlights.push({
    severity: chandra.nature === 'bad' ? 'bad' : chandra.nature === 'good' ? 'good' : 'neutral',
    kind: 'chandrabala',
    text: chandra.meaning,
  });

  if (shani.sadeSati.active) {
    highlights.push({ severity: 'warn', kind: 'sadeSati', text: shani.sadeSati.description });
  }
  if (shani.ashtamaShani.active) {
    highlights.push({ severity: 'bad', kind: 'ashtamaShani', text: shani.ashtamaShani.description });
  }
  if (shani.kantakaShani.active) {
    highlights.push({ severity: 'warn', kind: 'kantakaShani', text: shani.kantakaShani.description });
  }
  if (todayNakshatra === janmaNakshatra) {
    highlights.push({
      severity: 'neutral', kind: 'janmaNakshatra',
      text: `Janma nakshatra (${NAKSHATRA_NAMES[janmaNakshatra - 1]}) - a nakshatra birthday`,
    });
  }

  const rank = { bad: 3, warn: 2, neutral: 1, good: 0 };
  const severity = highlights.reduce(
    (worst, h) => (rank[h.severity] > rank[worst] ? h.severity : worst),
    'good'
  );

  return { severity, tarabala: tara, chandrabala: chandra, shani, highlights };
}

/** Janma nakshatra and rashi from a birth moment. */
export function janmaPoints(birthJdUt, ayanamsaName) {
  // In the active ganita, like the panchanga: under Sri Uttaradi Math's
  // reckoning the janma nakshatra is the Surya Siddhanta Moon's, as a
  // Math-panchanga reader would find it. Differs from drik (True Chitra) for
  // about 9.6% of births (nakshatra) and 2.8% (rashi), sampled 1900-2200.
  const lon = norm360(panchangaMoon(birthJdUt, ayanamsaName));
  const nakIndex = Math.floor(lon / NAKSHATRA_ARC) + 1;
  const within = lon - (nakIndex - 1) * NAKSHATRA_ARC;
  return {
    ganita: ganita(),
    moonLongitude: lon,
    nakshatra: {
      index: nakIndex,
      name: NAKSHATRA_NAMES[nakIndex - 1],
      pada: Math.floor(within / (NAKSHATRA_ARC / 4)) + 1,
    },
    rashi: (() => {
      const i = Math.floor(lon / 30) + 1;
      return { index: i, name: RASHI_NAMES[i - 1] };
    })(),
  };
}

function assertRange(v, lo, hi, name) {
  if (!Number.isInteger(v) || v < lo || v > hi) {
    throw new RangeError(`${name} must be an integer in [${lo}, ${hi}], got ${v}`);
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
