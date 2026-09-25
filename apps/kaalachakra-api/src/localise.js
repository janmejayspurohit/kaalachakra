/**
 * Attach localised names to a computed panchanga.
 *
 * The engine deliberately knows nothing about language - it returns indices
 * and canonical transliterations. Localisation is applied here, at the API
 * boundary, so the same engine serves the web UI, a Kannada print layout and
 * an LLM narration without any of them touching the calculation.
 *
 * The tables come from Ahoratra's AHLocalize, extracted verbatim. They carry
 * five registers: english, vedicenglish (Sanskrit terms in Latin script,
 * deliberately distinct from plain English), hindi, telugu, kannada.
 */
import { row, LANGUAGES, TABLES } from '@kaalachakra/shared';

export { LANGUAGES, TABLES };

/**
 * `names(table, index)` -> { english, vedicenglish, hindi, telugu, kannada }
 * or null when the index is out of range.
 *
 * Indices are 1-BASED throughout, matching the panchanga convention (tithi 1
 * is Prathama, nakshatra 1 is Ashwini). Mixing 0- and 1-based indexing across
 * this boundary is the obvious failure mode, so both sides are 1-based.
 */
export function names(table, index) {
  return row(table, index);
}

/**
 * Enrich a `computeDay()` result in place-ish (returns a new object).
 *
 * TITHI INDEXING NOTE: the engine's tithi index runs 1..30 across both
 * pakshas, but the locale table has 30 entries too (15 shukla + 15 krishna in
 * source order), so the index maps directly. Paksha is looked up separately.
 */
export function localiseDay(day) {
  const out = { ...day };

  out.vara = { ...day.vara, names: names('vara', day.vara.index + 1) };

  out.tithi = {
    ...day.tithi,
    names: names('tithi', day.tithi.index),
    pakshaNames: names('paksha', day.tithi.paksha === 'shukla' ? 1 : 2),
  };

  out.nakshatra = { ...day.nakshatra, names: names('nakshatra', day.nakshatra.index) };
  out.yoga = { ...day.yoga, names: names('yoga', day.yoga.index) };

  // Karana: the engine reports a 1..60 slot; the locale table holds the 11
  // NAMES. Map by name rather than by slot, since the slot is not an index
  // into that table.
  out.karana = { ...day.karana, names: karanaNames(day.karana.name) };

  out.sun = { ...day.sun, rashiNames: names('rashi', day.sun.rashi.index) };
  out.moon = { ...day.moon, rashiNames: names('rashi', day.moon.rashi.index) };

  if (day.masa) {
    out.masa = { ...day.masa, names: names('masa', day.masa.index) };
  }
  return out;
}

const KARANA_ORDER = [
  'Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti',
  'Shakuni', 'Chatushpada', 'Naga', 'Kimstughna',
];

function karanaNames(name) {
  const i = KARANA_ORDER.indexOf(name);
  return i === -1 ? null : names('karana', i + 1);
}
