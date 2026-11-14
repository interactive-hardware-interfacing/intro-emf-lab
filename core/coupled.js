// Coupled coils: two coaxial single-layer windings, their mutual inductance by Maxwell's
// filament formula summed over turn pairs, their self-inductances by Nagaoka (a single turn
// by the ring formula), the coupling coefficient, and the transformer in sinusoidal steady
// state (open-circuit voltage ratio, a resistive load on the secondary, the reflected
// impedance). Axis along z; a coil is { N, a, l, zc } in metres.

import { PI } from './constants.js';
import { filamentM, ringL, nagaoka } from './analytic.js';
import { MU0 } from './constants.js';
import { cadd, cmul, cdiv, cabs } from './tline.js';

/** Turn positions of a coil: N turns of radius a spread over length l about zc. */
export function coilTurns({ N, a, l, zc = 0 }) {
  const out = [];
  for (let k = 0; k < N; k++) out.push({ R: a, zc: zc + (N === 1 ? 0 : -l / 2 + (l * (k + 0.5)) / N) });
  return out;
}

/** Mutual inductance of two coils: Σ over turn pairs of the coaxial-filament formula. */
export function mutualInductance(c1, c2) {
  let M = 0;
  for (const t1 of coilTurns(c1)) for (const t2 of coilTurns(c2)) M += filamentM(t1.R, t2.R, Math.abs(t1.zc - t2.zc));
  return M;
}

/** Self-inductance: Nagaoka for a winding, the ring formula (wire radius rw) for a single turn. */
export function selfInductance({ N, a, l }, rw = 0.5e-3) {
  if (N === 1) return ringL(a, rw);
  return nagaoka(2 * a, l) * (MU0 * N * N * PI * a * a) / l;
}

export function coupling(M, L1, L2) { return M / Math.sqrt(L1 * L2); }

/**
 * Transformer in phasors with coil 1 driven by V1 (amplitude) at ω and coil 2 loaded by R (Ω;
 * Infinity for open circuit):  V1 = jωL1 I1 + jωM I2,  0 = jωM I1 + (jωL2 + R) I2.
 * Returns the phasors and the numbers the tab reports.
 */
export function transformer({ L1, L2, M, R, w, V1 }) {
  const jwL1 = [0, w * L1], jwL2 = [0, w * L2], jwM = [0, w * M];
  if (!Number.isFinite(R)) {
    const I1 = cdiv([V1, 0], jwL1), V2 = cmul(jwM, I1);
    return { I1, I2: [0, 0], V2, Zin: jwL1, Pin: 0, Pload: 0, ratio: cabs(V2) / V1, Zref: [0, 0] };
  }
  const Zsec = cadd(jwL2, [R, 0]);
  const Zref = cdiv(cmul([0, w * M], [0, w * M]), Zsec);             // (jωM)² / (R + jωL2)  (negative sign folded in: (jωM)² = −ω²M²)
  const Zin = cadd(jwL1, [-Zref[0], -Zref[1]]);                       // jωL1 − (jωM)²/Zsec = jωL1 + ω²M²/Zsec
  const I1 = cdiv([V1, 0], Zin);
  const I2 = cdiv(cmul([-1, 0], cmul(jwM, I1)), Zsec);
  const V2 = cmul(I2, [R, 0]);
  const Pin = 0.5 * (V1 * I1[0]), Pload = 0.5 * R * cabs(I2) ** 2;
  return { I1, I2, V2, Zin, Pin, Pload, ratio: cabs(V2) / V1, Zref: [-Zref[0], -Zref[1]] };
}

/** The fraction of coil 1's flux linkage that threads coil 2 per turn ratio: M / L1 = k √(L2/L1). */
export function fluxFraction(M, L1) { return M / L1; }
