// Eddy-current (quasi-static) checks: the complex axisymmetric diffusion solver against the
// exact long-cylinder solution, and the two routes to the eddy loss against each other.
import { AxisymMag } from '../axisym.js';
import { AxisymEddy, cylinderFieldRatio } from '../eddy.js';

const MU0 = 4e-7 * Math.PI;

export function eddyChecks(check) {
  // 1. Long copper cylinder (a = 10 mm) inside a long solenoid (sheet at 20 mm), Neumann ends
  //    so the field is z-uniform. Outside the rod the field is unaffected (the eddy currents
  //    are circumferential and act only inside), so B(r)/B_gap must equal J0(alpha r)/J0(alpha a).
  {
    const h = 0.25e-3, Rw = 40e-3, Rc = 20e-3, a = 10e-3, sigma = 5.8e7, nr = Math.round(Rw / h) + 1, nz = 7;
    // At 1 kHz the interior field is 5% of the surface value and first-order errors over the
    // 8 cells per skin depth show up as a few percent of that small number.
    for (const [f, tol] of [[100, 0.015], [1000, 0.07]]) {
      const omega = 2 * Math.PI * f;
      const mag = new AxisymMag(nr, nz, { h, z0: 0, boundary: { zmin: 'neumann', zmax: 'neumann' } });
      mag.jWhere((r) => Math.abs(r - Rc) < h / 4, 1000 / h);
      const s = AxisymEddy.fromMag(mag, { omega, sigmaAt: (r) => (r <= a + h / 4 ? sigma : 0) });
      s.solve(1e-13 * MU0 * 1000 * Rc, 5e6, 200);
      const delta = s.skinDepth(sigma);
      const [, bzr, , bzi] = s.Bc();
      const j = 3, ig = Math.round(15e-3 / h);
      const gr = bzr.get(ig, j), gi = bzi.get(ig, j), g2 = gr * gr + gi * gi;
      for (const r of [0, 5e-3]) {
        const i = Math.round(r / h);
        // complex ratio B(r)/B_gap
        const br = bzr.get(i, j), bi = bzi.get(i, j);
        const rr = (br * gr + bi * gi) / g2, ri = (bi * gr - br * gi) / g2;
        const [er, ei] = cylinderFieldRatio(r, a, delta);
        check(`eddy: copper rod at ${f} Hz (a/delta = ${(a / delta).toFixed(2)}), |B(${r * 1e3} mm)/B_gap| vs Bessel`, Math.hypot(rr, ri), Math.hypot(er, ei), tol);
        check(`eddy: copper rod at ${f} Hz, phase lag at r = ${r * 1e3} mm vs Bessel (deg)`, Math.atan2(ri, rr) * 180 / Math.PI, Math.atan2(ei, er) * 180 / Math.PI, 0.03);
      }
      const P = s.power().total, Z = s.impedance(1);
      // P = R I^2 / 2 is an exact discrete identity (sum psi* x equation), so at a tight tolerance
      // it must hold to round-off; a loose agreement only measures convergence.
      check(`eddy: ${f} Hz, eddy power = R_eddy I^2 / 2 (discrete identity, 1e-6 at this tolerance)`, P, Z.Pcoil, 1e-6);
      mag.solve(1e-9 * MU0 * 1000 * Rc, 5e6, 200);
      check(`eddy: ${f} Hz, R_eddy > 0 and L below the static value`, Z.R > 0 && Z.L < 2 * mag.energyJA() ? 1 : 0, 1, 0);
    }
  }
  // 2. No conductivity: the complex solver reproduces the magnetostatic one exactly.
  {
    const mag = new AxisymMag(41, 41, { h: 1e-3, z0: -20e-3 });
    mag.jWhere((r, z) => Math.abs(r - 10e-3) < 0.6e-3 && Math.abs(z) < 5e-3, 1e6);
    mag.solve(1e-13, 1e6, 100);
    const s = AxisymEddy.fromMag(mag, { omega: 2 * Math.PI * 1e3 }); s.reset(); s.solve(1e-13, 1e6, 100);
    let d = 0; for (let k = 0; k < s.V.length; k++) d = Math.max(d, Math.abs(s.V[k] - mag.V[k]), Math.abs(s.Vi[k]));
    check('eddy: with sigma = 0 the complex solver equals AxisymMag (max |diff| 1e-12 of peak)', d / Math.max(...mag.V.map(Math.abs)) < 1e-9 ? 1 : 0, 1, 0);
    check('eddy: with sigma = 0, R_eddy = 0', s.impedance(1).R, 0, 1e-15);
  }
  // 3. Skin depth formula and the Bessel reference's limits
  {
    const s = new AxisymEddy(5, 5, { h: 1e-3, omega: 2 * Math.PI * 1e3 });
    check('eddy: skin depth of copper at 1 kHz = 2.09 mm', s.skinDepth(5.8e7), 2.0898e-3, 1e-3);
    const [r0, i0] = cylinderFieldRatio(0, 1e-2, 1); // delta >> a: no shielding
    check('eddy: Bessel ratio -> 1 when delta >> a', Math.hypot(r0, i0), 1, 1e-3);
    const [rs] = cylinderFieldRatio(1e-2, 1e-2, 1e-3);
    check('eddy: Bessel ratio = 1 at the surface', rs, 1, 1e-12);
  }
}
