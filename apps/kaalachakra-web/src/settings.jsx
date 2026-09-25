import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
// Re-exported so every existing `from './settings.jsx'` import keeps working;
// the logic lives in a plain module so it can be tested without a browser.
import { DATE_FORMATS, formatDate } from './dateformat.js';
import { TRADITIONS, DEFAULT_TRADITION } from './dasha-terms.js';

export { DATE_FORMATS, formatDate };
export { TRADITIONS };

/**
 * Global app settings.
 *
 * Stored in sessionStorage, as specified: settings last for the browser
 * session and reset on a new one. Every read and write is wrapped, because
 * sessionStorage throws in private mode and on blocked site data - a settings
 * store that can crash the app is worse than one that forgets.
 */
const KEY = 'kaalachakra.settings';

/** Theme ids and their human labels. The CSS lives in styles.css. */
export const THEMES = [
  { id: 'light', label: 'Light — sandalwood', group: 'light' },
  { id: 'light-cool', label: 'Light — paper & indigo', group: 'light' },
  { id: 'light-haridra', label: 'Light — haridra & kumkuma', group: 'light' },
  { id: 'light-kamala', label: 'Light — kamala (lotus)', group: 'light' },
  { id: 'light-vibhuti', label: 'Light — vibhuti (ash & saffron)', group: 'light' },
  { id: 'dark', label: 'Dark — kumkuma', group: 'dark' },
  { id: 'dark-forest', label: 'Dark — tulasi green', group: 'dark' },
  { id: 'dark-mayura', label: 'Dark — mayura (peacock)', group: 'dark' },
  { id: 'dark-kesari', label: 'Dark — kesari (saffron)', group: 'dark' },
  { id: 'midnight-gold', label: 'Midnight blue & gold', group: 'dark' },
];

/**
 * Date display formats.
 *
 * `dd-mm-yyyy` is the default: it is what a Kannada panchanga prints and what
 * the user asked for. ISO is kept because it sorts and is unambiguous when
 * copying a date out of the app.
 *
 * The EXAMPLE on each row is not stored - it is rendered by `formatDate`
 * itself from one reference date, below. A hand-written sample string is a
 * second implementation of the format that nothing keeps in step, and it goes
 * stale the moment a pattern is edited; deriving it means the menu cannot
 * advertise a shape the formatter does not produce.
 */
export const LANGUAGES = [
  { id: 'english', label: 'English' },
  { id: 'vedicenglish', label: 'English (Sanskrit terms)' },
  { id: 'hindi', label: 'हिन्दी' },
  { id: 'telugu', label: 'తెలుగు' },
  { id: 'kannada', label: 'ಕನ್ನಡ' },
];

/**
 * The default place is the GAZETTEER'S OWN Bengaluru record, copied exactly -
 * id, coordinate and surveyed elevation - not a hand-rounded approximation.
 *
 * It used to read 12.9716, 77.5946, which is Bengaluru to four decimals but
 * matches no row in the gazetteer: the real record is 12.97194, 77.59369.
 * Being 0.0009 degrees off was enough for the location dropdown to fail to
 * recognise its own default and announce "Bengaluru - not in the top list",
 * and it put every default-location sunrise ~0.3 seconds out. A default that
 * is a paraphrase of a real record rather than the record is a small lie that
 * something downstream eventually trips over.
 */
export const DEFAULT_PLACE = {
  placeId: 1277333,
  latitude: 12.97194, longitude: 77.59369, altitude: 920,
  timezone: 'Asia/Kolkata', name: 'Bengaluru',
};

export const DEFAULTS = {
  theme: 'dark',
  dateFormat: 'dd-mm-yyyy',
  language: 'kannada',
  /**
   * Which tradition's vocabulary and chart style to use.
   *
   * South by default: this is a Madhwa / South-Indian Kannada panchanga, and
   * its readers expect "dasha, bhukti, antara" and a South Indian chakra.
   * The setting changes LABELS and chart layout only - every period boundary
   * and every computed position is identical either way.
   */
  tradition: DEFAULT_TRADITION,
  place: DEFAULT_PLACE,
  defaultProfileId: null,
  ayanamsa: 'trueCitra',
  /**
   * Which ganita computes the panchanga. Surya Siddhanta by default: it is
   * Sri Uttaradi Math's own reckoning, and reproduces 398 of the 400
   * Ekadashi fast days in the Math's published editions. Drik (the modern
   * ephemeris) is the option. Stateless - sent with every calculation call.
   */
  ganita: 'surya',
};

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw);
    // Merge over defaults so a settings blob written by an older build, or
    // one missing a key, cannot leave the app with `undefined` settings.
    //
    // `placeId` is the exception and is NEVER inherited from the default. A
    // blob written before ids existed holds, say, Delhi's coordinates; taking
    // the default's id would assert that Delhi IS Bengaluru's gazetteer row.
    // Absent means unknown, and unknown falls back to the coordinate match.
    const place = { ...DEFAULTS.place, ...(p.place ?? {}) };
    if (p.place && !('placeId' in p.place)) place.placeId = null;
    return { ...DEFAULTS, ...p, place };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(s) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

const Ctx = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  // The theme is applied by setting data-theme on <html>, which swaps the CSS
  // custom properties. Doing it here rather than in a component keeps it in
  // one place and applies before first paint of any consumer.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => { save(settings); }, [settings]);

  const value = useMemo(() => ({
    settings,
    set: (patch) => setSettings((s) => ({ ...s, ...patch })),
    reset: () => setSettings({ ...DEFAULTS }),
  }), [settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used inside <SettingsProvider>');
  return v;
}

/** Convenience hook: a formatter already bound to the chosen format. */
export function useDateFormat() {
  const { settings } = useSettings();
  return useMemo(
    () => (v) => formatDate(v, settings.dateFormat),
    [settings.dateFormat]
  );
}

/** Pick the localised name out of an API `names` object, with fallbacks. */
export function localName(names, language, fallback = null) {
  if (!names) return fallback;
  return names[language] ?? names.english ?? fallback;
}
