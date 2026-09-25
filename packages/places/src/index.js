/**
 * @kaalachakra/places - offline place resolution.
 *
 * Everything a chart needs about a place - latitude, longitude, elevation and
 * the IANA timezone - comes out of a local SQLite gazetteer. No network call,
 * no API key, no rate limit, and casting a chart works on a plane.
 *
 * sudhyk's Ahoratra makes three Google Maps calls per lookup (Geocoding ->
 * Time Zone -> Elevation) and then has to special-case Asia/Kolkata because
 * Google sometimes reports DST for India. We resolve the zone from GeoNames
 * and the offset from Node's built-in IANA tzdata, which is authoritative, so
 * no such workaround exists here.
 *
 * Spatial search uses SQLite's R*Tree (compiled into Node's SQLite), which is
 * the closest built-in equivalent to PostGIS for this workload.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB = join(here, '..', 'data', 'gazetteer.db');

const EARTH_RADIUS_KM = 6371.0088; // mean radius (IUGG)

export class Gazetteer {
  #db;

  constructor(dbPath = DEFAULT_DB) {
    if (!existsSync(dbPath)) {
      throw new Error(
        `gazetteer not found at ${dbPath}. ` +
          `Build it with: node packages/places/scripts/build-gazetteer.mjs <dataDir> <out.db>`
      );
    }
    this.#db = new DatabaseSync(dbPath, { readOnly: true });
  }

  close() { this.#db.close(); }

  /** Row counts, for a health endpoint. */
  stats() {
    const r = this.#db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN country='IN' THEN 1 ELSE 0 END) AS india,
              COUNT(DISTINCT timezone) AS zones
         FROM places`
    ).get();
    return { total: r.total, india: r.india, timezones: r.zones };
  }

  /**
   * Search by name.
   *
   * Ranked by population, because when someone types "Bangalore" they mean the
   * city of 8 million, not the hamlet of 400. Exact matches on the ascii name
   * are promoted above prefix matches.
   *
   * `country` defaults to 'IN' - this project is India-first, and without the
   * filter every Indian query competes with 30k world cities.
   */
  search(query, { limit = 20, country = 'IN', anyCountry = false } = {}) {
    const q = String(query ?? '').trim();
    if (q.length < 2) return [];

    // FTS5 needs its own escaping; a bare apostrophe or hyphen is a syntax
    // error inside MATCH. Quote the term and double any embedded quotes.
    const ftsTerm = `"${q.replace(/"/g, '""')}"*`;

    const where = anyCountry ? '' : 'AND p.country = ?';
    const params = anyCountry ? [ftsTerm, q, q, limit] : [ftsTerm, q, q, country, limit];

    const sql = `
      SELECT p.*,
             CASE WHEN p.ascii = ? COLLATE NOCASE THEN 0 ELSE 1 END AS exactness
        FROM places_fts f
        JOIN places p ON p.id = f.rowid
       WHERE places_fts MATCH ?
         ${where}
       ORDER BY exactness ASC, p.population DESC
       LIMIT ?`;
    // Reorder params to match the SQL's placeholder order.
    const ordered = anyCountry ? [q, ftsTerm, limit] : [q, ftsTerm, country, limit];
    return this.#db.prepare(sql).all(...ordered).map(toPlace);
  }

  /**
   * The most populous places in a country, for a dropdown.
   *
   * Ordered by population descending. Only settlements with a recorded
   * population are returned - a hamlet with population 0 would otherwise
   * outrank nothing and just pad the list.
   */
  top(country = 'IN', limit = 300) {
    return this.#db.prepare(
      `SELECT * FROM places
        WHERE country = ? AND population > 0
        ORDER BY population DESC
        LIMIT ?`
    ).all(country, limit).map(toPlace);
  }

  /** Look up one place by its GeoNames id. */
  byId(id) {
    const r = this.#db.prepare('SELECT * FROM places WHERE id = ?').get(id);
    return r ? toPlace(r) : null;
  }

  /**
   * Nearest places to a coordinate.
   *
   * Uses the R*Tree to narrow to a bounding box first, then computes exact
   * great-circle distance on the survivors. Querying the R*Tree with a box
   * and refining is the standard pattern - the index cannot rank by distance
   * itself, and a full-table haversine over 579k rows is ~100x slower.
   *
   * The box is widened in longitude by 1/cos(latitude) because a degree of
   * longitude shrinks toward the poles. Omitting that makes the box too
   * narrow at high latitude and silently misses the true nearest place.
   */
  nearest(latitude, longitude, { limit = 5, radiusKm = 50 } = {}) {
    assertCoord(latitude, longitude);

    // Progressive widening. India's gazetteer is dense - a flat 50 km box
    // around Bengaluru pulls tens of thousands of rows and then haversines
    // every one in JS, which measured at ~8 ms per call. Starting tight and
    // widening only when we are short of results took the common case to
    // well under a millisecond, because the first ring almost always
    // satisfies `limit`.
    const rings = [2, 10, 50, 200].filter((r) => r <= radiusKm);
    if (rings.at(-1) !== radiusKm) rings.push(radiusKm);

    const stmt = this.#db.prepare(`
      SELECT p.* FROM places_rtree r JOIN places p ON p.id = r.id
       WHERE r.maxLat >= ? AND r.minLat <= ?
         AND r.maxLon >= ? AND r.minLon <= ?`);

    for (const ring of rings) {
      const dLat = ring / 111.32;
      // A degree of longitude shrinks as cos(latitude); without this the box
      // is too narrow near the poles and silently misses the true nearest.
      const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), 1e-6);
      const dLon = Math.min(dLat / cosLat, 180);

      const rows = stmt.all(
        latitude - dLat, latitude + dLat, longitude - dLon, longitude + dLon
      );
      const hits = rows
        .map((r) => ({ ...toPlace(r), distanceKm: haversineKm(latitude, longitude, r.latitude, r.longitude) }))
        .filter((p) => p.distanceKm <= ring)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      if (hits.length >= limit || ring === rings.at(-1)) return hits.slice(0, limit);
    }
    return [];
  }

  /**
   * Resolve an arbitrary coordinate to a usable place record.
   *
   * If no gazetteer entry is within `radiusKm`, we return the coordinate with
   * `timezone: null` rather than guessing a zone from longitude. A guessed
   * zone would be wrong by an hour across most of India's borders and would
   * produce a confidently incorrect chart - the caller must supply one.
   */
  resolveCoordinate(latitude, longitude, { radiusKm = 100 } = {}) {
    assertCoord(latitude, longitude);
    const candidates = this.nearest(latitude, longitude, { limit: 25, radiusKm });
    // Prefer a substantial settlement over a micro-locality that happens to
    // be a few metres closer. GeoNames places many wards, roads and hamlets
    // at or near a city centroid, so pure nearest-by-distance answers
    // "Kasturba Road" when the honest answer is "Bengaluru". Anything within
    // 15 km whose population is materially larger wins.
    const near = pickRepresentative(candidates);
    if (!near) {
      return {
        latitude, longitude, elevation: 0, elevationSource: 'none',
        timezone: null, name: null, resolved: false,
        note: 'no gazetteer entry within ' + radiusKm + ' km; supply an IANA timezone explicitly',
      };
    }
    return {
      latitude, longitude,
      // The GeoNames id of the settlement we resolved TO - not of the
      // coordinate, which has no id. The caller needs it to know WHICH record
      // a dropped pin landed on; reconstructing that by comparing coordinates
      // fails, because the pin is deliberately NOT snapped to the centroid.
      id: near.id,
      population: near.population,
      elevation: near.elevation,
      elevationSource: near.elevationSource,
      timezone: near.timezone,
      name: near.name,
      admin1: near.admin1,
      country: near.country,
      distanceKm: near.distanceKm,
      resolved: true,
    };
  }
}

/**
 * Choose the most useful of several nearby places.
 *
 * Scoring, not a hard rule: distance still matters, but population breaks the
 * near-ties that make a raw nearest-neighbour query embarrassing in cities.
 */
function pickRepresentative(candidates) {
  if (candidates.length === 0) return null;
  const scored = candidates.map((p) => {
    // log10 population, so 8.5M beats 400 decisively but 62k vs 22k barely.
    const pop = Math.log10(Math.max(p.population, 1));
    // Penalise distance gently within the first 15 km, harshly beyond it.
    const penalty = p.distanceKm <= 15 ? p.distanceKm / 15 : 1 + (p.distanceKm - 15) / 5;
    return { p, score: pop - penalty * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].p;
}

function toPlace(r) {
  return {
    id: r.id,
    name: r.name,
    ascii: r.ascii,
    country: r.country,
    admin1: r.admin1_name,
    latitude: r.latitude,
    longitude: r.longitude,
    elevation: r.elevation,
    elevationSource: r.elevation_source,
    timezone: r.timezone,
    population: r.population,
    featureCode: r.fcode,
    label: [r.name, r.admin1_name, r.country].filter(Boolean).join(', '),
  };
}

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function assertCoord(lat, lon) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`latitude must be in [-90, 90], got ${lat}`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(`longitude must be in [-180, 180], got ${lon}`);
  }
}
