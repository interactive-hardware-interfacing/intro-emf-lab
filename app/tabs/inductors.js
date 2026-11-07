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
import { plotView, iso3dView } from '../views.js';
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
    { id: 'mu', label: 'μr (object)', kind: 'scalar', unit: '', log: true, note: 'Uniform unless “Saturating core” is on; then μr falls where |B| approaches B_sat.' },
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
  sat: false,
  Bsat: 1.5,   // tesla
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
    this.sat = s.sat === '1';
    this.Bsat = Math.max(0.01, getNum(s, 'bsat', 1.5));
    this.zoom = s.zoom === 'box' ? 'box' : 'coil';
    this.mirror = s.half !== '1';
    const sw = MODES[this.mode].sweep;
    this.sweep = { from: getNum(s, 'sw0', sw[0]), to: getNum(s, 'sw1', sw[1]), n: Math.round(getNum(s, 'swn', sw[2])), rows: [], running: false };
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

  isoSource() {
    const tab = this;
    const gridFor = () => {
      const id = tab.shell.colorLayer;
      const g = { Bmag: tab.gridBmag, Bz: tab.gridBz, Hmag: tab.gridHmag, Mmag: tab.gridMmag, Jphi: tab.gridJ }[id] ?? tab.gridBmag;
      if (!g) return null;
      const m = tab.mirror ? g : mirrorGrid(g);
      // crop to the current view window so the 3D picture matches the zoom
      const Z = tab.shell.view.extent[3];
      return Grid2D.fromFunction(161, 161, [-Z, Z, -Z, Z], (x, z) => m.sample(x, z));
    };
    return {
      grid: gridFor,
      scalarAt: (r, z) => gridFor()?.sample(r, z) ?? NaN,
      get log() { return !!tab.layers.find((L) => L.id === tab.shell.colorLayer)?.log; },
      zRange: () => { const Z = tab.shell.view.extent[3]; return [-Z, Z]; },
      cylinders: () => { const { Rc, l, tw, a, Lo, zPos, muR } = tab.meta; const out = [
        { r0: Rc - tw / 2, r1: Rc + tw / 2, z0: -l / 2, z1: l / 2, color: 'rgba(245,166,35,0.95)', fill: 'rgba(245,166,35,0.35)', label: 'coil' },
      ]; if (tab.objectIn && a > 0) out.push({ r0: 0, r1: a, z0: zPos, z1: zPos + Lo, color: '#ddd', fill: 'rgba(120,120,140,0.5)', label: `μr = ${muR}` }); return out; },
    };
  },

  // ------------------------------------------------------------ model

  build(p = this.p) {
    const mm = 1e-3;
    this.solver = solenoidWithObject({ N: p.N, I: p.I, Rc: p.Rc * mm, l: p.l * mm, tw: p.tw * mm, a: this.objectIn ? p.a * mm : 0, Lo: p.Lo * mm, muR: this.objectIn ? p.muR : 1, zPos: p.zPos * mm, nr: this.nr, box: 8, Bsat: this.sat ? this.Bsat : 0 });
    this.meanMu = this.sat ? p.muR : NaN;
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
      if (done.eps) { this.solver.eps.set(done.eps); this.meanMu = done.meanMu; }
      this.finish();
    } catch { /* cancelled */ }
    this.running = false; this.shell.solverRunning = false; this.shell.renderEquations(); this.shell.refreshStatus();
  },

  onFrame(m) {
    this.V = m.V; this.sweeps = m.sweeps; this.residual = m.residual;
    if (m.eps) { this.solver.eps.set(m.eps); this.meanMu = m.meanMu; } // nonlinear mu(B): the worker's material comes back with the field
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
    this.gridMu = new Grid2D(s.nr, s.nz, s.extent, new Float64Array(s.eps));
    if (this.mirror) {
      this.gridMu = mirrorGrid(this.gridMu);
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
      case 'Bmag': return drawScalarField(ctx, this.gridBmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.bRange[0], max: opts.max ?? this.bRange[1] });
      case 'Bz': return drawScalarField(ctx, this.gridBz, { map: opts.map, extent: opts.extent, min: opts.min ?? this.bzRange[0], max: opts.max ?? this.bzRange[1] });
      case 'Hmag': return drawScalarField(ctx, this.gridHmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.hRange[0], max: opts.max ?? this.hRange[1] });
      case 'Mmag': return drawScalarField(ctx, this.gridMmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? Math.max(this.mRange[0], 1e-6), max: opts.max ?? this.mRange[1] });
      case 'Jphi': return drawScalarField(ctx, this.gridJ, { map: opts.map, extent: opts.extent, min: opts.min ?? 0, max: opts.max ?? this.meta.J });
      case 'mu': return drawScalarField(ctx, this.gridMu, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? 1, max: opts.max ?? Math.max(1.5, this.meta.muR) });
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
    return `${this.sweep?.progress ? this.sweep.progress + ' · ' : ''}${this.solver.nr}×${this.solver.nz} (r,z) grid, h = ${(this.meta.h * 1e3).toFixed(2)} mm · sweep ${this.sweeps} · max |Δψ| = ${r} · ${this.running ? 'solving' : this.converged ? 'converged' : 'not converged'}`;
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
    const s = { mode: this.mode, nr: this.nr, obj: this.objectIn ? '1' : '0', sat: this.sat ? '1' : '0', bsat: this.Bsat, zoom: this.zoom, half: this.mirror ? '0' : '1', sw0: this.sweep.from, sw1: this.sweep.to, swn: this.sweep.n };
    for (const k of ['N', 'I', 'Rc', 'l', 'tw', 'a', 'Lo', 'muR', 'zPos']) s[`i_${k}`] = this.p[k];
    return s;
  },

  csv() {
    // Always the solver's own half-plane grid, whatever the display shows.
    const s = this.solverWithV();
    const [br, bz] = s.B();
    const lines = ['r_m,z_m,Br_T,Bz_T,mu_r,Jphi_Apm2,psi_Tm2'];
    for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nr; i++) { const k = s.idx(i, j); lines.push(`${s.r(i)},${s.z(j)},${br.data[k]},${bz.data[k]},${s.eps[k]},${s.rho[k]},${s.V[k]}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Inductors'));
    box.appendChild(ui.lead(shell, 'A coil with a permeable object at a variable position, solved in (r, z).'));
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
    const r3 = ui.el('div', 'row'); r3.append(pf('a', 'Object radius (mm)', 0.5, 150), pf('Lo', 'Object length (mm)', 0.5, 400), pf('muR', this.sat ? 'Initial permeability μr' : 'Relative permeability μr', 1, 1e4)); box.appendChild(r3);
    const satRow = document.createElement('label'); satRow.className = 'layer';
    const satC = document.createElement('input'); satC.type = 'checkbox'; satC.checked = this.sat;
    satC.addEventListener('change', () => { this.sat = satC.checked; re(); this.buildControls(); });
    satRow.append(satC, ui.el('span', '', 'Saturating core (nonlinear μ(B))'));
    box.appendChild(satRow);
    if (this.sat) {
      const r3b = ui.el('div', 'row');
      r3b.appendChild(ui.field('Saturation B_sat (T)', ui.number(this.Bsat, { min: 0.01, max: 5, step: 0.1, onChange: (v) => { this.Bsat = Math.max(0.01, v); re(); } })));
      box.appendChild(r3b);
      box.appendChild(ui.el('p', 'hint', 'B(H) = μ₀H + B_sat·tanh(μ₀(μr−1)H/B_sat): the object starts at the permeability above and its μr falls towards 1 wherever |B| approaches B_sat. The solver re-evaluates μr(|B|) in every cell between sweeps until field and material agree. Turn on the “μr (object)” layer to see it. Try I = 100 A with the defaults: B at the centre drops from about 2.1 T to 1.6 T and the mean μr halves.'));
    }
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
    const cr = ui.el('div', 'row'); cr.append(ui.button('Show axis plots', () => { shell.setStageView('axis'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Download cutline CSV', () => { const t = this.cutlineCSV(); if (t) downloadText('inductor-axis-cutline.csv', t); }, 'btn btn-small')); box.appendChild(cr);

    box.appendChild(ui.el('h2', '', 'Position sweep'));
    const sr = ui.el('div', 'row');
    sr.append(ui.field('From (mm)', ui.number(this.sweep.from, { onChange: (v) => { this.sweep.from = v; shell.syncUrl(); } })), ui.field('To (mm)', ui.number(this.sweep.to, { onChange: (v) => { this.sweep.to = v; shell.syncUrl(); } })), ui.field('Points', ui.number(this.sweep.n, { min: 2, max: 41, onChange: (v) => { this.sweep.n = Math.round(v); shell.syncUrl(); } })));
    box.appendChild(sr);
    const sr2 = ui.el('div', 'row');
    this.btnSweep = ui.button('Run sweep', () => (this.sweep.running ? this.stopSweep() : this.runSweep()), 'btn');
    sr2.append(this.btnSweep, ui.button('Download sweep CSV', () => { if (this.sweep.rows.length) downloadText('inductance-vs-position.csv', this.sweepCSV()); }, 'btn btn-small'));
    box.appendChild(sr2);
    this.sweepEl = ui.el('table', 'probe-table'); this.sweepEl.appendChild(document.createElement('tbody')); box.appendChild(this.sweepEl);
    box.appendChild(ui.el('p', 'hint', 'Each point is a full solve, warm-started from the previous position.'));
    this.renderResults(); this.renderSweep();
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
    if (this.sat && this.objectIn) row('mean μr(B) in object', Number.isFinite(this.meanMu) ? this.meanMu.toFixed(2) : '—');
    row('B_z at centre', `${sci(this.gridBz?.sample(0, 0) ?? NaN, 4)} T`);
  },

  cutline() {
    if (!this.gridBz) this.compute();
    const s = this.solver, out = [];
    for (let j = 0; j < s.nz; j++) {
      const k = s.idx(0, j), mu = s.eps[k], bz = this.gridBz.sample(0, s.z(j)); // sample: display grid may be mirrored
      out.push({ z: s.z(j), Bz: bz, Hz: bz / (MU0 * mu), Mz: (mu - 1) * bz / (MU0 * mu), mu });
    }
    return out;
  },

  drawCutline(ctx, W, H) {
    if (!this.gridBz) return;
    const rows = this.cutline();
    const Z = this.shell.view.extent[3];
    const vis = rows.filter((r) => Math.abs(r.z) <= Z);
    const z0 = vis[0].z, z1 = vis[vis.length - 1].z;
    const L = 80, T = 58, B = 56, Rm = 20;
    const px = (z) => L + ((z - z0) / (z1 - z0 || 1)) * (W - L - Rm);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 6; k++) { const z = z0 + (k / 6) * (z1 - z0); ctx.fillText(`${(z * 1e3).toFixed(1)}`, px(z) - 12, H - B + 16); }
    ctx.fillText('z along the axis (mm)', W / 2 - 60, H - 8);
    const series = [['Bz', '#1f5fbf', 'B_z (T)'], ['Hz', '#e5484d', 'H_z (A/m)'], ['Mz', '#2a9d4b', 'M_z (A/m)']];
    const mid = T + 0.5 * (H - T - B);
    ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, mid); ctx.lineTo(W - Rm, mid); ctx.stroke();
    const { l, zPos, Lo } = this.meta;
    ctx.fillStyle = 'rgba(245,166,35,0.15)'; ctx.fillRect(px(-l / 2), T, px(l / 2) - px(-l / 2), H - T - B);
    if (this.objectIn) { ctx.fillStyle = 'rgba(120,120,140,0.18)'; ctx.fillRect(px(Math.max(zPos, z0)), T, px(Math.min(zPos + Lo, z1)) - px(Math.max(zPos, z0)), H - T - B); }
    let lx = L;
    for (const [key, color, label] of series) {
      const vals = vis.map((r) => r[key]);
      const m = Math.max(...vals.map(Math.abs)) || 1;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      vis.forEach((r, k) => { const X = px(r.z), Y = T + (1 - (r[key] / m + 1) / 2) * (H - T - B); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(lx, 10, 12, 12); ctx.fillStyle = '#5a5955'; ctx.fillText(`${label}, peak ${sci(m, 3)}`, lx + 16, 20); lx += 190;
    }
    ctx.fillStyle = '#5a5955'; ctx.fillText('Each curve is scaled to its own peak (centre line = 0). Orange band: coil; grey band: object.', L, 40);
  },

  cutlineCSV() { return ['z_m,mu_r,Bz_T,Hz_Apm,Mz_Apm', ...this.cutline().map((r) => `${r.z},${r.mu},${r.Bz},${r.Hz},${r.Mz}`)].join('\n'); },

  // ------------------------------------------------------------ sweep

  async runSweep() {
    if (this.sweep.running) return;
    const { from, to, n } = this.sweep;
    this.sweep.rows = []; this.sweep.running = true; this.btnSweep.textContent = 'Stop sweep';
    this.client?.cancel();
    this.shell.setStageView('sweep'); this.shell.syncUrl();
    const saved = { ...this.p };
    let prevV = null;
    for (let k = 0; k < n && this.sweep.running; k++) {
      const zPos = from + (k * (to - from)) / (n - 1);
      this.sweep.progress = `sweep point ${k + 1} of ${n} (position ${zPos.toFixed(1)} mm)`;
      this.build({ ...saved, zPos });
      if (prevV && prevV.length === this.solver.V.length) for (let q = 0; q < prevV.length; q++) if (!this.solver.fixed[q]) this.solver.V[q] = prevV[q]; // warm start
      this.shell.recompute(); this.shell.solverRunning = true;
      try {
        await this.client.init(this.solver, 'axisym-mag');
        const done = await this.client.run({ k: 50, tol: this.tol() });
        if (!this.sweep.running) break;
        this.V = done.V; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
        if (done.eps) { this.solver.eps.set(done.eps); this.meanMu = done.meanMu; }
        prevV = done.V;
        this.finish();
        this.sweep.rows.push({ zPos, ...this.results });
        this.renderSweep();
      } catch { break; }
    }
    this.sweep.running = false; this.sweep.progress = ''; this.btnSweep.textContent = 'Run sweep'; this.shell.solverRunning = false;
    this.p = saved; this.build(); this.buildControls(); this.shell.recompute(); this.solve();
  },

  stopSweep() { this.sweep.running = false; this.client?.cancel(); },

  renderSweep() {
    if (!this.sweepEl) return;
    const tb = this.sweepEl.tBodies[0]; tb.innerHTML = '';
    this.shell.updateStageView();
    for (const r of this.sweep.rows) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${r.zPos.toFixed(1)} mm</td><td>${(r.Lflux * 1e6).toPrecision(5)} µH</td>`; tb.appendChild(tr); }
  },

  drawSweep(ctx, W, H) {
    const rows = this.sweep.rows;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    if (!rows.length) { ctx.fillText('Run a position sweep from the side panel to plot L against the object position here.', 20, 30); return; }
    const xs = rows.map((r) => r.zPos), ys = rows.map((r) => r.Lflux * 1e6);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) * 0.98, y1 = Math.max(...ys) * 1.02;
    const L = 80, T = 44, B = 56, Rm = 20;
    const px = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rm), py = (y) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 4; k++) { const v = y0 + (k / 4) * (y1 - y0); ctx.fillText(v.toPrecision(4), 10, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(W - Rm, py(v)); ctx.stroke(); }
    for (let k = 0; k <= 6; k++) { const v = x0 + (k / 6) * (x1 - x0); ctx.fillText(v.toFixed(1), px(v) - 10, H - B + 16); }
    ctx.fillText('position of the object\'s bottom end relative to the sensor centre (mm)', W / 2 - 180, H - 8);
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('L (µH)', -16, 0); ctx.restore();
    const { l, Lo } = this.meta;
    ctx.fillStyle = 'rgba(245,166,35,0.15)'; ctx.fillRect(px(Math.max(-l / 2 - Lo, x0)), T, px(Math.min(l / 2, x1)) - px(Math.max(-l / 2 - Lo, x0)), H - T - B);
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 2; ctx.beginPath();
    rows.forEach((r, k) => { const X = px(r.zPos), Y = py(r.Lflux * 1e6); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
    ctx.stroke();
    ctx.fillStyle = '#1f5fbf'; for (const r of rows) { ctx.beginPath(); ctx.arc(px(r.zPos), py(r.Lflux * 1e6), 3.5, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = '#5a5955'; ctx.fillText('Orange band: positions where the object overlaps the coil.', L, 20);
  },

  sweepCSV() { return ['zPos_mm,L_flux_H,L_energy_H', ...this.sweep.rows.map((r) => `${r.zPos},${r.Lflux},${r.Lenergy}`)].join('\n'); },
};
