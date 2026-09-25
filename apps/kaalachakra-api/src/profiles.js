/**
 * Profile persistence and the derived astrological facts each profile carries.
 *
 * A profile's janma nakshatra, janma rashi and dasha tree are DERIVED, never
 * stored. Storing them would mean a later ayanamsa change (or a fix to this
 * engine) silently disagreeing with the saved values, and the stored copy
 * would win by being read first. Deriving on demand costs about a
 * millisecond and cannot drift.
 */
import { randomUUID } from 'node:crypto';
import {
  localToJd, janmaPoints, vimshottari, activeDasha, saturnPeriods, natalChart,
  daySummary, rankRemedies, resolveBirthOffset,
} from '@kaalachakra/ganita';
import { queries, rowToProfile } from './db/index.js';

/**
 * Fill in altitude and timezone from the gazetteer when the caller omitted
 * them. Altitude genuinely shifts sunrise, so defaulting it to 0 for a place
 * at 920 m is a silent accuracy loss rather than a harmless default. The
 * gazetteer is optional, so this degrades cleanly when it is absent.
 */
function enrichPlace(place, gazetteer) {
  if (!gazetteer) return place;
  const needsAltitude = !Number.isFinite(place.altitude);
  const needsZone = !place.timezone && !Number.isFinite(place.tzOffsetHours);
  if (!needsAltitude && !needsZone) return place;

  const r = gazetteer.resolveCoordinate(place.latitude, place.longitude);
  if (!r.resolved) return place;
  return {
    ...place,
    altitude: needsAltitude ? r.elevation : place.altitude,
    timezone: needsZone ? r.timezone : place.timezone,
  };
}

export function listProfiles(db) {
  return db.prepare(queries.list).all().map(rowToProfile);
}

export function countProfiles(db) {
  return db.prepare(queries.count).get().n;
}

export function getProfile(db, id) {
  return rowToProfile(db.prepare(queries.get).get(id));
}

export function deleteProfile(db, id) {
  const info = db.prepare(queries.delete).run(id);
  return info.changes > 0;
}

/**
 * Resolve the UTC offset for a birth record.
 *
 * An explicitly supplied offset wins over an IANA zone, because a recorded
 * offset is evidence and a derived one is inference. When only a zone is
 * given we resolve it HISTORICALLY - India ran +06:30 during 1942-1945, and
 * using today's +05:30 for a 1943 birth is an hour wrong, which is roughly
 * 15 degrees of ascendant.
 */
function offsetFor(birth, place) {
  const r = resolveBirthOffset({
    birth,
    ianaZone: place.timezone ?? null,
    tzOffsetHours: place.tzOffsetHours,
  });
  return r;
}

export function createProfile(db, body, gazetteer = null) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const birth = body.birth;
  const place = enrichPlace(body.place, gazetteer);
  const off = offsetFor(birth, place);

  db.prepare(queries.insert).run(
    id, body.name, body.gender,
    birth.year, birth.month, birth.day, birth.hour, birth.minute, birth.second ?? 0,
    off.offsetHours,
    place.name ?? null, place.latitude, place.longitude, place.altitude ?? 0,
    body.ayanamsa ?? 'trueCitra', body.sampradaya ?? 'uttaradi',
    body.notes ?? null, now, now
  );
  const created = getProfile(db, id);
  return { ...created, tzResolution: off };
}

export function updateProfile(db, id, body, gazetteer = null) {
  if (!getProfile(db, id)) return null;
  const birth = body.birth;
  const place = enrichPlace(body.place, gazetteer);
  const off = offsetFor(birth, place);
  db.prepare(queries.update).run(
    body.name, body.gender,
    birth.year, birth.month, birth.day, birth.hour, birth.minute, birth.second ?? 0,
    off.offsetHours,
    place.name ?? null, place.latitude, place.longitude, place.altitude ?? 0,
    body.ayanamsa ?? 'trueCitra', body.sampradaya ?? 'uttaradi',
    body.notes ?? null, new Date().toISOString(), id
  );
  return { ...getProfile(db, id), tzResolution: off };
}

/** Birth moment as a Julian Day (UT). */
export function birthJd(profile) {
  return localToJd(profile.birth, profile.place.tzOffsetHours);
}

/** Janma nakshatra / pada / rashi, derived. */
export function janmaFor(profile) {
  return janmaPoints(birthJd(profile), profile.ayanamsa);
}

/**
 * The full natal chart for a profile.
 *
 * Derived on read like everything else in this file - see the module header.
 * The ascendant depends on the birth PLACE and the minute, which is why this
 * cannot be computed from the nakshatra the way the kuta layer can.
 */
export function chartFor(profile) {
  return natalChart(birthJd(profile), profile.place, profile.ayanamsa);
}

/**
 * Everything the day-summary box needs for one profile on one day.
 *
 * `dayPanchanga` is the already-computed panchanga for the selected date, so
 * this does not recompute it per profile.
 */
export function summaryFor(profile, dayPanchanga) {
  const janma = janmaFor(profile);
  const summary = daySummary({
    jdUt: dayPanchanga.sun.riseJd,
    janmaNakshatra: janma.nakshatra.index,
    janmaRashi: janma.rashi.index,
    todayNakshatra: dayPanchanga.nakshatra.index,
    todayMoonRashi: dayPanchanga.moon.rashi.index,
    ayanamsaName: profile.ayanamsa,
  });

  const tree = vimshottari(birthJd(profile), profile.ayanamsa, 3);
  const chain = activeDasha(tree, dayPanchanga.sun.riseJd);

  return {
    profile: { id: profile.id, name: profile.name, gender: profile.gender },
    janma,
    ...summary,
    dasha: {
      balanceAtBirth: tree.balanceAtBirth,
      active: chain,
      // "Shani > Chandra > Guru" reads better in a summary box than a tree.
      label: chain.map((c) => c.graha).join(' › '),
    },
    remedies: rankRemedies(summary),
  };
}

/** Full Vimshottari tree for the dashas tab. */
export function dashaFor(profile, depth = 2) {
  return vimshottari(birthJd(profile), profile.ayanamsa, depth);
}

/**
 * Julian Day (UT) for right now.
 *
 * 2440587.5 is the JD at the Unix epoch, so this is exact rather than a
 * calendar round-trip. Computed on the SERVER so the browser never has to
 * reproduce it: a client that derived "now" slightly differently would pick
 * the wrong period at a dasha boundary, and a boundary is exactly when
 * someone looks.
 */
export const nowJd = () => Date.now() / 86400000 + 2440587.5;

/**
 * The dasha chain running at a given moment - mahadasha, antardasha and
 * deeper, as far as the tree was built.
 *
 * Returns an empty chain rather than throwing when the moment falls outside
 * the tree: the Vimshottari cycle is 120 years from birth, and someone can
 * legitimately be looking at a chart for a date beyond it.
 */
export function currentDashaFor(profile, tree, atJd = nowJd()) {
  return activeDasha(tree, atJd);
}

/** Saturn periods across a year range, for the dashas timeline. */
export function saturnFor(profile, fromYear, toYear) {
  const janma = janmaFor(profile);
  const from = localToJd({ year: fromYear, month: 1, day: 1 }, profile.place.tzOffsetHours);
  const to = localToJd({ year: toYear, month: 1, day: 1 }, profile.place.tzOffsetHours);
  return saturnPeriods(from, to, janma.rashi.index, profile.ayanamsa);
}
