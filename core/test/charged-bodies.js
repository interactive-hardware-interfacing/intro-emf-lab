// Charged bodies: Gauss's law against the textbook closed forms, continuity of E and V at the
// surface (jump σ/ε₀ for shells), E = −dV/dr, flux = Q_enc/ε₀, divergence inside.
import { PI, EPS0 } from '../constants.js';
import { enclosed, fieldMag, gaussArea, potential, fieldAt, potentialAt, numericDiv, densities } from '../charged-bodies.js';

export function chargedBodiesChecks(check) {
  const p = { Q: 2e-9, lambda: 3e-9, rho: 5e-6, a: 0.1 }, k = 1 / (4 * PI * EPS0);
  // sphere
  check('bodies sphere: E inside ∝ r (half radius → half the surface field)', fieldMag('sphere', p, 0.05), 0.5 * fieldMag('sphere', p, 0.1), 1e-12);
  check('bodies sphere: outside Q/4πε₀r²', fieldMag('sphere', p, 0.3), (k * 2e-9) / 0.09, 1e-12);
  check('bodies sphere: E continuous at a', fieldMag('sphere', p, 0.1 - 1e-12), fieldMag('sphere', p, 0.1 + 1e-12), 1e-9);
  check('bodies sphere: V(0) = 1.5 V(a)', potential('sphere', p, 0), 1.5 * potential('sphere', p, 0.1), 1e-12);
  check('bodies sphere: V continuous at a', potential('sphere', p, 0.1 - 1e-12), potential('sphere', p, 0.1 + 1e-12), 1e-9);
  check('bodies sphere: ρ = Q/(4πa³/3)', densities('sphere', p).rho, 2e-9 / ((4 / 3) * PI * 1e-3), 1e-12);
  // shell
  check('bodies shell: E = 0 inside', fieldMag('shell', p, 0.05), 0, 0);
  check('bodies shell: E jumps by σ/ε₀ at a', fieldMag('shell', p, 0.1 + 1e-12) - fieldMag('shell', p, 0.1 - 1e-12), densities('shell', p).sigma / EPS0, 1e-9);
  check('bodies shell: V constant inside = kQ/a', potential('shell', p, 0.03), (k * 2e-9) / 0.1, 1e-12);
  // cylinder
  check('bodies cylinder: E inside λr/(2πε₀a²)', fieldMag('cylinder', p, 0.04), (3e-9 * 0.04) / (2 * PI * EPS0 * 0.01), 1e-12);
  check('bodies cylinder: outside λ/(2πε₀r)', fieldMag('cylinder', p, 0.5), 3e-9 / (2 * PI * EPS0 * 0.5), 1e-12);
  check('bodies cylinder: E continuous at a', fieldMag('cylinder', p, 0.1 - 1e-12), fieldMag('cylinder', p, 0.1 + 1e-12), 1e-9);
  check('bodies cylinder: V continuous at a', potential('cylinder', p, 0.1 - 1e-12), potential('cylinder', p, 0.1 + 1e-12), 1e-9);
  check('bodies cylinder: V(ref) = 0 at 10a', Math.abs(potential('cylinder', p, 1)) < 1e-12 ? 1 : 0, 1, 0);
  check('bodies cylindrical shell: E jumps by σ/ε₀', fieldMag('cylShell', p, 0.1 + 1e-12), densities('cylShell', p).sigma / EPS0, 1e-9);
  // slab
  check('bodies slab: E inside ρx/ε₀', fieldMag('slab', p, 0.03), (5e-6 * 0.03) / EPS0, 1e-12);
  check('bodies slab: outside ρa/ε₀, constant', fieldMag('slab', p, 0.7), (5e-6 * 0.1) / EPS0, 1e-12);
  check('bodies slab: E continuous at a', fieldMag('slab', p, 0.1 - 1e-12), fieldMag('slab', p, 0.1 + 1e-12), 1e-9);
  check('bodies slab: V continuous at a', potential('slab', p, 0.1 - 1e-12), potential('slab', p, 0.1 + 1e-12), 1e-9);
  check('bodies slab: field points away from the mid-plane on both sides', fieldAt('slab', p, -0.2, 0)[0] < 0 && fieldAt('slab', p, 0.2, 0)[0] > 0 ? 1 : 0, 1, 0);
  // E = −dV/ds everywhere, every body
  let worst = 0;
  for (const kind of ['sphere', 'shell', 'cylinder', 'cylShell', 'slab']) for (const s of [0.02, 0.07, 0.13, 0.4]) {
    const h = 1e-7, dV = -(potential(kind, p, s + h) - potential(kind, p, s - h)) / (2 * h), E = fieldMag(kind, p, s);
    worst = Math.max(worst, Math.abs(dV - E) / Math.max(Math.abs(E), 1e-3));
  }
  check('bodies: E = −dV/ds for every body at four radii (rel 1e-5)', worst < 1e-5 ? 1 : 0, 1, 0);
  // Gauss: E × area = Q_enc/ε₀
  worst = 0;
  for (const kind of ['sphere', 'shell', 'cylinder', 'cylShell', 'slab']) for (const s of [0.05, 0.1, 0.3]) worst = Math.max(worst, Math.abs(fieldMag(kind, p, s) * gaussArea(kind, s) * EPS0 - enclosed(kind, p, s)) / Math.max(enclosed(kind, p, s), 1e-15));
  check('bodies Gauss: E·A·ε₀ = Q_enc for every body at three sizes', worst < 1e-12 ? 1 : 0, 1, 0);
  // divergence in the plane: cylinder cross-section ρ/ε₀; sphere equatorial cut 2ρ/3ε₀ (one of three directions is out of the plane); zero outside
  check('bodies div: cylinder cross-section ∇·E = ρ/ε₀ inside', numericDiv('cylinder', p, 0.03, 0.02), densities('cylinder', p).rho / EPS0, 1e-5);
  check('bodies div: sphere equatorial cut gives ⅔ ρ/ε₀ in the plane', numericDiv('sphere', p, 0.03, 0.02), (2 / 3) * densities('sphere', p).rho / EPS0, 1e-5);
  check('bodies div: zero outside the cylinder', Math.abs(numericDiv('cylinder', p, 0.2, 0.1)) < 1e-3 * fieldMag('cylinder', p, 0.2) / 0.2 ? 1 : 0, 1, 0);
  check('bodies potentialAt: matches potential(r)', potentialAt('sphere', p, 0.06, 0.08), potential('sphere', p, 0.1), 1e-12);
}
