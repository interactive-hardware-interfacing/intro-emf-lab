// Energy flow in circuits: where the power actually travels. Two axisymmetric textbook cases
// in closed form on the (r, z) half-plane.
//   Resistor: a cylinder (radius a, length L, conductivity σ) carrying DC current I.
//     Inside: E = J/σ ẑ = I/(πa²σ) ẑ, H = I r/(2πa²) φ̂ → S = E × H = −(E H) r̂ : radially INWARD.
//     Power through the side surface: S(a) · 2πaL = (I/(πa²σ))(I/(2πa)) 2πaL = I² L/(πa²σ) = I²R.
//     Outside (ideal wire, no fringing): E ≈ 0 so S ≈ 0 in this simple model.
//   Charging capacitor: parallel plates, radius a, gap g, voltage V(t) rising at rate dV/dt.
//     Between the plates: E = V/g ẑ (uniform), displacement current density ε₀ dE/dt,
//     H = (ε₀ r / 2)(dE/dt) φ̂ from Ampère–Maxwell, S = −E H r̂ : inward.
//     Power through the rim: S(a) 2πa g = E (ε₀ a/2)(dE/dt) 2πa g = ε₀ πa² g E dE/dt = d/dt(½ C V²).
//   Both: the energy enters through the sides, carried by the fields, not down the wires.
import { PI, EPS0 } from './constants.js';

export function resistor({ I = 1, a = 1e-3, L = 0.02, sigma = 1e5 } = {}) {
  const R = L / (PI * a * a * sigma), E = I / (PI * a * a * sigma), Ha = I / (2 * PI * a);
  return { R, E, Ha, Sa: E * Ha, Pside: E * Ha * 2 * PI * a * L, PJoule: I * I * R, V: I * R };
}
/** Fields of the resistor at (r, z) (z along the axis, |z| ≤ L/2 inside the body). E_z, H_φ, S_r. Outside the body H continues as I/2πr, E as 0 (idealised). */
export function resistorFields(p, r, z) {
  const { I = 1, a = 1e-3, L = 0.02, sigma = 1e5 } = p, inside = r <= a && Math.abs(z) <= L / 2;
  const Hphi = r <= a ? (I * r) / (2 * PI * a * a) : I / (2 * PI * r);
  const Ez = inside ? I / (PI * a * a * sigma) : 0;
  return { Ez, Hphi, Sr: -Ez * Hphi, inside };
}

export function capacitor({ a = 0.02, g = 1e-3, V = 10, dVdt = 1e6 } = {}) {
  const C = (EPS0 * PI * a * a) / g, E = V / g, dEdt = dVdt / g, Ha = (EPS0 * a * dEdt) / 2;
  const Id = EPS0 * dEdt * PI * a * a; // total displacement current = I in the leads
  return { C, E, dEdt, Ha, Id, Sa: E * Ha, Prim: E * Ha * 2 * PI * a * g, dWdt: C * V * dVdt, W: 0.5 * C * V * V };
}
/** Fields between the plates at (r, z), |z| ≤ g/2, r ≤ a (uniform-field model; outside the gap zero). */
export function capacitorFields(p, r, z) {
  const { a = 0.02, g = 1e-3, V = 10, dVdt = 1e6 } = p, inside = r <= a && Math.abs(z) <= g / 2;
  if (!inside) return { Ez: 0, Hphi: 0, Sr: 0, Jd: 0, inside };
  const Ez = V / g, dEdt = dVdt / g, Hphi = (EPS0 * r * dEdt) / 2;
  return { Ez, Hphi, Sr: -Ez * Hphi, Jd: EPS0 * dEdt, inside };
}

/** Flux of S through a coaxial cylinder of radius r and the body's length: power entering within radius r (resistor: I²R (r/a)²; capacitor: dW/dt (r/a)²). */
export function powerWithin(kind, p, r) {
  if (kind === 'resistor') { const { L = 0.02 } = p, f = resistorFields(p, Math.min(r, p.a ?? 1e-3), 0); return -f.Sr * 2 * PI * Math.min(r, p.a ?? 1e-3) * L; }
  const { g = 1e-3 } = p, rr = Math.min(r, p.a ?? 0.02), f = capacitorFields(p, rr, 0); return -f.Sr * 2 * PI * rr * g;
}
