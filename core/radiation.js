// The Hertzian (short) dipole: the exact fields of an oscillating current element I0 dl along
// z at the origin, their near- and far-field parts, the instantaneous field lines as contours
// of the stream function r sinθ H_φ, the radiation pattern, radiation resistance and power.
// Phasors are [re, im] with e^{jωt} understood; spherical coordinates (r, θ) about the z axis.

import { PI } from './constants.js';
import { C0, ETA0 } from './planewave.js';
import { cmul, cexp } from './tline.js';

/** k = 2π/λ, λ = c/f. */
export function wavenumber(f) { const lambda = C0 / f; return { k: (2 * PI) / lambda, lambda, w: 2 * PI * f }; }

/**
 * Exact phasors at (r, θ) for a dipole I0 dl at frequency f in free space:
 *   E_r = (η I0 dl cosθ)/(2π r²) (1 + 1/(jkr)) e^{−jkr}
 *   E_θ = (jη k I0 dl sinθ)/(4π r) (1 + 1/(jkr) − 1/(kr)²) e^{−jkr}
 *   H_φ = (jk I0 dl sinθ)/(4π r) (1 + 1/(jkr)) e^{−jkr}
 */
export function hertzFields(I0, dl, f, r, theta) {
  const { k } = wavenumber(f), kr = k * r, s = Math.sin(theta), c = Math.cos(theta);
  const ph = cexp(-kr);
  const inv = [0, -1 / kr];                       // 1/(jkr) = −j/(kr)
  const a = [1 + inv[0], inv[1]];                  // 1 + 1/(jkr)
  const b = [1 - 1 / (kr * kr), inv[1]];           // 1 + 1/(jkr) − 1/(kr)²
  const Er = cmul([((ETA0 * I0 * dl * c) / (2 * PI * r * r)), 0], cmul(a, ph));
  const Eth = cmul([0, (ETA0 * k * I0 * dl * s) / (4 * PI * r)], cmul(b, ph));
  const Hph = cmul([0, (k * I0 * dl * s) / (4 * PI * r)], cmul(a, ph));
  return { Er, Eth, Hph, kr };
}

/** The far-field (1/r) parts alone. */
export function farFields(I0, dl, f, r, theta) {
  const { k } = wavenumber(f), s = Math.sin(theta), ph = cexp(-k * r);
  const Eth = cmul([0, (ETA0 * k * I0 * dl * s) / (4 * PI * r)], ph), Hph = cmul([0, (k * I0 * dl * s) / (4 * PI * r)], ph);
  return { Er: [0, 0], Eth, Hph };
}

/** Instantaneous (real) fields at time t. */
export function instantaneous(I0, dl, f, r, theta, t) {
  const F = hertzFields(I0, dl, f, r, theta), ph = cexp(2 * PI * f * t);
  const re = (z) => cmul(z, ph)[0];
  return { Er: re(F.Er), Eth: re(F.Eth), Hph: re(F.Hph) };
}

/** Stream function of E: ψ = r sinθ H_φ (instantaneous). E lines are its level curves. */
export function streamPsi(I0, dl, f, r, theta, t) {
  const F = hertzFields(I0, dl, f, r, theta), ph = cexp(2 * PI * f * t);
  return r * Math.sin(theta) * cmul(F.Hph, ph)[0];
}

/** Time-average radial Poynting flux ½ Re(E_θ H_φ*). */
export function poyntingAvg(I0, dl, f, r, theta) {
  const F = hertzFields(I0, dl, f, r, theta);
  return 0.5 * (F.Eth[0] * F.Hph[0] + F.Eth[1] * F.Hph[1]);
}

/** Radiation resistance η(k dl)²/(6π) (= 80π² (dl/λ)² with η ≈ 120π) and the radiated power ½ I0² R_rad; directivity 1.5. */
export function radiation(I0, dl, f) {
  const { lambda, k } = wavenumber(f);
  const Rrad = (ETA0 * (k * dl) ** 2) / (6 * PI);
  return { Rrad, Rrad80: 80 * PI * PI * (dl / lambda) ** 2, Prad: 0.5 * I0 * I0 * Rrad, directivity: 1.5, lambda };
}

/** Normalised power pattern sin²θ and the half-power beamwidth (90°). */
export function pattern(theta) { return Math.sin(theta) ** 2; }

/** Where the 1/r, 1/r² and 1/r³ terms of E_θ are equal in size: kr = 1, r = λ/2π. */
export function nearFarBoundary(f) { return wavenumber(f).lambda / (2 * PI); }
