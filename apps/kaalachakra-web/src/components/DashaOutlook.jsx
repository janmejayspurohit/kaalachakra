import React from 'react';
import { useSettings } from '../settings.jsx';
import { dashaTerm } from '../dasha-terms.js';

/**
 * What one mahadasha means for one person.
 *
 * Two kinds of statement, kept visually apart because they have different
 * standing. The SIGNIFICATIONS are classical and the same for everybody - a
 * Shani period is about time, labour and consequence whoever is living it.
 * IN THIS CHART is computed from the person's own positions and is what
 * decides how those significations land: Shani is a natural malefic, but for
 * a Tula lagna it is the yogakaraka, and the same nineteen years read
 * completely differently.
 *
 * Collapsing the two into one verdict is what most dasha material does, and
 * it is why the results read as fortune-telling. There is deliberately no
 * good/bad score here.
 */

const NATURE_LABEL = {
  yogakaraka: 'yogakaraka — the most auspicious graha for this lagna',
  benefic: 'functional benefic for this lagna',
  malefic: 'functional malefic for this lagna',
  mixed: 'mixed — its two lordships pull opposite ways',
  neutral: 'functionally neutral for this lagna',
  'takes-on': 'no lordship of its own — takes the results of its dispositor and house',
};

const NATURE_TONE = {
  yogakaraka: 'ok', benefic: 'ok', malefic: 'warn',
  mixed: 'warn', neutral: '', 'takes-on': '',
};

function List({ title, items, tone }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="outlook-block">
      <h4 className={tone ? `is-${tone}` : undefined}>{title}</h4>
      <ul className="tight">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}

export default function DashaOutlook({ outlook, period, fmtDate }) {
  const { settings } = useSettings();
  if (!outlook) return null;
  const c = outlook.inThisChart;
  const p = c.placement;

  return (
    <div className="outlook">
      <div className="outlook-head">
        <div>
          <h3 style={{ margin: 0, textTransform: 'capitalize' }}>
            {outlook.graha} {dashaTerm(1, settings.tradition).toLowerCase()}
          </h3>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {outlook.theme} · {outlook.years} years
            {period && fmtDate && <> · {fmtDate(period.startJd)} – {fmtDate(period.endJd)}</>}
          </p>
        </div>
        <span className={`sev ${NATURE_TONE[c.functional.nature] || ''}`}>
          {c.functional.nature}
        </span>
      </div>

      <p>{outlook.signifies}</p>

      {/* The chart-specific half comes FIRST, because it is the half that is
          about this person; the classical significations below are context. */}
      <div className="card inset">
        <h4>In this chart</h4>
        <p style={{ marginTop: 0 }}>{c.summary}</p>
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>Placement</dt>
            <dd>
              {p.rashiName} {p.degreeInRashi.toFixed(2)}°, house {p.house}
              {p.dignity ? ` · ${p.dignity}` : ''}
              {p.retrograde ? ' · vakri' : ''}
              {' · navamsa '}{p.navamsaName}
            </dd>
          </div>
          <div className="kv">
            <dt>Functional nature</dt>
            <dd>{NATURE_LABEL[c.functional.nature] ?? c.functional.nature}</dd>
          </div>
          {c.functional.lordships.length > 0 && (
            <div className="kv">
              <dt>Lords houses</dt>
              <dd>{c.functional.lordships.join(', ')}</dd>
            </div>
          )}
        </dl>

        {c.functional.reasons.length > 0 && (
          <ul className="tight" style={{ marginTop: 10 }}>
            {c.functional.reasons.map((r, i) => <li key={i} className="muted">{r}</li>)}
          </ul>
        )}

        <List title="Strengths" items={c.strengths} tone="ok" />
        <List title="Weaknesses" items={c.weaknesses} tone="warn" />

        {c.functional.caveat && (
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>{c.functional.caveat}</p>
        )}
      </div>

      <div className="outlook-cols">
        <List title="Favourable for" items={outlook.favourable} tone="ok" />
        <List title="Runs against" items={outlook.unfavourable} tone="warn" />
        <List title="Counselled against" items={outlook.avoid} tone="bad" />
        <List title="Has scope to bring" items={outlook.scope} />
      </div>

      <p className="muted" style={{ fontSize: 12 }}>{outlook.duration}</p>
      <div className="notice is-plain">{outlook.disclaimer}</div>
    </div>
  );
}
