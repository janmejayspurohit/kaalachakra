/**
 * Vara yogas, Anandadi yogas and the Ghata chakra - transcribed from Sri
 * Uttaradi Math's own panchanga, not from a textbook.
 *
 * SOURCES (the Math's editions, cdn.umath.in):
 *   KN   Kannada edition 2026-27 page 14 (= 2025-26 page 26): "ಶುಭಾಶುಭ
 *        ಯೋಗಗಳು", "ಪ್ರಯಾಣಾರ್ಥಂ ಆನಂದಾದಿಯೋಗಾಃ", "ಘಾತಚಕ್ರ". Decoded from
 *        Shree-Lipi; cells placed by their PDF coordinates where a row has
 *        empty cells.
 *   SA   Sanskrit (Devanagari) edition 2024-25 pages 46 and 64 - the same
 *        tables in extractable text, used to settle cells the Kannada
 *        rendering leaves ambiguous and for rows the Kannada omits.
 * Where the editions differ the choice and the variant are both recorded in
 * VARIANTS below, and every result carries its basis.
 *
 * Tithis are numbered 1..15 within the paksha, 15 standing for both Purnima
 * and Amavasya, as in the Math's Nandadi table ("೧೫/೩೦").
 * Weekdays 0 = Sunday .. 6 = Saturday. Nakshatras 1..27.
 */
import { tithi as tithiAt, nakshatra as nakshatraAt, yoga as yogaAt, karana as karanaAt, NAKSHATRA_NAMES, RASHI_NAMES, VARA_NAMES } from './panchanga.js';
import { panchangaMoon } from './ephemeris.js';

const T = (sun, mon, tue, wed, thu, fri, sat) => [sun, mon, tue, wed, thu, fri, sat];

/* ================================================================ vara yogas */

/** Shubha yogas: vara with tithi, or vara with nakshatra. */
export const SHUBHA_VARA_YOGAS = Object.freeze([
  // Siddhi (vara-tithi): Sunday and Monday cells are empty (SA page 64
  // coordinates); the rest is the Nandadi-vara table of KN page 8.
  { name: 'Siddhi', kind: 'tithi', cells: T([], [], [3, 8, 13], [2, 7, 12], [5, 10, 15], [1, 6, 11], [4, 9, 14]) },
  { name: 'Amrita', kind: 'tithi', cells: T([1, 6, 11], [2, 7, 12], [1, 6, 11], [3, 8, 13], [4, 9, 14], [2, 7, 12], [5, 10, 15]) },
  { name: 'Siddhi', kind: 'nakshatra', cells: T([19], [22], [26], [3], [7], [11], [15]) },
  { name: 'Amrita-siddhi', kind: 'nakshatra', cells: T([13], [5], [1], [17], [8], [27], [4]) },
  { name: 'Sarvartha-siddhi', kind: 'nakshatra',
    cells: T([13, 19, 12, 21, 26, 1, 8], [22, 4, 5, 8, 17], [1, 3, 9, 26], [4, 17, 13, 3, 5], [27, 17, 1, 7, 8], [27, 17, 1, 7, 22], [22, 4, 15]) },
  { name: 'Amrita', kind: 'nakshatra', cells: T([7, 8, 19, 13], [4], [19], [5], [12], [22], [10]) },
  { name: 'Shubha', kind: 'nakshatra', cells: T([22], [7], [19], [11], [26], [15], [3]) },
]);

/** Ashubha yogas. */
export const ASHUBHA_VARA_YOGAS = Object.freeze([
  { name: 'Dagdha', kind: 'tithi', cells: T([12], [11], [5], [3], [6], [8], [9]) },
  { name: 'Hutashana', kind: 'tithi', cells: T([12], [6], [7], [8], [9], [10], [11]) },
  { name: 'Visha', kind: 'tithi', cells: T([4], [6], [7], [2], [8], [9], [7]) },
  { name: 'Krakacha', kind: 'tithi', cells: T([12], [11], [10], [9], [8], [7], [6]) },
  // Samvarta: Sunday Saptami and Wednesday Pratipada (SA page 64 coordinates).
  { name: 'Samvarta', kind: 'tithi', cells: T([7], [], [], [1], [], [], []) },
  { name: 'Yamaghanta', kind: 'nakshatra', cells: T([10], [16], [6], [19], [3], [4], [13]) },
  { name: 'Utpata', kind: 'nakshatra', cells: T([16], [20], [23], [27], [4], [8], [12]) },
  // Mrityu: printed in SA, absent from the Kannada editions.
  { name: 'Mrityu', kind: 'nakshatra', cells: T([17], [21], [24], [1], [5], [9], [13]) },
  { name: 'Kana', kind: 'nakshatra', cells: T([18], [1], [25], [2], [6], [10], [14]) },
  { name: 'Yamadamshtra', kind: 'nakshatra', cells: T([10, 23], [19, 16], [3, 4], [20, 7], [21, 1], [4, 17], [22, 24]) },
  { name: 'Dagdha', kind: 'nakshatra', cells: T([2], [14], [21], [23], [12], [18], [27]) },
  // Vara + tithi + nakshatra. Thursday's cell is printed "೯-ನ" / "9 / न." in
  // every edition - no nakshatra begins with ನ - so it is left unapplied.
  { name: 'Visha', kind: 'tithi-nakshatra', cells: T([[5, 13]], [[6, 5]], [[7, 1]], [[8, 17]], [], [[10, 27]], [[11, 4]]) },
  { name: 'Halahala', kind: 'tithi-nakshatra', cells: T([[5, 3]], [[2, 14]], [[15, 4]], [[7, 2]], [[13, 17]], [[6, 22]], [[8, 27]]) },
]);

export const VARIANTS = Object.freeze([
  'Sarvartha-siddhi, Sunday and Monday: the Kannada editions (2025-26, 2026-27) print "ಪು" (Pushya, the reading also of the classical lists); the Sanskrit 2024-25 edition prints Punarvasu. Pushya is used.',
  'Sarvartha-siddhi, Monday, and Visha (6th tithi), Monday: the Kannada editions print Mrigashira; the Sanskrit 2024-25 edition prints Mula. Mrigashira (two later editions) is used.',
  'Visha (vara-tithi-nakshatra), Thursday: printed "9 - ನ" in every edition, which names no nakshatra; not applied.',
  'Mrityu yoga: printed in the Sanskrit 2024-25 edition only.',
  'Ghata chakra, Tula ghata masa: Kannada 2026-27 prints Margashira (repeating Vrishabha\'s); the Sanskrit 2024-25 edition prints Magha, as do the classical tables. Magha is used.',
]);

/** SA page 46: "ಮೃತ್ಯು ಮೊದಲಾದ ಅಶುಭಯೋಗ ಇದ್ದ ದಿನ ಅಮೃತಾದಿ ಶುಭಯೋಗಗಳು ಇದ್ದರೆ ದೋಷ ಪರಿಹಾರವಾಗುತ್ತದೆ ..." */
export const VARA_YOGA_RULE = Object.freeze({
  kn: 'ಮೃತ್ಯು ಮೊದಲಾದ ಅಶುಭಯೋಗ ಇದ್ದ ದಿನ ಅಮೃತಾದಿ ಶುಭಯೋಗಗಳು ಇದ್ದರೆ ದೋಷ ಪರಿಹಾರವಾಗುತ್ತದೆ। ಅಶುಭ ಯೋಗವಿದ್ದು ಬಲಿಷ್ಠ ಹಾಗೂ ಶುಭ ಲಗ್ನ ಇದ್ದರೆ ದೋಷ ಪರಿಹಾರವಾಗುತ್ತದೆ।',
  en: 'On a day with Mrityu or another ashubha yoga, if Amrita or another shubha yoga is also present the dosha is removed. With an ashubha yoga, a strong and shubha lagna also removes the dosha.',
});

/**
 * SA page 64, "ಅಮೃತಸಿದ್ಧಿ ವರ್ಜ್ಯ": the Amrita-siddhi combination that is to
 * be AVOIDED for particular undertakings.
 */
export const AMRITA_SIDDHI_VARJYA = Object.freeze({
  vivaha: { vara: 4, nakshatra: 8, text: 'for vivaha: Guruvara with Pushya' },
  prayana: { vara: 6, nakshatra: 4, text: 'for travel (prayana): Shanivara with Rohini' },
  vastu: { vara: 2, nakshatra: 1, text: 'for entering a house (pravesha): Mangalavara with Ashwini' },
});

/* ============================================================= Anandadi */

/** The 28 Anandadi yogas with the phala the Math prints (KN page 14). */
export const ANANDADI = Object.freeze([
  ['Ananda', 'sukha', true], ['Kaladanda', 'nasha', false], ['Dhumra', 'tapa', false], ['Prajapati', 'saubhagya', true],
  ['Saumya', 'saukhya', true], ['Dhvanksha', 'duhkha', false], ['Dhvaja', 'labha', true], ['Shrivatsa', 'sukha', true],
  ['Vajra', 'kshaya', false], ['Mudgara', 'duhkha', false], ['Chhatra', 'sukha', true], ['Mantra', 'harsha', true],
  ['Manasa', 'saubhagya', true], ['Padma', 'dhana', true], ['Lambaka', 'dhana-nasha', false], ['Utpata', 'roga', false],
  ['Mrityu', 'nasha', false], ['Kana', 'klesha', false], ['Siddhi', 'siddhi', true], ['Shubha', 'shubha', true],
  ['Amrita', 'sukha', true], ['Musala', 'vyaya', false], ['Gada', 'nasha', false], ['Matanga', 'labha', true],
  ['Rakshasa', 'kalaha', false], ['Chara', 'siddhi', true], ['Sthira', 'labha', true], ['Vardhamana', 'sukha', true],
].map(([name, phala, good]) => Object.freeze({ name, phala, good })));

/** Position (1..28) at which each weekday's count starts: Ashwini, Mrigashira, Ashlesha, Hasta, Anuradha, U.Ashadha, Shatabhisha. */
export const ANANDADI_START = Object.freeze([1, 5, 9, 13, 17, 21, 25]);

/** Abhijit, the 28th nakshatra: 276°40' to 280°53'20" (the last pada of U.Ashadha and the first fifteenth of Shravana). */
const ABHIJIT = [276 + 40 / 60, 280 + 53 / 60 + 20 / 3600];

/** Position 1..28 in the 28-nakshatra list for a sidereal Moon longitude. */
export function nakshatra28(moonLon) {
  if (moonLon >= ABHIJIT[0] && moonLon < ABHIJIT[1]) return 22;
  const n = Math.floor(moonLon / (360 / 27)) + 1;
  return n <= 21 ? n : n + 1;
}

export function anandadiYoga(varaIndex, pos28) {
  return ANANDADI[(((pos28 - ANANDADI_START[varaIndex]) % 28) + 28) % 28];
}

/* ========================================================== ghata chakra */

/**
 * Ghata chakra by janma rashi (KN page 14, SA page 64). The Math: "ಘಾತಚಕ್ರವು
 * ದ್ಯೂತ, ಪ್ರವಾಸ, ರಾಜದರ್ಶನ, ಯಾತ್ರಾ, ಪ್ರಯಾಣ, ವಾಣಿಜ್ಯ, ಹೊಸ ಉದ್ಯೋಗ
 * ಇತ್ಯಾದಿಗಳಿಗೆ ವರ್ಜ್ಯವಿದೆ" - to be avoided for gambling, travel, royal
 * audience, pilgrimage, journeys, trade, a new job and the like.
 * chandra: the ghata Moon as a COUNT from the janma rashi, for men and women.
 */
export const GHATA_CHAKRA = Object.freeze([
  //  masa,        tithis,      vara, nak, yoga,        karana,       prahara, chandra male, female
  ['Kartika', [1, 6, 11], 0, 10, 'Vishkambha', 'Bava', 1, 1, 1],
  ['Margashira', [5, 10, 15], 6, 13, 'Shukla', 'Shakuni', 4, 5, 8],
  ['Ashadha', [2, 7, 12], 1, 15, 'Parigha', 'Kaulava', 3, 9, 7],
  ['Pushya', [2, 7, 12], 3, 17, 'Vyaghata', 'Naga', 1, 2, 9],
  ['Jyeshtha', [3, 8, 13], 6, 19, 'Dhriti', 'Bava', 1, 6, 4],
  ['Bhadrapada', [5, 10, 15], 6, 22, 'Shukla', 'Kaulava', 1, 10, 3],
  ['Magha', [4, 9, 14], 4, 24, 'Shukla', 'Taitila', 4, 3, 6],
  ['Ashvayuja', [1, 6, 11], 5, 27, 'Vyatipata', 'Gara', 1, 7, 2],
  ['Shravana', [3, 8, 13], 5, 2, 'Vajra', 'Taitila', 1, 4, 10],
  ['Vaishakha', [4, 9, 14], 2, 4, 'Vaidhriti', 'Shakuni', 4, 8, 11],
  ['Chaitra', [3, 8, 13], 4, 6, 'Ganda', 'Kimstughna', 3, 11, 5],
  ['Phalguna', [5, 10, 15], 5, 9, 'Vajra', 'Chatushpada', 4, 12, 12],
].map(([masa, tithis, vara, nakshatra, yoga, karana, prahara, chandraMale, chandraFemale]) =>
  Object.freeze({ masa, tithis, vara, nakshatra, yoga, karana, prahara, chandraMale, chandraFemale })));

export const GHATA_RULE = Object.freeze({
  kn: 'ಘಾತಚಕ್ರವು ದ್ಯೂತ, ಪ್ರವಾಸ, ರಾಜದರ್ಶನ, ಯಾತ್ರಾ, ಪ್ರಯಾಣ, ವಾಣಿಜ್ಯ, ಹೊಸ ಉದ್ಯೋಗ ಇತ್ಯಾದಿಗಳಿಗೆ ವರ್ಜ್ಯವಿದೆ.',
  en: 'The ghata chakra is to be avoided for gambling, travel, royal audience, pilgrimage, journeys, trade, a new job and the like.',
});

/* ============================================================ evaluation */

const key = (x) => x.index ?? x.slot;
/** Spans of an anga across [from, to]: { value, name, startJd, endJd } clipped to the day. */
function spans(fn, from, to) {
  const out = [];
  let cur = fn(from), start = from;
  for (let k = 0; k < 40; k++) {
    const end = Math.min(cur.endJd, to);
    if (end > start) out.push({ value: cur, startJd: start, endJd: end });
    if (cur.endJd >= to) break;
    start = cur.endJd;
    cur = nextAnga(fn, cur);
  }
  return out;
}

/** The anga after `cur`: probe just past its end, further if the solver's end lands a hair early. */
export function nextAnga(fn, cur) {
  for (const eps of [1e-6, 1e-5, 1e-4, 1e-3]) {
    const n = fn(cur.endJd + eps);
    if (key(n) !== key(cur) && n.endJd > cur.endJd) return n;
  }
  throw new Error(`anga did not advance past ${cur.name} at JD ${cur.endJd}`);
}

/**
 * The vara yogas holding during one panchanga day (sunrise to sunrise), in the
 * active ganita, each with the stretch of the day it covers.
 */
export function varaYogas(day, ayanamsaName) {
  const v = day.vara.index;
  const from = day.sun.riseJd, to = Number.isFinite(day.sun.nextRiseJd) ? day.sun.nextRiseJd : from + 1;
  const ts = spans((j) => tithiAt(j), from, to);
  const ns = spans((j) => nakshatraAt(j, ayanamsaName), from, to);
  const out = [];
  const push = (y, nature, s, e, what) => out.push({
    name: y.name, nature, kind: y.kind, startJd: s, endJd: e, detail: `${VARA_NAMES[v]} with ${what}`,
    basis: `Sri Uttaradi Math panchanga, "${nature === 'shubha' ? 'ವಾರ-ತಿಥಿ ಹಾಗೂ ವಾರ-ನಕ್ಷತ್ರ ಇವುಗಳ ಯುತಿಯಿಂದ ಆಗುವ ಶುಭಯೋಗಗಳು' : 'ವಾರ-ತಿಥಿ ಹಾಗೂ ವಾರ-ನಕ್ಷತ್ರ ಇವುಗಳ ಯುತಿಯಿಂದ ಆಗುವ ಅಶುಭಯೋಗಗಳು'}" (Kannada edition page 14; Sanskrit 2024-25 page 64).`,
  });
  for (const [list, nature] of [[SHUBHA_VARA_YOGAS, 'shubha'], [ASHUBHA_VARA_YOGAS, 'ashubha']]) {
    for (const y of list) {
      const cell = y.cells[v];
      if (!cell.length) continue;
      if (y.kind === 'tithi') {
        for (const s of ts) if (cell.includes(s.value.numberInPaksha)) push(y, nature, s.startJd, s.endJd, `${s.value.paksha === 'shukla' ? 'Shukla' : 'Krishna'} ${s.value.name}`);
      } else if (y.kind === 'nakshatra') {
        for (const s of ns) if (cell.includes(s.value.index)) push(y, nature, s.startJd, s.endJd, s.value.name);
      } else {
        for (const [tn, nk] of cell) {
          for (const a of ts) {
            if (a.value.numberInPaksha !== tn) continue;
            for (const b of ns) {
              if (b.value.index !== nk) continue;
              const s = Math.max(a.startJd, b.startJd), e = Math.min(a.endJd, b.endJd);
              if (e > s) push(y, nature, s, e, `${a.value.name} and ${b.value.name}`);
            }
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.startJd - b.startJd);
}

/** Anandadi yogas (for travel) across the day, with Abhijit as the 28th nakshatra. */
export function anandadiForDay(day, ayanamsaName) {
  const v = day.vara.index;
  const from = day.sun.riseJd, to = Number.isFinite(day.sun.nextRiseJd) ? day.sun.nextRiseJd : from + 1;
  const pos = (j) => nakshatra28(panchangaMoon(j, ayanamsaName));
  const out = [];
  let start = from, cur = pos(from);
  const step = 20 / 1440;
  for (let j = from + step; ; j += step) {
    const x = Math.min(j, to);
    const p = pos(x);
    if (p !== cur) {
      let lo = x - step, hi = x;
      for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (pos(m) === cur) lo = m; else hi = m; }
      out.push({ ...anandadiYoga(v, cur), position: cur, startJd: start, endJd: hi });
      start = hi; cur = p; j = hi;
      continue;
    }
    if (x >= to) break;
  }
  out.push({ ...anandadiYoga(v, cur), position: cur, startJd: start, endJd: to });
  return out;
}

/**
 * Ghata chakra findings for a person on a day. `gender` 'male' | 'female'
 * picks the ghata Moon; anything else reports both.
 */
export function ghataForDay(day, janmaRashi, gender, ayanamsaName) {
  const g = GHATA_CHAKRA[janmaRashi - 1];
  const from = day.sun.riseJd, to = Number.isFinite(day.sun.nextRiseJd) ? day.sun.nextRiseJd : from + 1;
  const hits = [];
  const basis = `Sri Uttaradi Math panchanga, "ಘಾತಚಕ್ರ" (Kannada edition page 14; Sanskrit 2024-25 page 64), janma rashi ${RASHI_NAMES[janmaRashi - 1]}: "${GHATA_RULE.kn}" (${GHATA_RULE.en})`;
  if (day.masa.name === g.masa) hits.push({ what: 'masa', detail: `${g.masa} is the ghata masa`, startJd: from, endJd: to, basis });
  if (day.vara.index === g.vara) hits.push({ what: 'vara', detail: `${VARA_NAMES[g.vara]} is the ghata vara`, startJd: from, endJd: to, basis });
  for (const s of spans((j) => tithiAt(j), from, to)) if (g.tithis.includes(s.value.numberInPaksha)) hits.push({ what: 'tithi', detail: `${s.value.name} is a ghata tithi (${g.tithis.join(', ')})`, startJd: s.startJd, endJd: s.endJd, basis });
  for (const s of spans((j) => nakshatraAt(j, ayanamsaName), from, to)) if (s.value.index === g.nakshatra) hits.push({ what: 'nakshatra', detail: `${NAKSHATRA_NAMES[g.nakshatra - 1]} is the ghata nakshatra`, startJd: s.startJd, endJd: s.endJd, basis });
  for (const s of spans((j) => yogaAt(j, ayanamsaName), from, to)) if (s.value.name === g.yoga) hits.push({ what: 'yoga', detail: `${g.yoga} is the ghata yoga`, startJd: s.startJd, endJd: s.endJd, basis });
  for (const s of spans((j) => karanaAt(j), from, to)) if (s.value.name === g.karana) hits.push({ what: 'karana', detail: `${g.karana} is the ghata karana`, startJd: s.startJd, endJd: s.endJd, basis });
  // Prahara: the table does not say day or night, and the Math defines both
  // (KN page 8), so the matching quarter of the day AND of the night is kept.
  const set = day.sun.setJd;
  if (Number.isFinite(set)) {
    const d = (set - from) / 4, n = (to - set) / 4, p = g.prahara - 1;
    hits.push({ what: 'prahara', detail: `the ${ordinal(g.prahara)} prahara of the day is the ghata prahara`, startJd: from + p * d, endJd: from + (p + 1) * d, basis });
    hits.push({ what: 'prahara', detail: `the ${ordinal(g.prahara)} prahara of the night is the ghata prahara (the table does not say day or night; both are kept)`, startJd: set + p * n, endJd: set + (p + 1) * n, basis });
  }
  // Ghata Moon: the Moon's rashi counted from the janma rashi.
  const counts = gender === 'female' ? [g.chandraFemale] : gender === 'male' ? [g.chandraMale] : [g.chandraMale, g.chandraFemale];
  const moonRashi = (j) => Math.floor(panchangaMoon(j, ayanamsaName) / 30) + 1;
  const countAt = (j) => ((moonRashi(j) - janmaRashi + 12) % 12) + 1;
  let start = from, cur = countAt(from);
  const flush = (end) => { if (counts.includes(cur)) hits.push({ what: 'chandra', detail: `the Moon in the ${ordinal(cur)} from the janma rashi is the ghata Moon${counts.length > 1 ? ` (${cur === g.chandraMale ? 'for a man' : 'for a woman'})` : ''}`, startJd: start, endJd: end, basis }); };
  for (let j = from + 1 / 24; ; j += 1 / 24) {
    const x = Math.min(j, to), c = countAt(x);
    if (c !== cur) {
      let lo = x - 1 / 24, hi = x;
      for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (countAt(m) === cur) lo = m; else hi = m; }
      flush(hi); start = hi; cur = c;
    }
    if (x >= to) break;
  }
  flush(to);
  return { row: g, hits };
}

function ordinal(n) { return `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`; }
