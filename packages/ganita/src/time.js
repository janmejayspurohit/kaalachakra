/**
 * Time conversion.
 *
 * Panchanga is inherently LOCAL and inherently sunrise-anchored, while Swiss
 * Ephemeris speaks Julian Day in UT. Every conversion funnels through here so
 * there is exactly one place to get the offset sign wrong - and one place to
 * fix it.
 */
import swe from '@kaalachakra/swisseph';

/**
 * Local civil date/time -> Julian Day (UT).
 * `tzOffsetHours` is the offset FROM UTC (IST = +5.5).
 */
export function localToJd({ year, month, day, hour = 0, minute = 0, second = 0 }, tzOffsetHours) {
  assertCivilDate({ year, month, day, hour, minute, second });
  if (!Number.isFinite(tzOffsetHours)) {
    throw new TypeError(`tzOffsetHours must be a finite number, got ${tzOffsetHours}`);
  }
  const decimalHour = hour + minute / 60 + second / 3600;
  const jdLocal = swe.swe_julday(year, month, day, decimalHour, swe.SE_GREG_CAL);
  return jdLocal - tzOffsetHours / 24;
}

/**
 * Reject a date that does not exist on the Gregorian calendar.
 *
 * swe_julday and Date.UTC both NORMALISE rather than fail: 30 February
 * silently becomes 2 March. For a birth record that is the worst outcome - a
 * typo produces a confident chart for a different day. Hours up to 24 are
 * allowed only because callers legitimately pass `day + 1` windows as 24:00.
 */
export function assertCivilDate({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const isInt = Number.isInteger;
  if (!isInt(year) || !isInt(month) || !isInt(day)) {
    throw new RangeError(`year, month and day must be integers, got ${year}-${month}-${day}`);
  }
  if (month < 1 || month > 12) throw new RangeError(`month must be 1..12, got ${month}`);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > dim) {
    throw new RangeError(`${year}-${String(month).padStart(2, '0')} has ${dim} days; got day ${day}`);
  }
  if (!Number.isFinite(hour) || hour < 0 || hour > 24 ||
      !Number.isFinite(minute) || minute < 0 || minute >= 60 ||
      !Number.isFinite(second) || second < 0 || second >= 60) {
    throw new RangeError(`invalid time ${hour}:${minute}:${second}`);
  }
}

/** Julian Day (UT) -> local civil date/time components. */
export function jdToLocal(jdUt, tzOffsetHours) {
  const r = swe.swe_revjul(jdUt + tzOffsetHours / 24, swe.SE_GREG_CAL);
  const h = Math.floor(r.hour);
  const mFloat = (r.hour - h) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return { year: r.year, month: r.month, day: r.day, hour: h, minute: m, second: s };
}

/** Julian Day (UT) -> ISO 8601 string with the given offset applied. */
export function jdToIso(jdUt, tzOffsetHours) {
  if (jdUt === null || jdUt === undefined) return null;
  const t = jdToLocal(jdUt, tzOffsetHours);
  const sign = tzOffsetHours < 0 ? '-' : '+';
  const abs = Math.abs(tzOffsetHours);
  const offH = String(Math.floor(abs)).padStart(2, '0');
  const offM = String(Math.round((abs - Math.floor(abs)) * 60)).padStart(2, '0');
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${p(t.year, 4)}-${p(t.month)}-${p(t.day)}T` +
    `${p(t.hour)}:${p(t.minute)}:${p(Math.floor(t.second))}${sign}${offH}:${offM}`
  );
}

/**
 * Local clock time as "HH:MM", the form a panchanga actually prints.
 *
 * A time past midnight is conventionally shown as 25:14 rather than 01:14,
 * because the Hindu day has not ended until the next sunrise. `anchorJd` is
 * that day's sunrise; pass it to get the >24h form.
 */
export function jdToClock(jdUt, tzOffsetHours, anchorJd = null) {
  if (jdUt === null || jdUt === undefined) return null;
  const t = jdToLocal(jdUt, tzOffsetHours);
  let h = t.hour;
  const m = Math.round(t.second >= 30 ? t.minute + 1 : t.minute);
  let mm = m;
  if (mm === 60) { mm = 0; h += 1; }
  if (anchorJd !== null) {
    const a = jdToLocal(anchorJd, tzOffsetHours);
    // Crossed a civil midnight since the anchor -> continue past 24.
    if (t.day !== a.day || t.month !== a.month || t.year !== a.year) h += 24;
  }
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
