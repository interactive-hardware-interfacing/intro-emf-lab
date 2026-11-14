// Vector operators in the plane: a library of 2-D fields with their divergence and curl in
// closed form, and the two integrals that define them: the outward flux through a small box
// (divergence = flux per unit area as the box shrinks) and the circulation around a small
// loop (curl = circulation per unit area). The Operators tab paints the fields and lets the
// student shrink the box at any point and watch the ratio converge.

import { PI } from './constants.js';

/**
 * Fields: each has F(x, y) -> [Fx, Fy], div(x, y), curl(x, y) (the z component), a label and a
 * note. The linear field takes coefficients: F = (a x + b y + c, d x + e y + f).
 */
export const FIELDS = {
  linear: {
    label: 'linear: F = (a x + b y + c, d x + e y + f)',
    F: (x, y, k) => [k.a * x + k.b * y + k.c, k.d * x + k.e * y + k.f],
    div: (x, y, k) => k.a + k.e,
    curl: (x, y, k) => k.d - k.b,
    note: 'div = a + e and curl = d − b, the same everywhere: a linear field has uniform divergence and curl.',
  },
  source: {
    label: 'line source: F = (x, y)/r²  (E of a line charge)',
    F: (x, y) => { const r2 = x * x + y * y || 1e-30; return [x / r2, y / r2]; },
    div: (x, y) => (x * x + y * y < 1e-6 ? Infinity : 0),
    curl: () => 0,
    note: 'Zero divergence everywhere except the origin, where all of it is concentrated (a delta function): the flux through any box containing the origin is 2π, through any box that does not it is 0.',
  },
  vortex: {
    label: 'vortex: F = (−y, x)/r²  (B of a wire)',
    F: (x, y) => { const r2 = x * x + y * y || 1e-30; return [-y / r2, x / r2]; },
    div: () => 0,
    curl: (x, y) => (x * x + y * y < 1e-6 ? Infinity : 0),
    note: 'Zero curl everywhere except the origin: the circulation around any loop enclosing the origin is 2π (Ampère), around any loop that does not it is 0, however much the field seems to swirl.',
  },
  dipole: {
    label: 'dipole: F = ∇(x/r²)',
    F: (x, y) => { const r2 = x * x + y * y || 1e-30; return [(x * x - y * y) / (r2 * r2), (2 * x * y) / (r2 * r2)]; },
    div: () => 0,
    curl: () => 0,
    note: 'A gradient field (curl 0) that is also divergence-free away from the origin: the 2-D dipole, like E of a line dipole.',
  },
  swirl: {
    label: 'decaying swirl: F = (−y, x) e^{−r²}',
    F: (x, y) => { const g = Math.exp(-(x * x + y * y)); return [-y * g, x * g]; },
    div: () => 0,
    curl: (x, y) => { const r2 = x * x + y * y, g = Math.exp(-r2); return 2 * g - 2 * r2 * g; },
    note: 'Curl 2 at the centre, falling through zero at r = 1 and negative beyond: the fluid turns one way inside and the other way outside. Divergence-free everywhere.',
  },
  hill: {
    label: 'downhill from a bump: F = −∇e^{−r²}',
    F: (x, y) => { const g = Math.exp(-(x * x + y * y)); return [2 * x * g, 2 * y * g]; },
    div: (x, y) => { const r2 = x * x + y * y, g = Math.exp(-r2); return 4 * g - 4 * r2 * g; },
    curl: () => 0,
    note: 'A gradient field: curl is identically zero. The divergence is 4 at the top of the bump (where the flow spreads out) and negative beyond r = 1 (where it slows and converges).',
  },
};

export function fieldAt(kind, x, y, k) { return FIELDS[kind].F(x, y, k); }
export function divAt(kind, x, y, k) { return FIELDS[kind].div(x, y, k); }
export function curlAt(kind, x, y, k) { return FIELDS[kind].curl(x, y, k); }

/** Outward flux of F through the square of side s centred at (cx, cy), midpoint rule with n points per side. Returns { flux, segs }. */
export function boxFlux(kind, k, cx, cy, s, n = 64) {
  const sides = [{ n: [0, -1], p: (f) => [cx - s / 2 + f * s, cy - s / 2] }, { n: [1, 0], p: (f) => [cx + s / 2, cy - s / 2 + f * s] }, { n: [0, 1], p: (f) => [cx + s / 2 - f * s, cy + s / 2] }, { n: [-1, 0], p: (f) => [cx - s / 2, cy + s / 2 - f * s] }];
  let flux = 0; const segs = [];
  for (const side of sides) for (let i = 0; i < n; i++) { const [x, y] = side.p((i + 0.5) / n); const F = fieldAt(kind, x, y, k); const Fn = F[0] * side.n[0] + F[1] * side.n[1]; flux += Fn * (s / n); segs.push({ x, y, nx: side.n[0], ny: side.n[1], Fn, dl: s / n }); }
  return { flux, segs, area: s * s };
}

/** Counter-clockwise circulation of F around the circle of radius R centred at (cx, cy). Returns { circ, segs }. */
export function loopCirculation(kind, k, cx, cy, R, n = 128) {
  let circ = 0; const segs = [];
  for (let i = 0; i < n; i++) { const th = (2 * PI * (i + 0.5)) / n, x = cx + R * Math.cos(th), y = cy + R * Math.sin(th), tx = -Math.sin(th), ty = Math.cos(th); const F = fieldAt(kind, x, y, k); const Ft = F[0] * tx + F[1] * ty; circ += Ft * ((2 * PI * R) / n); segs.push({ x, y, tx, ty, Ft, dl: (2 * PI * R) / n }); }
  return { circ, segs, area: PI * R * R };
}

/** Central-difference divergence and curl of the field at (x, y), step h: the finite-difference definition. */
export function numericDivCurl(kind, k, x, y, h = 1e-4) {
  const Fxp = fieldAt(kind, x + h, y, k), Fxm = fieldAt(kind, x - h, y, k), Fyp = fieldAt(kind, x, y + h, k), Fym = fieldAt(kind, x, y - h, k);
  return { div: (Fxp[0] - Fxm[0]) / (2 * h) + (Fyp[1] - Fym[1]) / (2 * h), curl: (Fxp[1] - Fxm[1]) / (2 * h) - (Fyp[0] - Fym[0]) / (2 * h) };
}
