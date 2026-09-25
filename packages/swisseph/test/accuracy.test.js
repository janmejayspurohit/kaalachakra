/**
 * Accuracy tests for the vendored Swiss Ephemeris binding.
 *
 * These assert against INDEPENDENTLY KNOWN astronomical values (Meeus,
 * published ayanamsa tables, catalogued lunation times) rather than against
 * another ephemeris library. The point is to catch a mis-wired binding, not to
 * re-verify Astrodienst's arithmetic.
 *
 * Every tolerance below is deliberate. Do not loosen one to make a test pass.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import swe, { AYANAMSA, VEDIC_RISE, norm360, assertInEphemerisRange } from '../lib/index.js';

const J2000 = 2451545.0;
const FLAGS = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
const ARCSEC = 1 / 3600;

/** Assert |a-b| <= tol, reporting the delta in arcseconds. */
function closeDeg(actual, expected, tolDeg, label) {
  const d = Math.abs(actual - expected);
  assert.ok(
    d <= tolDeg,
    `${label}: got ${actual}, expected ~${expected}, ` +
      `Δ=${(d * 3600).toFixed(4)}" tol=${(tolDeg * 3600).toFixed(4)}"`
  );
}

describe('binding wiring', () => {
  test('reports the vendored Swiss Ephemeris version', () => {
    assert.equal(swe.swe_version(), '2.09.03');
  });

  test('rejects NaN instead of passing it to the C layer', () => {
    // coreserver's `parseInt(x) ?? default` let NaN reach swe_utc_to_jd.
    // The binding must fail loudly at the boundary instead.
    assert.throws(() => swe.swe_julday(NaN, 1, 1, 0, swe.SE_GREG_CAL), /year/);
  });

  test('julian day matches the definition of J2000.0', () => {
    assert.equal(swe.swe_julday(2000, 1, 1, 12.0, swe.SE_GREG_CAL), J2000);
  });

  test('revjul round-trips julday', () => {
    const r = swe.swe_revjul(J2000, swe.SE_GREG_CAL);
    assert.deepEqual(
      { year: r.year, month: r.month, day: r.day },
      { year: 2000, month: 1, day: 1 }
    );
    closeDeg(r.hour, 12.0, 1e-9, 'revjul hour');
  });
});

describe('solar position against Meeus', () => {
  // Meeus, Astronomical Algorithms ch.25, evaluated at T=0 (J2000.0):
  //   L0 = 280.46646, M = 357.52911
  //   C  = 1.914602 sin M + 0.019993 sin 2M + 0.000289 sin 3M = -0.084301
  //   true longitude = 280.382159 ; apparent ≈ true - 0.005691 (aberration)
  //                              ≈ 280.3765, then nutation in longitude
  //                                (-13.93" = -0.00387°) → ≈ 280.3726
  // Swiss Ephemeris applies the full VSOP/JPL solution, so agreement to a few
  // arcseconds is the right expectation, not exact equality.
  test('apparent longitude is within 30" of the Meeus series', () => {
    const sun = swe.swe_calc_ut(J2000, swe.SE_SUN, FLAGS);
    assert.ok(!sun.error, sun.error);
    closeDeg(sun.longitude, 280.3726, 30 * ARCSEC, 'Sun apparent longitude');
  });

  test('daily motion and distance are physical', () => {
    const sun = swe.swe_calc_ut(J2000, swe.SE_SUN, FLAGS);
    closeDeg(sun.longitudeSpeed, 1.019, 0.01, 'Sun daily motion');
    // Earth is near perihelion on 3 Jan, so r < 1 AU at J2000.
    closeDeg(sun.distance, 0.9833, 0.0005, 'Sun distance AU');
  });
});

describe('lunar position via a catalogued new moon', () => {
  // The first new moon of 2000 occurred 2000-01-06 18:14 UTC.
  // At conjunction the apparent longitudes of Sun and Moon are equal, which is
  // a far stronger check than any single remembered longitude.
  test('Sun and Moon are conjunct at the Jan 2000 new moon', () => {
    const jd = swe.swe_julday(2000, 1, 6, 18 + 14 / 60, swe.SE_GREG_CAL);
    const sun = swe.swe_calc_ut(jd, swe.SE_SUN, FLAGS);
    const moon = swe.swe_calc_ut(jd, swe.SE_MOON, FLAGS);
    let sep = norm360(moon.longitude - sun.longitude);
    if (sep > 180) sep -= 360;
    // Catalogued lunation times are quoted to the minute; the Moon moves
    // ~0.55°/hr relative to the Sun, so a minute of quoting error is ~0.01°.
    closeDeg(sep, 0, 0.05, 'Sun-Moon elongation at new moon');
  });

  test('moon speed is within the known range 11.76-15.33 deg/day', () => {
    const moon = swe.swe_calc_ut(J2000, swe.SE_MOON, FLAGS);
    assert.ok(
      moon.longitudeSpeed > 11.7 && moon.longitudeSpeed < 15.4,
      `moon speed out of physical range: ${moon.longitudeSpeed}`
    );
  });
});

describe('ayanamsa', () => {
  // Published Lahiri ayanamsa for 2000-01-01 is 23°51'11" = 23.85306°.
  test('Lahiri matches the published table via swe_get_ayanamsa_ex_ut', () => {
    swe.swe_set_sid_mode(AYANAMSA.lahiri, 0, 0);
    const ex = swe.swe_get_ayanamsa_ex_ut(J2000, FLAGS);
    assert.ok(!ex.error, ex.error);
    closeDeg(ex.ayanamsa, 23.85306, 2 * ARCSEC, 'Lahiri ayanamsa (ex_ut)');
  });

  // THE TRAP, pinned as a test so a future refactor cannot reintroduce it.
  test('swe_get_ayanamsa_ut differs from ex_ut by the nutation in longitude', () => {
    swe.swe_set_sid_mode(AYANAMSA.lahiri, 0, 0);
    const plain = swe.swe_get_ayanamsa_ut(J2000);
    const ex = swe.swe_get_ayanamsa_ex_ut(J2000, FLAGS).ayanamsa;
    const deltaArcsec = (plain - ex) * 3600;
    // Nutation in longitude at J2000 is -13.93". The plain form omits it.
    closeDeg(deltaArcsec / 3600, 13.932 * ARCSEC, 0.05 * ARCSEC, 'ayanamsa_ut - ayanamsa_ex_ut');
  });

  test('sidereal == apparent tropical - ayanamsa_ex_ut, exactly', () => {
    swe.swe_set_sid_mode(AYANAMSA.lahiri, 0, 0);
    const trop = swe.swe_calc_ut(J2000, swe.SE_SUN, FLAGS).longitude;
    const sid = swe.swe_calc_ut(J2000, swe.SE_SUN, FLAGS | swe.SEFLG_SIDEREAL).longitude;
    const ex = swe.swe_get_ayanamsa_ex_ut(J2000, FLAGS).ayanamsa;
    closeDeg(norm360(trop - ex), sid, 1e-6, 'sidereal reconciliation (ex_ut)');
  });

  test('sidereal does NOT equal tropical - ayanamsa_ut (the naive formula)', () => {
    swe.swe_set_sid_mode(AYANAMSA.lahiri, 0, 0);
    const trop = swe.swe_calc_ut(J2000, swe.SE_SUN, FLAGS).longitude;
    const sid = swe.swe_calc_ut(J2000, swe.SE_SUN, FLAGS | swe.SEFLG_SIDEREAL).longitude;
    const plain = swe.swe_get_ayanamsa_ut(J2000);
    const err = Math.abs(norm360(trop - plain) - sid) * 3600;
    assert.ok(err > 10, `expected the naive formula to be wrong by >10", got ${err}"`);
  });

  test('with SEFLG_NONUT the naive formula becomes exact', () => {
    swe.swe_set_sid_mode(AYANAMSA.lahiri, 0, 0);
    const f = FLAGS | swe.SEFLG_NONUT;
    const trop = swe.swe_calc_ut(J2000, swe.SE_SUN, f).longitude;
    const sid = swe.swe_calc_ut(J2000, swe.SE_SUN, f | swe.SEFLG_SIDEREAL).longitude;
    const plain = swe.swe_get_ayanamsa_ut(J2000);
    closeDeg(norm360(trop - plain), sid, 1e-6, 'NONUT reconciliation');
  });

  // Lahiri and True Chitra are conceptually the same definition but are NOT
  // numerically identical. This gap is why every stored result must record
  // which ayanamsa produced it.
  test('Lahiri and True Chitra differ by about one arcminute, and the gap grows', () => {
    const at = (y) => {
      const jd = swe.swe_julday(y, 1, 1, 0, swe.SE_GREG_CAL);
      swe.swe_set_sid_mode(AYANAMSA.lahiri, 0, 0);
      const l = swe.swe_get_ayanamsa_ut(jd);
      swe.swe_set_sid_mode(AYANAMSA.trueCitra, 0, 0);
      const t = swe.swe_get_ayanamsa_ut(jd);
      return (l - t) * 3600;
    };
    const d1900 = at(1900), d2000 = at(2000), d2026 = at(2026);
    closeDeg(d1900 / 3600, 56.80 * ARCSEC, 0.5 * ARCSEC, 'Lahiri-TrueCitra 1900');
    closeDeg(d2000 / 3600, 61.65 * ARCSEC, 0.5 * ARCSEC, 'Lahiri-TrueCitra 2000');
    closeDeg(d2026 / 3600, 62.63 * ARCSEC, 0.5 * ARCSEC, 'Lahiri-TrueCitra 2026');
    assert.ok(d1900 < d2000 && d2000 < d2026, 'gap should widen monotonically');
  });
});

describe('deltaT', () => {
  test('matches the published value at J2000 (63.83 s)', () => {
    closeDeg(swe.swe_deltat(J2000) * 86400, 63.83, 0.5, 'deltaT seconds');
  });
});

describe('ephemeris range guard', () => {
  test('accepts a date inside the bundled files', () => {
    assert.doesNotThrow(() => assertInEphemerisRange(J2000));
  });
  test('rejects a date before 1200 CE rather than silently using Moshier', () => {
    assert.throws(() => assertInEphemerisRange(1721425.5), /outside the bundled ephemeris/);
  });
  test('rejects NaN', () => {
    assert.throws(() => assertInEphemerisRange(NaN), /finite/);
  });
});

describe('vedic sunrise', () => {
  // Bengaluru. Only structural assertions here: an exact sunrise minute needs
  // a printed-panchanga baseline, which belongs in the ganita package fixtures.
  const BLR = { lat: 12.9716, lon: 77.5946, alt: 920 };

  test('VEDIC_RISE composes the four documented flags', () => {
    assert.equal(
      VEDIC_RISE,
      swe.SE_CALC_RISE | swe.SE_BIT_DISC_CENTER |
        swe.SE_BIT_NO_REFRACTION | swe.SE_BIT_GEOCTR_NO_ECL_LAT
    );
  });

  test('returns a sunrise within the day requested', () => {
    const jd = swe.swe_julday(2026, 9, 22, 0, swe.SE_GREG_CAL);
    const r = swe.swe_rise_trans(jd, swe.SE_SUN, swe.SEFLG_SWIEPH, VEDIC_RISE,
      BLR.lon, BLR.lat, BLR.alt);
    assert.ok(!r.error, r.error);
    assert.ok(r.transitTime > jd && r.transitTime < jd + 1, 'sunrise outside requested day');
  });

  test('refraction changes sunrise measurably - the flags are not cosmetic', () => {
    const jd = swe.swe_julday(2026, 9, 22, 0, swe.SE_GREG_CAL);
    const vedic = swe.swe_rise_trans(jd, swe.SE_SUN, swe.SEFLG_SWIEPH, VEDIC_RISE,
      BLR.lon, BLR.lat, BLR.alt);
    const common = swe.swe_rise_trans(jd, swe.SE_SUN, swe.SEFLG_SWIEPH,
      swe.SE_CALC_RISE | swe.SE_BIT_DISC_CENTER, BLR.lon, BLR.lat, BLR.alt);
    const diffMin = Math.abs(vedic.transitTime - common.transitTime) * 24 * 60;
    assert.ok(diffMin > 0.5, `expected >0.5 min difference, got ${diffMin.toFixed(3)} min`);
  });
});
