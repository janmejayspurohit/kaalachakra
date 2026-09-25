import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import DashaOutlook from './DashaOutlook.jsx';
import { dashaTerm, dashaTermShort, dashaTermLower } from '../dasha-terms.js';
import { useDateFormat, useSettings } from '../settings.jsx';

/**
 * Graha colours for the dasha timeline.
 *
 * Muted, and validated against the light, dark and midnight surfaces rather
 * than picked by eye. The timeline order is FIXED (the Vimshottari cycle), so
 * the adjacent-pair gates apply: worst adjacent CVD ΔE 6.5 (deutan),
 * normal-vision ΔE 17.7, all nine ≥3:1 contrast, all inside the lightness band.
 *
 * A CVD ΔE in the 6–8 band is permitted only with secondary encoding, and this
 * chart has it: every segment wide enough carries its graha name, and all of
 * them carry a hover tooltip naming the period.
 */
const GRAHA_COLOUR = {
  ketu: '#cb7d4e', shukra: '#3468a8', surya: '#a37fd0', chandra: '#3ba590',
  mangala: '#cc6363', rahu: '#6a86cc', guru: '#b08a24', shani: '#1f9cba',
  budha: '#6d9f2e',
};

/** Saturn period labels. Text, not fills, so these follow the ink tokens. */
const SATURN_COLOUR = {
  sadeSati: 'var(--accent)', ashtamaShani: 'var(--bad)', kantakaShani: 'var(--warn)',
};

/** Julian Day -> fractional year, for positioning on the timeline. */
const jdToYear = (jd) => 2000 + (jd - 2451545.0) / 365.2425;

export default function Dashas({ profiles }) {
  const [id, setId] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [depth, setDepth] = useState(2);
  /**
   * The mahadasha whose outlook is open.
   *
   * Declared HERE, with the other hooks, and not further down beside the
   * markup that uses it: there is an early `return` below for the no-profiles
   * case, and a useState after it is a conditional hook. React would then see
   * a different number of hooks the moment the first profile arrived and
   * throw. The build does not catch this - it parses perfectly.
   */
  const [selected, setSelected] = useState(null);
  const fmt = useDateFormat();
  const { settings } = useSettings();
  const term = (lvl) => dashaTerm(lvl, settings.tradition);
  const termLower = (lvl) => dashaTermLower(lvl, settings.tradition);

  // `profiles` arrives asynchronously, so the selection cannot be seeded from
  // a useState initialiser - that runs once, while the list is still empty,
  // and would leave `id` null forever. Adopt the first profile as soon as one
  // exists, and recover if the selected profile is deleted.
  useEffect(() => {
    if (!profiles.length) { setId(null); return; }
    if (!id || !profiles.some((p) => p.id === id)) setId(profiles[0].id);
  }, [profiles, id]);

  useEffect(() => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    let cancelled = false;
    setData(null); setErr(null);
    // Drop any period left open from the previous profile: its outlook was
    // computed against a different chart and would be quietly wrong here.
    // The effect below re-seeds it to whatever is running now.
    setSelected(null);
    api.dasha(id, { depth, fromYear: p.birth.year, toYear: p.birth.year + 100, ganita: settings.ganita })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
    // `profiles` is intentionally not a dependency: it is a new array on every
    // parent refresh, which would re-fetch on each render. `id` is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, depth, settings.ganita]);

  /**
   * Open on the mahadasha that is running NOW.
   *
   * Matched by `startJd` against the period list rather than by graha name:
   * a 120-year tree visits most grahas once, but a long life can re-enter
   * the cycle, and matching on the name alone would then select the wrong
   * instance of it. The start instant is unique.
   *
   * The API decides what "now" is, using the same tree it returned, so the
   * highlighted period cannot disagree with the timeline under it.
   */
  useEffect(() => {
    if (!data) return;
    const running = data.current?.find((c) => c.level === 1);
    if (!running) return;                       // beyond the 120-year cycle
    const period = data.vimshottari.periods.find((p) => p.startJd === running.startJd);
    if (period) setSelected(period);
  }, [data]);

  if (!profiles.length) {
    return <div className="card"><div className="empty">Add a profile to see dashas.</div></div>;
  }

  const profile = profiles.find((x) => x.id === id);

  const nowYear = jdToYear(2451545.0 + (Date.now() / 86400000 - 10957.5));

  return (
    <>
      <div className="card">
        <div className="datebar">
          <div className="grow">
            <label className="f">Profile</label>
            <select value={id ?? ''} onChange={(e) => setId(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="f">Depth</label>
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              <option value={1}>{term(1)}</option>
              <option value={2}>+ {term(2)}</option>
              <option value={3}>+ {term(3)}</option>
            </select>
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {!data && !err && <div className="card"><div className="empty">Computing…</div></div>}

      {data && (
        <>
          <div className="card">
            <h2>Vimshottari</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Balance at birth: <strong>{data.vimshottari.balanceAtBirth.lord}</strong>{' '}
              {data.vimshottari.balanceAtBirth.formatted} · janma nakshatra{' '}
              {data.vimshottari.janma.nakshatra.name} (lord {data.vimshottari.janma.lord}) ·
              {' '}years of {Number(data.vimshottari.meta.vimshottariYearDays).toFixed(6)} days
            </p>
            {data.vimshottari.meta.yearBasis && (
              <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>{data.vimshottari.meta.yearBasis}</p>
            )}
            {data.current?.length > 0 && (
              <p className="running-now">
                Running now:{' '}
                {data.current.map((c, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="muted"> › </span>}
                    <strong style={{ textTransform: 'capitalize' }}>{c.graha}</strong>
                    <span className="muted">{' '}{termLower(c.level)}</span>
                  </React.Fragment>
                ))}
                <span className="muted">
                  {' '}· until {fmt(fmtYear(data.current[data.current.length - 1].endJd))}
                </span>
              </p>
            )}

            <Timeline
              tradition={settings.tradition}
              periods={data.vimshottari.periods}
              nowYear={nowYear}
              colour={(p) => GRAHA_COLOUR[p.graha]}
              label={(p) => p.graha}
              onSelect={setSelected}
              selected={selected}
              tip={(p) =>
                `${p.graha} ${termLower(1)}\n${fmt(fmtYear(p.startJd))} – ${fmt(fmtYear(p.endJd))}` +
                `\n${p.durationYears.toFixed(1)} years\n\nSelect for what this period means`}
            />
            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Opens on the {termLower(1)} running now. Select any other for what that period signifies and how it is
              placed in this chart. Lagna <strong>{data.lagna?.rashiName}</strong>,
              which is what decides whether each graha is a functional benefic
              or malefic here.
            </p>
          </div>

          {selected && (
            <div className="card">
              {data.current?.some((c) => c.level === 1 && c.startJd === selected.startJd) && (
                <span className="sev ok" style={{ float: 'right' }}>running now</span>
              )}
              <DashaOutlook
                outlook={selected.outlook}
                period={selected}
                fmtDate={(jd) => fmt(fmtYear(jd))}
              />
              {selected.children?.length > 0 && (
                <>
                  <h4>{term(2)}s within this period</h4>
                  <table>
                    <thead><tr><th>Lord</th><th>From</th><th>To</th><th>Character</th></tr></thead>
                    <tbody>
                      {selected.children.map((a, i) => (
                        <tr key={i}>
                          <td style={{ textTransform: 'capitalize' }}>{a.graha}</td>
                          <td className="mono">{fmt(fmtYear(a.startJd))}</td>
                          <td className="mono">{fmt(fmtYear(a.endJd))}</td>
                          <td className="muted">{a.note?.statement ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted" style={{ marginBottom: 0 }}>
                    The {termLower(1)} lord sets the subject of the period;
                    the {termLower(2)} lord sets how it proceeds.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="card">
            <h2>Shani periods</h2>
            {data.saturn.length === 0 ? (
              <div className="muted">No Sade Sati, Ashtama or Kantaka Shani in this range.</div>
            ) : (
              <>
              {/*
                * The same span as the Vimshottari timeline above, so the two
                * can be read against each other - which is the question that
                * actually gets asked: does a Sade Sati fall inside a difficult
                * mahadasha. A table alone cannot answer that at a glance.
                */}
              <Timeline
                rowLabel="Shani"
                tradition={settings.tradition}
                periods={data.saturn}
                nowYear={nowYear}
                colour={(sp) => SATURN_COLOUR[sp.kind]}
                label={(sp) => labelKind(sp.kind)}
                tip={(sp) =>
                  `${labelKind(sp.kind)}${sp.phase ? ` — ${sp.phase}` : ''}` +
                  `\n${fmt(fmtYear(sp.startJd))} – ${fmt(fmtYear(sp.endJd))}` +
                  `\nShani in ${sp.saturnRashi.name}\n\n${sp.description}`}
              />
              <table>
                <thead>
                  <tr><th>Period</th><th>Phase</th><th>From</th><th>To</th><th className="num">Years</th></tr>
                </thead>
                <tbody>
                  {data.saturn.map((s, i) => (
                    <tr key={i} title={s.description}>
                      <td>
                        <span className="sev" style={{
                          background: 'transparent', color: SATURN_COLOUR[s.kind], padding: 0,
                        }}>{labelKind(s.kind)}</span>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Saturn in {s.saturnRashi.name}
                        </div>
                      </td>
                      <td>{s.phase ?? '—'}</td>
                      <td className="mono">{fmt(fmtYear(s.startJd))}</td>
                      <td className="mono">{fmt(fmtYear(s.endJd))}</td>
                      <td className="num">{s.durationYears.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
            <p className="muted" style={{ marginBottom: 0 }}>
              Periods are found by scanning for Saturn&rsquo;s actual rashi crossings, so a
              phase interrupted by retrograde motion appears as two intervals rather
              than one continuous block.
            </p>
          </div>
        </>
      )}
    </>
  );
}

function labelKind(k) {
  return k === 'sadeSati' ? 'Sade Sati'
    : k === 'ashtamaShani' ? 'Ashtama Shani'
    : 'Kantaka Shani';
}

function fmtYear(jd) {
  // JD -> Gregorian date, good enough for a timeline label.
  const ms = (jd - 2440587.5) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Horizontal timeline.
 *
 * Nested levels render as stacked tracks. Each segment carries a `title` so
 * hovering gives the period's dates, duration and character note without a
 * click - which is what makes the tree legible at a glance.
 */
function Timeline({
  periods, nowYear, colour, label, tip, level = 0, onSelect, selected, tradition,
  rowLabel,
}) {
  const fmt = useDateFormat();
  if (!periods?.length) return null;
  const start = jdToYear(periods[0].startJd);
  const end = jdToYear(periods[periods.length - 1].endJd);
  const span = end - start;
  const pct = (jd) => ((jdToYear(jd) - start) / span) * 100;

  return (
    <>
      <div className="tl-row">
        {/*
          * `rowLabel` overrides the dasha vocabulary for a track that is not
          * a dasha level at all. The Shani timeline shows Sade Sati, Ashtama
          * and Kantaka phases; labelling its row "Dasha" (or "Maha") because
          * it happens to be the outermost track would name it as something
          * it is not.
          */}
        <div className="tl-label">{rowLabel ?? dashaTermShort(level + 1, tradition)}</div>
        <div className="tl-track">
          {periods.map((p, i) => {
            const left = pct(p.startJd);
            const width = pct(p.endJd) - left;
            return (
              <div
                key={i}
                className={`tl-seg${selected && selected.startJd === p.startJd ? ' is-selected' : ''}`}
                style={{ left: `${left}%`, width: `${width}%`, background: colour(p) }}
                title={tip(p)}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(p) : undefined}
                onKeyDown={onSelect ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p); }
                } : undefined}
              >
                {width > 6 && (
                  <span style={{
                    fontSize: 11, color: '#fff', padding: '4px 5px', display: 'block',
                    whiteSpace: 'nowrap', overflow: 'hidden', textTransform: 'capitalize',
                  }}>{label(p)}</span>
                )}
              </div>
            );
          })}
          {nowYear > start && nowYear < end && (
            <div className="tl-now" style={{ left: `${((nowYear - start) / span) * 100}%` }} title="today" />
          )}
        </div>
      </div>
      {periods.some((p) => p.children) && (
        <Timeline
          periods={periods.flatMap((p) => p.children ?? [])}
          nowYear={nowYear} colour={colour} label={label} tip={tip}
          level={level + 1} tradition={tradition}
        />
      )}
    </>
  );
}
