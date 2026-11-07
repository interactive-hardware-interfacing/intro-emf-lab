// Time-varying fields tab: 2-D FDTD (TMz) in a Web Worker. The one tab where dD/dt is not
// zero: Faraday and Ampere are stepped in time on a Yee grid (core/fdtd2d.js) and the wave
// is watched as it propagates, reflects, refracts and diffracts. Presets give a pulse in free
// space, a dielectric slab, a slit in a conducting wall, a dielectric lens and a parallel-plate
// waveguide; paint tools let students add conductors and dielectrics by hand.

import { EPS0, MU0 } from '../../core/constants.js';
import { FDTD2D, C0, fillRect, fillCircle } from '../../core/fdtd2d.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawMarker } from '../../core/render.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const L = 2;        // the box is L x L metres
const PRESETS = [
  ['free', 'Pulse in free space'],
  ['slab', 'Dielectric slab (εr = 4)'],
  ['slit', 'Slit in a conducting wall'],
  ['lens', 'Dielectric lens (cylinder, εr = 2.5)'],
  ['guide', 'Parallel-plate waveguide'],
  ['empty', 'Empty box (paint your own)'],
];
const TOOLS = [
  ['probe', 'Probe (click to read values and record Ez(t))'],
  ['pec', 'Paint conductor (PEC)'],
  ['dielectric', 'Paint dielectric εr'],
  ['erase', 'Erase to free space'],
];

export default {
  id: 'fdtd',
  title: 'Time-varying',
  phase: 6,
  available: true,
  summary: 'Waves in time: 2-D FDTD with dD/dt switched on.',
  extent: [0, L, 0, L],
  axes: ['x', 'y'],
  layers: [
    { id: 'Ez', label: 'E_z', kind: 'scalar', unit: 'V/m', signed: true, default: true, eq: 'E' },
    { id: 'Hmag', label: '|H|', kind: 'scalar', unit: 'A/m', log: true, eq: 'H' },
    { id: 'S', label: '|S| = |E × H|', kind: 'scalar', unit: 'W/m²', log: true, eq: 'S' },
    { id: 'H', label: 'H field', kind: 'vector', styles: ['arrows'], eq: 'H' },
    { id: 'geom', label: 'Materials', kind: 'info', note: 'conductors grey, dielectrics tinted, source marked' },
  ],

  // ------------------------------------------------------------ state
  n: 201,
  preset: 'free',
  wave: 'pulse',      // 'pulse' | 'cw'
  f: 1e9,             // Hz
  k: 4,               // time steps per frame
  yWall: 'mur',       // 'mur' | 'mirror'
  tool: 'probe',
  brush: 3,
  toolEps: 4,
  running: false,
  custom: false,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.n = [101, 201, 301].includes(getNum(s, 'n', 201)) ? getNum(s, 'n', 201) : 201;
    this.preset = PRESETS.some(([id]) => id === s.preset) ? s.preset : 'free';
    this.wave = s.src === 'cw' ? 'cw' : 'pulse';
    this.f = Math.min(5e9, Math.max(1e8, getNum(s, 'f', 1e9)));
    this.k = Math.max(1, Math.round(getNum(s, 'speed', 4)));
    this.yWall = s.side === 'mirror' ? 'mirror' : 'mur';
    this.toolEps = getNum(s, 'te', 4);
    this.brush = Math.max(1, Math.round(getNum(s, 'br', 3)));
    this.tool = 'probe';
    this.custom = false;
    this.running = false;
    this.stepCount = 0; this.t = 0; this.energy = 0; this.trace = null;
    this.loadPreset();
    this.startWorker();
    this.views = [plotView('trace', 'Ez at the probe', (ctx, w, h) => this.drawTrace(ctx, w, h))];
    this.buildControls();
  },

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.shell.solverRunning = false;
  },

  // ------------------------------------------------------------ geometry

  get h() { return L / (this.n - 1); },
  idx(i, j) { return j * this.n + i; },
  cellOf(x, y) { const h = this.h; return [Math.round(x / h), Math.round(y / h)]; },

  /** Build the material arrays and sources for the preset (in metres, so any grid works). */
  loadPreset() {
    const n = this.n, h = this.h;
    const s = new FDTD2D(n, n, { h, yWall: this.yWall });
    const src = { wave: this.wave, f: this.f, amp: 1 };
    switch (this.preset) {
      case 'slab':
        fillRect(s, 1.2, 1.5, 0, L, { epsR: 4 });
        s.addSource({ ...src, kind: 'line', i: Math.round(0.15 / h) });
        break;
      case 'slit':
        fillRect(s, 1.0, 1.0 + 2 * h, 0, 0.85, { pec: 1 });
        fillRect(s, 1.0, 1.0 + 2 * h, 1.15, L, { pec: 1 });
        s.addSource({ ...src, kind: 'line', i: Math.round(0.15 / h) });
        break;
      case 'lens':
        fillCircle(s, 1.0, 1.0, 0.45, { epsR: 2.5 });
        s.addSource({ ...src, kind: 'line', i: Math.round(0.15 / h) });
        break;
      case 'guide':
        fillRect(s, 0, L, 0.68, 0.68 + 2 * h, { pec: 1 });
        fillRect(s, 0, L, 1.32 - 2 * h, 1.32, { pec: 1 });
        s.addSource({ ...src, kind: 'point', i: Math.round(0.3 / h), j: Math.round(1.0 / h) });
        break;
      case 'empty':
        s.addSource({ ...src, kind: 'point', i: Math.round(0.5 / h), j: Math.round(1.0 / h) });
        break;
      default: // free
        s.addSource({ ...src, kind: 'point', i: Math.round(1.0 / h), j: Math.round(1.0 / h) });
    }
    this.epsR = s.epsR; this.pec = s.pec; this.sources = s.sources;
    this.Ez = new Float64Array(n * n); this.Hx = new Float64Array(n * n); this.Hy = new Float64Array(n * n);
    this.dt = s.dt;
    this.stepCount = 0; this.t = 0; this.energy = 0; this.trace = null; this.ezScale = 0; this.ezPeak = 0;
    this.custom = false;
  },

  paintAt(x, y) {
    const [ci, cj] = this.cellOf(x, y), n = this.n, r = this.brush - 1;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 1 || j < 1 || i >= n - 1 || j >= n - 1) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 > r * r + 0.5) continue;
      const k = this.idx(i, j);
      switch (this.tool) {
        case 'pec': this.pec[k] = 1; break;
        case 'dielectric': this.epsR[k] = this.toolEps; this.pec[k] = 0; break;
        case 'erase': this.pec[k] = 0; this.epsR[k] = 1; break;
        default: break;
      }
    }
    this.custom = true;
  },

  onPointer(type, x, y) {
    if (this.tool === 'probe') return false;
    if (type === 'leave') { this.hover = null; this.shell.redrawOverlay(); return true; }
    if (type === 'move') { this.hover = [x, y]; this.shell.redrawOverlay(); return true; }
    if (type === 'down' || type === 'drag') { this.paintAt(x, y); this.hover = [x, y]; this.shell.redrawOverlay(); }
    if (type === 'up') this.commitGeometry();
    return true;
  },

  /** After a paint stroke: resend materials, keeping the fields and the clock. */
  commitGeometry() {
    this.sendInit(true);
    if (this.running) this.play();
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

  traceCell() {
    const [px, py] = this.shell.probePt;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    const [i, j] = this.cellOf(px, py);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return null;
    return { i, j };
  },

  sendInit(warm) {
    const msg = { cmd: 'init', kind: 'fdtd', nx: this.n, ny: this.n, h: this.h, epsR: this.epsR, pec: this.pec, yWall: this.yWall, sources: this.sources, trace: this.traceCell() };
    if (warm) Object.assign(msg, { Ez: this.Ez, Hx: this.Hx, Hy: this.Hy, t: this.t, step: this.stepCount });
    this.send(msg);
  },

  onFrame(m) {
    if (m.type === 'ready') return;
    this.Ez = m.Ez; this.Hx = m.Hx; this.Hy = m.Hy;
    this.stepCount = m.step; this.t = m.t; this.energy = m.energy; this.trace = m.trace;
    if (m.paused) { this.running = false; this.shell.solverRunning = false; this.updateRunButtons(); }
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.shell.recompute(); this.shell.updateStageView(); });
  },

  play() { this.running = true; this.shell.solverRunning = true; this.send({ cmd: 'run', k: this.k }); this.updateRunButtons(); },
  pause() { this.running = false; this.shell.solverRunning = false; this.send({ cmd: 'pause' }); this.updateRunButtons(); },
  step() { this.running = false; this.shell.solverRunning = false; this.send({ cmd: 'step', k: 1 }); this.updateRunButtons(); },
  resetFields() { this.running = false; this.shell.solverRunning = false; this.ezScale = 0; this.ezPeak = 0; this.send({ cmd: 'reset' }); this.updateRunButtons(); },

  updateRunButtons() {
    if (!this.btnPlay) return;
    this.btnPlay.textContent = this.running ? 'Pause' : 'Run';
    this.shell.refreshStatus();
  },

  reload() {
    this.running = false; this.shell.solverRunning = false;
    this.loadPreset();
    this.sendInit(false);
    this.buildControls();
    this.shell.recompute();
    this.shell.syncUrl();
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Time-varying fields'));
    box.appendChild(ui.lead(shell, 'Maxwell\'s equations stepped in time: watch a wave propagate, reflect, refract and diffract.'));

    box.appendChild(ui.el('h2', '', 'Run'));
    const run = ui.el('div', 'row');
    this.btnPlay = ui.button('Run', () => (this.running ? this.pause() : this.play()), 'btn');
    run.append(this.btnPlay, ui.button('Step', () => this.step(), 'btn btn-small'), ui.button('Reset fields', () => this.resetFields(), 'btn btn-small'));
    box.appendChild(run);
    const r0 = ui.el('div', 'row');
    r0.appendChild(ui.field('Time steps per frame', ui.number(this.k, { min: 1, max: 200, onChange: (v) => { this.k = Math.round(v); if (this.running) this.play(); shell.syncUrl(); } })));
    r0.appendChild(ui.field('Grid', ui.select([[101, '101² (h = 2 cm)'], [201, '201² (h = 1 cm)'], [301, '301² (h = 0.67 cm)']], String(this.n), (v) => { this.n = parseInt(v, 10); this.reload(); })));
    box.appendChild(r0);
    box.appendChild(ui.el('p', 'hint', `Yee grid, leap-frog in time. dt = ${(this.dt * 1e12).toFixed(2)} ps = 0.99 × h/(c√2), the largest stable step (Courant). One frame is ${this.k} step${this.k > 1 ? 's' : ''}.`));

    box.appendChild(ui.el('h2', '', 'Problem'));
    box.appendChild(ui.field('Preset', ui.select(PRESETS, this.preset, (v) => { this.preset = v; this.reload(); })));
    const r1 = ui.el('div', 'row');
    r1.appendChild(ui.field('Source', ui.select([['pulse', 'Pulse'], ['cw', 'CW']], this.wave, (v) => { this.wave = v; this.reload(); })));
    r1.appendChild(ui.field('Frequency (GHz)', ui.number(this.f / 1e9, { min: 0.1, max: 5, onChange: (v) => { this.f = v * 1e9; this.reload(); } })));
    r1.appendChild(ui.field('Top/bottom walls', ui.select([['mur', 'Open'], ['mirror', 'Mirror']], this.yWall, (v) => { this.yWall = v; this.reload(); })));
    box.appendChild(r1);
    const lam = C0 / this.f;
    box.appendChild(ui.el('p', 'hint', `λ₀ = ${(lam * 100).toFixed(1)} cm = ${(lam / this.h).toFixed(1)} cells. Keep at least 10 cells per wavelength in the densest material (λ = λ₀/√εr). ${this.wave === 'pulse' ? 'The pulse has width τ = 1/(2f).' : 'The CW source ramps up over one period.'} Left and right walls are always absorbing; the source is "soft" (added to E_z), so waves pass through it.`));
    const presetHints = {
      free: 'A point source radiates a cylindrical wave; its amplitude falls as 1/√r in 2-D. The absorbing walls let it leave the box.',
      slab: 'A plane wave meets a slab of εr = 4 (n = 2). Part reflects (Γ = (1−n)/(1+n) = −1/3 at the first face), part transmits at c/2 and bounces inside the slab.',
      slit: 'The wave squeezes through a 30 cm slit in a perfect conductor and spreads out behind it: diffraction. Compare λ₀ with the slit width by changing the frequency.',
      lens: 'A dielectric cylinder slows the wave in its middle more than at its edges, so the wavefront curves and focuses behind it, like a lens.',
      guide: 'Two conducting plates 64 cm apart. Each frequency above the cut-off f_c = mc/(2a) (m = 1: 0.23 GHz) travels as a mode with its own pattern; below cut-off nothing propagates.',
      empty: 'Paint conductors and dielectrics, then run.',
    };
    box.appendChild(ui.el('p', 'hint', presetHints[this.preset]));
    if (this.custom) box.appendChild(ui.el('span', 'badge badge-warn', 'edited by hand'));

    box.appendChild(ui.el('h2', '', 'Paint'));
    box.appendChild(ui.field('Tool', ui.select(TOOLS, this.tool, (v) => { this.tool = v; this.buildControls(); shell.redrawOverlay(); })));
    const tr = ui.el('div', 'row');
    tr.appendChild(ui.field('Brush (cells)', ui.number(this.brush, { min: 1, max: 30, onChange: (v) => { this.brush = Math.round(v); shell.syncUrl(); } })));
    if (this.tool === 'dielectric') tr.appendChild(ui.field('εr', ui.number(this.toolEps, { min: 1, max: 100, onChange: (v) => { this.toolEps = v; shell.syncUrl(); } })));
    box.appendChild(tr);
    box.appendChild(ui.el('p', 'hint', this.tool === 'probe' ? 'Pick a paint tool, then draw on the plot. With Probe, click a point to read the fields there and to record E_z(t) in the "Ez at the probe" view.' : 'Draw on the plot. The materials update while the wave keeps going.'));
    const clr = ui.el('div', 'row');
    clr.append(ui.button('Reload preset', () => this.reload(), 'btn btn-small'), ui.button('Show Ez(t) at probe', () => { shell.setStageView('trace'); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(clr);

    box.appendChild(ui.el('h2', '', 'Energy'));
    this.energyEl = ui.el('pre', 'placeholder');
    this.energyEl.style.whiteSpace = 'pre-wrap'; this.energyEl.style.fontSize = '12px'; this.energyEl.style.margin = '0';
    box.appendChild(this.energyEl);
    box.appendChild(ui.el('p', 'hint', 'W = ∫ (½εE² + ½μ₀H²) dA per metre of z. It rises while the source is on and falls as the wave leaves through the open walls or is absorbed.'));
    this.updateRunButtons();
    this.updateEnergy();
  },

  updateEnergy() {
    if (this.energyEl) this.energyEl.textContent = `t = ${(this.t * 1e9).toFixed(3)} ns, step ${this.stepCount}\nW = ${sci(this.energy, 4)} J/m`;
  },

  // ------------------------------------------------------------ model for the shell

  compute() {
    const n = this.n, ext = [0, L, 0, L];
    this.gridEz = new Grid2D(n, n, ext, this.Ez);
    // H to the nodes
    const hx = new Float64Array(n * n), hy = new Float64Array(n * n), sm = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      hx[k] = j === 0 ? this.Hx[k] : 0.5 * (this.Hx[k] + this.Hx[k - n]);
      hy[k] = i === 0 ? this.Hy[k] : 0.5 * (this.Hy[k] + this.Hy[k - 1]);
      sm[k] = Math.abs(this.Ez[k]) * Math.hypot(hx[k], hy[k]); // |S| = |E x H| = |Ez| |H| (E is along z, H in the plane)
    }
    this.gridHx = new Grid2D(n, n, ext, hx); this.gridHy = new Grid2D(n, n, ext, hy);
    this.gridHmag = magnitude(this.gridHx, this.gridHy);
    this.gridS = new Grid2D(n, n, ext, sm);
    let m = 0; for (let k = 0; k < n * n; k++) { const a = Math.abs(this.Ez[k]); if (a > m) m = a; }
    this.ezPeak = Math.max(m, this.ezPeak || 0);
    this.ezScale = Math.max(m, 0.9 * (this.ezScale || 0), 0.05 * this.ezPeak) || 1; // slowly forgets the peak so a departing pulse stays visible, but never zooms into the numerical noise floor
    this.ezRange = [-0.8 * this.ezScale, 0.8 * this.ezScale];
    const eta = Math.sqrt(MU0 / EPS0);
    this.hRange = [1e-3 * this.ezScale / eta, 0.8 * this.ezScale / eta];
    this.sRange = [1e-5 * this.ezScale * this.ezScale / eta, 0.6 * this.ezScale * this.ezScale / eta];
    this.updateEnergy();
  },

  render(layer, ctx, view, opts) {
    switch (layer) {
      case 'Ez': return drawScalarField(ctx, this.gridEz, { map: opts.map, extent: opts.extent, min: opts.min ?? this.ezRange[0], max: opts.max ?? this.ezRange[1] });
      case 'Hmag': return drawScalarField(ctx, this.gridHmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.hRange[0], max: opts.max ?? this.hRange[1] });
      case 'S': return drawScalarField(ctx, this.gridS, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.sRange[0], max: opts.max ?? this.sRange[1] });
      case 'H': drawQuiver(ctx, view, (x, y) => [this.gridHx.sample(x, y), this.gridHy.sample(x, y)], { normalize: true, spacing: 26 }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const n = this.n;
    if (!this.matCanvas || this.matCanvas.width !== n) { this.matCanvas = document.createElement('canvas'); this.matCanvas.width = n; this.matCanvas.height = n; }
    const mctx = this.matCanvas.getContext('2d');
    const img = mctx.createImageData(n, n), d = img.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = this.idx(i, j), q = ((n - 1 - j) * n + i) * 4;
      if (this.pec[k]) { d[q] = 170; d[q + 1] = 170; d[q + 2] = 170; d[q + 3] = 235; }
      else if (this.epsR[k] !== 1) { d[q] = 80; d[q + 1] = 220; d[q + 2] = 220; d[q + 3] = Math.min(150, 40 + 25 * Math.log(this.epsR[k] + 1)); }
      else d[q + 3] = 0;
    }
    mctx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(this.matCanvas, 0, 0, view.width, view.height); ctx.restore();
    // sources
    for (const s of this.sources) {
      if (s.kind === 'line') {
        const [px] = view.toPx(s.i * this.h, 0);
        ctx.save(); ctx.strokeStyle = '#f5a623'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, view.height); ctx.stroke(); ctx.restore();
      } else drawMarker(ctx, view, s.i * this.h, s.j * this.h, { fill: '#f5a623', radius: 5 });
    }
    if (this.hover && this.tool !== 'probe') {
      const [px, py] = view.toPx(this.hover[0], this.hover[1]);
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(px, py, ((this.brush - 0.5) * this.h) / view.scale, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    }
  },

  drawTrace(ctx, W, H) {
    const tr = this.trace;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    if (!tr || tr.t.length < 2) { ctx.fillText('Click a point on the Field view with the Probe tool, then Run: E_z at that point is recorded here against time.', 20, 30); return; }
    const t0 = tr.t[0], t1 = tr.t[tr.t.length - 1];
    let vm = 0; for (const v of tr.v) vm = Math.max(vm, Math.abs(v)); vm = vm || 1;
    const Lm = 70, T = 30, B = 50, Rm = 20;
    const px = (t) => Lm + ((t - t0) / (t1 - t0 || 1)) * (W - Lm - Rm), py = (v) => T + (0.5 - v / (2 * vm)) * (H - T - B);
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(Lm, T); ctx.lineTo(Lm, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(Lm, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke();
    ctx.fillText(sci(vm, 2), 8, T + 4); ctx.fillText(sci(-vm, 2), 8, H - B); ctx.fillText('0', 8, py(0) + 4);
    for (let k = 0; k <= 6; k++) { const t = t0 + (k / 6) * (t1 - t0); ctx.fillText(`${(t * 1e9).toFixed(2)}`, px(t) - 14, H - B + 16); }
    ctx.fillText('t (ns)', W / 2 - 14, H - 8);
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('E_z at the probe (V/m)', -60, 0); ctx.restore();
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = 0; k < tr.t.length; k++) { const X = px(tr.t[k]), Y = py(tr.v[k]); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
    ctx.stroke();
    const [pxm, pym] = this.shell.probePt;
    ctx.fillStyle = '#5a5955'; ctx.fillText(`probe at (${pxm.toFixed(3)}, ${pym.toFixed(3)}) m · ${tr.t.length} samples · ${this.running ? 'running' : 'paused'}`, Lm, T - 8);
  },

  statusText() {
    return `${this.n}² grid, h = ${(this.h * 100).toFixed(2)} cm · step ${this.stepCount} · t = ${(this.t * 1e9).toFixed(3)} ns · dt = ${(this.dt * 1e12).toFixed(2)} ps · Courant 0.99 · ${this.running ? 'running' : 'paused'}`;
  },

  probe(x, y) {
    if (!this.gridEz) this.compute();
    const cell = this.traceCell();
    if (cell && (!this.traced || this.traced.i !== cell.i || this.traced.j !== cell.j)) { this.traced = cell; this.send({ cmd: 'probe', i: cell.i, j: cell.j }); }
    const [i, j] = this.cellOf(x, y);
    const k = this.idx(Math.min(Math.max(i, 0), this.n - 1), Math.min(Math.max(j, 0), this.n - 1));
    const ez = this.gridEz.sample(x, y), hx = this.gridHx.sample(x, y), hy = this.gridHy.sample(x, y);
    return [
      { label: 'E_z', value: ez, unit: 'V/m' },
      { label: 'H_x', value: hx, unit: 'A/m' },
      { label: 'H_y', value: hy, unit: 'A/m' },
      { label: '|H|', value: Math.hypot(hx, hy), unit: 'A/m' },
      { label: '|S| = |E_z||H|', value: Math.abs(ez) * Math.hypot(hx, hy), unit: 'W/m²' },
      { label: 'εr here', value: this.epsR[k], unit: '' },
      { label: 'cell', value: this.pec[k] ? 1 : 0, unit: '1 = conductor' },
      { label: 't', value: this.t * 1e9, unit: 'ns' },
    ];
  },

  getState() {
    return { n: this.n, preset: this.preset, src: this.wave, f: this.f, speed: this.k, side: this.yWall, te: this.toolEps, br: this.brush };
  },

  csv() {
    if (!this.gridEz) this.compute();
    const g = this.gridEz;
    const lines = [`# t = ${this.t} s, step ${this.stepCount}`, 'x_m,y_m,Ez_Vpm,Hx_Apm,Hy_Apm,eps_r,conductor'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const k = this.idx(i, j);
      lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridHx.get(i, j)},${this.gridHy.get(i, j)},${this.epsR[k]},${this.pec[k]}`);
    }
    return lines.join('\n');
  },
};
