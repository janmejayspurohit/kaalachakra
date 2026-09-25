/**
 * Vimshottari dasha, and Saturn period scanning (Sade Sati and friends).
 *
 * THE DASHA YEAR - decided 2026-09-23 on the user's instruction that janma
 * nakshatra and dasha "follow uttaradi matha".
 *
 * Vimshottari assumes a 120-year life measured in SOLAR SIDEREAL years (saura
 * varsha): a dasha year is one return of the Sun to the same sidereal point.
 * Sri Uttaradi Math's panchanga is Surya Siddhanta based, so under the Math's
 * reckoning the year is the Siddhanta's own sidereal year, 365.258756 days
 * (1,577,917,828 civil days / 4,320,000 revolutions per mahayuga). Under drik
 * it is the modern sidereal year, 365.256363 days. The two differ by 0.3 days
 * over 120 years.
 *
 * HONEST PROVENANCE: the Math's published panchangas (16 English and 2 Kannada
 * editions, 2023-27) contain no dasha section and no statement of the dasha
 * year; neither does its calculator's site (panchangas.in). This is the
 * standard definition of the Vimshottari year applied in the Math's ganita -
 * inferred, not quoted - and should be confirmed with the Math.
 *
 * It REPLACES the 360-day savana year taken from sudhyk's Ahoratra
 * (VimsottariManager.swift:53). That year is a minority convention; it put
 * every dasha boundary 5.24 days per year of age earlier than the solar
 * reckoning - about ten months by age 60 - and the note that used to sit here
 * calling 365.25 "the most common error" had it backwards.
 */
import { norm360 } from './angles.js';
import { panchangaMoon, siderealLongitude, ganita, swe } from './ephemeris.js';
import { SIDEREAL_YEAR as SURYA_SIDDHANTA_YEAR } from './suryasiddhanta.js';
import { NAKSHATRA_ARC, NAKSHATRA_NAMES, RASHI_NAMES } from './panchanga.js';

/** Days in a Vimshottari (saura) year, per ganita. */
export const VIMSHOTTARI_YEAR = Object.freeze({
  surya: SURYA_SIDDHANTA_YEAR, // 365.258756...
  drik: 365.256363,            // modern sidereal year (J2000)
});
export const vimshottariYearDays = () => VIMSHOTTARI_YEAR[ganita()];
/** @deprecated kept for importers; the year now depends on the ganita - use vimshottariYearDays(). */
export const VIMSHOTTARI_YEAR_DAYS = VIMSHOTTARI_YEAR.surya;

/** Mahadasha lengths in years. Sums to exactly 120. */
export const MAHADASHA_YEARS = Object.freeze({
  ketu: 7, shukra: 20, surya: 6, chandra: 10, mangala: 7,
  rahu: 18, guru: 16, shani: 19, budha: 17,
});

/** The cycle order. The 27 nakshatras map onto this list three times over. */
export const DASHA_ORDER = Object.freeze([
  'ketu', 'shukra', 'surya', 'chandra', 'mangala', 'rahu', 'guru', 'shani', 'budha',
]);

export const TOTAL_YEARS = DASHA_ORDER.reduce((s, g) => s + MAHADASHA_YEARS[g], 0); // 120

/** Short character notes, shown on hover in the UI. */
export const DASHA_NOTES = Object.freeze({
  ketu:    'Detachment, moksha, sudden endings and sudden insight. Often unsettled outwardly, clarifying inwardly.',
  shukra:  'Relationships, comfort, art, wealth and pleasure. The longest dasha at 20 years.',
  surya:   'Authority, father, health, recognition. Short and sharp at 6 years.',
  chandra: 'Mind, mother, emotional life, travel and change of residence.',
  mangala: 'Energy, conflict, property, siblings, surgery. Decisive but abrasive.',
  rahu:    'Ambition, foreign things, disruption and unconventional gain. Amplifies whatever it touches.',
  guru:    'Wisdom, teachers, children, expansion, dharma. Generally the most protective period.',
  shani:   'Discipline, delay, endurance, karma coming due. The longest test at 19 years.',
  budha:   'Intellect, commerce, communication, education and negotiation.',
});

/** Lord of each nakshatra, 1..27. */
export function nakshatraLord(nakIndex) {
  return DASHA_ORDER[(nakIndex - 1) % 9];
}

/**
 * Full Vimshottari tree from a birth moment.
 *
 * @param {number} birthJdUt
 * @param {string} ayanamsaName
 * @param {number} depth  1 = mahadasha only, 2 = +antardasha, 3 = +pratyantardasha
 */
export function vimshottari(birthJdUt, ayanamsaName, depth = 2) {
  if (!Number.isInteger(depth) || depth < 1 || depth > 4) {
    throw new RangeError(`depth must be an integer 1..4, got ${depth}`);
  }

  // The janma Moon in the active ganita: Surya Siddhanta under the Math's
  // reckoning, so the dasha balance agrees with the janma nakshatra shown.
  const lon = norm360(panchangaMoon(birthJdUt, ayanamsaName));
  const yearDays = vimshottariYearDays();
  const nakIndex = Math.floor(lon / NAKSHATRA_ARC) + 1;
  const into = lon - (nakIndex - 1) * NAKSHATRA_ARC;   // degrees elapsed
  const fractionElapsed = into / NAKSHATRA_ARC;

  const lord = nakshatraLord(nakIndex);
  const lordYears = MAHADASHA_YEARS[lord];

  // Balance of the running mahadasha at birth.
  const balanceYears = lordYears * (1 - fractionElapsed);
  const elapsedYears = lordYears * fractionElapsed;

  // The current mahadasha began BEFORE birth, by the elapsed portion.
  const firstStartJd = birthJdUt - elapsedYears * yearDays;

  const startIdx = DASHA_ORDER.indexOf(lord);
  const periods = [];
  let cursor = firstStartJd;

  for (let i = 0; i < DASHA_ORDER.length; i++) {
    const g = DASHA_ORDER[(startIdx + i) % 9];
    const years = MAHADASHA_YEARS[g];
    const days = years * yearDays;
    periods.push(buildPeriod(g, cursor, days, 1, depth, g, yearDays));
    cursor += days;
  }

  return {
    meta: {
      ayanamsa: ayanamsaName,
      ganita: ganita(),
      vimshottariYearDays: yearDays,
      yearBasis: ganita() === 'surya'
        ? 'Saura (sidereal solar) year of the Surya Siddhanta, 365.258756 days - the Vimshottari year in Sri Uttaradi Math\'s ganita (inferred; the Math publishes no dasha year).'
        : 'Modern sidereal solar year, 365.256363 days.',
      totalYears: TOTAL_YEARS,
      depth,
    },
    janma: {
      nakshatra: { index: nakIndex, name: NAKSHATRA_NAMES[nakIndex - 1] },
      lord,
      moonLongitude: lon,
      fractionElapsed,
    },
    balanceAtBirth: {
      lord,
      years: balanceYears,
      formatted: formatYears(balanceYears),
    },
    periods,
  };
}

/**
 * Build one period and, if `depth` allows, its sub-periods.
 *
 * Sub-period lengths are proportional: within a mahadasha of L years, the
 * antardasha of graha G runs for L * (years[G] / 120) years. The sequence
 * starts from the parent's own lord.
 */
function buildPeriod(graha, startJd, durationDays, level, maxDepth, rootLord, yearDays) {
  const node = {
    graha,
    level,
    startJd,
    endJd: startJd + durationDays,
    durationDays,
    durationYears: durationDays / yearDays,
    note: DASHA_NOTES[graha],
  };

  if (level < maxDepth) {
    const startIdx = DASHA_ORDER.indexOf(graha);
    const children = [];
    let cursor = startJd;
    for (let i = 0; i < DASHA_ORDER.length; i++) {
      const g = DASHA_ORDER[(startIdx + i) % 9];
      const childDays = durationDays * (MAHADASHA_YEARS[g] / TOTAL_YEARS);
      children.push(buildPeriod(g, cursor, childDays, level + 1, maxDepth, rootLord, yearDays));
      cursor += childDays;
    }
    node.children = children;
  }
  return node;
}

/** The chain of periods active at a given instant, outermost first. */
export function activeDasha(tree, jdUt) {
  const chain = [];
  let list = tree.periods;
  while (list) {
    const hit = list.find((p) => jdUt >= p.startJd && jdUt < p.endJd);
    if (!hit) break;
    chain.push({
      graha: hit.graha, level: hit.level,
      startJd: hit.startJd, endJd: hit.endJd,
      note: hit.note,
    });
    list = hit.children;
  }
  return chain;
}

function formatYears(y) {
  const years = Math.floor(y);
  const months = Math.floor((y - years) * 12);
  const days = Math.round(((y - years) * 12 - months) * 30);
  return `${years}y ${months}m ${days}d`;
}

/* ------------------------------------------------------- saturn periods */

/**
 * Sade Sati and related Saturn periods, as DATED INTERVALS.
 *
 * This is the part that is easy to get wrong. Saturn takes ~2.5 years per
 * rashi, so the naive approach is to divide 7.5 years into three equal
 * phases. That is wrong at every boundary, because Saturn can cross into a
 * rashi, turn retrograde, cross back out, and re-enter months later. A real
 * Sade Sati phase is therefore a set of intervals, not one.
 *
 * Method: sample Saturn's sidereal rashi on a coarse grid, and wherever the
 * rashi changes between two samples, bisect to the exact crossing. Then merge
 * adjacent samples that share a relevant rashi into intervals.
 *
 * @param {number} fromJd
 * @param {number} toJd
 * @param {number} janmaRashi 1..12
 */
export function saturnPeriods(fromJd, toJd, janmaRashi, ayanamsaName, { stepDays = 10 } = {}) {
  if (!(toJd > fromJd)) throw new RangeError('toJd must be after fromJd');
  if (!Number.isInteger(janmaRashi) || janmaRashi < 1 || janmaRashi > 12) {
    throw new RangeError('janmaRashi must be an integer 1..12');
  }

  const rashiAt = (jd) =>
    Math.floor(norm360(siderealLongitude(jd, swe.SE_SATURN, ayanamsaName).longitude) / 30) + 1;

  // 10-day sampling is comfortably finer than the fastest Saturn rashi
  // traverse, so no crossing can be stepped over entirely.
  const samples = [];
  for (let jd = fromJd; jd <= toJd; jd += stepDays) samples.push({ jd, rashi: rashiAt(jd) });
  if (samples[samples.length - 1].jd < toJd) samples.push({ jd: toJd, rashi: rashiAt(toJd) });

  /** Exact moment Saturn leaves `rashi`, between two samples. */
  const refine = (loJd, hiJd) => {
    let lo = loJd, hi = hiJd;
    const target = rashiAt(lo);
    for (let i = 0; i < 40 && hi - lo > 1e-5; i++) {
      const mid = (lo + hi) / 2;
      if (rashiAt(mid) === target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const classify = (satRashi) => {
    const from = ((satRashi - janmaRashi + 12) % 12) + 1;
    if (from === 12) return { kind: 'sadeSati', phase: 'rising', from };
    if (from === 1) return { kind: 'sadeSati', phase: 'peak', from };
    if (from === 2) return { kind: 'sadeSati', phase: 'setting', from };
    if (from === 8) return { kind: 'ashtamaShani', phase: null, from };
    if (from === 4) return { kind: 'kantakaShani', phase: null, from };
    return null;
  };

  const intervals = [];
  let run = null;
  for (let i = 0; i < samples.length; i++) {
    const c = classify(samples[i].rashi);
    const key = c ? `${c.kind}:${c.phase ?? ''}:${samples[i].rashi}` : null;

    if (run && run.key !== key) {
      run.endJd = refine(samples[i - 1].jd, samples[i].jd);
      intervals.push(run);
      run = null;
    }
    if (c && !run) {
      const startJd = i === 0 ? samples[0].jd : refine(samples[i - 1].jd, samples[i].jd);
      run = {
        key,
        kind: c.kind,
        phase: c.phase,
        positionFromJanmaRashi: c.from,
        saturnRashi: { index: samples[i].rashi, name: RASHI_NAMES[samples[i].rashi - 1] },
        startJd,
        endJd: null,
      };
    }
  }
  if (run) { run.endJd = samples[samples.length - 1].jd; run.openEnded = true; intervals.push(run); }

  return intervals.map(({ key, ...rest }) => ({
    ...rest,
    durationYears: (rest.endJd - rest.startJd) / 365.2425,
    description: describeSaturn(rest),
  }));
}

function describeSaturn(iv) {
  if (iv.kind === 'sadeSati') {
    return `Sade Sati, ${iv.phase} phase - Saturn in ${iv.saturnRashi.name}, the ${iv.positionFromJanmaRashi === 12 ? '12th' : iv.positionFromJanmaRashi === 1 ? '1st' : '2nd'} from the janma rashi`;
  }
  if (iv.kind === 'ashtamaShani') {
    return `Ashtama Shani - Saturn in ${iv.saturnRashi.name}, the 8th from the janma rashi`;
  }
  return `Kantaka (Ardhashtama) Shani - Saturn in ${iv.saturnRashi.name}, the 4th from the janma rashi`;
}
