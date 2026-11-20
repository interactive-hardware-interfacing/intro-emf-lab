// Method of images: the conductor is an equipotential (V = 0) in every case, the induced
// charge integrates to the image charge, the force matches the closed forms, and the field is
// normal to the conductor.
import { PI, EPS0 } from '../constants.js';
import { imageSet, inRegion, fieldAt, potentialAt, inducedSigma, inducedTotal, force, closedForms, inducedTotalNumeric } from '../images.js';

export function imagesChecks(check) {
  const K = 1 / (4 * PI * EPS0);
  const pp = { q: 2e-9, d: 0.1 }, ps = { q: 2e-9, a: 0.1, D: 0.25 }, pc = { q: 2e-9, x0: 0.12, y0: 0.08 };
  // the conductor is at V = 0 (the point of the method)
  let worst = 0;
  for (const x of [-0.3, -0.05, 0, 0.07, 0.4]) worst = Math.max(worst, Math.abs(potentialAt('plane', pp, x, 1e-9)), Math.abs(potentialAt('linePlane', pp, x, 1e-9)));
  check('images plane: V = 0 on the plane (point and line), 5 points (rel. to kq/d)', worst < 1e-6 * K * 2e-9 / 0.1 ? 1 : 0, 1, 0);
  worst = 0; for (const th of [0, 0.4, 1.1, 2, 3]) worst = Math.max(worst, Math.abs(potentialAt('sphere', ps, 0.1 * Math.cos(th) * (1 + 1e-9), 0.1 * Math.sin(th) * (1 + 1e-9))));
  check('images sphere: V = 0 on the sphere, 5 points', worst < 1e-6 * K * 2e-9 / 0.1 ? 1 : 0, 1, 0);
  worst = 0; for (const s of [0.02, 0.1, 0.3]) worst = Math.max(worst, Math.abs(potentialAt('corner', pc, s, 1e-9)), Math.abs(potentialAt('corner', pc, 1e-9, s)));
  check('images corner: V = 0 on both planes', worst < 1e-6 * K * 2e-9 / 0.08 ? 1 : 0, 1, 0);
  // field normal to the conductor (tangential E = 0)
  check('images plane: E tangential to the plane is 0', Math.abs(fieldAt('plane', pp, 0.07, 1e-9)[0]) < 1e-6 * Math.abs(fieldAt('plane', pp, 0.07, 1e-9)[1]) ? 1 : 0, 1, 0);
  { const th = 0.9, x = 0.1 * Math.cos(th) * (1 + 1e-9), y = 0.1 * Math.sin(th) * (1 + 1e-9), [ex, ey] = fieldAt('sphere', ps, x, y), tang = -ex * Math.sin(th) + ey * Math.cos(th); check('images sphere: E tangential to the sphere is 0', Math.abs(tang) < 1e-6 * Math.hypot(ex, ey) ? 1 : 0, 1, 0); }
  // images
  check('images sphere: q′ = −q a/D', imageSet('sphere', ps)[1].q, (-2e-9 * 0.1) / 0.25, 1e-15);
  check('images sphere: at a²/D', imageSet('sphere', ps)[1].x, 0.04, 1e-15);
  check('images corner: three images, signs −, −, +', imageSet('corner', pc).slice(1).map((c) => Math.sign(c.q)).join(',') === '-1,-1,1' ? 1 : 0, 1, 0);
  // induced charge: σ at the foot and the integral
  check('images plane: σ(0) = −q/2πd²', inducedSigma('plane', pp, 0), -2e-9 / (2 * PI * 0.01), 1e-15);
  check('images plane: σ = ε₀ E_n just above the plane', inducedSigma('plane', pp, 0.07), EPS0 * fieldAt('plane', pp, 0.07, 1e-9)[1], 1e-6);
  check('images plane: ∫σ dA = −q', inducedTotalNumeric('plane', pp), -2e-9, 1e-6);
  check('images line–plane: ∫σ dx = −λ', inducedTotalNumeric('linePlane', pp), -2e-9, 1e-6);
  check('images sphere: ∫σ dA = −q a/D', inducedTotalNumeric('sphere', ps), (-2e-9 * 0.1) / 0.25, 1e-6);
  check('images sphere: σ = ε₀ E_n at the surface', inducedSigma('sphere', ps, 0.9), EPS0 * (() => { const th = 0.9, x = 0.1 * Math.cos(th) * (1 + 1e-9), y = 0.1 * Math.sin(th) * (1 + 1e-9), [ex, ey] = fieldAt('sphere', ps, x, y); return ex * Math.cos(th) + ey * Math.sin(th); })(), 1e-6);
  check('images corner: σ on y = 0 is ε₀E_y (by construction) and negative near the charge', inducedSigma('corner', pc, 0.12) < 0 ? 1 : 0, 1, 0);
  // force
  check('images plane: F = q²/(4πε₀(2d)²), attractive (−y)', force('plane', pp)[1], -(K * 4e-18) / (4 * 0.01), 1e-12);
  check('images plane: closed form agrees', -force('plane', pp)[1], closedForms('plane', pp).F, 1e-12);
  check('images line–plane: F/l = λ²/(4πε₀d)', -force('linePlane', pp)[1], (4e-18) / (4 * PI * EPS0 * 0.1), 1e-12);
  check('images sphere: F = q² a D/(4πε₀ (D² − a²)²), toward the sphere', -force('sphere', ps)[0], closedForms('sphere', ps).F, 1e-12);
  check('images corner: force points toward the corner (both components negative)', force('corner', pc)[0] < 0 && force('corner', pc)[1] < 0 ? 1 : 0, 1, 0);
  // region
  check('images: inside the conductor the field is zero', Math.hypot(...fieldAt('plane', pp, 0.1, -0.05)) + Math.hypot(...fieldAt('sphere', ps, 0.03, 0.02)) + Math.hypot(...fieldAt('corner', pc, -0.1, 0.1)), 0, 0);
  check('images: inRegion for the sphere is outside', inRegion('sphere', ps, 0.2, 0) && !inRegion('sphere', ps, 0.05, 0) ? 1 : 0, 1, 0);
  check('images: inducedTotal closed forms', inducedTotal('sphere', ps), (-2e-9 * 0.1) / 0.25, 1e-15);
}
