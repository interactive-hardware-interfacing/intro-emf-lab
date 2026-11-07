// Closed-form fields. Everything here is textbook superposition and is exact up to the
// numerical integration used for rings and discrete strips. SI units.
//
// Conventions
//   Electrostatics in 3D: points are [x, y, z]. 2D helpers treat the problem as
//   translation-invariant along z (infinite line charges, infinite wires) and take [x, y].
//   Magnetostatics: wires run along +z unless stated. Current sign flips direction.
//   Potentials of infinite lines diverge at infinity, so they take a reference radius rRef
//   where V (or A_z) is defined to be zero.

import { EPS0, MU0, PI, K_E } from './constants.js';

// ---------------------------------------------------------------- point charges (3D)

/** Electric field of a point charge q at p0, evaluated at p. Returns [Ex, Ey, Ez]. */
export function pointChargeE(q, p0, p) {
  const dx = p[0] - p0[0], dy = p[1] - p0[1], dz = (p[2] ?? 0) - (p0[2] ?? 0);
  const r2 = dx * dx + dy * dy + dz * dz;
  if (r2 === 0) return [NaN, NaN, NaN];
  const r = Math.sqrt(r2);
  const f = K_E * q / (r2 * r);
  return [f * dx, f * dy, f * dz];
}

/** Potential of a point charge q at p0, evaluated at p (zero at infinity). */
export function pointChargeV(q, p0, p) {
  const dx = p[0] - p0[0], dy = p[1] - p0[1], dz = (p[2] ?? 0) - (p0[2] ?? 0);
  const r = Math.hypot(dx, dy, dz);
  return r === 0 ? NaN : K_E * q / r;
}

/**
 * Superposition of point charges. charges = [{ q, pos: [x, y, z] }, ...].
 * Returns { E: [Ex, Ey, Ez], V }.
 */
export function pointChargesField(charges, p) {
  let ex = 0, ey = 0, ez = 0, v = 0;
  for (const c of charges) {
    const e = pointChargeE(c.q, c.pos, p);
    ex += e[0]; ey += e[1]; ez += e[2];
    v += pointChargeV(c.q, c.pos, p);
  }
  return { E: [ex, ey, ez], V: v };
}

// ---------------------------------------------------------------- line charges (2D)

/** E of an infinite line charge lambda (C/m) along z through (x0, y0), at (x, y). */
export function lineChargeE(lambda, p0, p) {
  const dx = p[0] - p0[0], dy = p[1] - p0[1];
  const r2 = dx * dx + dy * dy;
  if (r2 === 0) return [NaN, NaN];
  const f = lambda / (2 * PI * EPS0 * r2);
  return [f * dx, f * dy];
}

/** V of an infinite line charge, zero at radius rRef. */
export function lineChargeV(lambda, p0, p, rRef = 1) {
  const r = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
  if (r === 0) return NaN;
  return -(lambda / (2 * PI * EPS0)) * Math.log(r / rRef);
}

// ---------------------------------------------------------------- ring of charge (3D)

/**
 * Field and potential of a uniformly charged ring, radius R, line density lambda (C/m),
 * lying in the plane z = c[2] centred at c, evaluated at p. Integrated with nSeg
 * segments of the ring using the midpoint rule, which is spectrally accurate for a
 * smooth periodic integrand (error ~1e-12 for nSeg = 200 away from the ring itself).
 */
export function ringChargeField(lambda, R, c, p, nSeg = 200) {
  const dq = lambda * (2 * PI * R / nSeg);
  let ex = 0, ey = 0, ez = 0, v = 0;
  for (let k = 0; k < nSeg; k++) {
    const th = (2 * PI * (k + 0.5)) / nSeg;
    const src = [c[0] + R * Math.cos(th), c[1] + R * Math.sin(th), c[2] ?? 0];
    const e = pointChargeE(dq, src, p);
    ex += e[0]; ey += e[1]; ez += e[2];
    v += pointChargeV(dq, src, p);
  }
  return { E: [ex, ey, ez], V: v };
}

/** The same ring represented as N equal point charges q each, evenly spaced (Lab 1 Module 1). */
export function ringAsPointCharges(N, q, R, c) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const th = (2 * PI * k) / N;
    out.push({ q, pos: [c[0] + R * Math.cos(th), c[1] + R * Math.sin(th), c[2] ?? 0] });
  }
  return out;
}

/** Exact on-axis field of a charged ring, for benchmarks: E_z at height z above centre. */
export function ringOnAxisEz(lambda, R, z) {
  const Q = lambda * 2 * PI * R;
  return K_E * Q * z / Math.pow(R * R + z * z, 1.5);
}

// ---------------------------------------------------------------- wires (2D, along z)

/** B of an infinite straight wire carrying I along +z through (x0, y0), at (x, y). [Bx, By]. */
export function wireB(I, p0, p) {
  const dx = p[0] - p0[0], dy = p[1] - p0[1];
  const r2 = dx * dx + dy * dy;
  if (r2 === 0) return [NaN, NaN];
  const f = MU0 * I / (2 * PI * r2);
  // phi-hat = (-dy, dx)/r ; B = mu0 I/(2 pi r) phi-hat
  return [-f * dy, f * dx];
}

/** A_z of an infinite wire, zero at radius rRef. B = curl A gives wireB. */
export function wireAz(I, p0, p, rRef = 1) {
  const r = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
  if (r === 0) return NaN;
  return -(MU0 * I / (2 * PI)) * Math.log(r / rRef);
}

/** Superposition over wires = [{ I, pos: [x, y] }]. Returns { B: [Bx, By], Az }. */
export function wiresField(wires, p, rRef = 1) {
  let bx = 0, by = 0, az = 0;
  for (const w of wires) {
    const b = wireB(w.I, w.pos, p);
    bx += b[0]; by += b[1];
    az += wireAz(w.I, w.pos, p, rRef);
  }
  return { B: [bx, by], Az: az };
}

// ---------------------------------------------------------------- sheet current (2D)

/**
 * Finite-width sheet current (Lab 4 Module 1). The sheet lies in the plane z = 0,
 * spans x in [-w/2, w/2] (centred at x = 0), and carries surface current density K (A/m)
 * in the +y direction. Field evaluated at (x, z). Returns [Bx, Bz].
 *
 * Closed form from integrating the infinite-wire field across the strip:
 *   Bx = (mu0 K / 2 pi) [ atan((w/2 - x)/z) + atan((w/2 + x)/z) ]
 *   Bz = (mu0 K / 4 pi) ln( ((x - w/2)^2 + z^2) / ((x + w/2)^2 + z^2) )
 * As w -> infinity, Bx -> +-mu0 K / 2 and Bz -> 0.
 */
export function sheetB(K, w, x, z) {
  if (z === 0 && Math.abs(x) <= w / 2) return [NaN, NaN];
  const h = w / 2;
  // Plain atan (not atan2): the field must be odd in z, and atan(+-inf) handles z = 0 outside the strip.
  const bx = (MU0 * K / (2 * PI)) * (Math.atan((h - x) / z) + Math.atan((h + x) / z));
  const num = (x - h) * (x - h) + z * z;
  const den = (x + h) * (x + h) + z * z;
  const bz = (MU0 * K / (4 * PI)) * Math.log(num / den);
  return [bx, bz];
}

/**
 * The same sheet approximated by N equally spaced wires (current along +y) across the
 * width, each carrying I. Returns [Bx, Bz] at (x, z). This is the "discrete" side of
 * Lab 4 Module 1. Note the wire runs along y here, so the roles of the components
 * differ from wireB (which assumes wires along z).
 */
export function sheetAsWiresB(N, I, w, x, z) {
  let bx = 0, bz = 0;
  for (let k = 0; k < N; k++) {
    // Evenly populate the width: N wires at the centres of N equal sub-strips.
    const x0 = N === 1 ? 0 : -w / 2 + (w / N) * (k + 0.5);
    const dx = x - x0;
    const r2 = dx * dx + z * z;
    if (r2 === 0) return [NaN, NaN];
    const f = MU0 * I / (2 * PI * r2);
    // current along +y: B = f * (y-hat x r) = f * (z, 0, -dx)
    bx += f * z;
    bz += -f * dx;
  }
  return [bx, bz];
}

/** Wires along +y evenly spread across width w, as objects, for plotting. */
export function sheetWires(N, I, w) {
  const out = [];
  for (let k = 0; k < N; k++) {
    out.push({ I, pos: [N === 1 ? 0 : -w / 2 + (w / N) * (k + 0.5), 0] });
  }
  return out;
}

// ---------------------------------------------------------------- loops and solenoids

/** On-axis B_z of a circular current loop of radius R carrying I, at height z. */
export function loopOnAxisBz(I, R, z) {
  return MU0 * I * R * R / (2 * Math.pow(R * R + z * z, 1.5));
}

/** Inductance of an ideal long solenoid: N turns, cross-section area A, length l. */
export function longSolenoidL(N, A, l) {
  return MU0 * N * N * A / l;
}

/**
 * Complete elliptic integrals K(k) and E(k) of modulus k (0 <= k < 1) by the
 * arithmetic-geometric mean. Converges quadratically; ~6 iterations to double precision.
 */
export function ellipticKE(k) {
  let a = 1, b = Math.sqrt(1 - k * k), c = k;
  let sum = 0.5 * c * c, pow2 = 0.5;
  for (let n = 0; n < 40 && Math.abs(c) > 1e-17; n++) {
    const an = 0.5 * (a + b);
    const bn = Math.sqrt(a * b);
    c = 0.5 * (a - b);
    a = an; b = bn;
    pow2 *= 2;
    sum += pow2 * c * c;
  }
  const K = PI / (2 * a);
  return { K, E: K * (1 - sum) };
}

/**
 * Nagaoka's end-correction factor for a single-layer solenoid of diameter d and length l,
 * exact (Nagaoka 1909) in terms of complete elliptic integrals:
 *   k^2 = d^2 / (d^2 + l^2)
 *   K_N = 4 / (3 pi sqrt(1 - k^2)) * [ (1 - k^2)/k^2 * (K - E) + E - k ]
 * L = K_N * mu0 N^2 A / l. For l >> d, K_N -> 1 - (4/3pi)(d/l).
 */
export function nagaoka(d, l) {
  const k2 = d * d / (d * d + l * l);
  const k = Math.sqrt(k2);
  const { K, E } = ellipticKE(k);
  return (4 / (3 * PI * Math.sqrt(1 - k2))) * (((1 - k2) / k2) * (K - E) + E - k);
}
