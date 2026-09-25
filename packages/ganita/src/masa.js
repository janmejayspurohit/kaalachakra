/**
 * Lunar month (masa), paksha and samvatsara.
 *
 * Every Madhwa observance is expressed as a (masa, paksha, tithi) triple, so
 * nothing in the nirnaya layer works without this.
 *
 * SOUTH INDIA / KANNADA USES AMANTA reckoning: the lunar month runs from one
 * new moon to the next, so the month changes at Amavasya. North India uses
 * purnimanta (month changes at Purnima), which shifts the KRISHNA paksha into
 * the previous month's name. The two disagree about the month name of every
 * krishna-paksha date, which is why festival dates appear to differ by a month
 * between regions even when the tithi is identical.
 */
import { norm360 } from './angles.js';
import { lunarPhase, panchangaSun } from './ephemeris.js';

export const MASA_NAMES = [
  'Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada',
  'Ashvayuja', 'Kartika', 'Margashira', 'Pushya', 'Magha', 'Phalguna',
];

/** The 60-year Jovian cycle, starting from Prabhava. */
export const SAMVATSARA_NAMES = [
  'Prabhava', 'Vibhava', 'Shukla', 'Pramoduta', 'Prajotpatti', 'Angirasa',
  'Shrimukha', 'Bhava', 'Yuva', 'Dhatu', 'Ishvara', 'Bahudhanya',
  'Pramathi', 'Vikrama', 'Vrisha', 'Chitrabhanu', 'Svabhanu', 'Tarana',
  'Parthiva', 'Vyaya', 'Sarvajit', 'Sarvadhari', 'Virodhi', 'Vikriti',
  'Khara', 'Nandana', 'Vijaya', 'Jaya', 'Manmatha', 'Durmukhi',
  'Hevilambi', 'Vilambi', 'Vikari', 'Sharvari', 'Plava', 'Shubhakrit',
  'Shobhakrit', 'Krodhi', 'Vishvavasu', 'Parabhava', 'Plavanga', 'Kilaka',
  'Saumya', 'Sadharana', 'Virodhikrit', 'Paridhavi', 'Pramadicha', 'Ananda',
  'Rakshasa', 'Nala', 'Pingala', 'Kalayukti', 'Siddharthi', 'Raudri',
  'Durmathi', 'Dundubhi', 'Rudhirodgari', 'Raktakshi', 'Krodhana', 'Akshaya',
];

export const RITU_NAMES = [
  'Vasanta', 'Grishma', 'Varsha', 'Sharad', 'Hemanta', 'Shishira',
];

/**
 * Find the instant of a new moon (elongation crossing 0/360) near `jd`.
 *
 * `direction` -1 searches backwards for the most recent one, +1 forwards for
 * the next. Bisection on the elongation, which is monotonic in the small
 * windows used here.
 */
export function newMoonNear(jd, direction) {
  const SYNODIC = 29.530588;
  // Elongation measured so that it is 0 exactly at conjunction and increases.
  const phase = (j) => lunarPhase(j);

  // Step in half-day increments until the phase wraps past 360 -> 0.
  const step = direction * 0.5;
  let prev = jd;
  let prevPhase = phase(prev);
  for (let i = 0; i < Math.ceil((SYNODIC + 2) / 0.5); i++) {
    const cur = prev + step;
    const curPhase = phase(cur);
    // A wrap means we straddled conjunction.
    const wrapped = direction > 0 ? curPhase < prevPhase : curPhase > prevPhase;
    if (wrapped) {
      let lo = direction > 0 ? prev : cur;
      let hi = direction > 0 ? cur : prev;
      for (let k = 0; k < 60 && hi - lo > 1e-8; k++) {
        const mid = (lo + hi) / 2;
        if (phase(mid) > 180) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prev = cur;
    prevPhase = curPhase;
  }
  throw new RangeError(`no new moon found within a synodic month of jd ${jd}`);
}

/** Sidereal solar rashi index 1..12 at an instant. */
function solarRashi(jd, ayanamsaName) {
  const lon = panchangaSun(jd, ayanamsaName);
  return Math.floor(norm360(lon) / 30) + 1;
}

/**
 * The lunar month containing `jd`.
 *
 * NAMING RULE (amanta): the month is named for the solar rashi the Sun
 * occupies at the new moon that BEGINS it, offset by one - Chaitra begins at
 * the new moon while the Sun is still in Meena (12), and the Sun enters Mesha
 * during Chaitra. Hence masaIndex = (rashiAtStart % 12) + 1.
 *
 * ADHIKA MASA (leap): if the Sun is in the SAME rashi at both the opening and
 * closing new moons, no sankranti occurred during that lunar month, and the
 * month is intercalary. It takes the name of the following month with the
 * prefix "Adhika". This happens roughly every 32.5 months and is the single
 * most common source of a wrong festival date in a naive implementation.
 *
 * KSHAYA MASA (omitted month) - when two sankrantis fall within one lunar
 * month - is possible but rare (roughly once in 19-141 years) and is NOT
 * handled here. It is reported via the `twoSankrantis` flag so a caller can
 * refuse rather than silently produce a wrong month name.
 */
export function masa(jd, ayanamsaName) {
  const start = newMoonNear(jd, -1);
  const end = newMoonNear(jd, +1);

  const rashiStart = solarRashi(start + 1e-4, ayanamsaName);
  const rashiEnd = solarRashi(end - 1e-4, ayanamsaName);

  const isAdhika = rashiStart === rashiEnd;
  const index = (rashiStart % 12) + 1;

  // Two sankrantis inside one lunar month => the following month is kshaya.
  const spanRashis = ((rashiEnd - rashiStart) + 12) % 12;
  const twoSankrantis = spanRashis >= 2;

  return {
    index,
    name: MASA_NAMES[index - 1],
    displayName: isAdhika ? `Adhika ${MASA_NAMES[index - 1]}` : MASA_NAMES[index - 1],
    isAdhika,
    twoSankrantis,
    startJd: start,
    endJd: end,
    solarRashiAtStart: rashiStart,
    solarRashiAtEnd: rashiEnd,
    reckoning: 'amanta',
  };
}

/**
 * Samvatsara (the 60-year cycle name).
 *
 * Computed from the elapsed Kali Yuga year. `ahargana` is days since the Kali
 * epoch (JD 588465.5), and the sidereal year is 365.25636 days.
 *
 * NOTE ON ACCURACY: there are two competing samvatsara reckonings in use -
 * the northern (Jovian, tied to Jupiter's actual transit) and the southern
 * (mean, tied to the solar year). South India, including the Madhwa mathas,
 * uses the SOUTHERN/mean reckoning, which is what this computes. They can
 * differ by one name in some years, so this must be validated against a
 * printed panchanga before being trusted for ritual use.
 */
export const SAMVATSARA_KALI_OFFSET = 12;

export function samvatsara(jd, masaIndex, isAdhika = false) {
  // ADHIKA CHAITRA belongs to the OLD year: the samvatsara changes at Ugadi,
  // Chaitra Shukla Pratipada of the NIJA month. Without this the name flipped
  // a month early in all nine Adhika-Chaitra years 1900-2200 (1945, 1964,
  // 2029, 2048, 2067, 2086, 2105, 2124, 2189). Basis, per the user's rule to
  // follow Uttaradi Math: the Math's panchanga puts annual observances of a
  // doubled month in the NIJA month ("Annual shraddha due in Jyeshta Masa,
  // has to be performed during Nija Jyeshta masa only"), and drikpanchang
  // gives Ugadi 2029 as 14 April (Nija Chaitra), not 15 March (Adhika).
  // No Math edition for an Adhika-Chaitra year was available to confirm;
  // check the 2029-30 edition when it is published.
  const effectiveIndex = isAdhika && masaIndex === 1 ? 13 : masaIndex;
  const ahargana = jd - 588465.5;
  const kali = Math.floor((ahargana + (4 - effectiveIndex) * 30) / 365.25636);

  // CALIBRATED, not guessed. drik-panchanga uses
  //   (kali + 27 + floor((kali*211 - 108)/18000)) % 60
  // which yields +27 (mod 60) in this era and produced Durmathi for
  // 2026-27 where the published Kannada/Telugu panchangas say Parabhava -
  // a 15-name error. That formula targets a different (northern/Jovian)
  // reckoning.
  //
  // The correct southern offset was measured against four consecutive
  // published Ugadi samvatsaras, and came out identical every time:
  //   kali 5125 -> Krodhi, 5126 -> Vishvavasu, 5127 -> Parabhava,
  //   5128 -> Plavanga   => offset +12 in all four cases.
  const index = (kali + SAMVATSARA_KALI_OFFSET) % 60;

  return {
    index: index + 1,
    name: SAMVATSARA_NAMES[index],
    kaliYear: kali,
    reckoning: 'southern-mean',
  };
}

/** Ritu (season) - two masas each, starting with Vasanta at Chaitra. */
export function ritu(masaIndex) {
  const i = Math.floor((masaIndex - 1) / 2);
  return { index: i + 1, name: RITU_NAMES[i] };
}

/**
 * Every sunrise from the first one after `fromJd` up to `toJd`, in order.
 *
 * Chained sunrise to sunrise (the next is searched from half a day after the
 * last), so the sequence has exactly one entry per Hindu day. The previous
 * scans stepped through UT midnights and asked for "the next sunrise" from
 * each, which breaks wherever sunrise crosses UT midnight - 05:30 IST, which
 * Delhi, Kolkata and Guwahati sunrises all cross once a year. That skipped
 * one day and counted the next twice, every year, at every such place: a
 * skipped Ekadashi sunrise was then misread as a kshaya Ekadashi.
 *
 * Stops (rather than guessing) at a polar day/night where no sunrise exists.
 */
export function sunrisesBetween(fromJd, toJd, sunriseFn) {
  const out = [];
  let sr = sunriseFn(fromJd);
  while (sr !== null && sr <= toJd) {
    out.push(sr);
    sr = sunriseFn(sr + 0.5);
  }
  return out;
}

/**
 * Resolve a (masa, paksha, tithi) triple to the Julian Day on which that
 * tithi is current at sunrise, within a given Gregorian year window.
 *
 * This is what turns "Ashadha Shukla Ekadashi" into a date, and it is the
 * backbone of both the Chaturmasya calendar and the aradhana list.
 *
 * Returns ALL matches in the window - an adhika masa genuinely produces two
 * occurrences of the same triple in one year, and silently returning the
 * first would hide that.
 */
export function findTithiDates({ masaName, paksha, tithiNumber, fromJd, toJd, ayanamsaName, sunriseFn }) {
  if (!MASA_NAMES.includes(masaName)) {
    throw new RangeError(`unknown masa "${masaName}". Known: ${MASA_NAMES.join(', ')}`);
  }
  if (!['shukla', 'krishna'].includes(paksha)) {
    throw new RangeError(`paksha must be "shukla" or "krishna", got "${paksha}"`);
  }
  if (!Number.isInteger(tithiNumber) || tithiNumber < 1 || tithiNumber > 15) {
    throw new RangeError(`tithiNumber must be 1..15, got ${tithiNumber}`);
  }

  const targetIndex = paksha === 'shukla' ? tithiNumber : tithiNumber + 15;
  const out = [];

  // Collect each day's sunrise and the tithi current at it.
  const days = sunrisesBetween(fromJd, toJd, sunriseFn)
    .map((sr) => ({ sr, idx: Math.floor(lunarPhase(sr) / 12) + 1 }));

  for (let i = 0; i < days.length; i++) {
    const { sr, idx } = days[i];
    let matched = null;

    if (idx === targetIndex) {
      matched = 'sunrise';
    } else if (i + 1 < days.length) {
      // KSHAYA (skipped tithi). A tithi can begin and end entirely between two
      // sunrises, so it is never "current at sunrise" and a naive search finds
      // nothing at all. This is not rare: Chaitra Shukla Pratipada was kshaya
      // in 2026, which is exactly why Ugadi fell on 19 March (the day the
      // tithi BEGAN) rather than the 20th.
      //
      // Detect it by a jump of more than one between consecutive sunrises,
      // and attribute the tithi to the day on which it begins.
      const next = days[i + 1].idx;
      const advanced = ((next - idx) + 30) % 30;
      if (advanced > 1) {
        for (let k = 1; k < advanced; k++) {
          if (((idx + k - 1) % 30) + 1 === targetIndex) { matched = 'kshaya'; break; }
        }
      }
    }
    if (!matched) continue;

    // Which instant do we ask "what month is this?" about?
    //
    // For the sunrise case, sunrise itself. For a KSHAYA tithi we must use the
    // moment the tithi BEGINS, not sunrise: a tithi skipped at the start of a
    // lunar month begins after that day's sunrise, and at sunrise the old
    // month is still running. Looking up masa at sunrise then returns the
    // PREVIOUS month and the match is silently discarded - which is exactly
    // how Ugadi 2026 went missing before this was fixed.
    const probe = matched === 'kshaya'
      ? tithiStartInstant(sr, days[i + 1].sr, targetIndex) + 1e-4
      : sr;

    const m = masa(probe, ayanamsaName);
    if (m.name !== masaName) continue;

    out.push({
      jd: sr,
      masa: m,
      tithiIndex: targetIndex,
      paksha,
      tithiNumber,
      // 'sunrise' = the tithi was current at sunrise (the normal case).
      // 'kshaya'  = the tithi is skipped; this is the day it begins.
      resolution: matched,
    });
  }
  return out;
}

/**
 * The instant a given tithi index begins, bracketed by two sunrises.
 *
 * Bisection on the elongation reaching (index-1)*12 degrees. Used only for
 * kshaya resolution, where the tithi never touches a sunrise and so has no
 * other observable anchor.
 */
function tithiStartInstant(loJd, hiJd, tithiIndex) {
  const target = (tithiIndex - 1) * 12;
  const before = (j) => {
    // True while the elongation is still short of `target`, handling the
    // 360 -> 0 wrap by measuring relative to the target.
    const d = (lunarPhase(j) - target + 360) % 360;
    return d > 180;
  };
  let lo = loJd, hi = hiJd;
  if (!before(lo)) return lo;
  for (let k = 0; k < 60 && hi - lo > 1e-8; k++) {
    const mid = (lo + hi) / 2;
    if (before(mid)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
