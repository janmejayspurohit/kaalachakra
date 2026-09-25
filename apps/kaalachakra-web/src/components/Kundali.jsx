import React, { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../settings.jsx';

/**
 * The kundali (birth chart), drawn South Indian style.
 *
 * WHY SOUTH INDIAN AND NOT NORTH INDIAN. In the South Indian chakra the
 * TWELVE RASHIS ARE FIXED in the grid - Meena always top-left, running
 * clockwise - and the lagna is marked wherever it falls. In the North Indian
 * chart the HOUSES are fixed and the rashis move. Both are correct and both
 * are in use; this is a Madhwa / South-Indian Kannada panchanga, so the
 * South Indian chakra is the one its readers expect to see, and it is what
 * Ahoratra draws. A North Indian toggle is offered because a chart is often
 * shared with people who read the other form, and a chart someone cannot read
 * is not a chart.
 *
 * The grid is fixed by convention, not chosen:
 *
 *     Meena   | Mesha     | Vrishabha | Mithuna
 *     Kumbha  |                       | Karka
 *     Makara  |                       | Simha
 *     Dhanu   | Vrischika | Tula      | Kanya
 *
 * Reading clockwise from Mesha gives the signs in order, which is the whole
 * point of the arrangement: the eye follows the zodiac without the diagram
 * having to renumber itself per chart.
 */

/** Grid cell (col, row) for each rashi, 1-indexed by rashi. Fixed by convention. */
const SOUTH_CELLS = {
  12: [0, 0], 1: [1, 0], 2: [2, 0], 3: [3, 0],
  11: [0, 1], 4: [3, 1],
  10: [0, 2], 5: [3, 2],
  9: [0, 3], 8: [1, 3], 7: [2, 3], 6: [3, 3],
};

/**
 * North Indian house polygons, as fractions of the box.
 *
 * The chart is a square with both diagonals and a rotated inner square. House
 * 1 is the top-centre diamond and the houses run ANTICLOCKWISE from it. The
 * rashi in each house is derived from the lagna, which is why the sign
 * numbers move while the houses stay put - the opposite of the South Indian
 * arrangement above.
 */
const NORTH_HOUSES = [
  { house: 1, points: '50,0 75,25 50,50 25,25', label: [50, 22] },
  { house: 2, points: '0,0 50,0 25,25', label: [23, 10] },
  { house: 3, points: '0,0 25,25 0,50', label: [10, 23] },
  { house: 4, points: '0,50 25,25 50,50 25,75', label: [24, 50] },
  { house: 5, points: '0,50 25,75 0,100', label: [10, 77] },
  { house: 6, points: '0,100 25,75 50,100', label: [23, 90] },
  { house: 7, points: '50,100 25,75 50,50 75,75', label: [50, 78] },
  { house: 8, points: '100,100 50,100 75,75', label: [77, 90] },
  { house: 9, points: '100,100 75,75 100,50', label: [90, 77] },
  { house: 10, points: '100,50 75,75 50,50 75,25', label: [76, 50] },
  { house: 11, points: '100,50 75,25 100,0', label: [90, 23] },
  { house: 12, points: '100,0 75,25 50,0', label: [77, 10] },
];

const RASHI_NAMES = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
];

/**
 * Short sign names for the cells - explicit, not `slice(0, 4)`.
 *
 * Truncating to four characters produced "Vris" for BOTH Vrishabha and
 * Vrischika, which are opposite ends of the zodiac and sit in different
 * corners of the grid. Two cells carrying the same label in a diagram whose
 * whole purpose is to say which sign you are looking at is not a cosmetic
 * problem. Cut where the names actually diverge instead.
 */
const RASHI_SHORT = [
  'Mesha', 'Vrisha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischi', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
];

/**
 * Three letters per graha, not two.
 *
 * Two-letter Sanskrit abbreviations collide where it matters most: Su could
 * be Surya or Shukra, Sa could be Shani or Shukra depending on the
 * transliteration, and Ra is Ravi in some conventions and Rahu in others.
 * Three letters remove every collision, and the full name is on hover.
 */
const ABBR = {
  surya: 'Sur', chandra: 'Cha', mangala: 'Man', budha: 'Bud', guru: 'Gur',
  shukra: 'Shu', shani: 'Sha', rahu: 'Rah', ketu: 'Ket',
};

/**
 * Rahu and Ketu are ALWAYS retrograde in the mean-node model, so marking them
 * conveys nothing and makes the genuinely retrograde grahas in
 * a chart harder to pick out. The flag is still in the data and still in the
 * hover text; it is only the glyph that is suppressed.
 */
const ALWAYS_RETROGRADE = new Set(['rahu', 'ketu']);
/**
 * Retrograde is marked "(R)", not with U+211E (PRESCRIPTION TAKE).
 *
 * That character is absent from the sans-serif stack this app uses, so it
 * fell through to whatever the system substituted: it printed as a bare "R"
 * jammed against the graha's name, reading as though the name itself were
 * "Shar". A symbol that depends on a font being present is not a symbol.
 * Parentheses render identically everywhere, are what Indian charts
 * actually print, and cannot be mistaken for part of a name.
 *
 * The tradition's own term is VAKRI, which the hover text gives in full.
 */
const retroMark = (p) => (p.retrograde && !ALWAYS_RETROGRADE.has(p.graha) ? ' (R)' : '');

const FULL = {
  surya: 'Surya (Sun)', chandra: 'Chandra (Moon)', mangala: 'Mangala (Mars)',
  budha: 'Budha (Mercury)', guru: 'Guru (Jupiter)', shukra: 'Shukra (Venus)',
  shani: 'Shani (Saturn)', rahu: 'Rahu', ketu: 'Ketu',
};

/** Which sign sits in each house of a North Indian chart, given the lagna. */
const signInHouse = (house, lagnaRashi) => ((lagnaRashi - 1 + house - 1) % 12) + 1;

export default function Kundali({
  chart, title, varga: initialVarga = 'rashi', style: initialStyle,
  showControls = true, size = 320,
}) {
  const { settings } = useSettings();
  const [varga, setVarga] = useState(initialVarga);

  /**
   * Chart style follows the Tradition setting, and the per-chart toggle
   * overrides it for as long as this chart is on screen.
   *
   * `initialStyle` is deliberately undefined by default rather than 'south',
   * so that "no explicit prop" means "whatever the reader chose in settings"
   * rather than silently pinning every chart to one tradition.
   */
  const [style, setStyle] = useState(initialStyle ?? settings.tradition);
  useEffect(() => {
    if (!initialStyle) setStyle(settings.tradition);
  }, [settings.tradition, initialStyle]);

  /**
   * Group the grahas by the sign they occupy IN THE CHOSEN VARGA.
   *
   * The navamsa is a genuine second chart, not a decoration: the D9 lagna is
   * the navamsa of the ascendant's own longitude, and every graha sits in its
   * navamsa sign. Switching varga therefore has to move the lagna too, which
   * is the part that is easy to forget and makes the D9 silently wrong.
   */
  const { bySign, lagnaRashi } = useMemo(() => {
    const key = varga === 'navamsa' ? 'navamsa' : 'rashi';
    const groups = {};
    for (const p of chart.positions) {
      const sign = p[key];
      (groups[sign] ??= []).push(p);
    }
    return {
      bySign: groups,
      lagnaRashi: varga === 'navamsa' ? chart.lagna.navamsa : chart.lagna.rashi,
    };
  }, [chart, varga]);

  const controls = showControls && (
    <div className="kundali-tools">
      <div className="seg">
        {[['rashi', 'Rashi (D1)'], ['navamsa', 'Navamsa (D9)']].map(([id, label]) => (
          <button key={id} type="button"
            className={`seg-btn${varga === id ? ' is-on' : ''}`}
            aria-pressed={varga === id}
            onClick={() => setVarga(id)}>{label}</button>
        ))}
      </div>
      <div className="seg">
        {[['south', 'South'], ['north', 'North']].map(([id, label]) => (
          <button key={id} type="button"
            className={`seg-btn${style === id ? ' is-on' : ''}`}
            aria-pressed={style === id}
            onClick={() => setStyle(id)}
            title={`${label} Indian chart style`}>{label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="kundali">
      {title && <h3 className="kundali-title">{title}</h3>}
      {controls}
      {style === 'south'
        ? <SouthChart bySign={bySign} lagnaRashi={lagnaRashi} size={size} />
        : <NorthChart bySign={bySign} lagnaRashi={lagnaRashi} size={size} />}
      <p className="kundali-caption muted">
        {varga === 'navamsa' ? 'Navamsa (D9)' : 'Rashi (D1)'} ·{' '}
        {style === 'south' ? 'South Indian' : 'North Indian'} ·{' '}
        lagna in <strong>{RASHI_NAMES[lagnaRashi - 1]}</strong>
        {' · '}(R) marks vakri / retrograde — Rahu and Ketu always are, so are left unmarked
      </p>
    </div>
  );
}

/* ------------------------------------------------------ South Indian */

function SouthChart({ bySign, lagnaRashi, size }) {
  const S = 100;             // viewBox units; the grid is 4x4 cells of 25
  const cell = S / 4;

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="kundali-svg"
      style={{ width: size, maxWidth: '100%' }}
      role="img"
      aria-label={`South Indian kundali, lagna in ${RASHI_NAMES[lagnaRashi - 1]}`}>
      {/* The centre 2x2 is empty by convention - it is where a chart drawn on
          paper carries the name and birth details, not a thirteenth house. */}
      <rect x="0" y="0" width={S} height={S} className="kundali-frame" />
      <rect x={cell} y={cell} width={cell * 2} height={cell * 2} className="kundali-centre" />

      {Object.entries(SOUTH_CELLS).map(([rashiStr, [col, row]]) => {
        const rashi = Number(rashiStr);
        const x = col * cell;
        const y = row * cell;
        const isLagna = rashi === lagnaRashi;
        const house = ((rashi - lagnaRashi + 12) % 12) + 1;
        return (
          <g key={rashi}>
            <rect x={x} y={y} width={cell} height={cell}
              className={`kundali-cell${isLagna ? ' is-lagna' : ''}`} />
            {/*
              * The lagna is marked by the filled cell plus a label at its
              * foot. A corner diagonal is the conventional mark on paper, but
              * drawn here it ran straight through the house number in the
              * same corner - and since the lagna's house number is always 1,
              * a mark that obscures it is trading a fact for a decoration.
              * The fill already identifies the cell on its own.
              */}
            {isLagna && (
              <text x={x + cell / 2} y={y + cell - 2} textAnchor="middle"
                className="kundali-lagna-label">Lagna</text>
            )}
            <text x={x + 1.6} y={y + 4.2} className="kundali-house">{house}</text>
            <text x={x + cell - 1.6} y={y + 4.2} className="kundali-sign"
              textAnchor="end">
              <title>{RASHI_NAMES[rashi - 1]}</title>
              {RASHI_SHORT[rashi - 1]}
            </text>
            <Grahas list={bySign[rashi] ?? []} x={x} y={y} cell={cell} />
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------ North Indian */

function NorthChart({ bySign, lagnaRashi, size }) {
  return (
    <svg viewBox="0 0 100 100" className="kundali-svg"
      style={{ width: size, maxWidth: '100%' }}
      role="img"
      aria-label={`North Indian kundali, lagna in ${RASHI_NAMES[lagnaRashi - 1]}`}>
      <rect x="0" y="0" width="100" height="100" className="kundali-frame" />
      {NORTH_HOUSES.map((h) => {
        const rashi = signInHouse(h.house, lagnaRashi);
        const list = bySign[rashi] ?? [];
        const [lx, ly] = h.label;
        return (
          <g key={h.house}>
            <polygon points={h.points} className="kundali-cell" />
            {/* In this style the SIGN NUMBER is written in the house, which is
                how a reader knows which rashi they are looking at. */}
            <text x={lx} y={ly} className="kundali-house" textAnchor="middle">{rashi}</text>
            <NorthGrahas list={list} cx={lx} cy={ly} />
          </g>
        );
      })}
    </svg>
  );
}

function NorthGrahas({ list, cx, cy }) {
  return list.map((p, i) => (
    <text key={p.graha} x={cx} y={cy + 4.6 + i * 4.2}
      className={`kundali-graha nature-${p.nature}`} textAnchor="middle">
      <title>{`${FULL[p.graha]} — ${p.rashiName} ${p.degreeInRashi.toFixed(2)}°, house ${p.house}${p.dignity ? `, ${p.dignity}` : ''}${p.retrograde ? ', vakri (retrograde)' : ''}`}</title>
      {ABBR[p.graha]}{retroMark(p)}
    </text>
  ));
}

/**
 * Grahas inside one South Indian cell.
 *
 * Laid out in up to two columns. A cell is 25 units square and can hold all
 * nine grahas in the worst case (a stellium, or every graha between Rahu and
 * Ketu); one column would overflow the box and one column of nine would be
 * unreadable, so the list splits once it passes four.
 */
function Grahas({ list, x, y, cell }) {
  if (list.length === 0) return null;
  const twoCols = list.length > 4;
  const perCol = twoCols ? Math.ceil(list.length / 2) : list.length;
  const lineH = Math.min(4.4, (cell - 7) / perCol);

  return list.map((p, i) => {
    const col = twoCols && i >= perCol ? 1 : 0;
    const row = twoCols ? i % perCol : i;
    return (
      <text
        key={p.graha}
        x={x + (twoCols ? 2 + col * (cell / 2 - 1) : cell / 2)}
        y={y + 8.5 + row * lineH}
        textAnchor={twoCols ? 'start' : 'middle'}
        className={`kundali-graha nature-${p.nature}${p.dignity ? ` dignity-${p.dignity}` : ''}`}
      >
        <title>{`${FULL[p.graha]} — ${p.rashiName} ${p.degreeInRashi.toFixed(2)}°, house ${p.house}${p.dignity ? `, ${p.dignity}` : ''}${p.retrograde ? ', vakri (retrograde)' : ''}`}</title>
        {ABBR[p.graha]}{retroMark(p)}
      </text>
    );
  });
}

export { ABBR as GRAHA_ABBR, FULL as GRAHA_NAMES };
