// Forces on charges and currents: the Lorentz force integrated with the Boris pusher (exact
// energy conservation in a pure magnetic field, second order in time), and the closed forms
// the Charges in fields tab compares it with: cyclotron radius and period, E×B drift, the
// velocity selector, the Hall effect, the force between parallel wires, and the torque on a
// current loop. Vectors are [x, y, z] arrays; the tab draws the x–y plane.

import { MU0, PI } from './constants.js';

export const E_CHARGE = 1.602176634e-19;
export const M_ELECTRON = 9.1093837015e-31;
export const M_PROTON = 1.67262192369e-27;
export const PARTICLES = {
  electron: { q: -E_CHARGE, m: M_ELECTRON, label: 'electron' },
  proton: { q: E_CHARGE, m: M_PROTON, label: 'proton' },
  alpha: { q: 2 * E_CHARGE, m: 4.001506 * 1.66053906660e-27, label: 'alpha particle' },
  deuteron: { q: E_CHARGE, m: 2.013553 * 1.66053906660e-27, label: 'deuteron' },
};

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * One Boris step: half an electric kick, a rotation by the magnetic field, half a kick, then
 * the drift. Returns the new { x, v }. E and B are evaluated at the current position.
 */
export function borisStep(x, v, q, m, E, B, dt) {
  const h = (q * dt) / (2 * m);
  const vm = [v[0] + h * E[0], v[1] + h * E[1], v[2] + h * E[2]];
  const t = [h * B[0], h * B[1], h * B[2]], t2 = dot(t, t);
  const s = [2 * t[0] / (1 + t2), 2 * t[1] / (1 + t2), 2 * t[2] / (1 + t2)];
  const vp = cross(vm, t); const vprime = [vm[0] + vp[0], vm[1] + vp[1], vm[2] + vp[2]];
  const vs = cross(vprime, s); const vplus = [vm[0] + vs[0], vm[1] + vs[1], vm[2] + vs[2]];
  const vn = [vplus[0] + h * E[0], vplus[1] + h * E[1], vplus[2] + h * E[2]];
  return { x: [x[0] + vn[0] * dt, x[1] + vn[1] * dt, x[2] + vn[2] * dt], v: vn };
}

/**
 * Trace a particle through fields given by fieldAt(x) -> { E, B } for `steps` steps of dt,
 * stopping if `stop(x)` says so. Returns { t, x, v, ke } sampled every `every` steps.
 */
export function trace({ q, m, x0, v0 }, fieldAt, { dt, steps, every = 1, stop = null }) {
  let x = x0.slice();
  // leapfrog staggering: the pusher wants v half a step behind x, so move v0 back by half a
  // Boris step first (an exact rotation, so |v| is untouched in a pure B), and report velocities
  // moved forward by half a step the same way, so x and v in the output refer to the same time.
  const f0 = fieldAt(x);
  let v = borisStep(x, v0, q, m, f0.E, f0.B, -dt / 2).v;
  const sync = (xx, vv) => { const { E, B } = fieldAt(xx); return borisStep(xx, vv, q, m, E, B, dt / 2).v; };
  const out = { t: [0], x: [x.slice()], v: [v0.slice()], ke: [0.5 * m * dot(v0, v0)], stopped: false };
  for (let k = 1; k <= steps; k++) {
    const { E, B } = fieldAt(x);
    ({ x, v } = borisStep(x, v, q, m, E, B, dt));
    if (k % every === 0) { const vs = sync(x, v); out.t.push(k * dt); out.x.push(x.slice()); out.v.push(vs); out.ke.push(0.5 * m * dot(vs, vs)); }
    if (stop && stop(x)) { out.stopped = true; break; }
  }
  return out;
}

/** Cyclotron motion of a charge with speed v⊥ perpendicular to B: radius, period, frequency. */
export function cyclotron(q, m, vPerp, B) {
  const w = (Math.abs(q) * Math.abs(B)) / m;
  return { r: w > 0 ? vPerp / w : Infinity, T: w > 0 ? (2 * PI) / w : Infinity, f: w / (2 * PI), omega: w };
}

/** E×B drift velocity vector (independent of q and m). */
export function exbDrift(E, B) { const b2 = dot(B, B); if (b2 === 0) return [NaN, NaN, NaN]; const c = cross(E, B); return [c[0] / b2, c[1] / b2, c[2] / b2]; }

/** The speed a velocity selector passes: |E| / |B| for E ⊥ B ⊥ v. */
export function selectorSpeed(E, B) { return norm(E) / norm(B); }

/** Radius in a pure B after the selector: r = m v / (|q| B); the mass that lands at radius r. */
export function spectrometerRadius(m, v, q, B) { return (m * v) / (Math.abs(q) * Math.abs(B)); }

/**
 * Hall effect in a strip of thickness t (along B), width w, carrying I with carrier density
 * n and carrier charge qc (sign matters): v_d = I / (n qc w t), E_H = v_d B, V_H = E_H w = I B / (n qc t).
 */
export function hall({ I, B, n, qc, w, t }) {
  const vd = I / (n * qc * w * t);
  const EH = vd * B;
  return { vd, EH, VH: EH * w, RH: 1 / (n * qc) };
}

/** Force per unit length between two long parallel wires: μ0 I1 I2 / (2π d); positive = attraction (same direction). */
export function wireForcePerLength(I1, I2, d) { return (MU0 * I1 * I2) / (2 * PI * d); }

/** Torque, dipole moment and energy of an N-turn planar loop of area A carrying I in uniform B, at angle θ between m and B. */
export function loopTorque(N, I, A, B, theta) {
  const m = N * I * A;
  return { m, torque: m * B * Math.sin(theta), U: -m * B * Math.cos(theta), Fside: 0 };
}

/** Forces on the four sides of a rectangular loop a (along x) × b, I circulating, in B along +x, tilted by θ about the x axis: the b-sides feel ±I b B, the a-sides nothing. */
export function loopSideForces(I, a, b, B) { return { onB: I * b * B, onA: 0, lever: a }; }
