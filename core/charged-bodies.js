// Gauss's law for the textbook charge distributions: uniformly charged sphere, thin spherical
// shell, infinite cylinder (uniform ρ), infinite cylindrical shell, infinite slab. For each: the
// enclosed charge of the matching Gaussian surface of radius (or half-thickness) s, the field
// magnitude from Gauss, and the potential (zero at infinity where possible, at the plane of
// symmetry for the slab and at a reference radius for the cylinders). Closed form.
//   sphere, uniform ρ, radius a, total Q:   E = Qr/(4πε₀a³) inside, Q/(4πε₀r²) outside
//   shell, total Q at radius a:             E = 0 inside, Q/(4πε₀r²) outside
//   cylinder, uniform ρ, radius a, λ per m: E = λr/(2πε₀a²) inside, λ/(2πε₀r) outside
//   cylindrical shell, λ per m at a:        E = 0 inside, λ/(2πε₀r) outside
//   slab, uniform ρ, |x| ≤ a, σ = 2ρa:      E = ρx/ε₀ inside, ±ρa/ε₀ outside

import { PI, EPS0 } from './constants.js';

export const BODIES = {
  sphere: { label: 'Uniformly charged sphere (ρ, radius a)', dim: 3 },
  shell: { label: 'Thin spherical shell (Q on radius a)', dim: 3 },
  cylinder: { label: 'Infinite cylinder, uniform ρ (radius a)', dim: 2 },
  cylShell: { label: 'Infinite cylindrical shell (λ on radius a)', dim: 2 },
  slab: { label: 'Infinite slab, uniform ρ (|x| ≤ a)', dim: 1 },
};

/** Charge enclosed by the symmetric Gaussian surface of size s (sphere/cylinder radius, slab half-thickness). */
export function enclosed(kind, { Q = 1e-9, lambda = 1e-9, rho = 1e-6, a = 0.1 }, s) {
  switch (kind) {
    case 'sphere': return s >= a ? Q : Q * (s / a) ** 3;
    case 'shell': return s >= a ? Q : 0;
    case 'cylinder': return s >= a ? lambda : lambda * (s / a) ** 2; // per metre
    case 'cylShell': return s >= a ? lambda : 0;                      // per metre
    case 'slab': return 2 * rho * Math.min(s, a);                      // per m² of face
    default: return 0;
  }
}

/** Field magnitude at distance s from the centre / axis / mid-plane (sign: outward from the symmetry centre for positive charge). */
export function fieldMag(kind, p, s) {
  const q = enclosed(kind, p, s);
  switch (kind) {
    case 'sphere': case 'shell': return s > 0 ? q / (4 * PI * EPS0 * s * s) : 0;
    case 'cylinder': case 'cylShell': return s > 0 ? q / (2 * PI * EPS0 * s) : 0;
    case 'slab': return q / (2 * EPS0);
    default: return 0;
  }
}

/** Surface area of the Gaussian surface (per metre for cylinders, per m² of one face ×2 for the slab) so that flux = E·A. */
export function gaussArea(kind, s) {
  switch (kind) {
    case 'sphere': case 'shell': return 4 * PI * s * s;
    case 'cylinder': case 'cylShell': return 2 * PI * s;
    case 'slab': return 2;
    default: return 0;
  }
}

/** Potential. Spheres: V(∞) = 0. Cylinders: V(ref) = 0 at ref = 10a (there is no V(∞) in 2-D). Slab: V(0) = 0. */
export function potential(kind, p, s, ref = 10 * p.a) {
  const { Q = 1e-9, lambda = 1e-9, rho = 1e-6, a = 0.1 } = p, k = 1 / (4 * PI * EPS0);
  switch (kind) {
    case 'sphere': return s >= a ? (k * Q) / s : ((k * Q) / (2 * a)) * (3 - (s / a) ** 2);
    case 'shell': return s >= a ? (k * Q) / s : (k * Q) / a;
    case 'cylinder': { const Vout = (r) => (-lambda / (2 * PI * EPS0)) * Math.log(r / ref); return s >= a ? Vout(s) : Vout(a) + (lambda / (4 * PI * EPS0)) * (1 - (s / a) ** 2); }
    case 'cylShell': { const Vout = (r) => (-lambda / (2 * PI * EPS0)) * Math.log(r / ref); return s >= a ? Vout(s) : Vout(a); }
    case 'slab': return s <= a ? (-rho * s * s) / (2 * EPS0) : (-rho * a * a) / (2 * EPS0) - ((rho * a) / EPS0) * (s - a);
    default: return 0;
  }
}

/** Field vector at a point of the x–y plane (slab normal along x; cylinders along z, so the plane is a cross-section; spheres: an equatorial cut). */
export function fieldAt(kind, p, x, y) {
  if (kind === 'slab') { const E = fieldMag(kind, p, Math.abs(x)); return [Math.sign(x) * E, 0]; }
  const r = Math.hypot(x, y); if (r === 0) return [0, 0];
  const E = fieldMag(kind, p, r); return [(E * x) / r, (E * y) / r];
}

/** Potential at a point of the plane. */
export function potentialAt(kind, p, x, y) { return potential(kind, p, kind === 'slab' ? Math.abs(x) : Math.hypot(x, y)); }

/** Numeric divergence of E in the plane for a check: inside a uniform body ∇·E = ρ/ε₀ in 3-D, (for the cylinder cross-section the 2-D divergence of the in-plane field is also ρ/ε₀). */
export function numericDiv(kind, p, x, y, h = 1e-6) {
  const ex = (fieldAt(kind, p, x + h, y)[0] - fieldAt(kind, p, x - h, y)[0]) / (2 * h), ey = (fieldAt(kind, p, x, y + h)[1] - fieldAt(kind, p, x, y - h)[1]) / (2 * h);
  return ex + ey;
}

/** The uniform-sphere ρ for a given Q and the surface density of a shell, for the numbers. */
export function densities(kind, p) {
  const { Q = 1e-9, lambda = 1e-9, rho = 1e-6, a = 0.1 } = p;
  switch (kind) {
    case 'sphere': return { rho: Q / ((4 / 3) * PI * a ** 3) };
    case 'shell': return { sigma: Q / (4 * PI * a * a) };
    case 'cylinder': return { rho: lambda / (PI * a * a) };
    case 'cylShell': return { sigma: lambda / (2 * PI * a) };
    case 'slab': return { sigmaEquivalent: 2 * rho * a };
    default: return {};
  }
}
