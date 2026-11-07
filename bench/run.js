// Closed-form benchmarks for em-core. Run with `node bench/run.js` (no dependencies).
// Exits non-zero on any failure; the GitHub Action uses that to gate deployment.
//
// Each check: name, computed value, expected value, relative tolerance.
// Solver benchmarks (relax2d, axisym) are added in later phases in this same file.

import { EPS0, MU0, PI, K_E } from '../core/constants.js';
import {
  pointChargeE, pointChargeV, pointChargesField,
  lineChargeE, lineChargeV,
  ringChargeField, ringAsPointCharges, ringOnAxisEz,
  wireB, wireAz, wiresField,
  sheetB, sheetAsWiresB,
  loopOnAxisBz, longSolenoidL, nagaoka, ellipticKE,
} from '../core/analytic.js';
import { Grid2D, magnitude } from '../core/grid.js';
import { Relax2D, lab2Preset } from '../core/relax2d.js';

const results = [];
function check(name, got, want, relTol) {
  const err = want === 0 ? Math.abs(got) : Math.abs((got - want) / want);
  const pass = Number.isFinite(got) && err <= relTol;
  results.push({ name, got, want, err, relTol, pass });
}

// ---------------------------------------------------------------- constants
check('K_E = 1/(4 pi eps0)', K_E, 8.9875517923e9, 1e-9);
check('mu0 = 4 pi 1e-7 (to 1e-9)', MU0, 4 * PI * 1e-7, 1e-9);

// ---------------------------------------------------------------- point charges
{
  const q = 1e-9, r = 0.25;
  const [ex] = pointChargeE(q, [0, 0, 0], [r, 0, 0]);
  check('point charge E at r', ex, K_E * q / (r * r), 1e-12);
  check('point charge V at r', pointChargeV(q, [0, 0, 0], [0, r, 0]), K_E * q / r, 1e-12);
  // Dipole: field on the perpendicular bisector is antiparallel to p, magnitude k p / r^3
  const d = 0.01, R = 1.0;
  const f = pointChargesField([{ q, pos: [d / 2, 0, 0] }, { q: -q, pos: [-d / 2, 0, 0] }], [0, R, 0]);
  check('dipole E on bisector (far field)', f.E[0], -K_E * q * d / (R ** 3), 1e-4);
  check('dipole V on bisector = 0', f.V, 0, 1e-15);
}

// ---------------------------------------------------------------- line charges
{
  const lam = 2e-9, r = 0.3;
  const [, ey] = lineChargeE(lam, [0, 0], [0, r]);
  check('line charge E = lambda/(2 pi eps0 r)', ey, lam / (2 * PI * EPS0 * r), 1e-12);
  const v = lineChargeV(lam, [0, 0], [r, 0], 1);
  check('line charge V = -lambda/(2 pi eps0) ln r', v, -(lam / (2 * PI * EPS0)) * Math.log(r), 1e-12);
}

// ---------------------------------------------------------------- ring
{
  const lam = 3e-9, R = 0.1, z = 0.07;
  const f = ringChargeField(lam, R, [0, 0, 0], [0, 0, z]);
  check('ring on-axis Ez (200 segments) vs exact', f.E[2], ringOnAxisEz(lam, R, z), 1e-9);
  check('ring on-axis Ex/Ez = 0 by symmetry', f.E[0] / f.E[2], 0, 1e-12);
  check('ring on-axis V = kQ/sqrt(R^2+z^2)', f.V, K_E * lam * 2 * PI * R / Math.hypot(R, z), 1e-9);
  // N point charges each q with N q = lambda 2 pi R converge to the ring, in-plane, outside
  const N = 200, q = lam * 2 * PI * R / N;
  const pts = ringAsPointCharges(N, q, R, [0, 0, 0]);
  const fp = pointChargesField(pts, [0.3, 0, 0]);
  const fr = ringChargeField(lam, R, [0, 0, 0], [0.3, 0, 0], 400);
  check('200 point charges ~ ring at 3R in plane', fp.E[0], fr.E[0], 1e-6);
}

// ---------------------------------------------------------------- wires
{
  const I = 2.5, r = 0.02;
  const [bx, by] = wireB(I, [0, 0], [r, 0]);
  check('wire B = mu0 I/(2 pi r), direction phi', by, MU0 * I / (2 * PI * r), 1e-12);
  check('wire Bx on +x axis = 0', bx, 0, 1e-20);
  // A_z: B = curl A -> Bx = dAz/dy, By = -dAz/dx; check by finite difference
  const h = 1e-6;
  const dAdx = (wireAz(I, [0, 0], [r + h, 0.01]) - wireAz(I, [0, 0], [r - h, 0.01])) / (2 * h);
  const dAdy = (wireAz(I, [0, 0], [r, 0.01 + h]) - wireAz(I, [0, 0], [r, 0.01 - h])) / (2 * h);
  const [bx2, by2] = wireB(I, [0, 0], [r, 0.01]);
  check('B = curl A (By = -dAz/dx)', -dAdx, by2, 1e-6);
  check('B = curl A (Bx = dAz/dy)', dAdy, bx2, 1e-6);
  // Two antiparallel wires: field midway doubles, on the far axis cancels to leading order
  const d = 0.01;
  const two = wiresField([{ I, pos: [d / 2, 0] }, { I: -I, pos: [-d / 2, 0] }], [0, 0]);
  check('antiparallel pair at midpoint: 2 mu0 I/(2 pi (d/2))', two.B[1], -2 * MU0 * I / (2 * PI * (d / 2)), 1e-12);
}

// ---------------------------------------------------------------- sheet
{
  const K = 100, w = 0.03;
  // Wide-sheet limit: at z << w directly above centre, Bx -> mu0 K / 2
  const [bxNear] = sheetB(K, 10, 0, 1e-4);
  check('sheet near field -> mu0 K/2', bxNear, MU0 * K / 2, 1e-4);
  // Far field: a finite strip looks like a wire carrying I = K w
  const z = 5;
  const [bxFar, bzFar] = sheetB(K, w, 0, z);
  check('sheet far field -> wire with I = K w', bxFar, MU0 * K * w / (2 * PI * z), 1e-5);
  check('sheet Bz on symmetry axis = 0', bzFar, 0, 1e-20);
  // Discrete wires converge to the closed form as N grows
  const I = K * w / 400;
  const [bxD, bzD] = sheetAsWiresB(400, I, w, 0.005, 0.01);
  const [bxC, bzC] = sheetB(K, w, 0.005, 0.01);
  check('400 wires ~ sheet (Bx)', bxD, bxC, 1e-4);
  check('400 wires ~ sheet (Bz)', bzD, bzC, 1e-4);
  // Antisymmetry: Bx flips sign below the sheet
  const [bxBelow] = sheetB(K, w, 0.005, -0.01);
  check('sheet Bx antisymmetric in z', bxBelow, -bxC, 1e-12);
}

// ---------------------------------------------------------------- loops, solenoids
{
  check('loop centre Bz = mu0 I/(2R)', loopOnAxisBz(1, 0.05, 0), MU0 * 1 / (2 * 0.05), 1e-12);
  check('elliptic K(0) = pi/2', ellipticKE(0).K, PI / 2, 1e-15);
  check('elliptic E(0) = pi/2', ellipticKE(0).E, PI / 2, 1e-15);
  check('elliptic K(0.5) tabulated', ellipticKE(0.5).K, 1.6857503548125960, 1e-12);
  check('elliptic E(0.5) tabulated', ellipticKE(0.5).E, 1.4674622093394272, 1e-12);
  // Nagaoka: long coil -> 1 - (4/3pi)(d/l); known value K_N(d/l = 1) = 0.6884
  check('nagaoka long-coil limit', nagaoka(0.01, 1), 1 - (4 / (3 * PI)) * 0.01, 1e-4);
  check('nagaoka(d = l) = 0.6884', nagaoka(1, 1), 0.68842, 2e-4);
  check('nagaoka(d = 0.2 l) = 0.9201', nagaoka(0.2, 1), 0.92009, 2e-4);
  const L = longSolenoidL(100, PI * 0.01 ** 2, 0.1);
  check('long solenoid L = mu0 N^2 A/l', L, MU0 * 1e4 * PI * 1e-4 / 0.1, 1e-12);
}

// ---------------------------------------------------------------- grid
{
  const g = Grid2D.fromFunction(51, 41, [-1, 1, -0.5, 0.5], (x, y) => 2 * x + 3 * y);
  check('grid bilinear sample of a plane', g.sample(0.123, -0.217), 2 * 0.123 + 3 * -0.217, 1e-12);
  const [gx, gy] = g.gradientAt(25, 20);
  check('grid gradient dx', gx, 2, 1e-12);
  check('grid gradient dy', gy, 3, 1e-12);
  const [ex, ey] = g.negGradient();
  check('E = -grad V (x)', ex.get(10, 10), -2, 1e-12);
  check('|E| grid', magnitude(ex, ey).get(3, 3), Math.hypot(2, 3), 1e-12);
}

// ---------------------------------------------------------------- relax2d (Phase 2)
{
  // 1. Harmonic function with Dirichlet data: V = e^x cos y satisfies Laplace exactly.
  //    The 5-point stencil is second order, so the error should fall ~4x per grid doubling.
  const exact = (x, y) => Math.exp(x) * Math.cos(y);
  const errAt = (n) => {
    const s = new Relax2D(n, n, [0, 1, 0, 1], { boundary: 'dirichlet' });
    // Boundary values from the exact solution
    for (let i = 0; i < n; i++) for (const j of [0, n - 1]) s.setFixed(i, j, exact(s.x(i), s.y(j)));
    for (let j = 0; j < n; j++) for (const i of [0, n - 1]) s.setFixed(i, j, exact(s.x(i), s.y(j)));
    s.solve(1e-11, 1e6, 100);
    let e = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) e = Math.max(e, Math.abs(s.V[s.idx(i, j)] - exact(s.x(i), s.y(j))));
    return e;
  };
  const e17 = errAt(17), e33 = errAt(33), e65 = errAt(65);
  check('relax2d harmonic test, 65x65 max error < 2e-5', e65, 0, 2e-5);
  check('relax2d convergence order (17->33)', Math.log2(e17 / e33), 2, 0.05);
  check('relax2d convergence order (33->65)', Math.log2(e33 / e65), 2, 0.05);

  // 2. Parallel plates (box walls as the plates): uniform field, exact on the grid.
  {
    const n = 41;
    const s = new Relax2D(n, n, [0, 1, 0, 1], { boundary: 'neumann' });
    for (let j = 0; j < n; j++) { s.setFixed(0, j, 0); s.setFixed(n - 1, j, 10); }
    s.solve(1e-10, 1e6, 50);
    const [ex] = s.E();
    check('relax2d plates: E = V/d uniform', ex.get(20, 20), -10, 1e-6);
    check('relax2d plates: V linear', s.V[s.idx(10, 7)], 10 * s.x(10), 1e-6);
  }

  // 3. Dielectric slab between plates: D continuous, E steps by eps ratio, C in series.
  {
    const n = 41;
    const s = new Relax2D(n, n, [0, 1, 0, 1], { boundary: 'neumann' });
    for (let j = 0; j < n; j++) { s.setFixed(0, j, 0); s.setFixed(n - 1, j, 1); }
    s.epsWhere((x) => x > 0.5, 4); // right half eps_r = 4 (interface on a cell face at x=0.5125)
    s.solve(1e-11, 1e6, 50);
    const [ex] = s.E();
    const eLeft = -ex.get(10, 20), eRight = -ex.get(30, 20);
    check('relax2d slab: E ratio = eps ratio', eLeft / eRight, 4, 1e-4);
    // Gauss's law around the high-V plate recovers the exact charge of the discrete problem:
    // the 1D chain of face conductances in series, one chain per grid row.
    let inv = 0;
    for (let i = 0; i < n - 1; i++) { const a = s.eps[s.idx(i, 0)], b = s.eps[s.idx(i + 1, 0)]; inv += (a + b) / (2 * a * b); }
    const lamTheory = EPS0 * n * 1 / inv; // n rows, 1 V across the chain
    const lamGauss = s.gaussCharge(n - 1, 0, n - 1, n - 1);
    check('relax2d slab: Gauss-law charge = series-face theory', lamGauss, lamTheory, 1e-6);
  }

  // 4. Coaxial line: square box with concentric circular conductors. Approximate on a grid
  //    (staircase boundary), so loose tolerance; must improve with resolution.
  {
    const run = (n) => {
      const s = new Relax2D(n, n, [-1, 1, -1, 1], { boundary: 'dirichlet' });
      const a = 0.25, b = 0.9;
      s.fixWhere((x, y) => x * x + y * y <= a * a, 1);
      s.fixWhere((x, y) => x * x + y * y >= b * b, 0);
      s.solve(1e-9, 1e6, 100);
      const r = 0.55;
      const vNum = s.gridV().sample(r, 0);
      const vEx = Math.log(b / r) / Math.log(b / a);
      // Capacitance per unit length via Gauss (around inner conductor) and energy
      const lam = s.gaussCharge(Math.round((n - 1) * 0.3), Math.round((n - 1) * 0.3), Math.round((n - 1) * 0.7), Math.round((n - 1) * 0.7));
      const cGauss = lam / 1;
      const cEnergy = 2 * s.energy() / 1;
      const cEx = 2 * PI * EPS0 / Math.log(b / a);
      return { vErr: Math.abs(vNum - vEx) / vEx, cGauss, cEnergy, cEx };
    };
    const r81 = run(81), r161 = run(161);
    check('relax2d coax: V(r) within 2% at 161x161 (staircase circle)', r161.vErr, 0, 2e-2);
    check('relax2d coax: error shrinks with refinement', r161.vErr < r81.vErr ? 1 : 0, 1, 0);
    check('relax2d coax: C from Gauss within 2% of 2 pi eps0 / ln(b/a)', r161.cGauss, r161.cEx, 2e-2);
    check('relax2d coax: C from energy agrees with Gauss (2%)', r161.cEnergy, r161.cGauss, 2e-2);
    // Corner order must not matter (a box dragged upward or leftward)
    {
      const s = new Relax2D(81, 81, [-1, 1, -1, 1], { boundary: 'dirichlet' });
      s.fixWhere((x, y) => x * x + y * y <= 0.0625, 1); s.fixWhere((x, y) => x * x + y * y >= 0.81, 0);
      s.solve(1e-9, 1e6, 100);
      const a = s.gaussCharge(24, 24, 56, 56), b = s.gaussCharge(56, 56, 24, 24), c = s.gaussCharge(24, 56, 56, 24);
      check('relax2d gaussCharge: corner order irrelevant (reversed)', b, a, 1e-12);
      check('relax2d gaussCharge: corner order irrelevant (mixed)', c, a, 1e-12);
    }
  }

  // 5. Lab 2 parallel-plate preset: C per unit length approaches eps0 h/(2d) when the gap is
  //    small compared with the plate height (fringing adds a few percent).
  {
    const s = lab2Preset('parallel-plates', { n: 161, L: 1, d: 0.05, h: 0.8, t: 0.025, V0: 1 });
    s.solve(1e-9, 1e6, 100);
    const i0 = Math.round((s.nx - 1) * 0.5), span = Math.round(0.5 / s.h); // box taller than the plate (h/2 = 0.4)
    const lam = s.gaussCharge(i0 + 1, i0 - span, s.nx - 1 - 20, i0 + span); // box around the +V plate only
    const c2d = lam / 2; // per unit length, divided by the 2 V potential difference
    const ideal = EPS0 * 0.8 / (2 * 0.05 - 0.025); // gap between plate faces = 2d - t
    check('relax2d Lab 2 plates: C/C_ideal between 1.0 and 1.3 (fringing)', c2d / ideal > 1 && c2d / ideal < 1.3 ? 1 : 0, 1, 0);
  }
}

// ---------------------------------------------------------------- report
const failed = results.filter((r) => !r.pass);
for (const r of results) {
  const tag = r.pass ? 'ok  ' : 'FAIL';
  console.log(`${tag}  ${r.name.padEnd(52)} got ${fmt(r.got)}  want ${fmt(r.want)}  rel err ${r.err.toExponential(2)} (tol ${r.relTol})`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`\n${failed.length} benchmark(s) failed; refusing to deploy.`);
  process.exit(1);
}

function fmt(v) {
  return Number.isFinite(v) ? v.toPrecision(8).padStart(15) : String(v).padStart(15);
}
