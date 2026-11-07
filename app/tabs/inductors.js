// Inductors tab (Lab 5): a coil with a permeable object at a variable axial position,
// solved for psi = r A_phi in (r, z) by the neighbour-averaging solver in a Web Worker.
// Inductance from flux linkage (J.A) and from stored energy (B.H); B, H, M layers;
// flux lines (contours of psi); axis cutline; position sweep with CSV.
// Mode toggle: solenoid with a cylinder inside (Lab 5 as written) or a short ring sensor
// the object passes through. Same solver, different defaults.

import { MU0, PI } from '../../core/constants.js';
import { nagaoka } from '../../core/analytic.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { AxisymMag, solenoidWithObject } from '../../core/axisym.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween } from '../../core/render.js';
import { SolverClient } from '../solverclient.js';
import { mirrorGrid } from '../mirror.js';
import { getNum, downloadText } from '../state.js';
import { ui, sci } from '../shell.js';

const MODES = {
  solenoid: { label: 'Solenoid with a cylinder inside', N: 100, I: 1, Rc: 15, l: 30, tw: 1, a: 5, Lo: 20, muR: 100, zPos: -10, sweep: [-40, 40, 17] },
  ring: { label: 'Ring sensor, object passing through', N: 20, I: 1, Rc: 15, l: 4, tw: 2, a: 5, Lo: 20, muR: 100, zPos: -10, sweep: [-40, 20, 13] },
};

export default {
  id: 'inductors',
  title: 'Inductors',
  phase: 4,
  available: true,
  summary: 'Solenoid or ring sensor with a permeable object, solved in (r, z).',
  extent: [0, 0.128, -0.128, 0.128],
  axes: ['r', 'z'],
  layers: [
    { id: 'Bmag', label: '|B|', kind: 'scalar', unit: 'T', log: true, default: true, eq: 'B' },
    { id: 'Bz', label: 'B_z', kind: 'scalar', unit: 'T', signed: true, eq: 'B' },
    { id: 'Hmag', label: '|H|', kind: 'scalar', unit: 'A/m', log: true, eq: 'H' },
    { id: 'Mmag', label: '|M|', kind: 'scalar', unit: 'A/m', log: true, eq: 'M' },
    { id: 'Jphi', label: 'J_φ (coil)', kind: 'scalar', unit: 'A/m²', eq: 'J' },
    { id: 'B', label: 'B field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'H', label: 'H field', kind: 'vector', styles: ['arrows'] },
    { id: 'M', label: 'M field', kind: 'vector', styles: ['arrows'] },
    { id: 'flux', label: 'Flux lines (ψ contours)', kind: 'contour', eq: 'B', default: true },
  ],

  mode: 'solenoid',
  p: { ...MODES.solenoid },   // mm for lengths in the UI
  nr: 81,
  objectIn: true,
  zoom: 'coil',
  mirror: true,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.mode = s.mode === 'ring' ? 'ring' : 'solenoid';
    this.p = { ...MODES[this.mode] };
    for (const k of ['N', 'I', 'Rc', 'l', 'tw', 'a', 'Lo', 'muR', 'zPos']) this.p[k] = getNum(s, `i_${k}`, this.p[k]);
    this.nr = [61, 81, 121].includes(getNum(s, 'nr', 81)) ? getNum(s, 'nr', 81) : 81;
    this.objectIn = s.obj !== '0';
    this.zoom = s.zoom === 'box' ? 'box' : 'coil';
    this.mirror = s.half !== '1';
    const sw = MODES[this.mode].sweep;
    this.sweep = { from: getNum(s, 'sw0', sw[0]), to: getNum(s, 'sw1', sw[1]), n: Math.round(getNum(s, 'swn', sw[2])), rows: [], running: false };
    this.client = new SolverClient({ onFrame: (m) => this.onFrame(m) });
    this.build();
    this.buildControls();
    this.solve();
  },

  destroy() { this.client?.terminate(); this.client = null; this.shell.solverRunning = false; },

  // ------------------------------------------------------------ model

  build(p = this.p) {
    const mm = 1e-3;
    this.solver = solenoidWithObject({ N: p.N, I: p.I, Rc: p.Rc * mm, l: p.l * mm, tw: p.tw * mm, a: this.objectIn ? p.a * mm : 0, Lo: p.Lo * mm, muR: this.objectIn ? p.muR : 1, zPos: p.zPos * mm, nr: this.nr, box: 8 });
    this.meta = this.solver.meta;
    this.applyZoom();
    this.V = new Float64Array(this.solver.V);
    this.results = null;
    this.sweeps = 0; this.residual = Infinity; this.converged = false;
  },

  /** Display window: the whole box, or a square around the coil (the grid is unchanged). */
  applyZoom() {
    const { S } = this.meta;
    const Z = this.zoom === 'box' ? S : S / 4;
    if (this.mirror) this.shell.setExtent([-Z, Z, -Z, Z], ['x', 'z']);
    else this.shell.setExtent([0, 2 * Z, -Z, Z], ['r', 'z']);
  },

  tol() { return 1e-7 * MU0 * this.meta.N * this.meta.I * this.meta.Rc; }, // psi scale ~ mu0 N I Rc

  async solve() {
    if (!this.client) return;
    this.shell.solverRunning = true; this.shell.renderEquations();
    this.running = true; this.converged = false;
    try {
      await this.client.init(this.solver, 'axisym-mag');
      const done = await this.client.run({ k: 50, tol: this.tol() });
      this.V = done.V; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
      this.finish();
    } catch { /* cancelled */ }
    this.running = false; this.shell.solverRunning = false; this.shell.renderEquations(); this.shell.refreshStatus();
  },

  onFrame(m) {
    this.V = m.V; this.sweeps = m.sweeps; this.residual = m.residual;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.shell.recompute(); });
  },

  solverWithV() {
    const s = new AxisymMag(this.solver.nr, this.solver.nz, { h: this.solver.h, z0: this.solver.z0, boundary: this.solver.boundary });
    s.V.set(this.V); s.fixed.set(this.solver.fixed); s.eps.set(this.solver.eps); s.rho.set(this.solver.rho);
    return s;
  },

  finish() {
    const s = this.solverWithV();
    const { N, I, Rc, l } = this.meta;
    const Wja = s.energyJA(), Wb = s.energy();
    const Lflux = 2 * Wja / (I * I), Lenergy = 2 * Wb / (I * I);
    const Llong = MU0 * N * N * PI * Rc * Rc / l;
    const Lnag = nagaoka(2 * Rc, l) * Llong;
    this.results = { Lflux, Lenergy, Llong, Lnag, Wja };
    this.renderResults();
    this.drawCutline();
    this.shell.recompute();
  },

  compute() {
    const s = this.solverWithV();
    [this.gridBr, this.gridBz] = s.B();
    this.gridBmag = magnitude(this.gridBr, this.gridBz);
    const n = s.nr * s.nz;
    this.gridHmag = new Grid2D(s.nr, s.nz, s.extent); this.gridMmag = new Grid2D(s.nr, s.nz, s.extent); this.gridJ = new Grid2D(s.nr, s.nz, s.extent, s.rho);
    for (let k = 0; k < n; k++) { const mu = s.eps[k]; this.gridHmag.data[k] = this.gridBmag.data[k] / (MU0 * mu); this.gridMmag.data[k] = (mu - 1) * this.gridHmag.data[k]; }
    const pct = (g, lo, hi) => { const a = Array.from(g.data).filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y); return a.length ? [a[Math.floor(lo * (a.length - 1))], a[Math.floor(hi * (a.length - 1))]] : [1e-9, 1]; };
    this.bRange = pct(this.gridBmag, 0.05, 0.995); this.hRange = pct(this.gridHmag, 0.05, 0.995); this.mRange = pct(this.gridMmag, 0.02, 0.995);
    const abz = Array.from(this.gridBz.data).map(Math.abs).filter(Number.isFinite).sort((x, y) => x - y);
    const bzm = abz[Math.floor(0.985 * (abz.length - 1))] || 1e-9;
    this.bzRange = [-bzm, bzm];
    this.gridPsi = new Grid2D(s.nr, s.nz, s.extent, this.V);
    if (this.mirror) {
      this.gridBr = mirrorGrid(this.gridBr, true); this.gridBz = mirrorGrid(this.gridBz); this.gridBmag = mirrorGrid(this.gridBmag);
      this.gridHmag = mirrorGrid(this.gridHmag); this.gridMmag = mirrorGrid(this.gridMmag); this.gridJ = mirrorGrid(this.gridJ); this.gridPsi = mirrorGrid(this.gridPsi);
    }
    const pm = Math.max(...Array.from(this.V).filter(Number.isFinite)), pn = Math.min(...Array.from(this.V).filter(Number.isFinite));
    this.psiRange = [pn, pm];
  },

  muAt(x, z) { const s = this.solver, r = this.mirror ? Math.abs(x) : x; const i = Math.min(s.nr - 1, Math.max(0, Math.round(r / s.h))), j = Math.min(s.nz - 1, Math.max(0, Math.round((z - s.z0) / s.h))); return s.eps[s.idx(i, j)]; },

  render(layer, ctx, view, opts) {
    const bFn = (r, z) => [this.gridBr.sample(r, z), this.gridBz.sample(r, z)];
    switch (layer) {
      case 'Bmag': return drawScalarField(ctx, this.gridBmag, { map: opts.map, log: true, min: opts.min ?? this.bRange[0], max: opts.max ?? this.bRange[1] });
      case 'Bz': return drawScalarField(ctx, this.gridBz, { map: opts.map, min: opts.min ?? this.bzRange[0], max: opts.max ?? this.bzRange[1] });
      case 'Hmag': return drawScalarField(ctx, this.gridHmag, { map: opts.map, log: true, min: opts.min ?? this.hRange[0], max: opts.max ?? this.hRange[1] });
      case 'Mmag': return drawScalarField(ctx, this.gridMmag, { map: opts.map, log: true, min: opts.min ?? Math.max(this.mRange[0], 1e-6), max: opts.max ?? this.mRange[1] });
      case 'Jphi': return drawScalarField(ctx, this.gridJ, { map: opts.map, min: opts.min ?? 0, max: opts.max ?? this.meta.J });
      case 'B':
        if (opts.style === 'lines') {
          const { Rc } = this.meta, seeds = [], rMax = view.extent[1];
          for (const sgn of this.mirror ? [-1, 1] : [1]) {
            for (let k = 1; k <= 10; k++) seeds.push([sgn * (k / 11) * Rc, 0]);
            for (let k = 1; k <= 5; k++) seeds.push([sgn * (Rc + (k / 6) * (rMax - Rc)), 0]);
          }
          drawStreamlines(ctx, view, bFn, seeds, { maxSteps: 4000 });
        } else drawQuiver(ctx, view, bFn, { normalize: true, spacing: 24 });
        return null;
      case 'H': drawQuiver(ctx, view, (r, z) => { const [a, b] = bFn(r, z); const m = MU0 * this.muAt(r, z); return [a / m, b / m]; }, { normalize: false, spacing: 24, color: 'rgba(255,220,120,0.9)' }); return null;
      case 'M': drawQuiver(ctx, view, (r, z) => { const [a, b] = bFn(r, z); const mu = this.muAt(r, z); const f = (mu - 1) / (MU0 * mu); return [a * f, b * f]; }, { normalize: false, spacing: 24, color: 'rgba(160,255,160,0.9)' }); return null;
      case 'flux': drawContours(ctx, view, this.gridPsi, levelsBetween(this.psiRange[0], this.psiRange[1], 24), { color: 'rgba(255,255,255,0.65)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const { Rc, l, tw, a, Lo, zPos, muR } = this.meta;
    const rect = (r0, r1, z0, z1, fill, stroke) => {
      const [x0, y0] = view.toPx(r0, z1), [x1, y1] = view.toPx(r1, z0);
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    };
    ctx.save();
    rect(Rc - tw / 2, Rc + tw / 2, -l / 2, l / 2, 'rgba(245,166,35,0.85)', '#fff'); // winding
    if (this.mirror) rect(-Rc - tw / 2, -Rc + tw / 2, -l / 2, l / 2, 'rgba(245,166,35,0.85)', '#fff');
    if (this.objectIn && a > 0) rect(this.mirror ? -a : 0, a, zPos, zPos + Lo, muR > 1 ? 'rgba(120,120,140,0.75)' : 'rgba(120,120,140,0.3)', '#fff'); // object
    const [ax, ay0] = view.toPx(0, view.extent[2]), [, ay1] = view.toPx(0, view.extent[3]);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(ax + 1, ay0); ctx.lineTo(ax + 1, ay1); ctx.stroke();
    ctx.restore();
  },

  statusText() {
    const r = Number.isFinite(this.residual) ? this.residual.toExponential(2) : '—';
    return `${this.solver.nr}×${this.solver.nz} (r,z) grid, h = ${(this.meta.h * 1e3).toFixed(2)} mm · sweep ${this.sweeps} · max |Δψ| = ${r} · ${this.running ? 'solving' : this.converged ? 'converged' : 'not converged'}`;
  },

  probe(x, z) {
    const br = this.gridBr.sample(x, z), bz = this.gridBz.sample(x, z), mu = this.muAt(x, z);
    const B = Math.hypot(br, bz), H = B / (MU0 * mu);
    const r = this.mirror ? Math.abs(x) : x;
    return [
      { label: this.mirror ? 'Bx (= ±Br)' : 'Br', value: br, unit: 'T' }, { label: 'Bz', value: bz, unit: 'T' }, { label: '|B|', value: B, unit: 'T' },
      { label: 'μr here', value: mu, unit: '' },
      { label: '|H| = |B|/μ', value: H, unit: 'A/m' },
      { label: '|M| = (μr−1)|H|', value: (mu - 1) * H, unit: 'A/m' },
      { label: 'A_φ = ψ/r', value: r > 0 ? this.gridPsi.sample(x, z) / r : 0, unit: 'T·m' },
      { label: 'flux inside r, 2πψ', value: 2 * PI * this.gridPsi.sample(x, z), unit: 'Wb' },
    ];
  },

  getState() {
    const s = { mode: this.mode, nr: this.nr, obj: this.objectIn ? '1' : '0', zoom: this.zoom, half: this.mirror ? '0' : '1', sw0: this.sweep.from, sw1: this.sweep.to, swn: this.sweep.n };
    for (const k of ['N', 'I', 'Rc', 'l', 'tw', 'a', 'Lo', 'muR', 'zPos']) s[`i_${k}`] = this.p[k];
    return s;
  },

  csv() {
    const g = this.gridBz, s = this.solver;
    const lines = ['r_m,z_m,Br_T,Bz_T,mu_r,Jphi_Apm2,psi_Tm2'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = s.idx(i, j); lines.push(`${g.x(i)},${g.y(j)},${this.gridBr.get(i, j)},${g.get(i, j)},${s.eps[k]},${s.rho[k]},${this.V[k]}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Inductors'));
    box.appendChild(ui.el('p', 'lead', 'A coil of N turns carrying I, with a cylindrical object of permeability μr at a variable position. Solved in (r, z) for ψ = r·A_φ by the same neighbour average; the flux lines are the contours of ψ.'));
    const re = () => { this.client?.cancel(); this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); this.solve(); };
    box.appendChild(ui.field('Mode', ui.select(Object.entries(MODES).map(([k, v]) => [k, v.label]), this.mode, (v) => { this.mode = v; this.p = { ...MODES[v] }; const sw = MODES[v].sweep; this.sweep.from = sw[0]; this.sweep.to = sw[1]; this.sweep.n = sw[2]; re(); })));
    const pf = (key, label, min, max) => ui.field(label, ui.number(this.p[key], { min, max, onChange: (v) => { this.p[key] = v; re(); } }));
    box.appendChild(ui.el('h2', '', 'Coil'));
    const r1 = ui.el('div', 'row'); r1.append(pf('I', 'Current I (A)', 1e-3, 1e3), pf('N', 'Turns N', 1, 5000)); box.appendChild(r1);
    const r2 = ui.el('div', 'row'); r2.append(pf('Rc', 'Coil radius (mm)', 1, 200), pf('l', 'Coil length (mm)', 0.5, 400), pf('tw', 'Winding thickness (mm)', 0.2, 50)); box.appendChild(r2);
    box.appendChild(ui.el('h2', '', 'Object'));
    const objRow = document.createElement('label'); objRow.className = 'layer';
    const objC = document.createElement('input'); objC.type = 'checkbox'; objC.checked = this.objectIn;
    objC.addEventListener('change', () => { this.objectIn = objC.checked; re(); });
    objRow.append(objC, ui.el('span', '', 'Object inside the sensor'));
    box.appendChild(objRow);
    const r3 = ui.el('div', 'row'); r3.append(pf('a', 'Object radius (mm)', 0.5, 150), pf('Lo', 'Object length (mm)', 0.5, 400), pf('muR', 'Relative permeability μr', 1, 1e4)); box.appendChild(r3);
    box.appendChild(ui.field(`Position of the object's bottom end, relative to the sensor centre (mm): ${this.p.zPos}`, ui.range(this.p.zPos, { min: -80, max: 80, step: 1, onInput: (v) => { this.p.zPos = v; this.posLabel.firstChild.textContent = `Position of the object's bottom end, relative to the sensor centre (mm): ${v}`; } })));
    this.posLabel = box.lastChild;
    this.posLabel.querySelector('input').addEventListener('change', () => re());
    const r4 = ui.el('div', 'row');
    r4.appendChild(ui.field('Resolution', ui.select([[61, 'coarse (61 radial cells)'], [81, 'normal (81)'], [121, 'fine (121)']], String(this.nr), (v) => { this.nr = parseInt(v, 10); re(); })));
    r4.appendChild(ui.field('View', ui.select([['coil', 'Coil region'], ['box', 'Whole box']], this.zoom, (v) => { this.zoom = v; this.applyZoom(); shell.recompute(); shell.syncUrl(); })));
    r4.appendChild(ui.field('Section', ui.select([['full', 'Full cross-section'], ['half', 'r–z half-plane']], this.mirror ? 'full' : 'half', (v) => { this.mirror = v === 'full'; this.applyZoom(); shell.recompute(); shell.syncUrl(); })));
    box.appendChild(r4);
    box.appendChild(ui.el('p', 'hint', 'Solved in the r–z half-plane and mirrored for display. The box is 8× the largest dimension with ψ = 0 on its walls, which lowers L by roughly 1–2%. Release the slider to re-solve.'));

    box.appendChild(ui.el('h2', '', 'Inductance'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'Flux linkage: L = (1/I²)∫J·A dv = NΦ/I. Energy: L = 2W/I² with W = ½∫B·H dv, evaluated from the field on the nodes, which under-counts near the thin winding; the flux-linkage value is the one to quote. Long-solenoid and Nagaoka values are for the empty coil.'));

    box.appendChild(ui.el('h2', '', 'B, H, M along the axis'));
    this.cutCanvas = document.createElement('canvas'); this.cutCanvas.width = 480; this.cutCanvas.height = 200;
    this.cutCanvas.style.width = '100%'; this.cutCanvas.style.border = '1px solid var(--line)'; this.cutCanvas.style.borderRadius = '6px'; this.cutCanvas.style.background = '#fff';
    box.appendChild(this.cutCanvas);
    const cr = ui.el('div', 'row'); cr.appendChild(ui.button('Download cutline CSV', () => { const t = this.cutlineCSV(); if (t) downloadText('inductor-axis-cutline.csv', t); }, 'btn btn-small')); box.appendChild(cr);

    box.appendChild(ui.el('h2', '', 'Position sweep'));
    const sr = ui.el('div', 'row');
    sr.append(ui.field('From (mm)', ui.number(this.sweep.from, { onChange: (v) => { this.sweep.from = v; shell.syncUrl(); } })), ui.field('To (mm)', ui.number(this.sweep.to, { onChange: (v) => { this.sweep.to = v; shell.syncUrl(); } })), ui.field('Points', ui.number(this.sweep.n, { min: 2, max: 41, onChange: (v) => { this.sweep.n = Math.round(v); shell.syncUrl(); } })));
    box.appendChild(sr);
    const sr2 = ui.el('div', 'row');
    this.btnSweep = ui.button('Run sweep', () => (this.sweep.running ? this.stopSweep() : this.runSweep()), 'btn');
    sr2.append(this.btnSweep, ui.button('Download sweep CSV', () => { if (this.sweep.rows.length) downloadText('inductance-vs-position.csv', this.sweepCSV()); }, 'btn btn-small'));
    box.appendChild(sr2);
    this.sweepCanvas = document.createElement('canvas'); this.sweepCanvas.width = 480; this.sweepCanvas.height = 180;
    this.sweepCanvas.style.width = '100%'; this.sweepCanvas.style.border = '1px solid var(--line)'; this.sweepCanvas.style.borderRadius = '6px'; this.sweepCanvas.style.background = '#fff';
    box.appendChild(this.sweepCanvas);
    this.sweepEl = ui.el('table', 'probe-table'); this.sweepEl.appendChild(document.createElement('tbody')); box.appendChild(this.sweepEl);
    box.appendChild(ui.el('p', 'hint', 'Each point is a full solve, warm-started from the previous position.'));
    this.renderResults(); this.renderSweep(); this.drawCutline();
  },

  renderResults() {
    if (!this.resultsEl) return;
    const tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    if (!this.results) { row('L', this.running ? 'solving…' : '—'); return; }
    const r = this.results, uH = (x) => `${(x * 1e6).toPrecision(4)} µH`;
    row('L, flux linkage NΦ/I', uH(r.Lflux));
    row('L, energy 2W/I²', uH(r.Lenergy));
    row('μ₀N²A/ℓ, empty coil', uH(r.Llong));
    row(`× Nagaoka ${nagaoka(2 * this.meta.Rc, this.meta.l).toFixed(3)}`, uH(r.Lnag));
    if (this.objectIn && this.meta.muR > 1) row('object', `μr = ${this.meta.muR}, bottom at ${(this.meta.zPos * 1e3).toFixed(1)} mm`);
    row('B_z at centre', `${sci(this.gridBz?.get(0, Math.round(-this.solver.z0 / this.meta.h)) ?? NaN, 4)} T`);
  },

  cutline() {
    if (!this.gridBz) this.compute();
    const s = this.solver, out = [];
    for (let j = 0; j < s.nz; j++) {
      const k = s.idx(0, j), mu = s.eps[k], bz = this.gridBz.data[k];
      out.push({ z: s.z(j), Bz: bz, Hz: bz / (MU0 * mu), Mz: (mu - 1) * bz / (MU0 * mu), mu });
    }
    return out;
  },

  drawCutline() {
    const c = this.cutCanvas; if (!c || !this.gridBz) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    const rows = this.cutline();
    const z0 = rows[0].z, z1 = rows[rows.length - 1].z;
    const px = (z) => 40 + ((z - z0) / (z1 - z0 || 1)) * (c.width - 50);
    const series = [['Bz', '#1f5fbf', 'B_z (T)'], ['Hz', '#e5484d', 'H_z (A/m)'], ['Mz', '#2a9d4b', 'M_z (A/m)']];
    // each series on its own scale, normalised to its max
    let lx = c.width - 230;
    for (const [key, color, label] of series) {
      const vals = rows.map((r) => r[key]);
      const m = Math.max(...vals.map(Math.abs)) || 1;
      ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath();
      rows.forEach((r, k) => { const X = px(r.z), Y = 10 + (1 - (r[key] / m + 1) / 2) * (c.height - 32); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(lx, c.height - 16, 10, 10); ctx.fillStyle = '#5a5955'; ctx.font = '11px system-ui'; ctx.fillText(`${label} max ${sci(m, 2)}`, lx + 14, c.height - 7); lx += 80;
    }
    ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(40, 10 + 0.5 * (c.height - 32)); ctx.lineTo(c.width - 10, 10 + 0.5 * (c.height - 32)); ctx.stroke();
    const { l, zPos, Lo } = this.meta;
    ctx.strokeStyle = '#f5a623'; for (const zb of [-l / 2, l / 2]) { ctx.beginPath(); ctx.moveTo(px(zb), 10); ctx.lineTo(px(zb), c.height - 22); ctx.stroke(); }
    if (this.objectIn) { ctx.strokeStyle = '#888'; for (const zb of [zPos, zPos + Lo]) { ctx.beginPath(); ctx.moveTo(px(zb), 10); ctx.lineTo(px(zb), c.height - 22); ctx.stroke(); } }
    ctx.fillStyle = '#5a5955'; ctx.fillText('z along the axis (each curve scaled to its own max; orange = coil ends, grey = object ends)', 40, c.height - 6);
  },

  cutlineCSV() { return ['z_m,mu_r,Bz_T,Hz_Apm,Mz_Apm', ...this.cutline().map((r) => `${r.z},${r.mu},${r.Bz},${r.Hz},${r.Mz}`)].join('\n'); },

  // ------------------------------------------------------------ sweep

  async runSweep() {
    const { from, to, n } = this.sweep;
    this.sweep.rows = []; this.sweep.running = true; this.btnSweep.textContent = 'Stop sweep';
    this.client?.cancel();
    const saved = { ...this.p };
    let prevV = null;
    for (let k = 0; k < n && this.sweep.running; k++) {
      const zPos = from + (k * (to - from)) / (n - 1);
      this.build({ ...saved, zPos });
      if (prevV && prevV.length === this.solver.V.length) for (let q = 0; q < prevV.length; q++) if (!this.solver.fixed[q]) this.solver.V[q] = prevV[q]; // warm start
      this.shell.recompute(); this.shell.solverRunning = true;
      try {
        await this.client.init(this.solver, 'axisym-mag');
        const done = await this.client.run({ k: 50, tol: this.tol() });
        this.V = done.V; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
        prevV = done.V;
        this.finish();
        this.sweep.rows.push({ zPos, ...this.results });
        this.renderSweep();
      } catch { break; }
    }
    this.sweep.running = false; this.btnSweep.textContent = 'Run sweep'; this.shell.solverRunning = false;
    this.p = saved; this.build(); this.buildControls(); this.shell.recompute(); this.solve();
  },

  stopSweep() { this.sweep.running = false; this.client?.cancel(); },

  renderSweep() {
    if (!this.sweepEl) return;
    const tb = this.sweepEl.tBodies[0]; tb.innerHTML = '';
    const rows = this.sweep.rows;
    const c = this.sweepCanvas, ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    if (!rows.length) return;
    for (const r of rows) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${r.zPos.toFixed(1)} mm</td><td>${(r.Lflux * 1e6).toPrecision(5)} µH</td>`; tb.appendChild(tr); }
    const xs = rows.map((r) => r.zPos), ys = rows.map((r) => r.Lflux * 1e6);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const px = (x) => 44 + ((x - x0) / (x1 - x0 || 1)) * (c.width - 54), py = (y) => 10 + (1 - (y - y0) / (y1 - y0 || 1)) * (c.height - 34);
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 1.6; ctx.beginPath();
    rows.forEach((r, k) => { if (k === 0) ctx.moveTo(px(r.zPos), py(r.Lflux * 1e6)); else ctx.lineTo(px(r.zPos), py(r.Lflux * 1e6)); });
    ctx.stroke();
    ctx.fillStyle = '#1f5fbf'; for (const r of rows) { ctx.beginPath(); ctx.arc(px(r.zPos), py(r.Lflux * 1e6), 3, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = '#5a5955'; ctx.font = '11px system-ui';
    ctx.fillText(`${y1.toPrecision(4)} µH`, 2, 14); ctx.fillText(`${y0.toPrecision(4)} µH`, 2, c.height - 26); ctx.fillText('object position (mm)', c.width / 2 - 50, c.height - 6);
  },

  sweepCSV() { return ['zPos_mm,L_flux_H,L_energy_H', ...this.sweep.rows.map((r) => `${r.zPos},${r.Lflux},${r.Lenergy}`)].join('\n'); },
};
