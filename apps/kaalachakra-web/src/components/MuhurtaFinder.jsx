import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';

const EVENTS = [
  ['general', 'General auspicious work'],
  ['vivaha', 'Vivaha (marriage)'],
  ['upanayana', 'Upanayana'],
  ['vastu', 'Vastu / griha pravesha'],
  ['prayana', 'Travel, trade or a new job (prayana)'],
];
const VEDAS = [
  ['', 'Veda not set (apply Guru and Shukra astha)'],
  ['rig', 'Rigveda'],
  ['yajur', 'Yajurveda'],
  ['sama', 'Samaveda'],
];
const MARK = { pass: '✓', warn: '!', fail: '✗', info: 'i' };
const VERDICT_LABEL = {
  shubha: 'Shubha', 'shubha-with-cautions': 'Shubha, with cautions', ashubha: 'Ashubha', 'no-usable-time': 'No usable time',
};

/** One rule outcome: what was checked, the result, and the basis behind it. */
export function Point({ p }) {
  return (
    <div className={`pt ${p.status}`}>
      <div className="mark" aria-label={p.status}>{MARK[p.status]}</div>
      <div>
        <strong>{p.label}</strong> — {p.detail}
        <details>
          <summary>Basis</summary>
          <div className="basis">{p.basis}</div>
        </details>
      </div>
    </div>
  );
}

function Windows({ windows, showAll }) {
  const list = showAll ? windows : windows.filter((w) => w.verdict === 'shubha');
  if (!list.length) return <div className="muted">No shubha lagna window on this day.</div>;
  return (
    <table>
      <thead><tr><th>Lagna</th><th>Rises</th><th>Usable</th><th>Verdict</th></tr></thead>
      <tbody>
        {list.map((w) => (
          <tr key={w.rashi + w.start}>
            <td>{w.rashiName}</td>
            <td className="mono">{w.start}–{w.end}</td>
            <td className="mono">{w.usable.length ? w.usable.map((u) => `${u.start}–${u.end}`).join(', ') : '—'}</td>
            <td>
              <span className={`verdict ${w.verdict}`}>{VERDICT_LABEL[w.verdict]}</span>
              <details>
                <summary>Why</summary>
                {w.points.map((p) => <Point key={p.id} p={p} />)}
              </details>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Muhurta for the selected date and person: the day's verdict with every rule
 * behind it, the day's lagna windows, and the next shubha days.
 */
export default function MuhurtaFinder({ date, place, profileId, profileName }) {
  const { settings } = useSettings();
  const [event, setEvent] = useState('general');
  const [veda, setVeda] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const placeKey = `${place.latitude},${place.longitude},${place.altitude},${place.timezone}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    api.muhurta({
      date, place, event, profileId: profileId || undefined, veda: veda || undefined,
      ganita: settings.ganita, ayanamsa: settings.ayanamsa,
    })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date.year, date.month, date.day, placeKey, event, veda, profileId, settings.ganita, settings.ayanamsa]);

  const ev = data?.evaluation;
  return (
    <div className="card">
      <h2>Muhurta</h2>
      <div className="grid two" style={{ marginBottom: 12 }}>
        <div>
          <label className="f">Event</label>
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            {EVENTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="f">Family veda (for astha)</label>
          <select value={veda} onChange={(e) => setVeda(e.target.value)}>
            {VEDAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {profileId
          ? <>Judged for <strong>{profileName}</strong>: the day&apos;s rules plus tarabala, chandrabala, gurubala (vivaha and upanayana) and the lagna from the janma rashi and janma lagna.</>
          : 'No profile selected: the general rules only. Select a profile above to include tarabala, chandrabala, gurubala and house shuddhi for the person.'}
      </p>

      {err && <div className="err">{err}</div>}
      {loading && !data && <div className="empty">Computing…</div>}
      {ev && (
        <>
          <h3>
            This day: <span className={`verdict ${ev.verdict}`}>{VERDICT_LABEL[ev.verdict]}</span>
          </h3>
          {ev.points.map((p) => <Point key={p.id} p={p} />)}

          <h3 style={{ marginTop: 16 }}>Lagna windows today</h3>
          <label className="muted" style={{ display: 'block', marginBottom: 6 }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show every lagna, not only the shubha ones
          </label>
          <Windows windows={data.lagnaWindows.windows} showAll={showAll} />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Lagnas reckoned with the {data.lagnaWindows.ayanamsaBasis}.</div>
          {data.lagnaWindows.polarCaveat && <div className="err" style={{ marginTop: 6 }}>{data.lagnaWindows.polarCaveat}</div>}

          <h3 style={{ marginTop: 16 }}>Next shubha days</h3>
          {data.next.found.length === 0
            ? <div className="muted">None in the next {data.next.horizonDays} days.</div>
            : data.next.found.map((f) => (
              <div key={`${f.date.year}-${f.date.month}-${f.date.day}`} className="card inset" style={{ marginTop: 8 }}>
                <strong>{f.date.day}-{f.date.month}-{f.date.year}</strong>{' '}
                <span className={`verdict ${f.evaluation.verdict}`}>{VERDICT_LABEL[f.evaluation.verdict]}</span>
                <details style={{ marginTop: 6 }}>
                  <summary>Why this day</summary>
                  {f.evaluation.points.map((p) => <Point key={p.id} p={p} />)}
                </details>
                <div style={{ marginTop: 8 }}><Windows windows={f.windows} showAll={false} /></div>
              </div>
            ))}

          <div className="notice is-plain" style={{ marginTop: 14 }}>{ev.caveat}</div>
        </>
      )}
    </div>
  );
}
