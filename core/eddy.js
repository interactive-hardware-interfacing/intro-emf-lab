// Quasi-static (eddy-current) magnetics with rotational symmetry, in the frequency domain.
//
// A coil carries I cos(wt). Nothing radiates (the box is far smaller than a wavelength), so
// displacement current is dropped and Ampere's law reads  curl H = J_s + J_e  with the eddy
// current J_e = sigma E = -sigma dA/dt. With phasors (e^{jwt}) and psi = r A_phi:
//
//     d/dr( 1/(mu r) dpsi/dr ) + d/dz( 1/(mu r) dpsi/dz ) = -mu0 J_s + j w sigma psi / r
//
// which is the magnetostatic equation of AxisymMag with one extra, complex, diagonal term.
// psi is complex: `V` holds its real part (in phase with the coil current), `Vi` the
// imaginary part (quadrature). The same Gauss-Seidel neighbour average solves it; each cell
// update is a complex division by (sum of face coefficients + j w sigma mu0 h^2 / r).
//
// What comes out: the field amplitude and phase everywhere, the induced current density
// J_e = -j w sigma psi / r, the time-average dissipation |J_e|^2 / (2 sigma), and the coil's
// impedance Z = R + j w L from the complex flux linkage Lambda = (1/I) int J_s . A dv:
//     L = Re(Lambda) / I,   R_eddy = -w Im(Lambda) / I   (and  P = R I^2 / 2  checks the solve).
// Skin depth: delta = sqrt( 2 / (w mu sigma) ).

import { MU0, PI } from './constants.js';
import { Grid2D } from './grid.js';
import { AxisymMag } from './axisym.js';

export class AxisymEddy extends AxisymMag {
  constructor(nr, nz, opts = {}) {
    super(nr, nz, opts);
    this.Vi = new Float64Array(nr * nz);         // Im(psi)
    this.sigma = new Float64Array(nr * nz);      // conductivity, S/m
    this.omega = opts.omega ?? 2 * PI * 1e3;
  }

  /** Build from a magnetostatic model (same grid, materials and coil current). */
  static fromMag(mag, { omega, sigmaAt }) {
    const s = new AxisymEddy(mag.nr, mag.nz, { h: mag.h, z0: mag.z0, boundary: mag.boundary, omega });
    s.fixed.set(mag.fixed); s.eps.set(mag.eps); s.rho.set(mag.rho); s.V.set(mag.V);
    s.meta = mag.meta;
    if (sigmaAt) for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nr; i++) s.sigma[s.idx(i, j)] = sigmaAt(s.r(i), s.z(j));
    return s;
  }

  sigmaWhere(fn, value) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nr; i++) if (fn(this.r(i), this.z(j))) this.sigma[this.idx(i, j)] = value; }
  reset(guess = 0) { super.reset(guess); this.Vi.fill(0); }

  /** Skin depth in a material of conductivity sigma and relative permeability muR at this omega. */
  skinDepth(sigma, muR = 1) { return Math.sqrt(2 / (this.omega * MU0 * muR * sigma)); }

  sweep() {
    const { nr, nz, V, Vi, fixed, rho, sigma, delta, boundary, h, omega } = this;
    const src0 = MU0 * h * h;
    const nR = boundary.rmax === 'neumann', nZ0 = boundary.zmin === 'neumann', nZ1 = boundary.zmax === 'neumann';
    let maxd = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 1; i < nr; i++) {
        const k = j * nr + i;
        if (fixed[k]) { delta[k] = 0; continue; }
        const rE = (i + 0.5) * h, rW = (i - 0.5) * h, rC = i * h;
        let nr_ = 0, ni = 0, den = 0;
        const add = (c, q) => { nr_ += c * V[q]; ni += c * Vi[q]; den += c; };
        if (i + 1 < nr) add(this.coef(k, k + 1, rE), k + 1); else if (nR) add(this.coef(k, k - 1, rE), k - 1);
        add(this.coef(k, k - 1, rW), k - 1);
        if (j + 1 < nz) add(this.coef(k, k + nr, rC), k + nr); else if (nZ1) add(this.coef(k, k - nr, rC), k - nr);
        if (j > 0) add(this.coef(k, k - nr, rC), k - nr); else if (nZ0) add(this.coef(k, k + nr, rC), k + nr);
        // (a + j b) / (den + j g), g = w sigma mu0 h^2 / r  (the eddy term on the diagonal)
        const g = omega * sigma[k] * src0 / rC;
        const a = nr_ + rho[k] * src0, b = ni;
        const d2 = den * den + g * g;
        const vr = (a * den + b * g) / d2, vi = (b * den - a * g) / d2;
        const d = Math.hypot(vr - V[k], vi - Vi[k]);
        delta[k] = d; if (d > maxd) maxd = d;
        V[k] = vr; Vi[k] = vi;
      }
    }
    this.sweeps++; this.residual = maxd;
    return maxd;
  }

  /** Complex B as four grids [Br_re, Bz_re, Br_im, Bz_im]. */
  Bc() {
    const re = this.B();
    const save = this.V; this.V = this.Vi;
    const im = this.B();
    this.V = save;
    return [re[0], re[1], im[0], im[1]];
  }

  /** Eddy current density J_e = -j w sigma psi / r as [Re, Im] grids (A/m^2). */
  Je() {
    const { nr, nz, V, Vi, sigma, omega } = this;
    const re = new Grid2D(nr, nz, this.extent), im = new Grid2D(nr, nz, this.extent);
    for (let j = 0; j < nz; j++) for (let i = 1; i < nr; i++) {
      const k = this.idx(i, j);
      if (!sigma[k]) continue;
      const f = omega * sigma[k] / this.r(i);
      re.data[k] = f * Vi[k];          // -j (Vr + j Vi) = Vi - j Vr
      im.data[k] = -f * V[k];
    }
    return [re, im];
  }

  /** Time-average dissipated power density |J_e|^2 / (2 sigma) (W/m^3) and its integral (W). */
  power() {
    const [jr, ji] = this.Je();
    const p = new Grid2D(this.nr, this.nz, this.extent);
    let P = 0;
    for (let j = 0; j < this.nz; j++) for (let i = 1; i < this.nr; i++) {
      const k = this.idx(i, j);
      if (!this.sigma[k]) continue;
      p.data[k] = (jr.data[k] ** 2 + ji.data[k] ** 2) / (2 * this.sigma[k]);
      const dz = j === 0 || j === this.nz - 1 ? this.h / 2 : this.h;
      P += p.data[k] * this.annulus(i) * dz;
    }
    return { density: p, total: P };
  }

  /**
   * Complex flux linkage Lambda = (1/I) int J_s . A dv over the coil, and the coil impedance
   * seen by the source: Z = j w Lambda / I = R + j w L. I is the coil current amplitude.
   */
  impedance(I) {
    let lr = 0, li = 0;
    for (let j = 0; j < this.nz; j++) for (let i = 1; i < this.nr; i++) {
      const k = this.idx(i, j);
      if (this.rho[k] === 0) continue;
      const dz = j === 0 || j === this.nz - 1 ? this.h / 2 : this.h;
      const w = this.rho[k] / this.r(i) * this.annulus(i) * dz;
      lr += w * this.V[k]; li += w * this.Vi[k];
    }
    const L = lr / (I * I), R = -this.omega * li / (I * I);
    return { L, R, X: this.omega * L, Pcoil: 0.5 * R * I * I };
  }
}

/**
 * Exact reference: a long conducting cylinder (radius a, sigma, mu_r = 1) in a uniform axial
 * field B0 cos(wt). Inside,  B(r)/B0 = J0(alpha r) / J0(alpha a),  alpha = (1 - j)/delta.
 * Returns the complex ratio [re, im] at radius r. Series J0 is fine for |alpha a| up to ~8.
 */
export function cylinderFieldRatio(r, a, delta) {
  const j0 = (zr, zi) => {             // J0 of a complex argument by its power series
    let sr = 1, si = 0, tr = 1, ti = 0;
    const qr = (zr * zr - zi * zi) / 4, qi = (2 * zr * zi) / 4;   // (z/2)^2
    for (let m = 1; m < 60; m++) {
      const nr = tr * qr - ti * qi, ni = tr * qi + ti * qr;
      tr = -nr / (m * m); ti = -ni / (m * m);
      sr += tr; si += ti;
      if (Math.hypot(tr, ti) < 1e-17 * Math.hypot(sr, si)) break;
    }
    return [sr, si];
  };
  const k = 1 / delta;                                           // alpha = k (1 - j)
  const [nr, ni] = j0(k * r, -k * r), [dr, di] = j0(k * a, -k * a);
  const d2 = dr * dr + di * di;
  return [(nr * dr + ni * di) / d2, (ni * dr - nr * di) / d2];
}
