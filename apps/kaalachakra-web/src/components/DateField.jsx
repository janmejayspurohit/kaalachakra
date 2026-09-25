import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, formatDate } from '../settings.jsx';

/**
 * Date field with a calendar popup.
 *
 * WHY NOT `<input type="date">`: the native control renders in the BROWSER's
 * locale, not the app's. With the app set to dd-mm-yyyy a US browser still
 * showed `09/23/2026`, which contradicts the setting the user just chose. It
 * is also styled by the OS, so it ignores the theme entirely.
 *
 * Value is always an ISO `YYYY-MM-DD` string in and out; only the DISPLAY
 * follows the configured format.
 */
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
/**
 * Short month names in the picker's month dropdown.
 *
 * Full names did not fit: the <select> is sized to sit between the year box
 * and the month arrows, so "September" and "October" were clipped to
 * "Septemb" and "Octobe" - a control that cannot show its own current value.
 * Three letters are unambiguous in every month and leave the popup compact,
 * which matters more here than formality: this is a picker, not prose.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n, w = 2) => String(n).padStart(w, '0');
const iso = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function parseIso(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ''));
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export default function DateField({
  value, onChange, label, minYear = 1900, maxYear = 2200, id,
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const parsed = parseIso(value);
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState(() => ({
    year: parsed?.year ?? today.getFullYear(),
    month: parsed?.month ?? today.getMonth() + 1,
  }));
  const wrapRef = useRef(null);

  // Re-centre the calendar when the value changes from outside.
  useEffect(() => {
    if (parsed) setView({ year: parsed.year, month: parsed.month });
  }, [value]);

  // Close on outside click and on Escape. Both, because a popup that only
  // closes one way is a trap on touch devices.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const daysInMonth = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay();

  const shiftMonth = (delta) => {
    setView((v) => {
      const m0 = v.month - 1 + delta;
      const year = v.year + Math.floor(m0 / 12);
      const month = ((m0 % 12) + 12) % 12 + 1;
      return { year: Math.min(maxYear, Math.max(minYear, year)), month };
    });
  };

  const pick = (d) => {
    onChange(iso(view.year, view.month, d));
    setOpen(false);
  };

  const isToday = (d) =>
    view.year === today.getFullYear() &&
    view.month === today.getMonth() + 1 &&
    d === today.getDate();

  return (
    <div ref={wrapRef} className="datefield">
      {label && <label className="f" htmlFor={id}>{label}</label>}
      <button
        id={id}
        type="button"
        className="datefield-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="mono">{formatDate(value, settings.dateFormat)}</span>
        <span className="datefield-icon" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="datefield-pop card" role="dialog" aria-label="Choose a date">
          <div className="datefield-head">
            <button type="button" className="btn ghost" onClick={() => shiftMonth(-12)} title="Previous year">«</button>
            <button type="button" className="btn ghost" onClick={() => shiftMonth(-1)} title="Previous month">‹</button>
            <div className="datefield-title">
              <select
                value={view.month}
                onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
                aria-label="Month"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} title={MONTHS_FULL[i]}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                value={view.year}
                min={minYear}
                max={maxYear}
                aria-label="Year"
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (y >= minYear && y <= maxYear) setView((v) => ({ ...v, year: y }));
                }}
              />
            </div>
            <button type="button" className="btn ghost" onClick={() => shiftMonth(1)} title="Next month">›</button>
            <button type="button" className="btn ghost" onClick={() => shiftMonth(12)} title="Next year">»</button>
          </div>

          <div className="datefield-grid">
            {WEEKDAYS.map((w) => <div key={w} className="datefield-wd">{w}</div>)}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const selected = parsed &&
                parsed.year === view.year && parsed.month === view.month && parsed.day === d;
              return (
                <button
                  key={d}
                  type="button"
                  className={`datefield-day${selected ? ' is-selected' : ''}${isToday(d) ? ' is-today' : ''}`}
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="datefield-foot">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const n = new Date();
                onChange(iso(n.getFullYear(), n.getMonth() + 1, n.getDate()));
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
