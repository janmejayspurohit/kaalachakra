/**
 * Kaalachakra API - standalone Fastify server.
 *
 * Self-contained by design: it owns its ephemeris (vendored Swiss Ephemeris),
 * its gazetteer (local SQLite, 579k places) and its store (SQLite). It makes
 * no outbound network calls of any kind, so it works offline and cannot be
 * rate-limited or have a key revoked out from under it.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeDay, computePositions, matchKutas, AYANAMSA_NAMES,
  jdToIso, localToJd, REMEDY_CATALOGUE,
  deepCompatibility, KUTA_MEANING, scoreBand, SCORE_CAVEAT, natalSummary,
  dashaOutlook, antardashaNote,
  ekadashis, chaturmasya, sunrise as sunriseAt, aradhanaForYear, sunset as sunsetAt,
  localToUtc, offsetMinutesAtInstant, withGanita, computeMuhurta,
} from '@kaalachakra/ganita';
import { localiseDay, LANGUAGES } from './localise.js';
import { Gazetteer } from '@kaalachakra/places';
import { openDb } from './db/index.js';
import {
  listProfilesFor, getProfileFor, listShares, upsertShare, deleteShare, createProfile, updateProfile,
  deleteProfile, summaryFor, janmaFor, dashaFor, saturnFor, chartFor,
  currentDashaFor, nowJd,
} from './profiles.js';
import {
  panchangaQuerySchema, profileBodySchema, matchBodySchema,
  placeSearchSchema, dashaQuerySchema, ganitaEnum, muhurtaQuerySchema, ganitaQuerySchema,
} from './schemas.js';
import { registerAuth } from './auth/plugin.js';
import { getUserByEmail } from './auth/store.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Year-scoped computation cache.
 *
 * Aradhana and Chaturmasya are properties of a (year, place, ayanamsa), not of
 * a day or a month - but /month needs both, so browsing Jan..Dec used to
 * recompute the same year twelve times. The aradhana pass alone was the single
 * largest cost in the Calendar tab.
 *
 * Bounded so a long-running server cannot grow without limit; the working set
 * is tiny (one entry per year the user actually looks at).
 */
const YEAR_CACHE_MAX = 64;
const yearCache = new Map();

function cachedYear(key, compute) {
  if (yearCache.has(key)) {
    // Refresh recency: delete and re-insert moves it to the end.
    const v = yearCache.get(key);
    yearCache.delete(key);
    yearCache.set(key, v);
    return v;
  }
  const v = compute();
  yearCache.set(key, v);
  if (yearCache.size > YEAR_CACHE_MAX) {
    yearCache.delete(yearCache.keys().next().value); // evict least-recent
  }
  return v;
}

/** Place identity for cache keys - rounded, since metres do not change a year. */
const placeKey = (p, ayanamsa, ganita) =>
  `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)},${p.tzOffsetHours},${ayanamsa},${ganita}`;
const DB_PATH = process.env.KAALACHAKRA_DB ?? join(here, '..', 'data', 'kaalachakra.db');
const PORT = Number(process.env.PORT ?? 5174);
const HOST = process.env.HOST ?? '127.0.0.1';

export async function build({ dbPath = DB_PATH, logger = true, adminInitialPassword } = {}) {
  const app = Fastify({
    logger,
    // `removeAdditional: false` keeps unknown query params in `req.query`
    // rather than silently stripping them. It does NOT reject them - the
    // schemas would need `additionalProperties: false` for that, which they
    // deliberately do not set, so a stray param is ignored by the handler.
    // (An earlier comment here claimed rejection; it never did.)
    ajv: { customOptions: { coerceTypes: true, removeAdditional: false, useDefaults: true } },
  });

  /**
   * Treat an empty body as "no body", whatever content-type was declared.
   *
   * Fastify's stock JSON parser answers an empty body under
   * `content-type: application/json` with "Body cannot be empty" and a 500.
   * That is the wrong status for a well-formed request - nothing failed on
   * the server - and it made DELETE /profiles/:id fail outright for any
   * client that sets the header by default, which most HTTP wrappers do. The
   * client has been fixed not to send it, but the server should not be one
   * stray header away from a 500 either. Malformed JSON is still a 400.
   */
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === undefined || body === null || body === '') return done(null, undefined);
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  const db = openDb(dbPath);

  // The gazetteer is optional so the API still boots (degraded) before anyone
  // has run the build script. Place routes then return 503 with instructions
  // rather than the whole server failing to start.
  let gazetteer = null;
  let gazetteerError = null;
  try {
    gazetteer = new Gazetteer();
  } catch (e) {
    gazetteerError = e.message;
    app.log.warn(`gazetteer unavailable: ${e.message}`);
  }

  // Register auth plugin before any routes
  const dataDir = dbPath === ':memory:' ? await import('node:fs').then(m => m.mkdtempSync('/tmp/kaalachakra-')) : dirname(resolve(dbPath));
  await registerAuth(app, { db, dataDir, adminInitialPassword });

  // CORS settings
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true
  });
  
  // Register swagger and swagger-ui ONLY when not in production
  if (process.env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Kaalachakra API',
          description:
            'Madhwa / South-Indian Kannada panchanga and jyotisha engine. ' +
            'Fully offline: vendored Swiss Ephemeris, local gazetteer, local SQLite.',
          version: '0.1.0',
        },
      },
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  // Janma nakshatra and rashi are derived on read in the requested ganita
  // (Surya Siddhanta by default - the Uttaradi Math reckoning).
  const janmaIn = (g, p) => withGanita(g, () => janmaFor(p));

  app.decorate('db', db);
  app.decorate('gazetteer', gazetteer);
  app.addHook('onClose', async () => {
    db.close();
    gazetteer?.close();
  });

  /* ------------------------------------------------------------- health */

  app.get('/health', async () => ({
    ok: true
  }));

  /* ---------------------------------------------------------- panchanga */

  app.get('/panchanga', { schema: { querystring: panchangaQuerySchema } }, async (req, reply) => {
    const q = req.query;
    const place = resolvePlace(q, gazetteer);
    if (place.error) return reply.code(400).send({ error: place.error });

    const day = withGanita(q.ganita, () => computeDay({
      date: { year: q.year, month: q.month, day: q.day },
      place,
      ayanamsa: q.ayanamsa,
    }));

    // The day-summary box is per-profile. If no profiles exist, the UI must
    // not render the box at all - so we return an explicit empty array and a
    // flag rather than null, which a client could mistake for "loading".
    const profiles = listProfilesFor(db, req.session.user.id);
    // The person's janma nakshatra and dasha follow the same ganita as the day.
    const summaries = withGanita(q.ganita, () => (q.profileId
      ? [getProfileFor(db, req.session.user.id, q.profileId)].filter(Boolean).map((p) => summaryFor(p, day))
      : profiles.map((p) => summaryFor(p, day))));

    // Localisation is applied at the API boundary, never inside the engine.
    return { panchanga: localiseDay(day), hasProfiles: profiles.length > 0, summaries };
  });

  app.get('/positions', { schema: { querystring: panchangaQuerySchema } }, async (req, reply) => {
    const q = req.query;
    const place = resolvePlace(q, gazetteer);
    if (place.error) return reply.code(400).send({ error: place.error });
    return computePositions({
      date: { year: q.year, month: q.month, day: q.day, hour: 12 },
      place,
      ayanamsa: q.ayanamsa,
    });
  });

  /* ------------------------------------------------------------ muhurta */

  /**
   * Muhurta for a date: the day's shubha/ashubha verdict with every point
   * behind it, the day's lagna windows, and the next shubha days - for an
   * event, and for a person when profileId is given (tarabala, chandrabala,
   * janma-ashtama lagna). Every point carries its basis; see muhurta.js.
   */
  app.get('/muhurta', { schema: { querystring: muhurtaQuerySchema } }, async (req, reply) => {
    const q = req.query;
    const place = resolvePlace(q, gazetteer);
    if (place.error) return reply.code(400).send({ error: place.error });
    let profile = null, janma = null, janmaLagna = null;
    if (q.profileId) {
      profile = getProfileFor(db, req.session.user.id, q.profileId);
      if (!profile) return reply.code(404).send({ error: 'profile not found' });
      janma = janmaIn(q.ganita, profile);
      janmaLagna = chartFor(profile).lagna.rashi;
    }
    // The forward search crosses dates, so each date gets its own offset when
    // the zone is known (DST).
    const zone = place.timezone;
    const searchPlace = zone
      ? { ...place, tzOffsetFor: (d) => localToUtc({ ...d, hour: 12 }, zone).offsetHours }
      : place;
    const result = withGanita(q.ganita, () => computeMuhurta({
      date: { year: q.year, month: q.month, day: q.day }, place: searchPlace,
      ayanamsa: q.ayanamsa, event: q.event, profile, janma, janmaLagna, veda: q.veda ?? null,
      nextCount: q.count, horizonDays: q.horizonDays,
    }));
    return {
      ...result,
      place: { ...place },
      profile: profile && { id: profile.id, name: profile.name, sampradaya: profile.sampradaya },
      janma,
      tzOffsetHours: place.tzOffsetHours,
    };
  });

  /* -------------------------------------------------------- month grid */

  const monthQuery = {
    type: 'object',
    required: ['year', 'month', 'latitude', 'longitude'],
    properties: {
      year: { type: 'integer', minimum: 1900, maximum: 2200 },
      month: { type: 'integer', minimum: 1, maximum: 12 },
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      altitude: { type: 'number', minimum: -500, maximum: 9000 },
      tzOffsetHours: { type: 'number', minimum: -12, maximum: 14 },
      timezone: { type: 'string', maxLength: 64 },
      ayanamsa: { type: 'string' },
      ganita: ganitaEnum,
    },
  };

  /**
   * One month of panchanga in a single request.
   *
   * A day-by-day grid needs ~31 days of data; fetching them one at a time
   * would be 31 round trips and 31 gazetteer lookups for the same place.
   * computeDay costs a few milliseconds, so a whole month is well under a
   * second server-side and one request client-side.
   */
  app.get('/month', { schema: { querystring: monthQuery } }, async (req, reply) =>
    withGanita(req.query.ganita, () => monthHandler(req, reply)));

  function monthHandler(req, reply) {
    const q = req.query;
    // resolvePlace derives the historical UTC offset from a concrete date, so
    // it needs a day-of-month. Mid-month avoids sitting on a DST boundary.
    const place = resolvePlace({ ...q, day: 15 }, gazetteer);
    if (place.error) return reply.code(400).send({ error: place.error });
    const tz = place.tzOffsetHours;
    const ayanamsa = q.ayanamsa ?? 'trueCitra';

    // Aradhana and Chaturmasya are year-scoped, so resolve them once and
    // index by date rather than recomputing per day.
    const ck = `${q.year}|${placeKey(place, ayanamsa, q.ganita)}`;

    const aradhanaIndex = cachedYear(`aradhana|${ck}`, () => {
      const map = new Map();
      try {
        for (const a of aradhanaForYear({
          year: q.year,
          sunriseFn: (jd) => sunriseAt(jd, place),
          sunsetFn: (jd) => sunsetAt(jd, place),
          ayanamsaName: ayanamsa, localToJd, tzOffsetHours: tz,
        })) {
          if (a.jd === null) continue;
          const key = jdToIso(a.jd, tz).slice(0, 10);
          map.set(key, [...(map.get(key) ?? []), a.name]);
        }
      } catch (e) { req.log.warn({ e }, 'aradhana index failed'); }
      return map;
    });

    const vratas = cachedYear(`chaturmasya|${ck}`, () => {
      try {
        return chaturmasya({
          year: q.year, sunriseFn: (jd) => sunriseAt(jd, place),
          ayanamsaName: ayanamsa, tzOffsetHours: tz, localToJd,
        }).vratas;
      } catch (e) { req.log.warn({ e }, 'chaturmasya failed'); return []; }
    });

    const daysInMonth = new Date(Date.UTC(q.year, q.month, 0)).getUTCDate();
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      let day;
      try {
        // The offset is per DAY, not per month: a US or European month that
        // contains a DST change would otherwise print every time after the
        // change an hour off.
        const dayPlace = place.timezone
          ? { ...place, tzOffsetHours: localToUtc({ year: q.year, month: q.month, day: d, hour: 12 }, place.timezone).offsetHours }
          : place;
        day = computeDay({ date: { year: q.year, month: q.month, day: d }, place: dayPlace, ayanamsa });
      } catch (e) {
        // A polar latitude has no sunrise; report the day as unavailable
        // rather than failing the whole month.
        days.push({ day: d, date: null, error: e.message });
        continue;
      }
      const l = localiseDay(day);
      const iso = jdToIso(day.sun.riseJd, day.date.tzOffsetHours).slice(0, 10);
      const vrata = vratas.find(
        (v) => v.startJd !== null && v.endJd !== null &&
               day.sun.riseJd >= v.startJd && day.sun.riseJd <= v.endJd
      );

      days.push({
        day: d,
        date: iso,
        vara: { index: day.vara.index, name: day.vara.name, names: l.vara.names },
        tithi: {
          index: day.tithi.index, paksha: day.tithi.paksha, name: day.tithi.name,
          numberInPaksha: day.tithi.numberInPaksha, end: day.tithi.end,
          names: l.tithi.names, pakshaNames: l.tithi.pakshaNames,
          isPurnima: day.tithi.isPurnima, isAmavasya: day.tithi.isAmavasya,
        },
        nakshatra: { name: day.nakshatra.name, pada: day.nakshatra.pada, end: day.nakshatra.end, names: l.nakshatra.names },
        yoga: { name: day.yoga.name, end: day.yoga.end },
        karana: { name: day.karana.name, end: day.karana.end },
        masa: { name: day.masa.name, displayName: day.masa.displayName, isAdhika: day.masa.isAdhika, names: l.masa?.names ?? null },
        samvatsara: day.samvatsara.name,
        ritu: day.ritu.name,
        sun: { rise: day.sun.rise, set: day.sun.set },
        moon: { rise: day.moon.rise, set: day.moon.set },
        kaala: {
          rahu: { start: day.kaala.rahu.start, end: day.kaala.rahu.end },
          gulika: { start: day.kaala.gulika.start, end: day.kaala.gulika.end },
          yamaganda: { start: day.kaala.yamaganda.start, end: day.kaala.yamaganda.end },
          abhijit: { start: day.kaala.abhijit.start, end: day.kaala.abhijit.end, applies: day.kaala.abhijit.applies },
        },
        ekadashi: day.ekadashi
          ? {
              role: day.ekadashi.role,
              isFastDayToday: day.ekadashi.isFastDayToday,
              isParaneToday: day.ekadashi.isParaneToday,
              athiriktha: Boolean(day.ekadashi.paarane?.athiriktha),
              shiftedByADay: day.ekadashi.shiftedByADay,
              kshaya: day.ekadashi.kshayaEkadashi,
              explanation: day.ekadashi.explanation,
            }
          : null,
        // The Math's day mark and the shubha/ashubha yogas, compact.
        dayQuality: day.muhurta?.dayQuality?.quality ?? null,
        yogas: day.muhurta?.yogas?.filter((y) => y.nature !== 'shubha' || !y.name.includes('nitya')).map((y) => ({ name: y.name, nature: y.nature })) ?? [],
        aradhana: aradhanaIndex.get(iso) ?? [],
        chaturmasya: vrata ? { id: vrata.id, name: vrata.name } : null,
      });
    }

    return { year: q.year, month: q.month, place, ganita: q.ganita, days };
  }

  /* ------------------------------------------------------------ nirnaya */

  const yearQuery = {
    type: 'object',
    required: ['year', 'latitude', 'longitude'],
    properties: {
      year: { type: 'integer', minimum: 1200, maximum: 2800 },
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      altitude: { type: 'number', minimum: -500, maximum: 9000 },
      tzOffsetHours: { type: 'number', minimum: -12, maximum: 14 },
      timezone: { type: 'string', maxLength: 64 },
      ayanamsa: { type: 'string' },
      ganita: ganitaEnum,
    },
  };

  /** Every Ekadashi in a year, with the Madhwa arunodaya nirnaya applied. */
  app.get('/ekadashis', { schema: { querystring: yearQuery } }, async (req, reply) =>
    withGanita(req.query.ganita, () => ekadashisHandler(req, reply)));

  function ekadashisHandler(req, reply) {
    const q = { ...req.query, month: 1, day: 1 };
    const place = resolvePlace(q, gazetteer);
    if (place.error) return reply.code(400).send({ error: place.error });

    const tz = place.tzOffsetHours;
    // Each instant is printed with the offset in force AT THAT INSTANT; the
    // Jan-1 offset printed every summer paarane an hour off in DST zones.
    const tzAt = (jd) => (place.timezone
      ? offsetMinutesAtInstant(place.timezone, new Date((jd - 2440587.5) * 86400000)) / 60
      : tz);
    const at = (jd) => jdToIso(jd, tzAt(jd));
    const list = ekadashis({
      fromJd: localToJd({ year: q.year, month: 1, day: 1 }, tz),
      // Through the END of 31 December: the window is in midnights but the
      // scan steps in sunrises, and ending at the midnight that STARTS 31
      // December dropped an Ekadashi on that day from both years' lists.
      toJd: localToJd({ year: q.year, month: 12, day: 31 }, tz) + 1,
      sunriseFn: (jd) => sunriseAt(jd, place),
      sunsetFn: (jd) => sunsetAt(jd, place),
      ayanamsaName: q.ayanamsa ?? 'trueCitra',
    });

    return {
      year: q.year,
      place,
      count: list.length,
      ekadashis: list.map((e) => ({
        masa: e.masa.displayName,
        paksha: e.paksha,
        candidateDate: at(e.nirnaya.candidateSunriseJd).slice(0, 10),
        madhwaDate: at(e.nirnaya.madhwaSunriseJd).slice(0, 10),
        shiftedByADay: e.nirnaya.shiftedByADay,
        kshaya: e.nirnaya.kshayaEkadashi,
        explanation: e.nirnaya.explanation,
        arunodaya: at(e.nirnaya.arunodaya.jd).slice(11, 16),
        athiriktha: e.paarane?.athiriktha
          ? { date: at(e.paarane.athiriktha.jd).slice(0, 10), note: e.paarane.athiriktha.note }
          : null,
        paarane: e.paarane?.window
          ? {
              date: at(e.paarane.window.startJd).slice(0, 10),
              from: at(e.paarane.window.startJd).slice(11, 16),
              to: at(e.paarane.window.endJd).slice(11, 16),
              constrainedBy: e.paarane.constrainedBy,
              harivasaraEnds: at(e.paarane.harivasara.endJd).slice(11, 16),
              deferred: e.paarane.deferred ?? null,
            }
          : { error: e.paarane?.reason ?? 'unavailable' },
      })),
    };
  }

  /** The four Chaturmasya vratas for a year. */
  app.get('/chaturmasya', { schema: { querystring: yearQuery } }, async (req, reply) =>
    withGanita(req.query.ganita, () => chaturmasyaHandler(req, reply)));

  function chaturmasyaHandler(req, reply) {
    const q = { ...req.query, month: 1, day: 1 };
    const place = resolvePlace(q, gazetteer);
    if (place.error) return reply.code(400).send({ error: place.error });
    const tz = place.tzOffsetHours;

    const c = chaturmasya({
      year: q.year,
      sunriseFn: (jd) => sunriseAt(jd, place),
      ayanamsaName: q.ayanamsa ?? 'trueCitra',
      tzOffsetHours: tz,
      localToJd,
    });
    const fmt = (jd) => (jd === null ? null : jdToIso(jd, tz).slice(0, 10));
    return {
      year: c.year,
      vratas: c.vratas.map((v) => ({ ...v, start: fmt(v.startJd), end: fmt(v.endJd) })),
      overall: { ...c.overall, start: fmt(c.overall.startJd), end: fmt(c.overall.endJd) },
      marriageBlackout: {
        ...c.marriageBlackout,
        start: fmt(c.marriageBlackout.startJd),
        end: fmt(c.marriageBlackout.endJd),
      },
    };
  }

  /** Madhwa yatigalu aradhana (punyatithi) calendar for a year. */
  app.get('/aradhana', { schema: { querystring: yearQuery } }, async (req, reply) =>
    withGanita(req.query.ganita, () => aradhanaHandler(req, reply)));

  function aradhanaHandler(req, reply) {
    const q = { ...req.query, month: 1, day: 1 };
    const place = resolvePlace(q, gazetteer);
    if (place.error) return reply.code(400).send({ error: place.error });
    const tz = place.tzOffsetHours;
    const ay = q.ayanamsa ?? 'trueCitra';
    const list = cachedYear(`aradhanaList|${q.year}|${placeKey(place, ay, q.ganita)}`, () =>
      aradhanaForYear({
        year: q.year,
        sunriseFn: (jd) => sunriseAt(jd, place),
        sunsetFn: (jd) => sunsetAt(jd, place),
        ayanamsaName: ay,
        localToJd,
        tzOffsetHours: tz,
      }));
    return {
      year: q.year,
      count: list.length,
      aradhanas: list.map((a) => ({
        name: a.name,
        date: a.jd === null ? null : jdToIso(a.jd, tz).slice(0, 10),
        masa: a.masa, paksha: a.paksha, tithi: a.tithi, tithiName: a.tithiName,
        adhikaMasa: a.adhikaMasa ?? false,
        vriddhiResolved: a.vriddhiResolved ?? false,
        confidence: a.confidence,
      })),
    };
  }

  /* ------------------------------------------------------------- places */

  app.get('/places/search', { schema: { querystring: placeSearchSchema } }, async (req, reply) => {
    if (!gazetteer) return reply.code(503).send({ error: gazetteerUnavailable(gazetteerError) });
    const { q, limit, country, anyCountry } = req.query;
    return { results: gazetteer.search(q, { limit, country, anyCountry }) };
  });

  /**
   * Major cities, for a plain dropdown.
   *
   * The gazetteer holds 579k places - far too many for a <select>. This
   * returns the most populous, which covers the overwhelming majority of
   * real selections; anything else is reachable through the search box.
   */
  app.get('/places/top', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          country: { type: 'string', minLength: 2, maxLength: 2, default: 'IN' },
          // The ceiling is generous because the dropdown loads a small page
          // first and then backfills a much larger one in the background;
          // capping at 1000 would have forced a second round trip for no
          // reason. The gazetteer's own `top` is a single indexed scan.
          limit: { type: 'integer', minimum: 1, maximum: 5000, default: 300 },
        },
      },
    },
  }, async (req, reply) => {
    if (!gazetteer) return reply.code(503).send({ error: gazetteerUnavailable(gazetteerError) });
    return { results: gazetteer.top(req.query.country, req.query.limit) };
  });

  app.get('/places/resolve', {
    schema: {
      querystring: {
        type: 'object',
        required: ['latitude', 'longitude'],
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
        },
      },
    },
  }, async (req, reply) => {
    if (!gazetteer) return reply.code(503).send({ error: gazetteerUnavailable(gazetteerError) });
    return gazetteer.resolveCoordinate(req.query.latitude, req.query.longitude);
  });

  /* ----------------------------------------------------------- profiles */

  app.get('/profiles', { schema: { querystring: ganitaQuerySchema } }, async (req) => ({
    profiles: listProfilesFor(db, req.session.user.id).map((p) => ({ ...p, janma: janmaIn(req.query.ganita, p) })),
  }));

  app.get('/profiles/:id', { schema: { querystring: ganitaQuerySchema } }, async (req, reply) => {
    const p = getProfileFor(db, req.session.user.id, req.params.id);
    if (!p) return reply.code(404).send({ error: 'profile not found' });
    return { ...p, janma: janmaIn(req.query.ganita, p) };
  });

  app.post('/profiles', { schema: { body: profileBodySchema, querystring: ganitaQuerySchema } }, async (req, reply) => {
    const created = createProfile(db, req.body, gazetteer, req.session.user.id);
    return reply.code(201).send({ ...created, janma: janmaIn(req.query.ganita, created) });
  });

  app.put('/profiles/:id', { schema: { body: profileBodySchema, querystring: ganitaQuerySchema } }, async (req, reply) => {
    // Private by default: another user's profile is indistinguishable from a
    // missing one (404); a view-only share may read but not change it.
    const existing = getProfileFor(db, req.session.user.id, req.params.id);
    if (!existing) return reply.code(404).send({ error: 'profile not found' });
    if (existing.access === 'view') return reply.code(403).send({ error: 'read-only share' });
    const updated = updateProfile(db, req.params.id, req.body, gazetteer);
    return { ...updated, janma: janmaIn(req.query.ganita, updated) };
  });

  app.delete('/profiles/:id', async (req, reply) => {
    const existing = getProfileFor(db, req.session.user.id, req.params.id);
    if (!existing) return reply.code(404).send({ error: 'profile not found' });
    if (existing.access !== 'owner') return reply.code(403).send({ error: 'only the owner can delete' });
    deleteProfile(db, req.params.id); // its shares go with it (ON DELETE CASCADE)
    return reply.code(204).send();
  });

  /* ------------------------------------------------------------ sharing */

  /** Only the owner sees or changes who a profile is shared with. */
  function ownedProfile(req, reply) {
    const p = getProfileFor(db, req.session.user.id, req.params.id);
    if (!p) { reply.code(404).send({ error: 'profile not found' }); return null; }
    if (p.access !== 'owner') { reply.code(403).send({ error: 'only the owner can manage sharing' }); return null; }
    return p;
  }

  app.get('/profiles/:id/shares', async (req, reply) => {
    const p = ownedProfile(req, reply);
    if (!p) return reply;
    return { shares: listShares(db, p.id) };
  });

  app.post('/profiles/:id/shares', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'permission'],
        properties: {
          email: { type: 'string', maxLength: 254 },
          permission: { type: 'string', enum: ['view', 'edit'] },
        },
      },
    },
  }, async (req, reply) => {
    const p = ownedProfile(req, reply);
    if (!p) return reply;
    const target = getUserByEmail(db, req.body.email.trim());
    if (!target) return reply.code(404).send({ error: 'no such account' });
    if (target.id === req.session.user.id) return reply.code(400).send({ error: 'cannot share with yourself' });
    upsertShare(db, p.id, target.id, req.body.permission);
    return reply.code(204).send();
  });

  // The owner removes a share, or the person it was shared with leaves it.
  app.delete('/profiles/:id/shares/:userId', async (req, reply) => {
    const p = getProfileFor(db, req.session.user.id, req.params.id);
    if (!p) return reply.code(404).send({ error: 'profile not found' });
    const leaving = req.params.userId === req.session.user.id;
    if (p.access !== 'owner' && !leaving) return reply.code(403).send({ error: 'only the owner can manage sharing' });
    if (!deleteShare(db, p.id, req.params.userId)) return reply.code(404).send({ error: 'no such share' });
    return reply.code(204).send();
  });

  /* -------------------------------------------------------------- dasha */

  /**
   * The natal chart for one profile, in the shape a kundali is drawn from.
   *
   * Its own route rather than a field on /profiles/:id: the list view never
   * needs it, and computing nine sidereal longitudes plus the ascendant for
   * every profile on every list render would be paid for constantly and used
   * rarely.
   */
  app.get('/profiles/:id/chart', { schema: { querystring: ganitaQuerySchema } }, async (req, reply) => {
    const p = getProfileFor(db, req.session.user.id, req.params.id);
    if (!p) return reply.code(404).send({ error: 'profile not found' });
    const janma = janmaIn(req.query.ganita, p);
    const chart = natalSummary(chartFor(p));
    return {
      profile: { id: p.id, name: p.name, gender: p.gender },
      birth: p.birth,
      place: p.place,
      ayanamsa: p.ayanamsa,
      chart,
      janma,
      // The kundali's grahas are drik positions (the Surya Siddhanta planetary
      // theory is not implemented); the janma nakshatra and rashi follow the
      // chosen ganita. Say so when they can disagree.
      reckoningNote: janma.ganita === 'surya'
        ? 'Sri Uttaradi Math reckoning: Surya and Chandra (and so the janma nakshatra and rashi) by Surya Siddhanta; the other grahas and the lagna from the modern ephemeris (' + p.ayanamsa + ' ayanamsa) - the same mix the Math\'s own panchanga uses, whose printed planetary ingresses follow the modern positions, not the Siddhanta\'s.'
        : null,
    };
  });

  app.get('/profiles/:id/dasha', { schema: { querystring: dashaQuerySchema } }, async (req, reply) =>
    withGanita(req.query.ganita, () => dashaHandler(req, reply)));

  function dashaHandler(req, reply) {
    const p = getProfileFor(db, req.session.user.id, req.params.id);
    if (!p) return reply.code(404).send({ error: 'profile not found' });

    const fromYear = req.query.fromYear ?? p.birth.year;
    const toYear = req.query.toYear ?? p.birth.year + 100;

    const vimshottari = dashaFor(p, req.query.depth ?? 2);
    const chart = chartFor(p);

    /*
     * Attach the outlook to every mahadasha, not just the running one.
     *
     * The page shows a hundred-year timeline, and the question a reader has
     * at any bar is "what does THAT stretch mean for me". Computing all nine
     * costs nine table lookups plus the chart, which is already built for the
     * lordship reckoning - so there is nothing to gain by making it lazy and
     * a round trip to lose.
     */
    const periods = vimshottari.periods.map((m) => ({
      ...m,
      outlook: dashaOutlook(chart, m.graha),
      children: m.children?.map((a) => ({
        ...a,
        note: antardashaNote(m.graha, a.graha),
      })),
    }));

    /*
     * The chain running right now, so the page can open on it. Derived from
     * the SAME tree that is being returned, not recomputed - otherwise the
     * highlighted period could disagree with the timeline beneath it.
     */
    const at = nowJd();
    const current = currentDashaFor(p, vimshottari, at);

    return {
      vimshottari: { ...vimshottari, periods },
      current,
      currentJd: at,
      saturn: saturnFor(p, fromYear, toYear),
      lagna: chart.lagna,
      janma: janmaFor(p),
      tzOffsetHours: p.place.tzOffsetHours,
    };
  }

  /* ----------------------------------------------------------- matching */

  app.post('/match', { schema: { body: matchBodySchema, querystring: ganitaQuerySchema } }, async (req, reply) =>
    withGanita(req.query.ganita, () => matchHandler(req, reply)));

  function matchHandler(req, reply) {
    const b = req.body;
    const resolveSide = (explicit, profileId, who) => {
      if (explicit) return { point: explicit, profile: null };
      if (!profileId) return { error: `provide either ${who} or ${who}ProfileId` };
      const p = getProfileFor(db, req.session.user.id, profileId);
      if (!p) return { error: `${who} profile not found` };
      const j = janmaFor(p);
      return { point: { nakshatra: j.nakshatra.index, pada: j.nakshatra.pada }, profile: p };
    };

    const bride = resolveSide(b.bride, b.brideProfileId, 'bride');
    const groom = resolveSide(b.groom, b.groomProfileId, 'groom');
    if (bride.error) return reply.code(400).send({ error: bride.error });
    if (groom.error) return reply.code(400).send({ error: groom.error });

    const result = matchKutas(bride.point, groom.point);

    // Annotate each factor with what it signifies and what its score is worth.
    // Joined on the factor's own `name`, so a renamed factor fails loudly here
    // rather than silently losing its explanation.
    const factors = result.factors.map((f) => ({ ...f, meaning: KUTA_MEANING[f.name] ?? null }));

    /*
     * The deep analysis needs BOTH CHARTS, which exist only when both sides
     * came from stored profiles - a caller who passed a bare nakshatra and
     * pada has given us no birth time or place, and an ascendant cannot be
     * invented from a nakshatra. In that case the kuta layer is returned
     * alone, with a reason, rather than a half-built analysis.
     */
    let deep = null;
    let deepUnavailable = null;
    if (bride.profile && groom.profile) {
      deep = deepCompatibility({
        brideChart: chartFor(bride.profile),
        groomChart: chartFor(groom.profile),
      });
    } else {
      deepUnavailable =
        'The house-level analysis needs both birth charts. Select stored ' +
        'profiles on both sides - a nakshatra and pada alone carry no birth ' +
        'time or place, and the ascendant, Mangala dosha and the 7th house ' +
        'all depend on them.';
    }

    return {
      ...result,
      factors,
      scoreBand: scoreBand(result.points.obtained),
      scoreCaveat: SCORE_CAVEAT,
      deep,
      deepUnavailable,
      brideProfile: bride.profile && { id: bride.profile.id, name: bride.profile.name, gender: bride.profile.gender },
      groomProfile: groom.profile && { id: groom.profile.id, name: groom.profile.name, gender: groom.profile.gender },
      ganita: req.query.ganita,
    };
  }

  /* ---------------------------------------------------------- reference */

  app.get('/reference/remedies', async () => ({ catalogue: REMEDY_CATALOGUE }));

  /* ------------------------------------------------------ error shaping */

  app.setErrorHandler((err, req, reply) => {
    // RangeError/TypeError from the engine are the caller's fault (bad date,
    // polar latitude, unknown ayanamsa) and deserve a 400 with the engine's
    // own message, which is written to be actionable.
    if (err instanceof RangeError || err instanceof TypeError) {
      req.log.info({ err }, 'rejected input');
      return reply.code(400).send({ error: err.message });
    }
    if (err.validation) {
      return reply.code(400).send({ error: 'validation failed', details: err.validation });
    }
    // An error that already carries a 4xx has classified itself: malformed
    // JSON, a body over the limit, an unsupported media type. Overwriting
    // that with 500 tells the caller the server broke when the request did,
    // and it hid a real client bug - a DELETE that Fastify had correctly
    // rejected with 400 was reported as "internal error", which is where you
    // stop looking at your own request. 5xx still falls through to the
    // generic message, so nothing internal is disclosed.
    if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500) {
      req.log.info({ err }, 'rejected request');
      return reply.code(err.statusCode).send({ error: err.message });
    }
    req.log.error({ err }, 'unhandled');
    return reply.code(500).send({ error: 'internal error' });
  });

  return app;
}

/**
 * Turn query params into the place shape the engine wants.
 *
 * If only an IANA `timezone` is given we still need a numeric offset for the
 * requested DATE, because offsets are historical. We resolve it against noon
 * of that day, which is never inside a DST transition window.
 */
function resolvePlace(q, gazetteer) {
  const callerGaveAltitude = Number.isFinite(q.altitude);
  const place = {
    latitude: q.latitude,
    longitude: q.longitude,
    altitude: callerGaveAltitude ? q.altitude : 0,
  };

  // Even when the offset is explicit we still want the gazetteer's elevation,
  // so resolve the place first and only then short-circuit on the offset.
  if (!callerGaveAltitude && gazetteer) {
    const r = gazetteer.resolveCoordinate(q.latitude, q.longitude);
    if (r.resolved) {
      place.altitude = r.elevation;
      place.elevationSource = r.elevationSource;
      place.resolvedName = r.name;
    }
  }

  if (Number.isFinite(q.tzOffsetHours)) {
    place.tzOffsetHours = q.tzOffsetHours;
    return place;
  }

  let zone = q.timezone;
  if (!zone && gazetteer) {
    const r = gazetteer.resolveCoordinate(q.latitude, q.longitude);
    if (r.resolved) zone = r.timezone;
  }
  if (!zone) {
    return {
      error:
        'could not determine a timezone for this coordinate. Supply ' +
        'tzOffsetHours or an IANA timezone explicitly - guessing from ' +
        'longitude would be wrong by up to an hour.',
    };
  }

  // Local NOON of the requested date, resolved through the engine's own
  // historical-offset code. The previous inline copy parsed only "GMT+hh:mm"
  // and silently fell back to UTC for anything else - and every zone reports
  // its local-mean-time offset with SECONDS before it adopted a standard time
  // (Asia/Kolkata is +05:21:10 until 1906), so Indian dates 1900-1905 were
  // computed five and a half hours off without a word.
  place.tzOffsetHours = localToUtc({ year: q.year, month: q.month, day: q.day, hour: 12 }, zone).offsetHours;
  place.timezone = zone;
  return place;
}

function gazetteerUnavailable(msg) {
  return (
    'place lookup unavailable: ' + msg +
    ' Run: node packages/places/scripts/build-gazetteer.mjs <dataDir> packages/places/data/gazetteer.db'
  );
}

// Only listen when run directly, so tests can import `build()`.
if (import.meta.url === `file://${process.argv[1]}` ||
    resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
  const app = await build();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
