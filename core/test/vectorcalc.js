// Vector calculus: every analytic gradient matches a numeric one; ∫E·dl = V(a) − V(b) for every
// gradient field on two different paths; closed loops give zero; the swirl's circulation is
// curl × area; the wire's circulation is 2π around the wire and 0 away from it; unit vectors.
import { PI } from '../constants.js';
import { SCALARS, VECTORS, lineIntegral, pathLength, circulationCircle, numericGrad, unitVectors, toPolar } from '../vectorcalc.js';

export function vectorcalcChecks(check) {
  let worst = 0;
  for (const [k, s] of Object.entries(SCALARS)) for (const [x, y] of [[0.4, 0.3], [-0.7, 0.2], [0.1, -0.9]]) { const g = s.grad(x, y), n = numericGrad(s.V, x, y); worst = Math.max(worst, Math.hypot(g[0] - n[0], g[1] - n[1]) / Math.max(Math.hypot(...n), 1e-9)); void k; }
  check('vectorcalc: analytic gradients match numeric ones for all six scalars at three points (rel 1e-6)', worst < 1e-6 ? 1 : 0, 1, 0);
  // path independence: two paths from a to b, the integral equals V(a) − V(b) for E = −∇V
  const a = [0.5, 0.2], b = [-0.3, 0.8], p1 = [a, b], p2 = [a, [0.9, 0.9], [-0.8, 0.6], b];
  worst = 0;
  for (const [k, v] of Object.entries(VECTORS)) { if (!v.conservative) continue; const i1 = lineIntegral(v.F, p1, 2000), i2 = lineIntegral(v.F, p2, 2000), dV = v.V(...a) - v.V(...b); worst = Math.max(worst, Math.abs(i1 - dV) / Math.max(Math.abs(dV), 1e-6), Math.abs(i2 - dV) / Math.max(Math.abs(dV), 1e-6)); void k; }
  check('vectorcalc: ∫E·dl = V(a) − V(b) on two different paths for every gradient field (rel 1e-5)', worst < 1e-5 ? 1 : 0, 1, 0);
  check('vectorcalc: a closed loop gives 0 for a gradient field (midpoint rule, 1e-7 of the one-way value)', Math.abs(lineIntegral(VECTORS.pointCharge.F, [a, [0.9, 0.9], [-0.8, 0.6], a], 2000)) < 1e-7 * Math.abs(VECTORS.pointCharge.V(...a) - VECTORS.pointCharge.V(0.9, 0.9)) ? 1 : 0, 1, 0);
  // non-conservative: the swirl's circulation around a circle is curl × area = 2πR²
  check('vectorcalc swirl: circulation around R = 0.5 is 2 × πR²', circulationCircle(VECTORS.swirl.F, 0, 0, 0.5), 2 * PI * 0.25, 1e-9);
  check('vectorcalc swirl: … and around a square of side 1 is 2', lineIntegral(VECTORS.swirl.F, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], 500), 2, 1e-9);
  check('vectorcalc swirl: two paths between the same points differ', Math.abs(lineIntegral(VECTORS.swirl.F, p1, 500) - lineIntegral(VECTORS.swirl.F, p2, 500)) > 0.1 ? 1 : 0, 1, 0);
  check('vectorcalc shear: circulation around the unit square = curl × area = −1', lineIntegral(VECTORS.shear.F, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], 500), -1, 1e-9);
  // the wire field: curl-free away from the wire, yet circulation 2π around it (Ampère)
  check('vectorcalc wire: circulation around the wire is 2π', circulationCircle(VECTORS.wire.F, 0, 0, 0.7), 2 * PI, 1e-9);
  check('vectorcalc wire: … independent of the radius', circulationCircle(VECTORS.wire.F, 0, 0, 0.2), 2 * PI, 1e-9);
  check('vectorcalc wire: a loop that does not enclose the wire gives 0', Math.abs(circulationCircle(VECTORS.wire.F, 1.5, 0, 0.5)) < 1e-6 ? 1 : 0, 1, 0);
  check('vectorcalc: path length of a unit square', pathLength([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]), 4, 1e-15);
  // unit vectors
  const u = unitVectors(0.6, 0.8);
  check('vectorcalc unit vectors: r̂ at (0.6, 0.8) is (0.6, 0.8)', u.rhat[0], 0.6, 1e-15);
  check('vectorcalc unit vectors: φ̂ ⟂ r̂', u.rhat[0] * u.phihat[0] + u.rhat[1] * u.phihat[1], 0, 0);
  check('vectorcalc unit vectors: φ̂ is counter-clockwise (r̂ × φ̂ = +ẑ)', u.rhat[0] * u.phihat[1] - u.rhat[1] * u.phihat[0], 1, 1e-15);
  check('vectorcalc unit vectors: θ̂ ⟂ r̂ (spherical, polar axis +y)', Math.abs(u.rhat[0] * u.thetahat[0] + u.rhat[1] * u.thetahat[1]) < 1e-15 ? 1 : 0, 1, 0);
  check('vectorcalc toPolar: the wire field is purely azimuthal, F_φ = 1/r', toPolar(...VECTORS.wire.F(0.6, 0.8), 0.6, 0.8).Fphi, 1, 1e-12);
  check('vectorcalc toPolar: … with F_r = 0', Math.abs(toPolar(...VECTORS.wire.F(0.6, 0.8), 0.6, 0.8).Fr) < 1e-15 ? 1 : 0, 1, 0);
  check('vectorcalc toPolar: the point-charge field is purely radial', toPolar(...VECTORS.pointCharge.F(0.6, 0.8), 0.6, 0.8).Fr, 1, 1e-12);
}
