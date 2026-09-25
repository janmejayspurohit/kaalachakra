import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react';
import { api } from './api.js';
import Panchanga from './components/Panchanga.jsx';
import DaySummary from './components/DaySummary.jsx';
import MuhurtaFinder from './components/MuhurtaFinder.jsx';
import Dashas from './components/Dashas.jsx';
// Calendar pulls a year of Ekadashis, the Chaturmasya windows, the aradhana
// table and a month grid. Loading it lazily keeps it out of the initial
// bundle, so the Panchanga tab - the landing page - is not paying for it.
const Calendar = lazy(() => import('./components/Calendar.jsx'));
import Matching from './components/Matching.jsx';
import Profiles from './components/Profiles.jsx';
import Clock from './components/Clock.jsx';
import DateField from './components/DateField.jsx';
import Settings from './components/Settings.jsx';
import { Terms, Privacy } from './components/Legal.jsx';
import { useSettings, useDateFormat } from './settings.jsx';
import { useAuth } from './auth.jsx';
import Account from './components/Account.jsx';
import Users from './components/Users.jsx';

const TABS = [
  ['panchanga', 'Panchanga'],
  ['dashas', 'Dashas'],
  ['calendar', 'Calendar'],
  ['matching', 'Matrimony'],
  ['profiles', 'Profiles'],
  ['settings', 'Settings'],
  ['account', 'Account'],
];
/** Shown only to admins; a non-admin opening #users sees a refusal. */
const ADMIN_TABS = [['users', 'Users']];

/**
 * Today AT THE SELECTED PLACE, not in the browser's timezone.
 *
 * These genuinely differ: at 23:20 CDT it is already the NEXT day in
 * Asia/Kolkata. Opening a Bengaluru panchanga and being shown yesterday
 * because the viewer happens to be in Chicago is a real bug, not a nicety.
 * Falls back to the browser's date if the place carries no IANA zone.
 */
const todayAt = (place) => {
  const now = new Date();
  if (!place?.timezone) {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: place.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const g = (t) => Number(p.find((x) => x.type === t).value);
    return { year: g('year'), month: g('month'), day: g('day') };
  } catch {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
};

/**
 * Routes that are reachable but deliberately NOT in the tab bar.
 *
 * Terms and privacy belong in a footer, not beside Panchanga - they are read
 * once and then never again. They are still real routes so they can be
 * linked to and survive a reload, which is the whole reason for hash routing
 * here in the first place.
 */
const FOOTER_ROUTES = ['terms', 'privacy'];
const VALID = new Set([...TABS.map(([k]) => k), ...ADMIN_TABS.map(([k]) => k), ...FOOTER_ROUTES]);
const tabFromHash = () => {
  const h = window.location.hash.replace('#', '');
  return VALID.has(h) ? h : 'panchanga';
};

export default function App() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const visibleTabs = isAdmin ? [...TABS, ...ADMIN_TABS] : TABS;
  // Hash routing rather than a router dependency: it keeps tabs deep-linkable
  // and survives a reload, which is all this app needs.
  const [tab, setTabState] = useState(tabFromHash);
  const setTab = (t) => { window.location.hash = t; setTabState(t); };

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const { settings } = useSettings();
  const place = settings.place;
  const fmtDate = useDateFormat();
  const [date, setDate] = useState(() => todayAt(settings.place));
  const [selectedProfileId, setSelectedProfileId] = useState(settings.defaultProfileId);
  const [data, setData] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfiles = useCallback(async () => {
    try { setProfiles((await api.profiles(settings.ganita)).profiles); }
    catch (e) { setErr(e.message); }
  }, [settings.ganita]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    api.panchanga({ date, place, ayanamsa: settings.ayanamsa, ganita: settings.ganita, profileId: selectedProfileId || undefined })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, place, settings.ayanamsa, settings.ganita, selectedProfileId, profiles.length]);

  // Keep the profile selection valid: adopt the configured default when set,
  // otherwise the first profile, and recover if the selected one is deleted.
  useEffect(() => {
    if (!profiles.length) { setSelectedProfileId(null); return; }
    const stillThere = profiles.some((p) => p.id === selectedProfileId);
    if (stillThere) return;
    const preferred = profiles.find((p) => p.id === settings.defaultProfileId);
    setSelectedProfileId((preferred ?? profiles[0]).id);
  }, [profiles, selectedProfileId, settings.defaultProfileId]);

  const shift = (days) => {
    const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
    d.setUTCDate(d.getUTCDate() + days);
    setDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
  };

  const iso = `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;

  return (
    <>
      <header className="top">
        <div className="top-inner">
          {/*
            * The brand is the way home, as it is on any site - so it has to
            * be a real BUTTON, not a styled div with an onClick. A div is
            * not reachable by Tab, does not respond to Enter or Space, and
            * is announced as plain text, so a keyboard or screen-reader user
            * would simply have no route back to the landing tab.
            */}
          <button
            type="button"
            className="brand"
            onClick={() => setTab('panchanga')}
            aria-label="Kaalachakra — go to the panchanga"
            title="Go to the panchanga"
          >
            Kaalachakra
            <small>Madhwa panchanga &amp; jyotisha</small>
          </button>
          <Clock />
          <nav className="tabs">
            {visibleTabs.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                aria-current={tab === k ? 'page' : undefined}>{label}</button>
            ))}
            <button type="button" className="whoami" onClick={logout} title={`Signed in as ${user?.email}`}>Sign out</button>
          </nav>
        </div>
      </header>

      {/*
        * The legal routes get their own wrap modifier. `.wrap` has no top
        * padding at all - every tab supplies its own, via a marginTop on its
        * first card - and these pages had none, so the first card sat flush
        * against the sticky header. They also want the same gap top and
        * bottom, which the global 64px bottom padding does not give.
        */}
      <main className={`wrap${FOOTER_ROUTES.includes(tab) ? ' wrap-legal' : ''}`}>
        {tab === 'panchanga' && (
          <>
            <div className="card" style={{ marginTop: 16 }}>
              <div className="datebar">
                <button className="btn ghost" onClick={() => shift(-1)}>‹ Prev</button>
                <div className="grow">
                  <DateField
                    label="Date"
                    value={iso}
                    onChange={(v) => {
                      const [y, m, d] = v.split('-').map(Number);
                      if (y && m && d) setDate({ year: y, month: m, day: d });
                    }}
                  />
                </div>
                <button className="btn ghost" onClick={() => shift(1)}>Next ›</button>
                <button className="btn ghost" onClick={() => setDate(todayAt(place))}>Today</button>
                {profiles.length > 0 && (
                  <div style={{ minWidth: 190 }}>
                    <label className="f">Profile</label>
                    <select
                      value={selectedProfileId ?? ''}
                      onChange={(e) => setSelectedProfileId(e.target.value || null)}
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {/* Location is display-only here; it is chosen in Settings so
                  one setting drives every tab rather than each tab keeping
                  its own idea of where the user is. */}
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                {place.name ?? 'Location'} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                {' · '}{place.altitude ?? 0} m{place.timezone ? ` · ${place.timezone}` : ''}
                {' · '}<span className="mono">{fmtDate(iso)}</span>
              </div>
            </div>

            {err && <div className="err" style={{ marginTop: 16 }}>{err}</div>}
            {loading && !data && <div className="card" style={{ marginTop: 16 }}><div className="empty">Computing…</div></div>}

            {data && (
              <div style={{ marginTop: 16 }}>
                {/* The summary box appears only when a profile exists - an empty
                    box would read as "nothing notable today" rather than
                    "nobody to compute it for". */}
                {data.hasProfiles && data.summaries.length > 0 && (
                  <DaySummary summaries={data.summaries} />
                )}
                <div style={{ marginTop: data.hasProfiles ? 16 : 0 }}>
                  <Panchanga data={data.panchanga} />
                </div>
                <div style={{ marginTop: 16 }}>
                  <MuhurtaFinder
                    date={date}
                    place={place}
                    profileId={selectedProfileId}
                    profileName={profiles.find((p) => p.id === selectedProfileId)?.name}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'dashas' && <div style={{ marginTop: 16 }}><Dashas profiles={profiles} /></div>}
        {tab === 'calendar' && (
          <div style={{ marginTop: 16 }}>
            <Suspense fallback={<div className="card"><div className="empty">Loading calendar…</div></div>}>
              <Calendar />
            </Suspense>
          </div>
        )}
        {tab === 'settings' && (
          <div style={{ marginTop: 16 }}>
            <Settings profiles={profiles} />
          </div>
        )}
        {tab === 'matching' && <div style={{ marginTop: 16 }}><Matching profiles={profiles} /></div>}
        {tab === 'profiles' && (
          <div style={{ marginTop: 16 }}>
            <Profiles profiles={profiles} onChange={loadProfiles} />
          </div>
        )}

        {tab === 'account' && <Account />}
        {tab === 'users' && (isAdmin ? <Users /> : <div className="err" style={{ marginTop: 16 }}>Admins only.</div>)}
        {tab === 'terms' && <Terms />}
        {tab === 'privacy' && <Privacy />}
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            © {new Date().getFullYear()} Kaalachakra. All rights reserved.
          </div>
          <nav className="footer-links">
            <button type="button" onClick={() => setTab('terms')}>Terms</button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => setTab('privacy')}>Privacy</button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => setTab('terms')}>Licences</button>
          </nav>
        </div>
      </footer>
    </>
  );
}
