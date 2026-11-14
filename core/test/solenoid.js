// Solenoid checks: the exact loop field against brute-force Biot–Savart and the on-axis
// closed form, psi as a stream function, the turn sum against the finite-sheet formula and
// the long-solenoid limit, the Helmholtz and anti-Helmholtz values, Nagaoka's L.
import { MU0, PI } from '../constants.js';
import { loopOnAxisBz, nagaoka } from '../analytic.js';
import { loopB, loopAphi, solenoidTurns, pairTurns, turnsB, turnsPsi, sheetAxisBz, longBz, nagaokaL, axisProfile } from '../solenoid.js';

/** Brute-force Biot–Savart around one loop (n straight segments) at (rho, 0, z). */
function bruteLoop(I, R, zc, rho, z, n = 20000) {
  let bx = 0, bz = 0;
  for (let k = 0; k < n; k++) {
    const th = ((k + 0.5) / n) * 2 * PI, px = R * Math.cos(th), py = R * Math.sin(th);
    const dl = [-Math.sin(th), Math.cos(th), 0], rv = [rho - px, -py, z - zc], r = Math.hypot(...rv);
    const f = ((MU0 * I) / (4 * PI)) * ((2 * PI * R) / n) / (r * r * r);
    bx += f * (dl[1] * rv[2] - dl[2] * rv[1]); bz += f * (dl[0] * rv[1] - dl[1] * rv[0]);
  }
  return [bx, bz];
}

export function solenoidChecks(check) {
  // 1. One loop
  {
    check('solenoid loop: on the axis equals μ0 I R² / 2(R² + z²)^{3/2} (1e-12)', loopB(2, 0.01, 0, 0, 0.005)[1], loopOnAxisBz(2, 0.01, 0.005), 1e-12);
    for (const [rho, z] of [[0.005, 0.003], [0.012, 0.002], [0.0099, 0.0005], [0.03, -0.02]]) {
      const a = loopB(2, 0.01, 0, rho, z), b = bruteLoop(2, 0.01, 0, rho, z);
      check(`solenoid loop: B_rho at (${rho}, ${z}) vs brute-force Biot–Savart (1e-8)`, a[0], b[0], 1e-8);
      check(`solenoid loop: B_z at (${rho}, ${z}) vs brute-force Biot–Savart (1e-8)`, a[1], b[1], 1e-8);
    }
    check('solenoid loop: B_rho is odd in rho', loopB(2, 0.01, 0, -0.005, 0.003)[0], -loopB(2, 0.01, 0, 0.005, 0.003)[0], 1e-12);
    check('solenoid loop: B_rho vanishes in the plane of the loop', loopB(2, 0.01, 0, 0.004, 0)[0], 0, 1e-20);
    check('solenoid loop: on the wire the field is NaN', Number.isNaN(loopB(2, 0.01, 0, 0.01, 0)[1]) ? 1 : 0, 1, 0);
    // psi = rho A_phi is a stream function: B_z = (1/rho) dpsi/drho, B_rho = -(1/rho) dpsi/dz
    const t = [{ I: 2, R: 0.01, zc: 0 }], rho = 0.006, z = 0.004, h = 1e-7;
    check('solenoid psi: B_z = (1/ρ) ∂ψ/∂ρ (1e-6)', (turnsPsi(t, rho + h, z) - turnsPsi(t, rho - h, z)) / (2 * h) / rho, loopB(2, 0.01, 0, rho, z)[1], 1e-6);
    check('solenoid psi: B_ρ = −(1/ρ) ∂ψ/∂z (1e-6)', -(turnsPsi(t, rho, z + h) - turnsPsi(t, rho, z - h)) / (2 * h) / rho, loopB(2, 0.01, 0, rho, z)[0], 1e-6);
    check('solenoid A_phi: zero on the axis', loopAphi(2, 0.01, 0, 0, 0.003), 0, 0);
    check('solenoid loop: far field is a dipole μ0 m / 2π z³ (5e-3 at z = 20a; exact ratio (1 + (a/z)²)^{-3/2})', loopB(1, 0.01, 0, 0, 0.2)[1], (MU0 * PI * 1e-4) / (2 * PI * 0.2 ** 3), 5e-3);
  }

  // 2. Solenoid: N turns on the axis against the finite-sheet formula and the long limit
  {
    const N = 400, L = 0.1, a = 0.01, I = 1, T = solenoidTurns(N, I, L, a), n = N / L;
    check('solenoid turns: N turns spread over L', T.length, N, 0);
    check('solenoid turns: symmetric about z = 0', T[0].zc + T[N - 1].zc, 0, 1e-15);
    for (const z of [0, 0.03, 0.05, 0.08]) check(`solenoid axis: 400 turns vs sheet formula at z = ${z} (2e-5)`, turnsB(T, 0, z)[1], sheetAxisBz(n, I, L, a, z), 2e-5);
    check('solenoid axis: centre of a 10a-long coil is 98% of μ0 n I (1e-3)', turnsB(T, 0, 0)[1] / longBz(n, I), 1 / Math.sqrt(1 + (2 * a / L) ** 2), 1e-3);
    check('solenoid axis: at the end of a 10a coil B is half the centre (2e-2; exactly 0.5074)', sheetAxisBz(n, I, L, a, L / 2) / sheetAxisBz(n, I, L, a, 0), 0.5, 2e-2);
    check('solenoid sheet formula: infinite length gives μ0 n I', sheetAxisBz(n, I, 1e6, a, 0), longBz(n, I), 1e-9);
    check('solenoid: B_z across the bore of a long coil is flat (halfway to the wall within 1e-3)', turnsB(T, 0.5 * a, 0)[1] / turnsB(T, 0, 0)[1], 1, 1e-3);
    check('solenoid: outside a long coil B_z reverses and is weak', turnsB(T, 2 * a, 0)[1] < 0 && Math.abs(turnsB(T, 2 * a, 0)[1]) < 0.05 * turnsB(T, 0, 0)[1] ? 1 : 0, 1, 0);
    const prof = axisProfile(T, L, a);
    check('solenoid axisProfile: centre value', prof.B0, turnsB(T, 0, 0)[1], 1e-12);
    check('solenoid axisProfile: 1% uniform region spans 30–60% of the length for L = 10a', (prof.uniform[1] - prof.uniform[0]) / L > 0.3 && (prof.uniform[1] - prof.uniform[0]) / L < 0.6 ? 1 : 0, 1, 0);
    check('solenoid nagaokaL: K_N μ0 N² π a² / L', nagaokaL(100, 0.03, 0.015), nagaoka(0.03, 0.03) * (MU0 * 1e4 * PI * 0.015 ** 2) / 0.03, 1e-12);
    check('solenoid nagaokaL: below the long-solenoid value', nagaokaL(100, 0.03, 0.015) < (MU0 * 1e4 * PI * 0.015 ** 2) / 0.03 ? 1 : 0, 1, 0);
  }

  // 3. Helmholtz and anti-Helmholtz
  {
    const a = 0.05, h = a / 10;
    const H = pairTurns(1, a, a), B0 = turnsB(H, 0, 0)[1];
    check('solenoid Helmholtz: B0 = (4/5)^{3/2} μ0 I / a (1e-12)', B0, Math.pow(0.8, 1.5) * MU0 / a, 1e-12);
    check('solenoid Helmholtz: flat to 1.5e-4 at z = a/10', Math.abs(turnsB(H, 0, h)[1] / B0 - 1) < 1.5e-4 ? 1 : 0, 1, 0);
    const off = pairTurns(1, a, 0.8 * a);
    check('solenoid Helmholtz: d = 0.8a is not flat (error > 2e-3 at z = a/10, quadratic)', Math.abs(turnsB(off, 0, h)[1] / turnsB(off, 0, 0)[1] - 1) > 2e-3 ? 1 : 0, 1, 0);
    const A = pairTurns(1, a, a, -1), hg = a / 400;
    check('solenoid anti-Helmholtz: zero field at the centre', turnsB(A, 0, 0)[1], 0, 1e-20);
    check('solenoid anti-Helmholtz: |dB/dz| = 48 μ0 I / (25 √5 a²) (1e-5)', Math.abs((turnsB(A, 0, hg)[1] - turnsB(A, 0, -hg)[1]) / (2 * hg)), (48 / (25 * Math.sqrt(5))) * MU0 / (a * a), 1e-5);
  }
}
