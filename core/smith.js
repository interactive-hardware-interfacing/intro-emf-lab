// Smith chart arithmetic: normalised impedance ↔ reflection coefficient, movement along a
// lossless line, admittance, and the two classic matching recipes (quarter-wave transformer
// and single shunt stub) in closed form. Lengths are in wavelengths. Closed form.
//   Γ = (z − 1)/(z + 1),  z = (1 + Γ)/(1 − Γ),  y = 1/z,  Γ(d) = Γ_L e^{−j4πd/λ}  (toward the generator)
//   SWR = (1 + |Γ|)/(1 − |Γ|)

import { PI } from './constants.js';
import { cadd, csub, cmul, cdiv, cabs, carg, cexp } from './tline.js';

export function gammaOf(z) { return cdiv(csub(z, [1, 0]), cadd(z, [1, 0])); }
export function zOf(G) { return cdiv(cadd([1, 0], G), csub([1, 0], G)); }
export function yOf(z) { return cdiv([1, 0], z); }
export function swrOf(G) { const g = cabs(G); return g >= 1 ? Infinity : (1 + g) / (1 - g); }

/** Γ moved d wavelengths toward the generator (d > 0) or the load (d < 0). */
export function moveToward(G, dLambda) { return cmul(G, cexp(-4 * PI * dLambda)); }

/** Normalised input impedance d wavelengths from the load. */
export function zinAt(zL, dLambda) { return zOf(moveToward(gammaOf(zL), dLambda)); }

/** Positions (wavelengths from the load, in [0, ½)) of the first voltage maximum and minimum. */
export function extremaOf(G) {
  let th = carg(G); if (th < 0) th += 2 * PI;
  const dmax = th / (4 * PI);                                 // where Γ e^{−j4πd} is real positive
  const dmin = (dmax + 0.25) % 0.5;
  return { dmax, dmin };
}

/** Quarter-wave transformer: at the first V max or min the line is real, r; Z_T = Z0 √r. */
export function quarterWave(zL) {
  const G = gammaOf(zL), { dmax, dmin } = extremaOf(G);
  const out = [];
  for (const d of [dmin, dmax]) { const r = zOf(moveToward(G, d))[0]; out.push({ d, r, zT: Math.sqrt(r) }); }
  return out; // two solutions: at the first minimum (r < 1) and the first maximum (r > 1)
}

/**
 * Single shunt stub (short- or open-circuited), lossless. Move toward the generator until
 * y = 1 + jb (|Γ| circle meets g = 1), then a stub of susceptance −b. Two solutions.
 * Returns [{ d, b, stubShort, stubOpen }] with lengths in wavelengths (stub lengths in [0, ½)).
 */
export function singleStub(zL) {
  const y = yOf(zL), Gy = gammaOf(y); // the admittance chart is the impedance chart rotated by 180°: Γ_y = −Γ_z
  // on the admittance chart move toward the generator until Re(y) = 1: solve for the angle where (1 + Γ)/(1 − Γ) has real part 1.
  // |Γ|² fixed = g0. For Γ = g0 e^{jφ}: Re y = (1 − g0²)/(1 + g0² − 2 g0 cos φ) = 1 → cos φ = g0.
  const g0 = cabs(Gy), sols = [];
  if (g0 < 1e-12) return [{ d: 0, b: 0, stubShort: 0.25, stubOpen: 0 }];
  const phi0 = carg(Gy);
  for (const phi of [Math.acos(g0), -Math.acos(g0)]) {
    let d = (phi0 - phi) / (4 * PI); d = ((d % 0.5) + 0.5) % 0.5;          // toward the generator: Γ rotates clockwise (phase decreases)
    const yd = zOf(moveToward(Gy, d)), b = yd[1];                          // y = 1 + jb at distance d
    // stub susceptance needed: −b. Short stub: y_s = −j cot(βl) → −cot(βl) = −b → cot(βl) = b → l = atan(1/b)/(2π)
    // open stub: y_s = j tan(βl) → tan(βl) = −b → l = atan(−b)/(2π)
    const wrap = (l) => ((l % 0.5) + 0.5) % 0.5;
    sols.push({ d, b, stubShort: wrap(Math.atan2(1, b) / (2 * PI)), stubOpen: wrap(Math.atan2(-b, 1) / (2 * PI)) });
  }
  return sols.sort((a, b) => a.d - b.d);
}

/** Points along the chart for a constant-|Γ| circle. */
export function swrCircle(G, n = 180) { const g = cabs(G), pts = []; for (let k = 0; k <= n; k++) { const t = (2 * PI * k) / n; pts.push([g * Math.cos(t), g * Math.sin(t)]); } return pts; }

/** Chart geometry: constant-r circle centre (r/(1+r), 0), radius 1/(1+r); constant-x circle centre (1, 1/x), radius 1/|x|. */
export function rCircle(r) { return { cx: r / (1 + r), cy: 0, R: 1 / (1 + r) }; }
export function xCircle(x) { return { cx: 1, cy: 1 / x, R: 1 / Math.abs(x) }; }
