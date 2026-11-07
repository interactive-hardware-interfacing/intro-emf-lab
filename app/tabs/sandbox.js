// Sandbox tab (Lab 2): paint conductors, dielectrics and (with the Poisson toggle) charge on
// a grid, then watch the plain neighbour-averaging solver relax towards the answer, sweep by
// sweep, in a Web Worker. Presets reproduce the Lab 2 geometries. A Gauss-law path tool
// gives the charge per unit length on a conductor and hence capacitance per unit length
// (the Lab 3 bonus).

import { EPS0 } from '../../core/constants.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { Relax2D, lab2Preset } from '../../core/relax2d.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween } from '../../core/render.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const L = 1; // box is [-L, L]^2 metres
const PRESETS = [
  ['empty', 'Empty box'],
  ['two-rods', 'Two round rods'],
  ['square-rods', 'Two square rods'],
  ['parallel-plates', 'Parallel plates'],
  ['triangles', 'Two triangles'],
];
const TOOLS = [
  ['probe', 'Probe (click to read values)'],
  ['conductor', 'Paint conductor at V'],
  ['dielectric', 'Paint dielectric εr'],
  ['charge', 'Paint charge ρ (Poisson)'],
  ['erase', 'Erase to free space'],
  ['gauss', 'Gauss-law path (drag a box)'],
];

export default {
  id: 'sandbox',
  title: 'Sandbox',
  phase: 2,
  available: true,
  summary: 'Draw a problem and watch the neighbour-averaging solver converge.',
  extent: [-L, L, -L, L],
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', signed: true, default: true },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'res', label: 'Last change |ΔV|', kind: 'scalar', unit: 'V', log: true, eq: 'V' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour', eq: 'V', default: true },
  ],

  // ------------------------------------------------------------ state
  n: 129,
  boundary: 'dirichlet',
  poisson: false,
  preset: 'two-rods',
  pp: { d: 0.4, a: 0.12, h: 0.8, t: 0.04, side: 0.4, V0: 1 },
  ppDefaults: { d: 0.4, a: 0.12, h: 0.8, t: 0.04, side: 0.4, V0: 1 },
  tool: 'probe',
  brush: 3,
  toolV: 1,
  toolEps: 4,
  toolRho: 1e-9,
  k: 20,
  tol: 1e-5,
  running: false,
  custom: false,
  gauss: null, // [i0, j0, i1, j1]

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.n = [65, 129, 257].includes(getNum(s, 'n', 129)) ? getNum(s, 'n', 129) : 129;
    this.boundary = s.bnd === 'neumann' ? 'neumann' : 'dirichlet';
    this.poisson = s.poisson === '1';
    this.preset = PRESETS.some(([id]) => id === s.preset) ? s.preset : 'two-rods';
    this.pp = { ...this.ppDefaults };
    for (const key of Object.keys(this.pp)) this.pp[key] = getNum(s, `p_${key}`, this.pp[key]);
    this.k = Math.max(1, Math.round(getNum(s, 'k', 20)));
    this.tol = getNum(s, 'tol', 1e-5);
    this.toolV = getNum(s, 'tv', 1); this.toolEps = getNum(s, 'te', 4); this.toolRho = getNum(s, 'tr', 1e-9);
    this.brush = Math.max(1, Math.round(getNum(s, 'br', 3)));
    this.tool = 'probe';
    this.custom = false;
    this.gauss = null;
    this.history = [];
    this.running = false;
    this.converged = false;
    this.sweeps = 0;
    this.residual = Infinity;
    if (s.geo) this.loadGeometryString(s.geo); else this.loadPreset();
    if (s.g) { const g = s.g.split(',').map(Number); if (g.length === 4 && g.every(Number.isFinite)) this.gauss = g; }
    this.startWorker();
    this.views = [plotView('conv', 'Convergence', (ctx, w, h) => this.drawHistoryBig(ctx, w, h))];
    this.buildControls();
  },

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.shell.solverRunning = false;
  },

  // ------------------------------------------------------------ geometry

  /** Build the master arrays from a Relax2D instance (preset) or fresh. */
  adopt(solver) {
    this.n = solver.nx;
    this.h = solver.h;
    this.fixed = new Uint8Array(solver.fixed);
    this.Vfix = new Float64Array(solver.V);
    this.eps = new Float64Array(solver.eps);
    this.rho = new Float64Array(solver.rho);
    this.V = new Float64Array(solver.V);
    this.delta = new Float64Array(this.n * this.n);
  },

  loadPreset() {
    const s = lab2Preset(this.preset, { n: this.n, L, ...this.pp, boundary: this.boundary });
    this.adopt(s);
    this.custom = false;
    this.sweeps = 0; this.residual = Infinity; this.converged = false; this.history = [];
  },

  idx(i, j) { return j * this.n + i; },
  cellOf(x, y) { return [Math.round((x + L) / this.h), Math.round((y + L) / this.h)]; },
  isWall(i, j) { return this.boundary === 'dirichlet' && (i === 0 || j === 0 || i === this.n - 1 || j === this.n - 1); },

  paintAt(x, y) {
    const [ci, cj] = this.cellOf(x, y);
    const r = this.brush - 1;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 > r * r + 0.5) continue;
      if (this.isWall(i, j)) continue;
      const k = this.idx(i, j);
      switch (this.tool) {
        case 'conductor': this.fixed[k] = 1; this.Vfix[k] = this.toolV; this.V[k] = this.toolV; break;
        case 'dielectric': this.eps[k] = this.toolEps; break;
        case 'charge': if (this.poisson) this.rho[k] = this.toolRho; break;
        case 'erase': this.fixed[k] = 0; this.eps[k] = 1; this.rho[k] = 0; break;
        default: break;
      }
    }
    this.custom = true;
  },

  onPointer(type, x, y, e) {
    if (this.tool === 'probe') return false;
    if (type === 'leave') { this.hover = null; this.shell.redrawOverlay(); return true; }
    if (type === 'move') { this.hover = [x, y]; this.shell.redrawOverlay(); return true; }
    if (this.tool === 'gauss') {
      const [i, j] = this.cellOf(x, y);
      if (type === 'down') { this.gauss = [i, j, i, j]; this.gaussDrag = true; }
      else if (type === 'drag' && this.gauss) { this.gauss[2] = i; this.gauss[3] = j; }
      else if (type === 'up') { this.gaussDrag = false; this.updateGauss(); this.shell.syncUrl(); }
      this.shell.redrawOverlay();
      return true;
    }
    if (type === 'down' || type === 'drag') { this.paintAt(x, y); this.hover = [x, y]; this.shell.redrawOverlay(); }
    if (type === 'up') { this.commitGeometry(); }
    return true;
  },

  /** After a paint stroke: resend the geometry to the worker, warm-started from the current V. */
  commitGeometry() {
    for (let k = 0; k < this.V.length; k++) if (this.fixed[k]) this.V[k] = this.Vfix[k];
    this.converged = false;
    this.sendInit(true);
    this.play(); // resume from the current solution so the change is seen relaxing in
    this.shell.redraw();
    this.shell.syncUrl();
  },

  // ------------------------------------------------------------ worker

  startWorker() {
    this.worker?.terminate();
    this.worker = new Worker(new URL('../workers/relax-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => this.onFrame(ev.data);
    this.sendInit(false);
  },

  send(msg) { this.worker?.postMessage(msg); },

  sendInit(warm) {
    const V = new Float64Array(this.V.length);
    for (let k = 0; k < V.length; k++) V[k] = this.fixed[k] ? this.Vfix[k] : warm ? this.V[k] : 0;
    this.send({ cmd: 'init', nx: this.n, ny: this.n, extent: [-L, L, -L, L], boundary: this.boundary, V, fixed: this.fixed, eps: this.eps, rho: this.rho, sweeps: warm ? this.sweeps : 0 });
    if (!warm) { this.sweeps = 0; this.residual = Infinity; this.history = []; this.V = V; this.delta.fill(0); }
  },

  onFrame(m) {
    if (m.type === 'ready') return;
    this.V = m.V; this.delta = m.delta;
    this.sweeps = m.sweeps; this.residual = m.residual;
    if (Number.isFinite(m.residual) && m.residual > 0) this.history.push([m.sweeps, m.residual]);
    if (m.type === 'done') { this.running = false; this.converged = m.converged; this.hitMax = m.hitMax; this.shell.solverRunning = false; this.updateRunButtons(); }
    if (m.converged) this.converged = true;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.shell.recompute(); this.drawHistory(); this.updateGauss(); });
  },

  play() { this.running = true; this.converged = false; this.shell.solverRunning = true; this.send({ cmd: 'run', k: this.k, tol: this.tol }); this.updateRunButtons(); this.shell.renderEquations(); },
  pause() { this.running = false; this.shell.solverRunning = false; this.send({ cmd: 'pause' }); this.updateRunButtons(); this.shell.renderEquations(); },
  step() { this.running = false; this.shell.solverRunning = true; this.send({ cmd: 'step', k: 1, tol: this.tol }); this.updateRunButtons(); this.shell.renderEquations(); },
  resetSolution() { this.running = false; this.converged = false; this.shell.solverRunning = false; this.history = []; this.sweeps = 0; this.send({ cmd: 'reset', guess: 0 }); this.updateRunButtons(); this.shell.renderEquations(); },

  updateRunButtons() {
    if (!this.btnPlay) return;
    this.btnPlay.textContent = this.running ? 'Pause' : this.converged ? 'Converged' : 'Play';
    this.btnPlay.disabled = this.converged && !this.running;
    this.shell.refreshStatus();
  },

  // ------------------------------------------------------------ Gauss path and capacitance

  conductorPotentials() {
    const set = new Set();
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) if (this.fixed[this.idx(i, j)] && !this.isWall(i, j)) set.add(this.Vfix[this.idx(i, j)]);
    return [...set].sort((a, b) => a - b);
  },

  deltaV() {
    const p = this.conductorPotentials();
    if (p.length >= 2) return p[p.length - 1] - p[0];
    if (p.length === 1) return Math.abs(p[0]);
    return NaN;
  },

  updateGauss() {
    if (!this.gaussOut) return;
    if (!this.gauss) { this.gaussOut.textContent = 'Drag a box around one conductor with the Gauss-law tool.'; return; }
    const s = new Relax2D(this.n, this.n, [-L, L, -L, L], { boundary: this.boundary });
    s.V.set(this.V); s.fixed.set(this.fixed); s.eps.set(this.eps);
    const lam = s.gaussCharge(...this.gauss);
    const dV = this.deltaV();
    const c2d = lam / dV;
    const W = s.energy();
    const cE = 2 * W / (dV * dV);
    let ideal = '';
    if (this.preset === 'parallel-plates' && !this.custom) {
      const ci = EPS0 * this.pp.h / (2 * this.pp.d - this.pp.t);
      ideal = `\nIdeal ε₀h/gap = ${sci(ci, 4)} F/m (gap = 2d − t = ${(2 * this.pp.d - this.pp.t).toFixed(3)} m), ratio ${sci(Math.abs(c2d) / ci, 4)}`;
    }
    this.gaussOut.textContent = `λ enclosed = ${sci(lam, 4)} C/m\nΔV between conductors = ${sci(dV, 4)} V\nC (Gauss) = λ/ΔV = ${sci(Math.abs(c2d), 4)} F/m\nC (energy) = 2W/ΔV² = ${sci(cE, 4)} F/m${ideal}${this.converged ? '' : '\n(solution not yet converged)'}`;
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell;
    const box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Sandbox'));
    box.appendChild(ui.lead(shell, 'Draw a problem and watch the neighbour-averaging solver converge.'));

    // Solver run controls
    box.appendChild(ui.el('h2', '', 'Solver'));
    const run = ui.el('div', 'row');
    this.btnPlay = ui.button('Play', () => (this.running ? this.pause() : this.play()), 'btn');
    run.append(this.btnPlay, ui.button('Step', () => this.step(), 'btn btn-small'), ui.button('Reset V', () => this.resetSolution(), 'btn btn-small'));
    box.appendChild(run);
    const r0 = ui.el('div', 'row');
    r0.appendChild(ui.field('Sweeps per frame', ui.number(this.k, { min: 1, max: 5000, onChange: (v) => { this.k = Math.round(v); shell.syncUrl(); } })));
    r0.appendChild(ui.field('Stop when max |ΔV| <', ui.number(this.tol, { min: 1e-12, max: 1, onChange: (v) => { this.tol = v; shell.syncUrl(); } })));
    box.appendChild(r0);
    this.histCanvas = document.createElement('canvas');
    this.histCanvas.width = 240; this.histCanvas.height = 90;
    this.histCanvas.style.width = '100%'; this.histCanvas.style.border = '1px solid var(--line)'; this.histCanvas.style.borderRadius = '6px';
    box.appendChild(this.histCanvas);
    box.appendChild(ui.el('p', 'hint', 'Residual (largest change in one sweep) versus sweep count, log scale.'));

    // Grid and physics
    box.appendChild(ui.el('h2', '', 'Grid'));
    const r1 = ui.el('div', 'row');
    r1.appendChild(ui.field('Grid', ui.select([[65, '65 × 65'], [129, '129 × 129'], [257, '257 × 257']], String(this.n), (v) => { this.n = parseInt(v, 10); this.reload(); })));
    r1.appendChild(ui.field('Box boundary', ui.select([['dirichlet', 'Grounded (V = 0)'], ['neumann', 'Mirror (∂V/∂n = 0)']], this.boundary, (v) => { this.boundary = v; this.reload(); })));
    box.appendChild(r1);
    const pz = document.createElement('label');
    pz.className = 'layer';
    const pzc = document.createElement('input'); pzc.type = 'checkbox'; pzc.checked = this.poisson;
    pzc.addEventListener('change', () => { this.poisson = pzc.checked; if (!this.poisson) { this.rho.fill(0); this.commitGeometry(); } this.buildControls(); shell.renderEquations(); shell.syncUrl(); });
    pz.append(pzc, ui.el('span', '', 'Poisson: allow painted charge ρ'));
    box.appendChild(pz);

    // Presets
    box.appendChild(ui.el('h2', '', 'Preset geometry'));
    box.appendChild(ui.field('Preset', ui.select(PRESETS, this.preset, (v) => { this.preset = v; this.buildControls(); this.reload(); })));
    const pr = ui.el('div', 'row');
    const param = (key, label, min, max) => pr.appendChild(ui.field(label, ui.number(this.pp[key], { min, max, onChange: (v) => { this.pp[key] = v; this.reload(); } })));
    if (this.preset !== 'empty') { param('d', 'd (m)', 0.05, 0.95); param('V0', 'V₀ (V)', 0.01, 1e6); }
    if (this.preset === 'two-rods' || this.preset === 'square-rods') param('a', 'a (m)', 0.02, 0.9);
    if (this.preset === 'parallel-plates') { param('h', 'h (m)', 0.05, 1.9); param('t', 't (m)', 0.01, 0.5); }
    if (this.preset === 'triangles') param('side', 'side (m)', 0.05, 1);
    box.appendChild(pr);
    if (this.preset !== 'empty') box.appendChild(ui.el('p', 'hint', 'Left conductor at −V₀, right at +V₀, centred at x = ±d. Edit the numbers and the grid reloads.'));
    if (this.custom) box.appendChild(ui.el('span', 'badge badge-warn', 'edited by hand'));

    // Paint tools
    box.appendChild(ui.el('h2', '', 'Paint'));
    box.appendChild(ui.field('Tool', ui.select(TOOLS.filter(([id]) => id !== 'charge' || this.poisson), this.tool, (v) => { this.tool = v; this.buildControls(); shell.redrawOverlay(); })));
    const tr = ui.el('div', 'row');
    tr.appendChild(ui.field('Brush (cells)', ui.number(this.brush, { min: 1, max: 30, onChange: (v) => { this.brush = Math.round(v); shell.syncUrl(); } })));
    if (this.tool === 'conductor') tr.appendChild(ui.field('Conductor V (V)', ui.number(this.toolV, { onChange: (v) => { this.toolV = v; shell.syncUrl(); } })));
    if (this.tool === 'dielectric') tr.appendChild(ui.field('εr', ui.number(this.toolEps, { min: 0.01, max: 1e4, onChange: (v) => { this.toolEps = v; shell.syncUrl(); } })));
    if (this.tool === 'charge') tr.appendChild(ui.field('ρ (C/m³)', ui.number(this.toolRho, { onChange: (v) => { this.toolRho = v; shell.syncUrl(); } })));
    box.appendChild(tr);
    box.appendChild(ui.el('p', 'hint', this.tool === 'probe' ? 'Pick a paint tool, then draw on the plot. Switch back to Probe to read values by clicking.' : 'Draw on the plot. The solver restarts from the current solution after each stroke.'));
    const clr = ui.el('div', 'row');
    clr.append(ui.button('Clear everything', () => { this.preset = 'empty'; this.buildControls(); this.reload(); }, 'btn btn-small'), ui.button('Reload preset', () => this.reload(), 'btn btn-small'));
    box.appendChild(clr);

    // Gauss
    box.appendChild(ui.el('h2', '', 'Capacitance from Gauss\'s law'));
    this.gaussOut = ui.el('pre', 'placeholder');
    this.gaussOut.style.whiteSpace = 'pre-wrap'; this.gaussOut.style.fontSize = '12px'; this.gaussOut.style.margin = '0';
    box.appendChild(this.gaussOut);
    const gr = ui.el('div', 'row');
    gr.append(ui.button('Clear path', () => { this.gauss = null; this.updateGauss(); shell.redrawOverlay(); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(gr);
    box.appendChild(ui.el('p', 'hint', 'Sum of ε₀ εr E·n over the faces of the box gives the enclosed charge per unit length λ; C per unit length is λ divided by the potential difference between the conductors.'));
    this.updateGauss();
    this.updateRunButtons();
    this.drawHistory();
  },

  reload() {
    this.running = false; this.shell.solverRunning = false;
    this.loadPreset();
    this.gauss = null;
    this.sendInit(false);
    this.buildControls();
    this.shell.recompute();
    this.shell.syncUrl();
  },

  drawHistoryBig(ctx, W, H) {
    const Hh = this.history;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    if (Hh.length < 2) { ctx.fillText('Press Play: the largest change per sweep is plotted here against the sweep count.', 20, 30); return; }
    const xs = Hh.map((p) => p[0]), ys = Hh.map((p) => Math.log10(p[1]));
    const x0 = 0, x1 = Math.max(...xs), y0 = Math.min(...ys, Math.log10(this.tol)), y1 = Math.max(...ys);
    const L = 70, T = 30, B = 50, Rm = 20;
    const px = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rm), py = (y) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let e = Math.ceil(y0); e <= Math.floor(y1); e++) { ctx.fillText(`1e${e}`, 20, py(e) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(e)); ctx.lineTo(W - Rm, py(e)); ctx.stroke(); }
    for (let k = 0; k <= 6; k++) { const v = Math.round(x0 + (k / 6) * (x1 - x0)); ctx.fillText(String(v), px(v) - 10, H - B + 16); }
    ctx.fillText('sweeps', W / 2 - 20, H - 8);
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('max |ΔV| per sweep (V)', -70, 0); ctx.restore();
    ctx.strokeStyle = '#e5484d'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(L, py(Math.log10(this.tol))); ctx.lineTo(W - Rm, py(Math.log10(this.tol))); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#e5484d'; ctx.fillText(`stop tolerance ${this.tol}`, W - 180, py(Math.log10(this.tol)) - 6);
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 2; ctx.beginPath();
    Hh.forEach((p, k) => { const X = px(p[0]), Y = py(Math.log10(p[1])); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
    ctx.stroke();
    ctx.fillStyle = '#5a5955'; ctx.fillText(`${this.n}² grid · ${this.sweeps} sweeps · ${this.converged ? 'converged' : this.running ? 'running' : 'paused'}`, L, T - 8);
  },

  drawHistory() {
    this.shell.updateStageView();
    const c = this.histCanvas; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const H = this.history;
    if (H.length < 2) return;
    const xs = H.map((p) => p[0]), ys = H.map((p) => Math.log10(p[1]));
    const x0 = 0, x1 = Math.max(...xs), y0 = Math.min(...ys, Math.log10(this.tol)), y1 = Math.max(...ys);
    const px = (x) => 28 + ((x - x0) / (x1 - x0 || 1)) * (c.width - 34);
    const py = (y) => 6 + (1 - (y - y0) / (y1 - y0 || 1)) * (c.height - 20);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px(x0), py(Math.log10(this.tol))); ctx.lineTo(px(x1), py(Math.log10(this.tol))); ctx.stroke();
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    H.forEach((p, k) => { const X = px(p[0]), Y = py(Math.log10(p[1])); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
    ctx.stroke();
    ctx.fillStyle = '#5a5955'; ctx.font = '10px system-ui';
    ctx.fillText(`1e${y1.toFixed(0)}`, 2, 12); ctx.fillText(`1e${y0.toFixed(0)}`, 2, c.height - 14);
    ctx.fillText(`${x1} sweeps`, c.width - 60, c.height - 2);
  },

  // ------------------------------------------------------------ model for the shell

  compute() {
    this.gridV = new Grid2D(this.n, this.n, [-L, L, -L, L], this.V);
    [this.gridEx, this.gridEy] = this.gridV.negGradient();
    this.gridEmag = magnitude(this.gridEx, this.gridEy);
    this.gridRes = new Grid2D(this.n, this.n, [-L, L, -L, L], this.delta);
    const p = this.conductorPotentials();
    const m = p.length ? Math.max(Math.abs(p[0]), Math.abs(p[p.length - 1])) : 1;
    this.vRange = [-m, m];
    const e = Array.from(this.gridEmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    this.eRange = e.length ? [e[Math.floor(0.05 * (e.length - 1))], e[Math.floor(0.98 * (e.length - 1))]] : [1, 10];
  },

  render(layer, ctx, view, opts) {
    const eFn = (x, y) => [this.gridEx.sample(x, y), this.gridEy.sample(x, y)];
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? this.vRange[0], max: opts.max ?? this.vRange[1] });
      case 'Emag': return drawScalarField(ctx, this.gridEmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.eRange[0], max: opts.max ?? this.eRange[1] });
      case 'res': return drawScalarField(ctx, this.gridRes, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.tol * 0.01, max: opts.max ?? (Number.isFinite(this.residual) && this.residual > 0 ? Math.max(this.residual, this.tol) : this.tol) });
      case 'E':
        if (opts.style === 'lines') {
          const seeds = [];
          // seed just outside every conductor cell that borders free space, thinned
          let count = 0;
          for (let j = 1; j < this.n - 1; j += 2) for (let i = 1; i < this.n - 1; i += 2) {
            const k = this.idx(i, j);
            if (!this.fixed[k] || this.isWall(i, j)) continue;
            if (!this.fixed[k + 1] || !this.fixed[k - 1] || !this.fixed[k + this.n] || !this.fixed[k - this.n]) { if (count++ % 3 === 0) seeds.push([-L + i * this.h, -L + j * this.h]); }
          }
          const stop = (x, y) => { const [i, j] = this.cellOf(x, y); return i < 1 || j < 1 || i >= this.n - 1 || j >= this.n - 1 || this.fixed[this.idx(i, j)] === 1; };
          drawStreamlines(ctx, view, eFn, seeds.slice(0, 200), { stopFn: stop, maxSteps: 1500 });
        } else drawQuiver(ctx, view, eFn, { normalize: true, spacing: 26 });
        return null;
      case 'Veq': drawContours(ctx, view, this.gridV, levelsBetween(this.vRange[0], this.vRange[1], 20), { color: 'rgba(0,0,0,0.5)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    // Materials as a scaled n x n image
    const n = this.n;
    if (!this.matCanvas || this.matCanvas.width !== n) { this.matCanvas = document.createElement('canvas'); this.matCanvas.width = n; this.matCanvas.height = n; }
    const mctx = this.matCanvas.getContext('2d');
    const img = mctx.createImageData(n, n);
    const d = img.data;
    const vmax = this.vRange?.[1] || 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = this.idx(i, j), q = ((n - 1 - j) * n + i) * 4; // flip y for the canvas
      if (this.fixed[k]) {
        if (this.isWall(i, j)) { d[q] = 120; d[q + 1] = 120; d[q + 2] = 120; d[q + 3] = 200; continue; }
        const v = this.Vfix[k] / vmax;
        if (v > 0) { d[q] = 229; d[q + 1] = 72; d[q + 2] = 77; } else if (v < 0) { d[q] = 59; d[q + 1] = 130; d[q + 2] = 246; } else { d[q] = 160; d[q + 1] = 160; d[q + 2] = 160; }
        d[q + 3] = 235;
      } else {
        let a = 0;
        if (this.eps[k] !== 1) { d[q] = 80; d[q + 1] = 220; d[q + 2] = 220; a = Math.min(150, 40 + 25 * Math.log(this.eps[k] + 1)); }
        if (this.rho[k] !== 0) { d[q] = this.rho[k] > 0 ? 255 : 200; d[q + 1] = this.rho[k] > 0 ? 200 : 120; d[q + 2] = this.rho[k] > 0 ? 60 : 255; a = 170; }
        d[q + 3] = a;
      }
    }
    mctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.matCanvas, 0, 0, view.width, view.height);
    ctx.restore();
    // Gauss box
    if (this.gauss) {
      const [i0, j0, i1, j1] = this.gauss;
      const [ax, ay] = view.toPx(-L + (Math.min(i0, i1) - 0.5) * this.h, -L + (Math.min(j0, j1) - 0.5) * this.h);
      const [bx, by] = view.toPx(-L + (Math.max(i0, i1) + 0.5) * this.h, -L + (Math.max(j0, j1) + 0.5) * this.h);
      ctx.save(); ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)); ctx.restore();
    }
    // Brush cursor
    if (this.hover && this.tool !== 'probe' && this.tool !== 'gauss') {
      const [px, py] = view.toPx(this.hover[0], this.hover[1]);
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(px, py, ((this.brush - 0.5) * this.h) / view.scale, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    }
  },

  statusText() {
    const r = Number.isFinite(this.residual) ? this.residual.toExponential(2) : '—';
    return `${this.n}² grid · sweep ${this.sweeps} · max |ΔV| = ${r} V · ${this.running ? 'running' : this.converged ? 'converged' : 'paused'}`;
  },

  probe(x, y) {
    if (!this.gridV) this.compute();
    const [i, j] = this.cellOf(x, y);
    const k = this.idx(Math.min(Math.max(i, 0), this.n - 1), Math.min(Math.max(j, 0), this.n - 1));
    return [
      { label: 'V', value: this.gridV.sample(x, y), unit: 'V' },
      { label: 'Ex', value: this.gridEx.sample(x, y), unit: 'V/m' },
      { label: 'Ey', value: this.gridEy.sample(x, y), unit: 'V/m' },
      { label: '|E|', value: this.gridEmag.sample(x, y), unit: 'V/m' },
      { label: 'εr here', value: this.eps[k], unit: '' },
      { label: 'ρ here', value: this.rho[k], unit: 'C/m³' },
      { label: 'cell', value: this.fixed[k] ? 1 : 0, unit: '1 = conductor' },
      { label: 'last |ΔV| here', value: this.delta[k], unit: 'V' },
    ];
  },

  getState() {
    const s = { n: this.n, bnd: this.boundary, poisson: this.poisson ? '1' : '0', preset: this.preset, k: this.k, tol: this.tol, tv: this.toolV, te: this.toolEps, tr: this.toolRho, br: this.brush };
    for (const [key, v] of Object.entries(this.pp)) s[`p_${key}`] = v;
    if (this.gauss) s.g = this.gauss.join(',');
    if (this.custom) {
      const geo = this.geometryString();
      if (geo.length < 6000) s.geo = geo; else s.geo = '';
    }
    return s;
  },

  // Run-length encoding of the painted cells so a hand-drawn problem fits in a link.
  geometryString() {
    const pal = new Map(); const keys = [];
    const runs = [];
    let prev = -1, len = 0;
    for (let k = 0; k < this.n * this.n; k++) {
      const key = `${this.fixed[k]}|${this.fixed[k] ? this.Vfix[k] : 0}|${this.eps[k]}|${this.rho[k]}`;
      let id = pal.get(key);
      if (id === undefined) { id = keys.length; pal.set(key, id); keys.push(key); }
      if (id === prev) len++; else { if (len) runs.push(`${prev.toString(36)}x${len.toString(36)}`); prev = id; len = 1; }
    }
    runs.push(`${prev.toString(36)}x${len.toString(36)}`);
    return `${this.n};${keys.join('~')};${runs.join(',')}`;
  },

  loadGeometryString(str) {
    try {
      const [nStr, palStr, runStr] = str.split(';');
      const n = parseInt(nStr, 10);
      const pal = palStr.split('~').map((k) => k.split('|').map(Number));
      const s = new Relax2D(n, n, [-L, L, -L, L], { boundary: this.boundary });
      let k = 0;
      for (const run of runStr.split(',')) {
        const [idS, lenS] = run.split('x');
        const [fixed, V, eps, rho] = pal[parseInt(idS, 36)];
        const len = parseInt(lenS, 36);
        for (let m = 0; m < len && k < n * n; m++, k++) { s.fixed[k] = fixed; s.V[k] = fixed ? V : 0; s.eps[k] = eps; s.rho[k] = rho; }
      }
      s.applyBoundary();
      this.adopt(s);
      this.custom = true;
      this.sweeps = 0; this.residual = Infinity; this.converged = false; this.history = [];
    } catch {
      this.loadPreset();
    }
  },

  csv() {
    if (!this.gridV) this.compute();
    const g = this.gridV;
    const lines = ['x_m,y_m,V_V,Ex_Vpm,Ey_Vpm,eps_r,rho_Cpm3,conductor'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const k = this.idx(i, j);
      lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridEx.get(i, j)},${this.gridEy.get(i, j)},${this.eps[k]},${this.rho[k]},${this.fixed[k]}`);
    }
    return lines.join('\n');
  },
};
