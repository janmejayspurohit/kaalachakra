import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useDateFormat, useSettings } from '../settings.jsx';
import { Modal } from './Modal.jsx';

/**
 * Day markers. One table drives both the cell badges and the legend, so a new
 * marker cannot appear in the grid without also appearing in the key.
 */
const MARKERS = {
  ekadashi:    { short: 'Ek', label: 'Ekadashi fast day (Madhwa reckoning)' },
  purnima:     { short: 'Pu', label: 'Purnima' },
  amavasya:    { short: 'Am', label: 'Amavasya' },
  aradhana:    { short: 'Ar', label: 'Aradhana / punyatithi' },
  chaturmasya: { short: 'Ch', label: 'Within a Chaturmasya vrata' },
};

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Month toggles plus Today. Shared so the skeleton has the identical header
 *  height and the card does not resize when real data arrives. */
function MonthToggle({ month, onMonth, onToday, disabled = false }) {
  return (
    <div className="month-toggle">
      {MONTH_LABELS.map((label, i) => (
        <button
          key={label}
          className={`btn ${i + 1 === month ? 'primary' : 'ghost'}`}
          onClick={() => onMonth(i + 1)}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
      <button className="btn ghost" onClick={onToday} disabled={disabled} title="Jump to the current month">
        Today
      </button>
    </div>
  );
}

/** Placeholder with the grid's geometry, so first load does not resize the card. */
function MonthSkeleton({ year, month, onMonth }) {
  return (
    <div>
      <MonthToggle month={month} onMonth={onMonth} onToday={() => {}} disabled />
      <div className="legend" style={{ marginBottom: 10 }}>
        {Object.entries(MARKERS).map(([k, v]) => (
          <span key={k}><span className={`marker m-${k}`}>{v.short}</span> {v.label}</span>
        ))}
      </div>
      <div className="month-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
          <div key={d} className="weekday-header">{d}</div>
        ))}
        {Array.from({ length: 35 }, (_, i) => <div key={i} className="cell skeleton" />)}
      </div>
    </div>
  );
}

export default function MonthGrid({ year, onRequestYear }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  /**
   * Jump to the real current month.
   *
   * The YEAR lives in the parent, so this has to ask for it - setting only the
   * month left "Today" on the wrong year entirely whenever the year had been
   * changed, which is the state in which the button is actually useful.
   */
  const goToToday = () => {
    const now = new Date();
    if (onRequestYear) onRequestYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalDay, setModalDay] = useState(null);
  const fmt = useDateFormat();
  const { settings } = useSettings();
  // Named `selectedPlace`, not `place` - the render below destructures the
  // RESOLVED place the API echoed back, and the two are not the same object:
  // this is what was asked for, that is what the engine actually used.
  const selectedPlace = settings.place;
  const placeKey = `${selectedPlace.latitude},${selectedPlace.longitude},${selectedPlace.altitude},${selectedPlace.timezone}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api.month(year, month, selectedPlace, { ganita: settings.ganita, ayanamsa: settings.ayanamsa })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [year, month, placeKey, settings.ganita, settings.ayanamsa]);

  const handleDayClick = (dayData) => {
    setModalDay(dayData);
  };

  const closeModal = () => {
    setModalDay(null);
  };

  // Escape, focus handling and scroll locking now live in <Modal>, which is
  // the single implementation the whole app shares. This component used to
  // carry its own Escape listener and nothing else - no focus trap, no focus
  // restore - which is the usual outcome of hand-rolling a dialog per screen.

  if (err) {
    return <div className="err">{err}</div>;
  }

  // FIRST load only: there is nothing to keep on screen yet, so show a
  // skeleton the same shape as the grid rather than a one-line spinner.
  if (!data || !data.days) {
    return <MonthSkeleton year={year} month={month} onMonth={setMonth} />;
  }

  // While a new month is in flight we deliberately KEEP RENDERING the month
  // we already have, dimmed, instead of tearing the grid down. Replacing a
  // six-row grid with a one-line "Loading…" collapses the card and then
  // re-expands it, which is what made navigation feel like the page was
  // jumping around.
  const stale = loading || data.year !== year || data.month !== month;

  // STALE-DATA GUARD.
  //
  // Clicking a different month re-renders immediately, before the fetch
  // effect has run - so `data` still holds the PREVIOUS month while
  // `gridDays` below is already built for the new one. Going from a 28-day
  // February to a 31-day March then indexes days[28..30] as undefined and
  // the first `d.tithi.name` throws, blanking the whole app.
  //
  // Rendering the previous month's grid under the new month's heading would
  // be worse than waiting, so show the loading state until the payload
  // matches what was asked for.
  const { days, place } = data;
  
  // Create a grid of day cells
  // Derive the grid from the DATA's month, never the requested one. That is
  // what makes it safe to keep the old grid up: a 28-day February can never
  // be indexed with 31 March slots.
  const shownYear = data.year;
  const shownMonth = data.month;
  const firstDayOfMonth = new Date(Date.UTC(shownYear, shownMonth - 1, 1));
  const startDayOfWeek = firstDayOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(shownYear, shownMonth, 0).getDate();
  
  // Create array of day numbers (with leading blanks)
  const gridDays = [];
  
  // Add leading blank cells
  for (let i = 0; i < startDayOfWeek; i++) {
    gridDays.push(null);
  }
  
  // Add actual days
  for (let i = 1; i <= daysInMonth; i++) {
    gridDays.push(i);
  }

  const renderDayCell = (dayNumber, dayData, index) => {
    // A day with no payload (API reported an error for it, or the arrays are
    // momentarily out of step) renders as an inert cell rather than throwing.
    if (dayNumber !== null && (!dayData || !dayData.tithi)) {
      return (
        <div key={`nodata-${index}`} className="cell blank" title="No data for this day">
          <div className="day-number" style={{ color: 'var(--text-dim)' }}>{dayNumber}</div>
        </div>
      );
    }
    if (dayNumber === null) {
      // Leading blanks must not look or behave like days: a distinct class
      // removes the border and the pointer, and the key uses the grid index
      // because every blank would otherwise share the key `null`.
      return <div key={`blank-${index}`} className="cell blank" />;
    }
    
    const dayIndex = dayNumber - 1;
    const d = dayData;
    
    // Build title attribute
    let title = '';
    if (d.date) title += `${fmt(d.date)}\n`;
    title += `Vara: ${d.vara.name}\n`;
    title += `${d.tithi.paksha} ${d.tithi.name} until ${d.tithi.end}\n`;
    title += `Nakshatra: ${d.nakshatra.name} pada ${d.nakshatra.pada}\n`;
    title += `Sunrise ${d.sun.rise}  Sunset ${d.sun.set}`;
    
    if (d.kaala.rahu.start && d.kaala.rahu.end) {
      title += `\nRahu ${d.kaala.rahu.start}-${d.kaala.rahu.end}`;
    }
    
    if (d.aradhana && d.aradhana.length > 0) {
      title += `\nAradhana: ${d.aradhana.join(', ')}`;
    }
    
    if (d.chaturmasya) {
      title += `\n${d.chaturmasya.name}`;
    }

    // Labelled and colour-coded rather than bare letters. A grid where every
    // cell reads "C" teaches the reader nothing; `MARKERS` below is also the
    // single source for the legend, so the two cannot drift apart.
    const markers = [];
    if (d.ekadashi && d.ekadashi.isFastDayToday) markers.push('ekadashi');
    if (d.tithi.isPurnima) markers.push('purnima');
    if (d.tithi.isAmavasya) markers.push('amavasya');
    if (d.aradhana && d.aradhana.length > 0) markers.push('aradhana');
    if (d.chaturmasya) markers.push('chaturmasya');

    return (
      <div 
        key={dayNumber} 
        className="cell"
        title={title}
        onClick={() => handleDayClick(d)}
      >
        <div className="day-number">{dayNumber}</div>
        <div className="tithi-name">{d.tithi.name}</div>
        <div className="kannada-tithi" style={{ color: 'var(--accent)' }}>
          {d.tithi.names.kannada}
        </div>
        <div className="markers">
          {markers.map((k) => (
            <span key={k} className={`marker m-${k}`} title={MARKERS[k].label}>
              {MARKERS[k].short}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderModal = () => {
    if (!modalDay) return null;
    
    const d = modalDay;
    
    return (
      <Modal
        open
        onClose={closeModal}
        title={fmt(d.date)}
        footer={<button className="btn ghost" onClick={closeModal}>Close</button>}
      >
          <p style={{ marginTop: 0 }}>Vara: {d.vara.name}</p>
          <p>
            {d.masa.displayName} {d.masa.isAdhika && '(adhika)'} {d.samvatsara} {d.ritu}
          </p>
          
          <dl style={{ margin: 0 }}>
            <div className="kv"><dt>Tithi</dt><dd>{d.tithi.name}{d.tithi.end && ` until ${d.tithi.end}`}</dd></div>
            
            <div className="kv"><dt>Nakshatra</dt><dd>{d.nakshatra.name} pada {d.nakshatra.pada}</dd></div>
            
            <div className="kv"><dt>Yoga</dt><dd>{d.yoga.name} until {d.yoga.end}</dd></div>
            
            <div className="kv"><dt>Karana</dt><dd>{d.karana.name} until {d.karana.end}</dd></div>
          </dl>
          
          <p className="kv">
            <span>Sunrise:</span> <span className="mono">{d.sun.rise}</span>
            <span>Sunset:</span> <span className="mono">{d.sun.set}</span>
          </p>
          
          {d.moon.rise && (
            <p className="kv">
              <span>Moonrise:</span> <span className="mono">{d.moon.rise}</span>
              <span>Moonset:</span> <span className="mono">{d.moon.set}</span>
            </p>
          )}
          
          <dl style={{ margin: 0 }}>
            <div className="kv"><dt>Rahu</dt><dd>{d.kaala.rahu.start} - {d.kaala.rahu.end}</dd></div>
            
            <div className="kv"><dt>Gulika</dt><dd>{d.kaala.gulika.start} - {d.kaala.gulika.end}</dd></div>
            
            <div className="kv"><dt>Yamaganda</dt><dd>{d.kaala.yamaganda.start} - {d.kaala.yamaganda.end}</dd></div>
            
            {d.kaala.abhijit.applies && (
              <>
                <div className="kv"><dt>Abhijit</dt><dd>{d.kaala.abhijit.start} - {d.kaala.abhijit.end}</dd></div>
              </>
            )}
          </dl>
          
          {d.ekadashi && d.ekadashi.explanation && (
            <div className="notice">{d.ekadashi.explanation}</div>
          )}
          
          {d.aradhana && d.aradhana.length > 0 && (
            <p><strong>Aradhana:</strong> {d.aradhana.join(', ')}</p>
          )}
          
          {d.chaturmasya && (
            <p><strong>Chaturmasya:</strong> {d.chaturmasya.name}</p>
          )}
          
      </Modal>
    );
  };

  return (
    <div>
      <MonthToggle
        month={shownMonth}
        onMonth={setMonth}
        onToday={goToToday}
      />

      {/* Legend is generated from MARKERS, so it can never fall out of step
          with the badges actually rendered in the cells. */}
      <div className="legend" style={{ marginBottom: 10 }}>
        {Object.entries(MARKERS).map(([k, v]) => (
          <span key={k}>
            <span className={`marker m-${k}`}>{v.short}</span> {v.label}
          </span>
        ))}
      </div>

      <div 
        className={`month-grid${stale ? ' is-stale' : ''}`} 
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}
      >
        <div className="weekday-header">Sun</div>
        <div className="weekday-header">Mon</div>
        <div className="weekday-header">Tue</div>
        <div className="weekday-header">Wed</div>
        <div className="weekday-header">Thu</div>
        <div className="weekday-header">Fri</div>
        <div className="weekday-header">Sat</div>
        
        {gridDays.map((dayNumber, index) => {
          const dayData = dayNumber !== null ? days[dayNumber - 1] : null;
          return renderDayCell(dayNumber, dayData, index);
        })}
      </div>
      
      {renderModal()}
    </div>
  );
}