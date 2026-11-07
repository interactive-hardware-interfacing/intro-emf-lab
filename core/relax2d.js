// relax2d: the plain Gauss-Seidel neighbour-averaging solver for Laplace / Poisson in 2D.
//
//   div( eps grad V ) = -rho          (eps relative, rho in C/m^3; rho = 0 gives Laplace)
//
// This is deliberately the method students write in MATLAB for Lab 2: sweep the grid,
// replace each free cell by the weighted average of its four neighbours, repeat until the
// largest change in a sweep drops below a tolerance. No over-relaxation, no multigrid.
// relax2d.m in docs/matlab is the same loop line for line.
//
// Grid: nx by ny cells, square spacing h, indices [j * nx + i], i along x, j along y.
// Arrays:
//   V      Float64Array  potential (V)
//   fixed  Uint8Array    1 = Dirichlet cell (conductor at V[k]); 0 = free
//   eps    Float64Array  relative permittivity per cell (default 1). For the conduction
//                        flavour put sigma here instead: the equation is the same.
//   rho    Float64Array  volume charge density per cell (C/m^3), default 0
// Box boundary: 'dirichlet' (outer ring of cells held at boxV, default 0, i.e. a grounded
// box) or 'neumann' (zero normal derivative: mirror).

import { EPS0 } from './constants.js';
import { Grid2D } from './grid.js';

export class Relax2D {
  constructor(nx, ny, extent, { boundary = 'dirichlet', boxV = 0 } = {}) {
    this.nx = nx;
    this.ny = ny;
    this.extent = extent;
    this.h = (extent[1] - extent[0]) / (nx - 1);
    const hy = (extent[3] - extent[2]) / (ny - 1);
    if (Math.abs(hy - this.h) > 1e-9 * this.h) throw new Error('relax2d needs square cells: choose extent and nx, ny so dx == dy');
    this.V = new Float64Array(nx * ny);
    this.fixed = new Uint8Array(nx * ny);
    this.eps = new Float64Array(nx * ny).fill(1);
    this.rho = new Float64Array(nx * ny);
    this.delta = new Float64Array(nx * ny); // |change| per cell in the last sweep
    this.boundary = boundary;
    this.boxV = boxV;
    this.sweeps = 0;
    this.residual = Infinity;
    this.history = []; // [sweep, residual] samples
    this.applyBoundary();
  }

  x(i) { return this.extent[0] + i * this.h; }
  y(j) { return this.extent[2] + j * this.h; }
  idx(i, j) { return j * this.nx + i; }

  /** Mark the outer ring of cells fixed at boxV for a Dirichlet box. */
  applyBoundary() {
    if (this.boundary !== 'dirichlet') return;
    const { nx, ny } = this;
    for (let i = 0; i < nx; i++) { this.setFixed(i, 0, this.boxV); this.setFixed(i, ny - 1, this.boxV); }
    for (let j = 0; j < ny; j++) { this.setFixed(0, j, this.boxV); this.setFixed(nx - 1, j, this.boxV); }
  }

  setFixed(i, j, value) { const k = this.idx(i, j); this.fixed[k] = 1; this.V[k] = value; }
  setFree(i, j) { const k = this.idx(i, j); this.fixed[k] = 0; }

  /** Paint helper: apply fn(x, y) -> true over a region and mark those cells fixed at value. */
  fixWhere(fn, value) {
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) if (fn(this.x(i), this.y(j))) this.setFixed(i, j, value);
  }
  epsWhere(fn, value) {
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) if (fn(this.x(i), this.y(j))) this.eps[this.idx(i, j)] = value;
  }
  rhoWhere(fn, value) {
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) if (fn(this.x(i), this.y(j))) this.rho[this.idx(i, j)] = value;
  }

  /** Reset the free cells to an initial guess (default 0) and the iteration counters. */
  reset(guess = 0) {
    for (let k = 0; k < this.V.length; k++) if (!this.fixed[k]) this.V[k] = guess;
    this.delta.fill(0);
    this.sweeps = 0;
    this.residual = Infinity;
    this.history = [];
  }

  /**
   * One Gauss-Seidel sweep, in place, in index order. Returns max |dV| over the sweep.
   * The coefficient on each neighbour is the permittivity at the shared face, taken as
   * the harmonic mean of the two cells, so a dielectric interface is handled correctly.
   */
  sweep() {
    const { nx, ny, V, fixed, eps, rho, delta } = this;
    const fe = (ka, kb) => faceEps(eps, fixed, ka, kb);
    const h2e0 = (this.h * this.h) / EPS0;
    const neumann = this.boundary === 'neumann';
    let maxd = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (fixed[k]) { delta[k] = 0; continue; }
        const ec = eps[k];
        let num = 0, den = 0;
        // east
        if (i + 1 < nx) { const e = fe(k, k + 1); num += e * V[k + 1]; den += e; }
        else if (neumann && i > 0) { const e = fe(k, k - 1); num += e * V[k - 1]; den += e; }
        // west
        if (i > 0) { const e = fe(k, k - 1); num += e * V[k - 1]; den += e; }
        else if (neumann && i + 1 < nx) { const e = fe(k, k + 1); num += e * V[k + 1]; den += e; }
        // north
        if (j + 1 < ny) { const e = fe(k, k + nx); num += e * V[k + nx]; den += e; }
        else if (neumann && j > 0) { const e = fe(k, k - nx); num += e * V[k - nx]; den += e; }
        // south
        if (j > 0) { const e = fe(k, k - nx); num += e * V[k - nx]; den += e; }
        else if (neumann && j + 1 < ny) { const e = fe(k, k + nx); num += e * V[k + nx]; den += e; }
        if (den === 0) continue;
        const vNew = (num + rho[k] * h2e0) / den;
        const d = Math.abs(vNew - V[k]);
        delta[k] = d;
        if (d > maxd) maxd = d;
        V[k] = vNew;
      }
    }
    this.sweeps++;
    this.residual = maxd;
    return maxd;
  }

  /**
   * Generator: runs k sweeps per step and yields { sweeps, residual, converged } until the
   * residual drops below tol or maxSweeps is reached. Lets a UI animate the relaxation.
   */
  *iterate(k = 10, tol = 1e-6, maxSweeps = 200000) {
    while (this.sweeps < maxSweeps) {
      let r = Infinity;
      for (let n = 0; n < k; n++) r = this.sweep();
      this.history.push([this.sweeps, r]);
      const converged = r < tol;
      yield { sweeps: this.sweeps, residual: r, converged };
      if (converged) return;
    }
    yield { sweeps: this.sweeps, residual: this.residual, converged: false, hitMax: true };
  }

  /** Run to convergence synchronously. Returns { sweeps, residual, converged }. */
  solve(tol = 1e-6, maxSweeps = 200000, k = 50) {
    let last;
    for (const s of this.iterate(k, tol, maxSweeps)) last = s;
    return last;
  }

  // ---------------------------------------------------------------- derived quantities

  gridV() { return new Grid2D(this.nx, this.ny, this.extent, this.V); }
  gridDelta() { return new Grid2D(this.nx, this.ny, this.extent, this.delta); }

  /** E = -grad V as two grids (central differences, one-sided at edges). */
  E() { return this.gridV().negGradient(); }

  /**
   * Gauss's law on a rectangular path of cell faces: charge per unit length (C/m) enclosed
   * by the rectangle with corner cells (i0, j0) and (i1, j1) inclusive. The path runs along
   * the faces just outside those cells; E on each face is the potential difference across
   * the face divided by h, and eps at the face is the harmonic mean, so the enclosed free
   * charge is recovered exactly for the discrete solution.
   *   lambda = eps0 * sum over faces of eps_face * E_n * h
   */
  gaussCharge(i0, j0, i1, j1) {
    const { nx, ny, V, eps, fixed } = this;
    const fe = (a, b) => faceEps(eps, fixed, a, b);
    const ia = Math.max(0, Math.min(i0, i1)), ib = Math.min(nx - 1, Math.max(i0, i1));
    const ja = Math.max(0, Math.min(j0, j1)), jb = Math.min(ny - 1, Math.max(j0, j1));
    i0 = ia; i1 = ib; j0 = ja; j1 = jb;
    let flux = 0; // sum of eps_r * E_n * h  (units V)
    // east face of column i1 (outward normal +x): E_n = -(V[i1+1] - V[i1]) / h
    if (i1 + 1 < nx) for (let j = j0; j <= j1; j++) { const k = this.idx(i1, j); flux += fe(k, k + 1) * -(V[k + 1] - V[k]); }
    // west face of column i0 (normal -x): E_n = -(V[i0-1] - V[i0]) / h
    if (i0 - 1 >= 0) for (let j = j0; j <= j1; j++) { const k = this.idx(i0, j); flux += fe(k, k - 1) * -(V[k - 1] - V[k]); }
    // north face of row j1 (normal +y)
    if (j1 + 1 < ny) for (let i = i0; i <= i1; i++) { const k = this.idx(i, j1); flux += fe(k, k + nx) * -(V[k + nx] - V[k]); }
    // south face of row j0 (normal -y)
    if (j0 - 1 >= 0) for (let i = i0; i <= i1; i++) { const k = this.idx(i, j0); flux += fe(k, k - nx) * -(V[k - nx] - V[k]); }
    // E_n = dV/h and each face has length h, so E_n * h = dV: the h's cancel and the sum of
    // face potential differences times eps0 is the charge per unit length directly.
    return EPS0 * flux;
  }

  /**
   * Electrostatic energy per unit length W = 1/2 int eps |E|^2 dA (J/m), summed over the
   * faces with the solver's own conductances (faces along the box edge count half), so
   * that 2 W = lambda V holds exactly for the discrete solution in a mirror-walled box.
   */
  energy() {
    const { nx, ny, V, eps, fixed } = this;
    const fe = (a, b) => faceEps(eps, fixed, a, b);
    let w = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = this.idx(i, j);
      if (i + 1 < nx) { const d = V[k + 1] - V[k]; w += (j === 0 || j === ny - 1 ? 0.5 : 1) * fe(k, k + 1) * d * d; }
      if (j + 1 < ny) { const d = V[k + nx] - V[k]; w += (i === 0 || i === nx - 1 ? 0.5 : 1) * fe(k, k + nx) * d * d; }
    }
    return 0.5 * EPS0 * w;
  }

  /** Potentials of all fixed cells, as a sorted list of distinct values. */
  fixedPotentials() {
    const set = new Set();
    for (let k = 0; k < this.V.length; k++) if (this.fixed[k]) set.add(this.V[k]);
    return [...set].sort((a, b) => a - b);
  }
}

/** Harmonic mean of two permittivities (the face value between two cells). */
function hm(a, b) { const s = a + b; return s === 0 ? 0 : (2 * a * b) / s; }

/**
 * Permittivity (or conductivity) on the face between cells a and b: the harmonic mean of
 * the two, except that a conductor cell takes no part, so the face next to a conductor
 * carries the dielectric's own value. (A conductor's `eps` entry is never used.)
 */
function faceEps(eps, fixed, a, b) {
  if (fixed[a] && fixed[b]) return 0;
  if (fixed[a]) return eps[b];
  if (fixed[b]) return eps[a];
  return hm(eps[a], eps[b]);
} // 0 for two insulator (sigma = 0) cells

// ---------------------------------------------------------------- Lab 2 presets

/**
 * Build a Relax2D for one of the Lab 2 geometries on a square box [-L, L]^2.
 * All lengths in metres. V0 is the potential on the right conductor; the left one is -V0
 * (the handout: "do not make the charge on the left cylinder +Q").
 */
export function lab2Preset(name, { n = 129, L = 1, d = 0.4, a = 0.12, h = 0.8, t = 0.04, side = 0.4, V0 = 1, boundary = 'dirichlet' } = {}) {
  const s = new Relax2D(n, n, [-L, L, -L, L], { boundary });
  const left = (fn) => s.fixWhere((x, y) => fn(x + d, y), -V0);
  const right = (fn) => s.fixWhere((x, y) => fn(x - d, y), +V0);
  switch (name) {
    case 'two-rods':
      left((x, y) => x * x + y * y <= a * a);
      right((x, y) => x * x + y * y <= a * a);
      break;
    case 'square-rods':
      left((x, y) => Math.abs(x) <= a && Math.abs(y) <= a);
      right((x, y) => Math.abs(x) <= a && Math.abs(y) <= a);
      break;
    case 'parallel-plates':
      left((x, y) => Math.abs(x) <= t / 2 && Math.abs(y) <= h / 2);
      right((x, y) => Math.abs(x) <= t / 2 && Math.abs(y) <= h / 2);
      break;
    case 'triangles': {
      // Equilateral triangles of side `side`, pointing at each other across the gap.
      const H = (Math.sqrt(3) / 2) * side;
      const tri = (x, y, dir) => { // dir = +1: apex points +x
        const u = dir * x; // apex at u = +H*2/3, base at u = -H/3
        if (u < -H / 3 || u > (2 * H) / 3) return false;
        const halfWidth = (side / 2) * (((2 * H) / 3 - u) / H);
        return Math.abs(y) <= halfWidth;
      };
      left((x, y) => tri(x, y, +1));
      right((x, y) => tri(x, y, -1));
      break;
    }
    case 'empty':
    default:
      break;
  }
  return s;
}
