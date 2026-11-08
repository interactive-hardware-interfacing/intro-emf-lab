// 2-D FDTD, TMz polarisation (Ez, Hx, Hy), on a Yee grid: the time-varying tab.
//
// With fields independent of z, Maxwell's curl equations split into two independent sets.
// The TMz set keeps E along z and H in the plane:
//
//   dHx/dt = -(1/mu0)  dEz/dy
//   dHy/dt =  (1/mu0)  dEz/dx
//   dEz/dt =  (1/eps) (dHy/dx - dHx/dy) - (sigma/eps) Ez
//
// Yee's scheme stores Ez at the cell corners (i, j) and the H components half a cell away:
// Hx at (i, j+1/2), Hy at (i+1/2, j). Every derivative is then a centred difference of its
// neighbours, and time is leap-frogged: H advances half a step, then E, then H again. This
// is explicit, needs no matrix, and is stable while  c dt <= h / sqrt(2)  (Courant).
//
// Boundaries: Ez = 0 on the box walls would make a perfect mirror. Two open-boundary
// treatments are available (abc option):
//   'mur'  first-order Mur: extrapolate the outgoing wave at the wall from the cell inside.
//          One line of algebra, ~3e-4 reflection at normal incidence, a few percent at
//          grazing angles, and it assumes one wave speed (we use the wall cell's).
//   'pml'  convolutional perfectly matched layer (CPML, Roden & Gedney 2000): the outer
//          NPML cells are a lossy medium whose conductivity is graded from 0 to sigma_max
//          and whose impedance matches the interior at every angle, so waves enter it and
//          die out before the (Mur) wall behind it. Reflection ~1e-4 up to ~45 degrees, rising
//          to ~1e-2 near grazing (R ~ exp(-2 cos(theta) int sigma dx / eps0 c) in theory; the
//          measured floor is set by discretisation), in any material, at the cost of a few
//          auxiliary arrays and a thicker border.
// PEC cells (pec = 1) hold Ez = 0.
//
// Sources are "soft": the source value is added to Ez at a point (or along a line, which
// radiates a plane wave) rather than overwriting it, so waves pass through the source.

import { EPS0, MU0 } from './constants.js';

export const C0 = 1 / Math.sqrt(EPS0 * MU0);

/** Longest Ez(t) record kept at the probe (steps). */
export const TRACE_MAX = 6000;

export class FDTD2D {
  /**
   * @param {number} nx  Ez samples along x
   * @param {number} ny  Ez samples along y
   * @param {object} o   { h, epsR?, pec?, sigma?, courant? }
   */
  constructor(nx, ny, { h = 0.01, epsR, pec, sigma, courant = 0.99, yWall = 'mur', abc = 'pml', npml = 10 } = {}) {
    this.nx = nx; this.ny = ny; this.h = h;
    this.yWall = yWall; // 'mur' (open: whichever abc is chosen) | 'mirror' (dEz/dy = 0: an infinitely wide plane wave) | 'pec'
    this.abc = abc;     // 'mur' | 'pml' for the open walls
    this.npml = npml;
    this.extent = [0, (nx - 1) * h, 0, (ny - 1) * h];
    const n = nx * ny;
    this.Ez = new Float64Array(n);
    this.Hx = new Float64Array(n);    // Hx[i,j] lives at (i, j+1/2); last row unused
    this.Hy = new Float64Array(n);    // Hy[i,j] lives at (i+1/2, j); last column unused
    this.epsR = epsR ? new Float64Array(epsR) : new Float64Array(n).fill(1);
    this.pec = pec ? new Uint8Array(pec) : new Uint8Array(n);
    this.sigma = sigma ? new Float64Array(sigma) : new Float64Array(n);
    this.dt = courant * h / (C0 * Math.SQRT2);
    this.courant = courant;
    this.t = 0; this.step_ = 0;
    this.sources = [];   // { kind: 'point'|'line', i, j, wave: 'pulse'|'cw', f, amp, t0?, tau? }
    this.trace = null;   // { i, j, t: [], v: [] } optional probe record
    this.prepare();
  }

  idx(i, j) { return j * this.nx + i; }
  x(i) { return i * this.h; }
  y(j) { return j * this.h; }
  get nStep() { return this.step_; }

  /** Precompute the per-cell update coefficients (call again after editing epsR/sigma). */
  prepare() {
    const n = this.nx * this.ny, dt = this.dt, h = this.h;
    this.ca = new Float64Array(n); this.cb = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const eps = EPS0 * this.epsR[k], loss = this.sigma[k] * dt / (2 * eps);
      this.ca[k] = (1 - loss) / (1 + loss);
      this.cb[k] = (dt / (eps * h)) / (1 + loss);
    }
    this.ch = dt / (MU0 * h);
    // Mur coefficient for free space; a wall cell next to a dielectric uses murAt() instead,
    // with the local wave speed c / sqrt(eps_r), otherwise a slab painted up to the wall reflects.
    const cdt = C0 * dt;
    this.mur = (cdt - h) / (cdt + h);
    this.cdt = cdt;
    // previous-step Ez along each wall and one cell in, for the Mur update. Allocated once:
    // prepare() is also called after a paint stroke mid-run, and the wall history and the
    // PML's convolution memory must survive that (zeroing them injects a spurious source).
    this.prevL ??= new Float64Array(2 * this.ny); this.prevR ??= new Float64Array(2 * this.ny);
    this.prevB ??= new Float64Array(2 * this.nx); this.prevT ??= new Float64Array(2 * this.nx);
    this.preparePml();
  }

  /**
   * CPML coefficients. In the border the x (or y) coordinate is stretched by
   * s = 1 + sigma/(j w eps0) (kappa = 1), which in the time domain becomes a convolution of
   * each spatial derivative with an exponential; the recursive form keeps one auxiliary
   * value psi per derivative per cell:  psi <- b psi + c (dF/dx),  derivative <- dF/dx + psi.
   * sigma is graded as sigma_max (d/L)^m from the inner edge of the layer (d = 0) to the wall
   * (d = L); sigma_max = 0.8 (m+1) / (eta0 h) is the usual optimum for m = 3. The CPML
   * "alpha" (complex-frequency shift) is left at zero: it only helps for evanescent waves,
   * and a value that is not tiny compared with eps0*omega (0.05 S/m at 1 GHz, say) makes
   * the layer reflect propagating waves. The slow, curl-free remainder that a PML cannot
   * absorb drains out through the Mur wall behind the layer instead.
   * Coefficients are tabulated along x at Ez positions (bx, cx: for dHy/dx) and at half-cell
   * positions (bxh, cxh: for dEz/dx in the Hy update); likewise along y.
   */
  preparePml() {
    const { nx, ny, h, dt, npml } = this;
    const m = 3, eta0 = Math.sqrt(MU0 / EPS0);
    const sigMax = 0.8 * (m + 1) / (eta0 * h), alphaMax = 0;
    const L = npml * h;
    const coef = (d) => {               // d: depth into the layer, metres (<= 0 means interior)
      if (!(d > 0)) return [1, 0];
      const u = Math.min(1, d / L), sig = sigMax * u ** m, alpha = alphaMax * (1 - u);
      const b = Math.exp(-(sig + alpha) * dt / EPS0);
      return [b, sig > 0 ? (sig / (sig + alpha)) * (b - 1) : 0];
    };
    const table = (n, half) => {
      const b = new Float64Array(n).fill(1), c = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i + (half ? 0.5 : 0)) * h;                 // position of the derivative
        const d = Math.max(npml * h - x, x - (n - 1 - npml) * h); // depth into the nearer layer
        [b[i], c[i]] = coef(d);
      }
      return [b, c];
    };
    [this.bx, this.cx] = table(nx, false); [this.bxh, this.cxh] = table(nx, true);
    [this.by, this.cy] = table(ny, false); [this.byh, this.cyh] = table(ny, true);
    const n = nx * ny;
    this.psiHyx ??= new Float64Array(n); this.psiHxy ??= new Float64Array(n);  // for the H updates (kept across prepare())
    this.psiEzx ??= new Float64Array(n); this.psiEzy ??= new Float64Array(n);  // for the E update
    this.pmlOn = this.abc === 'pml';
    this.pmlY = this.pmlOn && this.yWall === 'mur';                     // top/bottom only when they are open walls
  }

  /** The thickness of the absorbing border in metres (0 for Mur), for drawing. */
  get borderWidth() { return this.pmlOn ? this.npml * this.h : 0; }

  addSource(src) {
    const s = { kind: 'point', wave: 'pulse', amp: 1, ...src };
    if (s.wave === 'pulse') { s.tau = s.tau ?? 0.5 / s.f; s.t0 = s.t0 ?? 3 * s.tau; }
    this.sources.push(s);
    return s;
  }
  clearSources() { this.sources = []; }

  /** Source waveform at time t. */
  static waveform(s, t) {
    if (s.wave === 'cw') { const ramp = Math.min(1, t * s.f); return s.amp * ramp * Math.sin(2 * Math.PI * s.f * t); } // one-period ramp avoids a DC kick
    const u = (t - s.t0) / s.tau;
    return s.amp * Math.exp(-u * u);
  }

  setTrace(i, j) { this.trace = { i, j, t: [], v: [] }; }

  reset() {
    this.Ez.fill(0); this.Hx.fill(0); this.Hy.fill(0);
    this.t = 0; this.step_ = 0;
    this.prevL.fill(0); this.prevR.fill(0); this.prevB.fill(0); this.prevT.fill(0);
    this.psiHyx.fill(0); this.psiHxy.fill(0); this.psiEzx.fill(0); this.psiEzy.fill(0);
    if (this.trace) { this.trace.t = []; this.trace.v = []; }
  }

  /** Advance n time steps. */
  step(n = 1) {
    for (let s = 0; s < n; s++) this.stepOnce();
    return this.t;
  }

  stepOnce() {
    const { nx, ny, Ez, Hx, Hy, ca, cb, ch, pec, pmlOn, pmlY } = this;
    // ---- H half step: curl of E (with the CPML convolution terms inside the border)
    for (let j = 0; j < ny - 1; j++) {
      const row = j * nx, up = row + nx;
      if (pmlY && this.cyh[j] !== 0) {
        const b = this.byh[j], c = this.cyh[j], psi = this.psiHxy;
        for (let i = 0; i < nx; i++) { const k = row + i, d = Ez[up + i] - Ez[k]; psi[k] = b * psi[k] + c * d; Hx[k] -= ch * (d + psi[k]); }
      } else for (let i = 0; i < nx; i++) Hx[row + i] -= ch * (Ez[up + i] - Ez[row + i]);
    }
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      if (pmlOn) {
        const psi = this.psiHyx, bxh = this.bxh, cxh = this.cxh;
        for (let i = 0; i < nx - 1; i++) {
          const k = row + i, d = Ez[k + 1] - Ez[k];
          if (cxh[i] !== 0) { psi[k] = bxh[i] * psi[k] + cxh[i] * d; Hy[k] += ch * (d + psi[k]); } else Hy[k] += ch * d;
        }
      } else for (let i = 0; i < nx - 1; i++) Hy[row + i] += ch * (Ez[row + i + 1] - Ez[row + i]);
    }
    // ---- remember the wall values before the E update (Mur needs E^n at the wall and one cell in)
    for (let j = 0; j < ny; j++) {
      this.prevL[2 * j] = Ez[j * nx]; this.prevL[2 * j + 1] = Ez[j * nx + 1];
      this.prevR[2 * j] = Ez[j * nx + nx - 1]; this.prevR[2 * j + 1] = Ez[j * nx + nx - 2];
    }
    for (let i = 0; i < nx; i++) {
      this.prevB[2 * i] = Ez[i]; this.prevB[2 * i + 1] = Ez[nx + i];
      this.prevT[2 * i] = Ez[(ny - 1) * nx + i]; this.prevT[2 * i + 1] = Ez[(ny - 2) * nx + i];
    }
    // ---- E full step: curl of H, interior points
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx, dn = row - nx;
      const yIn = pmlY && this.cy[j] !== 0, by = this.by[j], cy = this.cy[j];
      for (let i = 1; i < nx - 1; i++) {
        const k = row + i;
        if (pec[k]) { Ez[k] = 0; continue; }
        let dHy = Hy[k] - Hy[k - 1], dHx = Hx[k] - Hx[dn + i];
        if (pmlOn && this.cx[i] !== 0) { const p = this.psiEzx; p[k] = this.bx[i] * p[k] + this.cx[i] * dHy; dHy += p[k]; }
        if (yIn) { const p = this.psiEzy; p[k] = by * p[k] + cy * dHx; dHx += p[k]; }
        Ez[k] = ca[k] * Ez[k] + cb[k] * (dHy - dHx);
      }
    }
    // ---- sources (soft)
    this.t += this.dt; this.step_++;
    for (const s of this.sources) {
      const v = FDTD2D.waveform(s, this.t);
      if (s.kind === 'line') { for (let j = 0; j < ny; j++) { const k = this.idx(s.i, j); if (!pec[k]) Ez[k] += v; } }
      else { const k = this.idx(s.i, s.j); if (!pec[k]) Ez[k] += v; }
    }
    // ---- Mur first-order absorbing walls: E_wall^{n+1} = E_in^n + mur (E_in^{n+1} - E_wall^n)
    const { cdt, epsR, h } = this;
    const m = this.mur;
    const murAt = (k) => { const e = epsR[k]; if (e === 1) return m; const c = cdt / Math.sqrt(e); return (c - h) / (c + h); };
    // With the PML on, the Mur wall still sits behind the layer: the layer absorbs the
    // propagating waves, and the Mur extrapolation lets the slow, curl-free remainder (the
    // DC content a soft Gaussian source leaves behind, which a PML cannot touch) drain out
    // instead of ringing in a closed box.
    for (let j = 1; j < ny - 1; j++) {
      Ez[j * nx] = this.prevL[2 * j + 1] + murAt(j * nx + 1) * (Ez[j * nx + 1] - this.prevL[2 * j]);
      Ez[j * nx + nx - 1] = this.prevR[2 * j + 1] + murAt(j * nx + nx - 2) * (Ez[j * nx + nx - 2] - this.prevR[2 * j]);
    }
    if (this.yWall === 'mirror') {
      for (let i = 1; i < nx - 1; i++) { Ez[i] = Ez[nx + i]; Ez[(ny - 1) * nx + i] = Ez[(ny - 2) * nx + i]; }
    } else if (this.yWall === 'pec') {
      for (let i = 1; i < nx - 1; i++) { Ez[i] = 0; Ez[(ny - 1) * nx + i] = 0; }
    } else {
      for (let i = 1; i < nx - 1; i++) {
        Ez[i] = this.prevB[2 * i + 1] + murAt(nx + i) * (Ez[nx + i] - this.prevB[2 * i]);
        Ez[(ny - 1) * nx + i] = this.prevT[2 * i + 1] + murAt((ny - 2) * nx + i) * (Ez[(ny - 2) * nx + i] - this.prevT[2 * i]);
      }
    }
    // corners: average of the two neighbours
    Ez[0] = 0.5 * (Ez[1] + Ez[nx]); Ez[nx - 1] = 0.5 * (Ez[nx - 2] + Ez[2 * nx - 1]);
    Ez[(ny - 1) * nx] = 0.5 * (Ez[(ny - 1) * nx + 1] + Ez[(ny - 2) * nx]);
    Ez[ny * nx - 1] = 0.5 * (Ez[ny * nx - 2] + Ez[(ny - 1) * nx - 1]);
    if (this.trace) {
      const tr = this.trace;
      tr.t.push(this.t); tr.v.push(Ez[this.idx(tr.i, tr.j)]);
      if (tr.t.length > TRACE_MAX + 1000) { tr.t.splice(0, tr.t.length - TRACE_MAX); tr.v.splice(0, tr.v.length - TRACE_MAX); } // keep the record bounded
    }
  }

  /** Total electromagnetic energy in the box, J per metre of z. */
  energy() {
    const { nx, ny, Ez, Hx, Hy, epsR, h } = this;
    let we = 0, wm = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; we += 0.5 * EPS0 * epsR[k] * Ez[k] * Ez[k]; wm += 0.5 * MU0 * (Hx[k] * Hx[k] + Hy[k] * Hy[k]); }
    return (we + wm) * h * h;
  }

  /** Ez at a grid point. */
  ez(i, j) { return this.Ez[this.idx(i, j)]; }

  /** H components interpolated to the Ez points (for display and the Poynting vector). */
  hAtNodes() {
    const { nx, ny, Hx, Hy } = this;
    const hx = new Float64Array(nx * ny), hy = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      hx[k] = j === 0 ? Hx[k] : 0.5 * (Hx[k] + Hx[k - nx]);
      hy[k] = i === 0 ? Hy[k] : 0.5 * (Hy[k] + Hy[k - 1]);
    }
    return [hx, hy];
  }
}

/** Fill a circle of epsR (or pec) in the arrays, in metres. */
export function fillCircle(s, cx, cy, R, { epsR, pec } = {}) {
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
    if ((s.x(i) - cx) ** 2 + (s.y(j) - cy) ** 2 <= R * R) { const k = s.idx(i, j); if (epsR !== undefined) s.epsR[k] = epsR; if (pec !== undefined) s.pec[k] = pec; }
  }
  s.prepare();
}

/** Fill a rectangle [x0,x1]x[y0,y1] in metres. */
export function fillRect(s, x0, x1, y0, y1, { epsR, pec } = {}) {
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
    const x = s.x(i), y = s.y(j);
    if (x >= x0 - s.h / 4 && x <= x1 + s.h / 4 && y >= y0 - s.h / 4 && y <= y1 + s.h / 4) { const k = s.idx(i, j); if (epsR !== undefined) s.epsR[k] = epsR; if (pec !== undefined) s.pec[k] = pec; }
  }
  s.prepare();
}
