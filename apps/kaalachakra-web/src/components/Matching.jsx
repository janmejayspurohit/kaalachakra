import { useSettings } from '../settings.jsx';
import React, { useState } from 'react';
import { api } from '../api.js';
import MatchDetail, { KutaMeaning } from './MatchDetail.jsx';

/**
 * Matrimony matching.
 *
 * Deliberately shows twelve factors with severities and NO overall verdict,
 * following sudhyk's Ahoratra. The points total is shown as a subdued figure
 * rather than a headline, because Rajju, Nadi, Vedha and Stree Deergha carry
 * zero points by design - they are vetoes, and a percentage cannot express
 * them. Vetoes get their own prominent block above the table.
 */
export default function Matching({ profiles }) {
  const { settings } = useSettings();
  const [brideId, setBrideId] = useState('');
  const [groomId, setGroomId] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  /** Which kuta's explanation is open. One at a time, so the table stays readable. */
  const [expanded, setExpanded] = useState(null);

  // Strict, not "not the other one". The earlier `!== 'male'` was permissive
  // to accommodate a third gender value that the profile form no longer
  // offers; with only male/female stored, a bride list that merely excludes
  // males would silently show anything unexpected in the data.
  const females = profiles.filter((p) => p.gender === 'female');
  const males = profiles.filter((p) => p.gender === 'male');

  async function run() {
    setErr(null); setBusy(true); setResult(null);
    try {
      setResult(await api.match({ brideProfileId: brideId, groomProfileId: groomId }, settings.ganita));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Matching needs one of each, which is not the same as needing two profiles:
  // two brides cannot be matched, and saying "you have 2" would be unhelpful.
  if (females.length === 0 || males.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          Matching needs at least one female and one male profile.
          You have {females.length} female and {males.length} male.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2>Kuta matching</h2>
        <div className="row c3">
          <div>
            <label className="f">Bride (vadhu)</label>
            <select value={brideId} onChange={(e) => setBrideId(e.target.value)}>
              <option value="">Select…</option>
              {females.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.janma.nakshatra.name} {p.janma.nakshatra.pada}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="f">Groom (vara)</label>
            <select value={groomId} onChange={(e) => setGroomId(e.target.value)}>
              <option value="">Select…</option>
              {males.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.janma.nakshatra.name} {p.janma.nakshatra.pada}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn primary" disabled={!brideId || !groomId || busy} onClick={run}>
              {busy ? 'Computing…' : 'Match'}
            </button>
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      {result && (
        <>
          <div className="card">
            <div className="grid two">
              <Side title="Bride" p={result.bride} name={result.brideProfile?.name} />
              <Side title="Groom" p={result.groom} name={result.groomProfile?.name} />
            </div>
          </div>

          {result.vetoes.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--bad)' }}>
              <h2 style={{ color: 'var(--bad)' }}>Vetoes</h2>
              {result.vetoes.map((v) => (
                <div className="hl" key={v.name}>
                  <span className="dot bad" />
                  <span><strong>{v.name}</strong> — {v.detail}</span>
                </div>
              ))}
              <p className="muted" style={{ marginBottom: 0 }}>
                These are the factors traditionally treated as disqualifying rather
                than as deductions. They are listed separately because a points
                total cannot express them.
              </p>
            </div>
          )}

          {result.exceptions.length > 0 && (
            <div className="card">
              <h2>Exceptions applied</h2>
              {result.exceptions.map((e, i) => (
                <div className="hl" key={i}>
                  <span className="dot warn" />
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h2>The factors</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Select a row to read what that kuta measures and what its score is
              worth. The four factors showing no points are qualifiers.
            </p>
            {/*
              * `table-layout: fixed` with explicit widths, because the
              * expanded explanation is a colSpan row inside this same table.
              * Under the default auto layout its long text takes part in the
              * column-width calculation, so opening a row widened Detail and
              * shoved every column sideways - and closing it shoved them back.
              * Fixed layout takes the widths from the colgroup alone, so the
              * content of an expanded row cannot move anything.
              */}
            <table className="kuta-table">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '48%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Kuta</th><th className="num">Points</th>
                  <th>Status</th><th>Detail</th><th />
                </tr>
              </thead>
              <tbody>
                {result.factors.map((f) => (
                  <React.Fragment key={f.name}>
                    <tr
                      className={`kuta-row${expanded === f.name ? ' is-open' : ''}`}
                      onClick={() => setExpanded(expanded === f.name ? null : f.name)}
                    >
                      <td><strong>{f.name}</strong></td>
                      <td className="num">
                        {f.max > 0
                          ? `${f.points} / ${f.max}`
                          : <span className="muted" title="A qualifier: carries no points">—</span>}
                      </td>
                      <td><span className={`sev ${f.severity}`}>{f.severity}</span></td>
                      <td className="muted">{f.detail}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn ghost kuta-toggle"
                          aria-expanded={expanded === f.name}
                          aria-label={`What ${f.name} means`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(expanded === f.name ? null : f.name);
                          }}
                        >
                          {expanded === f.name ? '−' : '?'}
                        </button>
                      </td>
                    </tr>
                    {expanded === f.name && (
                      <tr className="kuta-meaning-row">
                        <td colSpan={5}><KutaMeaning meaning={f.meaning} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div className="score-summary">
              <div>
                <span className={`score-total${result.scoreBand ? ` tone-${result.scoreBand.tone}` : ''}`}>
                  {result.points.obtained}<span className="muted"> / {result.points.maximum}</span>
                </span>
                {result.scoreBand && (
                  <span className={`score-band tone-${result.scoreBand.tone}`}>
                    {result.scoreBand.label}
                    {result.scoreBand.sanskrit && (
                      <span className="muted" style={{ fontWeight: 400 }}> · {result.scoreBand.sanskrit}</span>
                    )}
                  </span>
                )}
              </div>
              {result.scoreBand && (
                <p className="muted" style={{ margin: '6px 0 0' }}>{result.scoreBand.meaning}</p>
              )}
            </div>

            <div className="notice" style={{ marginTop: 12 }}>{result.scoreCaveat}</div>

            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>{result.note}</p>
          </div>

          {result.deep
            ? <MatchDetail deep={result.deep}
                brideName={result.brideProfile?.name}
                groomName={result.groomProfile?.name} />
            : result.deepUnavailable && (
              <div className="card">
                <h2>Deeper analysis</h2>
                <p className="muted" style={{ marginBottom: 0 }}>{result.deepUnavailable}</p>
              </div>
            )}
        </>
      )}
    </>
  );
}

function Side({ title, p, name }) {
  return (
    <div>
      <h3>{title}{name ? ` — ${name}` : ''}</h3>
      <dl style={{ margin: 0 }}>
        <div className="kv"><dt>Nakshatra</dt><dd>{p.nakshatra.name} pada {p.nakshatra.pada}</dd></div>
        <div className="kv"><dt>Rashi</dt><dd>{p.rashi.name}</dd></div>
        <div className="kv"><dt>Nadi</dt><dd>{p.nadi}</dd></div>
        <div className="kv"><dt>Gana</dt><dd>{p.gana}</dd></div>
        <div className="kv"><dt>Yoni</dt><dd>{p.yoni}</dd></div>
        <div className="kv"><dt>Rajju</dt><dd>{p.rajju}</dd></div>
      </dl>
    </div>
  );
}
