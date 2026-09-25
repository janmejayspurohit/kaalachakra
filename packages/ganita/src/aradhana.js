/**
 * Aradhana (punyatithi) calendar for the Madhwa yatigalu.
 *
 * HOW THIS DATASET WAS BUILT, because it matters for how much to trust it.
 *
 * The (masa, paksha, tithi) triples are not published directly in any source
 * I could reach. What IS published is a list of punyatithi GREGORIAN dates for
 * 2025-26. Each triple here was therefore DERIVED by running this engine on
 * the published Gregorian date at Mantralayam.
 *
 * The derivation method was then validated against the three triples that can
 * be sourced independently:
 *   Raghavendra Tirtha  = Shravana Krishna Dwitiya   PASS
 *   Madhwacharya        = Magha Shukla Navami        PASS  (Madhwa Navami)
 *   Kavindra Tirtha     = Chaitra Shukla Navami      PASS
 * 3/3. That validates the method, which is what transfers confidence to the
 * remaining 34 rows - it is not the same as having sourced all 37 directly,
 * and every row carries `confidence` saying so.
 *
 * Once a triple is known it projects to any year, which is the whole point:
 * a fixed Gregorian date would drift against the lunar calendar immediately.
 */
import { createRequire } from 'node:module';
import { masa, sunrisesBetween, MASA_NAMES } from './masa.js';

const MASA_ORDER = MASA_NAMES;
import { lunarPhase } from './ephemeris.js';

const require = createRequire(import.meta.url);
/** @type {Array<{name:string,sourceDate:string,masa:string,paksha:string,tithi:number,tithiName:string,confidence:string}>} */
export const ARADHANA_TABLE = require('./aradhana.json');

/**
 * Project every aradhana onto a Gregorian year.
 *
 * Returns entries sorted by date. An entry can legitimately resolve to TWO
 * dates in an adhika-masa year; both are returned, with `adhikaMasa` set, so
 * the caller can show the ambiguity rather than silently pick one. Observance
 * normally follows the NIJA (true) month, which is flagged rather than
 * filtered here so the UI can say why.
 */
/**
 * VRIDDHI (repeated tithi) resolution.
 *
 * A tithi can be current at sunrise on two consecutive days, and a punyatithi
 * must fall on exactly one of them. Emitting both is not a cosmetic problem -
 * it makes the whole list untrustworthy.
 *
 * WHICH RULE? Measured, not assumed. Three candidates were round-tripped
 * against the 37 published punyatithi dates the table was derived from:
 *   'second'   (take the later day)          -> 37/37
 *   'aparahna' (tithi prevailing at aparahna)-> 36/37
 *   'first'    (take the earlier day)        -> 36/37
 * 'second' is therefore the default. The aparahna rule is the one usually
 * quoted for shraddha and remains selectable via `vriddhiRule`, but it picked
 * 8 January for Satyakama Tirtha where the published calendar says the 9th.
 * Going with the rule the data supports rather than the rule that sounds most
 * classical.
 *
 * Aparahna is the fourth of the five equal parts of the daytime, i.e.
 * sunrise + 0.6 to sunrise + 0.8 of the daylight span.
 */
/**
 * The instant a tithi index begins, bracketed by two sunrises. Bisection on
 * the elongation reaching (index-1)*12 degrees. Used for kshaya resolution,
 * where the tithi never touches a sunrise and has no other anchor.
 */
function tithiStartInstant(loJd, hiJd, tithiIndex) {
  const target = (tithiIndex - 1) * 12;
  const before = (j) => ((lunarPhase(j) - target + 360) % 360) > 180;
  let lo = loJd, hi = hiJd;
  if (!before(lo)) return lo;
  for (let k = 0; k < 60 && hi - lo > 1e-8; k++) {
    const mid = (lo + hi) / 2;
    if (before(mid)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function prevailsAtAparahna(sunriseJd, sunsetFn, targetIndex) {
  const sunsetJd = sunsetFn(sunriseJd);
  if (sunsetJd === null || !(sunsetJd > sunriseJd)) return false;
  const span = sunsetJd - sunriseJd;
  const aparahnaMid = sunriseJd + span * 0.7; // centre of the 4th fifth
  return Math.floor(lunarPhase(aparahnaMid) / 12) + 1 === targetIndex;
}

export function aradhanaForYear({ year, sunriseFn, sunsetFn, ayanamsaName, localToJd, tzOffsetHours = 5.5, vriddhiRule = 'second' }) {
  // SINGLE PASS over the year.
  //
  // The obvious implementation calls findTithiDates once per saint, and each
  // of those walks every sunrise in the year: 37 saints x ~365 days is about
  // 13,500 sunrise+masa computations for a table of 37 rows. Measured at
  // 658 ms.
  //
  // Instead, walk the year ONCE, compute (masa, paksha, tithi) for each day,
  // and look the day up in an index built from the table. That is ~365
  // computations regardless of how many saints the table holds, so adding
  // saints is now free.
  const fromJd = localToJd({ year, month: 1, day: 1, hour: 0 }, tzOffsetHours);
  // Cover 31 December: the window is expressed in midnights but consumed in
  // sunrises, and 31 December's sunrise is hours past its midnight.
  const toJd = localToJd({ year, month: 12, day: 31, hour: 0 }, tzOffsetHours) + 1;

  // key = `${masa}|${paksha}|${tithi}` -> rows
  const index = new Map();
  for (const row of ARADHANA_TABLE) {
    const key = `${row.masa}|${row.paksha}|${row.tithi}`;
    index.set(key, [...(index.get(key) ?? []), row]);
  }

  // Walk sunrises once, recording every day that matches something.
  const hits = [];
  let prevSr = null;
  let prevIdx = null;

  const consider = (sr, idx, probeJd) => {
    const paksha = idx <= 15 ? 'shukla' : 'krishna';
    const tithi = idx <= 15 ? idx : idx - 15;

    // Only pay for the masa lookup when some saint could match this tithi.
    let any = false;
    for (const m of MASA_ORDER) {
      if (index.has(`${m}|${paksha}|${tithi}`)) { any = true; break; }
    }
    if (!any) return;

    const ms = masa(probeJd, ayanamsaName);
    const rows = index.get(`${ms.name}|${paksha}|${tithi}`);
    if (!rows) return;
    for (const row of rows) hits.push({ row, jd: sr, masa: ms, tithiIndex: idx });
  };

  for (const sr of sunrisesBetween(fromJd, toJd, sunriseFn)) {
    const idx = Math.floor(lunarPhase(sr) / 12) + 1;

    consider(sr, idx, sr);

    // KSHAYA. A tithi can begin after one sunrise and end before the next, so
    // it touches neither and a sunrise-only scan never sees it. It is
    // observed on the day it BEGINS - which is the previous sunrise's day.
    // Vidyanidhi Tirtha (Kartika Krishna Panchami) and Raghottama Tirtha
    // (Pushya Shukla Dwadashi) are both kshaya in 2026 and vanished entirely
    // when this branch was missing.
    if (prevIdx !== null) {
      const advanced = ((idx - prevIdx) + 30) % 30;
      for (let k = 1; k < advanced; k++) {
        const skipped = ((prevIdx + k - 1) % 30) + 1;
        // Probe the MASA at the instant the tithi begins, not at the previous
        // sunrise: a tithi skipped at the start of a lunar month begins after
        // that sunrise, when the previous month is still running.
        const startJd = tithiStartInstant(prevSr, sr, skipped);
        consider(prevSr, skipped, startJd + 1e-4);
      }
    }
    prevSr = sr;
    prevIdx = idx;
  }

  // Group by saint so vriddhi (same saint on two consecutive days) can be
  // resolved, while a genuine adhika-masa doubling months apart is kept.
  const byName = new Map();
  for (const h of hits) {
    byName.set(h.row.name, [...(byName.get(h.row.name) ?? []), h]);
  }

  const out = [];
  for (const [, group] of byName) {
    group.sort((a, b) => a.jd - b.jd);

    // Split into runs of consecutive days.
    const runs = [];
    for (const h of group) {
      const last = runs[runs.length - 1];
      if (last && h.jd - last[last.length - 1].jd < 1.5) last.push(h);
      else runs.push([h]);
    }

    for (const run of runs) {
      let chosen = run;
      let vriddhiResolved = false;
      if (run.length > 1) {
        vriddhiResolved = true;
        if (vriddhiRule === 'first') chosen = [run[0]];
        else if (vriddhiRule === 'aparahna' && sunsetFn) {
          const target = run[0].tithiIndex;
          const byAparahna = run.filter((h) => prevailsAtAparahna(h.jd, sunsetFn, target));
          chosen = byAparahna.length === 1 ? byAparahna : [run[run.length - 1]];
        } else chosen = [run[run.length - 1]];
      }
      for (const h of chosen) {
        out.push({
          ...h.row,
          jd: h.jd,
          adhikaMasa: h.masa.isAdhika,
          vriddhiResolved,
          ambiguous: chosen.length > 1,
        });
      }
    }
  }

  out.sort((a, b) => (a.jd ?? Infinity) - (b.jd ?? Infinity));
  return out;
}

/** Aradhanas falling on a specific day, for the day view. */
export function aradhanaOn(jdSunrise, yearList) {
  return yearList.filter((a) => a.jd !== null && Math.abs(a.jd - jdSunrise) < 0.5);
}
