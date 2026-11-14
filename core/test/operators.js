// Operator checks: closed-form div and curl of every field against central differences, the
// box flux and loop circulation against div·area and curl·area (exact for linear fields,
// converging for the others), and the delta-function sources: 2π through any box around the
// line source, 2π around any loop enclosing the vortex, zero otherwise.
import { PI } from '../constants.js';
import { FIELDS, fieldAt, divAt, curlAt, boxFlux, loopCirculation, numericDivCurl } from '../operators.js';

export function operatorChecks(check) {
  const k = { a: 1, b: 0.5, c: 0.2, d: -0.7, e: 2, f: 0 };
  for (const kind of Object.keys(FIELDS)) {
    const [x, y] = [0.6, -0.35];
    const num = numericDivCurl(kind, k, x, y);
    const scale = Math.hypot(...fieldAt(kind, x, y, k)) + 1;
    check(`operators ${kind}: closed-form div matches central differences (1e-6 of |F| + 1)`, Math.abs(divAt(kind, x, y, k) - num.div) < 1e-6 * scale ? 1 : 0, 1, 0);
    check(`operators ${kind}: closed-form curl matches central differences (1e-6 of |F| + 1)`, Math.abs(curlAt(kind, x, y, k) - num.curl) < 1e-6 * scale ? 1 : 0, 1, 0);
  }
  // linear: exact at any size
  for (const s of [1, 0.3, 0.05]) {
    const bx = boxFlux('linear', k, 0.3, -0.2, s), lp = loopCirculation('linear', k, 0.3, -0.2, s / 2);
    check(`operators linear: flux/area = a + e for a box of side ${s}`, bx.flux / bx.area, k.a + k.e, 1e-12);
    check(`operators linear: circulation/area = d − b for a loop of diameter ${s}`, lp.circ / lp.area, k.d - k.b, 1e-10);
  }
  // nonlinear: converges
  const conv = (kind, x, y) => [1, 0.5, 0.25].map((s) => Math.abs(boxFlux(kind, k, x, y, s).flux / (s * s) - divAt(kind, x, y, k)));
  const e = conv('hill', 0.4, 0.2);
  check('operators hill: box flux/area converges to div as the box shrinks', e[0] > e[1] && e[1] > e[2] ? 1 : 0, 1, 0);
  check('operators hill: within 2 % at side 0.25', e[2] / Math.abs(divAt('hill', 0.4, 0.2, k)), 0, 2e-2);
  const cl = [1, 0.5, 0.25].map((s) => Math.abs(loopCirculation('swirl', k, 0.4, 0.2, s / 2).circ / (PI * s * s / 4) - curlAt('swirl', 0.4, 0.2, k)));
  check('operators swirl: loop circulation/area converges to curl', cl[0] > cl[1] && cl[1] > cl[2] ? 1 : 0, 1, 0);
  check('operators swirl: curl 2 at the centre', curlAt('swirl', 0, 0, k), 2, 1e-12);
  check('operators swirl: curl changes sign at r = 1', curlAt('swirl', 1, 0, k), 0, 1e-12);
  check('operators hill: div 4 at the top', divAt('hill', 0, 0, k), 4, 1e-12);
  // delta functions
  check('operators source: flux through a box around the origin is 2π (1e-4, midpoint rule near the singularity)', boxFlux('source', k, 0.1, 0.05, 0.5).flux, 2 * PI, 1e-4);
  check('operators source: flux through an off-centre box around the origin is still 2π', boxFlux('source', k, 0.2, -0.15, 0.6).flux, 2 * PI, 1e-4);
  check('operators source: a box that misses the origin reads ~0 (1e-4 relative to 2π)', Math.abs(boxFlux('source', k, 0.5, 0.5, 0.3).flux) / (2 * PI), 0, 1e-4);
  check('operators source: curl is zero everywhere', loopCirculation('source', k, 0.1, 0.05, 0.3).circ, 0, 1e-9);
  check('operators vortex: circulation around the origin is 2π (1e-9)', loopCirculation('vortex', k, 0.05, 0.1, 0.25).circ, 2 * PI, 1e-9);
  check('operators vortex: circulation of a loop that misses the origin is ~0', Math.abs(loopCirculation('vortex', k, 0.6, 0.4, 0.2).circ) / (2 * PI), 0, 1e-6);
  check('operators vortex: flux is zero (1e-5 of 2π)', Math.abs(boxFlux('vortex', k, 0.05, 0.1, 0.5).flux) < 1e-5 * 2 * PI ? 1 : 0, 1, 0);
  check('operators dipole: both zero away from the origin (1e-5)', Math.abs(boxFlux('dipole', k, 0.6, 0.3, 0.2).flux) + Math.abs(loopCirculation('dipole', k, 0.6, 0.3, 0.1).circ) < 1e-5 ? 1 : 0, 1, 0);
  check('operators fieldAt: linear field value', fieldAt('linear', 1, 2, k)[0], k.a * 1 + k.b * 2 + k.c, 1e-15);
}
