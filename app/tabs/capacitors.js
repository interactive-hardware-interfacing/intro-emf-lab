// Capacitors tab (Lab 3): a disk capacitor with a three-layer dielectric, solved in (r, z)
// by the neighbour-averaging solver in a Web Worker. Capacitance from stored energy and
// from Gauss's law around the top plate, beside the handout's ideal series formula.
// D, E and P along the axis, parameter sweeps with CSV export.

import { EPS0 } from '../../core/constants.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { Axisym, diskCapacitor, idealLayeredC, kirchhoffC } from '../../core/axisym.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween } from '../../core/render.js';
import { SolverClient } from '../solverclient.js';
import { mirrorGrid } from '../mirror.js';
import { plotView, iso3dView } from '../views.js';
import { getNum, downloadText } from '../state.js';
import { ui, sci } from '../shell.js';

const SWEEPABLE = [['g', 'Cap height / gap (mm)'], ['R', 'Plate radius (mm)'], ['epsR', 'Epsilon R (centre layer)'], ['epsR2', 'Epsilon R 2 (outer layers)'], ['V', 'Applied voltage (V)']];

export default {
  id: 'capacitors',
  title: 'Capacitors',
  phase: 3,
  available: true,
  summary: 'Disk capacitor with a three-layer dielectric, solved in (r, z).',
  extent: [0, 0.028, -0.014, 0.014],
  axes: ['r', 'z'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', default: true },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'w', label: 'Energy density', kind: 'scalar', unit: 'J/m³', log: true, eq: 'E' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'D', label: 'D field', kind: 'vector', styles: ['arrows'] },
    { id: 'P', label: 'P field', kind: 'vector', styles: ['arrows'] },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour', eq: 'V', default: true },
    { id: 'J', label: 'J', kind: 'info', available: false, note: 'J = 0, dD/dt = 0' },
  ],

  p: { V: 5, g: 4, R: 6, t: 0.5, epsR: 5, epsR2: 5 }, // mm for lengths in the UI
  pDefaults: { V: 5, g: 4, R: 6, t: 0.5, epsR: 5, epsR2: 5 },
  res: 4,
  walls: 'neumann',
  mirror: true,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `c_${k}`, this.p[k]);
    this.res = [2, 4, 6].includes(getNum(s, 'res', 4)) ? getNum(s, 'res', 4) : 4;
    this.walls = s.walls === 'dirichlet' ? 'dirichlet' : 'neumann';
    this.mirror = s.half !== '1';
    this.sweep = { param: s.sw ?? 'g', from: getNum(s, 'sw0', 2), to: getNum(s, 'sw1', 8), n: Math.round(getNum(s, 'swn', 5)), rows: [], running: false, progress: '' };
    this.client = new SolverClient({ onFrame: (m) => this.onFrame(m) });
    this.build();
    this.views = [
      iso3dView('3d', '3D', this.isoSource(), shell),
      plotView('axis', 'Axis plots', (ctx, w, h) => this.drawCutline(ctx, w, h)),
      plotView('sweep', 'Sweep', (ctx, w, h) => this.drawSweep(ctx, w, h)),
    ];
    this.buildControls();
    this.solve();
  },

  destroy() { this.client?.terminate(); this.client = null; this.shell.solverRunning = false; },

  /** What the 3D view needs: the current colour-layer grid (mirrored), a sampler, and the geometry. */
  isoSource() {
    const tab = this;
    const gridFor = () => {
      const id = this.shell.colorLayer;
      const g = id === 'Emag' ? this.gridEmag : id === 'w' ? this.gridW : this.gridV;
      if (!g) return null;
      return this.mirror ? g : mirrorGrid(g);
    };
    return {
      grid: gridFor,
      scalarAt: (r, z) => gridFor()?.sample(r, z) ?? NaN,
      get log() { return !!tab.layers.find((L) => L.id === tab.shell.colorLayer)?.log; },
      zRange: () => [this.solver.extent[2], this.solver.extent[3]],
      cylinders: () => { const { g, R, t } = this.meta; return [
        { r0: 0, r1: R, z0: -g / 2, z1: g / 2, color: 'rgba(80,220,220,0.8)' },
        { r0: 0, r1: R, z0: g / 2, z1: g / 2 + t, color: '#fff', fill: 'rgba(229,72,77,0.55)', label: `+${this.meta.V} V` },
        { r0: 0, r1: R, z0: -g / 2 - t, z1: -g / 2, color: '#fff', fill: 'rgba(59,130,246,0.55)', label: '0 V' },
      ]; },
    };
  },

  // ------------------------------------------------------------ model

  build(p = this.p, { forSweep = false } = {}) {
    const mm = 1e-3;
    // Sweeps run at coarse resolution with a tighter grid cap so each point takes seconds, not minutes.
    this.solver = diskCapacitor({ V: p.V, g: p.g * mm, R: p.R * mm, t: p.t * mm, epsR: p.epsR, epsR2: p.epsR2, cellsPerLayer: forSweep ? 2 : this.res, maxCells: forSweep ? 120 : 300, walls: this.walls });
    this.meta = this.solver.meta;
    this.applyView();
    this.V = new Float64Array(this.solver.V);
    this.results = null;
    this.sweeps = 0; this.residual = Infinity; this.converged = false;
  },

  /** Full cross-section (mirrored across the axis, device in the middle) or the r-z half-plane. */
  applyView() {
    const e = this.solver.extent;
    if (this.mirror) this.shell.setExtent([-e[1], e[1], e[2], e[3]], ['x', 'z']);
    else this.shell.setExtent(e, ['r', 'z']);
  },

  /** Mirror-aware sampling: x may be negative in the full cross-section. */
  rOf(x) { return this.mirror ? Math.abs(x) : x; },

  /**
   * Stop when the largest per-sweep change is below 2e-8 V (for V = 1). The energy-based C
   * settles at 100x looser tolerance, but the Gauss-box charge lags: at 2e-6 V the two rows
   * differed by 0.17% purely from incomplete convergence, which read like a method difference.
   */
  tol() { return 2e-8 * this.meta.V; },

  async solve() {
    if (!this.client) return;
    this.shell.solverRunning = true; this.shell.renderEquations();
    const id = this.solveId = (this.solveId ?? 0) + 1; // a newer solve() supersedes this one: its continuation must not clear the flags
    this.running = true; this.converged = false;
    try {
      await this.client.init(this.solver, 'axisym');
      const done = await this.client.run({ k: 50, tol: this.tol() });
      this.V = done.V; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
      this.finish();
    } catch { /* cancelled */ }
    if (id !== this.solveId) return;
    this.running = false; this.shell.solverRunning = false; this.shell.renderEquations();
    this.shell.refreshStatus();
  },

  onFrame(m) {
    this.V = m.V; this.sweeps = m.sweeps; this.residual = m.residual;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.shell.recompute(); });
  },

  /** Capacitance three ways on the converged solution. */
  finish() {
    const s = this.solverWithV();
    const { V, g, R, t, h, epsR, epsR2 } = this.meta;
    const W = s.energy();
    const cEnergy = 2 * W / (V * V);
    const jTop = Math.round((g / 2 - s.z0) / h), jTopEnd = Math.round((g / 2 + t - s.z0) / h);
    const Q = s.gaussCharge(0, jTop - 1, Math.min(s.nr - 2, Math.round((R + 3 * h) / h)), Math.min(s.nz - 2, jTopEnd + 1));
    const cGauss = Q / V;
    const cIdeal = idealLayeredC({ g, R, epsR, epsR2 });
    const epsEff = 1 / ((2 / epsR2 + 1 / epsR) / 3); // series-equivalent permittivity of the stack
    const cKirch = kirchhoffC({ g, R, epsEff });
    this.results = { W, Q, cEnergy, cGauss, cIdeal, cKirch, epsEff };
    this.renderResults();
    this.shell.recompute();
  },

  solverWithV() {
    const s = new Axisym(this.solver.nr, this.solver.nz, { h: this.solver.h, z0: this.solver.z0, boundary: this.solver.boundary });
    s.V.set(this.V); s.fixed.set(this.solver.fixed); s.eps.set(this.solver.eps);
    // The solver may carry explicit face permittivities (exact layer interfaces); the energy
    // integral must use the same faces, or layered stacks read several % high.
    if (this.solver.faceR) { this.solver.prepare?.(); s.faceR.set(this.solver.faceR); s.faceZ.set(this.solver.faceZ); s.facesExplicit = this.solver.facesExplicit; s.facesDirty = false; }
    return s;
  },

  compute() {
    const s = this.solver;
    this.gridV = new Grid2D(s.nr, s.nz, s.extent, this.V);
    [this.gridEr, this.gridEz] = this.gridV.negGradient();
    this.gridEmag = magnitude(this.gridEr, this.gridEz);
    this.gridW = new Grid2D(s.nr, s.nz, s.extent);
    for (let k = 0; k < this.gridW.data.length; k++) this.gridW.data[k] = 0.5 * EPS0 * s.eps[k] * this.gridEmag.data[k] ** 2;
    if (this.mirror) {
      this.gridV = mirrorGrid(this.gridV); this.gridEr = mirrorGrid(this.gridEr, true); this.gridEz = mirrorGrid(this.gridEz);
      this.gridEmag = mirrorGrid(this.gridEmag); this.gridW = mirrorGrid(this.gridW);
    }
    const e = Array.from(this.gridEmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    this.eRange = e.length ? [e[Math.floor(0.05 * (e.length - 1))], e[Math.floor(0.995 * (e.length - 1))]] : [1, 10];
    this.wRange = [0.5 * EPS0 * this.eRange[0] ** 2, 0.5 * EPS0 * this.meta.epsR2 * this.eRange[1] ** 2];
  },

  epsAt(x, z) {
    const s = this.solver, r = this.rOf(x);
    const i = Math.min(s.nr - 1, Math.max(0, Math.round(r / s.h))), j = Math.min(s.nz - 1, Math.max(0, Math.round((z - s.z0) / s.h)));
    return s.eps[s.idx(i, j)];
  },

  render(layer, ctx, view, opts) {
    const eFn = (r, z) => [this.gridEr.sample(r, z), this.gridEz.sample(r, z)];
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? 0, max: opts.max ?? this.meta.V });
      case 'Emag': return drawScalarField(ctx, this.gridEmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.eRange[0], max: opts.max ?? this.eRange[1] });
      case 'w': return drawScalarField(ctx, this.gridW, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.wRange[0], max: opts.max ?? this.wRange[1] });
      case 'E':
        if (opts.style === 'lines') {
          const { g, R, t, h } = this.meta;
          const seeds = [];
          for (const sgn of this.mirror ? [-1, 1] : [1]) {
            for (let k = 0; k < 14; k++) seeds.push([sgn * (k + 0.5) * (R + 3 * h) / 14, g / 2 + t + 2 * h]);
            for (let k = 1; k < 6; k++) seeds.push([sgn * (R + 2 * h), g / 2 + t + k * (this.meta.S / 2 - g / 2 - t) / 6]);
          }
          const stop = (x, z) => { const s = this.solver; const i = Math.round(this.rOf(x) / s.h), j = Math.round((z - s.z0) / s.h); return i < 0 || j < 0 || i >= s.nr || j >= s.nz || s.fixed[s.idx(i, j)] === 1; };
          drawStreamlines(ctx, view, eFn, seeds, { stopFn: stop, maxSteps: 2500 });
        } else drawQuiver(ctx, view, eFn, { normalize: true, spacing: 24 });
        return null;
      case 'D': drawQuiver(ctx, view, (r, z) => { const [er, ez] = eFn(r, z); const e = this.epsAt(r, z); return [e * er, e * ez]; }, { normalize: false, spacing: 24, color: 'rgba(255,220,120,0.9)' }); return null;
      case 'P': drawQuiver(ctx, view, (r, z) => { const [er, ez] = eFn(r, z); const e = this.epsAt(r, z) - 1; return [e * er, e * ez]; }, { normalize: false, spacing: 24, color: 'rgba(160,255,160,0.9)' }); return null;
      case 'Veq': drawContours(ctx, view, this.gridV, levelsBetween(0, this.meta.V, 19), { color: 'rgba(0,0,0,0.5)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const { g, R, t } = this.meta;
    const rect = (r0, r1, z0, z1, fill, stroke) => {
      const [x0, y0] = view.toPx(this.mirror ? -r1 : r0, z1), [x1, y1] = view.toPx(r1, z0);
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    };
    ctx.save();
    rect(0, R, -g / 2, g / 2, 'rgba(80,220,220,0.10)', 'rgba(80,220,220,0.5)');   // outer dielectric
    rect(0, R, -g / 6, g / 6, 'rgba(80,220,220,0.12)', 'rgba(80,220,220,0.5)');   // centre layer
    rect(0, R, g / 2, g / 2 + t, 'rgba(229,72,77,0.9)', '#fff');                  // top plate (+V)
    rect(0, R, -g / 2 - t, -g / 2, 'rgba(59,130,246,0.9)', '#fff');               // bottom plate (0)
    // axis
    const [ax, ay0] = view.toPx(0, view.extent[2]), [, ay1] = view.toPx(0, view.extent[3]);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(ax + 1, ay0); ctx.lineTo(ax + 1, ay1); ctx.stroke();
    ctx.restore();
  },

  statusText() {
    const r = Number.isFinite(this.residual) ? this.residual.toExponential(2) : '—';
    return `${this.sweep?.progress ? this.sweep.progress + ' · ' : ''}${this.solver.nr}×${this.solver.nz} (r,z) grid, h = ${(this.meta.h * 1e3).toFixed(3)} mm${this.meta.coarsened ? ' (coarsened to fit)' : ''} · sweep ${this.sweeps} · max |ΔV| = ${r} V · ${this.running ? 'solving' : this.converged ? 'converged' : 'not converged'}`;
  },

  probe(x, z) {
    const er = this.gridEr.sample(x, z), ez = this.gridEz.sample(x, z), e = this.epsAt(x, z);
    return [
      { label: 'V', value: this.gridV.sample(x, z), unit: 'V' },
      { label: this.mirror ? 'Ex (= ±Er)' : 'Er', value: er, unit: 'V/m' },
      { label: 'Ez', value: ez, unit: 'V/m' },
      { label: '|E|', value: Math.hypot(er, ez), unit: 'V/m' },
      { label: 'εr here', value: e, unit: '' },
      { label: 'Dz = ε0 εr Ez', value: EPS0 * e * ez, unit: 'C/m²' },
      { label: 'Pz = Dz − ε0 Ez', value: EPS0 * (e - 1) * ez, unit: 'C/m²' },
      { label: 'energy density', value: 0.5 * EPS0 * e * (er * er + ez * ez), unit: 'J/m³' },
    ];
  },

  getState() {
    const s = { res: this.res, walls: this.walls, half: this.mirror ? '0' : '1', sw: this.sweep.param, sw0: this.sweep.from, sw1: this.sweep.to, swn: this.sweep.n };
    for (const [k, v] of Object.entries(this.p)) s[`c_${k}`] = v;
    return s;
  },

  csv() {
    // Always the solver's own half-plane grid, whatever the display shows.
    const s = this.solver;
    const gV = new Grid2D(s.nr, s.nz, s.extent, this.V);
    const [er, ez] = gV.negGradient();
    const lines = ['r_m,z_m,V_V,Er_Vpm,Ez_Vpm,eps_r'];
    for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nr; i++) { const k = s.idx(i, j); lines.push(`${s.r(i)},${s.z(j)},${this.V[k]},${er.data[k]},${ez.data[k]},${s.eps[k]}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell;
    const box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Capacitors'));
    box.appendChild(ui.lead(shell, 'Two circular plates with a three-layer dielectric, solved in (r, z).'));

    const re = () => { this.client?.cancel(); this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); this.solve(); };
    const pf = (key, label, min, max) => ui.field(label, ui.number(this.p[key], { min, max, onChange: (v) => { this.p[key] = v; re(); } }));
    const r1 = ui.el('div', 'row'); r1.append(pf('V', 'Applied voltage (V)', 0.01, 1e5), pf('g', 'Cap height / gap (mm)', 0.1, 200)); box.appendChild(r1);
    const r2 = ui.el('div', 'row'); r2.append(pf('R', 'Plate radius (mm)', 0.5, 200), pf('t', 'Plate thickness (mm)', 0.05, 20)); box.appendChild(r2);
    const r3 = ui.el('div', 'row'); r3.append(pf('epsR', 'Epsilon R (centre)', 1, 1e4), pf('epsR2', 'Epsilon R 2 (outer)', 1, 1e4)); box.appendChild(r3);
    const r4 = ui.el('div', 'row');
    r4.appendChild(ui.field('Resolution', ui.select([[2, 'coarse (2 cells/layer)'], [4, 'normal (4 cells/layer)'], [6, 'fine (6 cells/layer)']], String(this.res), (v) => { this.res = parseInt(v, 10); re(); })));
    r4.appendChild(ui.field('Box walls', ui.select([['neumann', 'Insulating (isolated)'], ['dirichlet', 'Grounded enclosure']], this.walls, (v) => { this.walls = v; re(); })));
    r4.appendChild(ui.field('View', ui.select([['full', 'Full cross-section'], ['half', 'r–z half-plane']], this.mirror ? 'full' : 'half', (v) => { this.mirror = v === 'full'; this.applyView(); shell.recompute(); shell.syncUrl(); })));
    box.appendChild(r4);
    box.appendChild(ui.el('p', 'hint', 'The problem is solved in the r–z half-plane (the capacitor is symmetric about its axis) and mirrored for display. The box is (g + 2.5R) square. Solve time grows roughly as (grid side)⁴ with plain neighbour averaging: thin gaps or large plates get slow at normal resolution, so use coarse for a table of runs and refine one case to see how much the answer moves. Grids are capped at about 300 cells a side; the status line says when a case has been coarsened.'));

    box.appendChild(ui.el('h2', '', 'Capacitance'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody'));
    box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'Energy: C = 2W/V². Gauss: C = Q/V with Q the flux of D out of a box around the top plate. Ideal: the handout\'s three-capacitors-in-series formula (no fringing). Kirchhoff: the classical edge correction for thin plates (plate thickness not included), which assumes the dielectric fills all space, so it overshoots when the dielectric stops at the plate edge.'));

    box.appendChild(ui.el('h2', '', 'D, ε₀E and P along the axis'));
    const cr = ui.el('div', 'row');
    cr.append(ui.button('Show axis plots', () => { shell.setStageView('axis'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Download cutline CSV', () => { const t = this.cutlineCSV(); if (t) downloadText('capacitor-axis-cutline.csv', t); }, 'btn btn-small'));
    box.appendChild(cr);
    box.appendChild(ui.el('p', 'hint', 'Along r = 0 from below the bottom plate to above the top plate. D is continuous across the layers; E and P step. The plot is in the "Axis plots" view above the simulation.'));

    box.appendChild(ui.el('h2', '', 'Parameter sweep'));
    const sr = ui.el('div', 'row');
    sr.appendChild(ui.field('Parameter', ui.select(SWEEPABLE, this.sweep.param, (v) => { this.sweep.param = v; shell.syncUrl(); })));
    box.appendChild(sr);
    const sr2 = ui.el('div', 'row');
    sr2.append(ui.field('From', ui.number(this.sweep.from, { onChange: (v) => { this.sweep.from = v; shell.syncUrl(); } })), ui.field('To', ui.number(this.sweep.to, { onChange: (v) => { this.sweep.to = v; shell.syncUrl(); } })), ui.field('Points', ui.number(this.sweep.n, { min: 2, max: 25, onChange: (v) => { this.sweep.n = Math.round(v); shell.syncUrl(); } })));
    box.appendChild(sr2);
    const sr3 = ui.el('div', 'row');
    this.btnSweep = ui.button('Run sweep', () => (this.sweep.running ? this.stopSweep() : this.runSweep()), 'btn');
    sr3.append(this.btnSweep, ui.button('Download sweep CSV', () => { if (this.sweep.rows.length) downloadText(`capacitor-sweep-${this.sweep.param}.csv`, this.sweepCSV()); }, 'btn btn-small'));
    box.appendChild(sr3);
    this.sweepEl = ui.el('table', 'probe-table'); this.sweepEl.appendChild(document.createElement('tbody'));
    box.appendChild(this.sweepEl);
    box.appendChild(ui.el('p', 'hint', 'Each point is a full solve at coarse resolution (so a point takes seconds); the status line under the plot counts them off and the curve grows in the "Sweep" view. Other parameters stay at the values above, and the main case is re-solved when the sweep ends.'));
    this.renderResults();
    this.renderSweep();
  },

  renderResults() {
    if (!this.resultsEl) return;
    const tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    if (!this.results) { row('C', this.running ? 'solving…' : '—'); return; }
    const r = this.results;
    row('Device C (energy)', `${sci(r.cEnergy, 5)} F`);
    row('Device C (Gauss)', `${sci(r.cGauss, 5)} F`);
    row('Ideal C (series layers)', `${sci(r.cIdeal, 5)} F`);
    row('Simulated / ideal', `${(r.cEnergy / r.cIdeal).toFixed(4)}`);
    row('% difference', `${(100 * (r.cEnergy - r.cIdeal) / r.cIdeal).toFixed(2)} %`);
    row(`Kirchhoff (thin plates), if εr = ${r.epsEff.toFixed(2)} filled all space`, `${sci(r.cKirch, 5)} F`);
    row('Stored energy W', `${sci(r.W, 5)} J`);
    row('Charge on top plate Q', `${sci(r.Q, 5)} C`);
  },

  cutline() {
    if (!this.gridV) this.compute();
    const s = this.solver, { g, t } = this.meta;
    const out = [];
    for (let j = 0; j < s.nz; j++) {
      const z = s.z(j);
      if (z < -g / 2 - t - 3 * s.h || z > g / 2 + t + 3 * s.h) continue;
      const k = s.idx(0, j);                       // solver (half-plane) index for materials
      const ez = this.gridEz.sample(0, z), e = s.eps[k]; // sample by position: display grids may be mirrored
      out.push({ z, Ez: ez, D: EPS0 * e * ez, e0E: EPS0 * ez, P: EPS0 * (e - 1) * ez, eps: e, conductor: s.fixed[k] });
    }
    return out;
  },

  drawCutline(ctx, W, H) {
    if (!this.gridV) return;
    const c = { width: W, height: H };
    const rows = this.cutline().filter((r) => !r.conductor);
    if (!rows.length) return;
    ctx.font = '12px system-ui';
    const zs = rows.map((r) => r.z), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const vals = rows.flatMap((r) => [r.D, r.e0E, r.P]).filter(Number.isFinite);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const L = 80, T = 58, B = 56, Rm = 20;
    const px = (z) => L + ((z - z0) / (z1 - z0 || 1)) * (c.width - L - Rm);
    const py = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (c.height - T - B);
    // axes and ticks
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, c.height - B); ctx.lineTo(c.width - Rm, c.height - B); ctx.stroke();
    ctx.fillStyle = '#5a5955';
    for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 4, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(c.width - Rm, py(v)); ctx.stroke(); }
    for (let k = 0; k <= 6; k++) { const z = z0 + (k / 6) * (z1 - z0); ctx.fillText(`${(z * 1e3).toFixed(2)}`, px(z) - 12, c.height - B + 16); }
    ctx.fillText('z along the axis (mm)', c.width / 2 - 60, c.height - 8);
    ctx.save(); ctx.translate(14, c.height / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('C/m²', -14, 0); ctx.restore();
    ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(c.width - Rm, py(0)); ctx.stroke();
    // layer boundaries and plates
    const { g, t } = this.meta;
    ctx.strokeStyle = '#ddd'; ctx.setLineDash([4, 4]); for (const zb of [-g / 2, -g / 6, g / 6, g / 2]) { ctx.beginPath(); ctx.moveTo(px(zb), T); ctx.lineTo(px(zb), c.height - B); ctx.stroke(); } ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(229,72,77,0.15)'; ctx.fillRect(px(g / 2), T, px(Math.min(g / 2 + t, z1)) - px(g / 2), c.height - T - B);
    ctx.fillStyle = 'rgba(59,130,246,0.15)'; ctx.fillRect(px(Math.max(-g / 2 - t, z0)), T, px(-g / 2) - px(Math.max(-g / 2 - t, z0)), c.height - T - B);
    const series = [['D', '#1f5fbf', 'D'], ['e0E', '#e5484d', 'ε₀E'], ['P', '#2a9d4b', 'P']];
    for (const [key, color] of series) {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      rows.forEach((r, k) => { const X = px(r.z), Y = py(r[key]); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke();
    }
    let lx = L;
    for (const [, color, name] of series) { ctx.fillStyle = color; ctx.fillRect(lx, 10, 12, 12); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 16, 20); lx += 60; }
    ctx.fillStyle = '#5a5955'; ctx.fillText('D (normal) is continuous across the layers; E and P step by the permittivity ratio. Shaded bands: the plates.', L, 40);
  },

  cutlineCSV() {
    const rows = this.cutline();
    return ['z_m,eps_r,Ez_Vpm,Dz_Cpm2,eps0Ez_Cpm2,Pz_Cpm2,conductor', ...rows.map((r) => `${r.z},${r.eps},${r.Ez},${r.D},${r.e0E},${r.P},${r.conductor}`)].join('\n');
  },

  // ------------------------------------------------------------ sweep

  async runSweep() {
    if (this.sweep.running) return;
    const { param, from, to, n } = this.sweep;
    this.sweep.rows = []; this.sweep.running = true; this.btnSweep.textContent = 'Stop sweep';
    this.client?.cancel();
    this.shell.setStageView('sweep'); this.shell.syncUrl();
    const saved = { ...this.p };
    for (let k = 0; k < n && this.sweep.running; k++) {
      const value = from + (k * (to - from)) / (n - 1);
      this.sweep.progress = `sweep point ${k + 1} of ${n} (${SWEEPABLE.find(([q]) => q === param)?.[1] ?? param} = ${sci(value, 4)})`;
      const p = { ...saved, [param]: value };
      this.build(p, { forSweep: true });
      this.shell.recompute();
      this.shell.solverRunning = true;
      try {
        await this.client.init(this.solver, 'axisym');
        const done = await this.client.run({ k: 50, tol: this.tol() });
        if (!this.sweep.running) break;
        this.V = done.V; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
        this.finish();
        this.sweep.rows.push({ value, ...this.results });
        this.renderSweep();
      } catch { break; }
    }
    this.sweep.running = false; this.sweep.progress = ''; this.btnSweep.textContent = 'Run sweep';
    this.shell.solverRunning = false;
    // restore the main configuration and re-solve it at the normal resolution
    this.p = saved; this.build(); this.buildControls(); this.shell.recompute(); this.solve();
  },

  stopSweep() { this.sweep.running = false; this.client?.cancel(); },

  renderSweep() {
    if (!this.sweepEl) return;
    const tb = this.sweepEl.tBodies[0]; tb.innerHTML = '';
    this.shell.updateStageView();
    if (!this.sweep.rows.length) return;
    const head = document.createElement('tr'); head.innerHTML = `<td>${this.sweep.param}</td><td>C (F) · ideal (F) · ratio</td>`; tb.appendChild(head);
    for (const r of this.sweep.rows) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${sci(r.value, 4)}</td><td>${sci(r.cEnergy, 4)} · ${sci(r.cIdeal, 4)} · ${(r.cEnergy / r.cIdeal).toFixed(3)}</td>`; tb.appendChild(tr); }
  },

  drawSweep(ctx, W, H) {
    const rows = this.sweep.rows;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    if (!rows.length) { ctx.fillText('Run a parameter sweep from the side panel to plot C against the chosen parameter here.', 20, 30); return; }
    const name = SWEEPABLE.find(([k]) => k === this.sweep.param)?.[1] ?? this.sweep.param;
    const xs = rows.map((r) => r.value), ys = rows.map((r) => r.cEnergy), yi = rows.map((r) => r.cIdeal);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = 0, y1 = Math.max(...ys, ...yi) * 1.05;
    const L = 80, T = 44, B = 56, Rm = 20;
    const px = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rm), py = (y) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 4; k++) { const v = y0 + (k / 4) * (y1 - y0); ctx.fillText(sci(v, 3), 4, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(W - Rm, py(v)); ctx.stroke(); }
    for (let k = 0; k <= 5; k++) { const v = x0 + (k / 5) * (x1 - x0); ctx.fillText(sci(v, 3), px(v) - 12, H - B + 16); }
    ctx.fillText(name, W / 2 - 60, H - 8);
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('C (F)', -16, 0); ctx.restore();
    const line = (vals, color, dash) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath(); rows.forEach((r, k) => { const X = px(r.value), Y = py(vals[k]); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }); ctx.stroke(); ctx.setLineDash([]); };
    line(yi, '#999', [5, 4]); line(ys, '#1f5fbf', []);
    ctx.fillStyle = '#1f5fbf'; for (const r of rows) { ctx.beginPath(); ctx.arc(px(r.value), py(r.cEnergy), 3.5, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = '#1f5fbf'; ctx.fillRect(L, 10, 12, 12); ctx.fillStyle = '#5a5955'; ctx.fillText('simulated C', L + 16, 20);
    ctx.fillStyle = '#999'; ctx.fillRect(L + 110, 10, 12, 12); ctx.fillStyle = '#5a5955'; ctx.fillText('ideal (no fringing)', L + 126, 20);
  },

  sweepCSV() {
    return [`${this.sweep.param},C_energy_F,C_gauss_F,C_ideal_F,ratio,C_kirchhoff_F`, ...this.sweep.rows.map((r) => `${r.value},${r.cEnergy},${r.cGauss},${r.cIdeal},${r.cEnergy / r.cIdeal},${r.cKirch}`)].join('\n');
  },
};
