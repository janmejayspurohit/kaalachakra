import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import MonthGrid from './MonthGrid.jsx';
import { useDateFormat, useSettings } from '../settings.jsx';

export default function Calendar() {
  // Default to the CURRENT year, not a hardcoded one - a build shipped in
  // 2027 would otherwise open on 2026.
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const fmt = useDateFormat();
  const { settings } = useSettings();
  const place = settings.place;
  // Primitive key, so the effect re-runs when the place actually changes and
  // not on every render that hands it a fresh object with the same values.
  const placeKey = `${place.latitude},${place.longitude},${place.altitude},${place.timezone}`;
  const calc = { ganita: settings.ganita, ayanamsa: settings.ayanamsa };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    Promise.all([
      api.ekadashis(year, place, calc),
      api.chaturmasya(year, place, calc),
      api.aradhana(year, place, calc)
    ])
      .then(([ekadashis, chaturmasya, aradhana]) => {
        if (!cancelled) {
          setData({ ekadashis, chaturmasya, aradhana });
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
  }, [year, placeKey, settings.ganita, settings.ayanamsa]);

  if (loading) {
    return <div className="card"><div className="empty">Loading calendar data...</div></div>;
  }

  if (err) {
    return <div className="err">{err}</div>;
  }

  if (!data) {
    return <div className="card"><div className="empty">No data</div></div>;
  }

  const { ekadashis, chaturmasya, aradhana } = data;

  return (
    <div>
      <div className="card">
        <div className="datebar">
          <div className="grow">
            <label className="f">Year</label>
            <input
              type="number"
              value={year}
              min="1900"
              max="2200"
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Month</h2>
        <MonthGrid year={year} onRequestYear={setYear} />
      </div>

      <div className="card">
        <h2>Chaturmasya</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Kannada</th>
              <th>Start</th>
              <th>End</th>
              <th>Prohibits</th>
            </tr>
          </thead>
          <tbody>
            {chaturmasya.vratas.map((v, i) => (
              <tr key={i}>
                <td>{v.name}</td>
                <td>{v.kannada}</td>
                <td className="mono">{fmt(v.start)}</td>
                <td className="mono">{fmt(v.end)}</td>
                <td>{v.prohibits}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Overall span: {fmt(chaturmasya.overall.start)} to {fmt(chaturmasya.overall.end)}
        </p>
        {chaturmasya.overall.confidence === 'review' && (
          <div className="notice">{chaturmasya.overall.note}</div>
        )}
      </div>

      <div className="card">
        <h2>Ekadashi</h2>
        <p className="muted">
          {ekadashis.count} Ekadashis, {ekadashis.ekadashis.filter(e => e.shiftedByADay).length} shifted by arunodaya vedha
        </p>
        <table>
          <thead>
            <tr>
              <th>Masa</th>
              <th>Paksha</th>
              <th>Madhwa date</th>
              <th>Shifted</th>
              <th>Paarane</th>
            </tr>
          </thead>
          <tbody>
            {ekadashis.ekadashis.map((e, i) => (
              <tr key={i}>
                <td>{e.masa}</td>
                <td>{e.paksha}</td>
                <td className="mono">{fmt(e.madhwaDate)}</td>
                <td>
                  {e.shiftedByADay && <span className="pill">shifted</span>}
                  {e.kshaya && <span className="pill">kshaya</span>}
                </td>
                <td>
                  {e.paarane.from ? (
                    `${e.paarane.from} - ${e.paarane.to}`
                  ) : (
                    <span className="muted">{e.paarane.error}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Aradhana</h2>
        <p className="muted">
          Tithi triples derived from published punyatithi dates and validated against three independently sourced tithis. See aradhana.js for method.
        </p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Tithi</th>
            </tr>
          </thead>
          <tbody>
            {aradhana.aradhanas.map((a, i) => (
              <tr key={i}>
                <td className="mono">{fmt(a.date)}</td>
                <td>{a.name}</td>
                <td>
                  {a.masa} {a.paksha} {a.tithiName}
                  {a.adhikaMasa && <span className="pill">adhika</span>}
                  {a.vriddhiResolved && <span className="pill">vriddhi</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}