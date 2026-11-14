// Waves on a lossless transmission line: the sinusoidal steady state (reflection coefficient,
// VSWR, standing-wave envelopes, input impedance, the voltage at any point and time with its
// forward and reflected parts) and the step transient (bounce diagram, V(z, t) snapshots, the
// staircase at the load). Complex numbers are [re, im]. Distances d are measured from the
// load toward the generator; z = l − d from the generator.

import { PI } from './constants.js';

export const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
export const cabs = (a) => Math.hypot(a[0], a[1]);
export const carg = (a) => Math.atan2(a[1], a[0]);
export const cexp = (th) => [Math.cos(th), Math.sin(th)];

/** Load impedance for the tab's load kinds at angular frequency w: 'R', 'open', 'short', 'matched', 'RL' (series), 'RC' (series). */
export function loadZ({ kind, R = 50, L = 0, C = 1e-9, Z0 = 50 }, w) {
  switch (kind) {
    case 'open': return [Infinity, 0];
    case 'short': return [0, 0];
    case 'matched': return [Z0, 0];
    case 'RL': return [R, w * L];
    case 'RC': return [R, -1 / (w * C)];
    default: return [R, 0];
  }
}

/** Γ = (Z_L − Z0) / (Z_L + Z0); an open gives +1, a short −1. */
export function gamma(ZL, Z0) {
  if (!Number.isFinite(ZL[0])) return [1, 0];
  return cdiv(csub(ZL, [Z0, 0]), cadd(ZL, [Z0, 0]));
}
export function vswr(G) { const g = cabs(G); return g >= 1 ? Infinity : (1 + g) / (1 - g); }
export function returnLossDb(G) { const g = cabs(G); return g > 0 ? -20 * Math.log10(g) : Infinity; }

/** Γ seen at distance d from the load: Γ_L e^{−2jβd}. */
export function gammaAt(GL, beta, d) { return cmul(GL, cexp(-2 * beta * d)); }

/** Input impedance at distance d from the load: Z0 (1 + Γ(d)) / (1 − Γ(d)). */
export function zin(ZL, Z0, beta, d) {
  const Gd = gammaAt(gamma(ZL, Z0), beta, d);
  const den = csub([1, 0], Gd);
  if (cabs(den) < 1e-15) return [Infinity, 0];
  return cmul([Z0, 0], cdiv(cadd([1, 0], Gd), den));
}

/**
 * Sinusoidal steady state on a line of length l driven by Vs (phasor amplitude) through Rs.
 * Returns the forward amplitude V+ (phasor at the load), Γ_L, Z_in at the generator, V_in,
 * and functions V(d), I(d) (phasors) plus the envelopes.
 */
export function steadyState({ Vs, Rs, Z0, beta, l, ZL }) {
  const GL = gamma(ZL, Z0);
  const Zin = zin(ZL, Z0, beta, l);
  // V(d) = V+ (e^{jβd} + Γ_L e^{−jβd}), I(d) = (V+/Z0)(e^{jβd} − Γ_L e^{−jβd}); at the generator
  // Vs = V(l) + Rs I(l), so V+ = Vs / (A + (Rs/Z0) B) with A, B the two brackets at d = l. This
  // stays finite where Z_in is 0 or ∞ (an open λ/4 line, a shorted λ/2 line), where dividing
  // V_in by A would be 0/0.
  const A = cadd(cexp(beta * l), cmul(GL, cexp(-beta * l))), Bq = csub(cexp(beta * l), cmul(GL, cexp(-beta * l)));
  const Vp = cdiv([Vs, 0], cadd(A, cmul([Rs / Z0, 0], Bq)));
  const Vin = cmul(Vp, A);
  const V = (d) => cmul(Vp, cadd(cexp(beta * d), cmul(GL, cexp(-beta * d))));
  const Ifn = (d) => { const f = cmul(Vp, cexp(beta * d)), r = cmul(cmul(Vp, GL), cexp(-beta * d)); return [(f[0] - r[0]) / Z0, (f[1] - r[1]) / Z0]; };
  const Iin = Ifn(l);
  const Pin = 0.5 * (Vin[0] * Iin[0] + Vin[1] * Iin[1]);  // Re(V I*) / 2
  const Pfwd = (0.5 * cabs(Vp) * cabs(Vp)) / Z0, Pref = Pfwd * cabs(GL) * cabs(GL);
  return { GL, Zin, Vin, Vp, V, I: Ifn, vswr: vswr(GL), Pin, Pfwd, Pref, PL: Pfwd - Pref, lambda: (2 * PI) / beta };
}

/** Instantaneous voltage at distance d and time t, with its forward and reflected parts. */
export function instantaneous(ss, beta, w, d, t) {
  const ph = cexp(w * t);
  const f = cmul(cmul(ss.Vp, cexp(beta * d)), ph), r = cmul(cmul(cmul(ss.Vp, ss.GL), cexp(-beta * d)), ph);
  return { fwd: f[0], ref: r[0], total: f[0] + r[0] };
}

/** Positions of the first voltage maximum and minimum from the load (d ≥ 0). */
export function extrema(GL, beta) {
  const th = carg(GL), lam = (2 * PI) / beta;
  let dmax = (th / (2 * beta)); while (dmax < 0) dmax += lam / 2;
  let dmin = dmax + lam / 4; while (dmin >= lam / 2) dmin -= lam / 2; while (dmin < 0) dmin += lam / 2;
  return { dmax, dmin };
}

// ---------------------------------------------------------------- transient (step through Rs into a line terminated by RL)

/** The step problem's constants: one-way delay, the first forward step, the two reflection coefficients, the final value. */
export function stepSetup({ Vs, Rs, Z0, RL, l, v }) {
  const T = l / v;
  const V1 = (Vs * Z0) / (Rs + Z0);
  const GL = Number.isFinite(RL) ? (RL - Z0) / (RL + Z0) : 1, Gs = (Rs - Z0) / (Rs + Z0);
  const Vfinal = Number.isFinite(RL) ? (Vs * RL) / (Rs + RL) : Vs;
  return { T, V1, GL, Gs, Vfinal, Ifinal: Number.isFinite(RL) ? Vfinal / RL : 0 };
}

/**
 * The bounce diagram as a list of waves: { k, dir: +1 (toward the load) | −1, amp, t0 } where the
 * wave front starts at t0 from z = 0 (dir +1) or z = l (dir −1). `n` round trips.
 */
export function bounces(setup, n = 8) {
  const { T, V1, GL, Gs } = setup, out = [];
  let amp = V1, t0 = 0;
  for (let k = 0; k < 2 * n; k++) {
    out.push({ k, dir: k % 2 === 0 ? 1 : -1, amp, t0 });
    amp *= k % 2 === 0 ? GL : Gs;
    t0 += T;
    if (Math.abs(amp) < 1e-12 * Math.abs(V1)) break;
  }
  return out;
}

/** Voltage at position z (0 = generator, l = load) and time t, summing the step waves that have passed z. For a pulse of width tp, subtract the same at t − tp. */
export function stepV(setup, waves, l, z, t, tp = 0) {
  const one = (tt) => { let V = 0; for (const w of waves) { const arrive = w.t0 + (w.dir > 0 ? z : l - z) / (l / setup.T); if (tt >= arrive) V += w.amp; } return V; };
  return tp > 0 ? one(t) - one(t - tp) : one(t);
}
export function stepI(setup, waves, l, z, t, Z0, tp = 0) {
  const one = (tt) => { let I = 0; for (const w of waves) { const arrive = w.t0 + (w.dir > 0 ? z : l - z) / (l / setup.T); if (tt >= arrive) I += (w.dir * w.amp) / Z0; } return I; };
  return tp > 0 ? one(t) - one(t - tp) : one(t);
}
