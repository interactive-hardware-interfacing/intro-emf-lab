// Smith chart: Γ ↔ z round trip, SWR, rotation, extrema, the chart's circle geometry, and
// both matching recipes checked by substituting the answer back (y + y_stub = 1).
import { PI } from '../constants.js';
import { cabs } from '../tline.js';
import { gammaOf, zOf, yOf, swrOf, moveToward, zinAt, extremaOf, quarterWave, singleStub, rCircle, xCircle } from '../smith.js';

export function smithChecks(check) {
  check('smith Γ: z = 1 is the centre', cabs(gammaOf([1, 0])) < 1e-15 ? 1 : 0, 1, 0);
  check('smith Γ: a short is −1', gammaOf([0, 0])[0], -1, 1e-15);
  check('smith Γ: z = 2 gives 1/3', gammaOf([2, 0])[0], 1 / 3, 1e-15);
  check('smith Γ: z = j is at the top of the rim (Γ = j)', gammaOf([0, 1])[1], 1, 1e-15);
  const z = [0.4, 0.7];
  check('smith round trip z → Γ → z (real)', zOf(gammaOf(z))[0], 0.4, 1e-14);
  check('smith round trip z → Γ → z (imag)', zOf(gammaOf(z))[1], 0.7, 1e-14);
  check('smith y: 1/(0.4 + 0.7j) = 0.615 − 1.077j', yOf(z)[1], -0.7 / (0.16 + 0.49), 1e-14);
  check('smith y: Γ_y = −Γ_z (the admittance chart is the chart turned over)', gammaOf(yOf(z))[0], -gammaOf(z)[0], 1e-14);
  check('smith SWR: z = 3 → 3', swrOf(gammaOf([3, 0])), 3, 1e-14);
  check('smith SWR: short → ∞', swrOf(gammaOf([0, 0])) === Infinity ? 1 : 0, 1, 0);
  // rotation: half a wavelength is a full turn; a quarter wavelength inverts z
  check('smith move: λ/2 brings z back', zinAt([2, 1], 0.5)[0], 2, 1e-12);
  check('smith move: λ/4 inverts (z = 2 → 0.5)', zinAt([2, 0], 0.25)[0], 0.5, 1e-12);
  check('smith move: λ/4 inverts (z = 1 + j → (1 − j)/2)', zinAt([1, 1], 0.25)[1], -0.5, 1e-12);
  check('smith move: toward the generator is clockwise (phase decreases)', (() => { const G = gammaOf([2, 1]); const a0 = Math.atan2(G[1], G[0]), G1 = moveToward(G, 0.02), a1 = Math.atan2(G1[1], G1[0]); return a1 < a0 ? 1 : 0; })(), 1, 0);
  // extrema: z = 2 (Γ real +): V max at the load (d = 0), min at λ/4
  check('smith extrema: z = 2 has its V max at the load', extremaOf(gammaOf([2, 0])).dmax, 0, 0);
  check('smith extrema: … and its min λ/4 away', extremaOf(gammaOf([2, 0])).dmin, 0.25, 1e-14);
  check('smith extrema: z = 0.5 has its V min at the load', extremaOf(gammaOf([0.5, 0])).dmin < 1e-14 ? 1 : 0, 1, 0);
  // quarter-wave transformer for z = 2: Z_T = √2 Z0 at the load, or √0.5 at λ/4
  const qw = quarterWave([2, 0]);
  check('smith λ/4 transformer: z = 2 → Z_T/Z0 = √2 at d = 0', qw.find((s) => s.d === 0).zT, Math.SQRT2, 1e-12);
  check('smith λ/4 transformer: … or √½ at d = λ/4', qw.find((s) => Math.abs(s.d - 0.25) < 1e-12).zT, Math.SQRT1_2, 1e-12);
  // single stub: z = 1.2 − 1.6j (a textbook case): d = 0.110λ and 0.260λ; substitute back
  const ss = singleStub([1.2, -1.6]);
  check('smith stub: first position 0.110 λ', ss[0].d, 0.1104, 2e-3);
  check('smith stub: second position 0.260 λ', ss[1].d, 0.2594, 2e-3);
  let worst = 0;
  for (const zL of [[1.2, -1.6], [0.3, 0.4], [3, 2], [0.1, 0], [2, -5]]) for (const s of singleStub(zL)) {
    const yd = zOf(moveToward(gammaOf(yOf(zL)), s.d));
    worst = Math.max(worst, Math.abs(yd[0] - 1), Math.abs(yd[1] + Math.tan(2 * PI * s.stubOpen)), Math.abs(yd[1] - 1 / Math.tan(2 * PI * s.stubShort)));
  }
  check('smith stub: at d the line admittance is 1 + jb and both stub types supply −jb (5 loads × 2 solutions)', worst < 1e-9 ? 1 : 0, 1, 0);
  check('smith stub: a matched load needs no stub', singleStub([1, 0])[0].d, 0, 0);
  // chart geometry
  check('smith circles: r = 1 circle centre 0.5, radius 0.5', rCircle(1).cx + rCircle(1).R, 1, 1e-15);
  check('smith circles: x = 1 circle centre (1, 1), radius 1', xCircle(1).cy, 1, 1e-15);
  check('smith circles: the r = 0 circle is the rim', rCircle(0).R, 1, 0);
}
