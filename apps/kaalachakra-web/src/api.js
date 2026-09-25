/** Thin API client. Every call funnels through `req` so errors are uniform. */

const BASE = '/api';

async function req(path, options = {}) {
  // Declare a JSON content-type ONLY when there is a JSON body.
  //
  // Sending it unconditionally broke every bodyless request: a DELETE arrived
  // with `content-type: application/json` and no body, Fastify's JSON parser
  // rejected it with "Body cannot be empty when content-type is set to
  // 'application/json'", and the delete failed with a 500. The header is a
  // description of the body, so a request without one must not carry it.
  const hasBody = options.body !== undefined && options.body !== null;
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { error: text }; }
  if (!res.ok) {
    // The API returns either {error} or {error, details} from Ajv. Surface the
    // first validation message, which names the offending field.
    const detail = body?.details?.[0];
    const msg = detail
      ? `${detail.instancePath || 'request'} ${detail.message}`
      : body?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

const qs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/**
 * The subset of a place the API actually accepts as query parameters.
 *
 * Picked explicitly rather than spread, so UI-only fields - `placeId`, the
 * display `name` - never reach a route that would reject them as unexpected
 * properties.
 */
const placeQuery = (place) => ({
  latitude: place.latitude,
  longitude: place.longitude,
  altitude: place.altitude,
  timezone: place.timezone,
});

/** The calculation settings every computing route accepts. */
const calcQuery = ({ ganita, ayanamsa } = {}) => ({ ganita, ayanamsa });

export const api = {
  health: () => req('/health'),

  panchanga: ({ date, place, ayanamsa, ganita, profileId }) =>
    req(`/panchanga?${qs({
      year: date.year, month: date.month, day: date.day,
      latitude: place.latitude, longitude: place.longitude,
      altitude: place.altitude, timezone: place.timezone,
      ayanamsa, ganita, profileId,
    })}`),

  /**
   * Muhurta for a date: the day's verdict with every point and its basis, the
   * day's lagna windows, and the next shubha days - for an event, and for a
   * person when profileId is given.
   */
  muhurta: ({ date, place, ganita, ayanamsa, event, profileId, veda, count, horizonDays }) =>
    req(`/muhurta?${qs({
      year: date.year, month: date.month, day: date.day, ...placeQuery(place),
      ganita, ayanamsa, event, profileId, veda, count, horizonDays,
    })}`),

  // Janma nakshatra, rashi and dasha are derived in the chosen ganita, so the
  // profile routes take it too (Surya Siddhanta by default).
  profiles: (ganita) => req(`/profiles?${qs({ ganita })}`),
  createProfile: (body, ganita) => req(`/profiles?${qs({ ganita })}`, { method: 'POST', body: JSON.stringify(body) }),
  updateProfile: (id, body, ganita) => req(`/profiles/${id}?${qs({ ganita })}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProfile: (id) => req(`/profiles/${id}`, { method: 'DELETE' }),

  /** The natal chart for a profile, in the shape a kundali is drawn from. */
  chart: (id, ganita) => req(`/profiles/${id}/chart?${qs({ ganita })}`),

  dasha: (id, { depth = 2, fromYear, toYear, ganita } = {}) =>
    req(`/profiles/${id}/dasha?${qs({ depth, fromYear, toYear, ganita })}`),

  match: (body, ganita) => req(`/match?${qs({ ganita })}`, { method: 'POST', body: JSON.stringify(body) }),

  searchPlaces: (q, opts = {}) => req(`/places/search?${qs({ q, ...opts })}`),
  topPlaces: (limit = 300, country = 'IN') => req(`/places/top?${qs({ limit, country })}`),
  resolvePlace: (latitude, longitude) => req(`/places/resolve?${qs({ latitude, longitude })}`),

  /*
   * The year- and month-wide routes take the SELECTED place, like /panchanga
   * does. They used to hardcode 12.9716, 77.5946 - a rounded Bengaluru - so
   * the calendar, the Ekadashi list and the aradhana list all silently
   * answered for Bengaluru however the location was set. That is not a
   * cosmetic mismatch: every one of these is decided at SUNRISE (and Ekadashi
   * at arunodaya, 96 minutes before it), and sunrise moves about 24 minutes
   * per 6 degrees of longitude. A tithi ending in that gap belongs to a
   * different day in Delhi than in Bengaluru, which moves the fast day.
   */
  //
  // `calc` carries the calculation settings - { ganita, ayanamsa } - which
  // these routes previously never received, so the calendar and the Ekadashi
  // list silently ignored the ayanamsa setting.
  ekadashis: (year, place, calc = {}) => req(`/ekadashis?${qs({ year, ...placeQuery(place), ...calcQuery(calc) })}`),
  chaturmasya: (year, place, calc = {}) => req(`/chaturmasya?${qs({ year, ...placeQuery(place), ...calcQuery(calc) })}`),
  aradhana: (year, place, calc = {}) => req(`/aradhana?${qs({ year, ...placeQuery(place), ...calcQuery(calc) })}`),
  month: (year, month, place, calc = {}) => req(`/month?${qs({ year, month, ...placeQuery(place), ...calcQuery(calc) })}`),
};
