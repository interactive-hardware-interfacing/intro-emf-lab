// Conduction (J) tab: steady current in a resistive sheet between two electrodes.
// Same neighbour-averaging solver as the Sandbox with sigma in place of eps:
//   div( sigma grad V ) = 0,  J = sigma E.
// Presets: uniform bar, constriction, L-bend. Paint insulator (sigma = 0) or conductor.
// A movable cut reports the current crossing it (per unit depth) and R = V / I.

import { Grid2D, magnitude } from '../../core/grid.js';
import { Relax2D } from '../../core/relax2d.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween } from '../../core/render.js';
import { SolverClient } from '../solverclient.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';

const L = 1; // box [0, L] x [0, L] metres
const PRESETS = [['bar', 'Uniform bar'], ['constriction', 'Bar with a constriction'], ['lbend', 'L-bend'], ['plate-holes', 'Plate with holes']];
const TOOLS = [['probe', 'Probe (click to read values)'], ['insulator', 'Paint insulator (σ = 0)'], ['conductor', 'Paint conductor (σ = σ₀)'], ['cut', 'Move the current cut (click)']];

export default {
  id: 'conduction',
  title: 'Conduction (J)',
  phase: 3,
  available: true,
  summary: 'Steady current between two electrodes: J = σE, current through a cut, resistance.',
  extent: [0, L, 0, L],
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', default: true },
    { id: 'Jmag', label: '|J|', kind: 'scalar', unit: 'A/m²', log: true, eq: 'J' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'J', label: 'J field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour', eq: 'V', default: true },
  ],

  preset: 'bar',
  n: 129,
  V0: 1,
  sigma: 1,       // S/m
  w: 0.4,         // bar height (m)
  neck: 0.12,     // constriction height
  xc: 0.5,        // cut position
  tool: 'probe',
  brush: 3,
  tol: 2e-7,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.preset = PRESETS.some(([id]) => id === s.preset) ? s.preset : 'bar';
    this.n = [65, 129, 257].includes(getNum(s, 'n', 129)) ? getNum(s, 'n', 129) : 129;
    this.V0 = getNum(s, 'V0', 1); this.sigma = getNum(s, 'sig', 1); this.w = getNum(s, 'w', 0.4); this.neck = getNum(s, 'neck', 0.12); this.xc = getNum(s, 'xc', 0.5);
    this.tool = 'probe'; this.custom = false;
    this.client = new SolverClient({ onFrame: (m) => this.onFrame(m) });
    this.build();
    this.buildControls();
    this.solve();
  },

  destroy() { this.client?.terminate(); this.client = null; this.shell.solverRunning = false; },

  // ------------------------------------------------------------ geometry

  build() {
    const s = new Relax2D(this.n, this.n, [0, L, 0, L], { boundary: 'neumann' });
    s.eps.fill(0); // insulator everywhere, then carve the conductor
    const w = this.w, y0 = (L - w) / 2, y1 = (L + w) / 2;
    const x0 = 0.1, x1 = 0.9;
    const cond = (fn) => s.epsWhere(fn, this.sigma);
    switch (this.preset) {
      case 'bar':
        cond((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
        break;
      case 'constriction': {
        const nk = this.neck, c0 = 0.42, c1 = 0.58;
        cond((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !(x > c0 && x < c1 && Math.abs(y - L / 2) > nk / 2));
        break;
      }
      case 'lbend':
        cond((x, y) => (x >= x0 && x <= x0 + w && y >= 0.1 && y <= 0.9) || (x >= x0 && x <= x1 && y >= 0.9 - w && y <= 0.9));
        break;
      case 'plate-holes':
        cond((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && Math.hypot(x - 0.4, y - 0.5) > 0.07 && Math.hypot(x - 0.6, y - 0.5) > 0.07);
        break;
      default: break;
    }
    // Electrodes: the first and last conducting columns of the shape become fixed potentials.
    if (this.preset === 'lbend') {
      s.fixWhere((x, y) => x >= x0 && x <= x0 + w && y <= 0.1 + s.h, 0);
      s.fixWhere((x, y) => x >= x1 - s.h && y >= 0.9 - w && y <= 0.9, this.V0);
    } else {
      s.fixWhere((x, y) => x <= x0 + s.h / 2 && x >= x0 - s.h / 2 && y >= y0 && y <= y1, 0);
      s.fixWhere((x, y) => x <= x1 + s.h / 2 && x >= x1 - s.h / 2 && y >= y0 && y <= y1, this.V0);
    }
    this.solver = s;
    this.V = new Float64Array(s.V);
    this.custom = false;
    this.converged = false; this.sweeps = 0; this.residual = Infinity;
    this.result = null;
  },

  idx(i, j) { return j * this.n + i; },
  cellOf(x, y) { return [Math.round(x / this.solver.h), Math.round(y / this.solver.h)]; },

  paintAt(x, y) {
    const [ci, cj] = this.cellOf(x, y), r = this.brush - 1, s = this.solver;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= this.n || j >= this.n || (i - ci) ** 2 + (j - cj) ** 2 > r * r + 0.5) continue;
      const k = this.idx(i, j);
      if (s.fixed[k]) continue;
      s.eps[k] = this.tool === 'insulator' ? 0 : this.sigma;
    }
    this.custom = true;
  },

  onPointer(type, x, y) {
    if (this.tool === 'probe') return false;
    if (type === 'leave') { this.hover = null; this.shell.redrawOverlay(); return true; }
    if (type === 'move') { this.hover = [x, y]; this.shell.redrawOverlay(); return true; }
    if (this.tool === 'cut') { if (type === 'down' || type === 'drag') { this.xc = Math.min(Math.max(x, 0.02), 0.98); this.updateCurrent(); this.shell.redrawOverlay(); } if (type === 'up') this.shell.syncUrl(); return true; }
    if (type === 'down' || type === 'drag') { this.paintAt(x, y); this.hover = [x, y]; this.shell.redrawOverlay(); }
    if (type === 'up') { this.client?.cancel(); this.solve(true); this.shell.syncUrl(); }
    return true;
  },

  // ------------------------------------------------------------ solve

  async solve(warm = false) {
    if (!this.client) return;
    const s = this.solver;
    if (warm) for (let k = 0; k < s.V.length; k++) if (!s.fixed[k]) s.V[k] = this.V[k];
    this.running = true; this.converged = false; this.shell.solverRunning = true; this.shell.renderEquations();
    try {
      await this.client.init(s, 'cartesian');
      const done = await this.client.run({ k: 50, tol: this.tol });
      this.V = done.V; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
      this.updateCurrent();
      this.shell.recompute();
    } catch { /* cancelled */ }
    this.running = false; this.shell.solverRunning = false; this.shell.renderEquations(); this.shell.refreshStatus();
  },

  onFrame(m) {
    this.V = m.V; this.sweeps = m.sweeps; this.residual = m.residual;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.shell.recompute(); this.updateCurrent(); });
  },

  /** Current per unit depth (A/m) through the vertical face just right of column i. */
  currentThrough(i) {
    const s = this.solver, n = this.n;
    if (i < 0 || i + 1 >= n) return NaN;
    let I = 0;
    for (let j = 0; j < n; j++) {
      const k = this.idx(i, j);
      const a = s.eps[k], b = s.eps[k + 1];
      const sg = a + b === 0 ? 0 : (2 * a * b) / (a + b);
      I += (j === 0 || j === n - 1 ? 0.5 : 1) * sg * -(this.V[k + 1] - this.V[k]); // E_x h cancels h of the face length
    }
    return I;
  },

  updateCurrent() {
    const s = this.solver;
    const i = Math.min(this.n - 2, Math.max(0, Math.round(this.xc / s.h)));
    const I = this.currentThrough(i);
    const I2 = this.currentThrough(Math.min(this.n - 2, Math.max(0, Math.round(0.25 / s.h)))); // a second cut for the conservation check
    const R = this.V0 / Math.abs(I);
    // Analytic for the uniform bar: R' = l / (sigma w), with l the electrode spacing
    const Rbar = 0.8 / (this.sigma * this.w);
    this.result = { I, I2, R, Rbar };
    if (this.resultEl) {
      const tb = this.resultEl.tBodies[0]; tb.innerHTML = '';
      const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
      row(`I through x = ${this.xc.toFixed(3)} m`, `${sci(Math.abs(I), 5)} A per m depth`);
      row('I through x = 0.25 m', `${sci(Math.abs(I2), 5)} A per m depth`);
      row('R = V/I', `${sci(R, 5)} Ω·m`);
      if (this.preset === 'bar' && !this.custom) row('ℓ/(σ w) for the bar', `${sci(Rbar, 5)} Ω·m`);
      row('conductance per depth', `${sci(1 / R, 5)} S/m`);
      if (!this.converged) row('', 'solution not yet converged');
    }
  },

  // ------------------------------------------------------------ shell model

  compute() {
    const s = this.solver;
    this.gridV = new Grid2D(this.n, this.n, s.extent, this.V);
    [this.gridEx, this.gridEy] = this.gridV.negGradient();
    this.gridJx = new Grid2D(this.n, this.n, s.extent); this.gridJy = new Grid2D(this.n, this.n, s.extent);
    for (let k = 0; k < this.gridJx.data.length; k++) { this.gridJx.data[k] = s.eps[k] * this.gridEx.data[k]; this.gridJy.data[k] = s.eps[k] * this.gridEy.data[k]; }
    this.gridJmag = magnitude(this.gridJx, this.gridJy);
    const jj = Array.from(this.gridJmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    this.jRange = jj.length ? [jj[Math.floor(0.05 * (jj.length - 1))], jj[Math.floor(0.995 * (jj.length - 1))]] : [1e-3, 1];
  },

  render(layer, ctx, view, opts) {
    const eFn = (x, y) => [this.gridEx.sample(x, y), this.gridEy.sample(x, y)];
    const jFn = (x, y) => [this.gridJx.sample(x, y), this.gridJy.sample(x, y)];
    const inCond = (x, y) => { const [i, j] = this.cellOf(x, y); return i >= 0 && j >= 0 && i < this.n && j < this.n && this.solver.eps[this.idx(i, j)] > 0; };
    const seeds = () => { const out = []; const [i0] = this.cellOf(0.1 + 2 * this.solver.h, 0); for (let j = 1; j < this.n - 1; j += Math.max(2, Math.round(this.n / 32))) { if (this.solver.eps[this.idx(i0, j)] > 0 && !this.solver.fixed[this.idx(i0, j)]) out.push([i0 * this.solver.h, j * this.solver.h]); } return out; };
    const stop = (x, y) => { const [i, j] = this.cellOf(x, y); return !inCond(x, y) || this.solver.fixed[this.idx(i, j)] === 1; };
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, min: opts.min ?? 0, max: opts.max ?? this.V0 });
      case 'Jmag': return drawScalarField(ctx, this.gridJmag, { map: opts.map, log: true, min: opts.min ?? this.jRange[0], max: opts.max ?? this.jRange[1] });
      case 'E':
        if (opts.style === 'lines') drawStreamlines(ctx, view, eFn, seeds(), { stopFn: stop, color: 'rgba(255,255,255,0.7)' });
        else drawQuiver(ctx, view, (x, y) => (inCond(x, y) ? eFn(x, y) : [0, 0]), { normalize: true, spacing: 24, color: 'rgba(255,255,255,0.75)' });
        return null;
      case 'J':
        if (opts.style === 'lines') drawStreamlines(ctx, view, jFn, seeds(), { stopFn: stop, color: 'rgba(255,220,120,0.9)' });
        else drawQuiver(ctx, view, jFn, { normalize: false, spacing: 22, color: 'rgba(255,220,120,0.9)' });
        return null;
      case 'Veq': drawContours(ctx, view, this.gridV, levelsBetween(0, this.V0, 19), { color: 'rgba(0,0,0,0.5)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const n = this.n, s = this.solver;
    if (!this.matCanvas || this.matCanvas.width !== n) { this.matCanvas = document.createElement('canvas'); this.matCanvas.width = n; this.matCanvas.height = n; }
    const mctx = this.matCanvas.getContext('2d');
    const img = mctx.createImageData(n, n), d = img.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = this.idx(i, j), q = ((n - 1 - j) * n + i) * 4;
      if (s.fixed[k]) { const hi = s.V[k] > 0; d[q] = hi ? 229 : 59; d[q + 1] = hi ? 72 : 130; d[q + 2] = hi ? 77 : 246; d[q + 3] = 235; }
      else if (s.eps[k] === 0) { d[q] = 40; d[q + 1] = 40; d[q + 2] = 40; d[q + 3] = 215; } // insulator: dark
      else d[q + 3] = 0;
    }
    mctx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(this.matCanvas, 0, 0, view.width, view.height); ctx.restore();
    // Current cut
    const [cx, y0] = view.toPx(this.xc, 0), [, y1] = view.toPx(this.xc, L);
    ctx.save(); ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); ctx.stroke(); ctx.restore();
    if (this.hover && (this.tool === 'insulator' || this.tool === 'conductor')) {
      const [px, py] = view.toPx(this.hover[0], this.hover[1]);
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(px, py, ((this.brush - 0.5) * s.h) / view.scale, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    }
  },

  statusText() {
    const r = Number.isFinite(this.residual) ? this.residual.toExponential(2) : '—';
    return `${this.n}² grid · sweep ${this.sweeps} · max |ΔV| = ${r} V · ${this.running ? 'solving' : this.converged ? 'converged' : 'not converged'}`;
  },

  probe(x, y) {
    const [i, j] = this.cellOf(x, y);
    const k = this.idx(Math.min(Math.max(i, 0), this.n - 1), Math.min(Math.max(j, 0), this.n - 1));
    const ex = this.gridEx.sample(x, y), ey = this.gridEy.sample(x, y), sg = this.solver.eps[k];
    return [
      { label: 'V', value: this.gridV.sample(x, y), unit: 'V' },
      { label: 'Ex', value: ex, unit: 'V/m' }, { label: 'Ey', value: ey, unit: 'V/m' },
      { label: 'σ here', value: sg, unit: 'S/m' },
      { label: 'Jx = σEx', value: sg * ex, unit: 'A/m²' }, { label: 'Jy = σEy', value: sg * ey, unit: 'A/m²' },
      { label: '|J|', value: sg * Math.hypot(ex, ey), unit: 'A/m²' },
      { label: 'power density J·E', value: sg * (ex * ex + ey * ey), unit: 'W/m³' },
    ];
  },

  getState() { return { preset: this.preset, n: this.n, V0: this.V0, sig: this.sigma, w: this.w, neck: this.neck, xc: this.xc }; },

  csv() {
    const g = this.gridV, s = this.solver;
    const lines = ['x_m,y_m,V_V,Ex_Vpm,Ey_Vpm,sigma_Spm,Jx_Apm2,Jy_Apm2'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = this.idx(i, j); lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridEx.get(i, j)},${this.gridEy.get(i, j)},${s.eps[k]},${this.gridJx.get(i, j)},${this.gridJy.get(i, j)}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Conduction (J)'));
    box.appendChild(ui.el('p', 'lead', 'What a resistor looks like from the inside. A sheet of resistive material (conductivity σ, per metre of depth) sits between a 0 V electrode on the left and V₀ on the right. The solver finds the potential, and from it the field E = −∇V and the current density J = σE at every point.'));
    const intro = ui.el('div', 'placeholder');
    intro.innerHTML = `<p><strong>Why it matters.</strong> Ohm's law V = IR is the circuit-level summary of a field problem. Here you can see the field version, J = σE, and watch R = V/I come out of the geometry: for the uniform bar it reproduces R = ℓ/(σA) exactly, and for every other shape it gives the answer the formula can't.</p>
<p><strong>What to look for.</strong></p>
<ul>
<li>Current lines (J) run from electrode to electrode and never cross an insulator; equipotentials cross them at right angles.</li>
<li>The current through <em>any</em> cut is the same (∇·J = 0): Kirchhoff's current law at the field level. Drag the cut and check.</li>
<li>Constrictions and holes crowd the current and raise R; the |J| colour map shows where the heat goes (J·E).</li>
<li>Same equation as electrostatics with σ in place of ε, which is why the Sandbox solver works here unchanged.</li>
</ul>`;
    box.appendChild(intro);
    const re = () => { this.client?.cancel(); this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); this.solve(); };
    box.appendChild(ui.field('Geometry', ui.select(PRESETS, this.preset, (v) => { this.preset = v; re(); })));
    const r1 = ui.el('div', 'row');
    r1.append(ui.field('V₀ (V)', ui.number(this.V0, { min: 0.01, max: 1e4, onChange: (v) => { this.V0 = v; re(); } })), ui.field('σ₀ (S/m)', ui.number(this.sigma, { min: 1e-6, max: 1e8, onChange: (v) => { this.sigma = v; re(); } })));
    box.appendChild(r1);
    const r2 = ui.el('div', 'row');
    r2.append(ui.field('Bar height w (m)', ui.number(this.w, { min: 0.05, max: 0.8, onChange: (v) => { this.w = v; re(); } })));
    if (this.preset === 'constriction') r2.append(ui.field('Neck height (m)', ui.number(this.neck, { min: 0.02, max: 0.8, onChange: (v) => { this.neck = v; re(); } })));
    r2.append(ui.field('Grid', ui.select([[65, '65²'], [129, '129²'], [257, '257²']], String(this.n), (v) => { this.n = parseInt(v, 10); re(); })));
    box.appendChild(r2);
    box.appendChild(ui.el('p', 'hint', 'Electrodes are 0.8 m apart. Insulator (σ = 0) is drawn dark; the current cut is the orange dashed line.'));

    box.appendChild(ui.el('h2', '', 'Current and resistance'));
    this.resultEl = ui.el('table', 'probe-table'); this.resultEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultEl);
    box.appendChild(ui.field('Cut position x (m)', ui.number(this.xc, { min: 0.02, max: 0.98, onChange: (v) => { this.xc = v; this.updateCurrent(); shell.redrawOverlay(); shell.syncUrl(); } })));
    box.appendChild(ui.el('p', 'hint', 'I = ∫ J·n dl across the cut (per metre of depth). Move the cut anywhere: the current is the same through every cut, which is Kirchhoff\'s current law at the field level. R = V₀/I.'));

    box.appendChild(ui.el('h2', '', 'Paint'));
    box.appendChild(ui.field('Tool', ui.select(TOOLS, this.tool, (v) => { this.tool = v; this.buildControls(); shell.redrawOverlay(); })));
    box.appendChild(ui.field('Brush (cells)', ui.number(this.brush, { min: 1, max: 30, onChange: (v) => { this.brush = Math.round(v); } })));
    box.appendChild(ui.el('p', 'hint', 'Cut a notch, drill a hole, or bridge a gap and watch the current reroute. The solver restarts from the current solution after each stroke.'));
    if (this.custom) box.appendChild(ui.el('span', 'badge badge-warn', 'edited by hand'));
    this.updateCurrent();
  },
};
