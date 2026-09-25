/**
 * Historical timezone resolution, offline.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 * -----------------------------------
 * A birth chart is computed from a LOCAL wall-clock time. To reach the
 * ephemeris we must convert that to UT, which needs the offset IN FORCE AT
 * THAT MOMENT - not today's offset for that place. Getting this wrong moves
 * the chart by a whole hour, which moves the ascendant by ~15 degrees and can
 * move the Moon by half a degree. That is a different lagna and potentially a
 * different nakshatra pada.
 *
 * Real cases this handles correctly:
 *   - India ran +06:30 during 1942-1945 (WWII). A 1943 Indian birth computed
 *     at +05:30 is an hour wrong.
 *   - Britain ran +01:00 year-round 1968-1971 (British Standard Time).
 *   - Pakistan, Bangladesh and others have had on-again-off-again DST.
 *
 * WHY NO DEPENDENCY
 * -----------------
 * Node ships the full IANA tz database and exposes it through Intl. So this is
 * exact, offline, and free - strictly better than a paid geocoding API call,
 * which also cannot be made for a chart computed on a plane.
 *
 * sudhyk's Ahoratra calls Google's Time Zone API with the BIRTH timestamp
 * (correctly - it is timestamp-aware) and then special-cases Asia/Kolkata and
 * Asia/Calcutta to suppress spurious DST. We need no such workaround because
 * tzdata is authoritative.
 */

import { assertCivilDate } from './time.js';

/** Offset in minutes east of UTC for an IANA zone at a given UTC instant. */
export function offsetMinutesAtInstant(ianaZone, utcDate) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaZone,
      timeZoneName: 'longOffset',
    }).formatToParts(utcDate);
  } catch (e) {
    throw new RangeError(`unknown IANA time zone "${ianaZone}": ${e.message}`);
  }
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  return parseGmtOffset(name);
}

/**
 * "GMT+05:30" | "GMT-04:00" | "GMT+05:21:10" | "GMT" -> minutes (fractional).
 *
 * The seconds form is not exotic: every zone reports its LOCAL MEAN TIME
 * offset before it adopted a standard time, and tzdata keeps those to the
 * second. Asia/Kolkata is +05:21:10 (Madras time) until 1906, Asia/Dhaka
 * +05:53:20 until 1941, Asia/Kathmandu +05:41:16 until 1920. Rejecting them
 * made every Indian birth before 1906 impossible to save.
 */
export function parseGmtOffset(s) {
  const m = /^GMT([+-])(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) {
    if (s === 'GMT' || s === 'UTC') return 0;
    throw new RangeError(`could not parse offset "${s}"`);
  }
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]) + Number(m[4] ?? 0) / 60);
}

/**
 * Convert a LOCAL wall-clock time in `ianaZone` to a UTC Date.
 *
 * The conversion is circular - the offset depends on the instant, and the
 * instant depends on the offset - so every offset the zone uses near that
 * date is tried, and the ones that round-trip are the answers.
 *
 * Returns `{ date, offsetMinutes, ambiguity }` where ambiguity is:
 *   - 'none'      normal
 *   - 'repeated'  the wall time occurs TWICE (clocks went back). We return the
 *                 FIRST (pre-transition) occurrence and say so.
 *   - 'skipped'   the wall time NEVER occurs (clocks went forward). We read
 *                 it with the pre-gap offset (02:30 -> 03:30 summer time)
 *                 and say so.
 *
 * The previous version checked only the hour BEFORE its answer for a repeat,
 * but its iteration converged on the first occurrence, so a fall-back time
 * (01:30 on the night clocks go back) was reported as unambiguous.
 *
 * Surfacing this matters: a birth recorded at 02:30 on a spring-forward night
 * is a data problem the astrologer must resolve, not something to paper over.
 */
export function localToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, ianaZone) {
  assertCivilDate({ year, month, day, hour, minute, second });
  // The wall-clock fields read as if they were UTC.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, Math.floor(second),
    Math.round((second % 1) * 1000));

  // Every offset the zone uses within a day either side is a candidate; the
  // instant for a candidate offset is valid if it displays back as the wall
  // time we were given. Zero valid -> the time was skipped (spring forward);
  // two -> it occurred twice (fall back). This makes no assumption that a
  // transition is exactly one hour - WWII double summer time was two, Lord
  // Howe's is thirty minutes.
  const offsets = new Set();
  for (const h of [-36, -12, 0, 12, 36]) {
    offsets.add(offsetMinutesAtInstant(ianaZone, new Date(asUtc + h * 3600_000)));
  }
  const valid = [];
  for (const off of offsets) {
    const instant = asUtc - off * 60_000;
    if (offsetMinutesAtInstant(ianaZone, new Date(instant)) === off) valid.push({ instant, off });
  }
  valid.sort((a, b) => a.instant - b.instant);

  let pick, ambiguity;
  if (valid.length === 0) {
    // Skipped: read the wall time with the offset in force BEFORE the gap, so
    // 02:30 on a spring-forward night lands at 03:30 summer time (the same
    // convention as Temporal's 'compatible'). The offset returned must
    // reproduce the returned instant, because a profile stores only the
    // offset and recomputes the instant from it.
    ambiguity = 'skipped';
    const off = offsetMinutesAtInstant(ianaZone, new Date(asUtc - 36 * 3600_000));
    pick = { instant: asUtc - off * 60_000, off };
  } else {
    // Repeated: return the FIRST (pre-transition) occurrence.
    ambiguity = valid.length > 1 ? 'repeated' : 'none';
    pick = valid[0];
  }

  return {
    date: new Date(pick.instant),
    offsetMinutes: pick.off,
    offsetHours: pick.off / 60,
    ambiguity,
  };
}

/** Wall-clock components of a UTC instant in a zone. */
export function utcToLocalParts(utcDate, ianaZone) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);
  const g = (t) => Number(p.find((x) => x.type === t).value);
  // Intl renders midnight as hour 24 in some locales; normalise.
  const hour = g('hour') % 24;
  return { year: g('year'), month: g('month'), day: g('day'), hour, minute: g('minute'), second: g('second') };
}

/**
 * The offset to use for a birth record.
 *
 * Accepts either an explicit `tzOffsetHours` (authoritative - use it when the
 * birth certificate states one) or an `ianaZone` to resolve historically.
 * Explicit wins, because a recorded offset is evidence and a derived one is
 * inference.
 */
export function resolveBirthOffset({ birth, ianaZone, tzOffsetHours }) {
  if (Number.isFinite(tzOffsetHours)) {
    return { offsetHours: tzOffsetHours, source: 'explicit', ambiguity: 'none', ianaZone: ianaZone ?? null };
  }
  if (!ianaZone) {
    throw new TypeError('either tzOffsetHours or ianaZone must be supplied');
  }
  const r = localToUtc(birth, ianaZone);
  return {
    offsetHours: r.offsetHours,
    source: 'iana',
    ianaZone,
    ambiguity: r.ambiguity,
    utc: r.date.toISOString(),
  };
}

/** True if the zone is observing DST at that instant. */
export function isDst(ianaZone, utcDate) {
  const jan = offsetMinutesAtInstant(ianaZone, new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1)));
  const jul = offsetMinutesAtInstant(ianaZone, new Date(Date.UTC(utcDate.getUTCFullYear(), 6, 1)));
  const now = offsetMinutesAtInstant(ianaZone, utcDate);
  return now === Math.max(jan, jul) && jan !== jul;
}

/** Every IANA zone this Node build knows about. */
export function supportedZones() {
  return Intl.supportedValuesOf('timeZone');
}
