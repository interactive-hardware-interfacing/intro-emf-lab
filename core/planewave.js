// Uniform plane waves: propagation constants and intrinsic impedance of a (lossy) medium,
// E and H along z at any time, polarization, and normal incidence on a plane interface
// between two media (reflection and transmission, the standing wave in front of it, the
// decay behind it). Complex numbers are [re, im]; phasors are E(z) with e^{jωt} understood.

import { EPS0, MU0, PI } from './constants.js';
import { cadd, csub, cmul, cdiv, cabs, carg, cexp } from './tline.js';

export const C0 = 1 / Math.sqrt(MU0 * EPS0);
export const ETA0 = Math.sqrt(MU0 / EPS0);

const csqrt = (z) => { const r = cabs(z), th = carg(z); return [Math.sqrt(r) * Math.cos(th / 2), Math.sqrt(r) * Math.sin(th / 2)]; };

/**
 * A medium at frequency f: γ = α + jβ = jω√(μ(ε − jσ/ω)), η = √(μ / (ε − jσ/ω)), and the derived
 * wavelength, phase velocity, skin depth, loss tangent and the good-conductor approximation.
 */
export function medium({ f, epsR = 1, muR = 1, sigma = 0 }) {
  const w = 2 * PI * f, eps = epsR * EPS0, mu = muR * MU0;
  const epsC = [eps, -sigma / w];                                   // complex permittivity ε − jσ/ω
  const g = cmul([0, w], csqrt(cmul([mu, 0], epsC)));              // jω √(μ ε_c)
  const alpha = Math.abs(g[0]), beta = Math.abs(g[1]);
  const eta = csqrt(cdiv([mu, 0], epsC));
  const lossTan = sigma / (w * eps);
  return { w, alpha, beta, eta, lambda: (2 * PI) / beta, vp: w / beta, delta: alpha > 0 ? 1 / alpha : Infinity, lossTan, goodConductorAlpha: Math.sqrt(PI * f * mu * sigma), epsR, muR, sigma, f };
}

/** Normal incidence from medium 1 onto medium 2: Γ = (η2 − η1)/(η2 + η1), τ = 1 + Γ, and the power split. */
export function normalIncidence(m1, m2) {
  const G = cdiv(csub(m2.eta, m1.eta), cadd(m2.eta, m1.eta)), tau = cadd([1, 0], G);
  const R = cabs(G) ** 2;
  // transmitted power fraction: Re(1/η2) |τ|² / Re(1/η1)
  const re1 = cdiv([1, 0], m1.eta)[0], re2 = cdiv([1, 0], m2.eta)[0];
  const T = (re2 * cabs(tau) ** 2) / re1;
  return { G, tau, R, T, swr: cabs(G) < 1 ? (1 + cabs(G)) / (1 - cabs(G)) : Infinity };
}

/**
 * Phasors of E_x and H_y at z for an x-polarized wave of amplitude E0 incident from z < 0 on
 * the interface at z = 0 (or travelling in medium 1 alone when m2 is null).
 */
export function phasors(E0, m1, m2, z) {
  const inc = m2 ? normalIncidence(m1, m2) : { G: [0, 0], tau: [1, 0] };
  if (z <= 0 || !m2) {
    const fwd = cmul([E0 * Math.exp(-m1.alpha * z), 0], cexp(-m1.beta * z));
    const ref = m2 ? cmul(cmul([E0 * Math.exp(m1.alpha * z), 0], inc.G), cexp(m1.beta * z)) : [0, 0];
    const Hf = cdiv(fwd, m1.eta), Hr = cdiv(ref, m1.eta);
    return { E: cadd(fwd, ref), H: csub(Hf, Hr), Efwd: fwd, Eref: ref };
  }
  const tr = cmul(cmul([E0 * Math.exp(-m2.alpha * z), 0], inc.tau), cexp(-m2.beta * z));
  return { E: tr, H: cdiv(tr, m2.eta), Efwd: tr, Eref: [0, 0] };
}

/** Instantaneous fields at (z, t): real parts of the phasors times e^{jωt}. */
export function instantaneous(E0, m1, m2, z, t) {
  const p = phasors(E0, m1, m2, z), ph = cexp(m1.w * t);
  const re = (c) => cmul(c, ph)[0];
  return { E: re(p.E), H: re(p.H), Efwd: re(p.Efwd), Eref: re(p.Eref) };
}

/** Time-average Poynting flux for a forward wave of amplitude E0 in medium m: ½ |E0|² Re(1/η). */
export function poynting(E0, m) { return 0.5 * E0 * E0 * cdiv([1, 0], m.eta)[0]; }

/**
 * Polarization of E = x̂ Ex cos(ωt − βz) + ŷ Ey cos(ωt − βz + φ) (φ in radians): the type, the sense
 * of rotation looking toward +z (the direction of travel), the axial ratio and the tilt of the major axis.
 */
export function polarization(Ex, Ey, phi) {
  const a = Math.abs(Ex), b = Math.abs(Ey);
  const s = Math.sin(phi), c = Math.cos(phi);
  // Stokes-like parameters
  const S0 = a * a + b * b, S1 = a * a - b * b, S2 = 2 * a * b * c, S3 = 2 * a * b * s;
  const tilt = 0.5 * Math.atan2(S2, S1);
  const chi = 0.5 * Math.asin(S0 > 0 ? Math.max(-1, Math.min(1, S3 / S0)) : 0);
  const axial = Math.abs(Math.tan(chi)) > 0 ? 1 / Math.abs(Math.tan(chi)) : Infinity; // major / minor
  let type = 'elliptical';
  if (S0 === 0) type = 'none'; else if (Math.abs(S3) < 1e-9 * S0) type = 'linear'; else if (Math.abs(S1) < 1e-9 * S0 && Math.abs(S2) < 1e-9 * S0) type = 'circular';
  // sense: Ey = Ey0 cos(ωt + φ) with φ < 0 lags Ex, so E rotates from x toward y in time, a right-handed
  // screw along +z: right-handed (IEEE) = counter-clockwise for an observer facing the oncoming wave.
  const sense = type === 'linear' || type === 'none' ? '' : S3 < 0 ? 'right-handed (IEEE): E rotates from x toward y, counter-clockwise facing the oncoming wave' : 'left-handed (IEEE): E rotates from y toward x, clockwise facing the oncoming wave';
  return { type, sense, axialRatio: axial, tilt, S0, S1, S2, S3 };
}

/** The tip of E in the x–y plane at z = 0 over one period. */
export function polarizationTrace(Ex, Ey, phi, n = 200) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const th = (2 * PI * k) / n; pts.push([Ex * Math.cos(th), Ey * Math.cos(th + phi)]); }
  return pts;
}
