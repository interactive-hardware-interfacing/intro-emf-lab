// The electric dipole: two charges ±q a distance s apart along the dipole axis (p = q s), the
// ideal point dipole they tend to, and a dipole in a uniform field (torque, energy, the
// force in a non-uniform one). Fields in the plane containing the axis. Closed form.
//   ideal:  V = p cosθ / (4πε₀ r²),  E = (p / 4πε₀ r³)(2cosθ r̂ + sinθ θ̂)
//   exact:  superposition of ±q at ±s/2
//   torque τ = p × E,  U = −p·E,  F = (p·∇)E

import { PI, EPS0 } from './constants.js';

const K = 1 / (4 * PI * EPS0);

/** Exact two-charge field at (x, y) for ±q at (0, ±s/2) (axis along y). */
export function exactField(q, s, x, y) {
  let ex = 0, ey = 0;
  for (const [qq, yc] of [[q, s / 2], [-q, -s / 2]]) { const dx = x, dy = y - yc, r2 = dx * dx + dy * dy; if (!r2) continue; const f = (K * qq) / (r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy; }
  return [ex, ey];
}
export function exactPotential(q, s, x, y) {
  let V = 0;
  for (const [qq, yc] of [[q, s / 2], [-q, -s / 2]]) { const r = Math.hypot(x, y - yc); if (r) V += (K * qq) / r; }
  return V;
}

/** Ideal dipole p along +y at the origin. */
export function idealField(p, x, y) {
  const r2 = x * x + y * y; if (!r2) return [0, 0];
  const r = Math.sqrt(r2), pr = (p * y) / r; // p·r̂
  // E = K (3 (p·r̂) r̂ − p) / r³
  return [(K * (3 * pr * (x / r))) / (r2 * r), (K * (3 * pr * (y / r) - p)) / (r2 * r)];
}
export function idealPotential(p, x, y) { const r2 = x * x + y * y; if (!r2) return 0; return (K * p * y) / (r2 * Math.sqrt(r2)); }

/** Field magnitude on the axis (θ = 0) and broadside (θ = 90°) at distance r: 2Kp/r³ and Kp/r³. */
export function idealAxisBroadside(p, r) { return { axis: (2 * K * p) / r ** 3, broadside: (K * p) / r ** 3 }; }

/** Torque, energy and force on a dipole p at angle θ from a uniform field E0 (x̂); the force needs a gradient. */
export function inUniformField(p, theta, E0, dEdx = 0) {
  return { torque: -p * E0 * Math.sin(theta), U: -p * E0 * Math.cos(theta), F: p * Math.cos(theta) * dEdx }; // τ about z: p × E = p(cosθ, sinθ) × (E0, 0) = −p E0 sinθ ẑ (restoring)
}

/** Relative error of the ideal dipole against the exact pair at distance r on the axis and broadside. */
export function idealError(q, s, r) {
  const p = q * s, ax = Math.hypot(...exactField(q, s, 0, r)), br = Math.hypot(...exactField(q, s, r, 0)), id = idealAxisBroadside(p, r);
  return { axis: ax / id.axis - 1, broadside: br / id.broadside - 1 };
}

/** The dipole in a uniform background field: total field and potential (the pair plus E0 x̂). */
export function totalField(q, s, theta, E0, x, y) {
  // rotate the pair to angle θ: charges at ±(s/2)(cosθ, sinθ)
  let ex = E0, ey = 0;
  for (const sg of [1, -1]) { const cx = (sg * s * Math.cos(theta)) / 2, cy = (sg * s * Math.sin(theta)) / 2, dx = x - cx, dy = y - cy, r2 = dx * dx + dy * dy; if (!r2) continue; const f = (K * sg * q) / (r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy; }
  return [ex, ey];
}
export function totalPotential(q, s, theta, E0, x, y) {
  let V = -E0 * x;
  for (const sg of [1, -1]) { const cx = (sg * s * Math.cos(theta)) / 2, cy = (sg * s * Math.sin(theta)) / 2, r = Math.hypot(x - cx, y - cy); if (r) V += (K * sg * q) / r; }
  return V;
}

/** Numeric torque from the two charges' forces in the external field (a check on p × E). */
export function torqueNumeric(q, s, theta, E0) {
  let tz = 0;
  for (const sg of [1, -1]) { const cx = (sg * s * Math.cos(theta)) / 2, cy = (sg * s * Math.sin(theta)) / 2, fx = sg * q * E0, fy = 0; tz += cx * fy - cy * fx; }
  return tz;
}
