// Lorentz checks: the Boris pusher against cyclotron motion (closes after one period, conserves
// energy exactly), E×B drift and the cycloid's mean velocity, the parabola in E alone, the
// velocity selector, and the closed forms (Hall, parallel wires, loop torque).
import { MU0, PI } from '../constants.js';
import { PARTICLES, E_CHARGE, borisStep, trace, cyclotron, exbDrift, selectorSpeed, spectrometerRadius, hall, wireForcePerLength, loopTorque } from '../lorentz.js';

export function lorentzChecks(check) {
  const { q, m } = PARTICLES.proton, B = 0.5, v = 1e5;
  const cyc = cyclotron(q, m, v, B);
  check('lorentz cyclotron: r = m v / (q B)', cyc.r, (m * v) / (q * B), 1e-15);
  check('lorentz cyclotron: T = 2π m / (q B)', cyc.T, (2 * PI * m) / (q * B), 1e-15);
  const uni = () => ({ E: [0, 0, 0], B: [0, 0, B] });
  const tr = trace({ q, m, x0: [0, 0, 0], v0: [v, 0, 0] }, uni, { dt: cyc.T / 400, steps: 400 });
  const xe = tr.x[400];
  check('lorentz Boris: back at the start after one period (1e-3 of r)', Math.hypot(xe[0], xe[1]) / cyc.r, 0, 1e-3);
  check('lorentz Boris: kinetic energy conserved in B alone (1e-9)', tr.ke[400], tr.ke[0], 1e-9);
  // the circle: every sample at distance r from the centre (0, -r) (proton, v along +x, B along +z: F = qvB (x̂ × ẑ) = -qvB ŷ)
  let worst = 0; for (const x of tr.x) worst = Math.max(worst, Math.abs(Math.hypot(x[0], x[1] + cyc.r) - cyc.r) / cyc.r);
  check('lorentz Boris: stays on the circle of radius r about (0, −r) (1e-4 with the half-step start)', worst, 0, 1e-4);
  const el = trace({ q: PARTICLES.electron.q, m: PARTICLES.electron.m, x0: [0, 0, 0], v0: [v, 0, 0] }, uni, { dt: 1e-13, steps: 100 });
  check('lorentz Boris: an electron curves the other way (y > 0)', el.x[100][1] > 0 ? 1 : 0, 1, 0);
  // E×B
  const E = [1e4, 0, 0];
  check('lorentz E×B drift: E/B along −y for E along x, B along z', exbDrift(E, [0, 0, B])[1], -1e4 / B, 1e-12);
  const cyl = trace({ q, m, x0: [0, 0, 0], v0: [0, 0, 0] }, () => ({ E, B: [0, 0, B] }), { dt: cyc.T / 400, steps: 4000 });
  const tEnd = cyl.t[4000];
  check('lorentz cycloid: mean velocity equals the E×B drift (1e-4)', cyl.x[4000][1] / tEnd, -1e4 / B, 1e-4);
  check('lorentz cycloid: no net motion along E over whole periods (1e-3 of the drift distance)', Math.abs(cyl.x[4000][0]) / Math.abs(cyl.x[4000][1]), 0, 1e-3);
  const vmax = Math.max(...cyl.v.map((vv) => Math.hypot(vv[0], vv[1])));
  check('lorentz cycloid: peak speed is twice the drift speed (1e-3)', vmax, 2e4 / B, 1e-3);
  // parabola in E alone
  const par = trace({ q, m, x0: [0, 0, 0], v0: [v, 0, 0] }, () => ({ E: [0, -1e4, 0], B: [0, 0, 0] }), { dt: 1e-9, steps: 100 });
  check('lorentz parabola: y = ½ (qE/m) t² (1e-6)', par.x[100][1], 0.5 * (q * -1e4 / m) * (100e-9) ** 2, 1e-6);
  check('lorentz parabola: x = v t exactly', par.x[100][0], v * 100e-9, 1e-12);
  // velocity selector: E_y = v B passes a particle of speed v straight through, slower/faster ones bend
  const Ey = v * B, sel = (vv) => trace({ q, m, x0: [0, 0, 0], v0: [vv, 0, 0] }, () => ({ E: [0, Ey, 0], B: [0, 0, B] }), { dt: cyc.T / 400, steps: 400 });
  check('lorentz selector: v = E/B', selectorSpeed([0, Ey, 0], [0, 0, B]), v, 1e-12);
  check('lorentz selector: the selected speed goes straight (y stays 0 to 1e-9 m)', Math.abs(sel(v).x[400][1]), 0, 1e-9);
  // the deflected ones are trochoids that return to y = 0 every period, so look a quarter period in
  check('lorentz selector: a faster particle bends toward −y (magnetic force wins)', sel(1.2 * v).x[100][1] < 0 ? 1 : 0, 1, 0);
  check('lorentz selector: a slower particle bends toward +y (electric force wins)', sel(0.8 * v).x[100][1] > 0 ? 1 : 0, 1, 0);
  check('lorentz spectrometer: r = m v / (q B) for the deuteron is twice the proton\'s', spectrometerRadius(PARTICLES.deuteron.m, v, E_CHARGE, B) / spectrometerRadius(m, v, E_CHARGE, B), PARTICLES.deuteron.m / m, 1e-12);
  // one Boris step with E only is exact for constant acceleration
  const s = borisStep([0, 0, 0], [0, 0, 0], q, m, [1e4, 0, 0], [0, 0, 0], 1e-9);
  check('lorentz Boris: E alone gives v = (q E / m) Δt after one step', s.v[0], (q * 1e4 / m) * 1e-9, 1e-12);
  // Hall
  const h = hall({ I: 1, B: 1, n: 8.5e28, qc: -E_CHARGE, w: 0.01, t: 1e-3 });
  check('lorentz Hall: V_H = I B / (n q t) for copper, 1 A, 1 T, 1 mm (−73.4 nV)', h.VH, 1 / (8.5e28 * -E_CHARGE * 1e-3), 1e-12);
  check('lorentz Hall: R_H negative for electrons', h.RH < 0 ? 1 : 0, 1, 0);
  check('lorentz Hall: holes give the opposite sign', hall({ I: 1, B: 1, n: 1e21, qc: E_CHARGE, w: 0.01, t: 1e-3 }).VH > 0 ? 1 : 0, 1, 0);
  // wires and loop
  check('lorentz wires: the ampere, 2e-7 N/m', wireForcePerLength(1, 1, 1), 2e-7, 1e-9);
  check('lorentz wires: antiparallel currents repel (negative)', wireForcePerLength(1, -1, 0.01) < 0 ? 1 : 0, 1, 0);
  check('lorentz wires: μ0 I1 I2 / 2π d', wireForcePerLength(3, 4, 0.02), (MU0 * 12) / (2 * PI * 0.02), 1e-15);
  const L = loopTorque(10, 2, 0.01, 0.5, PI / 2);
  check('lorentz loop: m = N I A', L.m, 0.2, 1e-15);
  check('lorentz loop: τ = m B at 90°', L.torque, 0.1, 1e-15);
  check('lorentz loop: U = −mB at 0°', loopTorque(10, 2, 0.01, 0.5, 0).U, -0.1, 1e-15);
  check('lorentz loop: |τ| = dU/dθ (numerical, 1e-6)', loopTorque(10, 2, 0.01, 0.5, 1).torque, (loopTorque(10, 2, 0.01, 0.5, 1 + 1e-6).U - loopTorque(10, 2, 0.01, 0.5, 1 - 1e-6).U) / 2e-6, 1e-6);
}
