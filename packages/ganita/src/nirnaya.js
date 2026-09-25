/**
 * Madhwa (Vaishnava) nirnaya - the rules that decide WHICH DAY an observance
 * falls on, as distinct from the astronomy that says where the Moon is.
 *
 * This is the layer that makes the product Madhwa rather than generic, and it
 * exists in none of the reference implementations surveyed - sudhyk's
 * Ahoratra has Ekadashi only as a tithi NAME, with a commented-out
 * "// find ekadashi" in MasaFinder.swift.
 *
 * THE CENTRAL RULE
 * ----------------
 * Smarta:    Ekadashi is observed on the day the Ekadashi tithi is current at
 *            SUNRISE (suryodaya).
 * Vaishnava: Dashami must have ENDED before ARUNODAYA, which is 4 ghatikas
 *            (96 minutes) before sunrise. If even a trace of Dashami remains
 *            at arunodaya, the Ekadashi is VIDDHA (pierced) and must not be
 *            fasted on; the fast shifts to the following day.
 *
 * Consequence: the Madhwa Ekadashi is frequently ONE DAY LATER than the
 * Smarta one. An engine that computes only the sunrise tithi is not a Madhwa
 * engine.
 *
 * SOURCES: the arunodaya = 4 ghatikas rule and the dashami-vedha condition
 * are standard in the Madhwa nirnaya literature (Krishnamruta Maharnava,
 * Dharma Sindhu). Harivasara as the first QUARTER of Dwadashi, during which
 * paarane is prohibited, is likewise standard. Where a rule below is less
 * firmly attested it is marked `confidence: 'review'` rather than presented
 * as settled.
 */
import { lunarPhase, ganita } from './ephemeris.js';
import { masa, findTithiDates, newMoonNear, sunrisesBetween } from './masa.js';
import { detectMahadvadashi, MAHADVADASHI_UNIMPLEMENTED } from './mahadvadashi.js';

/** One ghatika = 24 minutes. Arunodaya is 4 of them before sunrise. */
export const GHATIKA_MINUTES = 24;
export const ARUNODAYA_GHATIKAS = 4;
export const ARUNODAYA_MINUTES = GHATIKA_MINUTES * ARUNODAYA_GHATIKAS; // 96
const ARUNODAYA_DAYS = ARUNODAYA_MINUTES / 1440;

/**
 * How far before sunrise Dashami must have ENDED for the Ekadashi to be
 * suddha (clean).
 *
 * drik: the textbook arunodaya, 4 ghatikas = 96 minutes - validated 24/24
 *   against a published drik Vaishnava calendar.
 *
 * surya (Uttaradi Math reckoning): 162 minutes, 6.75 ghatikas. MEASURED, not
 *   classical, and the discrepancy is stated rather than hidden. The Math's
 *   rules page says "Dashami should have ended before Arunodaya (96 minutes
 *   period preceding Sunrise)", but its PUBLISHED fast days follow a longer
 *   limit: across 400 Ekadashis in its 2025-26 and 2026-27 city editions
 *   (8 cities, both hemispheres), computed in Surya Siddhanta, the Math calls
 *   the Ekadashi viddha whenever Dashami ends less than ~153-163 minutes
 *   before sunrise. Fitted on the 2025-26 editions alone the limit is
 *   161-163 minutes (0/192 errors), and 162 minutes then predicts the
 *   held-out 2026-27 editions at 206/208, against 201/208 for 96 minutes.
 *   Overall 398/400. The Surya Siddhanta tithi times themselves were checked
 *   independently against the Math's printed Harivasara times (median
 *   difference -10 and +2 minutes), so the gap is in how the limit is
 *   applied, not in the ganita. To be confirmed with the Math.
 */
export const VEDHA_MINUTES = Object.freeze({ drik: ARUNODAYA_MINUTES, surya: 162 });
export const vedhaMinutes = () => VEDHA_MINUTES[ganita()];

/** Tithi index (1..30) at an instant. */
function tithiIndexAt(jd) {
  return Math.floor(lunarPhase(jd) / 12) + 1;
}

/**
 * The instant at which tithi `index` ends (i.e. elongation reaches index*12).
 * Bracketed search forward from `fromJd`, up to `maxDays`.
 */
function tithiEndInstant(fromJd, index, maxDays = 2) {
  const target = (index * 12) % 360;
  const ahead = (j) => ((lunarPhase(j) - target + 360) % 360) > 180;
  if (!ahead(fromJd)) return fromJd;
  let lo = fromJd, hi = fromJd + maxDays;
  if (ahead(hi)) return null;
  for (let k = 0; k < 60 && hi - lo > 1e-8; k++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Decide the Ekadashi observance day for one Ekadashi occurrence.
 *
 * @param {number} candidateSunriseJd sunrise of the day on which the Ekadashi
 *        tithi is current at sunrise (the Smarta day)
 * @param {(jd:number)=>number|null} sunriseFn
 */
/**
 * SMARTA nirnaya.
 *
 * The Smarta rule reckons vedha at SURYODAYA (sunrise) rather than arunodaya:
 * the Ekadashi is observed on the day the Ekadashi tithi is current at
 * sunrise. When the Ekadashi is KSHAYA - beginning after one sunrise and
 * ending before the next, so touching neither - it is observed on the day it
 * BEGINS.
 *
 * VALIDATION: against a published 2026 calendar carrying both columns for
 * Independence, Missouri, this reproduces 23 of 24 Smarta dates. The single
 * exception is VAIKUNTHA EKADASHI (published Smarta 19 December, which is a
 * Dashami sunrise). Vaikuntha Ekadashi is a Dhanurmasa observance tied to the
 * opening of the Vaikuntha Dwara at brahma muhurta and does not follow the
 * generic rule; it is flagged rather than special-cased, because inventing a
 * rule to fit one row is how an engine acquires a wrong rule.
 */
export function smartaNirnaya(candidateSunriseJd, sunriseFn, { kshaya = false } = {}) {
  const tithiAtSunrise = tithiIndexAt(candidateSunriseJd);
  const isEkadashiAtSunrise = tithiAtSunrise === 11 || tithiAtSunrise === 26;

  // Kshaya: the tithi touches no sunrise, so it is observed on the day it
  // begins - which is the candidate day itself.
  const observanceJd = candidateSunriseJd;

  return {
    smartaSunriseJd: observanceJd,
    basis: kshaya ? 'kshaya-begins-today' : isEkadashiAtSunrise ? 'suryodaya' : 'suryodaya-approx',
    tithiIndexAtSunrise: tithiAtSunrise,
    explanation: kshaya
      ? 'Smarta reckoning: the Ekadashi tithi touches no sunrise, so it is ' +
        'observed on the day it begins.'
      : 'Smarta reckoning: vedha is judged at sunrise (suryodaya), and the ' +
        'Ekadashi tithi is current at sunrise today.',
  };
}

export function ekadashiNirnaya(candidateSunriseJd, sunriseFn, { kshaya = false, ayanamsaName = 'trueCitra' } = {}) {
  const arunodayaJd = candidateSunriseJd - ARUNODAYA_DAYS;
  // Vedha is judged at the active reckoning's limit (see VEDHA_MINUTES);
  // under drik this IS arunodaya.
  const vedhaJd = candidateSunriseJd - vedhaMinutes() / 1440;
  const tithiAtArunodaya = tithiIndexAt(vedhaJd);
  const tithiAtSunrise = tithiIndexAt(candidateSunriseJd);

  // Dashami is index 10 (shukla) or 25 (krishna); Ekadashi is 11 or 26.
  const isDashami = tithiAtArunodaya === 10 || tithiAtArunodaya === 25;

  // KSHAYA EKADASHI. When the Ekadashi tithi begins and ends between two
  // sunrises it touches neither, and the candidate day's sunrise is still
  // Dashami. The tithi is therefore Dashami-pierced by construction, and the
  // Vaishnava observance moves to the following day - which is the day that
  // holds the Ekadashi at ARUNODAYA even though its sunrise is Dwadashi.
  const viddha = kshaya ? true : isDashami;

  const nextSunrise = sunriseFn(candidateSunriseJd + 0.5);

  // MAHADVADASHI. Under eight named conditions the fast moves to the Dwadashi
  // even when the Ekadashi is suddha. Five are mechanically checkable and
  // implemented; the three nakshatra-conditioned ones are reported as
  // unimplemented rather than guessed.
  const maha = detectMahadvadashi(candidateSunriseJd, sunriseFn, ayanamsaName);
  // Only a Mahadvadashi that makes the Ekadashi itself unavailable moves the
  // fast. See mahadvadashi.js for the measurement behind this.
  const mahaShift = maha.found.some((x) => x.shiftsFast);

  // The fast day: the candidate if suddha and no Mahadvadashi applies,
  // otherwise the following day.
  const fastSunriseJd = (viddha || mahaShift) ? nextSunrise : candidateSunriseJd;

  return {
    // NAMING IS DELIBERATE. `candidateSunriseJd` is the day this Ekadashi was
    // FOUND on, not an asserted Smarta observance date. Smarta nirnaya has its
    // own rules (including its own handling of kshaya and mahadvadashi) which
    // this engine does NOT implement and has NOT validated. Validation here
    // covered the MADHWA side only, against a published Smarta/Vaishnava
    // calendar: Aja Ekadashi 2026 (kshaya case) and Vaikuntha Ekadashi 2026
    // both matched on the Vaishnava date. The same source's SMARTA date for
    // Vaikuntha (19 Dec, a Dashami sunrise) did not match this candidate day,
    // and rather than fit the engine to one weakly-sourced figure it is left
    // unclaimed. Do not surface this field to users as "the Smarta date".
    candidateSunriseJd,
    madhwaSunriseJd: fastSunriseJd,
    smarta: smartaNirnaya(candidateSunriseJd, sunriseFn, { kshaya }),
    shiftedByADay: viddha || mahaShift,
    viddha,
    mahadvadashi: maha.found,
    mahadvadashiUnimplemented: maha.unimplemented,
    arunodaya: {
      jd: arunodayaJd,
      ghatikasBeforeSunrise: ARUNODAYA_GHATIKAS,
      minutesBeforeSunrise: ARUNODAYA_MINUTES,
      tithiIndexAtArunodaya: tithiIndexAt(arunodayaJd),
    },
    vedha: {
      jd: vedhaJd,
      minutesBeforeSunrise: vedhaMinutes(),
      tithiIndexAtVedhaLimit: tithiAtArunodaya,
      basis: ganita() === 'surya'
        ? 'Sri Uttaradi Math practice: limit measured from its published Ekadashi dates (398/400); its rules page states 96 minutes.'
        : 'Arunodaya, 4 ghatikas (96 minutes) before sunrise.',
    },
    tithiIndexAtSunrise: tithiAtSunrise,
    kshayaEkadashi: kshaya,
    explanation: kshaya
      ? 'This Ekadashi is KSHAYA - it begins and ends between two sunrises and ' +
        'touches neither. The candidate day still holds Dashami at sunrise, so ' +
        'the tithi is pierced by construction and the Madhwa fast moves to the ' +
        'following day, which holds Ekadashi at arunodaya.'
      : viddha
      ? `Dashami was still running ${vedhaMinutes()} minutes before sunrise, so this ` +
        'Ekadashi is viddha (pierced). The Madhwa fast moves to the following day. ' +
        'A Smarta observance would fast today.'
      : `Dashami had ended more than ${vedhaMinutes()} minutes before sunrise, so this ` +
        'is a suddha (clean) Ekadashi. The Madhwa and Smarta observances coincide.',
  };
}

/** Length of 60 ghatikas - one full day - in days. */
const SIXTY_GHATIS_DAYS = (60 * GHATIKA_MINUTES) / 1440;

/**
 * The paarane (fast-breaking) window after a Madhwa Ekadashi fast.
 *
 * Three conditions, all of which must hold:
 *   1. after sunrise on the paarane day;
 *   2. after HARIVASARA, the first QUARTER of the Dwadashi tithi, during
 *      which paarane is prohibited;
 *   3. before the Dwadashi tithi ends.
 *
 * ATHIRIKTHA VAISHNAVA EKADASHI - Sri Uttaradi Math's own rule, quoted from
 * its published panchanga (2025-26 editions, "Athiriktha Vaishnava
 * Ekadashi" box): "Whenever, Dwadashi's length (from the end of Ekadashi to
 * end of Dwadashi) is more than 60 ghatis (24 hours), that Dwadashi is
 * called Athiriktha Vaishnava Ekadashi and is a Fasting day just like
 * Ekadashi." The Math's Denver edition shows it in practice: 13 Jan 2026
 * Shattila Ekadashi, 14 Jan Athiriktha Vaishnava Ekadashi, 15 Jan "Alpa
 * Dwadashi. Parane Before 7:29". So the day after the fast is fasted too,
 * and paarane moves to the day after that.
 *
 * The Dwadashi is located from the Ekadashi that was FASTED (index 11 or
 * 26), never from whatever tithi happens to be current on the paarane day.
 * The previous version took the paarane-day sunrise tithi as "the
 * Ekadashi" whenever that sunrise was not Dwadashi, and so on ~14% of
 * Ekadashis 1900-2200 reported the window of a Trayodashi or Chaturdashi
 * labelled as Dwadashi, sometimes starting in the middle of the night.
 *
 * If the conditions leave no interval (Dwadashi over before the paarane-day
 * sunrise), `window` is null with the reason, never an inverted range.
 */
export function paaraneWindow(fastSunriseJd, sunriseFn, sunsetFn = null) {
  const idxFast = tithiIndexAt(fastSunriseJd);
  // The fast day's sunrise holds Dashami..Dwadashi of one paksha.
  const ekadashiIndex = idxFast >= 16 ? 26 : 11;

  // End of that Ekadashi = start of its Dwadashi. It ends within about a day
  // either side of the fast-day sunrise, so search from 1.5 days before.
  const dwadashiStart = tithiEndInstant(fastSunriseJd - 1.5, ekadashiIndex, 3);
  const dwadashiEnd = dwadashiStart === null
    ? null : tithiEndInstant(dwadashiStart + 1e-6, ekadashiIndex + 1, 2);
  if (dwadashiStart === null || dwadashiEnd === null) {
    return { window: null, reason: 'could not bracket the Dwadashi tithi' };
  }
  const dwadashiLength = dwadashiEnd - dwadashiStart;

  const dayAfterFast = sunriseFn(fastSunriseJd + 0.5);
  if (dayAfterFast === null) return { window: null, reason: 'no sunrise after the fast day' };
  const twoAfterFast = sunriseFn(dayAfterFast + 0.5);

  // "More than 60 ghatis" read as: the Dwadashi covers one ENTIRE day, sunrise
  // to sunrise (60 ghatis), i.e. it is current at sunrise both on the day
  // after the fast and on the day after that. Measured, not assumed: the
  // literal reading (tithi length > 24 h) flagged about a dozen Athiriktha
  // days a year at each city, while the Math's 2025-27 editions print at most
  // one; this reading reproduces the Math's cases (Chicago, Denver, Los
  // Angeles 14 Jan 2026; Dubai 7 Jun 2025) and its "NO OCCASSION" years.
  const athiriktha = twoAfterFast !== null &&
    dwadashiStart < dayAfterFast && dwadashiEnd > twoAfterFast &&
    dwadashiLength > SIXTY_GHATIS_DAYS;
  let paaraneSunrise = athiriktha ? sunriseFn(dayAfterFast + 0.5) : dayAfterFast;
  if (paaraneSunrise === null) return { window: null, reason: 'no sunrise on the paarane day' };

  const harivasaraEnd = dwadashiStart + dwadashiLength / 4;
  const end = dwadashiEnd;

  // Paarane is a daytime act. When Ekadashi is still current at sunrise on
  // the day after the fast, Dwadashi only begins that evening and Harivasara
  // can end in the night; the earliest valid paarane is then the NEXT
  // morning, provided Dwadashi is still running. Reported as `deferred` with
  // confidence 'review' - this follows from the three conditions above, but
  // no Uttaradi Math edition in hand (2025-27) contains such a case to check.
  let deferred = false;
  let nextSunrise = sunriseFn(paaraneSunrise + 0.5);
  const daylightEnd = sunsetFn ? sunsetFn(paaraneSunrise) : null;
  if (daylightEnd !== null && harivasaraEnd >= daylightEnd &&
      nextSunrise !== null && end > nextSunrise) {
    paaraneSunrise = nextSunrise;
    nextSunrise = sunriseFn(paaraneSunrise + 0.5);
    deferred = true;
  }
  const start = Math.max(paaraneSunrise, harivasaraEnd);

  // A window that opens after the paarane day has ended is not a window on
  // that day - report it rather than hand back a night-time interval.
  const sameDay = nextSunrise === null || start < nextSunrise;
  const ok = end > start && sameDay;

  return {
    ekadashiIndex,
    // Kept under its old name for callers: the SUNRISE OF THE PAARANE DAY.
    dwadashiSunriseJd: paaraneSunrise,
    paaraneSunriseJd: paaraneSunrise,
    dwadashiStartJd: dwadashiStart,
    dwadashiEndJd: dwadashiEnd,
    dwadashiLengthGhatis: dwadashiLength * 1440 / GHATIKA_MINUTES,
    deferred: deferred
      ? { confidence: 'review', note: 'Ekadashi was still current at sunrise after the fast and Harivasara ends after sunset, so paarane moves to the next morning.' }
      : null,
    athiriktha: athiriktha
      ? {
          jd: dayAfterFast,
          note: 'Dwadashi runs longer than 60 ghatis, so the day after the fast ' +
            'is Athiriktha Vaishnava Ekadashi and is also a fasting day ' +
            '(Sri Uttaradi Math panchanga). Paarane is on the following day.',
        }
      : null,
    harivasara: {
      startJd: dwadashiStart,
      endJd: harivasaraEnd,
      note: 'First quarter of Dwadashi. Paarane is prohibited during Harivasara.',
    },
    window: ok ? { startJd: start, endJd: end } : null,
    reason: ok
      ? null
      : end <= paaraneSunrise
      ? 'Dwadashi ends before sunrise on the paarane day, so there is no ' +
        'Dwadashi left to break the fast in; confirm with the matha panchanga.'
      : 'Harivasara does not clear before Dwadashi ends on the paarane day; ' +
        'confirm with the matha panchanga.',
    constrainedBy: start === harivasaraEnd ? 'harivasara' : 'sunrise',
  };
}

/**
 * The Ekadashi observance a given DAY belongs to, and that day's role in it.
 *
 * A panchanga shows one day at a time, but a Madhwa Ekadashi can involve up
 * to four days: the day the tithi is found (candidate), the fast (often the
 * NEXT day, after arunodaya vedha or a kshaya Ekadashi), an Athiriktha fast,
 * and paarane. Evaluating only "is today's sunrise Ekadashi" left the real
 * fast day unmarked whenever the fast shifted - about one Ekadashi in ten -
 * because that day's sunrise holds Dwadashi.
 *
 * Returns null when the day has no part in an Ekadashi observance.
 */
export function ekadashiForDay(sunriseJd, sunriseFn, { ayanamsaName = 'trueCitra', sunsetFn = null } = {}) {
  // Today and the three sunrises before it: a candidate three days back
  // can still own today as its paarane day (shift + athiriktha).
  const days = [sunriseJd];
  for (let k = 0; k < 4; k++) {
    const prev = sunriseFn(days[0] - 1.5);
    if (prev === null || prev >= days[0] - 0.5) break;
    days.unshift(prev);
  }
  const next = sunriseFn(sunriseJd + 0.5);
  if (next !== null) days.push(next);
  const idx = days.map(tithiIndexAt);
  const isEk = (i) => i === 11 || i === 26;

  // Candidates, latest first, so today's own Ekadashi wins over an older one.
  for (let c = days.length - 2; c >= 1; c--) {
    const advanced = ((idx[c + 1] - idx[c]) + 30) % 30;
    let kshaya = false;
    for (let k = 1; k < advanced; k++) {
      if (isEk(((idx[c] + k - 1) % 30) + 1)) { kshaya = true; break; }
    }
    // The first sunrise of an Ekadashi only - not the second day of a
    // vriddhi Ekadashi, which belongs to the candidate before it.
    const first = isEk(idx[c]) && !isEk(idx[c - 1]);
    if (!first && !kshaya) continue;
    if (days[c] > sunriseJd + 1e-6) continue;

    const n = ekadashiNirnaya(days[c], sunriseFn, { kshaya, ayanamsaName });
    const p = paaraneWindow(n.madhwaSunriseJd, sunriseFn, sunsetFn);
    const same = (jd) => jd != null && Math.abs(jd - sunriseJd) < 0.5;
    const role =
      same(n.madhwaSunriseJd) ? 'fast'
      : same(p?.athiriktha?.jd) ? 'athiriktha'
      : same(p?.paaraneSunriseJd) ? 'paarane'
      : same(n.candidateSunriseJd) ? 'candidate'
      : null;
    if (role === null) continue;
    return {
      ...n,
      role,
      isFastDayToday: role === 'fast' || role === 'athiriktha',
      isParaneToday: role === 'paarane',
      paarane: p,
    };
  }
  return null;
}

/**
 * All Ekadashis in a date range, with Madhwa nirnaya applied.
 *
 * Returns BOTH the Smarta and Madhwa days so the difference is visible rather
 * than silently applied - for this audience the divergence is the point.
 */
export function ekadashis({ fromJd, toJd, sunriseFn, ayanamsaName, sunsetFn = null }) {
  const out = [];
  // One entry per Hindu day, chained sunrise to sunrise - see sunrisesBetween
  // for why stepping through UT midnights skipped and repeated days. One extra
  // day at the end supplies the "next sunrise" for the last day in range.
  const srs = sunrisesBetween(fromJd, toJd + 1.5, sunriseFn);

  // Walk day by day. An Ekadashi qualifies if it is current at sunrise, OR if
  // it is KSHAYA - beginning and ending entirely between two sunrises, so it
  // never touches one at all.
  //
  // The kshaya case is not exotic. Aja Ekadashi 2026 is exactly this: at
  // Independence, Missouri the 6 September sunrise is Krishna Dashami and the
  // 7 September sunrise is already Krishna Dwadashi. A scan that only looks
  // for "Ekadashi at sunrise" finds NO Ekadashi that month, which is both
  // wrong and silent - the worst combination.
  let i = 0;
  while (i < srs.length && srs[i] <= toJd) {
    const sr = srs[i];
    {
      const idx = tithiIndexAt(sr);
      const nextSr = srs[i + 1] ?? null;
      const nextIdx = nextSr === null ? null : tithiIndexAt(nextSr);

      // Does an Ekadashi begin during this day without surviving to a sunrise?
      let kshaya = false;
      let ekadashiIdx = idx;
      if (nextIdx !== null) {
        const advanced = ((nextIdx - idx) + 30) % 30;
        for (let k = 1; k < advanced; k++) {
          const skipped = ((idx + k - 1) % 30) + 1;
          if (skipped === 11 || skipped === 26) { kshaya = true; ekadashiIdx = skipped; break; }
        }
      }

      if (idx === 11 || idx === 26 || kshaya) {
          const n = ekadashiNirnaya(sr, sunriseFn, { kshaya, ayanamsaName });
        const p = paaraneWindow(n.madhwaSunriseJd, sunriseFn, sunsetFn);
        const m = masa(sr, ayanamsaName);
        out.push({
          masa: m,
          // From the Ekadashi itself, not the sunrise tithi: for a kshaya
          // Ekadashi the sunrise holds Dashami, and `idx === 11` labelled every
          // kshaya SHUKLA Ekadashi as krishna.
          paksha: ekadashiIdx === 11 ? 'shukla' : 'krishna',
          nirnaya: n,
          paarane: p,
        });
        // Skip ahead: two Ekadashis cannot be within 10 days of each other.
        i += 10;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

/* ------------------------------------------------------------ chaturmasya */

/**
 * The four Chaturmasya vratas.
 *
 * Each runs from a Shukla Ekadashi to the FOLLOWING month's Shukla Dashami.
 * Verified against a Madhwa source (madhwamrutha.org).
 *
 * NOTE ON THE OVERALL START DATE: that same source gives the encompassing
 * period as Ashadha Shukla Dashami to Kartika Shukla Paurnima, while listing
 * the first vrata as starting on Ashadha Shukla EKADASHI. The source itself
 * leaves that discrepancy unresolved, and practice varies by matha - some
 * take the sankalpa on Dwadashi. We therefore report the four vrata windows,
 * which are unambiguous, and mark the overall span `confidence: 'review'`.
 */
export const CHATURMASYA_VRATAS = Object.freeze([
  {
    id: 'shaka', name: 'Shaka Vrata', kannada: 'ಶಾಕ ವ್ರತ',
    startMasa: 'Ashadha', endMasa: 'Shravana',
    prohibits: 'Vegetables, fruits and leafy greens are not offered or eaten.',
  },
  {
    id: 'dadhi', name: 'Dadhi Vrata', kannada: 'ದಧಿ ವ್ರತ',
    startMasa: 'Shravana', endMasa: 'Bhadrapada',
    prohibits: 'Curds and yoghurt are not offered or eaten.',
  },
  {
    id: 'ksheera', name: 'Ksheera Vrata', kannada: 'ಕ್ಷಿರ ವ್ರತ',
    startMasa: 'Bhadrapada', endMasa: 'Ashvayuja',
    prohibits: 'Milk and all its derivatives are not offered or eaten.',
  },
  {
    id: 'dwidala', name: 'Dwidala Vrata', kannada: 'ದ್ವಿದಳ ವ್ರತ',
    startMasa: 'Ashvayuja', endMasa: 'Kartika',
    prohibits: 'Split pulses - channa, toor, masoor, urad - and groundnuts.',
  },
]);

/**
 * Resolve the four Chaturmasya windows for a Gregorian year.
 *
 * `nija` filtering: in an adhika-masa year a month name can occur twice. The
 * vrata follows the NIJA (true) month, so an adhika occurrence is discarded.
 */
export function chaturmasya({ year, sunriseFn, ayanamsaName, tzOffsetHours = 5.5, localToJd }) {
  const fromJd = localToJd({ year, month: 5, day: 1, hour: 0 }, tzOffsetHours);
  const toJd = localToJd({ year, month: 12, day: 31, hour: 0 }, tzOffsetHours) + 1; // through the end of 31 Dec

  const pick = (masaName, tithiNumber) => {
    const all = findTithiDates({
      masaName, paksha: 'shukla', tithiNumber, fromJd, toJd, ayanamsaName, sunriseFn,
    });
    const nija = all.filter((x) => !x.masa.isAdhika);
    return { chosen: nija[0] ?? null, adhikaSkipped: all.length - nija.length };
  };

  const vratas = CHATURMASYA_VRATAS.map((v) => {
    const s = pick(v.startMasa, 11); // Shukla Ekadashi
    const e = pick(v.endMasa, 10);   // Shukla Dashami
    return {
      ...v,
      startJd: s.chosen?.jd ?? null,
      endJd: e.chosen?.jd ?? null,
      adhikaSkipped: s.adhikaSkipped + e.adhikaSkipped,
      incomplete: !s.chosen || !e.chosen,
    };
  });

  return {
    year,
    vratas,
    overall: {
      startJd: vratas[0].startJd,
      endJd: vratas[3].endJd,
      confidence: 'review',
      note:
        'Sources differ on the encompassing span: madhwamrutha.org gives ' +
        'Ashadha Shukla Dashami to Kartika Shukla Paurnima while listing the ' +
        'first vrata from Ashadha Shukla Ekadashi, and some mathas take the ' +
        'sankalpa on Dwadashi. The four vrata windows below are unambiguous; ' +
        'the overall span shown here is simply the first vrata start to the ' +
        'last vrata end and should be confirmed against your matha’s panchanga.',
    },
    marriageBlackout: {
      startJd: vratas[0].startJd,
      endJd: vratas[3].endJd,
      note:
        'Marriages and upanayana are not performed during Chaturmasya, as ' +
        'Sri Narayana is held to be in yoga nidra. The muhurta engine treats ' +
        'this span as unavailable for those events.',
    },
  };
}

/** Is `jd` inside any Chaturmasya vrata for its year? */
export function chaturmasyaStatus(jd, ctx) {
  const c = chaturmasya({ ...ctx, year: ctx.gregorianYear });
  const active = c.vratas.find(
    (v) => v.startJd !== null && v.endJd !== null && jd >= v.startJd && jd <= v.endJd
  );
  return {
    active: Boolean(active),
    vrata: active ?? null,
    marriageBlackout:
      c.marriageBlackout.startJd !== null &&
      jd >= c.marriageBlackout.startJd && jd <= c.marriageBlackout.endJd,
  };
}
