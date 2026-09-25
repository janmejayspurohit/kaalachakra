/**
 * Build the offline map asset.
 *
 * Extracts India's state outlines and a light context ring of neighbouring
 * coastlines from Natural Earth (public domain, no attribution required),
 * simplifies them, and quantises coordinates.
 *
 * Run once; the output is what ships. Natural Earth's 1:10m admin-1 file is
 * 41 MB, which is obviously not shippable - simplification is the whole point.
 *
 * Usage: node scripts/build-map.mjs <dataDir> <outFile>
 */
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [, , dataDir = '.', outFile = 'src/mapdata.json'] = process.argv;

/**
 * Ramer-Douglas-Peucker. Keeps the shape's character while dropping the
 * points a 400px-wide map can never resolve.
 */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay;
  const segLen = Math.hypot(dx, dy);

  // DEGENERATE SEGMENT. A closed ring starts and ends on the same point, so
  // the "line" A->B has zero length and the perpendicular-distance formula
  // evaluates to 0 for EVERY vertex - RDP then decides the whole ring is
  // within tolerance and collapses it to two points. That silently produced
  // an empty map. Fall back to radial distance from A in that case.
  const distance = segLen < 1e-12
    ? ([px, py]) => Math.hypot(px - ax, py - ay)
    : ([px, py]) => Math.abs(dy * px - dx * py + bx * ay - by * ax) / segLen;

  let maxDist = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distance(points[i]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

/** Quantise to 3dp (~110 m). 2dp visibly faceted small states once zoom was added. */
const q = (n) => Math.round(n * 1000) / 1000;

function ringsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}

/** Extent of a ring in degrees - used to scale the tolerance to the feature. */
function extentOf(ring) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

/**
 * ADAPTIVE TOLERANCE.
 *
 * A single tolerance erased the small territories entirely: Chandigarh and
 * Lakshadweep both simplified below the minimum ring size and were dropped,
 * so the map was missing two of India's 36 units. Scaling the tolerance to
 * each ring's own extent keeps a 0.1-degree island as detailed, relative to
 * itself, as a 10-degree state.
 */
function processFeature(f, tolerance, minPoints) {
  const out = [];
  for (const ring of ringsOf(f.geometry)) {
    const extent = extentOf(ring);
    // Never coarser than `tolerance`, and never coarser than 1/120th of the
    // feature's own size.
    const tol = Math.min(tolerance, extent / 120);
    const simplified = simplify(ring, tol).map(([x, y]) => [q(x), q(y)]);
    if (simplified.length >= minPoints) out.push(simplified);
  }
  return out;
}

const admin0 = JSON.parse(readFileSync(resolve(dataDir, 'ne_110m_admin_0_countries.geojson'), 'utf8'));
const admin1 = JSON.parse(readFileSync(resolve(dataDir, 'ne_10m_admin_1_states_provinces_lakes.geojson'), 'utf8'));

/**
 * JAMMU & KASHMIR.
 *
 * Natural Earth draws J&K at the Line of Control, so the areas India claims
 * but does not administer are filed under Pakistan and China and the state
 * renders truncated. These units are therefore pulled in and drawn as part of
 * India, which is how the boundary is depicted in India.
 *
 * KNOWN GAP, stated rather than hidden: AKSAI CHIN is not a separate admin-1
 * unit in this dataset - it is folded into China's Xinjiang polygon and
 * cannot be split out without a different source. So the western claim line
 * is complete here and the north-eastern one is not. Fixing it needs an
 * India-published boundary file (e.g. Survey of India) in place of Natural
 * Earth for this region.
 */
const JK_CLAIMED = new Set(['Northern Areas', 'Azad Kashmir', 'Kashmir']);

// India's states, at a tolerance fine enough to keep each state recognisable.
const states = [];
for (const f of admin1.features) {
  const p = f.properties;
  const isIndia = p.adm0_a3 === 'IND' || p.iso_a2 === 'IN';
  const isClaimed = JK_CLAIMED.has(p.name);
  if (!isIndia && !isClaimed) continue;
  const rings = processFeature(f, 0.05, 4);
  if (rings.length) {
    states.push({
      name: p.name ?? p.gn_name ?? '',
      rings,
      ...(isClaimed ? { claimed: true } : {}),
    });
  } else {
    console.warn(`  dropped (no rings survived): ${p.name}`);
  }
}

// Neighbouring landmasses, drawn faintly so India is not floating in a void.
const NEIGHBOURS = new Set(['PAK', 'CHN', 'NPL', 'BTN', 'BGD', 'MMR', 'LKA', 'AFG']);
const context = [];
for (const f of admin0.features) {
  const a3 = f.properties.ADM0_A3 ?? f.properties.adm0_a3;
  if (!NEIGHBOURS.has(a3)) continue;
  const rings = processFeature(f, 0.2, 4);
  if (rings.length) context.push({ name: f.properties.NAME ?? a3, rings });
}

// Bounding box of INDIA ONLY, plus a small margin.
//
// Including the neighbours would stretch the frame to 135E (China's east
// coast) and render India as a thumbnail. The neighbours are drawn as faint
// context and simply clip at the edge of the frame, which is what you want.
let minX = 180, minY = 90, maxX = -180, maxY = -90;
for (const s of states) {
  for (const r of s.rings) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}

/**
 * AKSAI CHIN.
 *
 * Not present in any admin-1 dataset available here - Natural Earth folds it
 * into China's Xinjiang polygon, so it cannot be extracted the way Gilgit-
 * Baltistan and Azad Kashmir were. It is therefore HAND-DIGITISED below and
 * drawn as Indian territory.
 *
 * HONEST LIMITS OF THIS POLYGON, because it is the only part of this map not
 * derived from a published dataset:
 *   - The WESTERN/SOUTHERN edge is exact: it reuses Ladakh's own Natural Earth
 *     vertices along the Line of Actual Control, so the two shapes share an
 *     edge and there is no seam.
 *   - The NORTHERN/EASTERN edge is APPROXIMATE - a coarse trace of India's
 *     claim line along the Kunlun range, accurate to a few tens of kilometres,
 *     not survey grade.
 * For anything requiring an authoritative boundary, replace this with a
 * Survey of India published file. It is fine for locating a birthplace pin;
 * it is not a reference for where the border runs.
 */
const AKSAI_CHIN_CLAIM_LINE = [
  [77.80, 35.50],  // near the Karakoram Pass, meeting Ladakh's arc
  [78.30, 35.90],
  [79.00, 36.00],
  [79.80, 35.70],
  [80.35, 35.30],
  [80.25, 34.70],
  [79.70, 34.20],
  [79.46, 33.25],  // rejoins Ladakh's arc
];

/** Ladakh's own LAC vertices, so the shared edge is identical on both shapes. */
function ladakhLacArc(states) {
  const lad = states.find((s) => s.name === 'Ladakh');
  if (!lad) return null;
  const ring = lad.rings[0];
  // Indices 0..11 run from the Karakoram Pass down the LAC to 79.456,33.25.
  return ring.slice(0, 12);
}

function buildAksaiChin(states) {
  const arc = ladakhLacArc(states);
  if (!arc) return null;
  // Ladakh's arc south-east, then India's claim line back north-west.
  const ring = [...arc, ...AKSAI_CHIN_CLAIM_LINE.slice().reverse()];
  return {
    name: 'Aksai Chin',
    rings: [ring.map(([x, y]) => [q(x), q(y)])],
    claimed: true,
    approximate: true,
  };
}

/**
 * City labels, pulled from the gazetteer that already ships with the API.
 *
 * Carrying `pop` lets the viewer reveal labels progressively as you zoom -
 * metros first, then district towns - instead of dumping 2,000 labels on a
 * 400px map at zoom 1, which would be unreadable.
 */
const GAZETTEER = resolve(dataDir, '..', '..', '..', 'packages', 'places', 'data', 'gazetteer.db');
let cities = [];
const gazPath = existsSync(GAZETTEER)
  ? GAZETTEER
  : resolve(process.cwd(), '../../packages/places/data/gazetteer.db');
if (existsSync(gazPath)) {
  const db = new DatabaseSync(gazPath, { readOnly: true });
  cities = db.prepare(
    `SELECT name, latitude AS lat, longitude AS lon, population AS pop
       FROM places
      WHERE country = 'IN' AND population >= 20000
      ORDER BY population DESC
      LIMIT 2000`
  ).all().map((c) => ({
    n: c.name,
    x: Math.round(c.lon * 1000) / 1000,
    y: Math.round(c.lat * 1000) / 1000,
    p: c.pop,
  }));
  db.close();
  console.log(`cities  : ${cities.length} (from gazetteer)`);
} else {
  console.warn('cities  : gazetteer not found, shipping map without labels');
}

const aksai = buildAksaiChin(states);
if (aksai) {
  states.push(aksai);
  console.log('aksai   : added (hand-digitised, approximate claim line)');
} else {
  console.warn('aksai   : NOT added - Ladakh arc unavailable');
}

const margin = 1.2; // degrees of breathing room around the country
const data = {
  bbox: [minX - margin, minY - margin, maxX + margin, maxY + margin],
  states,
  context,
  cities,
  source: 'Natural Earth (public domain) + GeoNames (CC BY 4.0)',
};
writeFileSync(outFile, JSON.stringify(data));

const pts = (arr) => arr.reduce((n, s) => n + s.rings.reduce((m, r) => m + r.length, 0), 0);
console.log(`states  : ${states.length} (${pts(states)} points)`);
console.log(`context : ${context.length} (${pts(context)} points)`);
console.log(`bbox    : ${data.bbox.map((v) => v.toFixed(2)).join(', ')}`);
console.log(`file    : ${outFile}  ${(statSync(outFile).size / 1024).toFixed(1)} KB`);
