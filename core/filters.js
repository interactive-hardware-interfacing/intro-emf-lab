// RC and series-RLC filters (Capacitors handout §6): transfer functions, the resonance
// numbers, steady-state sinusoidal response with the element energies, step responses in
// closed form, and the impedance of a real capacitor (ESR, ESL). Pure functions; the
// Filters tab draws them.
//
// Circuits: 'rc' is R and C in series across the source; 'rlc' is R, L and C in series.
// The output is taken across one element: 'C' (low-pass), 'R' (high-pass for RC, band-pass
// for RLC), 'L' (high-pass), 'LC' (band-stop; RLC only). Complex numbers are [re, im].

import { PI } from './constants.js';

const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cabs = (a) => Math.hypot(a[0], a[1]);
const carg = (a) => Math.atan2(a[1], a[0]);

/** Element impedances at ω: Z_R = R, Z_L = jωL, Z_C = 1/jωC. */
export function impedances({ R, L = 0, C }, w) {
  return { R: [R, 0], L: [0, w * L], C: [0, -1 / (w * C)] };
}

/** H(jω) = V_out / V_in for the circuit and output. Returns [re, im]. */
export function transfer({ circuit, output, R, L = 0, C }, w) {
  const Z = impedances({ R, L, C }, w);
  const Ztot = circuit === 'rc' ? [Z.R[0] + Z.C[0], Z.R[1] + Z.C[1]] : [Z.R[0], Z.L[1] + Z.C[1]];
  let Zout;
  if (output === 'C') Zout = Z.C; else if (output === 'R') Zout = Z.R; else if (output === 'L') Zout = Z.L; else Zout = [0, Z.L[1] + Z.C[1]];
  return cdiv(Zout, Ztot);
}

export function gainDb(H) { return 20 * Math.log10(Math.max(cabs(H), 1e-300)); }
export function phaseDeg(H) { return (carg(H) * 180) / PI; }

/** The characteristic numbers of the circuit. */
export function characteristics({ circuit, R, L = 0, C }) {
  if (circuit === 'rc') {
    const tau = R * C, wc = 1 / tau;
    return { tau, wc, fc: wc / (2 * PI) };
  }
  const w0 = 1 / Math.sqrt(L * C), Q = (w0 * L) / R, B = R / L, zeta = 1 / (2 * Q);
  const root = Math.sqrt(1 + 1 / (4 * Q * Q));
  const w1 = w0 * (root - 1 / (2 * Q)), w2 = w0 * (root + 1 / (2 * Q));
  return { w0, f0: w0 / (2 * PI), Q, B, fB: B / (2 * PI), zeta, w1, w2, f1: w1 / (2 * PI), f2: w2 / (2 * PI), damping: zeta < 1 ? 'underdamped (rings)' : zeta === 1 ? 'critically damped' : 'overdamped' };
}

/**
 * Steady state at drive ω with input amplitude V: the phasors of the current and of every
 * element voltage, and time samples over `cycles` periods of v_in, v_out, i, v_C, v_L, and
 * the energies ½C v_C² and ½L i². Phasors are amplitudes and phases (radians) of cosines.
 */
export function steadyState(p, w, V, { n = 400, cycles = 3 } = {}) {
  const Z = impedances(p, w);
  const Ztot = p.circuit === 'rc' ? [Z.R[0] + Z.C[0], Z.R[1] + Z.C[1]] : [Z.R[0], Z.L[1] + Z.C[1]];
  const I = cdiv([V, 0], Ztot);
  const vC = cmul(I, Z.C), vR = cmul(I, Z.R), vL = p.circuit === 'rc' ? [0, 0] : cmul(I, Z.L);
  const H = transfer(p, w);
  const Tp = (2 * PI) / w, t = [], out = { vin: [], vout: [], i: [], vC: [], vL: [], vR: [], wC: [], wL: [] };
  const cosAt = (ph, tt) => cabs(ph) * Math.cos(w * tt + carg(ph));
  for (let k = 0; k < n; k++) {
    const tt = (cycles * Tp * k) / (n - 1); t.push(tt);
    out.vin.push(V * Math.cos(w * tt)); out.vout.push(V * cosAt(H, tt));
    const ii = cosAt(I, tt), vc = cosAt(vC, tt);
    out.i.push(ii); out.vC.push(vc); out.vL.push(cosAt(vL, tt)); out.vR.push(cosAt(vR, tt));
    out.wC.push(0.5 * p.C * vc * vc); out.wL.push(0.5 * (p.L ?? 0) * ii * ii);
  }
  return { t, ...out, phasors: { I, vC, vR, vL, H }, amp: { I: cabs(I), vC: cabs(vC), vR: cabs(vR), vL: cabs(vL), out: V * cabs(H) }, phaseOut: carg(H), T: Tp, Pavg: 0.5 * cabs(I) * cabs(I) * p.R };
}

/**
 * Step response to V applied at t = 0 (zero initial conditions): v_C, i, v_L, v_R and the
 * output, sampled at the given times. Closed form for RC and for the three damping cases.
 */
export function stepResponse(p, V, times) {
  const { R, L = 0, C } = p;
  const out = { t: times, vC: [], i: [], vL: [], vR: [], vout: [] };
  for (const t of times) {
    let vC, i, di;
    if (p.circuit === 'rc') { const tau = R * C; vC = V * (1 - Math.exp(-t / tau)); i = (V / R) * Math.exp(-t / tau); di = -i / tau; }
    else {
      const w0 = 1 / Math.sqrt(L * C), a = R / (2 * L);
      if (a < w0) { const wd = Math.sqrt(w0 * w0 - a * a), e = Math.exp(-a * t); vC = V * (1 - e * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t))); i = ((V * C * w0 * w0) / wd) * e * Math.sin(wd * t); di = ((V * C * w0 * w0) / wd) * e * (wd * Math.cos(wd * t) - a * Math.sin(wd * t)); }
      else if (a === w0) { const e = Math.exp(-w0 * t); vC = V * (1 - e * (1 + w0 * t)); i = V * C * w0 * w0 * t * e; di = V * C * w0 * w0 * e * (1 - w0 * t); }
      else { const s = Math.sqrt(a * a - w0 * w0), s1 = -a + s, s2 = -a - s, d = s2 - s1; vC = V * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / d); i = (V * C * s1 * s2 * (Math.exp(s2 * t) - Math.exp(s1 * t))) / d; di = (V * C * s1 * s2 * (s2 * Math.exp(s2 * t) - s1 * Math.exp(s1 * t))) / d; }
    }
    const vL = L * di, vR = R * i;
    out.vC.push(vC); out.i.push(i); out.vL.push(vL); out.vR.push(vR);
    out.vout.push(p.output === 'C' ? vC : p.output === 'R' ? vR : p.output === 'L' ? vL : vL + vC);
  }
  return out;
}

/** |Z| of a real capacitor: ESR + jω ESL + 1/jωC, and its self-resonant frequency. */
export function realCapacitorZ({ C, esr, esl }, w) {
  const x = w * esl - 1 / (w * C);
  return Math.hypot(esr, x);
}
export function selfResonance({ C, esl }) { return 1 / (2 * PI * Math.sqrt(esl * C)); }

/** The handout's filter table at DC, ω0 and high frequency for a series RLC output. */
export function rlcLimits(output, Q) {
  switch (output) {
    case 'C': return { dc: 1, w0: Q, hf: 0, slope: '−40 dB/decade above ω₀' };
    case 'R': return { dc: 0, w0: 1, hf: 0, slope: '±20 dB/decade either side' };
    case 'L': return { dc: 0, w0: Q, hf: 1, slope: '+40 dB/decade below ω₀' };
    default: return { dc: 1, w0: 0, hf: 1, slope: 'notch width B = ω₀/Q' };
  }
}
