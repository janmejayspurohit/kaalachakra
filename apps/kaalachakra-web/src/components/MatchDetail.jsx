import React, { useState } from 'react';
import Kundali from './Kundali.jsx';

/**
 * The deep-analysis sections of a match, below the twelve kutas.
 *
 * Kept in its own file because it renders a different KIND of claim from the
 * kuta table. A kuta score is arithmetic two astrologers cannot disagree
 * about; Mangala dosha and the pariharas are rules the schools genuinely
 * differ on. Every block here therefore shows its provenance - which
 * reference the reading was counted from, whether the sources agree, and
 * whether a cancellation was extrapolated rather than stated. The engine
 * returns those flags; this component's job is to not hide them.
 */

/**
 * How settled a rule is, and - when it is not - why.
 *
 * The badge used to read a bare "schools agree" with the explanation hidden in
 * a `title` attribute, which is invisible on touch and easy to miss anywhere
 * else. Someone reading this page should not have to ask what it means, so the
 * reason is printed rather than hovered.
 */
function Agreement({ value, reasons }) {
  if (!value) return null;
  const settled = value === 'settled';
  return (
    <span className={`sev ${settled ? 'ok' : 'warn'}`}>
      {settled ? 'all schools agree' : 'schools differ'}
    </span>
  );
}

function AgreementNote({ value, reasons = [] }) {
  if (value === 'settled') {
    return (
      <p className="muted agreement-note">
        Every classical authority reads this the same way, so there is only one
        reading to show.
      </p>
    );
  }
  return (
    <p className="muted agreement-note">
      The authorities differ here
      {reasons.length > 0 ? <>: {reasons.join('; ')}</> : null}
      . Both readings are shown below rather than one being chosen.
    </p>
  );
}

/**
 * What the two badges mean, stated once at the top.
 *
 * Without it the distinction the whole section is built on - computed fact
 * versus contested rule - is invisible, and a reader has no way to tell that
 * "schools differ" is a statement about the SOURCES rather than about the
 * couple.
 */
function AgreementLegend() {
  return (
    <div className="card">
      <h2>Reading this section</h2>
      <p style={{ marginTop: 0 }}>
        The twelve kutas above are arithmetic: any astrologer given the same two
        nakshatras computes the same total. What follows is not like that.
        Mangala dosha, its cancellations and the weighting of malefics are
        places where the classical compilations and the regional traditions
        genuinely disagree — on which houses count, which point they are
        counted from, and which exemptions apply.
      </p>
      <p>
        So each block says which kind of claim it is making:
      </p>
      <ul className="tight">
        <li>
          <span className="sev ok">all schools agree</span>{' '}
          — the rule is uncontested. Any authority would read it this way.
        </li>
        <li>
          <span className="sev warn">schools differ</span>{' '}
          — the authorities diverge, so <strong>both</strong> readings are
          given. This says something about the sources, not about the couple:
          it is not a warning, it is a refusal to pick a side silently.
        </li>
      </ul>
      <p className="muted" style={{ marginBottom: 0 }}>
        Positions — where each graha sits, which house it falls in — are
        computed and not in dispute. Only the rules applied to them are.
      </p>
    </div>
  );
}

/** Expandable explanation under a kuta row. */
export function KutaMeaning({ meaning }) {
  if (!meaning) return null;
  return (
    <div className="kuta-meaning">
      <p className="kuta-meaning-title">{meaning.title}</p>
      <dl style={{ margin: 0 }}>
        <div className="kv"><dt>Signifies</dt><dd>{meaning.signifies}</dd></div>
        <div className="kv"><dt>Weight</dt><dd>{meaning.weight}</dd></div>
        <div className="kv"><dt>A low score</dt><dd>{meaning.onShortfall}</dd></div>
      </dl>
      {meaning.qualifier && (
        <div className="notice" style={{ marginTop: 8 }}>
          This is a qualifier, not a scored factor. It carries no points, so it
          cannot move the total in either direction — which is exactly why the
          total alone is an incomplete reading.
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- mangala */

function MangalaSide({ label, d }) {
  return (
    <div className="mangala-side">
      <h3>{label}</h3>
      <p style={{ marginTop: 0 }}>
        Mangala in <strong>{d.mangala.rashiName}</strong>{' '}
        <span className="mono">{d.mangala.degreeInRashi.toFixed(2)}°</span>
        {d.mangala.dignity && <> · <span className="pill">{d.mangala.dignity}</span></>}
        {d.mangala.retrograde && <> · <span className="pill">retrograde</span></>}
        <br />
        <span className="muted">navamsa {d.mangala.navamsaName}</span>
      </p>

      <table>
        <thead>
          <tr><th>Counted from</th><th className="num">House</th><th>Reading</th></tr>
        </thead>
        <tbody>
          {d.readings.map((r) => (
            <tr key={r.reference}>
              <td style={{ textTransform: 'capitalize' }}>{r.reference}</td>
              <td className="num">{r.house}</td>
              <td>
                {r.exempt ? (
                  <>
                    <span className="sev ok">exempt</span>{' '}
                    <span className="muted">{r.exemptionReason}</span>
                    {r.extrapolated && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Extrapolated — the sources state this parihara for the
                        lagna reckoning, not this one.
                      </div>
                    )}
                  </>
                ) : r.afflicts ? (
                  <>
                    <span className={`sev ${r.contested ? 'warn' : 'error'}`}>
                      {r.contested ? 'afflicts (contested)' : 'afflicts'}
                    </span>
                    {r.contested && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        The 2nd house is counted by South Indian practice and
                        excluded by a minority.
                      </div>
                    )}
                    {r.exemptOnlyInSomeVersions && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Some parihara lists exempt this placement; the narrower
                        reading has been taken.
                      </div>
                    )}
                  </>
                ) : (
                  <span className="sev ok">no dosha</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.mitigations.length > 0 && (
        <>
          <h4>Mitigations</h4>
          <ul className="tight">
            {d.mitigations.map((m, i) => (
              <li key={i}>
                <strong>{m.rule}</strong> — {m.effect}
                {m.extrapolated && <span className="muted"> (extrapolated)</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Mangala({ m }) {
  const c = m.comparison;
  // `samya` (both carry it, so it cancels) and `absent` are favourable
  // findings; only the one-sided case is the one to weigh pariharas against.
  const tone = c.status === 'one-sided' ? 'is-warn' : 'is-ok';
  return (
    <div className="card">
      <h2>Mangala dosha <Agreement value={c.agreement} /></h2>
      <AgreementNote value={c.agreement} reasons={c.agreementReasons} />

      <div className={`notice ${tone}`} style={{ marginTop: 0 }}>
        {c.statement}
      </div>

      {c.uttaradiMath && (
        <div className={`notice ${c.uttaradiMath.status === 'one-sided' ? 'is-warn' : 'is-ok'}`}>
          <strong>Sri Uttaradi Math&apos;s rule:</strong> {c.uttaradiMath.statement}
          {[['Bride', m.bride.uttaradiMath], ['Groom', m.groom.uttaradiMath]].map(([who, u]) => u?.afflicts && (
            <div key={who} style={{ marginTop: 6, fontSize: 13 }}>
              {who}: Mangala in the {u.house}th from the lagna.{' '}
              {u.pariharas.filter((x) => x.holds).map((x) => `Parihara ${x.number}: ${x.rule}${x.note ? ` (${x.note})` : ''}`).join('; ') || 'No parihara holds.'}
              {u.needsJudgment && ' A strong Guru or Shukra in the 1st or 7th would also cancel it - for an astrologer to judge.'}
            </div>
          ))}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{c.uttaradiMath.authority}</div>
        </div>
      )}

      {c.excludingSecondHouse.status !== c.status && (
        <p className="muted">
          Excluding the 2nd house, this reads as{' '}
          <strong>{c.excludingSecondHouse.status}</strong> instead. The two
          readings differ, so both are shown rather than one being chosen.
        </p>
      )}

      <div className="grid two">
        <MangalaSide label="Bride" d={m.bride} />
        <MangalaSide label="Groom" d={m.groom} />
      </div>

      {[...new Set([...m.bride.notes, ...m.groom.notes])].map((n, i) => (
        <p key={i} className="muted" style={{ fontSize: 13 }}>{n}</p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- papa samya */

function PapaSamya({ p }) {
  const c = p.comparison;
  return (
    <div className="card">
      <h2>Papa samya — balance of malefics <Agreement value={c.agreement} /></h2>
      <AgreementNote
        value={c.agreement}
        reasons={['the published papa-point tables disagree on how to weight each graha, so counts are given instead of a weighted total']}
      />
      <div className={`notice ${c.balanced ? 'is-ok' : 'is-warn'}`} style={{ marginTop: 0 }}>
        {c.statement}
      </div>

      <div className="grid two">
        {[['Bride', p.bride], ['Groom', p.groom]].map(([label, load]) => (
          <div key={label}>
            <h3>{label} — {load.total} placement{load.total === 1 ? '' : 's'}</h3>
            <table>
              <thead><tr><th>From</th><th className="num">Count</th><th>Grahas</th></tr></thead>
              <tbody>
                {Object.entries(load.byReference).map(([ref, r]) => (
                  <tr key={ref}>
                    <td style={{ textTransform: 'capitalize' }}>{ref}</td>
                    <td className="num">{r.count}</td>
                    <td className="muted">
                      {r.grahas.length === 0
                        ? '—'
                        : r.grahas.map((g) => `${g.graha} (${g.house})`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p className="muted" style={{ marginBottom: 0 }}>
        Counting the papa grahas (Surya, Mangala, Shani, Rahu, Ketu) in houses{' '}
        {p.bride.houses.join(', ')} from each reference. {c.caveat}
      </p>
    </div>
  );
}

/* ------------------------------------------------------- 7th house */

function SeventhSide({ label, h }) {
  return (
    <div>
      <h3>{label} — {h.rashiName} ({h.quality})</h3>
      <dl style={{ margin: 0 }}>
        <div className="kv">
          <dt>7th lord</dt>
          <dd>
            {h.lord.graha} in {h.lord.rashiName}, house {h.lord.house}
            {h.lord.dignity ? ` · ${h.lord.dignity}` : ''}
            {h.lord.retrograde ? ' · retrograde' : ''}
          </dd>
        </div>
        <div className="kv">
          <dt>Occupants</dt>
          <dd>{h.occupants.length === 0 ? 'none' : h.occupants.map((o) => o.graha).join(', ')}</dd>
        </div>
        <div className="kv">
          <dt>Aspects</dt>
          <dd>
            {h.aspects.length === 0 ? 'none' : h.aspects.map((a) => a.graha).join(', ')}
            {' '}<span className="muted">({h.maleficAspects} malefic, {h.beneficAspects} benefic)</span>
          </dd>
        </div>
        <div className="kv">
          <dt>7th in navamsa</dt>
          <dd>
            {h.navamsa.rashiName}
            {h.navamsa.occupants.length > 0 &&
              ` — ${h.navamsa.occupants.map((o) => o.graha).join(', ')}`}
          </dd>
        </div>
        <div className="kv">
          <dt>Shukra</dt>
          <dd>{h.karakas.shukra.rashiName}, house {h.karakas.shukra.house}
            {h.karakas.shukra.dignity ? ` · ${h.karakas.shukra.dignity}` : ''}</dd>
        </div>
        <div className="kv">
          <dt>Guru</dt>
          <dd>{h.karakas.guru.rashiName}, house {h.karakas.guru.house}
            {h.karakas.guru.dignity ? ` · ${h.karakas.guru.dignity}` : ''}</dd>
        </div>
      </dl>
    </div>
  );
}

function SeventhHouse({ s }) {
  return (
    <div className="card">
      <h2>The 7th bhava — the house of marriage</h2>
      <div className="grid two">
        <SeventhSide label="Bride" h={s.bride} />
        <SeventhSide label="Groom" h={s.groom} />
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        {s.bride.navamsa.note} {s.bride.karakas.note}
      </p>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        {s.bride.drishtiConvention}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- charts */

function Charts({ c, brideName, groomName }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <h2>Kundali</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Bride lagna <strong>{c.bride.lagna.rashiName}</strong>{' '}
        <span className="mono">{(c.bride.lagna.longitude % 30).toFixed(2)}°</span>
        {' · '}
        Groom lagna <strong>{c.groom.lagna.rashiName}</strong>{' '}
        <span className="mono">{(c.groom.lagna.longitude % 30).toFixed(2)}°</span>
      </p>

      <div className="kundali-pair">
        <Kundali chart={c.bride} title={`Bride${brideName ? ` — ${brideName}` : ''}`} />
        <Kundali chart={c.groom} title={`Groom${groomName ? ` — ${groomName}` : ''}`} />
      </div>

      <h3 style={{ marginTop: 20 }}>
        Positions
        <button type="button" className="btn ghost" style={{ float: 'right' }}
          onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show table'}
        </button>
      </h3>
      {open && (
        <div className="grid two">
          {[['Bride', c.bride], ['Groom', c.groom]].map(([label, chart]) => (
            <div key={label}>
              <h3>{label}</h3>
              <table>
                <thead><tr><th>Graha</th><th>Rashi</th><th className="num">House</th><th>Navamsa</th></tr></thead>
                <tbody>
                  {chart.positions.map((p) => (
                    <tr key={p.graha}>
                      <td>
                        {p.graha}
                        {p.retrograde && <span className="muted"> ℞</span>}
                      </td>
                      <td>
                        {p.rashiName}
                        {p.dignity && <span className="muted"> · {p.dignity}</span>}
                      </td>
                      <td className="num">{p.house}</td>
                      <td className="muted">{p.navamsaName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MatchDetail({ deep, brideName, groomName }) {
  if (!deep) return null;
  return (
    <>
      <Charts c={deep.charts} brideName={brideName} groomName={groomName} />
      <AgreementLegend />
      <Mangala m={deep.mangala} />
      <PapaSamya p={deep.papaSamya} />
      <SeventhHouse s={deep.seventhHouse} />
      <div className="notice is-plain">{deep.disclaimer}</div>
    </>
  );
}
