// Faraday's law in the four textbook settings, as pure functions of time:
//   bar        a conducting bar sliding on rails through a region of uniform B (motional EMF),
//              driven at constant speed or coasting under its own magnetic braking
//   loop       a rectangular loop carried at constant speed through a region of uniform B
//   field      a stationary loop in a uniform B(t): sinusoid, ramp or pulse
//   generator  a loop of N turns rotating at ω in uniform B
// Each state function returns the flux Φ, the EMF = −dΦ/dt (analytic), the current through
// the resistance R, the force or torque the field exerts (always opposing the change, Lenz),
// and the mechanical and electrical powers, which must balance.
//
// Geometry (bar and loop): x along the rails or the motion; the field region is 0 ≤ x ≤ W,
// B points into the page (−z) when B > 0 and the flux is counted with the normal into the
// page, so Φ ≥ 0 while the circuit overlaps the region. A positive EMF drives a
// counter-clockwise current seen from above (the right-hand rule on that normal).

import { PI } from './constants.js';

/** Length of the overlap of [a0, a1] with [b0, b1]. */
export function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

/**
 * Sliding bar. p = { B, W, l, R, v0, x0, mode: 'drive' | 'coast', m }
 * The circuit is the rails from the resistor at x = 0 out to the bar at x(t); its area is l·x
 * and the flux is B l times the part of [0, x] inside the field region.
 * Coasting: m dv/dt = −B² l² v / R while the bar is in the field, so v decays with τ = mR/(B² l²).
 */
export function barState(p, t) {
  const { B, W, l, R, v0, x0 = 0, mode = 'drive', m = 0.1 } = p;
  let x, v;
  if (mode === 'drive' || B === 0) { v = v0; x = x0 + v0 * t; }
  else {
    // piecewise: constant speed outside the region, exponential decay inside
    const tau = (m * R) / (B * B * l * l);
    x = x0; v = v0; let tt = t;
    // march in closed form through the three stretches (before, inside, after); x0 < W assumed
    if (x < 0 && v > 0) { const tIn = -x / v; if (tt <= tIn) return finishBar(p, x + v * tt, v, 0, 0); x = 0; tt -= tIn; }
    if (x >= 0 && x <= W && v > 0) {
      // x(t) = x + v tau (1 − e^{−t/τ}); it may never reach W
      const xInf = x + v * tau;
      if (xInf <= W) { const xx = x + v * tau * (1 - Math.exp(-tt / tau)); return finishBar(p, xx, v * Math.exp(-tt / tau), tau, 1); }
      const tOut = -tau * Math.log(1 - (W - x) / (v * tau));
      if (tt <= tOut) { const xx = x + v * tau * (1 - Math.exp(-tt / tau)); return finishBar(p, xx, v * Math.exp(-tt / tau), tau, 1); }
      v *= Math.exp(-tOut / tau); x = W; tt -= tOut;
    }
    return finishBar(p, x + v * tt, v, 0, 0);
  }
  return finishBar(p, x, v, 0, 0);
}

function finishBar(p, x, v, tau, inside) {
  const { B, W, l, R } = p;
  const inField = x > 0 && x < W ? 1 : 0;
  const Phi = B * l * overlap(0, x, 0, W);
  const emf = -B * l * v * inField;
  const I = emf / R;
  const F = -(B * B * l * l * v * inField) / R;      // on the bar, along x: opposes v
  return { x, v, Phi, emf, I, F, Pelec: (emf * emf) / R, Pmech: -F * v, inField: !!inField, tau: inside ? tau : 0 };
}

/** Rectangular loop w × h carried at speed v along x; its centre at x0 + v t. p = { B, W, w, h, R, v, x0 } */
export function loopState(p, t) {
  const { B, W, w, h, R, v, x0 } = p;
  const x = x0 + v * t, a0 = x - w / 2, a1 = x + w / 2;
  const Phi = B * h * overlap(a0, a1, 0, W);
  // dΦ/dt: the leading edge entering adds flux, the trailing edge leaving removes it
  const lead = a1 > 0 && a1 < W ? 1 : 0, trail = a0 > 0 && a0 < W ? 1 : 0;
  const dPhi = B * h * v * (lead - trail);
  const emf = -dPhi, I = emf / R;
  const F = -(B * B * h * h * v * (lead - trail) * (lead - trail)) / R; // only an edge inside the field feels a force; both inside: no net flux change, no force
  return { x, v, Phi, emf, I, F, Pelec: (emf * emf) / R, Pmech: -F * v, edges: { lead: !!lead, trail: !!trail } };
}

/** Uniform B(t) through a stationary loop of area A: 'sine' B0 sin 2πft, 'ramp' B0 + rate·t, 'pulse' B0 (1 − e^{−t/τ}). */
export function fieldB(p, t) {
  const { wave = 'sine', B0, f = 50, rate = 1, tau = 0.01 } = p;
  if (wave === 'sine') return { B: B0 * Math.sin(2 * PI * f * t), dB: 2 * PI * f * B0 * Math.cos(2 * PI * f * t) };
  if (wave === 'ramp') return { B: B0 + rate * t, dB: rate };
  return { B: B0 * (1 - Math.exp(-t / tau)), dB: (B0 / tau) * Math.exp(-t / tau) };
}
export function fieldState(p, t) {
  const { A, N = 1, R } = p, { B, dB } = fieldB(p, t);
  const Phi = N * B * A, emf = -N * A * dB, I = emf / R;
  return { B, dB, Phi, emf, I, Pelec: (emf * emf) / R };
}

/** Generator: N turns of area A rotating at ω in uniform B, θ = ω t + θ0 between the normal and B. p = { B, A, N, R, omega, theta0 } */
export function generatorState(p, t) {
  const { B, A, N, R, omega, theta0 = 0 } = p;
  const th = omega * t + theta0;
  const Phi = N * B * A * Math.cos(th), emf = N * B * A * omega * Math.sin(th), I = emf / R;
  const torque = -N * I * A * B * Math.sin(th);      // opposes the rotation (Lenz)
  return { theta: th, Phi, emf, I, torque, Pelec: (emf * emf) / R, Pmech: -torque * omega, emfPeak: N * B * A * omega, emfRms: (N * B * A * omega) / Math.SQRT2 };
}

/** Central-difference −dΦ/dt from a state function, to check the analytic EMF. */
export function numericEmf(stateFn, t, h = 1e-6) { return -(stateFn(t + h).Phi - stateFn(t - h).Phi) / (2 * h); }
