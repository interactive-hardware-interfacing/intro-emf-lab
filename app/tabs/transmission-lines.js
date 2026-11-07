// Transmission-line parameters tab.
//   A TEM line is fully described by its cross-section: the per-unit-length capacitance C'
//   (an electrostatic problem) fixes everything else, because for a TEM wave L'C' = mu eps.
//   Three cross-sections with closed forms: coaxial, twin-lead (two round wires, the exact
//   image solution from the Line-charge tab) and parallel plates (ideal interior field).
//   A "Numeric check" view solves the same cross-section with the Gauss-Seidel solver
//   (core/relax2d.js) and reads C' from a Gauss box around the inner conductor.
//
// Units: the side panel takes millimetres; everything in the model is SI (metres).

import { EPS0, MU0 } from '../../core/constants.js';
import { lineChargeE, lineChargeV } from '../../core/analytic.js';
import { Relax2D } from '../../core/relax2d.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween, radialSeeds } from '../../core/render.js';
import { SolverClient } from '../solverclient.js';
import { plotView } from '../views.js';
import { getNum } from '../state.js';
import { ui } from '../shell.js';

const C0 = 1 / Math.sqrt(MU0 * EPS0);
const GRID_N = 161;      // display grid
const V0 = 1;            // volts between the conductors; C' = lambda / V0

/**
 * Closed-form per-unit-length parameters. p = { geom, a, b, d, w, epsR } in metres.
 * Returns { C, L, Z0, v, note } with C in F/m, L in H/m, Z0 in ohms, v in m/s.
 * For any TEM line L'C' = mu0 eps0 epsR (the fields of the TEM mode are the static ones),
 * so L' follows from C' without a second calculation.
 */
export function lineParams(p) {
  const eps = EPS0 * p.epsR;
  let C, note;
  if (p.geom === 'coax') {
    C = 2 * Math.PI * eps / Math.log(p.b / p.a);
    note = 'exact';
  } else if (p.geom === 'twin') {
    // Two round wires of radius a, centre spacing d: image solution, exact.
    C = Math.PI * eps / Math.acosh(p.d / (2 * p.a));
    note = 'exact (image solution)';
  } else {
    // Parallel plates of width w and separation d: ideal interior field, no fringing.
    C = eps * p.w / p.d;
    note = 'ideal, no fringing';
  }
  const L = MU0 * EPS0 * p.epsR / C;
  return { C, L, Z0: Math.sqrt(L / C), v: 1 / Math.sqrt(L * C), note };
}

/** Thin-wire approximation for the twin-lead, for comparison: C' = pi eps / ln(d/a). */
export function twinThinWireC(p) { return Math.PI * EPS0 * p.epsR / Math.log(p.d / p.a); }

const GEOMS = {
  coax: { label: 'Coaxial cable' },
  twin: { label: 'Twin-lead (two round wires)' },
  plates: { label: 'Parallel plates' },
};

export default {
  id: 'transmission-lines',
  title: 'Transmission lines',
  phase: 5,
  available: true,
  summary: 'Per-unit-length C′, L′, Z₀ and v of coax, twin-lead and parallel-plate lines from their cross-section field.',
  extent: [-2e-3, 2e-3, -2e-3, 2e-3],
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', signed: true, default: true },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'Dmag', label: '|D| = ε|E|', kind: 'scalar', unit: 'C/m²', log: true, eq: 'D' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour', eq: 'V', default: true },
  ],

  // state (metres)
  geom: 'coax',
  a: 0.45e-3,     // inner radius (coax) / wire radius (twin)
  b: 1.475e-3,    // outer radius (coax)
  d: 3e-3,        // centre spacing (twin) / plate separation (plates)
  w: 10e-3,       // plate width
  epsR: 2.25,
  n: 161,         // solver grid for the numeric check

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.geom = GEOMS[s.geom] ? s.geom : 'coax';
    const mm = 1e-3;
    this.a = getNum(s, 'a', 0.45) * mm;
    this.b = getNum(s, 'b', 1.475) * mm;
    this.d = getNum(s, 'd', this.geom === 'plates' ? 1 : 3) * mm;
    this.w = getNum(s, 'w', 10) * mm;
    this.epsR = Math.max(1, getNum(s, 'er', 2.25));
    this.n = [121, 161, 241].includes(getNum(s, 'n', 161)) ? getNum(s, 'n', 161) : 161;
    this.validate();
    this.numeric = null;        // { C, sweeps, residual, converged, history }
    this.client = new SolverClient({ onFrame: (m) => this.onFrame(m) });
    this.views = [plotView('check', 'Numeric check', (ctx, w, h) => this.drawCheck(ctx, w, h))];
    this.applyExtent();
    this.buildControls();
  },

  destroy() { this.client?.terminate(); this.client = null; this.shell.solverRunning = false; },

  /** Keep the geometry physical: b > a for the coax, d > 2a for the twin-lead. */
  validate() {
    if (this.geom === 'coax' && this.b <= this.a * 1.05) this.b = this.a * 1.05;
    if (this.geom === 'twin' && this.d <= 2 * this.a * 1.05) this.d = 2 * this.a * 1.05;
  },

  params() { return { geom: this.geom, a: this.a, b: this.b, d: this.d, w: this.w, epsR: this.epsR }; },

  /** Square display window around the cross-section. */
  applyExtent() {
    let R;
    if (this.geom === 'coax') R = 1.15 * this.b;
    else if (this.geom === 'twin') R = 1.6 * (this.d / 2 + this.a);
    else R = 0.8 * Math.max(this.w, this.d);
    this.shell.setExtent([-R, R, -R, R], ['x', 'y']);
  },

  // ------------------------------------------------------------ closed-form field

  /** Twin-lead: line charge that puts the wires at +-V0/2, and the image offset. */
  twinSetup() {
    const D = this.d / 2;
    const lam = lineParams(this.params()).C * V0;             // C' V0 per wire
    return { D, bImg: Math.sqrt(Math.max(D * D - this.a * this.a, 1e-18)), lam };
  },

  /** { V, E:[Ex,Ey] } at (x, y). V = 0 on the outer conductor (coax) or by symmetry (others). */
  at(x, y) {
    const er = this.epsR;
    if (this.geom === 'coax') {
      const r = Math.hypot(x, y), { a, b } = this;
      if (r <= a) return { V: V0, E: [0, 0] };
      if (r >= b) return { V: 0, E: [0, 0] };
      const lnba = Math.log(b / a);
      const Er = V0 / (r * lnba);
      return { V: V0 * Math.log(b / r) / lnba, E: [Er * x / r, Er * y / r] };
    }
    if (this.geom === 'twin') {
      const { D, bImg, lam } = this.twinSetup();
      if (Math.hypot(x - D, y) <= this.a) return { V: V0 / 2, E: [0, 0] };
      if (Math.hypot(x + D, y) <= this.a) return { V: -V0 / 2, E: [0, 0] };
      // The analytic helpers assume eps0: the dielectric scales the line charges by 1/epsR.
      const e1 = lineChargeE(lam / er, [bImg, 0], [x, y]), e2 = lineChargeE(-lam / er, [-bImg, 0], [x, y]);
      const v = lineChargeV(lam / er, [bImg, 0], [x, y], 1) + lineChargeV(-lam / er, [-bImg, 0], [x, y], 1);
      return { V: v, E: [e1[0] + e2[0], e1[1] + e2[1]] };
    }
    // plates: ideal interior field, zero outside (the real fringing field is in the numeric check)
    const { w, d } = this;
    if (Math.abs(x) <= w / 2 && Math.abs(y) <= d / 2) return { V: V0 * y / d, E: [0, -V0 / d] };
    return { V: Math.abs(x) <= w / 2 ? Math.sign(y) * V0 / 2 : 0, E: [0, 0] };
  },

  compute() {
    const ext = this.shell.view.extent;
    const mk = () => new Grid2D(GRID_N, GRID_N, ext);
    this.gridV = mk(); this.gridEx = mk(); this.gridEy = mk();
    for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
      const f = this.at(this.gridV.x(i), this.gridV.y(j));
      this.gridV.set(i, j, f.V); this.gridEx.set(i, j, f.E[0]); this.gridEy.set(i, j, f.E[1]);
    }
    this.gridEmag = magnitude(this.gridEx, this.gridEy);
    this.gridDmag = new Grid2D(GRID_N, GRID_N, ext, this.gridEmag.data.map((e) => e * EPS0 * this.epsR));
    this.vRange = this.geom === 'coax' ? [0, V0] : [-V0 / 2, V0 / 2];
    const e = Array.from(this.gridEmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((p, q) => p - q);
    this.eRange = e.length ? [e[Math.floor(0.02 * (e.length - 1))], e[Math.floor(0.98 * (e.length - 1))]] : [1, 10];
    this.renderResults();
  },

  render(layer, ctx, view, opts) {
    const eFn = (x, y) => this.at(x, y).E;
    const er = EPS0 * this.epsR;
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? this.vRange[0], max: opts.max ?? this.vRange[1] });
      case 'Emag': return drawScalarField(ctx, this.gridEmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.eRange[0], max: opts.max ?? this.eRange[1] });
      case 'Dmag': return drawScalarField(ctx, this.gridDmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.eRange[0] * er, max: opts.max ?? this.eRange[1] * er });
      case 'E':
        if (opts.style === 'lines') {
          const seeds = [];
          let stop;
          if (this.geom === 'coax') { seeds.push(...radialSeeds(0, 0, this.a * 1.06, 24)); stop = (x, y) => Math.hypot(x, y) >= this.b * 0.995 || Math.hypot(x, y) <= this.a; }
          else if (this.geom === 'twin') { const { D } = this.twinSetup(); seeds.push(...radialSeeds(D, 0, this.a * 1.08, 20)); stop = (x, y) => Math.hypot(x - D, y) < this.a || Math.hypot(x + D, y) < this.a; }
          else { for (let k = 0; k < 16; k++) seeds.push([-this.w / 2 + (k + 0.5) * this.w / 16, this.d / 2 * 0.95]); stop = (x, y) => Math.abs(y) >= this.d / 2 * 0.98 || Math.abs(x) > this.w / 2; }
          drawStreamlines(ctx, view, eFn, seeds, { stopFn: stop, maxSteps: 3000 });
        } else drawQuiver(ctx, view, eFn, { normalize: true });
        return null;
      case 'Veq':
        drawContours(ctx, view, this.gridV, levelsBetween(this.vRange[0], this.vRange[1], 12), { color: 'rgba(0,0,0,0.55)' });
        return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    ctx.save();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(255,255,255,0.18)';
    const circle = (x, y, r) => { const [px, py] = view.toPx(x, y); ctx.beginPath(); ctx.arc(px, py, r / view.scale, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); };
    if (this.geom === 'coax') { circle(0, 0, this.a); const [px, py] = view.toPx(0, 0); ctx.beginPath(); ctx.arc(px, py, this.b / view.scale, 0, 2 * Math.PI); ctx.stroke(); }
    else if (this.geom === 'twin') { const { D } = this.twinSetup(); circle(D, 0, this.a); circle(-D, 0, this.a); }
    else {
      for (const s of [-1, 1]) { const [x0, y0] = view.toPx(-this.w / 2, s * this.d / 2), [x1] = view.toPx(this.w / 2, 0); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineWidth = 3; ctx.stroke(); }
    }
    ctx.restore();
  },

  // ------------------------------------------------------------ numeric check (Gauss-Seidel)

  /**
   * Build the same cross-section on the solver grid. The coax needs no box: the outer
   * conductor is the boundary. The plates get insulating (Neumann) walls, so the numeric C'
   * includes the fringing field the ideal formula leaves out. The twin-lead's walls are
   * held at the exact far potential, so the box does not disturb the comparison and the
   * check is of the interior solution.
   */
  buildSolver() {
    const n = this.n, ext = this.shell.view.extent;
    const s = new Relax2D(n, n, ext, { boundary: this.geom === 'plates' ? 'neumann' : 'dirichlet', boxV: 0 });
    const h = s.h;
    if (this.geom === 'coax') {
      s.fixWhere((x, y) => Math.hypot(x, y) <= this.a, V0);
      s.fixWhere((x, y) => Math.hypot(x, y) >= this.b, 0);
      s.epsWhere(() => true, this.epsR);
      const m = Math.round((this.a + this.b) / 2 / h), c = (n - 1) / 2;
      this.gaussBox = [Math.round(c - m), Math.round(c - m), Math.round(c + m), Math.round(c + m)];
    } else if (this.geom === 'twin') {
      const { D } = this.twinSetup();
      s.fixWhere((x, y) => Math.hypot(x - D, y) <= this.a, V0 / 2);
      s.fixWhere((x, y) => Math.hypot(x + D, y) <= this.a, -V0 / 2);
      s.epsWhere(() => true, this.epsR);
      for (let i = 0; i < n; i++) for (const j of [0, n - 1]) s.setFixed(i, j, this.at(s.x(i), s.y(j)).V);
      for (let j = 0; j < n; j++) for (const i of [0, n - 1]) s.setFixed(i, j, this.at(s.x(i), s.y(j)).V);
      const i0 = Math.round((D - this.a - ext[0]) / h) - 2, i1 = Math.round((D + this.a - ext[0]) / h) + 2;
      const j0 = Math.round((-this.a - ext[2]) / h) - 2, j1 = Math.round((this.a - ext[2]) / h) + 2;
      this.gaussBox = [Math.max(1, i0), Math.max(1, j0), Math.min(n - 2, i1), Math.min(n - 2, j1)];
    } else {
      const t = Math.max(2 * h, 0.03 * this.d); // plate thickness on the grid
      s.fixWhere((x, y) => Math.abs(x) <= this.w / 2 && y >= this.d / 2 && y <= this.d / 2 + t, V0 / 2);
      s.fixWhere((x, y) => Math.abs(x) <= this.w / 2 && y <= -this.d / 2 && y >= -this.d / 2 - t, -V0 / 2);
      s.epsWhere(() => true, this.epsR);
      const i0 = Math.round((-this.w / 2 - ext[0]) / h) - 3, i1 = Math.round((this.w / 2 - ext[0]) / h) + 3;
      const j0 = Math.round((this.d / 2 - ext[2]) / h) - 3, j1 = Math.round((this.d / 2 + t - ext[2]) / h) + 3;
      this.gaussBox = [Math.max(1, i0), Math.max(1, j0), Math.min(n - 2, i1), Math.min(n - 2, j1)];
    }
    return s;
  },

  async runCheck() {
    if (!this.client || this.running) return;
    this.solver = this.buildSolver();
    this.numeric = { C: NaN, sweeps: 0, residual: Infinity, converged: false, history: [], n: this.n, h: this.solver.h };
    this.running = true; this.shell.solverRunning = true;
    this.shell.setStageView('check'); this.shell.syncUrl();
    this.renderResults(); this.shell.refreshStatus();
    try {
      await this.client.init(this.solver, 'cartesian');
      const done = await this.client.run({ k: 50, tol: 1e-7 * V0 });
      this.takeFrame(done);
      this.numeric.converged = done.converged;
      this.finishCheck();
    } catch { /* cancelled */ }
    this.running = false; this.shell.solverRunning = false;
    this.renderResults(); this.shell.refreshStatus(); this.shell.updateStageView();
  },

  stopCheck() { this.client?.cancel(); },

  takeFrame(m) {
    this.solver.V.set(m.V); this.numeric.sweeps = m.sweeps; this.numeric.residual = m.residual;
    if (Number.isFinite(m.residual) && m.residual > 0) this.numeric.history.push([m.sweeps, m.residual]);
  },

  onFrame(m) {
    if (!this.numeric || !this.solver) return;
    this.takeFrame(m);
    this.numeric.C = this.solver.gaussCharge(...this.gaussBox) / V0;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.shell.updateStageView(); this.shell.refreshStatus(); this.renderResults(); });
  },

  finishCheck() {
    this.numeric.C = this.solver.gaussCharge(...this.gaussBox) / V0;
    this.numeric.W = this.solver.energy();
  },

  drawCheck(ctx, W, H) {
    const ex = lineParams(this.params());
    ctx.fillStyle = '#1b1a18'; ctx.font = '14px system-ui'; ctx.textBaseline = 'top';
    const lines = [];
    const pFm = (c) => `${(c * 1e12).toPrecision(5)} pF/m`;
    lines.push(`C′ closed form (${ex.note}): ${pFm(ex.C)}`);
    if (this.geom === 'plates') lines.push('The ideal formula ignores fringing; the numeric solve (insulating box walls) includes it, so expect the numeric value to be higher, more so for narrow plates.');
    if (!this.numeric) lines.push('', 'Press “Run numeric check” to solve this cross-section with the Gauss–Seidel solver and read C′ from a Gauss box around the inner conductor.');
    else {
      const nu = this.numeric, diff = 100 * (nu.C / ex.C - 1);
      lines.push(`C′ Gauss–Seidel, ${nu.n}×${nu.n} grid (h = ${(nu.h * 1e6).toFixed(1)} µm): ${Number.isFinite(nu.C) ? pFm(nu.C) : '—'}   ${Number.isFinite(diff) ? `(${diff >= 0 ? '+' : ''}${diff.toFixed(2)} %)` : ''}`);
      if (Number.isFinite(nu.W) && this.geom !== 'twin') lines.push(`C′ from energy 2W/V²: ${pFm(2 * nu.W / (V0 * V0))}`); // twin-lead: the walls carry flux, so 2W ≠ λV there
      lines.push(`${nu.sweeps} sweeps · max |ΔV| = ${Number.isFinite(nu.residual) ? nu.residual.toExponential(2) : '—'} V · ${this.running ? 'solving…' : nu.converged ? 'converged' : 'stopped'}`);
    }
    let y = 12;
    for (const l of lines) { ctx.fillText(l, 14, y); y += 20; }
    // residual history
    const Hh = this.numeric?.history ?? [];
    if (Hh.length < 2) return;
    const top = y + 16, left = 60, bottom = H - 30, right = W - 16;
    const xs = Hh.map((p) => p[0]), ys = Hh.map((p) => Math.log10(p[1]));
    const tol = Math.log10(1e-7 * V0);
    const x1 = Math.max(...xs), y0 = Math.min(...ys, tol), y1 = Math.max(...ys);
    const px = (x) => left + (x / (x1 || 1)) * (right - left);
    const py = (v) => top + (1 - (v - y0) / (y1 - y0 || 1)) * (bottom - top);
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left, py(tol)); ctx.lineTo(right, py(tol)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 1.5; ctx.beginPath();
    Hh.forEach((p, k) => { const X = px(p[0]), Y = py(Math.log10(p[1])); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
    ctx.stroke();
    ctx.fillStyle = '#5a5955'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(`1e${y1.toFixed(0)}`, left - 6, top); ctx.fillText(`1e${y0.toFixed(0)}`, left - 6, bottom - 12);
    if (py(tol) < bottom - 30) ctx.fillText('tol', left - 6, py(tol) - 6);
    ctx.textAlign = 'right'; ctx.fillText(`sweeps (0 … ${x1})`, right, bottom + 8);
    ctx.textAlign = 'left'; ctx.fillText('max |ΔV| per sweep (log scale): the convergence of the neighbour-averaging solver', left, bottom + 8);
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', this.title));
    box.appendChild(ui.lead(shell, 'The cross-section field of a TEM line gives C′, and with it L′, Z₀ and v.'));
    const re = () => { this.stopCheck(); this.validate(); this.applyExtent(); this.numeric = null; this.buildControls(); shell.recompute(); shell.syncUrl(); shell.updateStageView(); };
    const mm = 1e-3;
    const pf = (key, label, min, max) => ui.field(label, ui.number(this[key] / mm, { min, max, onChange: (v) => { this[key] = v * mm; re(); } }));
    box.appendChild(ui.field('Line', ui.select(Object.entries(GEOMS).map(([k, g]) => [k, g.label]), this.geom, (v) => { this.geom = v; if (v === 'plates' && this.d > 5 * mm) this.d = 1 * mm; if (v === 'twin' && this.d < 2.2 * this.a) this.d = 3 * mm; re(); })));
    const r1 = ui.el('div', 'row');
    if (this.geom === 'coax') r1.append(pf('a', 'Inner radius a (mm)', 0.05, 50), pf('b', 'Outer radius b (mm)', 0.06, 60));
    else if (this.geom === 'twin') r1.append(pf('a', 'Wire radius a (mm)', 0.05, 50), pf('d', 'Centre spacing d (mm)', 0.12, 200));
    else r1.append(pf('w', 'Plate width w (mm)', 0.1, 200), pf('d', 'Separation d (mm)', 0.05, 100));
    r1.appendChild(ui.field('Dielectric εr', ui.number(this.epsR, { min: 1, max: 100, onChange: (v) => { this.epsR = Math.max(1, v); re(); } })));
    box.appendChild(r1);
    box.appendChild(ui.el('p', 'hint', this.geom === 'coax' ? 'Defaults are RG-58: a = 0.45 mm, b = 1.475 mm, polyethylene εr = 2.25 → about 50 Ω. The outer conductor is at 0 V, the inner at 1 V.'
      : this.geom === 'twin' ? 'Exact image solution: the wires at ±0.5 V are equipotentials of two line charges at x = ±√((d/2)² − a²). Needs d > 2a.'
        : 'Ideal parallel-plate line: uniform field between the plates (±0.5 V), nothing outside. Real plates have fringing, which the numeric check shows.'));

    box.appendChild(ui.el('h2', '', 'Line parameters (per unit length)'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'C′ from the electrostatic field; L′ = μ₀ε₀εr / C′ because L′C′ = με for any TEM line; Z₀ = √(L′/C′); v = 1/√(L′C′) = c/√εr. A TEM line has no cutoff: these values hold from DC up to where the cross-section is no longer small compared with the wavelength.'));

    box.appendChild(ui.el('h2', '', 'Numeric check'));
    const r2 = ui.el('div', 'row');
    r2.appendChild(ui.field('Solver grid', ui.select([[121, 'coarse (121²)'], [161, 'normal (161²)'], [241, 'fine (241²)']], String(this.n), (v) => { this.n = parseInt(v, 10); shell.syncUrl(); })));
    box.appendChild(r2);
    const r3 = ui.el('div', 'row');
    this.btnRun = ui.button(this.running ? 'Stop' : 'Run numeric check', () => (this.running ? this.stopCheck() : this.runCheck()), 'btn');
    r3.append(this.btnRun, ui.button('Show check view', () => { shell.setStageView('check'); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(r3);
    box.appendChild(ui.el('p', 'hint', 'Solves the same cross-section with the Gauss–Seidel neighbour average and reads the charge per unit length on the inner conductor from a Gauss box: C′ = λ/V. The “Numeric check” view shows the convergence.'));
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl) return;
    const tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    const r = lineParams(this.params());
    row(`C′ (${r.note})`, `${(r.C * 1e12).toPrecision(4)} pF/m`);
    row('L′ = με / C′', `${(r.L * 1e9).toPrecision(4)} nH/m`);
    row('Z₀ = √(L′/C′)', `${r.Z0.toPrecision(4)} Ω`);
    row('v = 1/√(L′C′)', `${(r.v / C0).toPrecision(4)} c = ${(r.v / 1e8).toPrecision(4)}×10⁸ m/s`);
    if (this.geom === 'twin') row('thin-wire approx. πε/ln(d/a)', `${(twinThinWireC(this.params()) * 1e12).toPrecision(4)} pF/m`);
    if (this.numeric && Number.isFinite(this.numeric.C)) row('C′ Gauss–Seidel', `${(this.numeric.C * 1e12).toPrecision(4)} pF/m (${(100 * (this.numeric.C / r.C - 1)).toFixed(2)} %)${this.running ? ' …' : ''}`);
    if (this.btnRun) this.btnRun.textContent = this.running ? 'Stop' : 'Run numeric check';
  },

  statusText() {
    const r = lineParams(this.params());
    const nu = this.numeric;
    const chk = nu ? ` · check: ${nu.sweeps} sweeps, max |ΔV| = ${Number.isFinite(nu.residual) ? nu.residual.toExponential(2) : '—'}${this.running ? ' (solving)' : nu.converged ? ' (converged)' : ''}` : '';
    return `${GEOMS[this.geom].label}: Z₀ = ${r.Z0.toPrecision(4)} Ω, v = ${(r.v / C0).toPrecision(3)} c${chk}`;
  },

  probe(x, y) {
    const f = this.at(x, y), E = Math.hypot(f.E[0], f.E[1]);
    const rows = [
      { label: 'V', value: f.V, unit: 'V' },
      { label: 'Ex', value: f.E[0], unit: 'V/m' }, { label: 'Ey', value: f.E[1], unit: 'V/m' },
      { label: '|E|', value: E, unit: 'V/m' },
      { label: '|D| = ε|E|', value: EPS0 * this.epsR * E, unit: 'C/m²' },
    ];
    if (this.numeric && this.solver && Number.isFinite(this.numeric.C)) {
      const g = new Grid2D(this.solver.nx, this.solver.ny, this.solver.extent, this.solver.V);
      rows.push({ label: 'V Gauss–Seidel', value: g.sample(x, y), unit: 'V' });
    }
    return rows;
  },

  getState() {
    const mm = 1e-3;
    return { geom: this.geom, a: +(this.a / mm).toPrecision(6), b: +(this.b / mm).toPrecision(6), d: +(this.d / mm).toPrecision(6), w: +(this.w / mm).toPrecision(6), er: this.epsR, n: this.n };
  },

  csv() {
    const g = this.gridV;
    const lines = ['x_m,y_m,V_V,Ex_Vpm,Ey_Vpm'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridEx.get(i, j)},${this.gridEy.get(i, j)}`);
    return lines.join('\n');
  },
};
