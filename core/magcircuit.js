// Magnetic circuits: the reluctance model of a core with an air gap and a winding of N turns
// carrying I. Each leg is a reluctance ℛ = l/(μA); the gap dominates; fringing widens the gap's
// effective area; a saturating core (the same μ(B) law as the Inductors tab) makes ℛ_core
// depend on the flux, solved by bisection. Closed form.
//   NI = Φ (ℛ_core + ℛ_gap),  B = Φ/A,  L = N²/ℛ_total = NΦ/I,  W = ½LI²,
//   energy split: W_gap/W = ℛ_gap/ℛ_total,  gap force F = B_gap² A_gap/(2μ₀) (pull on the pole faces)
//   fringing (simple rule): A_gap = (w + g)(d + g) for a rectangular section w × d
//   saturation: B = μ₀ H + (2 B_sat/π) atan(π (μ_i − 1) μ₀ H /(2 B_sat))  (from axisym.js's model)
import { PI, MU0 } from './constants.js';

/** B(H) of the core material: linear μ_r, or the saturating law with initial μ_i and B_sat. */
export function coreB(H, { muR = 2000, Bsat = 0 }) {
  if (!Bsat) return MU0 * muR * H;
  return MU0 * H + ((2 * Bsat) / PI) * Math.atan((PI * (muR - 1) * MU0 * H) / (2 * Bsat));
}

/**
 * Solve the circuit. geometry: core mean path length lc (m), section w × d (m), gap g (m);
 * material: muR, Bsat; winding: N, I. Options: fringe (boolean).
 * Returns reluctances, flux, B in core and gap, H in each, L, energies, gap force, the fraction of NI dropped across the gap.
 */
export function solve({ lc = 0.2, w = 0.02, d = 0.02, g = 1e-3, muR = 2000, Bsat = 0, N = 200, I = 1, fringe = true }) {
  const Ac = w * d, Ag = fringe ? (w + g) * (d + g) : Ac, Rg = g / (MU0 * Ag);
  const NI = N * I;
  let Phi, Hc, Bc, Rc;
  if (!Bsat) { Rc = lc / (MU0 * muR * Ac); Phi = NI / (Rc + Rg); Bc = Phi / Ac; Hc = Bc / (MU0 * muR); }
  else {
    // NI = Hc lc + (Φ/Ag) g/μ₀ with Φ = Bc(Hc) Ac: monotone in Hc → bisection
    const f = (H) => H * lc + ((coreB(H, { muR, Bsat }) * Ac) / Ag) * (g / MU0) - NI;
    let lo = 0, hi = Math.max(1, NI / Math.min(lc, 1e-9)) * 10;
    for (let k = 0; k < 200; k++) { const mid = 0.5 * (lo + hi); if (f(mid) > 0) hi = mid; else lo = mid; }
    Hc = 0.5 * (lo + hi); Bc = coreB(Hc, { muR, Bsat }); Phi = Bc * Ac; Rc = Phi > 0 ? (Hc * lc) / Phi : lc / (MU0 * muR * Ac);
  }
  const Bg = Phi / Ag, Hg = Bg / MU0, L = I ? (N * Phi) / I : N * N / (Rc + Rg);
  const Wg = 0.5 * Hg * Bg * Ag * g, Wc = 0.5 * Hc * Bc * Ac * lc, F = (Bg * Bg * Ag) / (2 * MU0);
  return { Ac, Ag, Rc, Rg, Rtot: Rc + Rg, Phi, Bc, Bg, Hc, Hg, L, W: Wg + Wc, Wg, Wc, gapShare: (Rg * Phi) / NI, F, NI, muEff: Bc / (MU0 * Hc || 1), Lgapless: (N * N * MU0 * muR * Ac) / lc };
}

/** Sweep B_core against NI (the magnetisation curve of the circuit), with and without the gap. */
export function sweepNI(p, nMax = 2000, n = 200) {
  const out = { NI: [], Bgap: [], BnoGap: [] };
  for (let k = 0; k < n; k++) { const NI = (nMax * k) / (n - 1); out.NI.push(NI); out.Bgap.push(solve({ ...p, N: 1, I: NI }).Bc); out.BnoGap.push(solve({ ...p, g: 0, N: 1, I: NI }).Bc); }
  return out;
}

/** L against gap length (the standard "air gap linearises the inductor" curve). */
export function sweepGap(p, gMax = 5e-3, n = 100) {
  const out = { g: [], L: [], gapShare: [] };
  for (let k = 0; k < n; k++) { const g = (gMax * k) / (n - 1); const s = solve({ ...p, g }); out.g.push(g); out.L.push(s.L); out.gapShare.push(s.gapShare); }
  return out;
}
