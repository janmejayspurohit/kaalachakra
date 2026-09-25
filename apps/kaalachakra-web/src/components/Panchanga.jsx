import React from 'react';
import { Point } from './MuhurtaFinder.jsx';

/**
 * Localised names now come from the API, which sources them from Ahoratra's
 * AHLocalize tables (english / vedicenglish / hindi / telugu / kannada).
 * The previous hardcoded Kannada map has been removed - hand-maintaining a
 * second copy of a translation table is how the two silently diverge.
 */
const LANG = 'kannada';
const loc = (names) => names?.[LANG] ?? null;

function Anga({ label, value, kannada, until, extra }) {
  return (
    <div className="anga">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {kannada && <div className="kn">{kannada}</div>}
      {extra && <div className="until">{extra}</div>}
      {until && <div className="until">until {until}</div>}
    </div>
  );
}

/**
 * Kaala windows drawn to scale across the daylight span.
 *
 * Positioned by actual fraction of the sunrise-to-sunset interval rather than
 * by clock hour, because the day length is not 12 hours except at equinox -
 * a fixed-hour bar would misplace every window for most of the year.
 */
/**
 * Kaala segment colours.
 *
 * Muted rather than the saturated flat-UI set they replace, and validated
 * rather than eyeballed. Kaala windows REORDER by weekday, so any two can end
 * up adjacent - the palette was therefore checked on ALL PAIRS, not just
 * neighbours, and passes every gate on the light, dark and midnight surfaces:
 *   worst all-pairs CVD ΔE 9.7 (protan), normal-vision ΔE 17.9, contrast ≥3:1.
 * The legend also names every window, so identity is never colour-alone.
 */
const KAALA_COLOURS = {
  rahu: '#cb7d4e',       // muted terracotta
  gulika: '#3468a8',     // muted indigo
  yamaganda: '#a37fd0',  // muted violet
  abhijit: '#3ba590',    // muted teal
};

function KaalaBar({ kaala, sunriseJd, sunsetJd }) {
  const span = sunsetJd - sunriseJd;

  // Sorted by start time. Rahu, Gulika and Yamaganda each take a different
  // eighth of the daylight span depending on the weekday, so their order
  // genuinely changes day to day - listing them in a fixed order would put
  // the legend out of step with the bar on most days.
  const windows = [
    { key: 'rahu', label: 'Rahu', win: kaala.rahu },
    { key: 'gulika', label: 'Gulika', win: kaala.gulika },
    { key: 'yamaganda', label: 'Yamaganda', win: kaala.yamaganda },
    ...(kaala.abhijit.applies
      ? [{ key: 'abhijit', label: 'Abhijit', win: kaala.abhijit }]
      : []),
  ]
    .map((w) => ({ ...w, colour: KAALA_COLOURS[w.key] }))
    .sort((a, b) => a.win.startJd - b.win.startJd);
  const seg = (w, cls) => {
    const left = ((w.startJd - sunriseJd) / span) * 100;
    const width = ((w.endJd - w.startJd) / span) * 100;
    return (
      <div key={cls} className={`seg ${cls}`}
        style={{ left: `${Math.max(0, left)}%`, width: `${Math.min(width, 100 - left)}%` }}
        title={`${cls}: ${w.start} – ${w.end}`} />
    );
  };
  return (
    <>
      <div className="bar">
        {windows.map((w) => seg(w.win, w.key))}
      </div>
      <div className="legend">
        {/* Ordered by start time, so the legend reads left-to-right in the
            same order the bands appear on the bar above. The weekday-indexed
            offsets mean Rahu is not always last, so a fixed order would
            disagree with the bar on most days. */}
        {windows.map((w) => (
          <span key={w.key}>
            <i style={{ background: w.colour }} />
            {w.label} {w.win.start}–{w.win.end}
          </span>
        ))}
        {!kaala.abhijit.applies && (
          <span className="muted">Abhijit not observed on Budhavara</span>
        )}
      </div>
    </>
  );
}

/**
 * Ekadashi nirnaya.
 *
 * Shows BOTH the candidate day and the Madhwa observance day whenever they
 * differ. For this audience the divergence is the point - silently applying
 * the shift would hide the very rule that makes the calendar Madhwa.
 */
function Ekadashi({ e, tz }) {
  return (
    <div className="card" style={{ borderColor: e.isFastDayToday ? 'var(--accent)' : 'var(--border)' }}>
      <h2>Ekadashi nirnaya</h2>
      {/* An Ekadashi observance spans up to four days; say which one this is. */}
      {e.role === 'fast' ? (
        <p style={{ marginTop: 0 }}><strong>Today is the Madhwa Ekadashi fast day.</strong></p>
      ) : e.role === 'athiriktha' ? (
        <p style={{ marginTop: 0 }}><strong>Today is Athiriktha Vaishnava Ekadashi — also a fasting day.</strong></p>
      ) : e.role === 'paarane' ? (
        <p style={{ marginTop: 0 }}><strong>Today is the paarane (fast-breaking) day.</strong></p>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          The Ekadashi tithi is found today, but the Madhwa fast is on{' '}
          {fmtDate(e.madhwaSunriseJd, tz)}.
        </p>
      )}

      <dl style={{ margin: 0 }}>
        <div className="kv"><dt>Arunodaya</dt><dd>96 min before sunrise</dd></div>
        <div className="kv">
          <dt>Dashami at arunodaya?</dt>
          <dd>{e.viddha ? 'yes — viddha' : 'no — suddha'}</dd>
        </div>
        {e.kshayaEkadashi && (
          <div className="kv"><dt>Kshaya</dt><dd>tithi touches no sunrise</dd></div>
        )}
        {e.shiftedByADay && (
          <div className="kv"><dt>Shift</dt><dd>fast moves one day later</dd></div>
        )}
        <div className="kv"><dt>Fast day</dt><dd>{fmtDate(e.madhwaSunriseJd, tz)}</dd></div>
        {e.paarane?.athiriktha && (
          <div className="kv"><dt>Athiriktha</dt><dd>{fmtDate(e.paarane.athiriktha.jd, tz)} — also fasted</dd></div>
        )}
      </dl>

      <p className="muted" style={{ marginBottom: 0 }}>{e.explanation}</p>

      {e.paarane?.window ? (
        <>
          <h3 style={{ marginTop: 14 }}>Paarane</h3>
          <dl style={{ margin: 0 }}>
            <div className="kv"><dt>Harivasara ends</dt><dd>{fmtTime(e.paarane.harivasara.endJd, tz)}</dd></div>
            <div className="kv"><dt>Break fast between</dt>
              <dd>{fmtDate(e.paarane.window.startJd, tz)}, {fmtTime(e.paarane.window.startJd, tz)} – {fmtTime(e.paarane.window.endJd, tz)}</dd></div>
            <div className="kv"><dt>Window opens on</dt><dd>{e.paarane.constrainedBy}</dd></div>
          </dl>
          <p className="muted" style={{ marginBottom: 0 }}>
            Paarane is prohibited during Harivasara, the first quarter of Dwadashi,
            and must be completed before the Dwadashi tithi ends.
          </p>
        </>
      ) : e.paarane?.reason ? (
        <div className="notice" style={{ marginTop: 12 }}>{e.paarane.reason}</div>
      ) : null}
    </div>
  );
}

/**
 * JD -> local HH:MM.
 *
 * The nirnaya block carries raw Julian Days, so the offset must be applied
 * here. It is passed in explicitly rather than defaulted: a hardcoded +5.5
 * would be silently wrong for every user outside India, and this app is
 * already used from the US in its own test fixtures.
 */
/** JD -> local "Wed 13 May", for the days an observance spans. */
function fmtDate(jd, tzOffsetHours) {
  if (!Number.isFinite(jd) || !Number.isFinite(tzOffsetHours)) return '—';
  const d = new Date((jd - 2440587.5) * 86400000 + tzOffsetHours * 3600000);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fmtTime(jd, tzOffsetHours) {
  if (!Number.isFinite(jd) || !Number.isFinite(tzOffsetHours)) return '—';
  const ms = (jd - 2440587.5) * 86400000;
  return new Date(ms + tzOffsetHours * 3600000).toISOString().slice(11, 16);
}

/**
 * The day's shubha / ashubha marks: the Math's vara-nakshatra day mark, the
 * nitya and special yogas, and combustion - each with its basis.
 */
function ShubhaAshubha({ m }) {
  const astha = Object.entries(m.astha ?? {}).filter(([, s]) => s.combust);
  return (
    <div className="card">
      <h2>Shubha &amp; ashubha</h2>
      <Point p={{ id: 'dq', label: 'Day', status: m.dayQuality.quality === 'good' ? 'pass' : 'warn', detail: m.dayQuality.label + '.', basis: m.dayQuality.basis }} />
      {m.yogas.map((y) => (
        <Point key={y.name} p={{ id: y.name, label: y.name, status: y.nature === 'shubha' ? 'pass' : y.nature === 'ashubha' ? 'fail' : 'warn', detail: y.nature === 'shubha' ? 'Shubha.' : y.nature === 'ashubha' ? 'Ashubha - no muhurta is fixed on it.' : 'Classically inauspicious, but not ruled out for a muhurta.', basis: y.basis }} />
      ))}
      {(m.varaYogas ?? []).map((y) => (
        <Point key={y.name + y.kind + y.startJd} p={{ id: y.name + y.startJd, label: `${y.name} yoga`, status: y.nature === 'shubha' ? 'pass' : 'warn', detail: `${y.detail}, ${y.start}–${y.end}. ${y.nature === 'shubha' ? 'Shubha.' : 'Ashubha - removed by a shubha yoga the same day, or by a strong lagna.'}`, basis: y.basis }} />
      ))}
      {m.anandadi?.length > 0 && (
        <Point p={{ id: 'anandadi', label: 'Anandadi (for travel)', status: m.anandadi.every((a) => a.good) ? 'pass' : m.anandadi.some((a) => a.good) ? 'warn' : 'fail', detail: m.anandadi.map((a) => `${a.name} (${a.phala}) ${a.start}–${a.end}`).join('; ') + '.', basis: 'Sri Uttaradi Math panchanga, "ಪ್ರಯಾಣಾರ್ಥಂ ಆನಂದಾದಿಯೋಗಾಃ", Kannada edition page 14: counted from the weekday\'s nakshatra with Abhijit as the 28th; phala as printed.' }} />
      )}
      {astha.map(([g, s]) => (
        <Point key={g} p={{ id: g, label: `${g[0].toUpperCase() + g.slice(1)} astha`, status: 'warn', detail: `Combust, ${s.separation.toFixed(1)}° from the Sun.`, basis: 'Sri Uttaradi Math: Guru astha is not suitable for Rigvedis, Shukra astha for Yajurvedis, Bhouma astha for Samavedis. Windows calibrated to the Math\'s printed astha dates (within a day).' }} />
      ))}
    </div>
  );
}

/** The day's timed divisions: Brahma muhurta, Abhijit, durmuhurta, thyajya, Gowri, the thirty muhurtas. */
function MuhurtaTimes({ m }) {
  return (
    <div className="card">
      <h2>Muhurta timings</h2>
      <dl style={{ margin: 0 }}>
        {m.brahma && <div className="kv"><dt>Brahma muhurta</dt><dd>{m.brahma.start} – {m.brahma.end}</dd></div>}
        <div className="kv"><dt>Abhijit</dt><dd>{m.abhijit.start} – {m.abhijit.end}</dd></div>
        {m.durmuhurtas.map((d) => (
          <div key={d.index} className="kv"><dt>Durmuhurta ({d.devata})</dt><dd>{d.start} – {d.end}</dd></div>
        ))}
        {m.thyajya.map((t) => (
          <div key={t.startJd} className="kv"><dt>Nakshatra thyajya ({t.nakshatra})</dt><dd>{t.start} – {t.end}</dd></div>
        ))}
      </dl>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Nakshatra thyajya follows the Uttaradi Math: two hours around the standard ghatika point, beginning about an hour before it (Mula has two). Measured against the times the Math prints: median error 3–4 minutes.
        Durmuhurta, Brahma muhurta and Abhijit follow sudhyk&apos;s Ahoratra and the classical texts; the Math&apos;s panchanga does not print them.
      </div>

      <details style={{ marginTop: 12 }}>
        <summary>Gowri panchanga (Sri Uttaradi Math table)</summary>
        <table>
          <thead><tr><th>Part</th><th></th><th>From</th><th>To</th></tr></thead>
          <tbody>
            {m.gowri.map((g) => (
              <tr key={g.part + g.index}>
                <td>{g.part === 'day' ? 'Day' : 'Night'} {g.index}</td>
                <td className={`nature-${g.nature}`}>{g.name}</td>
                <td className="mono">{g.start}</td>
                <td className="mono">{g.end}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary>The thirty muhurtas (sudhyk&apos;s Ahoratra)</summary>
        <table>
          <thead><tr><th>#</th><th>Devata</th><th>From</th><th>To</th></tr></thead>
          <tbody>
            {m.muhurtas.map((x) => (
              <tr key={x.index}>
                <td className="num">{x.index}</td>
                <td className={`nature-${x.nature}`}>{x.devata}{x.durmuhurta ? ' (durmuhurta)' : ''}</td>
                <td className="mono">{x.start}</td>
                <td className="mono">{x.end}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default function Panchanga({ data }) {
  const p = data;
  const t = p.tithi, n = p.nakshatra, y = p.yoga, k = p.karana;

  return (
    <div className="grid side">
      <div>
        <div className="card">
          <h2>Panchanga</h2>
          {p.masa && (
            <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
              <strong>{p.samvatsara.name}</strong> samvatsara ·{' '}
              <strong>{p.masa.displayName}</strong>
              {loc(p.masa.names) && <span style={{ color: 'var(--accent)' }}> {loc(p.masa.names)}</span>}
              {p.masa.isAdhika && <span className="pill" style={{ marginLeft: 6 }}>adhika masa</span>}
              {' '}· {p.ritu.name} ritu
            </p>
          )}
          <div className="angas">
            <Anga label="Vara" value={p.vara.name} kannada={loc(p.vara.names)} />
            <Anga
              label={`Tithi · ${t.paksha}`}
              value={t.name}
              kannada={[loc(t.pakshaNames), loc(t.names)].filter(Boolean).join(' ')}
              until={t.end}
            />
            <Anga label="Nakshatra" value={n.name} kannada={loc(n.names)} extra={`pada ${n.pada}`} until={n.end} />
            <Anga label="Yoga" value={y.name} kannada={loc(y.names)} until={y.end} />
            <Anga label="Karana" value={k.name} kannada={loc(k.names)} until={k.end} />
          </div>

          {p.transitions && (
            <div style={{ marginTop: 12 }}>
              {['tithi', 'nakshatra', 'yoga'].map((key) => {
                const tr = p.transitions[key];
                if (!tr || (!tr.skipped && !tr.repeated)) return null;
                return (
                  <div key={key} className="notice" style={{ marginTop: 6 }}>
                    {tr.skipped
                      ? `Kshaya: a ${key} is skipped — it begins and ends between today's and tomorrow's sunrise.`
                      : `Vriddhi: this ${key} spans two sunrises and is repeated.`}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {p.ekadashi && <Ekadashi e={p.ekadashi} tz={p.place.tzOffsetHours} />}

        <div className="card">
          <h2>Kaala</h2>
          <KaalaBar kaala={p.kaala} sunriseJd={p.sun.riseJd} sunsetJd={p.sun.setJd} />
        </div>

        {p.muhurta && <ShubhaAshubha m={p.muhurta} />}
        {p.muhurta && <MuhurtaTimes m={p.muhurta} />}

        <div className="card">
          <h2>Hora</h2>
          <table>
            <thead><tr><th>#</th><th>Lord</th><th>From</th><th>To</th></tr></thead>
            <tbody>
              {p.horas.map((h) => (
                <tr key={h.index}>
                  <td className="num">{h.index}</td>
                  <td style={{ textTransform: 'capitalize' }}>{h.lord}</td>
                  <td className="mono">{h.start}</td>
                  <td className="mono">{h.end}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="card">
          <h2>Sun &amp; Moon</h2>
          <dl style={{ margin: 0 }}>
            <div className="kv"><dt>Sunrise</dt><dd>{p.sun.rise}</dd></div>
            <div className="kv"><dt>Sunset</dt><dd>{p.sun.set}</dd></div>
            <div className="kv"><dt>Day length</dt><dd>{p.sun.dayLengthHours.toFixed(2)} h</dd></div>
            <div className="kv"><dt>Moonrise</dt><dd>{p.moon.rise ?? '—'}</dd></div>
            <div className="kv"><dt>Moonset</dt><dd>{p.moon.set ?? '—'}</dd></div>
            <div className="kv"><dt>Sun rashi</dt><dd>{p.sun.rashi.name}</dd></div>
            <div className="kv"><dt>Moon rashi</dt><dd>{p.moon.rashi.name}</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2>Provenance</h2>
          <dl style={{ margin: 0 }}>
            <div className="kv"><dt>Ayanamsa</dt><dd>{p.meta.ayanamsa}</dd></div>
            <div className="kv"><dt>Value</dt><dd>{p.meta.ayanamsaFormatted}</dd></div>
            <div className="kv"><dt>Ephemeris</dt><dd>Swiss {p.meta.ephemerisVersion}</dd></div>
            <div className="kv"><dt>Place</dt><dd>{p.place.resolvedName ?? '—'}</dd></div>
            <div className="kv"><dt>Altitude</dt><dd>{p.place.altitude} m</dd></div>
            <div className="kv"><dt>UTC offset</dt><dd>{p.place.tzOffsetHours >= 0 ? '+' : ''}{p.place.tzOffsetHours}</dd></div>
          </dl>
          <p className="muted" style={{ marginBottom: 0, marginTop: 10 }}>
            Sunrise uses the Vedic convention: disc centre, no refraction,
            geocentric. This differs from the common convention by 2–4 minutes
            and determines the whole day&rsquo;s panchanga.
          </p>
        </div>
      </div>
    </div>
  );
}
