/**
 * SQLite persistence.
 *
 * Uses `node:sqlite`, which ships with Node 22+. That keeps the promise that
 * this app has no third-party runtime database dependency - no better-sqlite3,
 * no native rebuild beyond the ephemeris binding we already own.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SCHEMA_VERSION = 1;

/**
 * Open (and migrate) the database.
 * @param {string} file  path, or ':memory:' for tests
 */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);

  // WAL gives us concurrent reads while a write is in flight. Harmless for a
  // single-user local app, and correct if this ever serves a household.
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get('version');
  const current = row ? Number(row.value) : 0;
  if (current >= SCHEMA_VERSION) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      gender         TEXT NOT NULL CHECK (gender IN ('male','female','other')),

      -- Birth moment, stored as the LOCAL civil time plus its offset, never as
      -- a UTC instant. A birth record is a local fact; converting it to UTC on
      -- the way in loses the offset the astrologer needs to see, and any later
      -- timezone-database correction would silently move the chart.
      birth_year     INTEGER NOT NULL,
      birth_month    INTEGER NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
      birth_day      INTEGER NOT NULL CHECK (birth_day BETWEEN 1 AND 31),
      birth_hour     INTEGER NOT NULL CHECK (birth_hour BETWEEN 0 AND 23),
      birth_minute   INTEGER NOT NULL CHECK (birth_minute BETWEEN 0 AND 59),
      birth_second   REAL    NOT NULL DEFAULT 0,
      tz_offset_hours REAL   NOT NULL CHECK (tz_offset_hours BETWEEN -12 AND 14),

      place_name     TEXT,
      latitude       REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
      longitude      REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
      altitude       REAL NOT NULL DEFAULT 0,

      -- The ayanamsa is recorded per profile because it can move a nakshatra
      -- boundary by ~2 minutes, which can change the janma nakshatra and so
      -- the dasha balance and every kuta. A chart without its ayanamsa is not
      -- reproducible.
      ayanamsa       TEXT NOT NULL DEFAULT 'trueCitra',
      sampradaya     TEXT NOT NULL DEFAULT 'uttaradi',

      notes          TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)')
    .run('version', String(SCHEMA_VERSION));
}

/** Map a DB row to the API shape. */
export function rowToProfile(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    gender: r.gender,
    birth: {
      year: r.birth_year, month: r.birth_month, day: r.birth_day,
      hour: r.birth_hour, minute: r.birth_minute, second: r.birth_second,
    },
    place: {
      name: r.place_name,
      latitude: r.latitude,
      longitude: r.longitude,
      altitude: r.altitude,
      tzOffsetHours: r.tz_offset_hours,
    },
    ayanamsa: r.ayanamsa,
    sampradaya: r.sampradaya,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const queries = {
  list: 'SELECT * FROM profiles ORDER BY name COLLATE NOCASE',
  get: 'SELECT * FROM profiles WHERE id = ?',
  count: 'SELECT COUNT(*) AS n FROM profiles',
  delete: 'DELETE FROM profiles WHERE id = ?',
  insert: `INSERT INTO profiles (
    id, name, gender, birth_year, birth_month, birth_day,
    birth_hour, birth_minute, birth_second, tz_offset_hours,
    place_name, latitude, longitude, altitude,
    ayanamsa, sampradaya, notes, created_at, updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  update: `UPDATE profiles SET
    name=?, gender=?, birth_year=?, birth_month=?, birth_day=?,
    birth_hour=?, birth_minute=?, birth_second=?, tz_offset_hours=?,
    place_name=?, latitude=?, longitude=?, altitude=?,
    ayanamsa=?, sampradaya=?, notes=?, updated_at=?
   WHERE id=?`,
};
