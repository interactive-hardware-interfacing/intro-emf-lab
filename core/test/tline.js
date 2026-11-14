// Transmission-line wave checks: Γ, VSWR and Z_in for the textbook loads, the envelopes against
// |V+|(1 ± |Γ|), the quarter- and half-wave transformers, power bookkeeping, and the step
// transient against the bounce-diagram sums.
import { PI } from '../constants.js';
import { loadZ, gamma, vswr, returnLossDb, zin, steadyState, instantaneous, extrema, stepSetup, bounces, stepV, stepI, cabs, carg } from '../tline.js';

export function tlineChecks(check) {
  const Z0 = 50, f = 1e9, v = 2e8, w = 2 * PI * f, beta = w / v, lam = v / f;
  check('tline Γ: matched = 0', cabs(gamma([50, 0], Z0)), 0, 1e-15);
  check('tline Γ: open = +1', gamma([Infinity, 0], Z0)[0], 1, 0);
  check('tline Γ: short = −1', gamma([0, 0], Z0)[0], -1, 0);
  check('tline Γ: 100 Ω on 50 Ω = 1/3', gamma([100, 0], Z0)[0], 1 / 3, 1e-15);
  check('tline VSWR: 100 Ω on 50 Ω = 2', vswr(gamma([100, 0], Z0)), 2, 1e-15);
  check('tline VSWR: 25 Ω on 50 Ω = 2 as well', vswr(gamma([25, 0], Z0)), 2, 1e-15);
  check('tline return loss: |Γ| = 1/3 → 9.54 dB', returnLossDb(gamma([100, 0], Z0)), 9.542, 1e-3);
  check('tline loadZ: RL series', loadZ({ kind: 'RL', R: 25, L: 4e-9 }, w)[1], w * 4e-9, 1e-15);
  check('tline loadZ: RC series is capacitive', loadZ({ kind: 'RC', R: 25, C: 2e-12 }, w)[1] < 0 ? 1 : 0, 1, 0);
  check('tline Z_in: quarter-wave transformer Z0²/ZL', zin([100, 0], Z0, beta, lam / 4)[0], 25, 1e-9);
  check('tline Z_in: half-wave repeats the load', zin([100, 0], Z0, beta, lam / 2)[0], 100, 1e-9);
  check('tline Z_in: shorted λ/8 stub is +jZ0', zin([0, 0], Z0, beta, lam / 8)[1], 50, 1e-9);
  {
    // an open λ/4 line: Z_in = 0 so V_in = 0, yet the load end sits at |V_L| = Vs Z0/Rs (current Vs/Rs feeds the line)
    const ss = steadyState({ Vs: 2, Rs: 50, Z0: 50, beta: 2 * PI, l: 0.25, ZL: [Infinity, 0] });
    check('tline open λ/4: V_in ≈ 0 (the line looks like a short)', cabs(ss.Vin) < 1e-9 ? 1 : 0, 1, 0);
    check('tline open λ/4: |V| at the load = Vs Z0/Rs = 2 V, finite and nonzero', cabs(ss.V(0)), 2, 1e-9);
    check('tline open λ/4: |I| at the generator = Vs/Rs', cabs(ss.I(0.25)), 2 / 50, 1e-9);
    const sh = steadyState({ Vs: 2, Rs: 50, Z0: 50, beta: 2 * PI, l: 0.5, ZL: [0, 0] });
    check('tline shorted λ/2: |I| at the load = Vs/Rs, finite', cabs(sh.I(0)), 2 / 50, 1e-9);
    check('tline shorted λ/2: V at the load 0', cabs(sh.V(0)) < 1e-9 ? 1 : 0, 1, 0);
    const rs0 = steadyState({ Vs: 2, Rs: 0, Z0: 50, beta: 2 * PI, l: 0.1, ZL: [100, 0] });
    check('tline Rs = 0: V_in = Vs', cabs(rs0.Vin), 2, 1e-12);
  }
  check('tline Z_in: open λ/4 looks like a short', cabs(zin([Infinity, 0], Z0, beta, lam / 4)), 0, 1e-9);
  check('tline Z_in: matched is Z0 anywhere', zin([50, 0], Z0, beta, 0.37 * lam)[0], 50, 1e-12);
  for (const [name, ZL] of [['100 Ω', [100, 0]], ['25 + j25', [25, 25]], ['open', [Infinity, 0]]]) {
    const ss = steadyState({ Vs: 2, Rs: 50, Z0, beta, l: 0.37 * lam, ZL }), G = ss.GL, ex = extrema(G, beta);
    check(`tline envelope ${name}: |V(d_max)| = |V+|(1 + |Γ|)`, cabs(ss.V(ex.dmax)), cabs(ss.Vp) * (1 + cabs(G)), 1e-9);
    check(`tline envelope ${name}: |V(d_min)| = |V+|(1 − |Γ|)`, cabs(ss.V(ex.dmin)), cabs(ss.Vp) * (1 - cabs(G)), 1e-9);
    check(`tline envelope ${name}: max and min are λ/4 apart`, Math.abs(ex.dmax - ex.dmin) % (lam / 2), lam / 4, 1e-9);
    check(`tline power ${name}: input power = delivered power (lossless)`, ss.Pin, ss.PL, 1e-9);
    check(`tline power ${name}: P_L = P_fwd (1 − |Γ|²)`, ss.PL, ss.Pfwd * (1 - cabs(G) ** 2), 1e-12);
    // V(d) at the generator end equals V_in, and the instantaneous parts add
    check(`tline ${name}: V(l) = V_in`, cabs(ss.V(0.37 * lam)), cabs(ss.Vin), 1e-9);
    const inst = instantaneous(ss, beta, w, 0.1 * lam, 0.3e-9);
    check(`tline ${name}: forward + reflected = total`, inst.fwd + inst.ref, inst.total, 1e-12);
  }
  // matched line: the generator sees Z0 and delivers Vs²/(8 Z0) with Rs = Z0
  const ms = steadyState({ Vs: 2, Rs: 50, Z0, beta, l: 0.37 * lam, ZL: [50, 0] });
  check('tline matched: P_L = Vs²/(8 Z0) with Rs = Z0', ms.PL, 4 / 400, 1e-12);
  check('tline matched: envelope flat', cabs(ms.V(0.1 * lam)), cabs(ms.V(0.3 * lam)), 1e-12);
  // transient: Rs = 25 (Γs = −1/3), RL = 150 (ΓL = 1/2), Vs = 1
  const su = stepSetup({ Vs: 1, Rs: 25, Z0, RL: 150, l: 1, v }), wv = bounces(su, 20);
  check('tline step: V1+ = Vs Z0/(Rs + Z0)', su.V1, 2 / 3, 1e-15);
  check('tline step: Γs = −1/3', su.Gs, -1 / 3, 1e-15);
  check('tline step: Γ_L = 1/2', su.GL, 0.5, 0);
  check('tline step: V_L just after 1T = V1(1 + Γ_L) = 1.0', stepV(su, wv, 1, 1, 1.5 * su.T), 1, 1e-12);
  check('tline step: V_L after 3T = 1 + V1 Γ_L Γ_s (1 + Γ_L) = 0.8333', stepV(su, wv, 1, 1, 3.5 * su.T), 1 + (2 / 3) * 0.5 * (-1 / 3) * 1.5, 1e-12);
  check('tline step: V_in before 2T is V1', stepV(su, wv, 1, 0, 1.5 * su.T), 2 / 3, 1e-15);
  check('tline step: settles to Vs RL/(Rs + RL)', stepV(su, wv, 1, 1, 40 * su.T), su.Vfinal, 1e-6);
  check('tline step: before the wave arrives the point is quiet', stepV(su, wv, 1, 0.5, 0.25 * su.T), 0, 0);
  check('tline step: V = Z0 I while only the forward wave exists', stepV(su, wv, 1, 0.5, 0.75 * su.T), Z0 * stepI(su, wv, 1, 0.5, 0.75 * su.T, Z0), 1e-15);
  check('tline step: final current Vfinal/RL', su.Ifinal, su.Vfinal / 150, 1e-15);
  check('tline pulse: a pulse of width tp is the difference of two steps', stepV(su, wv, 1, 1, 1.2 * su.T, 0.5 * su.T), stepV(su, wv, 1, 1, 1.2 * su.T) - stepV(su, wv, 1, 1, 0.7 * su.T), 1e-15);
  const open = stepSetup({ Vs: 1, Rs: 50, Z0, RL: Infinity, l: 1, v }), ow = bounces(open, 5);
  check('tline step into an open line with Rs = Z0: load doubles to Vs and stays', stepV(open, ow, 1, 1, 1.5 * open.T), 1, 1e-15);
  check('tline step into an open line: generator end reads Vs/2 until 2T, then Vs', stepV(open, ow, 1, 0, 1.5 * open.T) === 0.5 && stepV(open, ow, 1, 0, 2.5 * open.T) === 1 ? 1 : 0, 1, 0);
  check('tline extrema: open load has V_max at the load', extrema(gamma([Infinity, 0], Z0), beta).dmax, 0, 1e-12);
  check('tline extrema: short has V_min at the load', extrema(gamma([0, 0], Z0), beta).dmin, 0, 1e-12);
  void carg;
}
