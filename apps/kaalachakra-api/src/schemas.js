/**
 * JSON Schemas for request validation.
 *
 * Fastify compiles these with Ajv and rejects bad input BEFORE any handler
 * runs. That is the structural fix for the class of bug in sudhyk's
 * coreserver, where `parseInt(req.query.year) ?? 1986` silently produced NaN
 * (parseInt(undefined) is NaN, and `??` only catches null/undefined) and fed
 * it straight into the ephemeris. Here a missing or malformed field is a 400
 * with a precise message, never a NaN chart.
 */

export const placeSchema = {
  type: 'object',
  required: ['latitude', 'longitude'],
  additionalProperties: false,
  properties: {
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    // NO default. Ajv's useDefaults would fill 0 here, which is
    // indistinguishable from a caller who genuinely meant sea level - and
    // would stop the gazetteer supplying the real elevation. Altitude shifts
    // sunrise, so silently flattening Bengaluru's 920 m to 0 is a real loss.
    altitude: { type: 'number', minimum: -500, maximum: 9000 },
    // Either an explicit offset or an IANA zone. The route checks that at
    // least one is present; a schema cannot express "one of these two" as
    // cleanly as a one-line guard.
    tzOffsetHours: { type: 'number', minimum: -12, maximum: 14 },
    timezone: { type: 'string', minLength: 1, maxLength: 64 },
    name: { type: 'string', maxLength: 200 },
  },
};

export const ayanamsaEnum = {
  type: 'string',
  enum: [
    'trueCitra', 'lahiri', 'raman', 'krishnamurti',
    'trueRevati', 'truePushya', 'suryasiddhanta', 'suryasiddhantaMeanSun',
  ],
  default: 'trueCitra',
};

/**
 * Year bounds.
 *
 * The bundled ephemeris covers 1200-2800 CE, but the stated working range for
 * this project is 1900-2200 (audited 2026-09-23). We accept the wider ephemeris range and let the
 * engine's own guard reject anything beyond it, rather than hard-coding a
 * narrower limit that would surprise someone entering a great-grandparent's
 * birth year.
 */
const YEAR = { type: 'integer', minimum: 1200, maximum: 2800 };

/**
 * Which ganita computes the panchanga Sun and Moon. Surya Siddhanta is the
 * default because it is Sri Uttaradi Math's own reckoning; drik is the modern
 * ephemeris. Stateless: the client sends it on every call, nothing is stored.
 */
export const ganitaEnum = { type: 'string', enum: ['surya', 'drik'], default: 'surya' };

export const panchangaQuerySchema = {
  type: 'object',
  required: ['year', 'month', 'day', 'latitude', 'longitude'],
  properties: {
    year: YEAR,
    month: { type: 'integer', minimum: 1, maximum: 12 },
    day: { type: 'integer', minimum: 1, maximum: 31 },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    // NO default - see placeSchema.
    altitude: { type: 'number', minimum: -500, maximum: 9000 },
    tzOffsetHours: { type: 'number', minimum: -12, maximum: 14 },
    timezone: { type: 'string', maxLength: 64 },
    ayanamsa: ayanamsaEnum,
    ganita: ganitaEnum,
    profileId: { type: 'string', maxLength: 64 },
  },
};

const birthSchema = {
  type: 'object',
  required: ['year', 'month', 'day', 'hour', 'minute'],
  additionalProperties: false,
  properties: {
    year: YEAR,
    month: { type: 'integer', minimum: 1, maximum: 12 },
    day: { type: 'integer', minimum: 1, maximum: 31 },
    hour: { type: 'integer', minimum: 0, maximum: 23 },
    minute: { type: 'integer', minimum: 0, maximum: 59 },
    second: { type: 'number', minimum: 0, maximum: 59.999, default: 0 },
  },
};

export const profileBodySchema = {
  type: 'object',
  required: ['name', 'gender', 'birth', 'place'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    gender: { type: 'string', enum: ['male', 'female', 'other'] },
    birth: birthSchema,
    place: placeSchema,
    ayanamsa: ayanamsaEnum,
    sampradaya: { type: 'string', enum: ['uttaradi', 'raghavendra', 'smarta'], default: 'uttaradi' },
    notes: { type: 'string', maxLength: 2000 },
  },
};

export const matchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // Either two profile ids, or two explicit nakshatra/pada pairs.
    brideProfileId: { type: 'string', maxLength: 64 },
    groomProfileId: { type: 'string', maxLength: 64 },
    bride: {
      type: 'object',
      required: ['nakshatra', 'pada'],
      additionalProperties: false,
      properties: {
        nakshatra: { type: 'integer', minimum: 1, maximum: 27 },
        pada: { type: 'integer', minimum: 1, maximum: 4 },
      },
    },
    groom: {
      type: 'object',
      required: ['nakshatra', 'pada'],
      additionalProperties: false,
      properties: {
        nakshatra: { type: 'integer', minimum: 1, maximum: 27 },
        pada: { type: 'integer', minimum: 1, maximum: 4 },
      },
    },
  },
};

export const placeSearchSchema = {
  type: 'object',
  required: ['q'],
  properties: {
    q: { type: 'string', minLength: 2, maxLength: 120 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    country: { type: 'string', minLength: 2, maxLength: 2, default: 'IN' },
    anyCountry: { type: 'boolean', default: false },
  },
};

export const dashaQuerySchema = {
  type: 'object',
  properties: {
    ganita: ganitaEnum,
    depth: { type: 'integer', minimum: 1, maximum: 4, default: 2 },
    fromYear: YEAR,
    toYear: YEAR,
  },
};

/** GET /muhurta - a day's muhurta verdict, its lagna windows and the next shubha days. */
export const muhurtaQuerySchema = {
  type: 'object',
  required: ['year', 'month', 'day', 'latitude', 'longitude'],
  properties: {
    year: YEAR,
    month: { type: 'integer', minimum: 1, maximum: 12 },
    day: { type: 'integer', minimum: 1, maximum: 31 },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    altitude: { type: 'number', minimum: -500, maximum: 9000 },
    tzOffsetHours: { type: 'number', minimum: -12, maximum: 14 },
    timezone: { type: 'string', maxLength: 64 },
    ayanamsa: ayanamsaEnum,
    ganita: ganitaEnum,
    event: { type: 'string', enum: ['general', 'vivaha', 'upanayana', 'vastu', 'prayana'], default: 'general' },
    profileId: { type: 'string', maxLength: 64 },
    // The Math's astha rule depends on the family's veda (Guru astha - Rigvedis,
    // Shukra astha - Yajurvedis, Bhouma astha - Samavedis). Unknown = both
    // Guru and Shukra astha are applied.
    veda: { type: 'string', enum: ['rig', 'yajur', 'sama'] },
    count: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
    horizonDays: { type: 'integer', minimum: 7, maximum: 400, default: 180 },
  },
};

/** Routes whose results derive from a profile's janma Moon take only the ganita. */
export const ganitaQuerySchema = { type: 'object', properties: { ganita: ganitaEnum } };
