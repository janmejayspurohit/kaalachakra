/**
 * @kaalachakra/ganita - the pure calculation layer.
 *
 * No HTTP, no filesystem, no formatting decisions. `computeDay()` returns a
 * structured object; rendering it as JSON, as Kannada text, or as input to a
 * narration model is somebody else's job. That split is taken from chart2txt
 * and it is what lets one engine serve the API, the web UI and an LLM.
 */
import { norm360, formatDms, inverseLagrange, unwrapAngles, angleDiff } from './angles.js';
import {
  GRAHA, AYANAMSA_NAMES, ayanamsa, siderealLongitude, tropicalLongitude,
  sunMoon, lunarPhase, nodes, sunrise, sunset, moonrise, moonset, houses, swe,
  panchangaSun, panchangaMoon, withGanita, ganita, resolveGanita, GANITAS, DEFAULT_GANITA,
  sunriseConvention,
} from './ephemeris.js';
import {
  tithi, karana, nakshatra, yoga, vara, angaTransitions,
  TITHI_NAMES, NAKSHATRA_NAMES, YOGA_NAMES, RASHI_NAMES, VARA_NAMES,
  NAKSHATRA_ARC,
} from './panchanga.js';
import { kaalaWindows, abhijit, horas, KAALA_OFFSETS } from './kaala.js';
import { localToJd, jdToLocal, jdToIso, jdToClock } from './time.js';
import { tarabala, chandrabala, shaniStatus, daySummary, janmaPoints, TARAS } from './personal.js';
import {
  natalChart, RASHIS, RASHI_LORD, RASHI_QUALITY, GRAHAS, NATURAL_NATURE,
  navamsaOfLongitude, houseFrom, aspectsOnHouse, aspectsRashi, occupantsOf,
  drishtiOf, NODE_DRISHTI_NOTE,
} from './chart.js';
import {
  deepCompatibility, mangalaDosha, mangalaComparison, papaLoad, papaSamya,
  seventhHouse, chartSummary,
} from './compatibility.js';
import { KUTA_MEANING, SCORE_BANDS, scoreBand, SCORE_CAVEAT } from './kuta-meaning.js';
import {
  MAHADASHA_MEANING, functionalNature, dashaOutlook, antardashaNote,
} from './dasha-meaning.js';

import { matchKutas, rashiOfNakshatraPada } from './kuta.js';
import {
  vimshottari, activeDasha, saturnPeriods, nakshatraLord,
  MAHADASHA_YEARS, DASHA_ORDER, DASHA_NOTES, VIMSHOTTARI_YEAR_DAYS, VIMSHOTTARI_YEAR, vimshottariYearDays, TOTAL_YEARS,
} from './dasha.js';
import { rankRemedies, REMEDY_CATALOGUE, REMEDY_DISCLAIMER } from './remedies.js';
import {
  masa, samvatsara, ritu, newMoonNear, findTithiDates,
  MASA_NAMES, SAMVATSARA_NAMES, RITU_NAMES,
} from './masa.js';
import {
  ekadashiNirnaya, smartaNirnaya, paaraneWindow, ekadashis, ekadashiForDay, chaturmasya,
  chaturmasyaStatus, CHATURMASYA_VRATAS, ARUNODAYA_MINUTES, ARUNODAYA_GHATIKAS,
  GHATIKA_MINUTES,
} from './nirnaya.js';
import { detectMahadvadashi, MAHADVADASHI_UNIMPLEMENTED } from './mahadvadashi.js';
import { aradhanaForYear, aradhanaOn, ARADHANA_TABLE } from './aradhana.js';
import {
  varaYogas, anandadiForDay, ghataForDay, anandadiYoga, nakshatra28, SHUBHA_VARA_YOGAS, ASHUBHA_VARA_YOGAS,
  VARA_YOGA_RULE, AMRITA_SIDDHI_VARJYA, ANANDADI, ANANDADI_START, GHATA_CHAKRA, GHATA_RULE, VARIANTS as VARA_YOGA_VARIANTS,
} from './varayoga.js';
import {
  dayMuhurtas, gowriPanchanga, nakshatraThyajya, dayQuality, asthaStatus, evaluateDay,
  lagnaWindows, nextMuhurtaDays, mathAyanamsa, muhurtaAyanamsa, MUHURTA_DEVATAS, DURMUHURTA,
  GOWRI_TABLE, GOWRI_GOOD, THYAJYA_GHATIS, ASTHA_ORBS, UM_TEXT, UM_KN, NAKSHATRA_CLASS, YOGA_THYAJYA_GHATIS, EVENTS,
} from './muhurta.js';
import {
  offsetMinutesAtInstant, localToUtc, utcToLocalParts, resolveBirthOffset,
  isDst, supportedZones,
} from './timezone.js';

export const DEFAULT_AYANAMSA = 'trueCitra';

/**
 * Compute a full panchanga day.
 *
 * The day runs SUNRISE TO SUNRISE. `date` names the civil date whose sunrise
 * opens the day, so every anga below is reported as it stands AT SUNRISE, with
 * the moment it ends.
 *
 * @param {object} opts
 * @param {{year:number,month:number,day:number}} opts.date  local civil date
 * @param {{latitude:number,longitude:number,altitude?:number,tzOffsetHours:number}} opts.place
 * @param {string} [opts.ayanamsa]
 */
export function computeDay({ date, place, ayanamsa: ayanamsaName = DEFAULT_AYANAMSA }) {
  validatePlace(place);
  const tz = place.tzOffsetHours;

  // Search for sunrise from local midnight of the requested date.
  const midnightJd = localToJd({ ...date, hour: 0 }, tz);
  const sunriseJd = sunrise(midnightJd, place);
  const sunsetJd = sunset(midnightJd, place);

  if (sunriseJd === null || sunsetJd === null) {
    throw new RangeError(
      `no sunrise/sunset at latitude ${place.latitude} on ` +
        `${date.year}-${date.month}-${date.day}: polar day or night. ` +
        `A sunrise-anchored panchanga is undefined here.`
    );
  }

  const nextSunriseJd = sunrise(sunriseJd + 0.5, place);
  const v = vara(sunriseJd, tz);

  // All five angas evaluated AT SUNRISE - this is the definition, not a choice.
  const t = tithi(sunriseJd);
  const n = nakshatra(sunriseJd, ayanamsaName);
  const y = yoga(sunriseJd, ayanamsaName);
  const k = karana(sunriseJd);

  // Kshaya / vriddhi detection needs tomorrow's values at tomorrow's sunrise.
  let transitions = null;
  if (nextSunriseJd !== null) {
    transitions = {
      tithi: angaTransitions(t.index, tithi(nextSunriseJd).index, 30),
      nakshatra: angaTransitions(n.index, nakshatra(nextSunriseJd, ayanamsaName).index, 27),
      yoga: angaTransitions(y.index, yoga(nextSunriseJd, ayanamsaName).index, 27),
    };
  }

  // Lunar month, year and season. Cheap (two new-moon bisections), and every
  // Madhwa observance is expressed as a (masa, paksha, tithi) triple, so this
  // is not optional context.
  const ms = masa(sunriseJd, ayanamsaName);
  const sv = samvatsara(sunriseJd, ms.index, ms.isAdhika);
  const rt = ritu(ms.index);

  // Ekadashi nirnaya for this day: whichever Ekadashi observance this day
  // plays a part in - candidate, fast, Athiriktha fast or paarane. Only the
  // days near an Ekadashi pay for the lookup.
  let ekadashi = null;
  if ([9, 10, 11, 12, 13, 14, 24, 25, 26, 27, 28, 29].includes(t.index)) {
    ekadashi = ekadashiForDay(sunriseJd, (j) => sunrise(j, place), {
      ayanamsaName, sunsetFn: (j) => sunset(j, place),
    });
  }

  const kaala = kaalaWindows(sunriseJd, sunsetJd, v.index);

  // Muhurta: the day's timed divisions and its shubha / ashubha marks. Each
  // piece names its source (see muhurta.js). Needs tonight's end, so only
  // when the next sunrise exists.
  let muhurta = null;
  if (nextSunriseJd !== null) {
    const prevSunsetJd = sunset(sunriseJd - 1, place);
    const m = dayMuhurtas({ sunriseJd, sunsetJd, nextSunriseJd, prevSunsetJd, varaIndex: v.index });
    const nitya = yogaNature(y.name);
    muhurta = {
      ...m,
      gowri: gowriPanchanga({ sunriseJd, sunsetJd, nextSunriseJd, varaIndex: v.index }),
      thyajya: nakshatraThyajya(sunriseJd, nextSunriseJd, ayanamsaName),
      dayQuality: dayQuality(v.index, n.index),
      yogas: [
        { name: `${y.name} (nitya yoga)`, nature: nitya.nature, basis: nitya.basis },
        ...(n.index === 8 && v.index === 4 ? [{ name: 'Guru Pushya yoga', nature: 'shubha', basis: 'Guruvara with Pushya nakshatra; printed by the Sri Uttaradi Math panchanga. Its Sanskrit 2024-25 edition lists it among the Amrita-siddhi yogas to AVOID for vivaha.' }] : []),
        ...(n.index === 8 && v.index === 0 ? [{ name: 'Pushyarka (Ravi Pushya) yoga', nature: 'shubha', basis: 'Ravivara with Pushya nakshatra; printed by the Sri Uttaradi Math panchanga ("Pushyaarka Yoga").' }] : []),
      ],
      astha: asthaStatus(sunriseJd),
      // The Math's page-14 vara yogas and the Anandadi (travel) yogas, each
      // with the stretch of the day it covers.
      varaYogas: varaYogas({ vara: v, sun: { riseJd: sunriseJd, nextRiseJd: nextSunriseJd } }, ayanamsaName),
      anandadi: anandadiForDay({ vara: v, sun: { riseJd: sunriseJd, nextRiseJd: nextSunriseJd } }, ayanamsaName),
    };
  }
  const ayan = ayanamsa(sunriseJd, ayanamsaName);
  const sun = { longitude: panchangaSun(sunriseJd, ayanamsaName) };
  const moon = { longitude: panchangaMoon(sunriseJd, ayanamsaName) };

  const clock = (jd) => jdToClock(jd, tz, sunriseJd);
  const iso = (jd) => jdToIso(jd, tz);

  return {
    // Provenance. A result without these is not reproducible, and the ayanamsa
    // in particular can move a nakshatra boundary by ~2 minutes.
    meta: {
      ayanamsa: ayanamsaName,
      ayanamsaDegrees: ayan,
      ayanamsaFormatted: formatDms(ayan),
      ephemerisVersion: swe.swe_version(),
      ganita: ganita(),
      sunriseConvention: sunriseConvention(),
      computedAt: new Date().toISOString(),
    },

    date: { ...date, tzOffsetHours: tz },
    place: { ...place },

    sun: {
      riseJd: sunriseJd, rise: clock(sunriseJd), riseIso: iso(sunriseJd),
      setJd: sunsetJd, set: clock(sunsetJd), setIso: iso(sunsetJd),
      nextRiseJd: nextSunriseJd, nextRise: clock(nextSunriseJd),
      dayLengthHours: (sunsetJd - sunriseJd) * 24,
      siderealLongitude: sun.longitude,
      rashi: rashiOf(sun.longitude),
    },

    moon: (() => {
      const mr = moonrise(midnightJd, place);
      const ms = moonset(midnightJd, place);
      return {
        riseJd: mr, rise: clock(mr),
        setJd: ms, set: clock(ms),
        siderealLongitude: moon.longitude,
        rashi: rashiOf(moon.longitude),
      };
    })(),

    masa: ms,
    samvatsara: sv,
    ritu: rt,
    ekadashi,

    vara: v,
    tithi: { ...t, end: clock(t.endJd), endIso: iso(t.endJd) },
    nakshatra: { ...n, end: clock(n.endJd), endIso: iso(n.endJd) },
    yoga: { ...y, end: clock(y.endJd), endIso: iso(y.endJd) },
    karana: { ...k, end: clock(k.endJd), endIso: iso(k.endJd) },
    transitions,

    muhurta: muhurta && {
      ...muhurta,
      muhurtas: muhurta.muhurtas.map((x) => withClock(x, clock)),
      durmuhurtas: muhurta.durmuhurtas.map((x) => withClock(x, clock)),
      abhijit: withClock(muhurta.abhijit, clock),
      brahma: muhurta.brahma && withClock(muhurta.brahma, (jd) => jdToClock(jd, tz)),
      gowri: muhurta.gowri.map((x) => withClock(x, clock)),
      thyajya: muhurta.thyajya.map((x) => withClock(x, clock)),
      varaYogas: muhurta.varaYogas.map((x) => withClock(x, clock)),
      anandadi: muhurta.anandadi.map((x) => withClock(x, clock)),
    },

    kaala: {
      rahu: withClock(kaala.rahu, clock),
      gulika: withClock(kaala.gulika, clock),
      yamaganda: withClock(kaala.yamaganda, clock),
      abhijit: withClock(abhijit(sunriseJd, sunsetJd, v.index), clock),
    },

    horas: horas(sunriseJd, sunsetJd, v.index).map((h) => withClock(h, clock)),
  };
}

/**
 * Nature of the nitya yoga. The nine classically inauspicious yogas are
 * listed as such, but only Vyatipata and Vaidhriti are ruled out for a
 * muhurta: that is what the Math's published muhurtas show (see muhurta.js).
 */
const INAUSPICIOUS_YOGAS = new Set(['Vishkambha', 'Atiganda', 'Shula', 'Ganda', 'Vyaghata', 'Vajra', 'Vyatipata', 'Parigha', 'Vaidhriti']);
function yogaNature(name) {
  if (name === 'Vyatipata' || name === 'Vaidhriti') {
    return { nature: 'ashubha', basis: `${name}: never among the Sri Uttaradi Math's published muhurtas; the Math prints its parvakala separately.` };
  }
  if (INAUSPICIOUS_YOGAS.has(name)) {
    return { nature: 'ashubha-classical', basis: `${name} is one of the nine yogas classically called inauspicious; the Math nevertheless lists muhurtas on it, so it is not ruled out.` };
  }
  return { nature: 'shubha', basis: `${name} is not among the classically inauspicious yogas.` };
}

/**
 * Evaluate a date as a muhurta: the day's rules, its lagna windows, and the
 * next auspicious days - for an event, and for a person when `profile`
 * (with `janma` and optionally `janmaLagna`) is given. Runs in the active
 * ganita; callers wrap it in withGanita.
 */
export function computeMuhurta({ date, place, ayanamsa: ayanamsaName = DEFAULT_AYANAMSA, event = 'general', profile = null, janma = null, janmaLagna = null, veda = null, nextCount = 3, horizonDays = 180 }) {
  const day = computeDay({ date, place, ayanamsa: ayanamsaName });
  const tz = place.tzOffsetHours;
  const evaluation = evaluateDay(day, { event, profile, janma, veda });
  const lw = lagnaWindows(day, place, { event, janma, janmaLagna, ayanamsaName, gender: profile?.gender ?? null });
  // Clock times are shown against the sunrise of the day they belong to (and
  // in that day's own offset, which can differ across a DST change).
  const dress = (w, anchor, offset = tz) => {
    const c = (jd) => jdToClock(jd, offset, anchor);
    return {
      ...w, start: c(w.startJd), end: c(w.endJd),
      usable: w.usable.map((u) => ({ ...u, start: c(u.startJd), end: c(u.endJd) })),
    };
  };
  const next = nextMuhurtaDays({
    fromDate: date, place, event, janma, janmaLagna, veda, profile, ayanamsaName, count: nextCount, horizonDays,
    computeDayFn: (d) => computeDay({ date: d, place: { ...place, tzOffsetHours: place.tzOffsetFor ? place.tzOffsetFor(d) : tz }, ayanamsa: ayanamsaName }),
  });
  return {
    date, event, ganita: ganita(),
    evaluation,
    lagnaWindows: { ...lw, windows: lw.windows.map((w) => dress(w, day.sun.riseJd)) },
    next: {
      ...next,
      found: next.found.map((f) => ({ ...f, windows: f.windows.map((w) => dress(w, f.sunriseJd, f.tzOffsetHours)) })),
    },
  };
}

function withClock(win, clock) {
  return { ...win, start: clock(win.startJd), end: clock(win.endJd) };
}

/** Rashi (sidereal sign) from a sidereal longitude. */
export function rashiOf(siderealLon) {
  const idx = Math.floor(norm360(siderealLon) / 30);
  return { index: idx + 1, name: RASHI_NAMES[idx], degreesInSign: norm360(siderealLon) - idx * 30 };
}

/** All grahas at an instant, sidereal, including the nodes. */
export function computePositions({ date, place, ayanamsa: ayanamsaName = DEFAULT_AYANAMSA, nodeType = 'mean' }) {
  validatePlace(place);
  const jd = localToJd(date, place.tzOffsetHours);
  const out = {};
  for (const [name, body] of Object.entries(GRAHA)) {
    const p = siderealLongitude(jd, body, ayanamsaName);
    out[name] = { ...p, rashi: rashiOf(p.longitude), retrograde: p.speed < 0 };
  }
  const nd = nodes(jd, ayanamsaName, nodeType);
  // The lunar nodes are always retrograde in the mean model; say so explicitly
  // rather than leaving the field absent and letting a caller infer.
  out.rahu = { ...nd.rahu, rashi: rashiOf(nd.rahu.longitude), retrograde: true };
  out.ketu = { ...nd.ketu, rashi: rashiOf(nd.ketu.longitude), retrograde: true };

  return {
    meta: {
      ayanamsa: ayanamsaName,
      ayanamsaDegrees: ayanamsa(jd, ayanamsaName),
      nodeType,
      ephemerisVersion: swe.swe_version(),
      julianDayUt: jd,
    },
    positions: out,
  };
}

function validatePlace(place) {
  if (!place || typeof place !== 'object') throw new TypeError('place is required');
  const { latitude, longitude, tzOffsetHours } = place;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`latitude must be in [-90, 90], got ${latitude}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`longitude must be in [-180, 180], got ${longitude}`);
  }
  if (!Number.isFinite(tzOffsetHours) || tzOffsetHours < -12 || tzOffsetHours > 14) {
    throw new RangeError(`tzOffsetHours must be in [-12, 14], got ${tzOffsetHours}`);
  }
}

export {
  // natal chart
  natalChart, chartSummary as natalSummary, RASHIS, RASHI_LORD, RASHI_QUALITY,
  GRAHAS, NATURAL_NATURE, navamsaOfLongitude, houseFrom, aspectsOnHouse,
  aspectsRashi, occupantsOf, drishtiOf, NODE_DRISHTI_NOTE,
  // vivaha compatibility
  deepCompatibility, mangalaDosha, mangalaComparison,
  papaLoad, papaSamya, seventhHouse,
  // kuta interpretation
  KUTA_MEANING, SCORE_BANDS, scoreBand, SCORE_CAVEAT,
  // dasha interpretation
  MAHADASHA_MEANING, functionalNature, dashaOutlook, antardashaNote,
  // angles
  norm360, angleDiff, formatDms, inverseLagrange, unwrapAngles,
  // ephemeris
  GRAHA, AYANAMSA_NAMES, ayanamsa, siderealLongitude, tropicalLongitude,
  sunMoon, lunarPhase, nodes, sunrise, sunset, moonrise, moonset, houses,
  // ganita (Surya Siddhanta default, drik optional)
  panchangaSun, panchangaMoon, withGanita, ganita, resolveGanita, GANITAS, DEFAULT_GANITA,
  // panchanga
  tithi, karana, nakshatra, yoga, vara, angaTransitions, NAKSHATRA_ARC,
  TITHI_NAMES, NAKSHATRA_NAMES, YOGA_NAMES, RASHI_NAMES, VARA_NAMES,
  // kaala
  kaalaWindows, abhijit, horas, KAALA_OFFSETS,
  // time
  localToJd, jdToLocal, jdToIso, jdToClock,
  // personal
  tarabala, chandrabala, shaniStatus, daySummary, janmaPoints, TARAS,
  // matching
  matchKutas, rashiOfNakshatraPada,
  // dasha
  vimshottari, activeDasha, saturnPeriods, nakshatraLord,
  MAHADASHA_YEARS, DASHA_ORDER, DASHA_NOTES, VIMSHOTTARI_YEAR_DAYS, VIMSHOTTARI_YEAR, vimshottariYearDays, TOTAL_YEARS,
  // remedies
  rankRemedies, REMEDY_CATALOGUE, REMEDY_DISCLAIMER,
  // masa
  masa, samvatsara, ritu, newMoonNear, findTithiDates,
  MASA_NAMES, SAMVATSARA_NAMES, RITU_NAMES,
  // nirnaya
  ekadashiNirnaya, smartaNirnaya, paaraneWindow, ekadashis, ekadashiForDay, chaturmasya,
  chaturmasyaStatus, CHATURMASYA_VRATAS, ARUNODAYA_MINUTES, ARUNODAYA_GHATIKAS,
  GHATIKA_MINUTES, detectMahadvadashi, MAHADVADASHI_UNIMPLEMENTED,
  // aradhana
  aradhanaForYear, aradhanaOn, ARADHANA_TABLE,
  // muhurta
  dayMuhurtas, gowriPanchanga, nakshatraThyajya, dayQuality, asthaStatus, evaluateDay,
  lagnaWindows, nextMuhurtaDays, mathAyanamsa, muhurtaAyanamsa, MUHURTA_DEVATAS, DURMUHURTA,
  GOWRI_TABLE, GOWRI_GOOD, THYAJYA_GHATIS, ASTHA_ORBS, UM_TEXT, UM_KN, NAKSHATRA_CLASS, YOGA_THYAJYA_GHATIS, EVENTS,
  // vara yogas, Anandadi, ghata chakra
  varaYogas, anandadiForDay, ghataForDay, anandadiYoga, nakshatra28, SHUBHA_VARA_YOGAS, ASHUBHA_VARA_YOGAS,
  VARA_YOGA_RULE, AMRITA_SIDDHI_VARJYA, ANANDADI, ANANDADI_START, GHATA_CHAKRA, GHATA_RULE, VARA_YOGA_VARIANTS,
  // timezone
  offsetMinutesAtInstant, localToUtc, utcToLocalParts, resolveBirthOffset,
  isDst, supportedZones,
};
