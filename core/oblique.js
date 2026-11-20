// Oblique incidence of a plane wave on a plane boundary between two lossless media
// (ε1, μ1 | ε2, μ2), interface z = 0, plane of incidence x–z, incident from z < 0 at angle θi
// from the normal. Snell, the Fresnel coefficients for both polarizations, Brewster and
// critical angles, total internal reflection with its evanescent tail, and the instantaneous
// out-of-plane field on the x–z plane for a picture. Closed form (Sadiku §10.9, Balanis).
//
// Polarizations (named by E relative to the plane of incidence):
//   perpendicular (⊥, s, TE): E out of the plane (along y). Field pictured: E_y.
//   parallel (∥, p, TM):       H out of the plane (along y). Field pictured: H_y.
//   η = √(μ/ε), θt from Snell, with cos θt = −j√(sin²θi/n² − 1) past the critical angle so
//   that the transmitted wave decays into medium 2 (the choice that keeps the fields bounded).
//   Γ⊥ = (η2 cosθi − η1 cosθt)/(η2 cosθi + η1 cosθt),  τ⊥ = 1 + Γ⊥
//   Γ∥ = (η2 cosθt − η1 cosθi)/(η2 cosθt + η1 cosθi),  τ∥ = (1 + Γ∥) cosθi / cosθt   (E amplitudes)
//   Power: R = |Γ|²; T = 1 − R (lossless). Brewster (∥, μ1 = μ2): tan θB = √(ε2/ε1).
//   Critical (ε1 > ε2): sin θc = √(ε2/ε1).

import { PI, EPS0, MU0 } from './constants.js';
import { cadd, csub, cmul, cdiv, cabs, carg, cexp } from './tline.js';

export const C0 = 1 / Math.sqrt(EPS0 * MU0);
const csqrt = ([a, b]) => { const m = Math.hypot(a, b), re = Math.sqrt((m + a) / 2), im = Math.sign(b || 1) * Math.sqrt(Math.max(0, (m - a) / 2)); return [re, im]; };

/** Snell and the angles. Returns { n1, n2, sinT, cosT (complex [re, im]), thetaT (rad, NaN if TIR), tir }. */
export function snell(epsR1, epsR2, thetaI, muR1 = 1, muR2 = 1) {
  const n1 = Math.sqrt(epsR1 * muR1), n2 = Math.sqrt(epsR2 * muR2), sinT = (n1 / n2) * Math.sin(thetaI);
  if (sinT <= 1) return { n1, n2, sinT, cosT: [Math.sqrt(1 - sinT * sinT), 0], thetaT: Math.asin(sinT), tir: false };
  return { n1, n2, sinT, cosT: [0, -Math.sqrt(sinT * sinT - 1)], thetaT: NaN, tir: true }; // −j√(…): decaying into z > 0
}

/** Fresnel coefficients at one angle. Returns complex Γ, τ for both polarizations and the power split. */
export function fresnel(epsR1, epsR2, thetaI, muR1 = 1, muR2 = 1) {
  const eta1 = Math.sqrt((MU0 * muR1) / (EPS0 * epsR1)), eta2 = Math.sqrt((MU0 * muR2) / (EPS0 * epsR2));
  const s = snell(epsR1, epsR2, thetaI, muR1, muR2), ci = [Math.cos(thetaI), 0], ct = s.cosT;
  const e1 = [eta1, 0], e2 = [eta2, 0];
  const Gperp = cdiv(csub(cmul(e2, ci), cmul(e1, ct)), cadd(cmul(e2, ci), cmul(e1, ct)));
  const Tperp = cadd([1, 0], Gperp);
  const Gpar = cdiv(csub(cmul(e2, ct), cmul(e1, ci)), cadd(cmul(e2, ct), cmul(e1, ci)));
  const Tpar = cabs(ct) > 0 ? cmul(cadd([1, 0], Gpar), cdiv(ci, ct)) : [0, 0];
  const Rperp = cabs(Gperp) ** 2, Rpar = cabs(Gpar) ** 2;
  // transmitted power fraction from the amplitudes (a check on 1 − R): T = |τ|² Re(η1 cosθt)/(η2 cosθi)
  const Tp = s.tir ? 0 : (cabs(Tperp) ** 2 * eta1 * ct[0]) / (eta2 * ci[0]);
  const Tpp = s.tir ? 0 : (cabs(Tpar) ** 2 * eta1 * ct[0]) / (eta2 * ci[0]);
  return { ...s, eta1, eta2, Gperp, Tperp, Gpar, Tpar, Rperp, Rpar, Tperp_power: Tp, Tpar_power: Tpp };
}

/** Brewster angle for ∥ polarization (μ1 = μ2), critical angle (NaN if n1 ≤ n2). */
export function specialAngles(epsR1, epsR2, muR1 = 1, muR2 = 1) {
  const n1 = Math.sqrt(epsR1 * muR1), n2 = Math.sqrt(epsR2 * muR2);
  const brewster = muR1 === muR2 ? Math.atan(Math.sqrt(epsR2 / epsR1)) : NaN;
  const critical = n1 > n2 ? Math.asin(n2 / n1) : NaN;
  return { brewster, critical };
}

/** Sweep of Γ, R over θi ∈ [0, 90°). */
export function sweep(epsR1, epsR2, n = 181, muR1 = 1, muR2 = 1) {
  const th = [], Gperp = [], Gpar = [], Rperp = [], Rpar = [], phPerp = [], phPar = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * (PI / 2) * 0.9999, f = fresnel(epsR1, epsR2, t, muR1, muR2);
    th.push(t); Gperp.push(f.Gperp[0]); Gpar.push(f.Gpar[0]); Rperp.push(f.Rperp); Rpar.push(f.Rpar); phPerp.push(carg(f.Gperp)); phPar.push(carg(f.Gpar));
  }
  return { th, Gperp, Gpar, Rperp, Rpar, phPerp, phPar };
}

/** 1/e depth of the evanescent wave in medium 2 past the critical angle (m), or Infinity. */
export function evanescentDepth(epsR1, epsR2, thetaI, f, muR1 = 1, muR2 = 1) {
  const s = snell(epsR1, epsR2, thetaI, muR1, muR2);
  if (!s.tir) return Infinity;
  const k2 = (2 * PI * f * s.n2) / C0;
  return 1 / (k2 * -s.cosT[1]);
}

/**
 * Instantaneous out-of-plane field at (x, z), t: E_y for ⊥, H_y (scaled by η1 so both plot alike) for ∥.
 * Unit incident amplitude. pol = 'perp' | 'par'.
 */
export function fieldAt(epsR1, epsR2, thetaI, f, pol, x, z, t, muR1 = 1, muR2 = 1) {
  const fr = fresnel(epsR1, epsR2, thetaI, muR1, muR2), w = 2 * PI * f, k1 = (w * fr.n1) / C0, k2 = (w * fr.n2) / C0;
  const si = Math.sin(thetaI), ci = Math.cos(thetaI), ph = cexp(w * t);
  const G = pol === 'perp' ? fr.Gperp : fr.Gpar;
  let amp;
  if (z < 0) {
    // incident e^{−jk1(x sinθ + z cosθ)} + reflected Γ e^{−jk1(x sinθ − z cosθ)}
    const inc = cexp(-k1 * (x * si + z * ci)), ref = cmul(G, cexp(-k1 * (x * si - z * ci)));
    amp = cadd(inc, ref);
    if (pol === 'par') amp = csub(inc, ref); // H_y of the reflected wave flips with E for ∥ (H = E/η with the propagation direction reversed in z)
  } else {
    // transmitted τ e^{−j(k1 sinθ x + k2 cosθt z)}; for ∥ the pictured H_y = (E/η2)·…, scaled to the incident H so it is continuous at z = 0 in the TIR limit
    const kz = cmul([k2, 0], fr.cosT); // complex past critical: −j k2 √(…) → e^{−j kz z} = e^{−k2√(…) z}
    const T = pol === 'perp' ? fr.Tperp : cmul(fr.Tpar, [fr.eta1 / fr.eta2, 0]); // ∥: H_y,t/H_y,i = τ∥ η1/η2
    amp = cmul(T, cexp(-k1 * si * x));
    const expz = [Math.exp(kz[1] * z) * Math.cos(-kz[0] * z), Math.exp(kz[1] * z) * Math.sin(-kz[0] * z)]; // e^{−j(kz_re + j kz_im) z} = e^{kz_im z} e^{−j kz_re z}
    amp = cmul(amp, expz);
  }
  return cmul(amp, ph)[0];
}

/** Wavelengths in the two media and along the interface. */
export function wavelengths(epsR1, epsR2, thetaI, f, muR1 = 1, muR2 = 1) {
  const s = snell(epsR1, epsR2, thetaI, muR1, muR2), l1 = C0 / (f * s.n1), l2 = C0 / (f * s.n2);
  return { l1, l2, lx: l1 / Math.sin(thetaI) };
}
