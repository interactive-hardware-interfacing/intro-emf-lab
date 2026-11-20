// Antennas beyond the Hertzian dipole: the centre-fed thin dipole of length L with a
// sinusoidal current, its far-field pattern, directivity and radiation resistance by numeric
// integration; and a two-element array of such dipoles (spacing d along x, phase δ) with the
// array factor and pattern multiplication. Far field only; closed form + quadrature.
//   F(θ) = [cos(kL/2 cosθ) − cos(kL/2)] / sinθ      (|E_θ| ∝ F/r)
//   U(θ) ∝ F², P_rad = ∮U dΩ, D = 4π U_max / P_rad, R_rad = 2 P_rad / I_max² with the Hertzian prefactor
//   half-wave: D = 1.64 (2.15 dBi), R_rad = 73.1 Ω, HPBW 78°
//   AF(θ, φ) = |1 + e^{j(kd sinθ cosφ + δ)}| for elements along x, the dipole along z
import { PI, EPS0, MU0 } from './constants.js';

export const C0 = 1 / Math.sqrt(EPS0 * MU0), ETA0 = Math.sqrt(MU0 / EPS0);

/** Unnormalised far-field element pattern of a thin dipole of length L (in wavelengths) along z. */
export function dipolePattern(Lw, theta) {
  const kL2 = PI * Lw, s = Math.sin(theta);
  if (Math.abs(s) < 1e-9) return 0;
  return (Math.cos(kL2 * Math.cos(theta)) - Math.cos(kL2)) / s;
}

/** Radiated power, directivity, R_rad for current amplitude I_max = 1 A, by Simpson over θ. */
export function dipoleFigures(Lw, n = 2000) {
  // |E_θ| = (η I_max / 2π r) F(θ) for the sinusoidal-current dipole → U = r² |E|²/(2η) = η I² F²/(8π²)
  let P = 0, Umax = 0, Fmax = 0;
  for (let i = 0; i <= n; i++) { const th = (PI * i) / n, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2, F = dipolePattern(Lw, th), U = (ETA0 * F * F) / (8 * PI * PI); P += w * U * 2 * PI * Math.sin(th); Umax = Math.max(Umax, U); Fmax = Math.max(Fmax, Math.abs(F)); }
  P *= PI / n / 3;
  const D = (4 * PI * Umax) / P, Rrad = 2 * P; // referred to the current maximum I_max = 1 A
  const s = Math.sin(PI * Lw), Rin = s > 1e-9 ? Rrad / (s * s) : Infinity;           // referred to the feed current I(0) = I_max sin(kL/2): the input resistance (lossless)
  // half-power beamwidth of the main lobe: find the direction of the maximum (broadside for L <= ~1.25 λ,
  // tilted toward the axis beyond), then walk outward on both sides to the half-power points.
  let im = 0, fm = 0; for (let i = 0; i <= n; i++) { const f = Math.abs(dipolePattern(Lw, (PI * i) / n)); if (f > fm) { fm = f; im = i; } }
  const half = fm * Math.SQRT1_2, dth = PI / n; let lo = im, hi = im;
  while (lo > 0 && Math.abs(dipolePattern(Lw, lo * dth)) > half) lo--;
  while (hi < n && Math.abs(dipolePattern(Lw, hi * dth)) > half) hi++;
  return { P, D, DdBi: 10 * Math.log10(D), Rrad, Rin, hpbw: ((hi - lo) * dth * 180) / PI, thetaMax: (im * dth * 180) / PI, Fmax };
}

/** Directivity of two isotropic elements with the same array factor (for comparison): broadside λ/2 and end-fire λ/4 pairs both give 2. */
export function isotropicArrayDirectivity(dw, delta, nT = 360, nP = 360) {
  let P = 0, Umax = 0;
  for (let i = 0; i <= nT; i++) { const th = (PI * i) / nT, wt = i === 0 || i === nT ? 1 : i % 2 ? 4 : 2; let ring = 0; for (let j = 0; j < nP; j++) { const U = arrayFactor(dw, delta, th, (2 * PI * j) / nP) ** 2; ring += U; Umax = Math.max(Umax, U); } P += wt * ring * (2 * PI / nP) * Math.sin(th); }
  P *= PI / nT / 3;
  return (4 * PI * Umax) / P;
}

/** Array factor magnitude for two isotropic elements on the x axis, spacing d (wavelengths), phase δ (rad), direction (θ, φ). */
export function arrayFactor(dw, delta, theta, phi) {
  const psi = 2 * PI * dw * Math.sin(theta) * Math.cos(phi) + delta;
  return Math.abs(2 * Math.cos(psi / 2));
}

/** Pattern multiplication: |total| in direction (θ, φ) for z-dipoles on the x axis. */
export function arrayPattern(Lw, dw, delta, theta, phi) { return Math.abs(dipolePattern(Lw, theta)) * arrayFactor(dw, delta, theta, phi); }

/** Directivity of the array by integrating over the sphere (Simpson in θ, trapezoid in φ). */
export function arrayDirectivity(Lw, dw, delta, nT = 360, nP = 360) {
  let P = 0, Umax = 0;
  for (let i = 0; i <= nT; i++) { const th = (PI * i) / nT, wt = i === 0 || i === nT ? 1 : i % 2 ? 4 : 2; let ring = 0; for (let j = 0; j < nP; j++) { const ph = (2 * PI * j) / nP, U = arrayPattern(Lw, dw, delta, th, ph) ** 2; ring += U; Umax = Math.max(Umax, U); } P += wt * ring * (2 * PI / nP) * Math.sin(th); }
  P *= PI / nT / 3;
  return (4 * PI * Umax) / P;
}

/** Polar cut samples: the E-plane (φ = 0, varying θ) and the H-plane (θ = 90°, varying φ). */
export function cuts(Lw, dw, delta, n = 361, withArray = true) {
  const E = [], Hc = [];
  for (let i = 0; i < n; i++) { const th = (PI * 2 * i) / (n - 1); E.push(withArray ? arrayPattern(Lw, dw, delta, th, 0) : Math.abs(dipolePattern(Lw, th))); }
  for (let i = 0; i < n; i++) { const ph = (PI * 2 * i) / (n - 1); Hc.push(withArray ? arrayPattern(Lw, dw, delta, PI / 2, ph) : Math.abs(dipolePattern(Lw, PI / 2))); }
  const m = Math.max(...E, ...Hc) || 1;
  return { E: E.map((v) => v / m), H: Hc.map((v) => v / m) };
}

/** Classic two-element configurations. */
export const ARRAY_PRESETS = {
  'Broadside (d = λ/2, δ = 0)': { d: 0.5, delta: 0 },
  'End-fire (d = λ/4, δ = −90°)': { d: 0.25, delta: -PI / 2 },
  'End-fire, other way (d = λ/4, δ = +90°)': { d: 0.25, delta: PI / 2 },
  'Grating lobes (d = λ, δ = 0)': { d: 1, delta: 0 },
  'Single element (d = 0)': { d: 0, delta: 0 },
};
