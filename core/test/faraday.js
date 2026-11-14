// Faraday checks: the analytic EMF equals −dΦ/dt numerically in every setting, the motional
// and transformer EMF formulas, Lenz (the force opposes the motion for either sign of B),
// the power balance, the coasting bar's exponential braking, and the generator identities.
import { PI } from '../constants.js';
import { overlap, barState, loopState, fieldState, generatorState, numericEmf } from '../faraday.js';

export function faradayChecks(check) {
  check('faraday overlap: partial', overlap(-1, 2, 0, 5), 2, 1e-15);
  check('faraday overlap: none', overlap(3, 4, 0, 1), 0, 0);
  // bar, driven
  {
    const p = { B: 0.5, W: 0.2, l: 0.1, R: 2, v0: 1, x0: -0.05, mode: 'drive' };
    const s = barState(p, 0.1);
    check('faraday bar: ε = −B l v inside the field', s.emf, -0.5 * 0.1 * 1, 1e-12);
    check('faraday bar: ε = −dΦ/dt numerically (1e-6)', s.emf, numericEmf((t) => barState(p, t), 0.1), 1e-6);
    check('faraday bar: no EMF before the field', barState(p, 0.02).emf, 0, 0);
    check('faraday bar: no EMF after the field', barState(p, 0.3).emf, 0, 0);
    check('faraday bar: F = −B² l² v / R opposes v', s.F, -(0.25 * 0.01 * 1) / 2, 1e-12);
    check('faraday bar: force still opposes v when B is reversed', barState({ ...p, B: -0.5 }, 0.1).F < 0 ? 1 : 0, 1, 0);
    check('faraday bar: current reverses when B is reversed', barState({ ...p, B: -0.5 }, 0.1).I, -s.I, 1e-12);
    check('faraday bar: mechanical power F·v = electrical ε²/R', s.Pmech, s.Pelec, 1e-12);
  }
  // bar, coasting
  {
    const p = { B: 1, W: 0.3, l: 0.2, R: 0.1, v0: 1, x0: -0.15, mode: 'coast', m: 0.05 };
    const tau = (0.05 * 0.1) / (1 * 0.04);
    check('faraday coast: braking time constant mR/(B²l²)', barState(p, 0.3).tau, tau, 1e-12);
    const tIn = 0.15, s1 = barState(p, tIn + tau), s2 = barState(p, tIn + 2 * tau);
    check('faraday coast: speed decays by e per τ inside the field', s1.v, Math.exp(-1), 1e-9);
    check('faraday coast: and again', s2.v / s1.v, Math.exp(-1), 1e-9);
    check('faraday coast: position follows v τ (1 − e^{−t/τ})', s1.x, 0 + 1 * tau * (1 - Math.exp(-1)), 1e-9);
    check('faraday coast: ε = −dΦ/dt numerically while braking (1e-6)', s1.emf, numericEmf((t) => barState(p, t), tIn + tau), 1e-6);
    check('faraday coast: speed is constant before the field', barState(p, 0.1).v, 1, 0);
    const far = barState(p, 5);
    check('faraday coast: the bar never stops inside a wide enough field (x → x₀ + v τ < W)', far.x < p.W && far.v > 0 ? 1 : 0, 1, 0);
    const narrow = barState({ ...p, W: 0.05 }, 5);
    check('faraday coast: through a narrow field it exits at reduced speed and keeps it', narrow.x > 0.05 && narrow.v > 0 && narrow.v < 1 ? 1 : 0, 1, 0);
  }
  // loop
  {
    const p = { B: 0.5, W: 0.2, w: 0.08, h: 0.05, R: 1, v: 1, x0: -0.1 };
    const enter = loopState(p, 0.1), inside = loopState(p, 0.2), leave = loopState(p, 0.28);
    check('faraday loop: entering, ε = −B h v', enter.emf, -0.5 * 0.05 * 1, 1e-12);
    check('faraday loop: fully inside, Φ = B w h and ε = 0', inside.Phi, 0.5 * 0.08 * 0.05, 1e-12);
    check('faraday loop: fully inside, no EMF', inside.emf, 0, 0);
    check('faraday loop: fully inside, no force', inside.F, 0, 0);
    check('faraday loop: leaving, ε = +B h v (reversed)', leave.emf, +0.5 * 0.05 * 1, 1e-12);
    check('faraday loop: force opposes v entering and leaving alike', enter.F < 0 && leave.F < 0 ? 1 : 0, 1, 0);
    check('faraday loop: ε = −dΦ/dt numerically (1e-6)', leave.emf, numericEmf((t) => loopState(p, t), 0.28), 1e-6);
    check('faraday loop: power balance entering', enter.Pmech, enter.Pelec, 1e-12);
  }
  // field
  {
    const p = { A: 0.01, N: 10, R: 5, wave: 'sine', B0: 0.2, f: 50 };
    check('faraday field: sine ε = −N A dB/dt numerically (1e-6)', fieldState(p, 0.003).emf, numericEmf((t) => fieldState(p, t), 0.003), 1e-6);
    check('faraday field: sine EMF amplitude N B₀ A ω at t = 0', Math.abs(fieldState(p, 0).emf), 10 * 0.2 * 0.01 * 2 * PI * 50, 1e-12);
    const r = { ...p, wave: 'ramp', rate: 2 };
    check('faraday field: ramp gives constant ε = −N A (dB/dt)', fieldState(r, 0.7).emf, -10 * 0.01 * 2, 1e-12);
    const u = { ...p, wave: 'pulse', tau: 0.01 };
    check('faraday field: pulse ε = −dΦ/dt numerically (1e-6)', fieldState(u, 0.004).emf, numericEmf((t) => fieldState(u, t), 0.004), 1e-6);
  }
  // generator
  {
    const p = { B: 0.3, A: 0.01, N: 50, R: 10, omega: 2 * PI * 60 };
    const s = generatorState(p, 0.004);
    check('faraday generator: ε = −dΦ/dt numerically (1e-6)', s.emf, numericEmf((t) => generatorState(p, t), 0.004), 1e-6);
    check('faraday generator: peak EMF N B A ω', s.emfPeak, 50 * 0.3 * 0.01 * 2 * PI * 60, 1e-12);
    check('faraday generator: rms = peak/√2', s.emfRms, s.emfPeak / Math.SQRT2, 1e-12);
    check('faraday generator: τω = ε²/R', s.Pmech, s.Pelec, 1e-12);
    check('faraday generator: torque opposes rotation', s.torque < 0 ? 1 : 0, 1, 0);
    check('faraday generator: EMF is zero when the flux is maximal (θ = 0)', generatorState(p, 0).emf, 0, 1e-15);
    check('faraday generator: EMF peaks a quarter turn later', generatorState(p, 0.25 / 60).emf, s.emfPeak, 1e-9);
  }
}
