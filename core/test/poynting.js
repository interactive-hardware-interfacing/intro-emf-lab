// Energy flow: the Poynting flux through the side of a resistor is I²R; through the rim of a
// charging capacitor it is d(½CV²)/dt; both inward; the displacement current equals the lead
// current; H is continuous at the surface.
import { PI, EPS0 } from '../constants.js';
import { resistor, resistorFields, capacitor, capacitorFields, powerWithin } from '../poynting.js';

export function poyntingChecks(check) {
  const rp = { I: 2, a: 1e-3, L: 0.02, sigma: 1e5 }, r = resistor(rp);
  check('poynting resistor: R = L/(πa²σ) = 63.7 mΩ', r.R, 0.02 / (PI * 1e-6 * 1e5), 1e-12);
  check('poynting resistor: side flux = I²R', r.Pside, r.PJoule, 1e-12);
  check('poynting resistor: S points inward (S_r < 0) inside', resistorFields(rp, 0.5e-3, 0).Sr < 0 ? 1 : 0, 1, 0);
  check('poynting resistor: H_φ continuous at the surface', resistorFields(rp, 1e-3 * (1 - 1e-9), 0).Hphi, resistorFields(rp, 1e-3 * (1 + 1e-9), 0).Hphi, 1e-6);
  check('poynting resistor: H_φ = I/2πa at the surface', resistorFields(rp, 1e-3, 0).Hphi, 2 / (2 * PI * 1e-3), 1e-12);
  check('poynting resistor: E uniform inside, J = σE = I/πa²', resistorFields(rp, 0.3e-3, 0.005).Ez * 1e5, 2 / (PI * 1e-6), 1e-12);
  check('poynting resistor: outside the body E = 0 in this model', resistorFields(rp, 2e-3, 0).Ez, 0, 0);
  check('poynting resistor: power within radius r grows as r² (half radius → ¼)', powerWithin('resistor', rp, 0.5e-3), 0.25 * r.PJoule, 1e-12);
  check('poynting resistor: power within a = I²R', powerWithin('resistor', rp, 1e-3), r.PJoule, 1e-12);
  const cp = { a: 0.02, g: 1e-3, V: 10, dVdt: 1e6 }, c = capacitor(cp);
  check('poynting capacitor: C = ε₀πa²/g = 11.1 pF', c.C, (EPS0 * PI * 4e-4) / 1e-3, 1e-12);
  check('poynting capacitor: rim flux = d(½CV²)/dt = C V dV/dt', c.Prim, c.dWdt, 1e-12);
  check('poynting capacitor: displacement current = C dV/dt (the lead current)', c.Id, c.C * 1e6, 1e-12);
  check('poynting capacitor: S inward', capacitorFields(cp, 0.01, 0).Sr < 0 ? 1 : 0, 1, 0);
  check('poynting capacitor: H_φ ∝ r (half radius → half)', capacitorFields(cp, 0.01, 0).Hphi, 0.5 * capacitorFields(cp, 0.02, 0).Hphi, 1e-12);
  check('poynting capacitor: Ampère–Maxwell on a loop of radius r: 2πr H = ε₀ πr² dE/dt', 2 * PI * 0.01 * capacitorFields(cp, 0.01, 0).Hphi, EPS0 * PI * 1e-4 * (1e6 / 1e-3), 1e-12);
  check('poynting capacitor: power within radius r ∝ r²', powerWithin('capacitor', cp, 0.01), 0.25 * c.dWdt, 1e-12);
  check('poynting capacitor: stored energy ½CV²', c.W, 0.5 * c.C * 100, 1e-12);
}
