// Lossy transmission line: from R′, L′, G′, C′ per metre to γ = α + jβ and the complex Z₀,
// attenuation in dB, the distortionless (Heaviside) condition, the low-loss approximations,
// phase and group velocity against frequency, and the steady state on a lossy terminated line.
//   γ = √((R′ + jωL′)(G′ + jωC′)),  Z₀ = √((R′ + jωL′)/(G′ + jωC′))
//   distortionless: R′/L′ = G′/C′ → α = √(R′G′), β = ω√(L′C′), Z₀ real
//   low loss: α ≈ R′/(2 Z₀) + G′ Z₀/2
import { PI } from './constants.js';
import { cadd, csub, cmul, cdiv, cabs, carg, cexp } from './tline.js';

const csqrt = ([a, b]) => { const m = Math.hypot(a, b), re = Math.sqrt((m + a) / 2), im = (b < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (m - a) / 2)); return [re, im]; };
const cexpz = ([a, b]) => [Math.exp(a) * Math.cos(b), Math.exp(a) * Math.sin(b)];

/** γ and Z₀ at angular frequency w. */
export function lineConstants({ R = 0, L = 250e-9, G = 0, C = 100e-12 }, w) {
  const Zs = [R, w * L], Yp = [G, w * C];
  const gamma = csqrt(cmul(Zs, Yp)), Z0 = csqrt(cdiv(Zs, Yp));
  const alpha = gamma[0], beta = gamma[1];
  return { gamma, alpha, beta, Z0, alphaDb: 8.685889638 * alpha, vp: beta > 0 ? w / beta : Infinity, lam: beta > 0 ? (2 * PI) / beta : Infinity };
}

/** Low-loss approximation and the lossless reference. */
export function approximations({ R = 0, L = 250e-9, G = 0, C = 100e-12 }) {
  const Z0 = Math.sqrt(L / C);
  return { Z0, alphaLowLoss: R / (2 * Z0) + (G * Z0) / 2, distortionless: Math.abs(R * C - G * L) < 1e-12 * Math.max(R * C, G * L, 1e-30), alphaDistortionless: Math.sqrt(R * G), vLossless: 1 / Math.sqrt(L * C) };
}

/** Group velocity by a numeric derivative of β(ω). */
export function groupVelocity(p, w, h = 1e-3) {
  const b1 = lineConstants(p, w * (1 + h)).beta, b0 = lineConstants(p, w * (1 - h)).beta;
  return (2 * h * w) / (b1 - b0);
}

/** Sweep of α, β, v_p, v_g, |Z₀| over a log-spaced frequency range. */
export function sweep(p, f0, f1, n = 200) {
  const out = { f: [], alphaDb: [], vp: [], vg: [], Z0mag: [], Z0arg: [] };
  for (let k = 0; k < n; k++) { const f = f0 * Math.pow(f1 / f0, k / (n - 1)), w = 2 * PI * f, c = lineConstants(p, w); out.f.push(f); out.alphaDb.push(c.alphaDb); out.vp.push(c.vp); out.vg.push(groupVelocity(p, w)); out.Z0mag.push(cabs(c.Z0)); out.Z0arg.push(carg(c.Z0)); }
  return out;
}

/**
 * Steady state on a lossy line of length l with load ZL and source Vs, Rs:
 *   V(d) = V⁺(e^{γd} + Γ_L e^{−γd}), I(d) = (V⁺/Z₀)(e^{γd} − Γ_L e^{−γd}), d from the load.
 * V⁺ from the source loop as in the lossless case. Powers in, at the load, and lost in the line.
 */
export function steadyStateLossy({ Vs, Rs, l, ZL }, consts) {
  const { gamma, Z0 } = consts;
  const GL = Number.isFinite(ZL[0]) ? cdiv(csub(ZL, Z0), cadd(ZL, Z0)) : [1, 0];
  const e = (d) => cexpz([gamma[0] * d, gamma[1] * d]), em = (d) => cexpz([-gamma[0] * d, -gamma[1] * d]);
  const A = cadd(e(l), cmul(GL, em(l))), B = csub(e(l), cmul(GL, em(l)));
  const Vp = cdiv([Vs, 0], cadd(A, cmul(cdiv([Rs, 0], Z0), B)));
  const V = (d) => cmul(Vp, cadd(e(d), cmul(GL, em(d)))), I = (d) => cmul(cdiv(Vp, Z0), csub(e(d), cmul(GL, em(d))));
  const P = (d) => { const v = V(d), i = I(d); return 0.5 * (v[0] * i[0] + v[1] * i[1]); };
  const Zin = cdiv(V(l), I(l)), Pin = P(l), PL = P(0);
  return { GL, Vp, V, I, P, Zin, Pin, PL, Plost: Pin - PL, Gin: cmul(GL, cexpz([-2 * gamma[0] * l, -2 * gamma[1] * l])) };
}

/** Attenuation of a matched line: power ratio e^{−2αl} and in dB. */
export function matchedLoss(alpha, l) { return { ratio: Math.exp(-2 * alpha * l), dB: 8.685889638 * alpha * l }; }
