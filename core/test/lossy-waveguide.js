// Lossy lines: lossless limit, distortionless line, low-loss approximation, matched-line
// attenuation, power bookkeeping P_in = P_L + P_lost. Waveguides: WR-90 numbers, cutoff,
// v_p v_g = c², the two-plane-wave angle, TE10 fields satisfy Maxwell on the plane, power.
import { PI, EPS0, MU0 } from '../constants.js';
import { cabs } from '../tline.js';
import { lineConstants, approximations, groupVelocity, steadyStateLossy, matchedLoss } from '../lossyline.js';
import { C0, ETA0, cutoff, modeList, propagation, singleModeBand, te10Fields, te10Power, STANDARD } from '../waveguide.js';

export function lossyChecks(check) {
  const L = 250e-9, C = 100e-12, w = 2 * PI * 1e8;
  const ll = lineConstants({ R: 0, L, G: 0, C }, w);
  check('lossy: lossless limit α = 0', ll.alpha, 0, 0);
  check('lossy: lossless limit β = ω√LC', ll.beta, w * Math.sqrt(L * C), 1e-12);
  check('lossy: lossless limit Z₀ = √(L/C) = 50 Ω real', ll.Z0[0], 50, 1e-12);
  // distortionless: R/L = G/C → α = √(RG), β = ω√(LC), Z₀ real
  const R = 1, G = (R * C) / L, dl = lineConstants({ R, L, G, C }, w);
  check('lossy distortionless: α = √(R′G′)', dl.alpha, Math.sqrt(R * G), 1e-10);
  check('lossy distortionless: β unchanged', dl.beta, w * Math.sqrt(L * C), 1e-12);
  check('lossy distortionless: Z₀ real', Math.abs(dl.Z0[1]) < 1e-9 ? 1 : 0, 1, 0);
  check('lossy distortionless: flagged', approximations({ R, L, G, C }).distortionless ? 1 : 0, 1, 0);
  check('lossy distortionless: no dispersion, v_g = v_p', groupVelocity({ R, L, G, C }, w), dl.vp, 1e-6);
  // low loss: α ≈ R/(2Z₀) + G Z₀/2 within 0.1 % when R ≪ ωL
  const lo = lineConstants({ R: 0.5, L, G: 1e-5, C }, w);
  check('lossy low-loss: α ≈ R′/2Z₀ + G′Z₀/2 within 0.1 %', lo.alpha, approximations({ R: 0.5, L, G: 1e-5, C }).alphaLowLoss, 1e-3);
  check('lossy: α in dB = 8.686 α', lo.alphaDb, 8.685889638 * lo.alpha, 1e-12);
  check('lossy matched: 10 m of 0.1 Np/m is 8.69 dB and a power ratio e^{−2}', matchedLoss(0.1, 10).dB, 8.685889638, 1e-9);
  check('lossy matched: power ratio e^{−2αl}', matchedLoss(0.1, 10).ratio, Math.exp(-2), 1e-12);
  // steady state: power in = power to the load + loss; matched lossy line loses e^{−2αl}
  const cst = lineConstants({ R: 2, L, G: 0, C }, w), ss = steadyStateLossy({ Vs: 2, Rs: 50, l: 5, ZL: cst.Z0 }, cst);
  check('lossy steady: matched load gives Γ = 0', cabs(ss.GL) < 1e-12 ? 1 : 0, 1, 0);
  check('lossy steady: P_L/P_in = e^{−2αl} for a matched line', ss.PL / ss.Pin, Math.exp(-2 * cst.alpha * 5), 1e-9);
  const ss2 = steadyStateLossy({ Vs: 2, Rs: 50, l: 3, ZL: [100, 40] }, cst);
  check('lossy steady: P_in − P_L = P_lost > 0 with a mismatch', ss2.Plost > 0 && Math.abs(ss2.Pin - ss2.PL - ss2.Plost) < 1e-15 ? 1 : 0, 1, 0);
  check('lossy steady: the power flowing past d is larger near the generator than at the load', ss2.P(3) > ss2.P(0) ? 1 : 0, 1, 0);
  check('lossy steady: |Γ| seen at the generator is |Γ_L| e^{−2αl}', cabs(ss2.Gin), cabs(ss2.GL) * Math.exp(-2 * cst.alpha * 3), 1e-9);
  const ll2 = lineConstants({ R: 0, L, G: 0, C }, w), ss3 = steadyStateLossy({ Vs: 2, Rs: 50, l: 0.25 * ll2.lam, ZL: [Infinity, 0] }, ll2);
  check('lossy steady: lossless open λ/4 line has |V_L| = Vs Z₀/Rs = 2 (same as the lossless core)', cabs(ss3.V(0)), 2, 1e-9);

  // waveguide
  const { a, b } = STANDARD.WR90;
  check('guide WR-90: TE10 cutoff 6.557 GHz', cutoff(a, b, 1, 0), 6.557e9, 1e-3);
  check('guide WR-90: TE20 cutoff 13.11 GHz', cutoff(a, b, 2, 0), 13.114e9, 1e-3);
  check('guide WR-90: TE01 cutoff 14.75 GHz', cutoff(a, b, 0, 1), 14.754e9, 1e-3);
  check('guide WR-90: single-mode band 6.56–13.11 GHz (ratio 2 for b = a/2)', singleModeBand(a, b).hi / singleModeBand(a, b).lo, 2, 2e-3);
  const pr = propagation(a, b, 1, 0, 10e9);
  check('guide WR-90 at 10 GHz: β = 158.2 rad/m', pr.beta, 158.24, 1e-3);
  check('guide WR-90 at 10 GHz: λ_g = 39.71 mm', pr.lamG, 39.71e-3, 1e-3);
  check('guide WR-90 at 10 GHz: v_p v_g = c²', pr.vp * pr.vg, C0 * C0, 1e-12);
  check('guide WR-90 at 10 GHz: v_p > c > v_g', pr.vp > C0 && pr.vg < C0 ? 1 : 0, 1, 0);
  check('guide WR-90 at 10 GHz: Z_TE = η k/β = 499 Ω', pr.Z, 499.0, 2e-3);
  check('guide WR-90 at 10 GHz: cosθ = β/k, θ = 41.0°', (pr.theta * 180) / PI, 40.98, 1e-3);
  check('guide: TE10 at 5 GHz is below cutoff, evanescent', !propagation(a, b, 1, 0, 5e9).propagating ? 1 : 0, 1, 0);
  check('guide: evanescent α = √(k_c² − k²)', propagation(a, b, 1, 0, 5e9).alpha, Math.sqrt((PI / a) ** 2 - ((2 * PI * 5e9) / C0) ** 2), 1e-12);
  check('guide: mode list below 20 GHz has TE10 first', modeList(a, b, 20e9)[0].m === 1 && modeList(a, b, 20e9)[0].n === 0 ? 1 : 0, 1, 0);
  check('guide: TM needs m, n ≥ 1 (no TM10)', modeList(a, b, 20e9).some((md) => md.kind === 'TM' && (md.m === 0 || md.n === 0)) ? 0 : 1, 1, 0);
  // TE10 fields: Faraday on the plane: ∂E_y/∂z = −μ ∂H_x/∂t … check −∂E_y/∂x = μ ∂H_z/∂t and ∂E_y/∂z = μ ∂H_x/∂t at a point (y-polarised E, in-plane H)
  {
    const f = 10e9, w = 2 * PI * f, x = 0.3 * a, z = 0.011, t = 0.3e-10, h = 1e-7, ht = 1e-14;
    const F = (xx, zz, tt) => te10Fields(a, f, xx, zz, tt);
    const dEdz = (F(x, z + h, t).Ey - F(x, z - h, t).Ey) / (2 * h), dHxdt = (F(x, z, t + ht).Hx - F(x, z, t - ht).Hx) / (2 * ht);
    const dEdx = (F(x + h, z, t).Ey - F(x - h, z, t).Ey) / (2 * h), dHzdt = (F(x, z, t + ht).Hz - F(x, z, t - ht).Hz) / (2 * ht);
    // (∇×E)_x = −∂E_y/∂z = −μ ∂H_x/∂t ; (∇×E)_z = ∂E_y/∂x = −μ ∂H_z/∂t
    check('guide TE10: Faraday x-component holds on the grid', -dEdz, -MU0 * dHxdt, 1e-5);
    check('guide TE10: Faraday z-component holds', dEdx, -MU0 * dHzdt, 1e-5);
    check('guide TE10: E_y vanishes on the side walls', Math.abs(F(0, z, t).Ey) + Math.abs(F(a, z, t).Ey) < 1e-12 ? 1 : 0, 1, 0);
    check('guide TE10: power through the section E₀² a b β/(4ωμ)', te10Power(a, b, f, 1), (a * b * pr.beta) / (4 * w * MU0), 1e-12);
    void EPS0; void ETA0;
  }
}
