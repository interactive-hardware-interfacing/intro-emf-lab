// Solenoids from Biot–Savart: the exact field of a circular current loop off its axis
// (complete elliptic integrals), a solenoid as N such loops, the finite-sheet on-axis
// formula, the long-solenoid limit, and the Helmholtz pair. Axisymmetric: positions are
// (rho, z), the solenoid axis is z, and the turns carry I in the +phi sense so B on the
// axis points +z for I > 0.

import { MU0, PI } from './constants.js';
import { ellipticKE, nagaoka } from './analytic.js';

/**
 * B of a circular loop of radius R in the plane z = zc carrying I, at (rho, z). [B_rho, B_z].
 * Standard elliptic-integral form with k^2 = 4 R rho / ((R + rho)^2 + (z - zc)^2):
 *   B_z   = (mu0 I / 2 pi) / sqrt((R + rho)^2 + dz^2) [ K + (R^2 - rho^2 - dz^2) / ((R - rho)^2 + dz^2) E ]
 *   B_rho = (mu0 I / 2 pi) dz / (rho sqrt((R + rho)^2 + dz^2)) [ -K + (R^2 + rho^2 + dz^2) / ((R - rho)^2 + dz^2) E ]
 * On the axis B_rho = 0 and B_z reduces to mu0 I R^2 / 2 (R^2 + dz^2)^(3/2). On the wire itself (rho = R, dz = 0) the field is singular: NaN.
 */
export function loopB(I, R, zc, rho, z) {
  const dz = z - zc, r = Math.abs(rho);
  const sp = (R + r) * (R + r) + dz * dz, sm = (R - r) * (R - r) + dz * dz;
  if (sm === 0) return [NaN, NaN];
  if (r < 1e-12 * R) return [0, (MU0 * I * R * R) / (2 * Math.pow(R * R + dz * dz, 1.5))];
  const k = Math.sqrt((4 * R * r) / sp);
  const { K, E } = ellipticKE(Math.min(k, 1 - 1e-16));
  const f = (MU0 * I) / (2 * PI * Math.sqrt(sp));
  const Bz = f * (K + ((R * R - r * r - dz * dz) / sm) * E);
  const Brho = ((f * dz) / r) * (-K + ((R * R + r * r + dz * dz) / sm) * E);
  return [rho < 0 ? -Brho : Brho, Bz];
}

/**
 * A_phi of the same loop: (mu0 I / pi k) sqrt(R / rho) [ (1 - k^2/2) K - E ]. The stream
 * function psi = rho A_phi is constant along field lines, so its contours draw them exactly.
 */
export function loopAphi(I, R, zc, rho, z) {
  const dz = z - zc, r = Math.abs(rho);
  if (r < 1e-12 * R) return 0;
  const sp = (R + r) * (R + r) + dz * dz;
  const k = Math.sqrt((4 * R * r) / sp);
  if (k >= 1) return NaN;
  const { K, E } = ellipticKE(k);
  return ((MU0 * I) / (PI * k)) * Math.sqrt(R / r) * ((1 - (k * k) / 2) * K - E);
}

/** N equally spaced turns of radius a over length L centred on z = 0: [{ I, R, zc }]. */
export function solenoidTurns(N, I, L, a) {
  const out = [];
  for (let k = 0; k < N; k++) out.push({ I, R: a, zc: N === 1 ? 0 : -L / 2 + (L * (k + 0.5)) / N });
  return out;
}

/** Helmholtz pair: two loops of radius a, separation d (= a for Helmholtz), I each (second with sign s). */
export function pairTurns(I, a, d, s = 1) { return [{ I, R: a, zc: -d / 2 }, { I: s * I, R: a, zc: d / 2 }]; }

/** B of a set of turns at (rho, z). [B_rho, B_z]. */
export function turnsB(turns, rho, z) {
  let br = 0, bz = 0;
  for (const t of turns) { const b = loopB(t.I, t.R, t.zc, rho, z); br += b[0]; bz += b[1]; }
  return [br, bz];
}

/** psi = rho A_phi of a set of turns (field-line stream function). */
export function turnsPsi(turns, rho, z) {
  let a = 0;
  for (const t of turns) a += loopAphi(t.I, t.R, t.zc, rho, z);
  return Math.abs(rho) * a;
}

/**
 * On-axis B_z of an ideal current sheet (n turns per metre, length L, radius a) at z:
 *   B_z = (mu0 n I / 2) [ (z + L/2) / sqrt((z + L/2)^2 + a^2) - (z - L/2) / sqrt((z - L/2)^2 + a^2) ]
 * i.e. (mu0 n I / 2)(cos th1 + cos th2) with th1, th2 the half-angles the ends subtend.
 */
export function sheetAxisBz(n, I, L, a, z) {
  const zp = z + L / 2, zm = z - L / 2;
  return ((MU0 * n * I) / 2) * (zp / Math.hypot(zp, a) - zm / Math.hypot(zm, a));
}

/** The long-solenoid field mu0 n I. */
export function longBz(n, I) { return MU0 * n * I; }

/** Single-layer solenoid inductance with Nagaoka's end correction: K_N mu0 N^2 pi a^2 / L. */
export function nagaokaL(N, L, a) { return nagaoka(2 * a, L) * (MU0 * N * N * PI * a * a) / L; }

/**
 * B_z sampled along the axis and the fraction of the length over which it stays within
 * `tol` of the centre value (the "uniform region"), for the panel.
 */
export function axisProfile(turns, L, a, n = 201, tol = 0.01) {
  const span = 1.5 * Math.max(L, 2 * a);
  const z = [], Bz = [];
  for (let k = 0; k < n; k++) { const zz = -span + (2 * span * k) / (n - 1); z.push(zz); Bz.push(turnsB(turns, 0, zz)[1]); }
  const B0 = turnsB(turns, 0, 0)[1];
  let lo = 0, hi = 0;
  for (let zz = 0; zz <= span; zz += span / 2000) { if (Math.abs(turnsB(turns, 0, zz)[1] - B0) > tol * Math.abs(B0)) break; hi = zz; }
  for (let zz = 0; zz >= -span; zz -= span / 2000) { if (Math.abs(turnsB(turns, 0, zz)[1] - B0) > tol * Math.abs(B0)) break; lo = zz; }
  return { z, Bz, B0, uniform: [lo, hi] };
}
