// Filter checks against the Capacitors handout, §6: Examples 6.1 (RC), 6.2 (series RLC) and
// 6.3 (real capacitor), the sum rule H_LP + H_BP + H_HP = 1, the notch H_BS = 1 − H_BP, the
// energy bookkeeping at resonance, and the step response identities.
import { PI } from '../constants.js';
import { transfer, gainDb, phaseDeg, characteristics, steadyState, stepResponse, realCapacitorZ, selfResonance, rlcLimits } from '../filters.js';

export function filterChecks(check) {
  // Example 6.1
  {
    const rc = { circuit: 'rc', output: 'C', R: 1000, C: 88.5e-12 }, ch = characteristics(rc);
    check('filters 6.1: τ = RC = 88.5 ns', ch.tau, 88.5e-9, 1e-12);
    check('filters 6.1: f_c = 1.80 MHz', ch.fc, 1.798e6, 1e-3);
    check('filters 6.1: −3.01 dB and −45° at f_c', gainDb(transfer(rc, ch.wc)), -20 * Math.log10(Math.SQRT2), 1e-9);
    check('filters 6.1: phase −45° at f_c', phaseDeg(transfer(rc, ch.wc)), -45, 1e-9);
    check('filters 6.1: −20.0 dB one decade up', gainDb(transfer(rc, 2 * PI * 18e6)), -20.05, 1e-3);
    const hp = { ...rc, output: 'R' };
    const w = 2 * PI * 5e6, a = transfer(rc, w), b = transfer(hp, w);
    check('filters RC: H_LP + H_HP = 1 (real part)', a[0] + b[0], 1, 1e-12);
    check('filters RC: H_LP + H_HP = 1 (imaginary part)', a[1] + b[1], 0, 1e-12);
    check('filters RC: high-pass blocks DC', Math.hypot(...transfer(hp, 2 * PI * 1e-3)), 0, 1e-6);
  }
  // Example 6.2
  {
    const p = { circuit: 'rlc', output: 'R', R: 10, L: 10e-6, C: 1e-9 }, ch = characteristics(p);
    check('filters 6.2: ω₀ = 1e7 rad/s', ch.w0, 1e7, 1e-12);
    check('filters 6.2: Q = 10', ch.Q, 10, 1e-12);
    check('filters 6.2: B = 1e6 rad/s', ch.B, 1e6, 1e-12);
    check('filters 6.2: f₁ = 1.514 MHz', ch.f1, 1.514e6, 1e-3);
    check('filters 6.2: f₂ = 1.673 MHz', ch.f2, 1.673e6, 1e-3);
    check('filters 6.2: f₁ f₂ = f₀²', ch.f1 * ch.f2, ch.f0 * ch.f0, 1e-12);
    check('filters 6.2: ω₂ − ω₁ = B', ch.w2 - ch.w1, ch.B, 1e-12);
    check('filters 6.2: |H_BP| = 1/√2 at the half-power frequencies', Math.hypot(...transfer(p, ch.w1)), Math.SQRT1_2, 1e-12);
    const ss = steadyState(p, ch.w0, 10);
    check('filters 6.2: current amplitude 1 A at resonance', ss.amp.I, 1, 1e-12);
    check('filters 6.2: |V_C| = Q V_in = 100 V', ss.amp.vC, 100, 1e-12);
    check('filters 6.2: |V_L| = |V_C| at resonance', ss.amp.vL, ss.amp.vC, 1e-12);
    check('filters 6.2: v_C and v_L cancel in the loop (phasor sum)', Math.hypot(ss.phasors.vC[0] + ss.phasors.vL[0], ss.phasors.vC[1] + ss.phasors.vL[1]), 0, 1e-9);
    check('filters 6.2: peak ½CV_C² = 5 µJ', Math.max(...ss.wC), 5e-6, 1e-3);
    check('filters 6.2: peak ½LI² = 5 µJ', Math.max(...ss.wL), 5e-6, 1e-12);
    check('filters 6.2: average power 5 W', ss.Pavg, 5, 1e-12);
    check('filters 6.2: energy lost per cycle 3.14 µJ', ss.Pavg * ss.T, 3.1416e-6, 1e-4);
    check('filters 6.2: Q = 2π · stored / lost = 10', (2 * PI * Math.max(...ss.wL)) / (ss.Pavg * ss.T), 10, 1e-12);
    // the energy sum is constant at resonance (perfect exchange), and the sum rule holds everywhere
    const sum = ss.wC.map((v, k) => v + ss.wL[k]);
    check('filters 6.2: ½Cv_C² + ½Li² is constant at resonance (1e-3)', Math.max(...sum) / Math.min(...sum), 1, 1e-3);
    for (const w of [1e6, 1e7, 3e7]) {
      const s = [0, 0]; for (const o of ['C', 'R', 'L']) { const h = transfer({ ...p, output: o }, w); s[0] += h[0]; s[1] += h[1]; }
      check(`filters RLC: H_LP + H_BP + H_HP = 1 at ω = ${w}`, Math.hypot(s[0] - 1, s[1]), 0, 1e-12);
      const bs = transfer({ ...p, output: 'LC' }, w), bp = transfer(p, w);
      check(`filters RLC: H_BS = 1 − H_BP at ω = ${w}`, Math.hypot(bs[0] + bp[0] - 1, bs[1] + bp[1]), 0, 1e-12);
    }
    check('filters RLC: |H_LP| = Q at ω₀', Math.hypot(...transfer({ ...p, output: 'C' }, ch.w0)), 10, 1e-12);
    check('filters RLC: |H_HP| = Q at ω₀', Math.hypot(...transfer({ ...p, output: 'L' }, ch.w0)), 10, 1e-12);
    check('filters RLC: notch is zero at ω₀', Math.hypot(...transfer({ ...p, output: 'LC' }, ch.w0)), 0, 1e-12);
    check('filters RLC: low-pass falls 40 dB per decade', gainDb(transfer({ ...p, output: 'C' }, 100 * ch.w0)) - gainDb(transfer({ ...p, output: 'C' }, 1000 * ch.w0)), 40, 1e-3);
    const bw = { circuit: 'rlc', output: 'C', R: Math.sqrt(2 * 10e-6 / 1e-9), L: 10e-6, C: 1e-9 };
    check('filters Butterworth: Q = 1/√2 gives exactly −3.01 dB at ω₀', gainDb(transfer(bw, 1e7)), -20 * Math.log10(Math.SQRT2), 1e-9);
    check('filters Butterworth: no peak (|H| ≤ 1 just below ω₀)', Math.hypot(...transfer(bw, 0.7e7)) <= 1 ? 1 : 0, 1, 0);
    check('filters rlcLimits: band-pass table row', rlcLimits('R', 10).w0, 1, 0);
  }
  // Example 6.3
  {
    const cap = { C: 100e-9, esr: 0.01, esl: 1e-9 };
    check('filters 6.3: f_SR = 15.9 MHz', selfResonance(cap), 15.92e6, 1e-3);
    check('filters 6.3: |Z| = 1.59 Ω at 1 MHz', realCapacitorZ(cap, 2 * PI * 1e6), 1.59, 5e-3);
    check('filters 6.3: |Z| = ESR at f_SR', realCapacitorZ(cap, 2 * PI * selfResonance(cap)), 0.01, 1e-9);
    check('filters 6.3: |Z| = 0.61 Ω at 100 MHz (inductive)', realCapacitorZ(cap, 2 * PI * 1e8), 0.612, 5e-3);
  }
  // Step response identities
  {
    const t = [0, 1e-7, 3e-7, 1e-6, 5e-6];
    for (const [R, name] of [[10, 'underdamped'], [200, 'critically damped'], [500, 'overdamped']]) {
      const p = { circuit: 'rlc', output: 'C', R, L: 10e-6, C: 1e-9 }, s = stepResponse(p, 1, t);
      check(`filters step ${name}: starts at zero`, s.vC[0], 0, 1e-15);
      check(`filters step ${name}: KVL v_R + v_L + v_C = V at every sample`, Math.max(...t.map((_, k) => Math.abs(s.vR[k] + s.vL[k] + s.vC[k] - 1))), 0, 1e-9);
      check(`filters step ${name}: v_C → V (2e-3 at 5 µs)`, s.vC[4], 1, R === 10 ? 2e-1 : 2e-3);
      const h = 1e-10, t0 = 3e-7, d = stepResponse(p, 1, [t0 - h, t0, t0 + h]);
      check(`filters step ${name}: i = C dv_C/dt`, d.i[1], (1e-9 * (d.vC[2] - d.vC[0])) / (2 * h), 1e-5);
      check(`filters step ${name}: v_L = L di/dt`, d.vL[1], (10e-6 * (d.i[2] - d.i[0])) / (2 * h), 1e-5);
    }
    const ch = characteristics({ circuit: 'rlc', R: 200, L: 10e-6, C: 1e-9 });
    check('filters step: R = 2√(L/C) is critically damped (ζ = 1)', ch.zeta, 1, 1e-12);
    const u = characteristics({ circuit: 'rlc', R: 10, L: 10e-6, C: 1e-9 });
    const s = stepResponse({ circuit: 'rlc', output: 'C', R: 10, L: 10e-6, C: 1e-9 }, 1, [PI / (u.w0 * Math.sqrt(1 - u.zeta * u.zeta))]);
    check('filters step: first overshoot of v_C is 1 + e^{−πζ/√(1−ζ²)}', s.vC[0], 1 + Math.exp((-PI * u.zeta) / Math.sqrt(1 - u.zeta * u.zeta)), 1e-9);
    const rc = stepResponse({ circuit: 'rc', output: 'C', R: 1000, C: 88.5e-12 }, 1, [88.5e-9, 3 * 88.5e-9]);
    check('filters RC step: 63.2 % at τ', rc.vC[0], 1 - Math.exp(-1), 1e-12);
    check('filters RC step: 95.0 % at 3τ', rc.vC[1], 1 - Math.exp(-3), 1e-12);
  }
}
