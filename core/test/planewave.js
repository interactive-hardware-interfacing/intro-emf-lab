// Plane-wave checks: medium parameters in the lossless and good-conductor limits, Fresnel at
// normal incidence with power conservation, field continuity at the interface, the standing
// wave in front of it, the Poynting flux, and the polarization classifier.
import { EPS0, MU0, PI } from '../constants.js';
import { medium, normalIncidence, phasors, instantaneous, poynting, polarization, polarizationTrace, C0, ETA0 } from '../planewave.js';
import { cabs, carg } from '../tline.js';

export function planeWaveChecks(check) {
  const air = medium({ f: 1e9 });
  check('planewave air: β = ω/c', air.beta, (2 * PI * 1e9) / C0, 1e-12);
  check('planewave air: η = 376.73 Ω, real', air.eta[0], ETA0, 1e-12);
  check('planewave air: α = 0', air.alpha, 0, 0);
  check('planewave air: λ = 29.98 cm at 1 GHz', air.lambda, C0 / 1e9, 1e-12);
  const glass = medium({ f: 1e9, epsR: 2.25 });
  check('planewave glass: v = c/1.5', glass.vp, C0 / 1.5, 1e-12);
  check('planewave glass: η = η0/1.5', glass.eta[0], ETA0 / 1.5, 1e-12);
  const sea = medium({ f: 1e6, epsR: 81, sigma: 4 });
  check('planewave seawater 1 MHz: loss tangent σ/ωε ≈ 888', sea.lossTan, 4 / (2 * PI * 1e6 * 81 * EPS0), 1e-12);
  check('planewave seawater: α ≈ √(πfμσ) within 0.1 %', sea.alpha, sea.goodConductorAlpha, 1e-3);
  check('planewave seawater: α ≈ β in a good conductor (2e-3 at loss tangent 888)', sea.alpha, sea.beta, 2e-3);
  check('planewave seawater: δ = 25 cm', sea.delta, 1 / Math.sqrt(PI * 1e6 * MU0 * 4), 1e-3);
  check('planewave seawater: η at 45° (H lags E)', (carg(sea.eta) * 180) / PI, 45, 1e-3);
  const cu = medium({ f: 1e9, sigma: 5.8e7 });
  check('planewave copper 1 GHz: δ = 2.09 µm', cu.delta, 2.09e-6, 1e-3);
  check('planewave copper: |η| = √(πfμ/σ) (1e-6)', cabs(cu.eta), Math.sqrt((2 * PI * 1e9 * MU0) / 5.8e7), 1e-6);
  // Fresnel
  const ag = normalIncidence(air, glass);
  check('planewave air→glass: Γ = (1/1.5 − 1)/(1/1.5 + 1) = −0.2', ag.G[0], -0.2, 1e-12);
  check('planewave air→glass: τ = 0.8', ag.tau[0], 0.8, 1e-12);
  check('planewave air→glass: R + T = 1', ag.R + ag.T, 1, 1e-12);
  check('planewave air→glass: SWR 1.5', ag.swr, 1.5, 1e-12);
  const ga = normalIncidence(glass, air);
  check('planewave glass→air: Γ = +0.2', ga.G[0], 0.2, 1e-12);
  const ac = normalIncidence(air, cu);
  check('planewave air→copper: Γ ≈ −1', ac.G[0], -1, 1e-4);
  check('planewave air→copper: R + T = 1 even with a lossy second medium', ac.R + ac.T, 1, 1e-9);
  // continuity and the standing wave
  const Em = phasors(1, air, glass, -1e-12), Ep = phasors(1, air, glass, 1e-12);
  check('planewave interface: E continuous', cabs(Em.E), cabs(Ep.E), 1e-9);
  check('planewave interface: H continuous', cabs(Em.H), cabs(Ep.H), 1e-9);
  check('planewave interface: E(0) = τ E0', cabs(Ep.E), 0.8, 1e-9);
  let mx = 0, mn = Infinity; for (let z = -0.3; z < 0; z += 1e-4) { const a = cabs(phasors(1, air, glass, z).E); mx = Math.max(mx, a); mn = Math.min(mn, a); }
  check('planewave standing wave: |E|max = E0(1 + |Γ|)', mx, 1.2, 1e-5);
  check('planewave standing wave: |E|min = E0(1 − |Γ|)', mn, 0.8, 1e-5);
  check('planewave standing wave: Γ < 0 puts a minimum at the interface', cabs(phasors(1, air, glass, -1e-9).E), 0.8, 1e-6);
  check('planewave mirror: E ≈ 0 at the copper surface', cabs(phasors(1, air, cu, -1e-9).E) < 1e-3 ? 1 : 0, 1, 0);
  check('planewave mirror: H doubles at the copper surface', cabs(phasors(1, air, cu, -1e-9).H) * ETA0, 2, 1e-3);
  const i = instantaneous(1, air, glass, -0.1, 0.3e-9);
  check('planewave instantaneous: incident + reflected = total', i.Efwd + i.Eref, i.E, 1e-12);
  check('planewave one medium: H = E/η in phase', instantaneous(1, air, null, 0.07, 0.2e-9).H * ETA0, instantaneous(1, air, null, 0.07, 0.2e-9).E, 1e-9);
  check('planewave Poynting: ½E0²/η0 for 1 V/m', poynting(1, air), 1 / (2 * ETA0), 1e-12);
  check('planewave Poynting: lossy medium uses Re(1/η)', poynting(1, sea), 0.5 * (sea.eta[0] / (cabs(sea.eta) ** 2)), 1e-12);
  // polarization
  check('planewave polarization: linear at 45°', polarization(1, 1, 0).type === 'linear' && Math.abs(polarization(1, 1, 0).tilt - PI / 4) < 1e-12 ? 1 : 0, 1, 0);
  check('planewave polarization: φ = −90° equal amplitudes is right-handed circular', polarization(1, 1, -PI / 2).type === 'circular' && polarization(1, 1, -PI / 2).sense.startsWith('right') ? 1 : 0, 1, 0);
  check('planewave polarization: φ = +90° is left-handed', polarization(1, 1, PI / 2).sense.startsWith('left') ? 1 : 0, 1, 0);
  check('planewave polarization: the trace at φ = −90° turns from x toward y', (() => { const p = polarizationTrace(1, 1, -PI / 2, 8); return p[0][0] > 0.99 && p[1][1] > 0 ? 1 : 0; })(), 1, 0);
  const el = polarization(1, 0.5, -PI / 3);
  check('planewave polarization: elliptical with axial ratio > 1', el.type === 'elliptical' && el.axialRatio > 1 ? 1 : 0, 1, 0);
  check('planewave polarization: axial ratio 1 for circular', polarization(1, 1, PI / 2).axialRatio, 1, 1e-9);
}
