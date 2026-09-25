/** Locale data for panchanga localisation across 5 languages. */
import locale from './locale.json' with { type: 'json' };

/** List of supported language keys (e.g. "english", "kannada"). */
export const LANGUAGES = locale.languages;

/** Ordered list of all localisation tables (everything except "languages"). */
export const TABLES = Object.keys(locale).filter((k) => k !== 'languages');

/**
 * Return the localised string at a 1-based index in the given table for `lang`.
 * Returns null if the table is unknown or the index is out of range. Never throws.
 */
export function t(table, index, lang = 'kannada') {
  const entries = locale[table];
  if (!Array.isArray(entries)) return null;
  const entry = entries[index - 1]; // convert 1-based to 0-based
  if (!entry || typeof entry !== 'object') return null;
  return entry[lang] ?? null;
}

/**
 * Return the full row object (all 5 languages) at a 1-based index in `table`.
 * Returns null if the table is unknown or the index is out of range. Never throws.
 */
export function row(table, index) {
  const entries = locale[table];
  if (!Array.isArray(entries)) return null;
  const entry = entries[index - 1]; // convert 1-based to 0-based
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

/** The complete locale object, including the "languages" key and all tables. */
export default locale;
