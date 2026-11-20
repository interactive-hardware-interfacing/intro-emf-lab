// Rectangular waveguide a × b (a along x, b along y), air-filled: cutoff frequencies of the
// TE_mn and TM_mn modes, the propagation constant and guide wavelength of the operating mode,
// phase and group velocities, wave impedances, the bouncing-plane-wave angle, and the TE10
// fields on the x–z plane for a picture. Closed form.
//   k_c = √((mπ/a)² + (nπ/b)²),  f_c = c k_c / 2π,  β = √(k² − k_c²) (real above cutoff, −jα below)
//   λ_g = 2π/β,  v_p = ω/β > c,  v_g = c²/v_p < c,  Z_TE = η k/β,  Z_TM = η β/k,  cosθ = β/k
//   TE10: E_y = E₀ sin(πx/a) e^{−jβz},  H_x = −(β/ωμ) E_y,  H_z = j(π/a)(E₀/ωμ) cos(πx/a) e^{−jβz}
import { PI, EPS0, MU0 } from './constants.js';

export const C0 = 1 / Math.sqrt(EPS0 * MU0), ETA0 = Math.sqrt(MU0 / EPS0);

export function cutoff(a, b, m, n) { return (C0 / 2) * Math.sqrt((m / a) ** 2 + (n / b) ** 2); }

/** The modes below fMax, sorted by cutoff; TE_m0 and TE_0n exist, TM needs m, n ≥ 1. */
export function modeList(a, b, fMax, maxIndex = 5) {
  const out = [];
  for (let m = 0; m <= maxIndex; m++) for (let n = 0; n <= maxIndex; n++) {
    if (m === 0 && n === 0) continue;
    const fc = cutoff(a, b, m, n);
    if (fc > fMax) continue;
    out.push({ kind: 'TE', m, n, fc });
    if (m >= 1 && n >= 1) out.push({ kind: 'TM', m, n, fc });
  }
  return out.sort((p, q) => p.fc - q.fc || (p.kind < q.kind ? -1 : 1));
}

/** Propagation of one mode at frequency f. */
export function propagation(a, b, m, n, f, kind = 'TE') {
  const k = (2 * PI * f) / C0, kc = Math.sqrt((m * PI / a) ** 2 + (n * PI / b) ** 2), fc = (C0 * kc) / (2 * PI);
  if (f <= fc) { const alpha = Math.sqrt(kc * kc - k * k); return { k, kc, fc, propagating: false, alpha, alphaDb: 8.685889638 * alpha, beta: 0, lamG: Infinity, vp: Infinity, vg: 0, Z: NaN, theta: NaN };
  }
  const beta = Math.sqrt(k * k - kc * kc), lamG = (2 * PI) / beta, vp = (2 * PI * f) / beta, vg = (C0 * C0) / vp;
  return { k, kc, fc, propagating: true, alpha: 0, alphaDb: 0, beta, lamG, vp, vg, Z: kind === 'TE' ? (ETA0 * k) / beta : (ETA0 * beta) / k, theta: Math.acos(beta / k), lam0: C0 / f };
}

/** Single-mode band of a standard guide: TE10 cutoff to the next mode's cutoff. */
export function singleModeBand(a, b) {
  const f10 = cutoff(a, b, 1, 0), next = Math.min(cutoff(a, b, 2, 0), cutoff(a, b, 0, 1), cutoff(a, b, 1, 1));
  return { lo: f10, hi: next, ratio: next / f10 };
}

/** TE10 instantaneous fields at (x, z), time t; E₀ = 1 V/m. Below cutoff the z dependence is e^{−αz} with no phase advance. */
export function te10Fields(a, f, x, z, t) {
  const pr = propagation(a, 1, 1, 0, f), w = 2 * PI * f, ph = w * t;
  if (!pr.propagating) {
    // β → −jα: E_y = sin(πx/a) e^{−αz} e^{jωt}; H_x = −(β/ωμ) E_y = (jα/ωμ) E_y → Re gives −(α/ωμ) sin(πx/a) e^{−αz} sin(ωt): in quadrature with E (reactive, no real power flow), and needed for ∇·H = 0
    const env = Math.exp(-pr.alpha * z), sx = Math.sin((PI * x) / a);
    return { Ey: sx * env * Math.cos(ph), Hx: -((pr.alpha / (w * MU0)) * sx * env * Math.sin(ph)), Hz: -((PI / a) / (w * MU0)) * Math.cos((PI * x) / a) * env * Math.sin(ph), evanescent: true };
  }
  const arg = ph - pr.beta * z;
  const Ey = Math.sin((PI * x) / a) * Math.cos(arg);
  const Hx = -(pr.beta / (w * MU0)) * Ey;
  const Hz = -((PI / a) / (w * MU0)) * Math.cos((PI * x) / a) * Math.sin(arg); // Re[j … e^{j arg}] = −… sin(arg)
  return { Ey, Hx, Hz, evanescent: false };
}

/** Time-average power through the guide cross-section for TE10 with amplitude E₀ (W): P = E₀² a b β /(4 ω μ). */
export function te10Power(a, b, f, E0 = 1) { const pr = propagation(a, b, 1, 0, f); return pr.propagating ? (E0 * E0 * a * b * pr.beta) / (4 * 2 * PI * f * MU0) : 0; }

/** Dispersion curves: β(f) for the listed modes over [f0, f1]. */
export function dispersion(a, b, modes, f0, f1, n = 200) {
  return modes.map((md) => { const fs = [], bs = [], vps = [], vgs = []; for (let k = 0; k < n; k++) { const f = f0 + ((f1 - f0) * k) / (n - 1), pr = propagation(a, b, md.m, md.n, f, md.kind); fs.push(f); bs.push(pr.propagating ? pr.beta : NaN); vps.push(pr.propagating ? pr.vp : NaN); vgs.push(pr.propagating ? pr.vg : NaN); } return { ...md, f: fs, beta: bs, vp: vps, vg: vgs }; });
}

/** Standard guides (inner dimensions, metres). */
export const STANDARD = {
  WR90: { a: 22.86e-3, b: 10.16e-3, label: 'WR-90 (X band, 8.2–12.4 GHz)' },
  WR62: { a: 15.8e-3, b: 7.9e-3, label: 'WR-62 (Ku band, 12.4–18 GHz)' },
  WR284: { a: 72.14e-3, b: 34.04e-3, label: 'WR-284 (S band, 2.6–3.95 GHz)' },
  WR42: { a: 10.67e-3, b: 4.32e-3, label: 'WR-42 (K band, 18–26.5 GHz)' },
};
