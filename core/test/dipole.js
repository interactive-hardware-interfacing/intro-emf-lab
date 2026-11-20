// Electric dipole: the ideal dipole is the far field of the pair (error ∝ (s/r)²), the 2:1
// axis/broadside ratio, E = −∇V for both, torque p × E against the two forces, energy −p·E.
import { PI, EPS0 } from '../constants.js';
import { exactField, exactPotential, idealField, idealPotential, idealAxisBroadside, inUniformField, idealError, totalField, totalPotential, torqueNumeric } from '../dipole.js';

export function dipoleChecks(check) {
  const K = 1 / (4 * PI * EPS0), q = 1e-9, s = 0.01, p = q * s;
  check('dipole ideal: on the axis 2Kp/r³', Math.hypot(...idealField(p, 0, 0.5)), (2 * K * p) / 0.125, 1e-12);
  check('dipole ideal: broadside Kp/r³, pointing −y (against p)', idealField(p, 0.5, 0)[1], (-K * p) / 0.125, 1e-12);
  check('dipole ideal: axis/broadside = 2', idealAxisBroadside(p, 0.3).axis / idealAxisBroadside(p, 0.3).broadside, 2, 1e-15);
  check('dipole ideal: V = Kp cosθ/r²', idealPotential(p, 0, 0.5), (K * p) / 0.25, 1e-12);
  check('dipole ideal: V = 0 broadside', idealPotential(p, 0.5, 0), 0, 0);
  // E = −∇V, ideal and exact
  for (const [name, E, V] of [['ideal', (x, y) => idealField(p, x, y), (x, y) => idealPotential(p, x, y)], ['exact', (x, y) => exactField(q, s, x, y), (x, y) => exactPotential(q, s, x, y)]]) {
    let worst = 0;
    for (const [x, y] of [[0.1, 0.2], [-0.3, 0.05], [0.02, 0.03], [0.4, -0.1]]) { const h = 1e-7, ex = -(V(x + h, y) - V(x - h, y)) / (2 * h), ey = -(V(x, y + h) - V(x, y - h)) / (2 * h), e = E(x, y); worst = Math.max(worst, Math.hypot(ex - e[0], ey - e[1]) / Math.hypot(...e)); }
    check(`dipole ${name}: E = −∇V at four points (rel 1e-6)`, worst < 1e-6 ? 1 : 0, 1, 0);
  }
  // the pair tends to the ideal dipole: error ∝ (s/r)², and the error is ~ +(s/r)² on the axis (the near charge wins)
  const e1 = idealError(q, s, 0.1), e2 = idealError(q, s, 0.2);
  check('dipole exact vs ideal: axis error at r = 10 s is +½(s/r)² = 0.5 %', e1.axis, 0.005, 0.05);
  check('dipole exact vs ideal: axis error falls 4× when r doubles', e1.axis / e2.axis, 4, 0.03);
  check('dipole exact vs ideal: broadside error is negative and smaller (−3/8 (s/r)²)', e1.broadside, -0.375 * 0.01, 0.05);
  check('dipole exact: ratio axis/broadside at r = 10 s is 2.03', Math.hypot(...exactField(q, s, 0, 0.1)) / Math.hypot(...exactField(q, s, 0.1, 0)), 2.03, 1e-2);
  // uniform field
  const E0 = 1e4;
  check('dipole torque: p × E = −pE₀ sinθ (restoring)', inUniformField(p, 0.7, E0).torque, -p * E0 * Math.sin(0.7), 1e-15);
  check('dipole torque: equals the torque of the two forces', inUniformField(p, 0.7, E0).torque, torqueNumeric(q, s, 0.7, E0), 1e-12);
  check('dipole torque: zero aligned and anti-aligned', Math.abs(inUniformField(p, 0, E0).torque) + Math.abs(inUniformField(p, PI, E0).torque) < 1e-20 ? 1 : 0, 1, 0);
  check('dipole energy: −pE₀ cosθ, minimum aligned', inUniformField(p, 0, E0).U, -p * E0, 1e-15);
  check('dipole energy: τ = −dU/dθ', inUniformField(p, 0.7, E0).torque, -(inUniformField(p, 0.7 + 1e-7, E0).U - inUniformField(p, 0.7 - 1e-7, E0).U) / 2e-7, 1e-6);
  check('dipole force: p cosθ dE/dx', inUniformField(p, 0, E0, 2e4).F, p * 2e4, 1e-15);
  // total field with background: far away it is E₀; the pair\'s own field dominates close in
  check('dipole in E₀: far from the pair the field is E₀ x̂', totalField(q, s, 0.3, E0, 5, 5)[0], E0, 1e-6);
  check('dipole in E₀: V = −E₀x + pair', totalPotential(q, s, 0, E0, 2, 0) + E0 * 2, exactPotential(q, s, 0, 2) * 0 + (K * q) / Math.hypot(2 - s / 2, 0) - (K * q) / Math.hypot(2 + s / 2, 0), 1e-9);
}
