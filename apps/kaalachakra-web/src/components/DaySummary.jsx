import React, { useState } from 'react';

/**
 * Per-profile highlights for the selected day.
 *
 * Rendered ONLY when at least one profile exists. The API returns
 * `hasProfiles` explicitly so an empty list can be distinguished from a
 * still-loading one - showing an empty summary box would imply "nothing
 * notable today" when the truth is "nobody to compute it for".
 */
/**
 * Sentinel for "the reader collapsed it on purpose", which is a different
 * state from "nothing has been chosen yet". Without the distinction, either
 * a deliberate collapse springs back open or a stale selection stays shut.
 */
const COLLAPSED = Symbol('collapsed');

export default function DaySummary({ summaries }) {
  /**
   * Which panel is open, DERIVED rather than stored outright.
   *
   * It used to be seeded by `useState(summaries[0]?.profile.id)`, which runs
   * once, on mount. Switching the profile in the panchanga header replaces
   * `summaries` with a different person, so the stored id no longer matched
   * anything and the box collapsed itself - the reader had selected a
   * profile and the one thing they had asked to see folded away.
   *
   * So the state holds the reader's CHOICE, and what is open is worked out
   * from it each render: an explicit collapse is honoured, a choice that is
   * still on screen is honoured, and anything else (first render, or a
   * choice that has scrolled out of existence) falls back to the first
   * summary. Open is the default, because the box exists to be read.
   */
  const [choice, setChoice] = useState(null);

  const first = summaries[0]?.profile.id ?? null;
  const openId =
    choice === COLLAPSED ? null
      : (choice !== null && summaries.some((s) => s.profile.id === choice)) ? choice
        : first;

  return (
    <div className="card">
      <h2>Day summary</h2>
      {summaries.map((s) => {
        const open = openId === s.profile.id;
        return (
          <div key={s.profile.id} style={{ marginBottom: 14 }}>
            <button
              className="btn ghost"
              onClick={() => setChoice(open ? COLLAPSED : s.profile.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                justifyContent: 'space-between', textAlign: 'left',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <strong>{s.profile.name}</strong>
                <span className={`sev ${s.severity}`}>{s.severity}</span>
              </span>
              <span className="muted mono">{s.dasha.label}</span>
            </button>

            {open && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ marginBottom: 8 }}>
                  Janma {s.janma.nakshatra.name} pada {s.janma.nakshatra.pada} · {s.janma.rashi.name}
                  {' · '}balance at birth {s.dasha.balanceAtBirth.lord} {s.dasha.balanceAtBirth.formatted}
                </div>

                {s.highlights.map((h, i) => (
                  <div className="hl" key={i}>
                    <span className={`dot ${h.severity}`} />
                    <span>{h.text}</span>
                  </div>
                ))}

                <Remedies remedies={s.remedies} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function List({ title, block, tone }) {
  if (!block.items.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ color: tone }}>{title}</h3>
      <p className="muted" style={{ marginTop: 0 }}>{block.disclaimer}</p>
      <table>
        <tbody>
          {block.items.map((r) => (
            <tr key={r.id}>
              <td className="num" style={{ width: 28 }}>{r.rank}</td>
              <td>
                <strong>{r.name}</strong>
                {r.kannada && <span className="kn" style={{ marginLeft: 8, color: 'var(--accent)' }}>{r.kannada}</span>}
                {r.needsReview && <span className="pill" style={{ marginLeft: 8 }}>needs review</span>}
                <div className="muted">{r.practice}</div>
                {r.firedFor.length > 0 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    for: {r.firedFor.join(', ')}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Remedies({ remedies }) {
  return (
    <>
      <List title="Parihara" block={remedies.parihara} tone="var(--ok)" />
      {/* Kept visually distinct and second: these are graha-directed or not
          specifically attested in the Madhwa sampradaya, so they are shown as
          suggestions rather than as parihara. */}
      <List title="Suggestions" block={remedies.suggestions} tone="var(--text-dim)" />
    </>
  );
}
