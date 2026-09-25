/**
 * Muhurta: the day's timed divisions, shubha / ashubha yogas, and the choice
 * of an auspicious time - for a day in general, and for a person.
 *
 * EVERY RULE HERE CARRIES ITS BASIS, and the verdict is always returned as a
 * list of points, each naming the rule, whether it passed, and where the rule
 * comes from. A verdict without its reasons is not something a family should
 * fix a marriage on.
 *
 * Sources, in order of authority (the user's standing rule: follow Sri
 * Uttaradi Math where anything is uncertain):
 *
 *  UM-TEXT      Sri Uttaradi Math panchanga, "General Information about
 *               Muhurthas" and "Tharabala" pages (2025-26, 2026-27 English
 *               city editions). Quoted verbatim in `basis`.
 *  UM-KN        The Math's KANNADA edition (2025-26, 2026-27): its muhurta
 *               notes, "ಜ್ಯೋತಿಷ್ಯದ ಸಾಮಾನ್ಯ ಪರಿಚಯ" and the tarabala /
 *               chandrabala tables, quoted verbatim in Kannada with a
 *               translation. Where the English and Kannada texts differ (lagna
 *               thyajya), the one the Math's published muhurtas obey wins.
 *  UM-KN-LIST   The 133 muhurtas the Kannada editions publish (Upanayana,
 *               Vivaha, Vastu, Pratishtha: date, tithi, vara, nakshatra,
 *               lagna, amsha, time), in test/fixtures/uttaradi-math-kannada-
 *               muhurtas-2025-2027.json. A rule the Math's own list breaks is
 *               a caution here, never a failure.
 *  UM-PRACTICE  What the Math's own published muhurta tables actually contain:
 *               501 dated Vivaha/Upanayana muhurtas across its 2025-27 city
 *               editions, recomputed in Surya Siddhanta. Used where the text is
 *               silent, and never to override the text.
 *  UM-TABLE     Tables the Math prints on every page, extracted and
 *               cross-checked across all 16 editions (Gowri panchanga, the
 *               vara-nakshatra day quality, astha windows).
 *  SUDHYK       sudhyk's Ahoratra (AHCore Muhurtha/*.swift) - the user's domain
 *               authority - for the 30 muhurtas and durmuhurta.
 *  CLASSICAL    Muhurta Chintamani and the standard muhurta texts, only where
 *               neither the Math nor sudhyk says anything.
 */
import {
  panchangaMoon, tropicalLongitude, tropicalAscendant, ganita, withGanita, ayanamsa as ayanamsaOf, swe,
} from './ephemeris.js';
import { norm360 } from './angles.js';
import { nextAnga, varaYogas, anandadiForDay, ghataForDay, VARA_YOGA_RULE, AMRITA_SIDDHI_VARJYA, GHATA_RULE } from './varayoga.js';
import {
  NAKSHATRA_NAMES, RASHI_NAMES, VARA_NAMES, tithi as tithiAt, nakshatra as nakshatraAt, yoga as yogaAt, karana as karanaAt,
} from './panchanga.js';

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/* ============================================================ the 30 muhurtas */

/**
 * The fifteen day and fifteen night muhurtas, by presiding devata.
 * SUDHYK: AHDataTypes/Muhurtha/PDDeva.swift (the Muhurta Chintamani order).
 */
export const MUHURTA_DEVATAS = Object.freeze([
  'Rudra', 'Ahi', 'Mitra', 'Pitri', 'Vasu', 'Vari', 'Vishvadeva', 'Vidhi (Abhijit)',
  'Satamukhi', 'Puruhuta', 'Vahni', 'Naktanchara', 'Varuna', 'Aryaman', 'Bhaga',
  'Shiva', 'Ajapada', 'Ahirbudhnya', 'Pushan', 'Ashvini', 'Yama', 'Agni', 'Vidhatri',
  'Chandra', 'Aditi', 'Brihaspati', 'Vishnu', 'Surya', 'Tvashtri', 'Vayu',
]);

/** SUDHYK: PanchaDashaMM.swift - the muhurtas held inauspicious on every day (1-based). */
export const MUHURTA_INAUSPICIOUS = Object.freeze([1, 2, 4, 10, 11, 12, 15, 16, 17, 21, 22]);

/**
 * Durmuhurta by weekday, 1-based over the 30 (16..30 are the night).
 *
 * sudhyk's two tables disagree on two days: MuhurthaManager.swift (offsets
 * copied from drik-panchanga) gives Tuesday = day 4 + NIGHT 7 and Saturday =
 * day 3; PanchaDashaMM.swift gives Tuesday = day 4 + day 11 and Saturday =
 * day 1 + day 2. The classical table (Muhurta Chintamani, also what
 * drikpanchang prints) is Tuesday = day 4 + night 7 and Saturday = day 1 + 2,
 * i.e. one table right on each day. Taking each from the table that agrees
 * with the classical list; every other weekday agrees across all three.
 */
export const DURMUHURTA = Object.freeze({
  0: [14], 1: [9, 12], 2: [4, 22], 3: [8], 4: [6, 12], 5: [4, 9], 6: [1, 2],
});

/**
 * The thirty muhurtas of the day that opens at `sunriseJd`, plus Brahma
 * muhurta (the 14th muhurta of the night that ENDS at this sunrise).
 */
export function dayMuhurtas({ sunriseJd, sunsetJd, nextSunriseJd, prevSunsetJd, varaIndex }) {
  const day = (sunsetJd - sunriseJd) / 15;
  const night = (nextSunriseJd - sunsetJd) / 15;
  const dur = new Set(DURMUHURTA[varaIndex]);
  const list = MUHURTA_DEVATAS.map((devata, i) => {
    const isDay = i < 15;
    const startJd = isDay ? sunriseJd + i * day : sunsetJd + (i - 15) * night;
    const endJd = startJd + (isDay ? day : night);
    const index = i + 1;
    const durmuhurta = dur.has(index);
    return {
      index, devata, part: isDay ? 'day' : 'night', startJd, endJd,
      nature: durmuhurta || MUHURTA_INAUSPICIOUS.includes(index) ? 'ashubha' : 'shubha',
      durmuhurta,
    };
  });
  let brahma = null;
  if (Number.isFinite(prevSunsetJd)) {
    const prevNight = (sunriseJd - prevSunsetJd) / 15;
    brahma = {
      name: 'Brahma muhurta', startJd: sunriseJd - 2 * prevNight, endJd: sunriseJd - prevNight,
      basis: 'The 14th of the 15 night muhurtas before sunrise (sudhyk uses the equal-hours ' +
        'form, 96 to 48 minutes before sunrise, which this equals when the night is 12 hours).',
    };
  }
  return {
    muhurtas: list,
    durmuhurtas: list.filter((m) => m.durmuhurta),
    abhijit: list[7],
    brahma,
  };
}

/* ============================================================ Gowri panchanga */

/**
 * UM-TABLE: the Gowri panchanga printed on the Math's calendar pages. Rows are
 * the 8 day parts then the 8 night parts; columns are Sunday..Saturday.
 * Parsed from all 16 city editions (2025-27): every cell identical across all
 * complete editions.
 */
export const GOWRI_TABLE = Object.freeze([
  ['Udyoga', 'Amrutha', 'Roga', 'Labha', 'Shubha', 'Chanchala', 'Kalaha'],
  ['Chanchala', 'Kalaha', 'Udyoga', 'Amrutha', 'Roga', 'Labha', 'Shubha'],
  ['Labha', 'Shubha', 'Chanchala', 'Kalaha', 'Udyoga', 'Amrutha', 'Roga'],
  ['Amrutha', 'Roga', 'Labha', 'Shubha', 'Chanchala', 'Kalaha', 'Udyoga'],
  ['Kalaha', 'Udyoga', 'Amrutha', 'Roga', 'Labha', 'Shubha', 'Chanchala'],
  ['Shubha', 'Chanchala', 'Kalaha', 'Udyoga', 'Amrutha', 'Roga', 'Labha'],
  ['Roga', 'Labha', 'Shubha', 'Chanchala', 'Kalaha', 'Udyoga', 'Amrutha'],
  ['Udyoga', 'Amrutha', 'Roga', 'Labha', 'Shubha', 'Chanchala', 'Kalaha'],
  ['Shubha', 'Chanchala', 'Kalaha', 'Udyoga', 'Amrutha', 'Roga', 'Labha'],
  ['Amrutha', 'Roga', 'Labha', 'Shubha', 'Chanchala', 'Kalaha', 'Udyoga'],
  ['Chanchala', 'Kalaha', 'Udyoga', 'Amrutha', 'Roga', 'Labha', 'Shubha'],
  ['Roga', 'Labha', 'Shubha', 'Chanchala', 'Kalaha', 'Udyoga', 'Amrutha'],
  ['Kalaha', 'Udyoga', 'Amrutha', 'Roga', 'Labha', 'Shubha', 'Chanchala'],
  ['Labha', 'Shubha', 'Chanchala', 'Kalaha', 'Udyoga', 'Amrutha', 'Roga'],
  ['Udyoga', 'Amrutha', 'Roga', 'Labha', 'Shubha', 'Chanchala', 'Kalaha'],
  ['Shubha', 'Chanchala', 'Kalaha', 'Udyoga', 'Amrutha', 'Roga', 'Labha'],
]);
/** UM-TABLE: marked "++" (good) in the Math's table; the rest are marked "–". */
export const GOWRI_GOOD = Object.freeze(['Udyoga', 'Amrutha', 'Labha', 'Shubha']);

export function gowriPanchanga({ sunriseJd, sunsetJd, nextSunriseJd, varaIndex }) {
  const day = (sunsetJd - sunriseJd) / 8, night = (nextSunriseJd - sunsetJd) / 8;
  return GOWRI_TABLE.map((row, i) => {
    const isDay = i < 8;
    const startJd = isDay ? sunriseJd + i * day : sunsetJd + (i - 8) * night;
    const name = row[varaIndex];
    return {
      part: isDay ? 'day' : 'night', index: (i % 8) + 1, name, startJd,
      endJd: startJd + (isDay ? day : night),
      nature: GOWRI_GOOD.includes(name) ? 'shubha' : 'ashubha',
    };
  });
}

/* ================================================= vara-nakshatra day quality */

/**
 * UM-TABLE: the "+ Good Day / – NOT so good" mark the Math prints beside each
 * day's nakshatra. Decoded from 5,497 dated marks (16 editions, 2025-27, rows
 * aligned to dates by the Surya Siddhanta engine). The mark is a pure function
 * of vara and nakshatra: 99.7% of marks agree with this table, against 71% for
 * nakshatra alone; adding the tithi explains nothing more. Every cell has
 * 16-43 samples and at least 90% agreement.
 *
 * It is NOT the classical Amrita-siddhi list (e.g. Monday-Mrigashira is "–"
 * here), and is labelled as the Math's own table rather than given a
 * textbook name. It is also NOT a muhurta filter: 207 of the Math's 501
 * published muhurta dates fall on "–" days.
 *
 * Rows: nakshatra 1..27; characters: Sunday..Saturday.
 */
const VARA_NAK_ROWS = [
  '++-+-+-', '---+---', '-++-+-+', '+++-+++', '+-+-+-+', '--+----', '++-+-+-', '++-++++', '-+-+-++',
  '-+-----', '+-+-+-+', '+-+++++', '+-+-++-', '+------', '-+-+-++', '-++++++', '-+-++-+', '------+',
  '+-+-++-', '++++++-', '+-++-+-', '-+-++-+', '+++++-+', '-++-+-+', '----+--', '+-++-+-', '++++-++',
];
export function dayQuality(varaIndex, nakshatraIndex) {
  const mark = VARA_NAK_ROWS[nakshatraIndex - 1][varaIndex];
  return {
    quality: mark === '+' ? 'good' : 'not-so-good',
    label: mark === '+' ? 'Good day' : 'Not so good',
    basis: 'Sri Uttaradi Math panchanga: the "+ Good Day / – NOT so good" mark, a vara–nakshatra ' +
      `table (${VARA_NAMES[varaIndex]}, ${NAKSHATRA_NAMES[nakshatraIndex - 1]}).`,
  };
}

/* ======================================================== nakshatra thyajya */

/**
 * Nakshatra thyajya (varjyam), as the Sri Uttaradi Math prints it:
 * "Nakshatra Thyaajya (2 hours) Begins".
 *
 * UM-TABLE, MEASURED. The Math's printed begin times (1,955 of them, five
 * city editions 2025-27) were re-associated with their dates from the page
 * layout and compared with Surya Siddhanta nakshatra spans. Shifted by one
 * hour they land on the standard ghatika table below, scaled to the
 * nakshatra's actual length: e.g. Bharani 24.7, Krittika 30.7, Rohini 40.7,
 * Revati 30.6 at Dubai, Sydney and London alike. So the Math's thyajya is the
 * two hours around that point (beginning about an hour before it) - not the
 * drikpanchang 4 ghatikas starting at it - and Mula has TWO (at 20 and 56).
 * The lead depends on the Moon's speed (below).
 */
export const THYAJYA_GHATIS = Object.freeze([
  50, 24, 30, 40, 14, 21, 30, 20, 32, 30, 20, 18, 21, 20,
  14, 14, 10, 14, 56, 24, 20, 10, 10, 18, 16, 24, 30,
]);
/** Extra thyajya points (UM-TABLE): the Math prints two for Mula. */
const THYAJYA_EXTRA = Object.freeze({ 18: [20] });
const THYAJYA_LENGTH = 2 / 24; // "(2 hours)"
/**
 * How far the printed begin time leads the table point, in minutes:
 * 60 - 14.56 x (Moon's daily motion - 13.176 deg/day). Fitted by least squares
 * on 1,161 printed times (Dubai, Sydney, London, 2025-27); the residual MAD
 * falls from 13 minutes (a flat 60) to 3. The dependence is on the Moon's
 * speed, not on the table point, so it carries to other years.
 */
const THYAJYA_LEAD_MIN = 60;
const THYAJYA_LEAD_SLOPE = 14.56;
const MEAN_MOON_MOTION = 13.176;

function moonCrossing(targetDeg, fromJd, toJd, ayanamsaName) {
  const ahead = (j) => ((panchangaMoon(j, ayanamsaName) - targetDeg + 360) % 360) > 180;
  let lo = fromJd, hi = toJd;
  for (let k = 0; k < 60 && hi - lo > 1e-7; k++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function nakshatraThyajya(sunriseJd, nextSunriseJd, ayanamsaName) {
  const ARC = 360 / 27;
  const out = [];
  const seen = new Set();
  for (const probe of [sunriseJd - 1.1, sunriseJd, (sunriseJd + nextSunriseJd) / 2, nextSunriseJd]) {
    const n0 = Math.floor(panchangaMoon(probe, ayanamsaName) / ARC); // 0-based
    if (seen.has(n0)) continue;
    seen.add(n0);
    const start = moonCrossing(n0 * ARC, probe - 1.4, probe + 1e-6, ayanamsaName);
    const end = moonCrossing(((n0 + 1) % 27) * ARC, probe, probe + 1.4, ayanamsaName);
    const len = end - start;
    for (const gh of [THYAJYA_GHATIS[n0], ...(THYAJYA_EXTRA[n0] ?? [])]) {
      const point = start + (gh / 60) * len;
      // Daily motion of the Moon at the point (deg/day): the Math's begin time
      // leads the point by 60 minutes at mean motion, less when the Moon is fast.
      // Clamped to the speeds the fit saw, so it never extrapolates.
      const v = Math.min(14.5, Math.max(11.8, norm360(panchangaMoon(point + 0.5, ayanamsaName) - panchangaMoon(point - 0.5, ayanamsaName))));
      const lead = (THYAJYA_LEAD_MIN - THYAJYA_LEAD_SLOPE * (v - MEAN_MOON_MOTION)) / 1440;
      const startJd = point - lead, endJd = startJd + THYAJYA_LENGTH;
      if (endJd > sunriseJd && startJd < nextSunriseJd) out.push({ nakshatra: NAKSHATRA_NAMES[n0], ghatika: gh, startJd, endJd });
    }
  }
  return out.sort((a, b) => a.startJd - b.startJd);
}

/* =================================================================== astha */

/**
 * Combustion (astha) of Guru, Shukra and Bhouma.
 *
 * UM-TABLE, CALIBRATED: the Math prints its astha windows ("Guru Astha 18/7 to
 * 11/8 ..."). The Surya Siddhanta's textbook orbs (Jupiter 11°, Venus 10°/8°,
 * Mars 17°) make every window days too wide. Fitted instead on the Math's 12
 * printed windows 2022-2026 (Guru x4, Shukra x6, Bhouma x2), by the side of
 * the Sun the planet is on: 20 of 24 boundaries exact, 4 off by one day. The
 * residue is expected - the Math uses Surya Siddhanta planets, this uses the
 * drik ephemeris - and the basis says so.
 */
export const ASTHA_ORBS = Object.freeze({
  guru: { body: 'SE_JUPITER', evening: 8.66, morning: 9.4 },
  shukra: { body: 'SE_VENUS', evening: 6.4, morning: 6.81, eveningRetro: 7.69, morningRetro: 6.59 },
  bhouma: { body: 'SE_MARS', evening: 14.88, morning: 15.28 },
});

export function asthaStatus(jdUt) {
  const sun = tropicalLongitude(jdUt, swe.SE_SUN).longitude;
  const out = {};
  for (const [graha, cfg] of Object.entries(ASTHA_ORBS)) {
    const p = tropicalLongitude(jdUt, swe[cfg.body]);
    const diff = ((p.longitude - sun + 540) % 360) - 180;
    const side = diff > 0 ? 'evening' : 'morning';
    const retro = p.speed < 0;
    const orb = (retro && cfg[`${side}Retro`]) || cfg[side];
    out[graha] = { combust: Math.abs(diff) < orb, separation: Math.abs(diff), orb, side, retrograde: retro };
  }
  return out;
}

/* ================================================================ ayanamsa */

/**
 * The ayanamsa for MUHURTA LAGNAS under Surya Siddhanta reckoning.
 *
 * The Math prints "Ayanamsha: 22° 54′ 22″" (May 2026) and 22° 55′ 10″ (March
 * 2027). No Swiss Ephemeris mode reproduces that (its "Surya Siddhanta" mode
 * gives 21° 16′; the nearest, Yukteshwar, is 3.5′ off). It is the traditional
 * Siddhantic ayanamsa: zero at Kali 3600 (499 CE), growing 54″ a year. Anchored
 * on the Math's May 2026 value; within about 20″ of both printed values, i.e.
 * about a second of time in a lagna boundary.
 */
const MATH_AYANAMSA_ANCHOR = { jd: 2461175.5, arcsec: 22 * 3600 + 54 * 60 + 22 }; // 2026-05-15
const SIDEREAL_YEAR_DAYS = 365.256363;
export function mathAyanamsa(jdUt) {
  return (MATH_AYANAMSA_ANCHOR.arcsec + ((jdUt - MATH_AYANAMSA_ANCHOR.jd) / SIDEREAL_YEAR_DAYS) * 54) / 3600;
}

/** Ayanamsa used for lagnas and graha houses at a muhurta, per the active ganita. */
export function muhurtaAyanamsa(jdUt, ayanamsaName) {
  return ganita() === 'surya' ? mathAyanamsa(jdUt) : ayanamsaOf(jdUt, ayanamsaName);
}

/* =============================================================== rules data */

/** UM-TEXT, verbatim, for each rule the engine applies. */
export const UM_TEXT = Object.freeze({
  vara: 'Vara shuddhi is on Monday, Wednesday, Thursday and Friday',
  upanayanaLagna: 'Upanayanas: Lagna shuddhi is in Mesha, Vrushabha, Karkataka, Meena, Mithuna, Simha, Kumbha',
  vivahaLagna: 'Vivahas: Lagna shuddhi is in Vrushabha, Mithuna, Karkataka, Kanya, Simha, Meena',
  lagnaThyajya: 'One–third of the duration is called Thyajya meaning "To be discarded". The thayajya details are: ' +
    'First one third in case of Mesha, Vrushabha, Kanya and Dhanus lagnas, Second one third in case of Mithuna, ' +
    'Simha, Thula and Kumbha lagnas, Last one third in case of Karkataka, Vrushchika, Makara and Meena lagnas.',
  haridina: 'Madhwas do not fix Dashami, Ekadashi and Dwadashi as muhurthas – the three days are considered as ' +
    'Haridinas. However, in exceptional circumstances, Dashami can be considered for Vivaha only',
  masa: 'Panchangas are expected to indicate muhurthas for the months of Chaitra, Vaishakha, Jyeshta, Makha and ' +
    'Phalguna only, which generally corresponds to Uttarayana. However, during Dakshinayana, Margashira and ' +
    'Kartheeka masas are the best.',
  ashadhaPushya: 'Ashada Masa is generally considered a taboo. ... Similarly Pushya masa is also considered a No ' +
    'Muhurtha masa. However the period when Dhanur masa coexists only is a No muhurtha period.',
  astha: 'Gurubala is very essential for the function to take place. Shukra is considered the planet indicating ' +
    'marriage. Hence Shukrabala is very important. However, it is said that Guru Astha period is not suitable for ' +
    'Rugvedis, Shukra Astha period is not suitable for Yajurvedis and Bhouma Astha period is not suitable for Samavedis.',
  upanayanaWindow: 'For Upanayana, the period from Shukla Panchami to Krishna Panchami is considered the most preferred.',
  tarabala: 'With the person\'s birth nakshatra as 1 count till the nakshatra of the chosen period ... divided by 9. ' +
    'The remainder indicates the Tharabala ... Result 6 which is the best',
  taraShanti: 'In unavoidable circumstances, when the Tharabala is 1 (Janmathare), Shaka (Vegetables) daana, 3 ' +
    '(Vipaththare) Jaggery daana, 5 (Prathyakthare) Salt daana, 7 (Naidhanathare) Ellu (Sesame), Silver, Gold and ' +
    'Clothes daana will eliminate the dosha of Tharabala.',
  consult: 'The given muhurthas are general in nature. These may be best suited as also not suitable for different ' +
    'individuals. Consulting a learned Astrologer with the individuals horoscope / nakshatra will determine the suitability.',
});

export const EVENTS = Object.freeze(['general', 'vivaha', 'upanayana', 'vastu', 'prayana']);

/**
 * The Math's KANNADA text, verbatim, with a translation. Decoded from the
 * Shree-Lipi PDFs of the 2025-26 and 2026-27 Kannada editions.
 */
export const UM_KN = Object.freeze({
  vara: { kn: '‘‘ಸೋಮಬುಧಗುರುಶುಕ್ರವಾರಾಃ ಶುಭಾಃ ಅನ್ಯೇ ಮಧ್ಯಮಾಃ’’ ಎಂದು ಧರ್ಮಸಿಂಧುಕಾರನ ವಚನ.',
    en: 'Dharmasindhu: Monday, Wednesday, Thursday and Friday are shubha; the others are madhyama. (Some forbid Tuesday for vivaha; others accept it as madhyama.)' },
  kshaya: { kn: 'ಸೂರ್ಯಸಿದ್ಧಾಂತರೀತ್ಯಾ ಕ್ಷಯತಿಥಿ ಇದ್ದರೂ ದೃಗ್ಗಣಿತದಲ್ಲಿ ಕ್ಷಯತಿಥಿ ಇಲ್ಲದಿದ್ದರೆ ಮುಹೂರ್ತ ನಿರ್ದುಷ್ಟ.',
    en: 'Even if a tithi is kshaya by Surya Siddhanta, if it is not kshaya in drigganita the muhurta is faultless.' },
  rahukala: { kn: 'ರಾಹುಕಾಲಾದಿಗಳು ಅನೇಕರ ಪ್ರಕಾರ ದೋಷವೇ ಅಲ್ಲ. ಇನ್ನು ಕೆಲವರ ಪ್ರಕಾರ ಬಲಿಷ್ಠಯೋಗಾದಿಗಳಿದ್ದರೆ ರಾಹುಕಾಲಾದಿದೋಷಗಳ ಪರಿಹಾರವಾಗುತ್ತದೆ.',
    en: 'Rahukala and the like are no dosha at all according to many; according to others a strong yoga removes the dosha.' },
  drikTithi: { kn: 'ವಿವಾಹಮುಹೂರ್ತಾದಿಗಳಿಗೆ ಸೂರ್ಯೋದಯಕಾಲಕ್ಕಿರುವ ದೃಗ್ಗಣಿತದ ತಿಥಿಗಳನ್ನು ಕೊಟ್ಟಿದ್ದೇವೆ. ನಕ್ಷತ್ರವನ್ನು ಮಾತ್ರ ಮುಹೂರ್ತಸಮಯದಲ್ಲಿರುವದನ್ನು ಕೊಟ್ಟಿದ್ದೇವೆ.',
    en: 'For vivaha and other muhurtas we give the drigganita tithi at sunrise; only the nakshatra is the one at the muhurta time.' },
  dashami: { kn: 'ದಶಮೀ ತಿಥಿಯು ಕೇವಲ ವಿವಾಹಕ್ಕೆ ವಿಹಿತವಾಗಿದೆ. ನಿಷೇಕಾದಿಗಳನ್ನು ಅಂದು ಮಾಡಬಾರದು.',
    en: 'Dashami is prescribed for vivaha only. Nisheka and the like must not be done that day.' },
  dinaShuddhi: { kn: 'ಸರ್ವಕಾರ್ಯಗಳಿಗೂ ಸಾಧಾರಣ ದಿನಶುದ್ಧಿ: ಕೃಷ್ಣಪಕ್ಷದಲ್ಲಿ ೧೩, ೧೪, ೩೦ ಶುಕ್ಲಪಕ್ಷದಲ್ಲಿ ೧, ಎರಡೂ ಪಕ್ಷದಲ್ಲಿಯೂ ೬, ೮, ೧೨ ತಿಥಿಗಳು, ಸಂಕ್ರಾಂತಿ, ವ್ಯತೀಪಾತ, ವೈಧೃತಿ, ಗ್ರಹಣದಿವಸ ಮತ್ತು ಕರಿದಿನ, ಕ್ಷಯ-ವೃದ್ಧಿತಿಥಿ, ಭದ್ರಾಕರಣ, ಪರಿಘಯೋಗದ ಪೂರ್ವಾರ್ಧ, ಮಂಗಳವಾರ, ಶನಿವಾರ, ಕ್ಷೀಣಚಂದ್ರ, ಗುರುಶುಕ್ರಾಸ್ತ ಇವುಗಳನ್ನು ಬಿಟ್ಟು',
    en: 'General day-purity for all work: leave out Krishna 13, 14 and Amavasya, Shukla Prathama, the 6th, 8th and 12th of either paksha, sankranti, Vyatipata, Vaidhriti, eclipse days and karidina, kshaya and vriddhi tithis, Bhadra karana, the first half of Parigha yoga, Tuesday, Saturday, a waning Moon, and Guru or Shukra astha.' },
  nakshatraClass: { kn: 'ಶುಭ ನಕ್ಷತ್ರ ಸ್ಥಿರ ರೋಹಿಣೀ, ಉತ್ತರಾ, ಉತ್ತರಾಷಾಢಾ, ಉತ್ತರಾಭಾದ್ರಪದಾ ಲಘು ಹಸ್ತ, ಅಶ್ವಿನೀ, ಪುಷ್ಯ, (ಅಭಿಜಿತ್‌). ಮೃದು ಮೃಗಶಿರಾ, ಚಿತ್ರಾ, ಅನುರಾಧಾ,ರೇವತೀ ಚರ ಸ್ವಾತೀ, ಪುನರ್ವಸು, ಶ್ರವಣ, ಧನಿಷ್ಠಾ, ಶತಭಿಷಾ ಅಶುಭ ನಕ್ಷತ್ರ ಕೃತ್ತಿಕಾ, ಭರಣೀ, ಆಶ್ಲೇಷಾ, ಜ್ಯೇಷ್ಠಾ, ಆರ್ದ್ರಾ, ಪೂರ್ವಾಫಾಲ್ಗುನೀ, ಪೂರ್ವಾಷಾಢಾ, ಪೂರ್ವಾಭಾದ್ರಪದಾ ಮಧ್ಯಮ ನಕ್ಷತ್ರ ಮಘಾ, ಮೂಲ, ವಿಶಾಖಾ',
    en: 'Shubha nakshatras - sthira: Rohini, Uttara Phalguni, Uttara Ashadha, Uttara Bhadrapada; laghu: Hasta, Ashwini, Pushya (Abhijit); mridu: Mrigashira, Chitra, Anuradha, Revati; chara: Swati, Punarvasu, Shravana, Dhanishta, Shatabhisha. Ashubha: Krittika, Bharani, Ashlesha, Jyeshtha, Ardra, Purva Phalguni, Purva Ashadha, Purva Bhadrapada. Madhyama: Magha, Mula, Vishakha.' },
  lagnaThyajya: { kn: 'ಲಗ್ನತ್ಯಾಜ್ಯ ಕಾಲ: ಮೇಷ, ವೃಷಭ, ಕನ್ಯಾ, ಧನುಲಗ್ನಗಳ ಆದಿಭಾಗದಲ್ಲೂ ಕರ್ಕಾಟಕ, ವೃಶ್ಚಿಕ, ಮಕರ, ಮೀನ ಲಗ್ನಗಳ ಅಂತ್ಯಭಾಗದಲ್ಲೂ, ಮಿಥುನ, ಸಿಂಹ, ತುಲಾ, ಕುಂಭ ಲಗ್ನಗಳ ಮಧ್ಯಭಾಗದಲ್ಲೂ ಅರ್ಧ ಘಳಿಗೆಯ ಕಾಲ ತ್ಯಾಜ್ಯವು.',
    en: 'Lagna thyajya: half a ghalige (12 minutes) is discarded - at the beginning of Mesha, Vrishabha, Kanya and Dhanu, at the end of Karka, Vrischika, Makara and Meena, and in the middle of Mithuna, Simha, Tula and Kumbha.' },
  yogaThyajya: { kn: 'ಯೋಗಗಳಲ್ಲಿ ತ್ಯಾಜ್ಯಕಾಲ: ಈ ಯೋಗಗಳಲ್ಲಿ ಆದಿಯಲ್ಲಿರುವ (ಘಟಿಕಾಗಳು) ತಾಸುಗಳು ತ್ಯಾಜ್ಯವಾಗಿವೆ. ಪರಿಘ (೩೦ಘಟಿ)೧೨ ತಾಸು,ಶೂಲ(೫ಘ) ೨ ತಾಸು, ಗಂಡ,ಅತಿಗಂಡ (೬ ಘ) ೨.೨೪ ತಾಸು, ವ್ಯಾಘಾತ (೯ಘಟಿ) ೩.೩೬ತಾಸು.',
    en: 'Thyajya in yogas - the opening ghatikas are discarded: Parigha 30, Shula 5, Ganda and Atiganda 6, Vyaghata 9.' },
  karana: { kn: 'ದುಷ್ಟ ಕರಣಗಳು ಶಕುನಿ, ಚತುಷ್ಪಾತ್‌, ನಾಗ, ಕಿಂಸ್ತುಘ್ನ, ವಿಷ್ಟಿ (ಭದ್ರಾ).', en: 'Dushta karanas: Shakuni, Chatushpat, Naga, Kimstughna, Vishti (Bhadra).' },
  gurubala: { kn: 'ಗುರುಬಲ: ಗುರು, ವಧೂವರರ/ವಟುವಿನ ಜನ್ಮರಾಶಿಯಿಂದ (ಗೋಚರ ರೀತ್ಯಾ) ವಿವಾಹ-ಉಪನಯನಾದಿಗಳನ್ನು ಮಾಡುವ ಕಾಲದಲ್ಲಿ ೨-೫- ೭-೯-೧೧ ನೇ ರಾಶಿಯಲ್ಲಿದ್ದರೆ ಶುಭ. ೧-೩-೬-೧೦ ರಾಶಿಯಲ್ಲಿದ್ದರೆ ಅಶುಭ. ಗುರುಮಂತ್ರಜಪ, ಗುರುಶಾಂತಿ ಇತ್ಯಾದಿಗಳಿಂದ ದೋಷ ಪರಿಹಾರವಾಗುವದು. ೪-೮-೧೨ ವಿಶೇಷ ಅನಿಷ್ಟ. ಇದಕ್ಕೆ ಪರಿಹಾರವಿಲ್ಲ. ಆದರೆ ಪ್ರಬಲವಾದ ಜಪ-ಶಾಂತಿಗಳಿಂದ ಅನುಕೂಲವಾಗಬಹುದು. ಅಲ್ಲದೇ ಕರ್ಕರಾಶಿಯಲ್ಲಿ ಗುರುವಿದ್ದರೆ ೪,೮,೧೨ ರಾಶಿಯಲ್ಲಿದ್ದರೂ ದೋಷವಿಲ್ಲ.',
    en: 'Gurubala: Jupiter in transit in the 2nd, 5th, 7th, 9th or 11th from the janma rashi of the bride, groom or vatu at the time of vivaha, upanayana etc. is shubha. In the 1st, 3rd, 6th or 10th it is ashubha, remedied by Guru mantra japa, Guru shanti and the like. The 4th, 8th and 12th are especially bad with no remedy, though strong japa and shanti may help. And if Jupiter is in Karka there is no dosha even in the 4th, 8th or 12th.' },
  panchaka: { kn: 'ಪಂಚಕವಿಚಾರ: ಶುಕ್ಲಪಕ್ಷದ ಪ್ರತಿಪದಾದಿಂದ ಇಷ್ಟತಿಥಿಯ ವರೆಗಿನ ಸಂಖ್ಯೆಯನ್ನು ಮತ್ತು ಮೇಷದಿಂದ ಇಷ್ಟಲಗ್ನದ ವರೆಗಿನ ಸಂಖ್ಯೆಯನ್ನು ಕೂಡಿಸಿ ಬಂದ ಮೊತ್ತವನ್ನು ೯ ರಿಂದ ಭಾಗಿಸಿದಾಗ ಶೇಷವು ೧ ಉಳಿದರೆ ಮೃತ್ಯುಪಂಚಕ, ೨ ಅಗ್ನಿಪಂಚಕ, ೪ ರಾಜಪಂಚಕ, ೬ ಚೋರಪಂಚಕ, ೮ ರೋಗಪಂಚಕವಾಗುವದು. ೩,೫,೭,೦ ಶೇಷ ಉಳಿದರೆ ನಿಷ್ಪಂಚಕ ವಾಗುವದು. ಲಗ್ನವು ಬಲಿಷ್ಠವಿದ್ದರೆ ಪಂಚಕದೋಷವಿಲ್ಲ. ಮೃತ್ಯುರೋಗಪಂಚಕ ದೋಷಪರಿಹಾರಕ್ಕಾಗಿ ಕ್ರಮಶಃ ತೈಲತಾಮ್ರದಾನವನ್ನು ಮಾಡಬೇಕು.',
    en: 'Panchaka: add the count of tithis from Shukla Prathama to the chosen tithi and the count of rashis from Mesha to the chosen lagna, and divide by 9. Remainder 1 is mrityu panchaka, 2 agni, 4 raja, 6 chora, 8 roga; 3, 5, 7 and 0 are free of panchaka. There is no panchaka dosha if the lagna is strong. For mrityu and roga panchaka give oil and copper respectively.' },
  chandrabala: { kn: 'ಜನ್ಮರಾಶಿಯಿಂದ ೧,೩,೬,೭,೧೦,೧೧ ಈ ಸ್ಥಾನಗಳಲ್ಲಿ ಗೋಚರರೀತ್ಯಾ ಚಂದ್ರನಿದ್ದರೆ ಶುಭ. ೨,೪,೫,೮,೯,೧೨ ಈ ಸ್ಥಾನಗಳಲ್ಲಿದ್ದರೆ ಅಶುಭ. ಶುಕ್ಲಪಕ್ಷದಲ್ಲಿ ೨,೫,೯ ಸ್ಥಾನದಲ್ಲಿ; ಕೃಷ್ಣಪಕ್ಷದಲ್ಲಿ ೪,೮,೧೨ ಸ್ಥಾನಗಳಲ್ಲಿ ಶುಭವೆಂದು ತಿಳಿಯಬೇಕು. ಅನಿರ್ವಾಹಪಕ್ಷದಲ್ಲಿ ಚಂದ್ರಪ್ರೀತ್ಯರ್ಥವಾಗಿ ಚಂದ್ರಗ್ರಹ ಪೂಜೆ, ಚಂದ್ರಮಂತ್ರಜಪ, ಅಕ್ಕಿದಾನ ಮಾಡಿದರೆ ದೊಷವು ಪರಿಹಾರವಾಗುತ್ತದೆ.',
    en: 'The Moon in transit in the 1st, 3rd, 6th, 7th, 10th or 11th from the janma rashi is shubha; in the 2nd, 4th, 5th, 8th, 9th or 12th ashubha. But in shukla paksha the 2nd, 5th and 9th, and in krishna paksha the 4th, 8th and 12th, are to be taken as shubha. When unavoidable, Chandra graha puja, Chandra mantra japa and rice daana remove the dosha.' },
  paksha: { kn: 'ಶುಕ್ಲಪಕ್ಷದಲ್ಲಿ ಚಂದ್ರಬಲ, ಕೃಷ್ಣಪಕ್ಷದಲ್ಲಿ ತಾರಾಬಲ ಇವುಗಳನ್ನು ಮುಖ್ಯವಾಗಿ ಗಮನಿಸಬೇಕು.',
    en: 'In shukla paksha chandrabala, and in krishna paksha tarabala, are what must chiefly be looked at.' },
  tarabalaTable: { kn: '+ ಈ ಚಿಹ್ನೆ ಇರುವ ದಿನ ತಾರಾಬಲ ಇದೆ ಎಂದು ತಿಳಿಯಬೇಕು.',
    en: 'A day carrying the + mark in the tarabala table has tarabala. (The Math\'s 27×27 table marks taras 2, 4, 6, 8 and 9 with +; 1, 3, 5 and 7 are unmarked.)' },
});

/** Measured on the Math's Kannada lists (UM-KN-LIST), for the `basis` strings. */
const KN_LIST = '133 muhurtas published in the Math\'s Kannada editions 2025-27';

/** UM-TEXT lagna shuddhi, rashi numbers (1 = Mesha). */
const LAGNA_SHUDDHI = { upanayana: [1, 2, 4, 12, 3, 5, 11], vivaha: [2, 3, 4, 6, 5, 12] };
/**
 * UM-KN-LIST: for vivaha the Math also sets muhurtas in lagnas outside the
 * shuddhi list (Mesha 11, Dhanu 11, Tula 4 of its 41 lagna muhurtas) - every
 * one of them with a shuddha AMSHA (navamsha): Vrishabha, Mithuna, Kanya,
 * Meena, or Dhanu in Dhanu (vargottama). So a vivaha lagna is shuddha when
 * either the lagna or its navamsha is.
 */
const VIVAHA_AMSHA = [2, 3, 4, 5, 6, 12];
/** UM-KN: which part of each lagna is thyajya (0 beginning, 1 middle, 2 end), and for how long. */
const LAGNA_THYAJYA_PART = { 1: 0, 2: 0, 6: 0, 9: 0, 3: 1, 5: 1, 7: 1, 11: 1, 4: 2, 8: 2, 10: 2, 12: 2 };
const LAGNA_THYAJYA_MINUTES = 12; // ಅರ್ಧ ಘಳಿಗೆ - half of a 24-minute ghalige

/** UM-KN nakshatra classes (index 1..27). */
export const NAKSHATRA_CLASS = Object.freeze(Object.fromEntries([
  ...[4, 12, 21, 26].map((n) => [n, { nature: 'shubha', group: 'sthira' }]),
  ...[13, 1, 8].map((n) => [n, { nature: 'shubha', group: 'laghu' }]),
  ...[5, 14, 17, 27].map((n) => [n, { nature: 'shubha', group: 'mridu' }]),
  ...[15, 7, 22, 23, 24].map((n) => [n, { nature: 'shubha', group: 'chara' }]),
  ...[3, 2, 9, 18, 6, 11, 20, 25].map((n) => [n, { nature: 'ashubha', group: 'ashubha' }]),
  ...[10, 19, 16].map((n) => [n, { nature: 'madhyama', group: 'madhyama' }]),
]));

/** UM-KN yoga thyajya, ghatikas from the yoga's start. */
export const YOGA_THYAJYA_GHATIS = Object.freeze({ Parigha: 30, Shula: 5, Ganda: 6, Atiganda: 6, Vyaghata: 9 });
const DUSHTA_KARANAS = new Set(['Shakuni', 'Chatushpada', 'Naga', 'Kimstughna', 'Vishti']);
const PANCHAKA = { 1: 'Mrityu', 2: 'Agni', 4: 'Raja', 6: 'Chora', 8: 'Roga' };

/**
 * The anga spans (nakshatra, yoga, karana) running between two instants, each
 * with its true start and end. `fn(jd)` returns { index, name, endJd }.
 */
function angaSpans(fn, fromJd, toJd) {
  // karana() identifies itself by `slot` (1..60), the others by `index`.
  const key = (x) => x.index ?? x.slot;
  const first = fn(fromJd);
  if (key(first) === undefined) throw new Error('angaSpans: anga has neither index nor slot');
  let j = fromJd;
  for (let k = 0; k < 40 && key(fn(j)) === key(first); k++) j -= 0.1;
  let startJd = fn(j).endJd;
  const out = [];
  let cur = first;
  for (let k = 0; k < 80; k++) {
    if (cur.endJd > startJd) out.push({ index: key(cur), name: cur.name, startJd, endJd: cur.endJd });
    if (cur.endJd >= toJd) break;
    startJd = cur.endJd;
    cur = nextAnga(fn, cur);
  }
  return out;
}

/**
 * The nakshatras from this sunrise to the next, in BOTH frames the Math
 * publishes muhurtas in, merged into one timeline. Each segment carries the
 * Surya Siddhanta and the drik nakshatra with their UM-KN class, and `both`:
 * true when the two agree the time is ashubha.
 *
 * Why both, measured: the Math's Kannada lists (drik muhurta frame per its
 * note) put 2 of 133 published times under a nakshatra that is ashubha in both
 * frames - both among its anirvaha (compromise) muhurtas - but 5 under an
 * ashubha Siddhanta nakshatra; its English lists (Surya Siddhanta) use 3 days
 * whose drik nakshatra is ashubha all day. So only agreement is a fault.
 */
function nakshatraTimeline(day, ayName) {
  const from = day.sun.riseJd;
  const to = Number.isFinite(day.sun.nextRiseJd) ? day.sun.nextRiseJd : from + 1;
  const tag = (x) => ({ ...x, ...NAKSHATRA_CLASS[x.index] });
  const ss = withGanita('surya', () => angaSpans((j) => nakshatraAt(j, ayName), from, to)).map(tag);
  const dr = withGanita('drik', () => angaSpans((j) => nakshatraAt(j, ayName), from, to)).map(tag);
  const cuts = [...new Set([from, to, ...ss.map((x) => x.endJd), ...dr.map((x) => x.endJd)])].filter((j) => j >= from && j <= to).sort((a, b) => a - b);
  const at = (list, j) => list.find((x) => j >= x.startJd && j < x.endJd) ?? list[list.length - 1];
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const m = (cuts[i] + cuts[i + 1]) / 2;
    const a = at(ss, m), b = at(dr, m);
    out.push({ startJd: cuts[i], endJd: cuts[i + 1], surya: a, drik: b, both: a.nature === 'ashubha' && b.nature === 'ashubha' });
  }
  return out;
}

/**
 * Piecewise-constant segments of `fn` over [fromJd, toJd]: sample every
 * `stepMin` minutes, bisect each change to ~0.01 s, and resume scanning from
 * the boundary found - so a value that lasts less than one step is still
 * found instead of being jumped over.
 */
function segmentBy(fn, fromJd, toJd, stepMin) {
  const step = stepMin / 1440;
  const out = [];
  let start = fromJd, cur = fn(fromJd);
  let probe = fromJd;
  for (let guard = 0; guard < 100000 && start < toJd; guard++) {
    const x = Math.min(probe + step, toJd);
    if (fn(x) === cur) {
      if (x >= toJd) break;
      probe = x;
      continue;
    }
    let lo = probe, hi = x;
    for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (fn(m) === cur) lo = m; else hi = m; }
    out.push({ value: cur, startJd: start, endJd: hi });
    start = hi; cur = fn(hi + 1e-9); probe = hi;
  }
  out.push({ value: cur, startJd: start, endJd: toJd });
  return out.filter((x) => x.endJd > x.startJd);
}

/** Start of the drik tithi current at this sunrise. */
function drikTithiStart(day) {
  return withGanita('drik', () => angaSpans((j) => tithiAt(j), day.sun.riseJd, day.sun.riseJd + 1e-6)[0].startJd);
}

const MADHWA = new Set(['uttaradi', 'raghavendra']);

/* ======================================================== day evaluation */

/**
 * Is `day` (a computeDay result) suitable for `event`, generally and for
 * `profile` if given? Returns the verdict and every point behind it.
 *
 * Points have status 'pass' | 'warn' | 'fail' | 'info'. The day is shubha
 * when nothing fails; 'warn' points are shown but do not rule the day out.
 */
export function evaluateDay(day, { event = 'general', profile = null, janma = null, veda = null } = {}) {
  if (!EVENTS.includes(event)) throw new RangeError(`event must be one of ${EVENTS.join(', ')}`);
  const pts = [];
  const add = (id, label, status, detail, basis) => pts.push({ id, label, status, detail, basis });
  const v = day.vara.index;
  const t = day.tithi;
  const n = day.nakshatra.index;

  // 1. Vara (UM-TEXT shuddhi; UM-KN madhyama; UM-KN-LIST practice).
  if ([1, 3, 4, 5].includes(v)) add('vara', 'Vara shuddhi', 'pass', `${day.vara.name} is a shuddha vara.`, `Sri Uttaradi Math: "${UM_TEXT.vara}".`);
  else {
    add('vara', 'Vara shuddhi', 'warn', `${day.vara.name} is madhyama - not a shuddha vara, but not ruled out.`,
      `Sri Uttaradi Math: "${UM_TEXT.vara}". Its Kannada edition: "${UM_KN.vara.kn}" (${UM_KN.vara.en}) ` +
      `Its own lists use them: of the ${KN_LIST}, 19 are on Sunday, 12 on Tuesday and 13 on Saturday.`);
  }

  // 2. Tithi - the DRIK tithi at sunrise, as the Math prints for muhurtas (UM-KN).
  const ayName = day.meta?.ayanamsa ?? 'trueCitra';
  const dt = withGanita('drik', () => tithiAt(day.sun.riseJd));
  const dtNext = Number.isFinite(day.sun.nextRiseJd) ? withGanita('drik', () => tithiAt(day.sun.nextRiseJd)) : null;
  const tn = dt.index; // 1..30
  const tName = `${dt.paksha === 'shukla' ? 'Shukla' : 'Krishna'} ${dt.name}`;
  const drikBasis = `Sri Uttaradi Math, Kannada edition: "${UM_KN.drikTithi.kn}" (${UM_KN.drikTithi.en})`;
  const tDiffers = dt.index !== t.index ? ` (the Surya Siddhanta tithi at sunrise is ${t.name}; for a muhurta the Math uses the drik one)` : '';
  if (tn === 29 || tn === 30) {
    add('tithi', 'Tithi', 'fail', `${tName}${tDiffers} is never used for a muhurta.`,
      `${drikBasis} The Math's general rule leaves out Krishna 14 and Amavasya ("${UM_KN.dinaShuddhi.kn}"), and none of its published muhurtas - 501 in the English editions, ${KN_LIST} - falls on either.`);
  } else if (tn === 14 || tn === 15 || tn === 1 || tn === 28) {
    add('tithi', 'Tithi', 'warn', `${tName}${tDiffers}: ${tn === 1 ? 'Shukla Prathama is in the Math\'s general exclusions' : tn === 28 ? 'Krishna Trayodashi is in the Math\'s general exclusions' : tn === 14 ? 'Chaturdashi is a rikta tithi' : 'Purnima is used rarely'} - a caution, not ruled out.`,
      `${drikBasis} General rule: "${UM_KN.dinaShuddhi.en}" Practice: Shukla 14 and Purnima each occur 4 times in the ${KN_LIST} (never in the English editions); Shukla Prathama once in 501 English-edition muhurtas; Krishna 13 in neither Kannada list.`);
  } else {
    add('tithi', 'Tithi', 'pass', `${tName}${tDiffers}.`,
      `${drikBasis} Every other tithi occurs in the Math's published muhurtas - including the 6th and 8th, which its general rule lists but its own lists use (Shukla 6 ×7, Krishna 6 ×7, Krishna 8 ×7 in the Kannada lists).`);
  }

  // 2b. Kshaya / vriddhi tithi, judged in drik (UM-KN).
  if (dtNext) {
    const step = (dtNext.index - dt.index + 30) % 30;
    const ssNext = Number.isFinite(day.sun.nextRiseJd) ? tithiAt(day.sun.nextRiseJd) : null;
    const ssStep = ssNext ? (ssNext.index - t.index + 30) % 30 : 1;
    const kshayaBasis = `Sri Uttaradi Math, Kannada edition: "${UM_KN.kshaya.kn}" (${UM_KN.kshaya.en}) Its general rule excludes kshaya and vriddhi tithis. ` +
      `Measured: none of the ${KN_LIST} is on a drik kshaya day (about 4 expected by chance); its English editions (Surya Siddhanta throughout) use 6 days that are kshaya in drik but not in Surya Siddhanta, and none that is kshaya in both.`;
    if (step >= 2 && ssStep >= 2) {
      add('kshaya-tithi', 'Kshaya tithi', 'fail', 'A tithi begins and ends between this sunrise and the next (kshaya) - in drigganita and in Surya Siddhanta alike.', kshayaBasis);
    } else if (step >= 2) {
      add('kshaya-tithi', 'Kshaya tithi', 'warn', 'Kshaya in drigganita but not in Surya Siddhanta. The Math\'s Kannada note judges kshaya in drik; its English editions nonetheless use such days.', kshayaBasis);
    } else if (ssStep >= 2) {
      add('kshaya-tithi', 'Kshaya tithi', 'info', 'Kshaya by Surya Siddhanta, but not in drigganita - no dosha.', kshayaBasis);
    } else if (step === 0 || drikTithiStart(day) < day.sun.riseJd - (day.sun.nextRiseJd - day.sun.riseJd) - 5 / 1440) {
      add('kshaya-tithi', 'Vriddhi tithi', 'warn', `${tName} is current at ${step === 0 ? 'this sunrise and the next' : 'the previous sunrise and this one'} (vriddhi).`,
        `Sri Uttaradi Math's general rule excludes kshaya and vriddhi tithis ("${UM_KN.dinaShuddhi.kn}"). None of the ${KN_LIST} is on a drik vriddhi day.`);
    }
  }

  // 3. Haridina (UM-TEXT) - for Madhwas. A Haridina in ANY of the Math's
  // reckonings counts: the drik muhurta tithi, the Surya Siddhanta calendar
  // tithi, and the Math's own Ekadashi fast day (after vedha). The paarane day
  // is NOT forced: when vedha moves the fast onto Dwadashi the paarane day is
  // Trayodashi, and the Math publishes muhurtas on it (3 Nov 2025).
  const madhwa = !profile || MADHWA.has(profile.sampradaya ?? 'uttaradi');
  const role = day.ekadashi?.role;
  const nums = [dt.numberInPaksha, t.numberInPaksha];
  const pn = (role === 'fast' || role === 'athiriktha') ? 11
    : nums.includes(11) ? 11 : nums.includes(12) ? 12 : nums.includes(10) ? 10 : null;
  if (pn !== null && madhwa) {
    const dashami = pn === 10;
    add('haridina', 'Haridina', dashami ? 'warn' : 'fail',
      dashami
        ? (event === 'vivaha'
          ? 'Dashami is a Haridina; for Vivaha only it may be considered in exceptional circumstances.'
          : 'Dashami is a Haridina, and the Math\'s texts allow it for Vivaha only - its own lists nevertheless give a few Dashami muhurtas for other events. Confirm with the Math before fixing one.')
        : `${role === 'fast' || role === 'athiriktha' ? 'The Math\'s Ekadashi fast day' : pn === 11 ? 'Ekadashi' : 'Dwadashi'} is a Haridina; Madhwas do not fix a muhurta on it.`,
      `Sri Uttaradi Math: "${UM_TEXT.haridina}". Kannada edition: "${UM_KN.dashami.kn}" (${UM_KN.dashami.en})` +
        (dashami && event !== 'vivaha' ? ` Yet its Kannada lists give Dashami muhurtas for Upanayana (24-06-2026), Vastu (30-11-2025, 26-02-2026) and Pratishtha (26-02-2026), so this is a caution, not a failure.` : ''));
  }

  // 4. Nitya yoga (UM-PRACTICE).
  if (['Vyatipata', 'Vaidhriti'].includes(day.yoga.name)) {
    add('yoga', 'Nitya yoga', 'fail', `${day.yoga.name} yoga at sunrise.`, 'Sri Uttaradi Math practice: no Vyatipata or Vaidhriti day among its 501 published muhurtas (it prints their parvakala separately). Other yogas classically called inauspicious (Atiganda, Parigha, Vajra...) all occur in its lists.');
  } else add('yoga', 'Nitya yoga', 'pass', `${day.yoga.name} yoga.`, 'Sri Uttaradi Math practice.');

  // 5. Masa (UM-TEXT).
  const m = day.masa;
  const sunRashi = Math.floor(day.sun.siderealLongitude / 30) + 1;
  const sunInDhanu = sunRashi === 9;
  if (m.isAdhika) add('masa', 'Masa', 'fail', `${m.displayName}: no muhurtas in an adhika masa.`, 'Sri Uttaradi Math practice: its 2026-27 lists contain no dates in Adhika Jyeshtha.');
  else if (m.name === 'Ashadha' && sunRashi === 3) add('masa', 'Masa', 'pass', 'Ashadha, but with Mithuna (solar) masa coexisting - acceptable.', 'Sri Uttaradi Math: "Ashada Masa is generally considered a taboo. However if Meena masa co exists it is considered acceptable." "Meena" cannot coexist with Ashadha; the Math\'s own 2025 lists hold 26 Ashadha muhurtas, every one printed with solar masa "Mithuna" (Mithuna 17 to Mithuna 31), and none after Karka sankranti - so the exception applied is Mithuna.');
  else if (m.name === 'Ashadha') add('masa', 'Masa', 'fail', 'Ashadha after Karka sankranti is a taboo masa for muhurtas.', `Sri Uttaradi Math: "${UM_TEXT.ashadhaPushya}"`);
  else if (m.name === 'Pushya' && sunInDhanu) add('masa', 'Masa', 'fail', 'Pushya while Dhanur masa (Sun in Dhanu) coexists: no muhurtas.', `Sri Uttaradi Math: "${UM_TEXT.ashadhaPushya}"`);
  else if (['Chaitra', 'Vaishakha', 'Jyeshtha', 'Magha', 'Phalguna', 'Kartika', 'Margashira'].includes(m.name)) add('masa', 'Masa', 'pass', `${m.name} is a preferred masa.`, `Sri Uttaradi Math: "${UM_TEXT.masa}"`);
  else add('masa', 'Masa', 'warn', `${m.name} is outside the preferred masas.`, `Sri Uttaradi Math: "${UM_TEXT.masa}" Its lists do include such dates, with the lagnas starred "not preferred".`);

  // 6. Astha (UM-TEXT + UM-TABLE calibrated orbs).
  const astha = asthaStatus(day.sun.riseJd);
  const vedaMap = { rig: 'guru', yajur: 'shukra', sama: 'bhouma' };
  for (const [graha, label] of [['guru', 'Guru'], ['shukra', 'Shukra'], ['bhouma', 'Bhouma']]) {
    const s = astha[graha];
    if (!s.combust) continue;
    const applies = veda ? vedaMap[veda] === graha : graha !== 'bhouma';
    add(`astha-${graha}`, `${label} astha`, applies ? 'fail' : 'info',
      `${label} is combust (${s.separation.toFixed(1)}° from the Sun). ` +
        (veda ? (applies ? `Not suitable for ${veda}vedis.` : `Applies to ${Object.keys(vedaMap).find((k) => vedaMap[k] === graha)}vedis, not ${veda}vedis.`)
          : graha === 'guru' ? 'Not suitable for Rigvedis (Guru bala is essential for all).' : graha === 'shukra' ? 'Not suitable for Yajurvedis (Shukra bala is important for marriage).' : 'Not suitable for Samavedis.'),
      `Sri Uttaradi Math: "${UM_TEXT.astha}" Combustion windows calibrated to the Math's printed astha dates 2022-26 (20/24 boundaries exact, 4 within a day).`);
  }

  // 7. Nakshatra (UM-KN classes). The Math takes the nakshatra AT THE MUHURTA
  // TIME, so the day is judged on every nakshatra that runs between this
  // sunrise and the next; lagnaWindows then removes the time under an ashubha one.
  const timeline = nakshatraTimeline(day, ayName);
  const rank = { shubha: 2, madhyama: 1, ashubha: 0 };
  const better = (x) => (rank[x.surya.nature] >= rank[x.drik.nature] ? x.surya : x.drik);
  const bestNature = timeline.map(better).reduce((b, x) => (rank[x.nature] > rank[b] ? x.nature : b), 'ashubha');
  const seq = (k) => [...new Map(timeline.map((x) => [x[k].index, x[k]])).values()].map((x) => `${x.name} (${x.nature})`).join(', then ');
  const anyBoth = timeline.some((x) => x.both), anyOne = timeline.some((x) => !x.both && (x.surya.nature === 'ashubha' || x.drik.nature === 'ashubha'));
  add('nakshatra', 'Nakshatra', bestNature === 'shubha' ? 'pass' : bestNature === 'madhyama' ? 'warn' : 'fail',
    `Surya Siddhanta: ${seq('surya')}. Drik: ${seq('drik')}.` +
      (anyBoth ? ' Time that is ashubha in both is removed from the lagna windows.' : '') +
      (anyOne ? ' Time that is ashubha in only one of them is a caution.' : ''),
    `Sri Uttaradi Math, Kannada edition: "${UM_KN.nakshatraClass.kn}" (${UM_KN.nakshatraClass.en}) "${UM_KN.drikTithi.kn}" - the nakshatra is taken at the muhurta time. ` +
      'The Math publishes muhurtas in both frames (its Kannada lists in drik, its English lists in Surya Siddhanta), and its lists hold time that is ashubha in one frame only; so only time ashubha in both is a fault.');

  // 8. Upanayana paksha window (UM-TEXT).
  if (event === 'upanayana') {
    const idx = dt.index; // the drik muhurta tithi, as for every other tithi rule
    const inWindow = idx >= 5 && idx <= 20; // Shukla Panchami .. Krishna Panchami
    add('upanayana-window', 'Upanayana period', inWindow ? 'pass' : 'warn',
      inWindow ? 'Between Shukla Panchami and Krishna Panchami.' : 'Outside Shukla Panchami to Krishna Panchami.',
      `Sri Uttaradi Math: "${UM_TEXT.upanayanaWindow}"`);
  }

  // 9. The Math's day mark (UM-TABLE) - information, not a filter.
  const q = dayQuality(v, n);
  add('day-quality', 'Day quality', 'info', q.label + '.', q.basis + ' Not a muhurta filter: 207 of the Math\'s 501 published muhurtas fall on "–" days.');

  // 10. Special yogas (UM prints these).
  if (n === 8 && v === 4) {
    add('guru-pushya', 'Guru Pushya yoga', event === 'vivaha' ? 'warn' : 'info',
      event === 'vivaha' ? 'Guruvara with Pushya - an Amrita-siddhi yoga, but one the Math says to avoid for vivaha.' : 'Guruvara with Pushya nakshatra - auspicious.',
      'Sri Uttaradi Math panchanga prints "Guru Pushya Yoga"; its Sanskrit 2024-25 edition lists "ಅಮೃತಸಿದ್ಧಿ ವರ್ಜ್ಯ ... ವಿವಾಹಕ್ಕೆ ಗುರು ಪುಷ್ಯ" (Amrita-siddhi to be avoided: for vivaha, Guruvara with Pushya).');
  }
  if (n === 8 && v === 0) add('ravi-pushya', 'Pushyarka yoga', 'info', 'Ravivara with Pushya nakshatra - auspicious.', 'Sri Uttaradi Math panchanga prints "Pushyaarka Yoga".');

  // 10b. The Math's vara yogas (page 14): ashubha ones are cautions - its own
  // rule removes them when a shubha yoga is present, or by a strong lagna.
  const vy = day.muhurta?.varaYogas ?? varaYogas(day, ayName);
  const shubhaY = vy.filter((y) => y.nature === 'shubha'), ashubhaY = vy.filter((y) => y.nature === 'ashubha');
  const nameList = (list) => [...new Set(list.map((y) => `${y.name} (${y.detail.replace(/^\S+ with /, '')})`))].join(', ');
  const vyBasis = `Sri Uttaradi Math panchanga, shubha and ashubha yogas of vara with tithi and nakshatra (Kannada edition page 14; Sanskrit 2024-25 page 64). Its rule: "${VARA_YOGA_RULE.kn}" (${VARA_YOGA_RULE.en})`;
  if (ashubhaY.length && shubhaY.length) {
    add('vara-yogas', 'Vara yogas', 'info', `Ashubha: ${nameList(ashubhaY)}. Removed by the shubha ${nameList(shubhaY)} the same day.`, vyBasis);
  } else if (ashubhaY.length) {
    add('vara-yogas', 'Vara yogas', 'warn', `Ashubha: ${nameList(ashubhaY)}. No shubha yoga that day to remove it; a strong, shubha lagna also removes it.`, vyBasis);
  } else if (shubhaY.length) {
    add('vara-yogas', 'Vara yogas', 'pass', `Shubha: ${nameList(shubhaY)}.`, vyBasis);
  }
  const varjya = AMRITA_SIDDHI_VARJYA[event];
  if (varjya && v === varjya.vara) {
    const tl = nakshatraTimeline(day, ayName);
    if (tl.some((x) => x.surya.index === varjya.nakshatra)) {
      const whole = tl.every((x) => x.surya.index === varjya.nakshatra);
      add('amrita-siddhi-varjya', 'Amrita-siddhi to avoid', whole ? 'fail' : 'warn',
        `${VARA_NAMES[varjya.vara]} with ${NAKSHATRA_NAMES[varjya.nakshatra - 1]} - an Amrita-siddhi yoga the Math says to avoid ${varjya.text.split(':')[0]}.${whole ? '' : ' Its stretch of the day is removed from the lagna windows.'}`,
        `Sri Uttaradi Math panchanga, Sanskrit 2024-25 edition page 64: "ಅಮೃತಸಿದ್ಧಿ ವರ್ಜ್ಯ" - ${AMRITA_SIDDHI_VARJYA.vivaha.text}; ${AMRITA_SIDDHI_VARJYA.prayana.text}; ${AMRITA_SIDDHI_VARJYA.vastu.text}.`);
    }
  }

  // 10c. Prayana (travel, trade, a new job): the Anandadi yoga and, for a
  // person, the ghata chakra (both page 14).
  if (event === 'prayana') {
    const an = day.muhurta?.anandadi ?? anandadiForDay(day, ayName);
    const good = an.filter((a) => a.good), bad = an.filter((a) => !a.good);
    add('anandadi', 'Anandadi yoga', good.length ? (bad.length ? 'warn' : 'pass') : 'fail',
      an.map((a) => `${a.name} (${a.phala})`).join(', then ') + (bad.length && good.length ? '. The ashubha stretch is removed from the lagna windows.' : '.'),
      'Sri Uttaradi Math panchanga, "ಪ್ರಯಾಣಾರ್ಥಂ ಆನಂದಾದಿಯೋಗಾಃ" (Anandadi yogas for travel), Kannada edition page 14: the 28 yogas counted from Ashwini (Sunday), Mrigashira, Ashlesha, Hasta, Anuradha, U.Ashadha, Shatabhisha (Saturday), with Abhijit as the 28th nakshatra; phala as printed.');
    if (janma) {
      const gender = profile?.gender;
      const gh = ghataForDay(day, janma.rashi.index, gender, ayName);
      const whole = gh.hits.filter((h) => h.what === 'masa' || h.what === 'vara');
      const part = gh.hits.filter((h) => h.what !== 'masa' && h.what !== 'vara' && h.what !== 'prahara');
      add('ghata', 'Ghata chakra', whole.length ? 'fail' : part.length ? 'warn' : 'pass',
        whole.length || part.length
          ? `${[...whole, ...part].map((h) => h.detail).join('; ')}.${part.length && !whole.length ? ' Those stretches, and the ghata prahara, are removed from the lagna windows.' : ''}`
          : `No ghata masa, vara, tithi, nakshatra, yoga, karana or Moon today; the ${ordinal(gh.row.prahara)} prahara is removed from the lagna windows.`,
        `${gh.hits[0]?.basis ?? `Sri Uttaradi Math panchanga, "ಘಾತಚಕ್ರ": "${GHATA_RULE.kn}" (${GHATA_RULE.en})`}${gender !== 'male' && gender !== 'female' ? ' Gender not recorded on the profile: both the male and the female ghata Moon are applied.' : ''}`);
    }
  }

  // 11. Personal (UM-TEXT tarabala; UM-KN chandrabala, paksha primacy, gurubala).
  if (janma) {
    const shukla = dt.paksha === 'shukla';
    const pakshaBasis = `Kannada edition: "${UM_KN.paksha.kn}" (${UM_KN.paksha.en})`;
    const count = ((n - janma.nakshatra.index + 27) % 27) + 1;
    const rem = count % 9;
    const tara = rem === 0 ? 9 : rem;
    const TARA = ['', 'Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyak', 'Sadhana', 'Naidhana', 'Mitra', 'Parama Mitra'];
    const REMEDY = { 1: 'Shaka (vegetables) daana', 3: 'jaggery daana', 5: 'salt daana', 7: 'sesame, silver, gold and clothes daana' };
    const taraBad = [1, 3, 5, 7].includes(tara);
    add('tarabala', 'Tarabala', taraBad ? (shukla ? 'warn' : 'fail') : 'pass',
      `${TARA[tara]} tara (count ${count}, remainder ${rem}).${tara === 6 ? ' The best tara.' : ''}` +
        `${taraBad ? ` In unavoidable circumstances: ${REMEDY[tara]}.` : ''}${taraBad && shukla ? ' In shukla paksha chandrabala is what chiefly counts, so this is a caution.' : ''}`,
      `Sri Uttaradi Math: "${UM_TEXT.tarabala}" "${UM_TEXT.taraShanti}" Its tarabala table: "${UM_KN.tarabalaTable.kn}" (${UM_KN.tarabalaTable.en}) ${pakshaBasis}`);

    const cb = ((day.moon.rashi.index - janma.rashi.index + 12) % 12) + 1;
    const good = new Set([1, 3, 6, 7, 10, 11, ...(shukla ? [2, 5, 9] : [4, 8, 12])]);
    const cbBad = !good.has(cb);
    add('chandrabala', 'Chandrabala', cbBad ? (shukla ? 'fail' : 'warn') : 'pass',
      `Moon in the ${ordinal(cb)} from the janma rashi, ${shukla ? 'shukla' : 'krishna'} paksha.` +
        `${cbBad ? ' In unavoidable circumstances: Chandra graha puja, Chandra mantra japa and rice daana.' : ''}${cbBad && !shukla ? ' In krishna paksha tarabala is what chiefly counts, so this is a caution.' : ''}`,
      `Sri Uttaradi Math, Kannada edition: "${UM_KN.chandrabala.kn}" (${UM_KN.chandrabala.en}) ${pakshaBasis}`);

    if (event === 'vivaha' || event === 'upanayana') {
      const jd = day.sun.riseJd;
      const guru = siderealRashi(tropicalLongitude(jd, swe.SE_JUPITER).longitude, muhurtaAyanamsa(jd, ayName));
      const gh = ((guru - janma.rashi.index + 12) % 12) + 1;
      const inKarka = guru === 4;
      let st = 'pass', why = 'shubha';
      if ([4, 8, 12].includes(gh)) { st = inKarka ? 'pass' : 'fail'; why = inKarka ? 'no dosha, because Guru is in Karka' : 'especially bad, with no remedy (strong japa and shanti may help)'; }
      else if ([1, 3, 6, 10].includes(gh)) { st = 'warn'; why = 'ashubha, remedied by Guru mantra japa and Guru shanti'; }
      add('gurubala', 'Gurubala', st, `Guru in ${RASHI_NAMES[guru - 1]}, the ${ordinal(gh)} from the janma rashi: ${why}.`,
        `Sri Uttaradi Math, Kannada edition: "${UM_KN.gurubala.kn}" (${UM_KN.gurubala.en}) Guru's rashi: drik position with the ${ganita() === 'surya' ? 'Math\'s Siddhantic' : ayName} ayanamsa, at sunrise.`);
    }
  }

  const fails = pts.filter((p) => p.status === 'fail').length;
  const warns = pts.filter((p) => p.status === 'warn').length;
  return {
    event,
    verdict: fails ? 'ashubha' : warns ? 'shubha-with-cautions' : 'shubha',
    points: pts,
    caveat: `Sri Uttaradi Math: "${UM_TEXT.consult}"`,
  };
}

/* ============================================================ lagna windows */

const MALEFICS = new Set(['surya', 'mangala', 'shani', 'rahu', 'ketu']);
const GRAHA_BODIES = [
  ['surya', 'SE_SUN'], ['chandra', 'SE_MOON'], ['mangala', 'SE_MARS'], ['budha', 'SE_MERCURY'],
  ['guru', 'SE_JUPITER'], ['shukra', 'SE_VENUS'], ['shani', 'SE_SATURN'], ['rahu', 'SE_MEAN_NODE'],
];

function siderealRashi(tropical, ayan) { return Math.floor(norm360(tropical - ayan) / 30) + 1; }

/** Graha rashis at a moment in the muhurta frame (drik positions, muhurta ayanamsa). */
function grahaRashis(jdUt, ayan) {
  const out = {};
  for (const [g, key] of GRAHA_BODIES) out[g] = siderealRashi(tropicalLongitude(jdUt, swe[key]).longitude, ayan);
  out.ketu = ((out.rahu + 5) % 12) + 1;
  return out;
}

const houseFrom = (rashi, from) => ((rashi - from + 12) % 12) + 1;

/**
 * Why the classical house rules are CAUTIONS, not failures: measured against
 * the Math's own published muhurtas (519 unstarred lagnas, 2025-27, in Surya
 * Siddhanta), the lagnas it lists break ashtama shuddhi 25% of the time, the
 * Moon rule 24% and jamitra 18%. Enforcing them would reject a quarter of the
 * Math's own muhurtas; it leaves individual suitability to an astrologer.
 */
const HOUSE_NOTE = 'Shown as a caution, not a failure: the Sri Uttaradi Math\'s own published muhurta lagnas do not ' +
  'enforce it (about a quarter break it), and the Math leaves individual suitability to an astrologer.';

/**
 * The lagna windows of one day for an event: each rising sign, trimmed of its
 * thyajya third and of Rahu kala, Yamaganda, Gulika, durmuhurta and nakshatra
 * thyajya, with the lagna/house shuddhi points for what remains.
 */
export function lagnaWindows(day, place, { event = 'general', janma = null, janmaLagna = null, ayanamsaName = 'trueCitra', gender = null } = {}) {
  const from = day.sun.riseJd, to = day.sun.nextRiseJd;
  const ayan = muhurtaAyanamsa(from, ayanamsaName);
  const lagnaAt = (jd) => siderealRashi(tropicalAscendant(jd, place), ayan);

  // Sign segments: 10-minute sampling, bisection at each change, and
  // re-scanning after each boundary so a sign that rises in under 10 minutes
  // (high latitudes) is never skipped.
  const segs = segmentBy(lagnaAt, from, to, 10).map((x) => ({ rashi: x.value, startJd: x.startJd, endJd: x.endJd }));
  // Each segment's FULL rising (fullStart..fullEnd): the lagna running at
  // sunrise began before it and the last one runs past the next sunrise, and
  // the thyajya's beginning / middle / end belong to the whole lagna.
  const edge = (jd, dir) => {
    const r0 = lagnaAt(jd);
    let a = jd, b = jd;
    for (let k = 0; k < 120; k++) { b = a + dir * 10 / 1440; if (lagnaAt(b) !== r0) break; a = b; }
    for (let k = 0; k < 30; k++) { const mid = (a + b) / 2; if (lagnaAt(mid) === r0) a = mid; else b = mid; }
    return (a + b) / 2;
  };
  for (const [i, sg] of segs.entries()) {
    sg.fullStart = i === 0 ? edge(sg.startJd, -1) : sg.startJd;
    sg.fullEnd = i === segs.length - 1 ? edge(sg.endJd - 1e-7, +1) : sg.endJd;
  }

  // HARD cut: time under a nakshatra that is ashubha in BOTH the Surya
  // Siddhanta and the drik frame (UM-KN: the nakshatra is taken at the
  // muhurta time; see nakshatraTimeline).
  // CAUTIONS, measured against the Math's own Kannada lists (133 muhurtas):
  // Nakshatra Thyajya as the Math defines it (14 published times inside it,
  // about 11 expected by chance), Rahukala (13 inside the Math's own printed
  // Rahukala, and its text: rahukala is no dosha per many), yoga thyajya (4
  // inside), Vishti karana (14 inside), and Yamaganda, Gulika and durmuhurta,
  // which the Math does not print.
  const ayName = day.meta?.ayanamsa ?? ayanamsaName;
  const dayEnd = Number.isFinite(to) ? to : from + 1;
  const timeline = nakshatraTimeline(day, ayName);
  const avoid = timeline.filter((x) => x.both)
    .map((x) => ({ startJd: x.startJd, endJd: x.endJd, label: `Ashubha nakshatra (${x.surya.name === x.drik.name ? x.surya.name : `${x.surya.name} / drik ${x.drik.name}`})` }));
  // Amrita-siddhi the Math says to avoid for this event (vivaha / prayana / vastu).
  const varjya = AMRITA_SIDDHI_VARJYA[event];
  if (varjya && day.vara.index === varjya.vara) {
    for (const x of timeline) if (x.surya.index === varjya.nakshatra) avoid.push({ startJd: x.startJd, endJd: x.endJd, label: `Amrita-siddhi to avoid ${varjya.text.split(':')[0]}` });
  }
  // Prayana: ashubha Anandadi stretches, and the person's ghata chakra.
  if (event === 'prayana') {
    for (const a of (day.muhurta?.anandadi ?? anandadiForDay(day, ayName))) if (!a.good) avoid.push({ startJd: a.startJd, endJd: a.endJd, label: `${a.name} (Anandadi, ${a.phala})` });
    if (janma) for (const h of ghataForDay(day, janma.rashi.index, gender, ayName).hits) avoid.push({ startJd: h.startJd, endJd: h.endJd, label: `Ghata ${h.what}` });
  }
  const oneFrame = timeline.filter((x) => !x.both && (x.surya.nature === 'ashubha' || x.drik.nature === 'ashubha'))
    .map((x) => ({ startJd: x.startJd, endJd: x.endJd, label: `${x.surya.nature === 'ashubha' ? x.surya.name : x.drik.name} (ashubha in ${x.surya.nature === 'ashubha' ? 'Surya Siddhanta' : 'drik'} only)` }));
  const yogaCautions = angaSpans((j) => yogaAt(j, ayName), from, dayEnd)
    .filter((y) => YOGA_THYAJYA_GHATIS[y.name])
    .map((y) => ({ startJd: y.startJd, endJd: Math.min(y.endJd, y.startJd + (YOGA_THYAJYA_GHATIS[y.name] / 60) * (y.endJd - y.startJd)), label: `${y.name} yoga thyajya (${YOGA_THYAJYA_GHATIS[y.name]} ghatikas)` }));
  const karanaCautions = angaSpans((j) => karanaAt(j), from, dayEnd)
    .filter((k) => DUSHTA_KARANAS.has(k.name)).map((k) => ({ startJd: k.startJd, endJd: k.endJd, label: `${k.name} karana` }));
  const cautions = [
    ...(day.muhurta?.thyajya ?? []).map((t) => ({ ...t, label: `Nakshatra thyajya (${t.nakshatra})` })),
    { ...day.kaala.rahu, label: 'Rahu kala' },
    { ...day.kaala.yamaganda, label: 'Yamaganda' },
    { ...day.kaala.gulika, label: 'Gulika kala' },
    ...(day.muhurta?.durmuhurtas ?? []).map((d) => ({ ...d, label: `Durmuhurta (${d.devata})` })),
    ...yogaCautions, ...karanaCautions, ...oneFrame,
  ];
  const cutAll = (pieces, windows) => {
    for (const w of windows) {
      if (!Number.isFinite(w.startJd)) continue;
      pieces = pieces.flatMap((p) => {
        if (w.endJd <= p.startJd || w.startJd >= p.endJd) return [p];
        const r = [];
        if (w.startJd > p.startJd) r.push({ startJd: p.startJd, endJd: w.startJd });
        if (w.endJd < p.endJd) r.push({ startJd: w.endJd, endJd: p.endJd });
        return r;
      });
    }
    return pieces.filter((p) => p.endJd - p.startJd >= 5 / 1440); // under 5 minutes is not a usable window
  };
  const cautionPoint = (pieces) => {
    const hits = cautions.filter((w) => Number.isFinite(w.startJd) && pieces.some((p) => w.endJd > p.startJd && w.startJd < p.endJd)).map((w) => w.label);
    return hits.length ? {
      id: 'kaala-cautions', label: 'Other inauspicious periods', status: 'warn',
      detail: `Part of this window overlaps ${hits.join(', ')} - prefer the part outside it.`,
      basis: `Not removed: the Sri Uttaradi Math's own published muhurtas fall inside these about as often as chance would put them (of the ${KN_LIST}: 14 inside its Nakshatra Thyajya, 13 inside its printed Rahukala, 4 inside a yoga thyajya, 14 in Vishti karana). ` +
        `Kannada edition on Rahukala: "${UM_KN.rahukala.kn}" (${UM_KN.rahukala.en}) Yoga thyajya: "${UM_KN.yogaThyajya.kn}" (${UM_KN.yogaThyajya.en}) Karanas: "${UM_KN.karana.kn}" (${UM_KN.karana.en}) Yamaganda, Gulika and durmuhurta are from sudhyk's Ahoratra and the classical texts; the Math does not print them.`,
    } : null;
  };
  // Navamsha (amsha) pieces of a lagna segment - for vivaha amsha shuddhi.
  const amshaAt = (jd) => Math.floor(norm360(tropicalAscendant(jd, place) - ayan) * 9 / 30) % 12 + 1;
  const amshaPieces = (seg, allowedAmshas) => segmentBy(amshaAt, seg.startJd, seg.endJd, 2)
    .filter((x) => allowedAmshas.includes(x.value)).map((x) => ({ startJd: x.startJd, endJd: x.endJd, amsha: x.value }));

  const allowed = event === 'vivaha' || event === 'upanayana' ? LAGNA_SHUDDHI[event] : null;
  const out = [];
  for (const s of segs) {
    const part = LAGNA_THYAJYA_PART[s.rashi];
    const tyLen = LAGNA_THYAJYA_MINUTES / 1440;
    const tyStart = part === 0 ? s.fullStart : part === 2 ? s.fullEnd - tyLen : (s.fullStart + s.fullEnd) / 2 - tyLen / 2;
    const thyajya = { startJd: tyStart, endJd: tyStart + tyLen };
    let pieces = cutAll([{ startJd: s.startJd, endJd: s.endJd }], [thyajya, ...avoid]);
    // Vivaha: a lagna outside the shuddhi list is usable only in a shuddha amsha.
    let amshaNote = null;
    if (event === 'vivaha' && !allowed.includes(s.rashi)) {
      const ap = amshaPieces(s, s.rashi === 9 ? [...VIVAHA_AMSHA, 9] : VIVAHA_AMSHA);
      pieces = pieces.flatMap((p) => ap.map((q) => ({ startJd: Math.max(p.startJd, q.startJd), endJd: Math.min(p.endJd, q.endJd), amsha: q.amsha })))
        .filter((p) => p.endJd - p.startJd >= 5 / 1440);
      amshaNote = [...new Set(ap.map((q) => RASHI_NAMES[q.amsha - 1]))];
    }
    const removedBy = [{ ...thyajya, label: 'Lagna thyajya' }, ...avoid]
      .filter((w) => Number.isFinite(w.startJd) && w.endJd > s.startJd && w.startJd < s.endJd).map((w) => w.label);

    const mid = (s.startJd + s.endJd) / 2;
    const g = grahaRashis(mid, ayan);
    const pts = [];
    const add = (id, label, status, detail, basis) => pts.push({ id, label, status, detail, basis });
    if (allowed) {
      const lagnaOk = allowed.includes(s.rashi);
      const viaAmsha = !lagnaOk && event === 'vivaha' && pieces.length > 0;
      add('lagna-shuddhi', 'Lagna shuddhi', lagnaOk || viaAmsha ? 'pass' : 'fail',
        lagnaOk ? `${RASHI_NAMES[s.rashi - 1]} lagna is a shuddha lagna for ${event}.`
          : viaAmsha ? `${RASHI_NAMES[s.rashi - 1]} lagna is not in the shuddhi list, but only its shuddha amsha (${amshaNote.join(', ')}) is kept.`
            : `${RASHI_NAMES[s.rashi - 1]} lagna is not a shuddha lagna for ${event}${event === 'vivaha' ? ', and no shuddha amsha of it remains usable' : ''}.`,
        `Sri Uttaradi Math: "${UM_TEXT[`${event}Lagna`]}".` + (event === 'vivaha'
          ? ' In its Kannada lists the Math also sets vivaha muhurtas in Mesha (11), Dhanu (11) and Tula (4) lagnas - every one in a shuddha amsha (Vrishabha, Mithuna, Kanya, Meena, or Dhanu in Dhanu) - so a vivaha lagna is judged by its amsha when the lagna itself is not shuddha.'
          : ' All 18 Upanayana lagnas in its Kannada lists are in this list.'));
    }
    add('lagna-thyajya', 'Lagna thyajya', 'info',
      `${LAGNA_THYAJYA_MINUTES} minutes at the ${['beginning', 'middle', 'end'][part]} of ${RASHI_NAMES[s.rashi - 1]} are discarded.`,
      `Sri Uttaradi Math, Kannada edition: "${UM_KN.lagnaThyajya.kn}" (${UM_KN.lagnaThyajya.en}) The English edition says "one third" for the same parts, but the Math's own published times obey the Kannada rule: at Bengaluru 35 of 98 published lagna times fall inside the "one third", none inside the half ghalige.`);
    // Panchaka (UM-KN), on the drik tithi at the window's middle.
    const pt = withGanita('drik', () => tithiAt(mid)).index;
    const pr = (pt + s.rashi) % 9;
    if (PANCHAKA[pr]) {
      add('panchaka', 'Panchaka', 'warn', `${PANCHAKA[pr]} panchaka (tithi ${pt} + lagna ${s.rashi} = ${pt + s.rashi}, remainder ${pr}).` +
        `${pr === 1 ? ' Remedy: oil (taila) daana.' : pr === 8 ? ' Remedy: copper (tamra) daana.' : ''} No dosha if the lagna is strong.`,
        `Sri Uttaradi Math, Kannada edition: "${UM_KN.panchaka.kn}" (${UM_KN.panchaka.en}) A caution: 52 of the 104 lagna muhurtas in its Kannada lists are in a panchaka.`);
    }
    const inEighth = Object.entries(g).filter(([, r]) => houseFrom(r, s.rashi) === 8).map(([k]) => k);
    add('ashtama-shuddhi', 'Ashtama shuddhi', inEighth.length ? 'warn' : 'pass',
      inEighth.length ? `The 8th from the lagna holds ${inEighth.join(', ')}.` : 'The 8th house from the lagna is vacant.',
      `Classical muhurta rule (Muhurta Chintamani): the 8th from the muhurta lagna should be vacant. ${HOUSE_NOTE}`);
    if (event === 'vivaha') {
      const inSeventh = Object.entries(g).filter(([, r]) => houseFrom(r, s.rashi) === 7).map(([k]) => k);
      add('jamitra-shuddhi', 'Jamitra (7th) shuddhi', inSeventh.length ? 'warn' : 'pass',
        inSeventh.length ? `The 7th from the lagna holds ${inSeventh.join(', ')}.` : 'The 7th house from the lagna is vacant.',
        `Classical vivaha rule (Muhurta Chintamani): the 7th from the vivaha lagna should be vacant. ${HOUSE_NOTE}`);
    }
    const moonHouse = houseFrom(g.chandra, s.rashi);
    add('chandra-house', 'Chandra from lagna', [6, 8, 12].includes(moonHouse) ? 'warn' : 'pass',
      `The Moon is in the ${ordinal(moonHouse)} from the lagna.`, `Classical muhurta rule: the Moon in the 6th, 8th or 12th from the muhurta lagna is avoided. ${HOUSE_NOTE}`);
    const inLagna = Object.entries(g).filter(([k, r]) => MALEFICS.has(k) && r === s.rashi).map(([k]) => k);
    if (inLagna.length) add('papa-lagna', 'Malefic in lagna', 'warn', `${inLagna.join(', ')} in the lagna.`, 'Classical muhurta rule: a malefic in the muhurta lagna is avoided.');
    if (janma) {
      const h = houseFrom(s.rashi, janma.rashi.index);
      add('janma-rashi-ashtama', 'Lagna from janma rashi', h === 8 ? 'fail' : 'pass',
        `The muhurta lagna is the ${ordinal(h)} from the janma rashi.`, 'Classical muhurta rule: a lagna in the 8th from the janma rashi (janma-ashtama) is avoided.');
    }
    if (janmaLagna) {
      const h = houseFrom(s.rashi, janmaLagna);
      add('janma-lagna-ashtama', 'Lagna from janma lagna', h === 8 ? 'fail' : 'pass',
        `The muhurta lagna is the ${ordinal(h)} from the janma lagna.`, 'Classical muhurta rule: a lagna in the 8th from the janma lagna is avoided.');
    }
    const cp = cautionPoint(pieces);
    if (cp) pts.push(cp);
    if (!pieces.length) {
      add('no-usable-time', 'Usable time', 'info', `No usable time remains after removing: ${removedBy.join(', ')}${event === 'vivaha' && !allowed.includes(s.rashi) ? ', and the non-shuddha amshas' : ''}.`,
        'Each removal is named after its rule; the rules and their sources are in the day\'s points (Sri Uttaradi Math, Kannada edition pages 8 and 14).');
    }
    const fails = pts.filter((p) => p.status === 'fail').length;
    out.push({
      rashi: s.rashi, rashiName: RASHI_NAMES[s.rashi - 1], startJd: s.startJd, endJd: s.endJd,
      thyajya, usable: pieces,
      verdict: fails ? 'ashubha' : pieces.length ? 'shubha' : 'no-usable-time',
      points: pts,
    });
  }
  // Abhijit muhurta for vivaha (UM-KN-LIST): 29 of the Math's 70 Kannada-list
  // vivaha muhurtas are printed "ಅಭಿಜಿತ್" in place of a lagna - any weekday,
  // Wednesday included - so it is offered without lagna shuddhi.
  const ab = day.muhurta?.abhijit;
  if (event === 'vivaha' && ab && Number.isFinite(ab.startJd)) {
    const pieces = cutAll([{ startJd: ab.startJd, endJd: ab.endJd }], avoid);
    const pts = [{
      id: 'abhijit', label: 'Abhijit muhurta', status: 'pass', detail: 'The 8th day muhurta, around local noon; used by the Math for vivaha without regard to the lagna.',
      basis: `Sri Uttaradi Math practice: its Kannada editions print 29 of their 70 vivaha muhurtas (2025-27) as "ಅಭಿಜಿತ್" (Abhijit), on every weekday including Wednesday. Kannada edition, laghu nakshatras: "... (ಅಭಿಜಿತ್‌)".`,
    }];
    const cp = cautionPoint(pieces);
    if (cp) pts.push(cp);
    if (!pieces.length) pts.push({ id: 'no-usable-time', label: 'Usable time', status: 'info', detail: 'Abhijit falls wholly under an ashubha nakshatra today.', basis: 'Nakshatra classes (Sri Uttaradi Math, Kannada edition).' });
    out.push({ rashi: 0, rashiName: 'Abhijit muhurta', startJd: ab.startJd, endJd: ab.endJd, thyajya: null, usable: pieces, verdict: pieces.length ? 'shubha' : 'no-usable-time', points: pts });
    out.sort((x, y) => x.startJd - y.startJd);
  }
  // Beyond the polar circles part of the ecliptic never rises: the ascendant
  // jumps over whole signs and lagna-based muhurta is not well defined.
  const polarCaveat = Math.abs(place.latitude) > 66 - 1e-9 || segs.some((sg, i) => i > 0 && sg.rashi !== (segs[i - 1].rashi % 12) + 1)
    ? `At latitude ${place.latitude.toFixed(2)}° part of the ecliptic never rises, so the lagna jumps over whole signs; lagna-based muhurtas are not reliable here - consult the Math.`
    : null;
  return { polarCaveat, ayanamsaDegrees: ayan, ayanamsaBasis: ganita() === 'surya' ? 'Siddhantic ayanamsa (54″/year from 499 CE), matching the Math\'s printed value' : `${ayanamsaName} ayanamsa`, windows: out };
}

/* ===================================================== next auspicious days */

/**
 * The next days, from `fromDate`, that are shubha for the event (and the
 * person, when given) AND hold at least one usable lagna window that passes
 * every lagna and house rule.
 *
 * `computeDayFn(date)` must return a computeDay result with `muhurta` attached
 * (index.js supplies it) - injected to keep this module free of a cycle.
 */
export function nextMuhurtaDays({ fromDate, computeDayFn, place, event = 'general', janma = null, janmaLagna = null, veda = null, profile = null, ayanamsaName = 'trueCitra', count = 3, horizonDays = 180 }) {
  const gender = profile?.gender ?? null;
  const found = [];
  const start = Date.UTC(fromDate.year, fromDate.month - 1, fromDate.day);
  let examined = 0;
  for (let k = 1; k <= horizonDays && found.length < count; k++) {
    const d = new Date(start + k * 86400000);
    const date = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    let day;
    try { day = computeDayFn(date); } catch { continue; }
    examined++;
    const ev = evaluateDay(day, { event, profile, janma, veda });
    if (ev.verdict === 'ashubha') continue;
    const lw = lagnaWindows(day, place, { event, janma, janmaLagna, ayanamsaName, gender });
    const good = lw.windows.filter((w) => w.verdict === 'shubha');
    if (!good.length) continue;
    found.push({ date, sunriseJd: day.sun.riseJd, tzOffsetHours: day.date.tzOffsetHours, evaluation: ev, windows: good, ayanamsaBasis: lw.ayanamsaBasis });
  }
  return { event, found, examinedDays: examined, horizonDays };
}

