/**
 * Mahadvadashi detection.
 *
 * Under certain conditions one fasts not on the Ekadashi but on the following
 * Dwadashi, EVEN WHEN the Ekadashi is suddha (pure). There are eight named
 * Mahadvadashis. Missing them is a silent source of wrong fast dates, because
 * the Ekadashi looks perfectly clean by the arunodaya test.
 *
 * Five have crisp, mechanically checkable definitions and are implemented.
 * Three (Jaya, Vijaya, Jayanti) are nakshatra-conditioned and the classical
 * lists disagree on which nakshatra attaches to which name, so they are NOT
 * implemented rather than guessed - `unimplemented` names them explicitly so
 * the gap is visible in the API rather than hidden.
 *
 * DOES A MAHADVADASHI MOVE THE FAST? Only sometimes, and this distinction was
 * established by MEASUREMENT, not assumption.
 *
 * A first implementation shifted the fast for every detected Mahadvadashi,
 * on the strength of the general statement that "one fasts not on the
 * Ekadashi but on the Dwadashi". Validated against a published 2026 calendar
 * carrying both Smarta and Vaishnava columns, that REGRESSED the Vaishnava
 * match from 24/24 to 22/24: Shattila (Vyanjuli condition genuinely present -
 * Dwadashi at sunrise on 14 and 15 January) and Yogini (Papanashini condition
 * genuinely present - Dwadashi on 11 July in Rohini) both kept their fast on
 * the Ekadashi in the published calendar.
 *
 * The detections were correct; the CONSEQUENCE was wrong. The coherent
 * reading is that the fast moves only when the Ekadashi is genuinely
 * unavailable - i.e. Unmilani, where the tithi is lost between two sunrises
 * and there is no Ekadashi sunrise to fast on. The rest are Dwadashis of
 * special merit, worth naming and displaying, but they do not displace the
 * Ekadashi fast. `shiftsFast` records that distinction per entry.
 */
import { lunarPhase, panchangaMoon } from './ephemeris.js';

const tithiAt = (jd) => Math.floor(lunarPhase(jd) / 12) + 1;

/** Nakshatra index 1..27 of the Moon at an instant. */
function nakshatraAt(jd, ayanamsaName) {
  const lon = panchangaMoon(jd, ayanamsaName);
  return Math.floor((lon % 360) / (360 / 27)) + 1;
}

export const MAHADVADASHI_UNIMPLEMENTED = Object.freeze(['Jaya', 'Vijaya', 'Jayanti']);

/**
 * Detect any Mahadvadashi condition around a given Ekadashi.
 *
 * @param {number} ekadashiSunriseJd sunrise of the day holding the Ekadashi
 *        (or, for a kshaya Ekadashi, the day it begins)
 * @param {(jd:number)=>number|null} sunriseFn
 */
export function detectMahadvadashi(ekadashiSunriseJd, sunriseFn, ayanamsaName) {
  const d0 = ekadashiSunriseJd;
  const d1 = sunriseFn(d0 + 0.5);
  const d2 = d1 === null ? null : sunriseFn(d1 + 0.5);
  const d3 = d2 === null ? null : sunriseFn(d2 + 0.5);
  if (d1 === null || d2 === null) return { found: [], unimplemented: MAHADVADASHI_UNIMPLEMENTED };

  const i0 = tithiAt(d0), i1 = tithiAt(d1), i2 = tithiAt(d2);
  const i3 = d3 === null ? null : tithiAt(d3);
  const found = [];

  const isEkadashi = (i) => i === 11 || i === 26;
  const isDwadashi = (i) => i === 12 || i === 27;
  const isTrayodashi = (i) => i === 13 || i === 28;
  const isFullOrNew = (i) => i === 15 || i === 30;

  // 1. UNMILANI - the Ekadashi begins after sunrise and ends before the next
  //    sunrise, so it touches neither. It is "lost", and the following
  //    Dwadashi is observed instead.
  const advance = ((i1 - i0) + 30) % 30;
  let ekadashiKshaya = false;
  for (let k = 1; k < advance; k++) {
    if (isEkadashi(((i0 + k - 1) % 30) + 1)) { ekadashiKshaya = true; break; }
  }
  if (ekadashiKshaya) {
    found.push({
      name: 'Unmilani',
      fastOn: 'dwadashi',
      // The Ekadashi touches no sunrise, so there is no Ekadashi day to fast
      // on. The shift here is structural, not a matter of merit.
      shiftsFast: true,
      reason: 'The Ekadashi tithi begins after sunrise and ends before the next ' +
        'sunrise, so it touches no sunrise and is lost. The following Dwadashi ' +
        'is observed as Unmilani Mahadvadashi.',
    });
  }

  // 2. VYANJULI - Dwadashi is current at sunrise on two consecutive days.
  //    The FIRST of the two is Vyanjuli.
  if (isDwadashi(i1) && isDwadashi(i2)) {
    found.push({
      name: 'Vyanjuli',
      fastOn: 'dwadashi',
      // Reported, but does NOT displace the Ekadashi fast - see the module
      // header for the validation that established this.
      shiftsFast: false,
      reason: 'Dwadashi falls at sunrise on two consecutive days; the first is ' +
        'observed as Vyanjuli Mahadvadashi.',
    });
  }

  // 3. TRISPARSHA - the Dwadashi begins after sunrise and ends before the next
  //    sunrise (so Trayodashi follows immediately). The Dwadashi is lost and
  //    is observed as Trisparsha.
  const advance1 = i2 === null ? 0 : ((i2 - i1) + 30) % 30;
  let dwadashiKshaya = false;
  for (let k = 1; k < advance1; k++) {
    if (isDwadashi(((i1 + k - 1) % 30) + 1)) { dwadashiKshaya = true; break; }
  }
  if (dwadashiKshaya || (isEkadashi(i1) && isTrayodashi(i2))) {
    found.push({
      name: 'Trisparsha',
      fastOn: 'dwadashi',
      // Reported, but does NOT displace the Ekadashi fast - see the module
      // header for the validation that established this.
      shiftsFast: false,
      reason: 'The Dwadashi tithi is lost between two sunrises, so Dashami, ' +
        'Ekadashi and Dwadashi are all touched; observed as Trisparsha Mahadvadashi.',
    });
  }

  // 4. PAKSHA VARDHINI - the following Amavasya or Purnima is current at
  //    sunrise on two consecutive days, which lengthens the paksha. The
  //    PRECEDING Dwadashi becomes Paksha Vardhini.
  //
  //    That Purnima/Amavasya lies three to five sunrises after the Ekadashi,
  //    so it must be looked for there. The previous test compared the tithis
  //    at d2 and d3 - Trayodashi and Chaturdashi - and so could never fire.
  let pakshaVardhini = false;
  {
    let prev = d3, prevIdx = i3;
    for (let k = 0; k < 4 && prev !== null; k++) {
      const next = sunriseFn(prev + 0.5);
      if (next === null) break;
      const nextIdx = tithiAt(next);
      if (isFullOrNew(prevIdx) && prevIdx === nextIdx) { pakshaVardhini = true; break; }
      if (isFullOrNew(prevIdx)) break; // the paksha's last tithi seen once only
      prev = next; prevIdx = nextIdx;
    }
  }
  if (pakshaVardhini) {
    found.push({
      name: 'Paksha Vardhini',
      fastOn: 'dwadashi',
      // Reported, but does NOT displace the Ekadashi fast - see the module
      // header for the validation that established this.
      shiftsFast: false,
      reason: 'The following Purnima or Amavasya falls at sunrise on two ' +
        'consecutive days, lengthening the paksha; the preceding Dwadashi is ' +
        'observed as Paksha Vardhini Mahadvadashi.',
    });
  }

  // 5. PAPANASHINI - the Dwadashi coincides with Rohini nakshatra (index 4).
  if (isDwadashi(i1) && nakshatraAt(d1, ayanamsaName) === 4) {
    found.push({
      name: 'Papanashini',
      fastOn: 'dwadashi',
      // Reported, but does NOT displace the Ekadashi fast - see the module
      // header for the validation that established this.
      shiftsFast: false,
      reason: 'The Dwadashi coincides with Rohini nakshatra; observed as ' +
        'Papanashini Mahadvadashi.',
    });
  }

  return { found, unimplemented: MAHADVADASHI_UNIMPLEMENTED };
}
