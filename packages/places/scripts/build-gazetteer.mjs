/**
 * Build the local gazetteer from GeoNames dumps.
 *
 * Run once; the resulting SQLite file is what ships. After that Kaalachakra
 * resolves places entirely offline - no Google Geocoding, no Time Zone API,
 * no API key, no rate limit, and no dependence on being online to cast a
 * chart. sudhyk's Ahoratra makes three Google calls per place lookup
 * (geocode -> timezone -> elevation); we make none.
 *
 * Source: https://download.geonames.org/export/dump/  (CC BY 4.0)
 *
 * Usage:
 *   node scripts/build-gazetteer.mjs <dataDir> <outputDb>
 *
 * Expects in <dataDir>: IN.txt, cities15000.txt, admin1.txt
 */
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const [, , dataDir = '.', outDb = 'gazetteer.db'] = process.argv;

// GeoNames "main" dump columns.
const COL = {
  id: 0, name: 1, ascii: 2, alt: 3, lat: 4, lon: 5,
  fclass: 6, fcode: 7, country: 8, admin1: 10, admin2: 11,
  population: 14, elevation: 15, dem: 16, timezone: 17,
};

/**
 * Feature codes we keep. GeoNames class P is "populated place"; PPLX is a
 * section of a city and PPLL a locality, both of which matter for Indian
 * addresses. We deliberately exclude abandoned (PPLQ) and destroyed (PPLW)
 * places - a birth cannot be registered at one, and they add noise to search.
 */
const KEEP_FCODES = new Set([
  'PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5',
  'PPLC', 'PPLF', 'PPLG', 'PPLL', 'PPLR', 'PPLS', 'PPLX',
]);

function openOut(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = OFF');
  db.exec('PRAGMA synchronous = OFF');
  db.exec(`
    DROP TABLE IF EXISTS places;
    CREATE TABLE places (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      ascii       TEXT NOT NULL,
      country     TEXT NOT NULL,
      admin1_code TEXT,
      admin1_name TEXT,
      latitude    REAL NOT NULL,
      longitude   REAL NOT NULL,
      -- GeoNames gives elevation (surveyed, often empty) and dem (digital
      -- elevation model, always present). We prefer the survey and fall back
      -- to the DEM, because altitude shifts sunrise: roughly 1 minute earlier
      -- per 1.5 km at mid latitudes. Ignoring it entirely is the common error.
      elevation   REAL NOT NULL DEFAULT 0,
      elevation_source TEXT NOT NULL DEFAULT 'dem',
      timezone    TEXT NOT NULL,
      population  INTEGER NOT NULL DEFAULT 0,
      fcode       TEXT NOT NULL
    );
  `);
  // R*Tree gives O(log n) nearest-neighbour instead of a 590k-row table scan.
  db.exec(`
    DROP TABLE IF EXISTS places_rtree;
    CREATE VIRTUAL TABLE places_rtree USING rtree(id, minLat, maxLat, minLon, maxLon);
  `);
  // FTS5 with a trigram-ish prefix index for type-ahead search.
  db.exec(`
    DROP TABLE IF EXISTS places_fts;
    CREATE VIRTUAL TABLE places_fts USING fts5(
      name, ascii, admin1_name, content='places', content_rowid='id',
      prefix='2 3 4'
    );
  `);
  return db;
}

async function loadAdmin1(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    const f = line.split('\t');
    if (f.length >= 2) map.set(f[0], f[1]); // "IN.19" -> "Karnataka"
  }
  return map;
}

async function ingest(db, file, admin1, { onlyCountry = null, seen }) {
  if (!existsSync(file)) {
    console.warn(`  skip (missing): ${file}`);
    return 0;
  }
  const insert = db.prepare(`INSERT OR IGNORE INTO places
    (id,name,ascii,country,admin1_code,admin1_name,latitude,longitude,
     elevation,elevation_source,timezone,population,fcode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rtree = db.prepare('INSERT OR IGNORE INTO places_rtree VALUES (?,?,?,?,?)');

  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let n = 0, skipped = 0;
  db.exec('BEGIN');
  for await (const line of rl) {
    const f = line.split('\t');
    if (f.length < 18) { skipped++; continue; }
    if (f[COL.fclass] !== 'P' || !KEEP_FCODES.has(f[COL.fcode])) { skipped++; continue; }
    if (onlyCountry && f[COL.country] !== onlyCountry) { skipped++; continue; }

    const id = Number(f[COL.id]);
    if (seen.has(id)) { skipped++; continue; }

    const lat = Number(f[COL.lat]);
    const lon = Number(f[COL.lon]);
    const tz = f[COL.timezone];
    // A place with no timezone is unusable for us - we cannot convert its
    // local birth time to UT. Drop it rather than guess from longitude.
    if (!tz || !Number.isFinite(lat) || !Number.isFinite(lon)) { skipped++; continue; }

    const surveyed = f[COL.elevation] === '' ? null : Number(f[COL.elevation]);
    const dem = f[COL.dem] === '' ? null : Number(f[COL.dem]);
    // GeoNames uses -9999 in `dem` to mean "no data".
    const elevation = Number.isFinite(surveyed) ? surveyed
      : (Number.isFinite(dem) && dem > -9000 ? dem : 0);
    const elevSource = Number.isFinite(surveyed) ? 'surveyed'
      : (Number.isFinite(dem) && dem > -9000 ? 'dem' : 'none');

    const a1code = f[COL.admin1] ? `${f[COL.country]}.${f[COL.admin1]}` : null;

    insert.run(
      id, f[COL.name], f[COL.ascii] || f[COL.name], f[COL.country],
      a1code, a1code ? (admin1.get(a1code) ?? null) : null,
      lat, lon, elevation, elevSource, tz,
      Number(f[COL.population]) || 0, f[COL.fcode]
    );
    // A point is a degenerate rectangle; R*Tree handles that fine.
    rtree.run(id, lat, lat, lon, lon);
    seen.add(id);
    n++;
    if (n % 100000 === 0) { db.exec('COMMIT'); db.exec('BEGIN'); process.stdout.write(`    ${n}\r`); }
  }
  db.exec('COMMIT');
  console.log(`  ${file.split('/').pop()}: ingested ${n}, skipped ${skipped}`);
  return n;
}

const t0 = Date.now();
const admin1 = await loadAdmin1(resolve(dataDir, 'admin1.txt'));
console.log(`admin1 regions: ${admin1.size}`);

const db = openOut(outDb);
const seen = new Set();

// India first, so Indian rows win any id collision and the R*Tree is packed
// with the dense region before the sparse world set.
console.log('ingesting...');
await ingest(db, resolve(dataDir, 'IN.txt'), admin1, { onlyCountry: 'IN', seen });
await ingest(db, resolve(dataDir, 'cities15000.txt'), admin1, { seen });

console.log('indexing...');
db.exec(`CREATE INDEX idx_places_country_pop ON places(country, population DESC)`);
db.exec(`CREATE INDEX idx_places_ascii ON places(ascii COLLATE NOCASE)`);
db.exec(`INSERT INTO places_fts(rowid, name, ascii, admin1_name)
         SELECT id, name, ascii, COALESCE(admin1_name,'') FROM places`);
db.exec(`INSERT INTO places_fts(places_fts) VALUES('optimize')`);
db.exec('PRAGMA journal_mode = DELETE');
db.exec('VACUUM');

const total = db.prepare('SELECT COUNT(*) n FROM places').get().n;
const india = db.prepare("SELECT COUNT(*) n FROM places WHERE country='IN'").get().n;
const zones = db.prepare('SELECT COUNT(DISTINCT timezone) n FROM places').get().n;
db.close();

console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  places : ${total.toLocaleString()} (India ${india.toLocaleString()})`);
console.log(`  zones  : ${zones}`);
console.log(`  file   : ${outDb} ${(statSync(outDb).size / 1e6).toFixed(1)} MB`);
