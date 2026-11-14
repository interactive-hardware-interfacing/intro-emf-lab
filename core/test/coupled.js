// Coupled-coil checks: M is symmetric, falls as a dipole for distant loops, k ≤ 1 and rises as
// coils nest, the open-circuit ratio is M/L1, a loaded transformer conserves power and reflects
// the load into the primary.
import { PI, MU0 } from '../constants.js';
import { coilTurns, mutualInductance, selfInductance, coupling, transformer, fluxFraction } from '../coupled.js';
import { filamentM, ringL } from '../analytic.js';

export function coupledChecks(check) {
  const c1 = { N: 100, a: 0.015, l: 0.03, zc: 0 }, c2 = { N: 50, a: 0.02, l: 0.02, zc: 0 };
  check('coupled turns: N turns spread over l', coilTurns(c1).length, 100, 0);
  check('coupled turns: single turn at zc', coilTurns({ N: 1, a: 0.01, l: 0, zc: 0.03 })[0].zc, 0.03, 0);
  check('coupled M: symmetric in the two coils', mutualInductance(c1, c2), mutualInductance(c2, c1), 1e-12);
  check('coupled M: one pair of turns is the filament formula', mutualInductance({ N: 1, a: 0.01, l: 0 }, { N: 1, a: 0.015, l: 0, zc: 0.005 }), filamentM(0.01, 0.015, 0.005), 1e-15);
  const far = mutualInductance({ N: 1, a: 0.01, l: 0 }, { N: 1, a: 0.01, l: 0, zc: 0.2 });
  check('coupled M: distant loops fall off as the dipole μ0 π a⁴ / (2 d³) (1e-2 at d = 20a)', far, (MU0 * PI * 1e-8) / (2 * 0.008), 1e-2);
  const L1 = selfInductance(c1), L2 = selfInductance(c2), M = mutualInductance(c1, c2), k = coupling(M, L1, L2);
  check('coupled L: single turn uses the ring formula', selfInductance({ N: 1, a: 0.05, l: 0 }, 0.5e-3), ringL(0.05, 0.5e-3), 1e-15);
  check('coupled k: between 0 and 1 for nested coils', k > 0.3 && k < 1 ? 1 : 0, 1, 0);
  check('coupled k: falls when coil 2 slides away', coupling(mutualInductance(c1, { ...c2, zc: 0.05 }), L1, L2) < k ? 1 : 0, 1, 0);
  check('coupled k: falls monotonically with offset', [0, 0.01, 0.02, 0.04, 0.08].map((d) => mutualInductance(c1, { ...c2, zc: d })).every((m, i, a) => i === 0 || m < a[i - 1]) ? 1 : 0, 1, 0);
  const w = 2 * PI * 1e3;
  const open = transformer({ L1, L2, M, R: Infinity, w, V1: 10 });
  check('coupled transformer: open-circuit v2/v1 = M/L1', open.ratio, M / L1, 1e-12);
  check('coupled transformer: = k √(L2/L1)', open.ratio, k * Math.sqrt(L2 / L1), 1e-12);
  check('coupled transformer: open secondary draws no power', open.Pin, 0, 0);
  check('coupled transformer: magnetizing current V1/ωL1', Math.hypot(...open.I1), 10 / (w * L1), 1e-12);
  check('coupled fluxFraction: M/L1', fluxFraction(M, L1), M / L1, 0);
  const ld = transformer({ L1, L2, M, R: 10, w, V1: 10 });
  check('coupled transformer loaded: power in = power to the load (lossless coils)', ld.Pin, ld.Pload, 1e-9);
  check('coupled transformer loaded: Z_in = jωL1 + ω²M²/(R + jωL2) (real part)', ld.Zin[0], (w * w * M * M * 10) / (100 + (w * L2) ** 2), 1e-9);
  check('coupled transformer loaded: Z_in imaginary part', ld.Zin[1], w * L1 - (w * w * M * M * w * L2) / (100 + (w * L2) ** 2), 1e-9);
  check('coupled transformer loaded: primary current grows under load', Math.hypot(...ld.I1) > Math.hypot(...open.I1) ? 1 : 0, 1, 0);
  check('coupled transformer loaded: v2 = R i2', Math.hypot(...ld.V2), 10 * Math.hypot(...ld.I2), 1e-12);
  check('coupled transformer loaded: secondary voltage is lower than open circuit', Math.hypot(...ld.V2) < Math.hypot(...open.V2) ? 1 : 0, 1, 0);
  // identical coincident single-layer coils would need the wire radius; with a tiny offset k should approach a high value
  const same = { N: 60, a: 0.02, l: 0.06 }, kk = coupling(mutualInductance(same, { ...same, a: 0.0205 }), selfInductance(same), selfInductance({ ...same, a: 0.0205 }));
  check('coupled k: two coils wound on top of each other are tightly coupled (k > 0.9)', kk > 0.9 ? 1 : 0, 1, 0);
}
