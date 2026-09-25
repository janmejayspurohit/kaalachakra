import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

/**
 * Place search against the local gazetteer.
 *
 * Debounced, because every keystroke would otherwise hit the API. The chosen
 * place carries latitude, longitude, ELEVATION and the IANA timezone - all
 * four matter, and the timezone is what lets the birth offset be resolved
 * historically rather than with today's rules.
 */
export default function PlacePicker({ value, onPick, label = 'Birth place' }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await api.searchPlaces(q.trim(), { limit: 8 });
        setHits(r.results); setOpen(true);
      } catch { /* search failures are not worth interrupting typing over */ }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div>
      <label className="f">{label}</label>
      {value && (
        <div className="muted" style={{ marginBottom: 6 }}>
          Selected: <strong>{value.name ?? value.label}</strong> ·{' '}
          {value.latitude?.toFixed(4)}, {value.longitude?.toFixed(4)} ·{' '}
          {value.altitude} m · {value.timezone}
        </div>
      )}
      <input
        placeholder="Search a town or city (India by default)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
      />
      {open && hits.length > 0 && (
        <div className="card" style={{ marginTop: 6, padding: 6, maxHeight: 240, overflow: 'auto' }}>
          {hits.map((h) => (
            <button key={h.id} className="btn ghost"
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              onClick={() => { onPick(h); setOpen(false); setQ(''); }}>
              {h.label}
              <span className="muted" style={{ fontSize: 12, display: 'block' }}>
                {h.latitude.toFixed(3)}, {h.longitude.toFixed(3)} · {h.elevation} m ({h.elevationSource}) · {h.timezone}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
