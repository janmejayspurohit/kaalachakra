import React, { useState } from 'react';
import LocationPicker from './LocationPicker.jsx';
import { ConfirmDialog } from './Modal.jsx';
import {
  useSettings, THEMES, DATE_FORMATS, LANGUAGES, TRADITIONS, DEFAULTS, formatDate,
} from '../settings.jsx';

/**
 * Swatch colours per theme.
 *
 * Hardcoded rather than read from CSS custom properties, because those only
 * resolve for the theme currently applied to <html> - a live read would show
 * every swatch in the active palette and make the picker useless.
 */
const SWATCH = {
  light: ['#fbf7f0', '#8c2f1d', '#a87c1f'],
  'light-cool': ['#f7f8fb', '#2f3a6b', '#9a7b1c'],
  'light-haridra': ['#fdf9ec', '#a82d1a', '#9a7409'],
  'light-kamala': ['#fdf6f8', '#a3265a', '#a07a1c'],
  'light-vibhuti': ['#f6f6f4', '#b05610', '#8f7420'],
  dark: ['#14110d', '#e0755c', '#d6a743'],
  'dark-forest': ['#0d1310', '#7fd6a2', '#d6a743'],
  'dark-mayura': ['#07161a', '#2fc2b4', '#e0b44a'],
  'dark-kesari': ['#121110', '#f0913a', '#e8c05e'],
  'midnight-gold': ['#040711', '#e8b448', '#8fa5e8'],
};

/**
 * A theme with no swatch must not take the page down.
 *
 * `SWATCH[t.id].map(...)` throws on a missing entry, and the whole Settings
 * tree unmounts - a blank page because somebody added a theme and forgot a
 * three-colour array. A test asserts the two lists match, so this fallback
 * should never render; it exists so that the failure, if it ever happens, is
 * three grey dots rather than nothing at all.
 */
const NO_SWATCH = ['#888', '#888', '#888'];

export default function Settings({ profiles = [] }) {
  const { settings, set, reset } = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <div className="card">
        <h2>Appearance</h2>
        <label className="f">Theme</label>
        <div className="swatches">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className="swatch"
              aria-pressed={settings.theme === t.id}
              onClick={() => set({ theme: t.id })}
            >
              <span className="dots">
                {(SWATCH[t.id] ?? NO_SWATCH).map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
              <span className="name">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Format</h2>
        <div className="row c2">
          <div>
            <label className="f">Date format</label>
            <select
              value={settings.dateFormat}
              onChange={(e) => set({ dateFormat: e.target.value })}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label} — {f.example}</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Today renders as <span className="mono">{formatDate(new Date(), settings.dateFormat)}</span>
            </div>
          </div>
          <div>
            <label className="f">Tradition</label>
            <select
              value={settings.tradition}
              onChange={(e) => set({ tradition: e.target.value })}
            >
              {TRADITIONS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {settings.tradition === 'south'
                ? 'Dasha › bhukti › antara, and the South Indian chakra, where the rashis sit in fixed cells.'
                : 'Mahadasha › antardasha › pratyantardasha, and the North Indian chart, where the houses are fixed and the rashis move.'}
              {' '}Labels and chart layout only — every period boundary and
              computed position is identical either way.
            </div>
          </div>
          <div>
            <label className="f">Language</label>
            <select
              value={settings.language}
              onChange={(e) => set({ language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Applies to panchanga terms that carry a translation. Saint names
              and place names are not translated.
            </div>
          </div>
          <div>
            {/*
              * Ayanamsa sits with the other display choices rather than in a
              * section of its own. It had a "Calculation" card to itself,
              * which overstated it: it is one select, and a reader looking
              * for it reasonably expects it beside the language and the date
              * format - all four are "how should this be expressed".
              */}
            <label className="f">Ganita</label>
            <select value={settings.ganita ?? 'surya'} onChange={(e) => set({ ganita: e.target.value })}>
              <option value="surya">Surya Siddhanta — Uttaradi Math (default)</option>
              <option value="drik">Drik — modern ephemeris</option>
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 12 }}>
              Surya Siddhanta is the ganita of Sri Uttaradi Math&apos;s own panchanga, and
              reproduces 398 of the 400 Ekadashi fast days in its published editions.
              Drik follows the modern sky. The choice moves tithi and nakshatra
              end-times, and so can move an Ekadashi or an aradhana by a day.
              Profiles follow it too: the janma nakshatra and rashi, the
              Vimshottari dasha (reckoned in saura years), tarabala and the
              matching kutas. Only the kundali&apos;s graha positions stay drik.
            </div>
            <label className="f">Ayanamsa</label>
            <select value={settings.ayanamsa} onChange={(e) => set({ ayanamsa: e.target.value })}>
              <option value="trueCitra">True Chitra (default)</option>
              <option value="lahiri">Lahiri</option>
              <option value="raman">Raman</option>
              <option value="krishnamurti">Krishnamurti (KP)</option>
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Used for birth charts, and for the panchanga under drik ganita.
              Surya Siddhanta counts from its own fixed zero point and needs no
              separate ayanamsa. Lahiri and True Chitra differ by about one
              arcminute, which moves a nakshatra boundary by roughly two
              minutes. Tithi and karana are unaffected — they derive from the
              Moon−Sun difference, where the ayanamsa cancels.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Location</h2>
        <LocationPicker
          label="Panchanga is computed for"
          value={settings.place}
          onPick={(place) => set({ place })}
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Sunrise, and therefore every tithi end-time and kaala window, depends
          on this. Elevation and the IANA timezone come from the local
          gazetteer, so no network lookup is involved.

          {/* The GeoNames attribution this line briefly carried now lives in
              the footer and on the licences page, which is where it belongs -
              it is a product-wide obligation, not a note about this control. */}
        </div>
      </div>

      <div className="card">
        <h2>Default profile</h2>
        {profiles.length === 0 ? (
          <div className="muted">
            No profiles yet. Add one under Profiles to set a default.
          </div>
        ) : (
          <>
            <select
              value={settings.defaultProfileId ?? ''}
              onChange={(e) => set({ defaultProfileId: e.target.value || null })}
            >
              <option value="">No default — use the first profile</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.janma?.nakshatra?.name ?? ''}
                </option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Pre-selected in the Panchanga day summary.
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Reset</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Returns every setting on this page to its default: the{' '}
          <strong>{THEMES.find((t) => t.id === DEFAULTS.theme)?.label}</strong> theme,
          {' '}<strong>{DEFAULTS.dateFormat}</strong> dates,
          {' '}<strong>{TRADITIONS.find((t) => t.id === DEFAULTS.tradition)?.label}</strong> tradition,
          {' '}<strong>{LANGUAGES.find((l) => l.id === DEFAULTS.language)?.label}</strong>,
          {' '}True Chitra ayanamsa, <strong>{DEFAULTS.place.name}</strong> as the
          location, and no default profile.
        </p>
        <div className="actions">
          <button className="btn danger" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Settings are kept in session storage, so they persist while this tab
          is open and reset when the browser session ends.
        </div>
      </div>

      {/* Resetting throws away every choice on the page and cannot be undone
          within the session, so it is confirmed like any other destructive
          action - and through the app's own dialog, not the browser's. */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset all settings?"
        confirmLabel="Reset everything"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { reset(); setConfirmReset(false); }}
      >
        <p style={{ marginTop: 0 }}>
          Theme, date format, tradition, language, ayanamsa, location and
          default profile all return to their defaults.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Your profiles and their charts are not affected.
        </p>
      </ConfirmDialog>
    </>
  );
}
