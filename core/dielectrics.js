// dielectrics: a parallel-plate capacitor in (x, y) with up to four dielectric regions
// sharing the gap, built on Relax2D, plus the bookkeeping the Dielectrics tab reports:
// free charge on the plates, bound charge on every dielectric face, the per-region field
// table (same D in a layered stack, same E side by side), the ideal series/parallel
// capacitance and the Wiener bounds for a tilted interface.
//
// Everything is per metre of depth into the page (C/m, F/m, J/m); the tab multiplies by
// the depth it shows. The plates are one cell thick, the solve is at V = 1 and scaled.
//
// Grid conventions (see relax2d.js): nodes carry eps, the solver's face permittivity is
// the harmonic mean, and a conductor face carries the dielectric's own value. So the
// effective position of a conductor surface is the conductor node row, and a dielectric
// interface sits half a cell beyond the last node of a region. Region thicknesses are
// therefore (k + 1/2) h for the two regions touching a plate and m h for regions between
// them (layered), and the same along x side by side, with the plate ends in place of the
// plates. buildPlates() snaps the requested fractions to those values and reports what
// it used in meta.regions[i].f; the ideal formulas use the snapped values, so the
// comparison is between the solver and the formula for the same geometry.

import { EPS0 } from './constants.js';
import { Relax2D } from './relax2d.js';

export const MAX_REGIONS = 4;

/**
 * Build the capacitor. Lengths in metres.
 *   w, d        plate width, gap
 *   regions     [{ eps, f }] in order: bottom to top (layered), left to right (side)
 *   mode        'layered' | 'side' | 'tilted'   (tilted uses the first two regions)
 *   theta       tilt of the interface in degrees from the plate direction (tilted only)
 *   res         cells across the gap (h = d / res)
 *   padX, padY  clear space beyond the plates, in units of d (default 1.5, 1.5)
 *   walls       'neumann' (insulated box) | 'dirichlet' (grounded enclosure)
 *   guess       start from the 1-D stack solution inside the gap (default true)
 *   colShift    side by side only: move the first interface by this many columns (for dC/dx)
 */
export function buildPlates({ w = 25e-3, d = 5e-3, regions = [{ eps: 5, f: 0.5 }, { eps: 2, f: 0.5 }], mode = 'layered', theta = 25, res = 20, padX = 1.5, padY = 1.5, walls = 'neumann', guess = true, colShift = 0 } = {}) {
  regions = regions.slice(0, MAX_REGIONS).map((r) => ({ eps: Math.max(1, +r.eps || 1), f: Math.max(0, +r.f || 0) }));
  if (mode === 'tilted') { while (regions.length < 2) regions.push({ eps: 1, f: 0.5 }); regions.length = 2; }
  if (!regions.length) regions.push({ eps: 1, f: 1 });
  const n = regions.length;
  const fsum = regions.reduce((a, r) => a + r.f, 0) || 1;
  for (const r of regions) r.f /= fsum;
  res = Math.max(n + 3, Math.round(res));
  const h = d / res;
  const nw = 2 * Math.max(2, Math.round(w / (2 * h)));       // plate spans nw cells (even, so x = 0 is a node)
  const npx = Math.max(4, Math.round(padX * d / h)), npy = Math.max(4, Math.round(padY * d / h));
  const nx = nw + 2 * npx + 1, ny = res + 2 + 2 * npy + 1;
  const X = (nx - 1) * h / 2, Y = (ny - 1) * h / 2;
  const s = new Relax2D(nx, ny, [-X, X, -Y, Y], { boundary: walls });
  const ic = npx + nw / 2, iL = npx, iR = npx + nw;           // centre, left end, right end columns of the plates
  const jBot = npy + 1, jTop = jBot + res;                    // plate surface rows (y = -d/2, +d/2)
  for (let i = iL; i <= iR; i++) { s.setFixed(i, jTop, 1); s.setFixed(i, jTop + 1, 1); s.setFixed(i, jBot, 0); s.setFixed(i, jBot - 1, 0); }

  // region map: -1 outside the gap, 0..n-1 inside
  const reg = new Int8Array(nx * ny).fill(-1);
  const used = regions.map((r) => ({ eps: r.eps, f: r.f, cells: 0 }));
  if (mode === 'layered') {
    const rows = snapCounts(regions.map((r) => r.f), res - 1, true); // rows of free nodes per region (res - 1 in all)
    let q = 1;
    rows.forEach((cnt, k) => { for (let m = 0; m < cnt; m++, q++) for (let i = iL; i <= iR; i++) reg[s.idx(i, jBot + q)] = k; used[k].cells = cnt; used[k].f = effLength(k, n, cnt) / res; });
  } else if (mode === 'side') {
    const cols = snapCounts(regions.map((r) => r.f), nw + 1, false); // columns iL..iR per region (nw + 1 in all)
    if (colShift && cols.length > 1 && cols[0] + colShift >= 1 && cols[1] - colShift >= 1) { cols[0] += colShift; cols[1] -= colShift; }
    let p = iL;
    cols.forEach((cnt, k) => { for (let m = 0; m < cnt; m++, p++) for (let j = jBot + 1; j < jTop; j++) reg[s.idx(p, j)] = k; used[k].cells = cnt; used[k].f = effLength(k, n, cnt, -0.5) / nw; });
  } else { // tilted: two regions split by a line through the centre of the gap
    const t = Math.tan((Math.max(-80, Math.min(80, theta)) * Math.PI) / 180);
    let c0 = 0, c1 = 0;
    for (let j = jBot + 1; j < jTop; j++) for (let i = iL; i <= iR; i++) { const below = s.y(j) - s.x(i) * t < 0; reg[s.idx(i, j)] = below ? 0 : 1; if (below) c0++; else c1++; }
    used[0].cells = c0; used[1].cells = c1; used[0].f = c0 / (c0 + c1); used[1].f = c1 / (c0 + c1);
  }
  for (let k = 0; k < reg.length; k++) if (reg[k] >= 0) s.eps[k] = used[reg[k]].eps;

  const meta = { w: nw * h, d, h, res, nw, npx, npy, ic, iL, iR, jBot, jTop, mode, theta, walls, regions: used, n: used.length };
  s.meta = meta; s.reg = reg;
  if (guess) initialGuess(s);
  return s;
}

/** Effective length of region k (of n) that owns `cnt` node rows/columns, in cells. */
function effLength(k, n, cnt, endHalf = 0.5) {
  if (n === 1) return cnt + 2 * endHalf;
  return cnt + (k === 0 || k === n - 1 ? endHalf : 0);
}

/**
 * Split `total` node rows (or columns) among regions so that the end regions have
 * (count + 1/2) and the interior ones (count) cells, as close to the fractions as
 * possible, every region at least one node. For side-by-side (endHalf false) the end
 * regions are counted the same way: the plate ends are nodes, so (count - 1/2) cells.
 */
export function snapCounts(fracs, total, endHalf) {
  const n = fracs.length;
  if (n === 1) return [total];
  const target = fracs.map((f, k) => f * (endHalf ? total + 1 : total - 1) - (k === 0 || k === n - 1 ? (endHalf ? 0.5 : -0.5) : 0));
  const counts = target.map((t) => Math.max(1, Math.round(t)));
  // fix the sum by nudging the regions whose rounding error is largest
  let diff = total - counts.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const err = counts.map((c, k) => target[k] - c);
    let k = 0;
    if (diff > 0) { k = err.indexOf(Math.max(...err)); counts[k]++; diff--; }
    else { const cand = err.map((e, i) => (counts[i] > 1 ? e : Infinity)); k = cand.indexOf(Math.min(...cand)); if (!Number.isFinite(cand[k])) break; counts[k]--; diff++; }
  }
  return counts;
}

/** Start the free nodes from the 1-D stack solution inside the gap (exact for a layered stack far from the edges). */
function initialGuess(s) {
  const m = s.meta, V = s.V, reg = s.reg, { ic, jBot, res, d } = m;
  // face permittivities down the centre column, conductor faces carrying the dielectric's value
  const inv = [];
  for (let f = 0; f < res; f++) {
    const ka = s.idx(ic, jBot + f), kb = s.idx(ic, jBot + f + 1);
    const fe = s.fixed[ka] ? s.eps[kb] : s.fixed[kb] ? s.eps[ka] : (2 * s.eps[ka] * s.eps[kb]) / (s.eps[ka] + s.eps[kb]);
    inv.push(1 / fe);
  }
  const T = inv.reduce((a, b) => a + b, 0);
  const rowV = [0]; for (let f = 0; f < res; f++) rowV.push(rowV[f] + inv[f] / T);
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
    const k = s.idx(i, j);
    if (s.fixed[k]) continue;
    const y = s.y(j);
    if (reg[k] >= 0) V[k] = m.mode === 'layered' ? rowV[j - jBot] : (y + d / 2) / d;
    else V[k] = y > d / 2 ? 0.5 + 0.5 * Math.max(0, 1 - (y - d / 2) / (3 * d)) : y < -d / 2 ? 0.5 - 0.5 * Math.max(0, 1 - (-y - d / 2) / (3 * d)) : 0.5;
  }
}

// ---------------------------------------------------------------- charges

/**
 * Free charge on the plates per metre of depth (C/m), from D·n at each conductor face, and
 * a node map of the surface density sigma (C/m^2) on the conductor nodes.
 *   top, bottom      total on each plate
 *   topGap[p]        charge per column p = i - iL on the gap-side face of the top plate
 *   topOuter         the rest of the top plate's charge (outer face and plate ends: fringing)
 */
export function plateCharges(s) {
  const { nx, ny, V, eps, fixed } = s, m = s.meta;
  const sigma = new Float64Array(nx * ny);
  let top = 0, bottom = 0, topOuter = 0;
  const topGap = new Float64Array(m.nw + 1);
  const face = (k, kn, i, j, dj) => {
    if (kn < 0 || kn >= nx * ny || fixed[kn]) return;
    const q = EPS0 * eps[kn] * (V[k] - V[kn]); // sigma * h
    sigma[k] += q / m.h;
    if (V[k] > 0.5) { top += q; if (dj === -1 && j === m.jTop) topGap[i - m.iL] += q; else topOuter += q; } else bottom += q;
  };
  for (const j of [m.jBot - 1, m.jBot, m.jTop, m.jTop + 1]) for (let i = m.iL; i <= m.iR; i++) {
    const k = s.idx(i, j);
    if (!fixed[k]) continue;
    if (i + 1 < nx) face(k, k + 1, i, j, 0);
    if (i > 0) face(k, k - 1, i, j, 0);
    if (j + 1 < ny) face(k, k + nx, i, j, +1);
    if (j > 0) face(k, k - nx, i, j, -1);
  }
  return { top, bottom, topGap, topOuter, sigma };
}

/**
 * Bound (polarization) charge on every dielectric face per metre of depth, with a node
 * map of the face density assigned to the dielectric node (the higher-eps side between
 * two dielectrics). Face between dielectric a and b, normal from a to b:
 *   sigma_b = D_n (1/eps_b - 1/eps_a)      (the two faces' P·n added)
 * Face between dielectric m and a conductor, normal out of the dielectric:
 *   sigma_b = P·n = eps0 (eps_m - 1) E_n
 * Returns { sigma, faces: [{ key, a, b, Q }] } with keys "0|1" (regions), "0|top", "1|bottom".
 */
export function boundCharges(s) {
  const { nx, ny, V, eps, fixed } = s, m = s.meta, reg = s.reg;
  const sigma = new Float64Array(nx * ny);
  const totals = new Map();
  const add = (key, a, b, q) => { const e = totals.get(key) ?? { key, a, b, Q: 0 }; e.Q += q; totals.set(key, e); };
  const pair = (k, kn) => {
    if (kn < 0 || kn >= nx * ny) return;
    if (fixed[kn]) { // dielectric node k against a conductor
      if (eps[k] === 1) return;
      const q = EPS0 * (eps[k] - 1) * (V[k] - V[kn]); // sigma_b * h, E_n out of the dielectric = (V_k - V_cond)/h
      sigma[k] += q / m.h;
      add(`${reg[k]}|${V[kn] > 0.5 ? 'top' : 'bottom'}`, reg[k], V[kn] > 0.5 ? 'top' : 'bottom', q);
      return;
    }
    const ea = eps[k], eb = eps[kn];
    if (ea === eb || ea < eb) return;            // counted once, from the higher-eps side
    const fe = (2 * ea * eb) / (ea + eb);
    const q = EPS0 * fe * (V[k] - V[kn]) * (1 / eb - 1 / ea); // D_n (a -> b) times (1/eps_b - 1/eps_a), times h
    sigma[k] += q / m.h;
    const ra = reg[k], rb = reg[kn];
    const lo = Math.min(ra, rb), hi = Math.max(ra, rb);
    add(`${lo}|${hi}`, lo, hi, q);
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = s.idx(i, j);
    if (fixed[k]) continue;
    if (i + 1 < nx) pair(k, k + 1);
    if (i > 0) pair(k, k - 1);
    if (j + 1 < ny) pair(k, k + nx);
    if (j > 0) pair(k, k - nx);
  }
  return { sigma, faces: [...totals.values()] };
}

/** Free charge on the top plate from a Gauss box two cells outside it (C/m). */
export function gaussTopPlate(s) {
  const m = s.meta;
  return s.gaussCharge(Math.max(1, m.iL - 2), m.jTop - 1, Math.min(s.nx - 2, m.iR + 2), Math.min(s.ny - 2, m.jTop + 2));
}

// ---------------------------------------------------------------- per-region table

/**
 * The quantities the handout compares region by region, from the solved field (V = 1 scale).
 * layered: at the centre column, V_i from the face drops that belong to the region (the face
 *          between two regions is half a cell of each), E_i = V_i / d_i, D_i = eps0 eps_i E_i.
 * side:    E_y and D_y at the mid-gap row in the middle of each region, the gap-side plate
 *          charge Q_i over the region's columns (C/m) and its share of the total.
 * tilted:  E and D sampled 2 h either side of the interface at the gap centre, split into
 *          components normal and tangential to the interface. Approximate: the field near a
 *          tilted interface between finite plates is not uniform, so this is a local reading,
 *          not the clean refraction law (the Interface tab has that).
 */
export function regionTable(s, plates) {
  const m = s.meta, { regions, h } = m, V = s.V;
  const rows = [];
  if (m.mode === 'layered') {
    let q = 0; // row index relative to jBot
    regions.forEach((r, k) => {
      let drop = 0;
      // faces q -> q+1 for the rows this region owns, with the boundary faces shared
      const first = q, last = q + r.cells; // faces first..last ; face f joins rows f and f+1
      // The harmonic-mean face between two regions is half a cell of each material, so its
      // drop splits in proportion to 1/eps: region k's share of the face to region j is eps_j / (eps_k + eps_j).
      for (let f = first; f <= last; f++) {
        const dv = V[s.idx(m.ic, m.jBot + f + 1)] - V[s.idx(m.ic, m.jBot + f)];
        let share = 1;
        if (f === first && k > 0) share = regions[k - 1].eps / (regions[k - 1].eps + r.eps);
        if (f === last && k < m.n - 1) share = regions[k + 1].eps / (regions[k + 1].eps + r.eps);
        drop += share * dv;
      }
      const di = r.f * m.d;
      const E = drop / di;
      rows.push({ k, eps: r.eps, len: di, V: drop, E, D: EPS0 * r.eps * E, share: drop });
      q += r.cells;
    });
  } else if (m.mode === 'side') {
    const jm = Math.round((m.jBot + m.jTop) / 2);
    const total = plates.topGap.reduce((a, b) => a + b, 0);
    let p = 0;
    regions.forEach((r, k) => {
      const pc = Math.min(m.nw, p + Math.floor(r.cells / 2));
      const i = m.iL + pc;
      const E = (V[s.idx(i, jm + 1)] - V[s.idx(i, jm - 1)]) / (2 * h); // |E_y| = dV/dy: E points from the + plate (top) down
      let Q = 0; for (let c = 0; c < r.cells; c++) Q += plates.topGap[p + c];
      rows.push({ k, eps: r.eps, len: r.f * m.w, E, D: EPS0 * r.eps * E, Q, share: Q / total });
      p += r.cells;
    });
  } else {
    const th = (m.theta * Math.PI) / 180, nrm = [-Math.sin(th), Math.cos(th)], tan = [Math.cos(th), Math.sin(th)]; // normal from region 0 to 1
    const [ex, ey] = s.E();
    regions.forEach((r, k) => {
      const sgn = k === 0 ? -1 : 1, x = sgn * 2 * h * nrm[0], y = sgn * 2 * h * nrm[1];
      const Ex = ex.sample(x, y), Ey = ey.sample(x, y);
      const En = Ex * nrm[0] + Ey * nrm[1], Et = Ex * tan[0] + Ey * tan[1];
      rows.push({ k, eps: r.eps, len: NaN, En, Et, Dn: EPS0 * r.eps * En, Dt: EPS0 * r.eps * Et, E: Math.hypot(Ex, Ey), D: EPS0 * r.eps * Math.hypot(Ex, Ey), angle: (Math.atan2(Math.abs(Et), Math.abs(En)) * 180) / Math.PI, at: [x, y] });
    });
  }
  return rows;
}

// ---------------------------------------------------------------- ideal formulas (per metre of depth, F/m)

/** Layered: capacitors in series, 1/C' = sum d_i / (eps0 eps_i w). */
export function seriesC(w, d, regions) { return 1 / regions.reduce((a, r) => a + (r.f * d) / (EPS0 * r.eps * w), 0); }
/** Side by side: capacitors in parallel, C' = sum eps0 eps_i w_i / d. */
export function parallelC(w, d, regions) { return regions.reduce((a, r) => a + (EPS0 * r.eps * r.f * w) / d, 0); }
/** The ideal (no fringing) value for the mode, or the Wiener bounds for a tilted interface. */
export function idealC(meta) {
  const { w, d, regions, mode } = meta;
  if (mode === 'layered') return { C: seriesC(w, d, regions), label: 'series (layered)' };
  if (mode === 'side') return { C: parallelC(w, d, regions), label: 'parallel (side by side)' };
  return { C: NaN, lo: seriesC(w, d, regions), hi: parallelC(w, d, regions), label: 'no closed form; Wiener bounds' };
}

/** The handout's slab force per metre of depth at voltage V: (eps1 - eps2) eps0 V^2 / (2 d). */
export function idealSlabForce(meta, V) { const r = meta.regions; return ((r[0].eps - (r[1]?.eps ?? 1)) * EPS0 * V * V) / (2 * meta.d); }
