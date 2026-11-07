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

import { EPS0, MU0, PI } from './constants.js';
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
    // Permittivity lives on the FACES between nodes: faceR[k] is the face between node k and
    // k+1 (radial), faceZ[k] between k and k+nr (axial). By default they are built from the
    // node array (harmonic mean, conductor rule); a geometry builder may set them directly so
    // that material interfaces fall exactly where the geometry puts them (setFacesFrom).
    this.faceR = new Float64Array(nr * nz);
    this.faceZ = new Float64Array(nr * nz);
    this.facesExplicit = false;
    this.facesDirty = true;
    this.boundary = { rmax: 'dirichlet', zmin: 'dirichlet', zmax: 'dirichlet', ...boundary };
    this.boxV = boxV;
    this.sweeps = 0;
    this.residual = Infinity;
    this.history = [];
    this.applyBoundary();
  }

  /** Build the face arrays from the node permittivities (harmonic mean; a conductor cell takes no part). */
  buildFaces() {
    const { nr, nz, eps, fixed, faceR, faceZ } = this;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) {
      const k = j * nr + i;
      faceR[k] = i + 1 < nr ? faceEps(eps, fixed, k, k + 1) : 0;
      faceZ[k] = j + 1 < nz ? faceEps(eps, fixed, k, k + nr) : 0;
    }
    this.facesDirty = false;
  }

  /**
   * Assign the face permittivities from a material function epsAt(r, z) evaluated at each
   * face centre, so an interface at z = c lands on the faces either side of it exactly.
   * A face between two conductor nodes gets 0. Node eps is also refreshed (for display).
   */
  setFacesFrom(epsAt) {
    const { nr, nz, fixed, faceR, faceZ, h } = this;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) {
      const k = j * nr + i;
      this.eps[k] = epsAt(this.r(i), this.z(j));
      faceR[k] = i + 1 < nr ? (fixed[k] && fixed[k + 1] ? 0 : epsAt(this.r(i) + h / 2, this.z(j))) : 0;
      faceZ[k] = j + 1 < nz ? (fixed[k] && fixed[k + nr] ? 0 : epsAt(this.r(i), this.z(j) + h / 2)) : 0;
    }
    this.facesExplicit = true;
    this.facesDirty = false;
  }

  /** Make sure the face arrays reflect the node arrays (unless they were set explicitly). */
  prepare() { if (this.facesDirty && !this.facesExplicit) this.buildFaces(); }

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

  setFixed(i, j, value) { const k = this.idx(i, j); this.fixed[k] = 1; this.V[k] = value; this.facesDirty = true; }
  fixWhere(fn, value) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) if (fn(this.r(i), this.z(j))) this.setFixed(i, j, value); }
  epsWhere(fn, value) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) if (fn(this.r(i), this.z(j))) this.eps[this.idx(i, j)] = value; this.facesDirty = true; }

  reset(guess = 0) {
    for (let k = 0; k < this.V.length; k++) if (!this.fixed[k]) this.V[k] = guess;
    this.delta.fill(0);
    this.sweeps = 0; this.residual = Infinity; this.history = [];
  }

  /** One Gauss-Seidel sweep in place. Returns max |dV|. */
  sweep() {
    this.prepare();
    const { nr, nz, V, fixed, rho, delta, boundary, faceR, faceZ } = this;
    const h2e0 = (this.h * this.h) / EPS0;
    const nR = boundary.rmax === 'neumann', nZ0 = boundary.zmin === 'neumann', nZ1 = boundary.zmax === 'neumann';
    let maxd = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nr; i++) {
        const k = j * nr + i;
        if (fixed[k]) { delta[k] = 0; continue; }
        let num = 0, den = 0, src;
        if (i === 0) {
          // axis: 2 d2V/dr2 + d2V/dz2  ->  weights 4 (east), 1, 1
          const e = 4 * faceR[k]; num += e * V[k + 1]; den += e;
          if (j + 1 < nz) { const a = faceZ[k]; num += a * V[k + nr]; den += a; } else if (nZ1) { const a = faceZ[k - nr]; num += a * V[k - nr]; den += a; }
          if (j > 0) { const a = faceZ[k - nr]; num += a * V[k - nr]; den += a; } else if (nZ0) { const a = faceZ[k]; num += a * V[k + nr]; den += a; }
          src = rho[k] * h2e0;
        } else {
          const rE = i + 0.5, rW = i - 0.5, rC = i;
          if (i + 1 < nr) { const e = rE * faceR[k]; num += e * V[k + 1]; den += e; } else if (nR) { const e = rE * faceR[k - 1]; num += e * V[k - 1]; den += e; }
          { const w = rW * faceR[k - 1]; num += w * V[k - 1]; den += w; }
          if (j + 1 < nz) { const a = rC * faceZ[k]; num += a * V[k + nr]; den += a; } else if (nZ1) { const a = rC * faceZ[k - nr]; num += a * V[k - nr]; den += a; }
          if (j > 0) { const a = rC * faceZ[k - nr]; num += a * V[k - nr]; den += a; } else if (nZ0) { const a = rC * faceZ[k]; num += a * V[k + nr]; den += a; }
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
    this.prepare();
    const { nr, nz, V, h, faceR, faceZ } = this;
    let w = 0;
    const dz = (j) => (j === 0 || j === nz - 1 ? h / 2 : h);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) {
      const k = this.idx(i, j);
      if (i + 1 < nr) { const d = V[k + 1] - V[k]; w += faceR[k] * d * d * 2 * PI * (i + 0.5) * dz(j); }   // radial face: area 2 pi r_f dz, / h
      if (j + 1 < nz) { const d = V[k + nr] - V[k]; w += faceZ[k] * d * d * this.annulus(i) / h; }      // axial face: area annulus, / h
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
    this.prepare();
    const { nr, nz, V, h, faceR, faceZ } = this;
    const ia = Math.max(0, Math.min(i0, i1)), ib = Math.min(nr - 1, Math.max(i0, i1));
    const ja = Math.max(0, Math.min(j0, j1)), jb = Math.min(nz - 1, Math.max(j0, j1));
    let flux = 0; // sum of eps_face * E_n * area
    // Radial faces: cylinder of radius r_face and height h per node (half height at the z ends of the box).
    const dz = (j) => (j === 0 || j === nz - 1 ? h / 2 : h);
    if (ib + 1 < nr) for (let j = ja; j <= jb; j++) { const k = this.idx(ib, j); flux += faceR[k] * (-(V[k + 1] - V[k]) / h) * 2 * PI * (this.r(ib) + h / 2) * dz(j); }
    if (ia > 0) for (let j = ja; j <= jb; j++) { const k = this.idx(ia, j); flux += faceR[k - 1] * (-(V[k - 1] - V[k]) / h) * 2 * PI * (this.r(ia) - h / 2) * dz(j); }
    // Axial faces: annular control-volume areas, clipped to the box [ia-1/2, ib+1/2] and to r_max.
    const rMax = (nr - 1) * h;
    const ann = (i) => { const rIn = Math.max(0, (i - 0.5) * h, (ia - 0.5) * h), rOut = Math.min((ib + 0.5) * h, (i + 0.5) * h, rMax); return PI * Math.max(0, rOut * rOut - rIn * rIn); };
    if (jb + 1 < nz) for (let i = ia; i <= ib; i++) { const k = this.idx(i, jb); flux += faceZ[k] * (-(V[k + nr] - V[k]) / h) * ann(i); }
    if (ja > 0) for (let i = ia; i <= ib; i++) { const k = this.idx(i, ja); flux += faceZ[k - nr] * (-(V[k - nr] - V[k]) / h) * ann(i); }
    return EPS0 * flux;
  }

  /**
   * Conduction flavour: total current (A) crossing the plane z = z(j) in the +z direction,
   * I = int sigma E_z dA over the disk, using the face between rows j and j+1.
   */
  currentThroughZ(j, { iMax = this.nr - 1 } = {}) {
    this.prepare();
    const { nr, V, h, faceZ } = this;
    if (j < 0 || j + 1 >= this.nz) return NaN;
    let I = 0;
    for (let i = 0; i <= iMax; i++) {
      const k = this.idx(i, j);
      const sig = faceZ[k];
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
export function diskCapacitor({ V = 5, g = 4e-3, R = 6e-3, t = 0.5e-3, epsR = 5, epsR2 = 5, cellsPerLayer = 4, boxFactor = 2.5, walls = 'neumann', maxCells = 300 } = {}) {
  const S = g + boxFactor * R;
  // The plate faces must land on nodes (gap exactly g) and the layer interfaces on faces,
  // which needs an even number of cells per layer; round up if an odd value is asked for.
  cellsPerLayer = Math.max(2, Math.ceil(cellsPerLayer / 2) * 2);
  let h = g / (3 * cellsPerLayer);
  let coarsened = false;
  if (S / h > maxCells) { h = S / maxCells; coarsened = true; } // keep the grid tractable for plain Gauss-Seidel
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
  // Materials are assigned on the FACES from the geometry, so each layer gets exactly g/3
  // of faces: cellsPerLayer faces for the centre layer and for each outer layer.
  s.setFacesFrom((r, z) => (r <= R + h / 4 && Math.abs(z) < g / 2 ? (Math.abs(z) < g / 6 ? epsR : epsR2) : 1));
  s.meta = { V, g, R, t: tC, epsR, epsR2, h, S, walls, coarsened };
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

// ================================================================ magnetostatics

/**
 * AxisymMag: the same neighbour average for magnetostatics with rotational symmetry.
 * Unknown: psi = r A_phi (2 pi psi is the flux through a circle of radius r), which obeys
 *
 *   d/dr [ (1/(mu r)) dpsi/dr ] + d/dz [ (1/(mu r)) dpsi/dz ] = -J_phi
 *
 * so the face coefficient is 1/(mu_r,face * r_face) (mu0 factored out) and the source is
 * mu0 J_phi h^2. psi = 0 on the axis (A finite) and on the box walls (no flux leaves).
 *   B_r = -(1/r) dpsi/dz,   B_z = (1/r) dpsi/dr   (on the axis B_z = 2 psi(h)/h^2).
 * The face permeability is the arithmetic mean of the two cells, which is the harmonic
 * mean of the coefficient 1/mu and keeps H_tangential continuous across an interface.
 */
export class AxisymMag {
  constructor(nr, nz, { h, z0 = 0, boundary = {} } = {}) {
    this.nr = nr; this.nz = nz; this.h = h; this.z0 = z0;
    this.extent = [0, (nr - 1) * h, z0, z0 + (nz - 1) * h];
    this.V = new Float64Array(nr * nz);      // psi, named V so the worker and shell can share code
    this.fixed = new Uint8Array(nr * nz);
    this.eps = new Float64Array(nr * nz).fill(1); // mu_r, named eps for the same reason
    this.rho = new Float64Array(nr * nz);    // J_phi (A/m^2)
    this.delta = new Float64Array(nr * nz);
    this.boundary = { rmax: 'dirichlet', zmin: 'dirichlet', zmax: 'dirichlet', ...boundary };
    this.boxV = 0;
    this.sweeps = 0; this.residual = Infinity; this.history = [];
    this.applyBoundary();
  }

  r(i) { return i * this.h; }
  z(j) { return this.z0 + j * this.h; }
  idx(i, j) { return j * this.nr + i; }
  annulus(i) { const h = this.h, rIn = Math.max(0, (i - 0.5) * h), rOut = Math.min((this.nr - 1) * h, (i + 0.5) * h); return PI * (rOut * rOut - rIn * rIn); }

  applyBoundary() {
    const { nr, nz, boundary } = this;
    for (let j = 0; j < nz; j++) this.setFixed(0, j, 0); // axis: psi = 0 always
    if (boundary.rmax === 'dirichlet') for (let j = 0; j < nz; j++) this.setFixed(nr - 1, j, 0);
    if (boundary.zmin === 'dirichlet') for (let i = 0; i < nr; i++) this.setFixed(i, 0, 0);
    if (boundary.zmax === 'dirichlet') for (let i = 0; i < nr; i++) this.setFixed(i, nz - 1, 0);
  }
  setFixed(i, j, value) { const k = this.idx(i, j); this.fixed[k] = 1; this.V[k] = value; }
  muWhere(fn, value) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) if (fn(this.r(i), this.z(j))) this.eps[this.idx(i, j)] = value; }
  jWhere(fn, value) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) if (fn(this.r(i), this.z(j))) this.rho[this.idx(i, j)] = value; }
  reset(guess = 0) { for (let k = 0; k < this.V.length; k++) if (!this.fixed[k]) this.V[k] = guess; this.delta.fill(0); this.sweeps = 0; this.residual = Infinity; this.history = []; }

  /** Face coefficient between cells a and b at face radius rf: 1 / (mu_face * rf). */
  coef(a, b, rf) { return 1 / (0.5 * (this.eps[a] + this.eps[b]) * rf); }

  /**
   * Nonlinear (saturating) material: cells flagged in `mask` take mu_r from a B-H curve
   *   B(H) = mu0 H + Bsat tanh( mu0 (mu_i - 1) H / Bsat )
   * which starts with relative permeability mu_i and saturates at magnetisation Bsat.
   * mu_r(B) is found by inverting B(H) with Newton's method. Call updateMu() every few
   * sweeps (the worker does); it re-evaluates mu_r at each masked cell from the current
   * |B|, with damping so the fixed-point iteration converges, and returns the largest
   * relative change in mu_r.
   */
  setSaturation({ mask, muI, Bsat, damping = 0.5 }) {
    this.sat = { mask, muI, Bsat, damping };
  }

  /** The B-H curve itself: B(H) = mu0 H + Bsat tanh(mu0 (mu_i - 1) H / Bsat). */
  static Bcurve(H, muI, Bsat) { return MU0 * H + Bsat * Math.tanh(MU0 * (muI - 1) * H / Bsat); }

  /** mu_r at a given |B|, found by inverting the B-H curve with Newton's method. */
  static muOfB(B, muI, Bsat) {
    if (B < 1e-9 * Bsat) return muI;
    const k = MU0 * (muI - 1) / Bsat;
    let H = B / (MU0 * muI);
    for (let n = 0; n < 30; n++) {
      const t = Math.tanh(k * H);
      const f = MU0 * H + Bsat * t - B;
      const df = MU0 + Bsat * k * (1 - t * t);
      const dH = f / df;
      H -= dH;
      if (Math.abs(dH) < 1e-12 * Math.max(H, 1)) break;
    }
    return B / (MU0 * H);
  }

  updateMu() {
    if (!this.sat) return 0;
    const { mask, muI, Bsat, damping } = this.sat;
    const [br, bz] = this.B();
    let maxChange = 0;
    for (let k = 0; k < this.eps.length; k++) {
      if (!mask[k]) continue;
      // Successive substitution from the H side: H = |B| / (mu0 mu_current), then
      // mu_new = B(H) / (mu0 H). Because B(H) is concave this map is a contraction
      // (the B-side map mu = mu(|B|) is not near the knee of the curve).
      const Bn = Math.hypot(br.data[k], bz.data[k]);
      const H = Bn / (MU0 * this.eps[k]);
      const target = H > 0 ? AxisymMag.Bcurve(H, muI, Bsat) / (MU0 * H) : muI;
      const next = this.eps[k] + damping * (target - this.eps[k]);
      maxChange = Math.max(maxChange, Math.abs(next - this.eps[k]) / this.eps[k]);
      this.eps[k] = next;
    }
    return maxChange;
  }

  /** Mean relative permeability over the saturating cells (for display). */
  meanMu() {
    if (!this.sat) return NaN;
    let sum = 0, n = 0;
    for (let k = 0; k < this.eps.length; k++) if (this.sat.mask[k]) { sum += this.eps[k]; n++; }
    return n ? sum / n : NaN;
  }

  sweep() {
    const { nr, nz, V, fixed, rho, delta, boundary, h } = this;
    const src0 = MU0 * h * h;
    const nR = boundary.rmax === 'neumann', nZ0 = boundary.zmin === 'neumann', nZ1 = boundary.zmax === 'neumann';
    let maxd = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 1; i < nr; i++) { // i = 0 is the axis, fixed
        const k = j * nr + i;
        if (fixed[k]) { delta[k] = 0; continue; }
        const rE = (i + 0.5) * h, rW = (i - 0.5) * h, rC = i * h;
        let num = 0, den = 0;
        if (i + 1 < nr) { const c = this.coef(k, k + 1, rE); num += c * V[k + 1]; den += c; } else if (nR) { const c = this.coef(k, k - 1, rE); num += c * V[k - 1]; den += c; }
        { const c = this.coef(k, k - 1, rW); num += c * V[k - 1]; den += c; }
        if (j + 1 < nz) { const c = this.coef(k, k + nr, rC); num += c * V[k + nr]; den += c; } else if (nZ1) { const c = this.coef(k, k - nr, rC); num += c * V[k - nr]; den += c; }
        if (j > 0) { const c = this.coef(k, k - nr, rC); num += c * V[k - nr]; den += c; } else if (nZ0) { const c = this.coef(k, k + nr, rC); num += c * V[k + nr]; den += c; }
        const vNew = (num + rho[k] * src0) / den;
        const d = Math.abs(vNew - V[k]);
        delta[k] = d; if (d > maxd) maxd = d;
        V[k] = vNew;
      }
    }
    this.sweeps++; this.residual = maxd;
    return maxd;
  }

  *iterate(k = 10, tol = 1e-9, maxSweeps = 200000) {
    while (this.sweeps < maxSweeps) {
      let r = Infinity;
      for (let n = 0; n < k; n++) r = this.sweep();
      const muChange = this.sat ? this.updateMu() : 0;
      this.history.push([this.sweeps, r]);
      const converged = r < tol && muChange < 1e-4;
      yield { sweeps: this.sweeps, residual: r, converged, muChange };
      if (converged) return;
    }
    yield { sweeps: this.sweeps, residual: this.residual, converged: false, hitMax: true };
  }
  solve(tol = 1e-9, maxSweeps = 200000, k = 50) { let last; for (const s of this.iterate(k, tol, maxSweeps)) last = s; return last; }

  /** B = curl A as [Br, Bz] grids from psi. */
  B() {
    const { nr, nz, V, h } = this;
    const br = new Grid2D(nr, nz, this.extent), bz = new Grid2D(nr, nz, this.extent);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) {
      const k = this.idx(i, j);
      const dpdz = j === 0 ? (V[k + nr] - V[k]) / h : j === nz - 1 ? (V[k] - V[k - nr]) / h : (V[k + nr] - V[k - nr]) / (2 * h);
      if (i === 0) { br.data[k] = 0; bz.data[k] = 2 * V[k + 1] / (h * h); continue; }
      const dpdr = i === nr - 1 ? (V[k] - V[k - 1]) / h : (V[k + 1] - V[k - 1]) / (2 * h);
      const r = i * h;
      br.data[k] = -dpdz / r;
      bz.data[k] = dpdr / r;
    }
    return [br, bz];
  }

  /** Energy W = 1/2 int B.H dv (J), node-based with control-volume rings. */
  energy() {
    const [br, bz] = this.B();
    let w = 0;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) {
      const k = this.idx(i, j);
      const dz = j === 0 || j === this.nz - 1 ? this.h / 2 : this.h;
      w += (br.data[k] ** 2 + bz.data[k] ** 2) / (MU0 * this.eps[k]) * this.annulus(i) * dz;
    }
    return 0.5 * w;
  }

  /** 1/2 int J.A dv (J): equals the energy for the exact solution; the flux-linkage route. */
  energyJA() {
    let w = 0;
    for (let j = 0; j < this.nz; j++) for (let i = 1; i < this.nr; i++) {
      const k = this.idx(i, j);
      if (this.rho[k] === 0) continue;
      const dz = j === 0 || j === this.nz - 1 ? this.h / 2 : this.h;
      w += this.rho[k] * (this.V[k] / this.r(i)) * this.annulus(i) * dz;
    }
    return 0.5 * w;
  }
}

/**
 * Lab 5 inductive sensor: a coil of N turns, mean radius Rc, length l, winding thickness
 * tw, carrying I, with a cylindrical object (radius a, length Lo, mu_r) whose bottom end
 * sits at z = zPos (sensor centre at z = 0). Square box of half-size `box` times the largest
 * dimension, psi = 0 on the walls: with box = 8 the walls lower L by about 1-2%.
 */
export function solenoidWithObject({ N = 100, I = 1, Rc = 15e-3, l = 30e-3, tw = 1e-3, a = 5e-3, Lo = 20e-3, muR = 100, zPos = -10e-3, nr = 81, box = 8, Bsat = 0 } = {}) {
  const S = box * Math.max(Rc + tw, a, l / 2, Lo / 2);      // half-size of the box
  const h = S / (nr - 1);
  const nz = 2 * Math.round(S / h) + 1;
  const z0 = -(nz - 1) / 2 * h;
  const s = new AxisymMag(nr, nz, { h, z0 });
  const twC = Math.max(tw, h);
  const J = (N * I) / (l * twC);
  s.jWhere((r, z) => Math.abs(r - Rc) <= twC / 2 + h / 4 && Math.abs(z) <= l / 2 + h / 4, J);
  // normalise J so the total current is exactly N I on the grid
  let cells = 0; for (let k = 0; k < s.rho.length; k++) if (s.rho[k] !== 0) cells++;
  const Jexact = (N * I) / (cells * h * h);
  for (let k = 0; k < s.rho.length; k++) if (s.rho[k] !== 0) s.rho[k] = Jexact;
  const inObject = (r, z) => r <= a + h / 4 && z >= zPos - h / 4 && z <= zPos + Lo + h / 4;
  if (muR !== 1 && a > 0 && Lo > 0) {
    s.muWhere(inObject, muR);
    if (Bsat > 0) {
      // Saturating core: start at mu_i = muR and let updateMu() lower it where |B| approaches Bsat.
      const mask = new Uint8Array(s.eps.length);
      for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nr; i++) if (inObject(s.r(i), s.z(j))) mask[s.idx(i, j)] = 1;
      s.setSaturation({ mask, muI: muR, Bsat });
    }
  }
  s.meta = { N, I, Rc, l, tw: twC, a, Lo, muR, zPos, h, S, J: Jexact, Bsat };
  return s;
}
