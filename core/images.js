// Method of images: the four textbook cases, each reduced to a set of real + image charges
// whose field is the true field in the region of interest (the half-space, the quadrant, or
// outside the sphere). Induced surface charge, its total, and the force on the real charge
// follow in closed form. Everything is in the x–y plane; the "point" cases are 3-D point
// charges seen on the plane that contains the charge and the normal, the "line" case is
// 2-D (charge per metre, fields ∝ 1/r).
//   plane:      q at (0, d), grounded plane y = 0 → image −q at (0, −d)
//               σ(x) = −q d / (2π (x² + d²)^{3/2}) along the plane (total −q), F = −q²/(4πε₀ (2d)²)
//   linePlane:  λ at (0, d) → −λ at (0, −d); σ(x) = −λ d /(π (x² + d²)) (total −λ per m), F/l = −λ²/(4πε₀ d)
//   sphere:     q at distance D from the centre of a grounded sphere of radius a → q' = −q a/D at a²/D
//               F = −q q' D/(4πε₀ (D² − a²/D ... exact: −q² a D /(4πε₀ (D² − a²)²)
//   corner:     q at (x0, y0) in the quadrant x > 0, y > 0 bounded by two grounded planes → three images

import { PI, EPS0 } from './constants.js';

const K = 1 / (4 * PI * EPS0);

/** The equivalent charge set. kind: 'plane' | 'linePlane' | 'sphere' | 'corner'. */
export function imageSet(kind, p) {
  const { q = 1e-9, d = 0.1, a = 0.1, D = 0.25, x0 = 0.12, y0 = 0.08 } = p;
  switch (kind) {
    case 'plane': return [{ x: 0, y: d, q, real: true }, { x: 0, y: -d, q: -q, real: false }];
    case 'linePlane': return [{ x: 0, y: d, q, real: true }, { x: 0, y: -d, q: -q, real: false }];
    case 'sphere': return [{ x: D, y: 0, q, real: true }, { x: (a * a) / D, y: 0, q: (-q * a) / D, real: false }];
    case 'corner': return [{ x: x0, y: y0, q, real: true }, { x: -x0, y: y0, q: -q, real: false }, { x: x0, y: -y0, q: -q, real: false }, { x: -x0, y: -y0, q, real: false }];
    default: return [];
  }
}

/** Is (x, y) in the region where the image solution is the real field? */
export function inRegion(kind, p, x, y) {
  switch (kind) {
    case 'plane': case 'linePlane': return y > 0;
    case 'sphere': return Math.hypot(x, y) > (p.a ?? 0.1);
    case 'corner': return x > 0 && y > 0;
    default: return true;
  }
}

/** Field and potential at (x, y) from the charge set (zero inside the conductor). */
export function fieldAt(kind, p, x, y) {
  if (!inRegion(kind, p, x, y)) return [0, 0];
  let ex = 0, ey = 0;
  for (const c of imageSet(kind, p)) {
    const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy; if (r2 === 0) continue;
    if (kind === 'linePlane') { const f = c.q / (2 * PI * EPS0 * r2); ex += f * dx; ey += f * dy; }
    else { const f = (K * c.q) / (r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy; }
  }
  return [ex, ey];
}
export function potentialAt(kind, p, x, y) {
  if (!inRegion(kind, p, x, y)) return 0;
  let V = 0;
  for (const c of imageSet(kind, p)) {
    const r = Math.hypot(x - c.x, y - c.y); if (r === 0) continue;
    V += kind === 'linePlane' ? (-c.q / (2 * PI * EPS0)) * Math.log(r) : (K * c.q) / r;
  }
  return V;
}

/** Induced surface charge density on the conductor at a parameter along it (x along a plane; angle on the sphere). */
export function inducedSigma(kind, p, s) {
  const { q = 1e-9, d = 0.1, a = 0.1, D = 0.25, x0 = 0.12, y0 = 0.08 } = p;
  switch (kind) {
    case 'plane': return (-q * d) / (2 * PI * Math.pow(s * s + d * d, 1.5));
    case 'linePlane': return (-q * d) / (PI * (s * s + d * d));
    case 'sphere': { // s = polar angle from the line to the charge; σ = −q (D² − a²)/(4π a (a² + D² − 2aD cosθ)^{3/2})
      const r2 = a * a + D * D - 2 * a * D * Math.cos(s); return (-q * (D * D - a * a)) / (4 * PI * a * Math.pow(r2, 1.5)); }
    case 'corner': { // on the plane y = 0 at x = s > 0: σ = ε₀ E_y(s, 0⁺)
      const [, ey] = fieldAt('corner', { q, x0, y0 }, s, 1e-12); return EPS0 * ey; }
    default: return 0;
  }
}

/** Total induced charge, by closed form where there is one, else by quadrature. */
export function inducedTotal(kind, p) {
  const { q = 1e-9, a = 0.1, D = 0.25 } = p;
  switch (kind) {
    case 'plane': case 'linePlane': return -q;
    case 'sphere': return (-q * a) / D;
    case 'corner': return -q; // both planes together (the quadrant's conductor) image the whole charge
    default: return 0;
  }
}

/** Force on the real charge (vector), from the images. */
export function force(kind, p) {
  const set = imageSet(kind, p), real = set.find((c) => c.real);
  let fx = 0, fy = 0;
  for (const c of set) {
    if (c.real) continue;
    const dx = real.x - c.x, dy = real.y - c.y, r2 = dx * dx + dy * dy;
    if (kind === 'linePlane') { const f = (real.q * c.q) / (2 * PI * EPS0 * r2); fx += f * dx; fy += f * dy; } // per metre
    else { const f = (K * real.q * c.q) / (r2 * Math.sqrt(r2)); fx += f * dx; fy += f * dy; }
  }
  return [fx, fy];
}

/** Closed-form magnitudes for the checks and the numbers. */
export function closedForms(kind, p) {
  const { q = 1e-9, d = 0.1, a = 0.1, D = 0.25 } = p;
  switch (kind) {
    case 'plane': return { F: (K * q * q) / (4 * d * d), sigma0: -q / (2 * PI * d * d), W: (-K * q * q) / (4 * d) }; // W: energy of the charge–plane system (half the two-charge energy)
    case 'linePlane': return { F: (q * q) / (4 * PI * EPS0 * d), sigma0: -q / (PI * d) };
    case 'sphere': return { qImage: (-q * a) / D, bImage: (a * a) / D, F: (K * q * q * a * D) / ((D * D - a * a) ** 2) };
    case 'corner': return {};
    default: return {};
  }
}

/** Numeric total of the induced charge along a plane (for the checks): ∫σ dx on y = 0 (3-D: dx dz → 2π∫σ s ds for the plane case by symmetry). */
export function inducedTotalNumeric(kind, p, n = 20000) {
  const { d = 0.1 } = p;
  // s = d tan u maps the infinite plane onto u ∈ [0, π/2): the integrand is then smooth and bounded
  if (kind === 'plane') { let Q = 0; const h = (PI / 2) / n; for (let i = 0; i < n; i++) { const u = (i + 0.5) * h, s = d * Math.tan(u), ds = d / Math.cos(u) ** 2; Q += inducedSigma(kind, p, s) * 2 * PI * s * ds * h; } return Q; }
  if (kind === 'linePlane') { let Q = 0; const h = PI / n; for (let i = 0; i < n; i++) { const u = -PI / 2 + (i + 0.5) * h, s = d * Math.tan(u), ds = d / Math.cos(u) ** 2; Q += inducedSigma(kind, p, s) * ds * h; } return Q; }
  if (kind === 'sphere') { let Q = 0; const h = PI / n; for (let i = 0; i < n; i++) { const th = (i + 0.5) * h; Q += inducedSigma(kind, p, th) * 2 * PI * (p.a ?? 0.1) ** 2 * Math.sin(th) * h; } return Q; }
  return NaN;
}
