// Vector calculus on a library of 2-D scalar and vector fields: the gradient as a field, line
// integrals of a vector field along a polyline (numerically), path independence for gradient
// fields versus circulation for a non-conservative one, and the unit vectors of the
// cylindrical/polar and spherical systems at a point. Closed form + midpoint quadrature.
import { PI } from './constants.js';

/** Scalar fields V(x, y) with their analytic gradients. */
export const SCALARS = {
  pointCharge: { label: 'V = 1/r (a point charge)', V: (x, y) => 1 / Math.max(Math.hypot(x, y), 1e-9), grad: (x, y) => { const r = Math.max(Math.hypot(x, y), 1e-9); return [-x / r ** 3, -y / r ** 3]; } },
  dipole: { label: 'V = x/r² (a dipole along x)', V: (x, y) => x / Math.max(x * x + y * y, 1e-18), grad: (x, y) => { const r2 = Math.max(x * x + y * y, 1e-18); return [(y * y - x * x) / (r2 * r2), (-2 * x * y) / (r2 * r2)]; } },
  uniform: { label: 'V = −x (a uniform field along x)', V: (x) => -x, grad: () => [-1, 0] },
  saddle: { label: 'V = x² − y² (a saddle)', V: (x, y) => x * x - y * y, grad: (x, y) => [2 * x, -2 * y] },
  bowl: { label: 'V = x² + y² (a bowl)', V: (x, y) => x * x + y * y, grad: (x, y) => [2 * x, 2 * y] },
  hill: { label: 'V = e^{−r²} (a hill)', V: (x, y) => Math.exp(-(x * x + y * y)), grad: (x, y) => { const g = Math.exp(-(x * x + y * y)); return [-2 * x * g, -2 * y * g]; } },
};

/** Vector fields F(x, y): the gradient fields E = −∇V of the scalars, plus non-conservative ones. */
export const VECTORS = {
  ...Object.fromEntries(Object.entries(SCALARS).map(([k, s]) => [k, { label: `E = −∇(${s.label.split(' = ')[1]})`, F: (x, y) => { const [gx, gy] = s.grad(x, y); return [-gx, -gy]; }, conservative: true, V: s.V }])),
  swirl: { label: 'F = (−y, x) (a rigid swirl: curl 2)', F: (x, y) => [-y, x], conservative: false, curl: () => 2 },
  wire: { label: 'F = (−y, x)/r² (B of a wire: curl 0 except at the wire)', F: (x, y) => { const r2 = Math.max(x * x + y * y, 1e-18); return [-y / r2, x / r2]; }, conservative: false, curl: () => 0, circulationAround: 2 * PI },
  shear: { label: 'F = (y, 0) (a shear: curl −1)', F: (x, y) => [y, 0], conservative: false, curl: () => -1 },
};

/** ∫ F · dl along a polyline by the midpoint rule with n sub-steps per segment. */
export function lineIntegral(F, pts, n = 200) {
  let s = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], dx = (x1 - x0) / n, dy = (y1 - y0) / n;
    for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * dx, y = y0 + (i + 0.5) * dy, [fx, fy] = F(x, y); s += fx * dx + fy * dy; }
  }
  return s;
}

/** Length of a polyline. */
export function pathLength(pts) { let L = 0; for (let k = 0; k + 1 < pts.length; k++) L += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); return L; }

/** Circulation around a circle of radius R centred at (cx, cy). */
export function circulationCircle(F, cx, cy, R, n = 720) { let s = 0; for (let i = 0; i < n; i++) { const t = ((i + 0.5) * 2 * PI) / n, x = cx + R * Math.cos(t), y = cy + R * Math.sin(t), [fx, fy] = F(x, y); s += (-fx * Math.sin(t) + fy * Math.cos(t)) * R * (2 * PI / n); } return s; }

/** Numeric gradient of a scalar for checks. */
export function numericGrad(V, x, y, h = 1e-6) { return [(V(x + h, y) - V(x - h, y)) / (2 * h), (V(x, y + h) - V(x, y - h)) / (2 * h)]; }

/** Unit vectors of the polar/cylindrical and (in the x–z plane) spherical systems at (x, y). */
export function unitVectors(x, y) {
  const r = Math.hypot(x, y) || 1e-12, phi = Math.atan2(y, x);
  return { r, phi, rhat: [x / r, y / r], phihat: [-y / r, x / r], // polar: r̂ outward, φ̂ counter-clockwise
    // treating the plane as x–z of a spherical system with the polar axis along +y (so θ is measured from +y): r̂ the same, θ̂ = (cosθ, −sinθ) with θ = atan2(x, y)
    theta: Math.atan2(x, y), thetahat: [Math.cos(Math.atan2(x, y)), -Math.sin(Math.atan2(x, y))] };
}

/** Components of a vector in the polar basis at (x, y). */
export function toPolar(fx, fy, x, y) { const u = unitVectors(x, y); return { Fr: fx * u.rhat[0] + fy * u.rhat[1], Fphi: fx * u.phihat[0] + fy * u.phihat[1] }; }
