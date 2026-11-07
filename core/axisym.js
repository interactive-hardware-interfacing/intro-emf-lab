// axisym: the neighbour-averaging solver in cylindrical (r, z) coordinates for problems
// with rotational symmetry (disk capacitors, solenoids, round wires).
//
//   (1/r) d/dr ( r eps dV/dr ) + d/dz ( eps dV/dz ) = -rho / eps0
//
// Same loop as relax2d, with two changes:
//   1. the radial neighbours are weighted by the radius of the shared face, r +- h/2,
//      and the axial neighbours by r itself (finite-volume form of the 1/r term);
//   2. the axis r = 0 is a symmetry line: 2 d2V/dr2 + d2V/dz2, i.e. V0 = (4 VE + VN + VS)/6.
// For the conduction flavour put sigma in `eps`: the equation is identical and J = sigma E.
//
// Grid: nr by nz nodes, square spacing h, node (i, j) at r = i h, z = z0 + j h,
// index k = j * nr + i. Boundaries: rmax, zmin, zmax each 'dirichlet' (held at boxV) or
// 'neumann' (mirror). The axis is always a mirror.

import { EPS0, PI } from './constants.js';
import { Grid2D } from './grid.js';

export class Axisym {
  constructor(nr, nz, { h, z0 = 0, boundary = {}, boxV = 0 } = {}) {
    this.nr = nr;
    this.nz = nz;
    this.h = h;
    this.z0 = z0;
    this.extent = [0, (nr - 1) * h, z0, z0 + (nz - 1) * h];
    this.V = new Float64Array(nr * nz);
    this.fixed = new Uint8Array(nr * nz);
    this.eps = new Float64Array(nr * nz).fill(1);
    this.rho = new Float64Array(nr * nz);
    this.delta = new Float64Array(nr * nz);
    this.boundary = { rmax: 'dirichlet', zmin: 'dirichlet', zmax: 'dirichlet', ...boundary };
    this.boxV = boxV;
    this.sweeps = 0;
    this.residual = Infinity;
    this.history = [];
    this.applyBoundary();
  }

  r(i) { return i * this.h; }
  z(j) { return this.z0 + j * this.h; }
  idx(i, j) { return j * this.nr + i; }

  /**
   * Area of the annular control volume of node i in a z = const plane: the ring between
   * (i - 1/2) h and (i + 1/2) h, clipped to [0, r_max]. Summing these over i gives
   * exactly pi r_max^2, so disk integrals (current, flux, energy) have no edge error.
   */
  annulus(i) {
    const h = this.h, rIn = Math.max(0, (i - 0.5) * h), rOut = Math.min((this.nr - 1) * h, (i + 0.5) * h);
    return PI * (rOut * rOut - rIn * rIn);
  }

  applyBoundary() {
    const { nr, nz, boundary } = this;
    if (boundary.rmax === 'dirichlet') for (let j = 0; j < nz; j++) this.setFixed(nr - 1, j, this.boxV);
    if (boundary.zmin === 'dirichlet') for (let i = 0; i < nr; i++) this.setFixed(i, 0, this.boxV);
    if (boundary.zmax === 'dirichlet') for (let i = 0; i < nr; i++) this.setFixed(i, nz - 1, this.boxV);
  }

  setFixed(i, j, value) { const k = this.idx(i, j); this.fixed[k] = 1; this.V[k] = value; }
  fixWhere(fn, value) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) if (fn(this.r(i), this.z(j))) this.setFixed(i, j, value); }
  epsWhere(fn, value) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) if (fn(this.r(i), this.z(j))) this.eps[this.idx(i, j)] = value; }

  reset(guess = 0) {
    for (let k = 0; k < this.V.length; k++) if (!this.fixed[k]) this.V[k] = guess;
    this.delta.fill(0);
    this.sweeps = 0; this.residual = Infinity; this.history = [];
  }

  /** One Gauss-Seidel sweep in place. Returns max |dV|. */
  sweep() {
    const { nr, nz, V, fixed, eps, rho, delta, boundary } = this;
    const fe = (ka, kb) => faceEps(eps, fixed, ka, kb);
    const h2e0 = (this.h * this.h) / EPS0;
    const nR = boundary.rmax === 'neumann', nZ0 = boundary.zmin === 'neumann', nZ1 = boundary.zmax === 'neumann';
    let maxd = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nr; i++) {
        const k = j * nr + i;
        if (fixed[k]) { delta[k] = 0; continue; }
        const ec = eps[k];
        let num = 0, den = 0, src;
        if (i === 0) {
          // axis: 2 d2V/dr2 + d2V/dz2  ->  weights 4 (east), 1, 1
          const e = 4 * fe(k, k + 1); num += e * V[k + 1]; den += e;
          if (j + 1 < nz) { const a = fe(k, k + nr); num += a * V[k + nr]; den += a; } else if (nZ1) { const a = fe(k, k - nr); num += a * V[k - nr]; den += a; }
          if (j > 0) { const a = fe(k, k - nr); num += a * V[k - nr]; den += a; } else if (nZ0) { const a = fe(k, k + nr); num += a * V[k + nr]; den += a; }
          src = rho[k] * h2e0;
        } else {
          const rE = i + 0.5, rW = i - 0.5, rC = i;
          if (i + 1 < nr) { const e = rE * fe(k, k + 1); num += e * V[k + 1]; den += e; } else if (nR) { const e = rE * fe(k, k - 1); num += e * V[k - 1]; den += e; }
          { const w = rW * fe(k, k - 1); num += w * V[k - 1]; den += w; }
          if (j + 1 < nz) { const a = rC * fe(k, k + nr); num += a * V[k + nr]; den += a; } else if (nZ1) { const a = rC * fe(k, k - nr); num += a * V[k - nr]; den += a; }
          if (j > 0) { const a = rC * fe(k, k - nr); num += a * V[k - nr]; den += a; } else if (nZ0) { const a = rC * fe(k, k + nr); num += a * V[k + nr]; den += a; }
          src = rho[k] * h2e0 * rC;
        }
        if (den === 0) continue;
        const vNew = (num + src) / den;
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

  solve(tol = 1e-6, maxSweeps = 200000, k = 50) {
    let last;
    for (const s of this.iterate(k, tol, maxSweeps)) last = s;
    return last;
  }

  // ---------------------------------------------------------------- derived

  gridV() { return new Grid2D(this.nr, this.nz, this.extent, this.V); }
  gridDelta() { return new Grid2D(this.nr, this.nz, this.extent, this.delta); }
  /** E = -grad V as [Er, Ez] grids. */
  E() { return this.gridV().negGradient(); }

  /**
   * Stored electrostatic energy W = 1/2 int eps |E|^2 dv (J), computed on the faces with
   * the same conductances the sweep uses, so for a closed (mirror-walled) box
   * 2 W = Q V holds exactly for the discrete solution: energy and Gauss agree to round-off.
   */
  energy() {
    const { nr, nz, V, eps, fixed, h } = this;
    const fe = (a, b) => faceEps(eps, fixed, a, b);
    let w = 0;
    const dz = (j) => (j === 0 || j === nz - 1 ? h / 2 : h);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) {
      const k = this.idx(i, j);
      if (i + 1 < nr) { const d = V[k + 1] - V[k]; w += fe(k, k + 1) * d * d * 2 * PI * (i + 0.5) * dz(j); }   // radial face: area 2 pi r_f dz, / h
      if (j + 1 < nz) { const d = V[k + nr] - V[k]; w += fe(k, k + nr) * d * d * this.annulus(i) / h; }      // axial face: area annulus, / h
    }
    return 0.5 * EPS0 * w;
  }

  /**
   * Gauss's law over the surface of revolution of the rectangle with corner nodes
   * (i0, j0), (i1, j1): total enclosed free charge Q (C). The radial face at the outer
   * column has area 2 pi r_face h per cell; axial faces are annuli of area 2 pi r_i h
   * (a disk of radius h/2 for the axis cell).
   */
  gaussCharge(i0, j0, i1, j1) {
    const { nr, nz, V, eps, fixed, h } = this;
    const fe = (a, b) => faceEps(eps, fixed, a, b);
    const ia = Math.max(0, Math.min(i0, i1)), ib = Math.min(nr - 1, Math.max(i0, i1));
    const ja = Math.max(0, Math.min(j0, j1)), jb = Math.min(nz - 1, Math.max(j0, j1));
    let flux = 0; // sum of eps_face * E_n * area
    // Radial faces: cylinder of radius r_face and height h per node (half height at the z ends of the box).
    const dz = (j) => (j === 0 || j === nz - 1 ? h / 2 : h);
    if (ib + 1 < nr) for (let j = ja; j <= jb; j++) { const k = this.idx(ib, j); flux += fe(k, k + 1) * (-(V[k + 1] - V[k]) / h) * 2 * PI * (this.r(ib) + h / 2) * dz(j); }
    if (ia > 0) for (let j = ja; j <= jb; j++) { const k = this.idx(ia, j); flux += fe(k, k - 1) * (-(V[k - 1] - V[k]) / h) * 2 * PI * (this.r(ia) - h / 2) * dz(j); }
    // Axial faces: annular control-volume areas (clipped so a box from the axis to ib covers pi r_face^2 exactly).
    const ann = (i) => { const rIn = Math.max(0, (i - 0.5) * h), rOut = Math.min((ib + 0.5) * h, (i + 0.5) * h); return PI * (rOut * rOut - Math.max(rIn, i === ia ? Math.max(0, (ia - 0.5) * h) : rIn) ** 2); };
    if (jb + 1 < nz) for (let i = ia; i <= ib; i++) { const k = this.idx(i, jb); flux += fe(k, k + nr) * (-(V[k + nr] - V[k]) / h) * ann(i); }
    if (ja > 0) for (let i = ia; i <= ib; i++) { const k = this.idx(i, ja); flux += fe(k, k - nr) * (-(V[k - nr] - V[k]) / h) * ann(i); }
    return EPS0 * flux;
  }

  /**
   * Conduction flavour: total current (A) crossing the plane z = z(j) in the +z direction,
   * I = int sigma E_z dA over the disk, using the face between rows j and j+1.
   */
  currentThroughZ(j, { iMax = this.nr - 1 } = {}) {
    const { nr, V, eps, fixed, h } = this;
    const fe = (a, b) => faceEps(eps, fixed, a, b);
    if (j < 0 || j + 1 >= this.nz) return NaN;
    let I = 0;
    for (let i = 0; i <= iMax; i++) {
      const k = this.idx(i, j);
      const sig = fe(k, k + nr);
      const ez = -(V[k + nr] - V[k]) / h;
      I += sig * ez * this.annulus(i);
    }
    return I;
  }
}

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
}

// ---------------------------------------------------------------- geometry builders

/**
 * Lab 3 disk capacitor. Two plates of radius R and thickness t separated by gap g,
 * centred on z = 0, top plate at +V, bottom at 0. Three dielectric layers each g/3:
 * outer layers epsR2, centre layer epsR. The box is square: r in [0, S], z in [-S/2, S/2],
 * S = g + boxFactor R (insulating walls, one plate radius or more beyond the edge). cellsPerLayer sets h.
 */
export function diskCapacitor({ V = 5, g = 4e-3, R = 6e-3, t = 0.5e-3, epsR = 5, epsR2 = 5, cellsPerLayer = 4, boxFactor = 2.5, walls = 'neumann' } = {}) {
  const h = g / (3 * cellsPerLayer);
  const S = g + boxFactor * R;
  const nr = Math.round(S / h) + 1;
  const nz = 2 * Math.round(S / (2 * h)) + 1; // odd, so z = 0 is a node
  const z0 = -(nz - 1) / 2 * h;
  // Insulating (mirror) walls by default: no stray capacitance from the plates to a grounded
  // box, so Q on the top plate is exactly C V. 'dirichlet' gives a grounded enclosure instead.
  const s = new Axisym(nr, nz, { h, z0, boundary: { rmax: walls, zmin: walls, zmax: walls } });
  const tC = Math.max(t, h); // at least one cell thick
  s.fixWhere((r, z) => r <= R + h / 4 && z >= g / 2 - h / 4 && z <= g / 2 + tC + h / 4, V);
  s.fixWhere((r, z) => r <= R + h / 4 && z <= -g / 2 + h / 4 && z >= -g / 2 - tC - h / 4, 0);
  // Dielectric fills the gap out to the plate radius (as in the COMSOL model); air beyond.
  s.epsWhere((r, z) => r <= R + h / 4 && Math.abs(z) < g / 2 - h / 4, epsR2);
  s.epsWhere((r, z) => r <= R + h / 4 && Math.abs(z) < g / 6 - h / 4, epsR);
  s.meta = { V, g, R, t: tC, epsR, epsR2, h, S, walls };
  return s;
}

/** Ideal three-series-layer parallel-plate capacitance from the Lab 3 handout. */
export function idealLayeredC({ g, R, epsR, epsR2 }) {
  return (EPS0 * PI * R * R) / ((g / 3) * (2 / epsR2 + 1 / epsR));
}

/** Kirchhoff's edge correction for a disk capacitor in a uniform dielectric epsEff. */
export function kirchhoffC({ g, R, epsEff = 1, t = 0 }) {
  // Kirchhoff (1877): C = eps pi R^2/g + eps R [ ln(16 pi R / g) - 1 ] + (t term, small)
  const term = Math.log((16 * PI * R) / g) - 1 + (t > 0 ? (t / g) * Math.log(1 + g / t) : 0);
  return EPS0 * epsEff * (PI * R * R / g + R * term);
}
