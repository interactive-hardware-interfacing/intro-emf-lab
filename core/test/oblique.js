// Oblique incidence: Snell, Fresnel against the textbook numbers for air–glass, Brewster,
// critical angle, total internal reflection, power conservation, continuity of the pictured field.
import { PI } from '../constants.js';
import { cabs } from '../tline.js';
import { snell, fresnel, specialAngles, sweep, evanescentDepth, fieldAt, wavelengths } from '../oblique.js';

export function obliqueChecks(check) {
  const deg = PI / 180;
  // Snell: air → glass (n = 1.5) at 30°: sinθt = 1/3
  check('oblique Snell: air→glass 30° gives sin θt = 1/3', snell(1, 2.25, 30 * deg).sinT, 1 / 3, 1e-12);
  check('oblique Snell: glass→air 30° gives sin θt = 0.75', snell(2.25, 1, 30 * deg).sinT, 0.75, 1e-12);
  check('oblique Snell: glass→air 60° is total internal reflection', snell(2.25, 1, 60 * deg).tir ? 1 : 0, 1, 0);

  // normal incidence: both polarizations give (η2 − η1)/(η2 + η1) = (1 − 1.5)/(1 + 1.5) = −0.2
  const n0 = fresnel(1, 2.25, 0);
  check('oblique Fresnel: ⊥ at normal incidence −0.2', n0.Gperp[0], -0.2, 1e-12);
  check('oblique Fresnel: ∥ at normal incidence −0.2 (same convention as ⊥ at θ = 0)', n0.Gpar[0], -0.2, 1e-12);
  check('oblique Fresnel: R = 4 % at normal incidence', n0.Rperp, 0.04, 1e-12);

  // Brewster for air → glass: tan θB = 1.5 → 56.31°, Γ∥ = 0 there, Γ⊥ ≠ 0
  const { brewster, critical } = specialAngles(1, 2.25);
  check('oblique Brewster: atan(1.5) = 56.31°', brewster / deg, 56.3099, 1e-5);
  const fb = fresnel(1, 2.25, brewster);
  check('oblique Brewster: Γ∥ = 0 at θB', Math.abs(fb.Gpar[0]) < 1e-12 ? 1 : 0, 1, 0);
  check('oblique Brewster: Γ⊥ ≠ 0 at θB (−0.385)', fb.Gperp[0], -0.3846, 1e-3);
  check('oblique Brewster: θB + θt = 90° (reflected ⟂ transmitted)', brewster + fb.thetaT, PI / 2, 1e-12);
  check('oblique critical: none for air→glass', Number.isNaN(critical) ? 1 : 0, 1, 0);
  check('oblique critical: glass→air 41.81°', specialAngles(2.25, 1).critical / deg, 41.8103, 1e-5);

  // power conservation at several angles, both polarizations
  let worst = 0;
  for (const t of [0, 20, 45, 56.31, 70, 85]) { const f = fresnel(1, 2.25, t * deg); worst = Math.max(worst, Math.abs(f.Rperp + f.Tperp_power - 1), Math.abs(f.Rpar + f.Tpar_power - 1)); }
  check('oblique power: R + T = 1 from the amplitudes, both polarizations, six angles', worst < 1e-12 ? 1 : 0, 1, 0);

  // grazing: |Γ| → 1 for both
  const g = fresnel(1, 2.25, 89.9 * deg);
  check('oblique grazing: |Γ⊥| → 1 (0.997 at 89.9°)', cabs(g.Gperp), 1, 1e-2);
  check('oblique grazing: |Γ∥| → 1 (slower than ⊥: 0.993 at 89.9°)', cabs(g.Gpar), 1, 1e-2);

  // total internal reflection: |Γ| = 1 exactly, phases differ between polarizations
  const tir = fresnel(2.25, 1, 60 * deg);
  check('oblique TIR: |Γ⊥| = 1', cabs(tir.Gperp), 1, 1e-12);
  check('oblique TIR: |Γ∥| = 1', cabs(tir.Gpar), 1, 1e-12);
  check('oblique TIR: no power transmitted', tir.Tperp_power + tir.Tpar_power, 0, 0);
  // evanescent depth: 1/(k2 √(n1² sin²θ/n2² − 1)); glass→air 60°, 1 GHz: k2 = 20.96 rad/m, √(2.25·0.75 − 1) = 0.8292 → 57.5 mm
  check('oblique evanescent depth: glass→air 60° at 1 GHz = 57.5 mm', evanescentDepth(2.25, 1, 60 * deg, 1e9), 1 / (20.958 * 0.82916), 1e-3);
  check('oblique evanescent depth: infinite below critical', evanescentDepth(2.25, 1, 30 * deg, 1e9) === Infinity ? 1 : 0, 1, 0);

  // the sweep ends near grazing and starts at the normal-incidence value
  const sw = sweep(1, 2.25, 91);
  check('oblique sweep: first point is normal incidence', sw.Gperp[0], -0.2, 1e-12);
  check('oblique sweep: ∥ reflection coefficient changes sign through Brewster', sw.Gpar[0] * sw.Gpar[90] < 0 ? 1 : 0, 1, 0);

  // pictured field: continuous across z = 0 at several x and t (E_y for ⊥, H_y for ∥), below and above critical
  let jump = 0;
  for (const [e1, e2, th] of [[1, 2.25, 40], [2.25, 1, 30], [2.25, 1, 60]]) for (const pol of ['perp', 'par']) for (const x of [0, 0.037, -0.12]) for (const t of [0, 0.3e-9]) {
    const a = fieldAt(e1, e2, th * deg, 1e9, pol, x, -1e-9, t), b = fieldAt(e1, e2, th * deg, 1e9, pol, x, 1e-9, t);
    jump = Math.max(jump, Math.abs(a - b));
  }
  check('oblique field: the out-of-plane component is continuous across the interface (36 samples)', jump < 1e-6 ? 1 : 0, 1, 0);
  // TIR: the transmitted field decays with z and does not propagate: |field| at z = 2 depths is e^{−2} of z = 0
  {
    const d = evanescentDepth(2.25, 1, 60 * deg, 1e9), amp = (z) => Math.hypot(fieldAt(2.25, 1, 60 * deg, 1e9, 'perp', 0, z, 0), fieldAt(2.25, 1, 60 * deg, 1e9, 'perp', 0, z, 0.25e-9));
    check('oblique TIR field: decays as e^{−z/d} into medium 2', amp(2 * d) / amp(1e-9), Math.exp(-2), 1e-6);
  }
  // wavelengths: in glass λ/1.5; along the interface λ1/sinθ
  const wl = wavelengths(1, 2.25, 30 * deg, 1e9);
  check('oblique wavelengths: λ2 = λ1/1.5', wl.l2, wl.l1 / 1.5, 1e-12);
  check('oblique wavelengths: along the interface λ1/sin30° = 2λ1', wl.lx, 2 * wl.l1, 1e-12);
  // ∥ amplitude τ: 1 + Γ∥ = τ∥ cosθt / cosθi (E_x continuity)
  const f45 = fresnel(1, 2.25, 45 * deg);
  check('oblique Fresnel ∥: (1 + Γ∥) cosθi = τ∥ cosθt', (1 + f45.Gpar[0]) * Math.cos(45 * deg), f45.Tpar[0] * f45.cosT[0], 1e-12);
  check('oblique Fresnel ⊥: 1 + Γ⊥ = τ⊥', 1 + f45.Gperp[0], f45.Tperp[0], 1e-12);
}
