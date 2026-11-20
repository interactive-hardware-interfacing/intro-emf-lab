// Magnetic circuits: reluctances add, the gap takes most of the MMF, L = N²/ℛ, the energy
// sits in the gap, the force is B²A/2μ₀, fringing lowers ℛ_gap, saturation caps B and makes
// L fall, and the gap linearises.
import { PI, MU0 } from '../constants.js';
import { coreB, coreEnergyDensity, solve, sweepNI, sweepGap } from '../magcircuit.js';

export function magcircuitChecks(check) {
  const p = { lc: 0.2, w: 0.02, d: 0.02, g: 1e-3, muR: 2000, Bsat: 0, N: 200, I: 1, fringe: false };
  const s = solve(p);
  check('magcircuit: ℛ_core = l/(μ₀μ_r A) = 1.989e5 /H', s.Rc, 0.2 / (MU0 * 2000 * 4e-4), 1e-12);
  check('magcircuit: ℛ_gap = g/(μ₀ A) = 1.989e6 /H', s.Rg, 1e-3 / (MU0 * 4e-4), 1e-12);
  check('magcircuit: Φ = NI/(ℛ_c + ℛ_g)', s.Phi, 200 / (s.Rc + s.Rg), 1e-12);
  check('magcircuit: the 1 mm gap takes 91 % of the MMF (ℛ_g/ℛ_tot)', s.gapShare, s.Rg / (s.Rc + s.Rg), 1e-12);
  check('magcircuit: NI = H_c l_c + H_g g', s.Hc * 0.2 + s.Hg * 1e-3, 200, 1e-9);
  check('magcircuit: B continuous across the gap without fringing', s.Bc, s.Bg, 1e-12);
  check('magcircuit: L = N²/ℛ_tot', s.L, 4e4 / (s.Rc + s.Rg), 1e-12);
  check('magcircuit: L = NΦ/I', s.L, (200 * s.Phi) / 1, 1e-12);
  check('magcircuit: W = ½LI²', s.W, 0.5 * s.L, 1e-9);
  check('magcircuit: energy in the gap / total = ℛ_g/ℛ_tot', s.Wg / s.W, s.Rg / (s.Rc + s.Rg), 1e-9);
  check('magcircuit: gap force B²A/2μ₀', s.F, (s.Bg * s.Bg * 4e-4) / (2 * MU0), 1e-12);
  { // virtual work at constant flux: W(g) = ½Φ²(ℛ_c + g/μ₀A), F = dW/dg
    const Wg = (gg) => 0.5 * s.Phi * s.Phi * (s.Rc + gg / (MU0 * 4e-4)), h = 1e-7;
    check('magcircuit: force = dW/dg at constant Φ (virtual work)', s.F, (Wg(1e-3 + h) - Wg(1e-3 - h)) / (2 * h), 1e-6);
  }
  // fringing: a wider effective gap area lowers ℛ_gap
  const sf = solve({ ...p, fringe: true });
  check('magcircuit fringing: A_gap = (w+g)(d+g)', sf.Ag, 0.021 * 0.021, 1e-12);
  check('magcircuit fringing: ℛ_gap lower, L higher', sf.L > s.L && sf.Rg < s.Rg ? 1 : 0, 1, 0);
  check('magcircuit fringing: B in the gap lower than in the core by A_c/A_g', sf.Bg / sf.Bc, 4e-4 / (0.021 * 0.021), 1e-12);
  // no gap: L = N² μ A / l
  const s0 = solve({ ...p, g: 0 });
  check('magcircuit no gap: L = N²μ₀μ_r A/l = 0.1005 H', s0.L, (4e4 * MU0 * 2000 * 4e-4) / 0.2, 1e-12);
  check('magcircuit: the 1 mm gap cuts L by 11×', s0.L / s.L, 1 + s.Rg / s.Rc, 1e-9);
  // saturation
  check('magcircuit coreB: linear law at small H', coreB(10, { muR: 2000, Bsat: 1.5 }), MU0 * 2000 * 10, 2e-3);
  check('magcircuit coreB: saturates at B_sat + μ₀H', coreB(1e7, { muR: 2000, Bsat: 1.5 }) - MU0 * 1e7, 1.5, 1e-3);
  const ssat = solve({ ...p, Bsat: 1.2, I: 20 }), slin = solve({ ...p, I: 20 });
  check('magcircuit saturating: at 20 A the core B stays near B_sat while the linear model exceeds it', ssat.Bc < 1.3 && slin.Bc > 1.3 ? 1 : 0, 1, 0);
  check('magcircuit saturating: NI = H_c l_c + H_g g still holds', ssat.Hc * 0.2 + ssat.Hg * 1e-3, 4000, 1e-6);
  check('magcircuit saturating: at small current it matches the linear model', solve({ ...p, Bsat: 1.2, I: 0.1 }).L, solve({ ...p, I: 0.1 }).L, 2e-3);
  check('magcircuit saturating: L falls with current', solve({ ...p, Bsat: 1.2, I: 20 }).L < solve({ ...p, Bsat: 1.2, I: 1 }).L ? 1 : 0, 1, 0);
  // sweeps
  const sw = sweepNI({ ...p, Bsat: 1.2 }, 4000, 50);
  check('magcircuit sweep: with the gap the curve is more linear (B at half NI closer to half B at full NI)', Math.abs(sw.Bgap[25] / sw.Bgap[49] - 0.5) < Math.abs(sw.BnoGap[25] / sw.BnoGap[49] - 0.5) ? 1 : 0, 1, 0);
  const sg = sweepGap(p, 5e-3, 11);
  check('magcircuit sweep: L falls monotonically with gap', sg.L.every((v, i) => i === 0 || v < sg.L[i - 1]) ? 1 : 0, 1, 0);
  check('magcircuit sweep: gap share rises toward 1', sg.gapShare[10] > 0.95 ? 1 : 0, 1, 0);
  // stored energy with a saturating core: ∫H dB, which is less than ½HB (the B–H curve bends over); equal while linear
  {
    const mat = { muR: 2000, Bsat: 1.2 }, H = 2000;
    let I = 0; const n = 20000; for (let i = 0; i < n; i++) { const h = ((i + 0.5) * H) / n; I += coreB(h, mat) * (H / n); }
    check('magcircuit energy density = HB − ∫B dH (saturating)', coreEnergyDensity(H, mat), H * coreB(H, mat) - I, 1e-6);
    check('magcircuit energy density < ½HB once saturating', coreEnergyDensity(H, mat) < 0.5 * H * coreB(H, mat) ? 1 : 0, 1, 0);
    check('magcircuit energy density = ½HB when linear', coreEnergyDensity(H, { muR: 2000, Bsat: 0 }), 0.5 * H * coreB(H, { muR: 2000, Bsat: 0 }), 1e-12);
    const s = solve({ lc: 0.2, w: 0.02, d: 0.02, g: 1e-3, muR: 2000, Bsat: 1.2, N: 200, I: 5 });
    check('magcircuit saturating solve: W = W_gap + ∫H dB · V_core', s.W, s.Wg + coreEnergyDensity(s.Hc, mat) * s.Ac * 0.2, 1e-9);
    check('magcircuit saturating solve: W < ½ L I² (secant L overstates it)', s.W < 0.5 * s.L * 25 ? 1 : 0, 1, 0);
  }
  void PI;
}
