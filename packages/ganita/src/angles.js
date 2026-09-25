/**
 * Angle utilities.
 *
 * Every function here exists because the 360-degree seam is where panchanga
 * engines quietly go wrong: an interpolation across 359.9 -> 0.1 gives a
 * nonsense answer unless the series is unwrapped first.
 */

/** Normalise into [0, 360). */
export function norm360(deg) {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Signed difference a - b, mapped into (-180, 180]. */
export function angleDiff(a, b) {
  let d = norm360(a - b);
  if (d > 180) d -= 360;
  return d;
}

/**
 * Make a series of angles monotonically ascending by adding whole turns.
 *
 * Sampling the Moon over a day crosses 360 -> 0 roughly once a month. Feeding
 * the raw samples to an interpolator produces a wildly wrong root. This is the
 * `unwrap_angles` idea from drik-panchanga, reimplemented from the definition.
 */
export function unwrapAngles(angles) {
  const out = [angles[0]];
  for (let i = 1; i < angles.length; i++) {
    let v = angles[i];
    while (v < out[i - 1]) v += 360;
    out.push(v);
  }
  return out;
}

/**
 * Inverse Lagrange interpolation: given samples (x[i], y[i]), find the x at
 * which y equals `ya`.
 *
 * Standard Lagrange interpolation gives y from x. Here the roles are swapped,
 * which is exact for the inverse function and needs no iteration. Over a day
 * the Moon's motion is smooth enough that a 4-5 point inverse lands well
 * inside a second.
 *
 * `y` MUST be monotonic - run `unwrapAngles` first. This throws rather than
 * returning a plausible-looking wrong number if that contract is broken,
 * because a silently wrong tithi end-time is the worst possible failure here.
 */
export function inverseLagrange(x, y, ya) {
  if (x.length !== y.length) {
    throw new TypeError(`inverseLagrange: x and y differ in length (${x.length} vs ${y.length})`);
  }
  if (x.length < 2) {
    throw new TypeError('inverseLagrange: need at least 2 samples');
  }
  for (let i = 1; i < y.length; i++) {
    if (y[i] <= y[i - 1]) {
      throw new RangeError(
        `inverseLagrange: y must be strictly increasing; y[${i}]=${y[i]} <= y[${i - 1}]=${y[i - 1]}. ` +
          `Did you forget unwrapAngles()?`
      );
    }
  }

  let total = 0;
  for (let i = 0; i < x.length; i++) {
    let term = x[i];
    for (let j = 0; j < x.length; j++) {
      if (j === i) continue;
      term *= (ya - y[j]) / (y[i] - y[j]);
    }
    total += term;
  }
  return total;
}

/** Degrees to {deg, min, sec} for display. */
export function toDms(deg) {
  const sign = deg < 0 ? -1 : 1;
  let a = Math.abs(deg);
  const d = Math.floor(a);
  a = (a - d) * 60;
  const m = Math.floor(a);
  const s = (a - m) * 60;
  return { sign, deg: d, min: m, sec: s };
}

/** "23° 51′ 11.0″" */
export function formatDms(deg) {
  const { sign, deg: d, min, sec } = toDms(deg);
  return `${sign < 0 ? '-' : ''}${d}° ${String(min).padStart(2, '0')}′ ${sec.toFixed(1).padStart(4, '0')}″`;
}
