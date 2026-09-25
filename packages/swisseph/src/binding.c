/*
 * @kaalachakra/swisseph - N-API binding over a vendored Swiss Ephemeris 2.09.03.
 *
 * Written against the stable Node-API (NAPI_VERSION=8) rather than nan/V8, so
 * this compiles unchanged across Node major versions. Exposes only the calls
 * the Kaalachakra engine needs; adding one is ~15 lines.
 *
 * Swiss Ephemeris is (C) Astrodienst AG, dual-licensed GPL-2.0-or-later or
 * the Swiss Ephemeris Professional License. See vendor/swephexp.h. Choosing a
 * licence is required before activating any public service using this code.
 */
#include <node_api.h>
#include <string.h>
#include <stdlib.h>
#include "swephexp.h"

#define SERR_LEN AS_MAXCH

/* ---------- small helpers ---------- */

static napi_value mk_double(napi_env env, double v) {
  napi_value r; napi_create_double(env, v, &r); return r;
}
static napi_value mk_string(napi_env env, const char *s) {
  napi_value r; napi_create_string_utf8(env, s, NAPI_AUTO_LENGTH, &r); return r;
}
static void set_d(napi_env env, napi_value o, const char *k, double v) {
  napi_set_named_property(env, o, k, mk_double(env, v));
}
static void set_s(napi_env env, napi_value o, const char *k, const char *v) {
  napi_set_named_property(env, o, k, mk_string(env, v));
}

/* Read argument i as double. Returns 0 and throws if it is not a finite number.
 * This is deliberate: coreserver's `parseInt(x) ?? default` idiom silently let
 * NaN reach the ephemeris. Here a bad input fails loudly at the boundary. */
static int arg_d(napi_env env, napi_value *argv, size_t argc, size_t i,
                 const char *name, double *out) {
  if (i >= argc) {
    napi_throw_type_error(env, NULL, name); return 0;
  }
  double v;
  if (napi_get_value_double(env, argv[i], &v) != napi_ok) {
    napi_throw_type_error(env, NULL, name); return 0;
  }
  if (v != v) { /* NaN */
    napi_throw_range_error(env, NULL, name); return 0;
  }
  *out = v; return 1;
}
static int arg_i(napi_env env, napi_value *argv, size_t argc, size_t i,
                 const char *name, int32_t *out) {
  double d;
  if (!arg_d(env, argv, argc, i, name, &d)) return 0;
  *out = (int32_t)d; return 1;
}

#define ARGS(n)                                                        \
  size_t argc = (n); napi_value argv[(n)]; napi_value thisv;           \
  napi_get_cb_info(env, info, &argc, argv, &thisv, NULL)

#define D(i, name, var) double var; if (!arg_d(env, argv, argc, i, name, &var)) return NULL
#define I(i, name, var) int32_t var; if (!arg_i(env, argv, argc, i, name, &var)) return NULL

/* ---------- setup ---------- */

static napi_value js_set_ephe_path(napi_env env, napi_callback_info info) {
  ARGS(1);
  size_t len = 0;
  char buf[2048];
  if (argc < 1 || napi_get_value_string_utf8(env, argv[0], buf, sizeof(buf), &len) != napi_ok) {
    napi_throw_type_error(env, NULL, "path must be a string");
    return NULL;
  }
  swe_set_ephe_path(buf);
  return NULL;
}

static napi_value js_set_sid_mode(napi_env env, napi_callback_info info) {
  ARGS(3);
  I(0, "sidmode must be a number", sidmode);
  double t0 = 0.0, ayan_t0 = 0.0;
  if (argc > 1) arg_d(env, argv, argc, 1, "t0", &t0);
  if (argc > 2) arg_d(env, argv, argc, 2, "ayan_t0", &ayan_t0);
  swe_set_sid_mode(sidmode, t0, ayan_t0);
  return NULL;
}

static napi_value js_close(napi_env env, napi_callback_info info) {
  (void)info; (void)env;
  swe_close();
  return NULL;
}

static napi_value js_version(napi_env env, napi_callback_info info) {
  (void)info;
  char v[AS_MAXCH];
  swe_version(v);
  return mk_string(env, v);
}

/* ---------- time ---------- */

static napi_value js_julday(napi_env env, napi_callback_info info) {
  ARGS(5);
  I(0, "year", y); I(1, "month", m); I(2, "day", d);
  D(3, "hour", h); I(4, "gregflag", gf);
  return mk_double(env, swe_julday(y, m, d, h, gf));
}

static napi_value js_revjul(napi_env env, napi_callback_info info) {
  ARGS(2);
  D(0, "jd", jd); I(1, "gregflag", gf);
  int y, m, d; double h;
  swe_revjul(jd, gf, &y, &m, &d, &h);
  napi_value o; napi_create_object(env, &o);
  set_d(env, o, "year", y); set_d(env, o, "month", m);
  set_d(env, o, "day", d);  set_d(env, o, "hour", h);
  return o;
}

/* UTC -> JD. Returns both TT and UT1 julian days, as Swiss Ephemeris does. */
static napi_value js_utc_to_jd(napi_env env, napi_callback_info info) {
  ARGS(7);
  I(0, "year", y); I(1, "month", mo); I(2, "day", d);
  I(3, "hour", h); I(4, "minute", mi); D(5, "second", se); I(6, "gregflag", gf);
  double jd[2]; char serr[SERR_LEN]; serr[0] = '\0';
  int rc = swe_utc_to_jd(y, mo, d, h, mi, se, gf, jd, serr);
  napi_value o; napi_create_object(env, &o);
  if (rc < 0) { set_s(env, o, "error", serr); return o; }
  set_d(env, o, "julianDayTT", jd[0]);
  set_d(env, o, "julianDayUT", jd[1]);
  return o;
}

static napi_value js_deltat(napi_env env, napi_callback_info info) {
  ARGS(1);
  D(0, "jd", jd);
  return mk_double(env, swe_deltat(jd));
}

/* ---------- positions ---------- */

static napi_value js_calc_ut(napi_env env, napi_callback_info info) {
  ARGS(3);
  D(0, "jd", jd); I(1, "planet", ipl); I(2, "flags", iflag);
  double xx[6]; char serr[SERR_LEN]; serr[0] = '\0';
  int rc = swe_calc_ut(jd, ipl, iflag, xx, serr);
  napi_value o; napi_create_object(env, &o);
  if (rc < 0) { set_s(env, o, "error", serr); return o; }
  if (serr[0]) set_s(env, o, "warning", serr);
  set_d(env, o, "returnFlag", rc);
  /* Naming follows the ecliptic case, which is what we always request. */
  set_d(env, o, "longitude", xx[0]);
  set_d(env, o, "latitude",  xx[1]);
  set_d(env, o, "distance",  xx[2]);
  set_d(env, o, "longitudeSpeed", xx[3]);
  set_d(env, o, "latitudeSpeed",  xx[4]);
  set_d(env, o, "distanceSpeed",  xx[5]);
  return o;
}

static napi_value js_get_ayanamsa_ut(napi_env env, napi_callback_info info) {
  ARGS(1);
  D(0, "jd", jd);
  return mk_double(env, swe_get_ayanamsa_ut(jd));
}

/* swe_get_ayanamsa_ex_ut honours SEFLG_* (notably SEFLG_TRUEPOS/NONUT) and
 * reports errors, unlike the plain form. Prefer this one. */
static napi_value js_get_ayanamsa_ex_ut(napi_env env, napi_callback_info info) {
  ARGS(2);
  D(0, "jd", jd); I(1, "flags", iflag);
  double daya = 0.0; char serr[SERR_LEN]; serr[0] = '\0';
  int rc = swe_get_ayanamsa_ex_ut(jd, iflag, &daya, serr);
  napi_value o; napi_create_object(env, &o);
  if (rc < 0) { set_s(env, o, "error", serr); return o; }
  set_d(env, o, "ayanamsa", daya);
  set_d(env, o, "returnFlag", rc);
  return o;
}

static napi_value js_get_planet_name(napi_env env, napi_callback_info info) {
  ARGS(1);
  I(0, "planet", ipl);
  char name[AS_MAXCH];
  swe_get_planet_name(ipl, name);
  return mk_string(env, name);
}

/* ---------- houses ---------- */

static napi_value js_houses_ex(napi_env env, napi_callback_info info) {
  ARGS(5);
  D(0, "jd", jd); I(1, "flags", iflag);
  D(2, "lat", lat); D(3, "lon", lon); I(4, "hsys", hsys);
  double cusps[37], ascmc[10];
  char serr[SERR_LEN]; serr[0] = '\0';
  int rc = swe_houses_ex(jd, iflag, lat, lon, hsys, cusps, ascmc);
  napi_value o; napi_create_object(env, &o);
  if (rc < 0) { set_s(env, o, "error", "swe_houses_ex failed"); return o; }
  /* Gauquelin (hsys 'G') returns 36 cusps; every other system returns 12. */
  int ncusp = (hsys == (int)'G' || hsys == (int)'g') ? 36 : 12;
  napi_value arr; napi_create_array_with_length(env, ncusp, &arr);
  for (int i = 0; i < ncusp; i++)
    napi_set_element(env, arr, i, mk_double(env, cusps[i + 1])); /* 1-based in C */
  napi_set_named_property(env, o, "cusps", arr);
  set_d(env, o, "ascendant", ascmc[0]);
  set_d(env, o, "mc",        ascmc[1]);
  set_d(env, o, "armc",      ascmc[2]);
  set_d(env, o, "vertex",    ascmc[3]);
  set_d(env, o, "equatorialAscendant", ascmc[4]);
  set_d(env, o, "kochCoAscendant",     ascmc[5]);
  set_d(env, o, "munkaseyCoAscendant", ascmc[6]);
  set_d(env, o, "munkaseyPolarAscendant", ascmc[7]);
  return o;
}

/* ---------- rise / set / transit ---------- */

static napi_value js_rise_trans(napi_env env, napi_callback_info info) {
  ARGS(8);
  D(0, "jd", jd); I(1, "planet", ipl); I(2, "flags", epheflag);
  I(3, "rsmi", rsmi);
  D(4, "lon", lon); D(5, "lat", lat); D(6, "alt", alt);
  double atpress = 0.0, attemp = 0.0;
  if (argc > 7) arg_d(env, argv, argc, 7, "atpress", &atpress);
  double geopos[3]; geopos[0] = lon; geopos[1] = lat; geopos[2] = alt;
  double tret = 0.0; char serr[SERR_LEN]; serr[0] = '\0';
  int rc = swe_rise_trans(jd, ipl, NULL, epheflag, rsmi, geopos,
                          atpress, attemp, &tret, serr);
  napi_value o; napi_create_object(env, &o);
  if (rc < 0) { set_s(env, o, "error", serr); return o; }
  /* rc == -2 means the event does not occur (polar day/night). Surface it
   * explicitly rather than returning a silently meaningless time. */
  if (rc == -2) { set_s(env, o, "error", "event does not occur at this latitude/date"); return o; }
  set_d(env, o, "transitTime", tret);
  set_d(env, o, "returnFlag", rc);
  return o;
}

/* ---------- module init ---------- */

#define FN(name, fn) do {                                              \
  napi_value f;                                                        \
  napi_create_function(env, name, NAPI_AUTO_LENGTH, fn, NULL, &f);     \
  napi_set_named_property(env, exports, name, f);                      \
} while (0)

#define CONST(name, v) napi_set_named_property(env, exports, name, mk_double(env, (double)(v)))

static napi_value Init(napi_env env, napi_value exports) {
  FN("swe_set_ephe_path", js_set_ephe_path);
  FN("swe_set_sid_mode", js_set_sid_mode);
  FN("swe_close", js_close);
  FN("swe_version", js_version);
  FN("swe_julday", js_julday);
  FN("swe_revjul", js_revjul);
  FN("swe_utc_to_jd", js_utc_to_jd);
  FN("swe_deltat", js_deltat);
  FN("swe_calc_ut", js_calc_ut);
  FN("swe_get_ayanamsa_ut", js_get_ayanamsa_ut);
  FN("swe_get_ayanamsa_ex_ut", js_get_ayanamsa_ex_ut);
  FN("swe_get_planet_name", js_get_planet_name);
  FN("swe_houses_ex", js_houses_ex);
  FN("swe_rise_trans", js_rise_trans);

  /* Bodies */
  CONST("SE_SUN", SE_SUN);       CONST("SE_MOON", SE_MOON);
  CONST("SE_MERCURY", SE_MERCURY); CONST("SE_VENUS", SE_VENUS);
  CONST("SE_MARS", SE_MARS);     CONST("SE_JUPITER", SE_JUPITER);
  CONST("SE_SATURN", SE_SATURN); CONST("SE_URANUS", SE_URANUS);
  CONST("SE_NEPTUNE", SE_NEPTUNE); CONST("SE_PLUTO", SE_PLUTO);
  CONST("SE_MEAN_NODE", SE_MEAN_NODE); CONST("SE_TRUE_NODE", SE_TRUE_NODE);

  /* Calendars */
  CONST("SE_JUL_CAL", SE_JUL_CAL); CONST("SE_GREG_CAL", SE_GREG_CAL);

  /* Calculation flags */
  CONST("SEFLG_SWIEPH", SEFLG_SWIEPH);   CONST("SEFLG_MOSEPH", SEFLG_MOSEPH);
  CONST("SEFLG_SPEED", SEFLG_SPEED);     CONST("SEFLG_SIDEREAL", SEFLG_SIDEREAL);
  CONST("SEFLG_TRUEPOS", SEFLG_TRUEPOS); CONST("SEFLG_NONUT", SEFLG_NONUT);
  CONST("SEFLG_EQUATORIAL", SEFLG_EQUATORIAL);
  CONST("SEFLG_TOPOCTR", SEFLG_TOPOCTR);

  /* Sidereal modes (ayanamsa) */
  CONST("SE_SIDM_LAHIRI", SE_SIDM_LAHIRI);
  CONST("SE_SIDM_TRUE_CITRA", SE_SIDM_TRUE_CITRA);
  CONST("SE_SIDM_RAMAN", SE_SIDM_RAMAN);
  CONST("SE_SIDM_KRISHNAMURTI", SE_SIDM_KRISHNAMURTI);
  CONST("SE_SIDM_TRUE_REVATI", SE_SIDM_TRUE_REVATI);
  CONST("SE_SIDM_TRUE_PUSHYA", SE_SIDM_TRUE_PUSHYA);
  CONST("SE_SIDM_SURYASIDDHANTA", SE_SIDM_SURYASIDDHANTA);
  CONST("SE_SIDM_SURYASIDDHANTA_MSUN", SE_SIDM_SURYASIDDHANTA_MSUN);

  /* Rise/set flags. The Vedic sunrise definition used by Kaalachakra is
   * SE_CALC_RISE | SE_BIT_DISC_CENTER | SE_BIT_NO_REFRACTION |
   * SE_BIT_GEOCTR_NO_ECL_LAT  (see docs/decisions.md). */
  CONST("SE_CALC_RISE", SE_CALC_RISE);   CONST("SE_CALC_SET", SE_CALC_SET);
  CONST("SE_CALC_MTRANSIT", SE_CALC_MTRANSIT);
  CONST("SE_CALC_ITRANSIT", SE_CALC_ITRANSIT);
  CONST("SE_BIT_DISC_CENTER", SE_BIT_DISC_CENTER);
  CONST("SE_BIT_NO_REFRACTION", SE_BIT_NO_REFRACTION);
  CONST("SE_BIT_GEOCTR_NO_ECL_LAT", SE_BIT_GEOCTR_NO_ECL_LAT);
  CONST("SE_BIT_DISC_BOTTOM", SE_BIT_DISC_BOTTOM);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
