// Dielectrics tab: a parallel-plate capacitor in (x, y) with up to four dielectric regions
// sharing the gap, layered (same D, capacitors in series), side by side (same E, in
// parallel) or split by a tilted interface (no closed form). The solver runs at 1 V and the
// result is scaled, so "hold V" and "hold Q" need no re-solve: C is a property of the
// geometry, and V = Q / C. Free charge on the plates, bound charge on every dielectric
// face, the per-region field table and the slab force from dC/dx.

import { EPS0 } from '../../core/constants.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { Relax2D } from '../../core/relax2d.js';
import { buildPlates, plateCharges, boundCharges, gaussTopPlate, regionTable, idealC, idealSlabForce, MAX_REGIONS } from '../../core/dielectrics.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween } from '../../core/render.js';
import { SolverClient } from '../solverclient.js';
import { plotView } from '../views.js';
import { getNum, getList, downloadText } from '../state.js';
import { ui, sci } from '../shell.js';

const MODES = [['layered', 'Layered (interface parallel to the plates)'], ['side', 'Side by side (interface perpendicular)'], ['tilted', 'Tilted interface (two regions)']];
const RES = [[10, 'coarse (10 cells across the gap)'], [20, 'normal (20 cells)'], [30, 'fine (30 cells, slow)']];
const TINTS = ['rgba(80,220,220,', 'rgba(250,200,90,', 'rgba(190,140,250,', 'rgba(130,230,130,'];
const MAX_NX = 361; // plain Gauss-Seidel: solve time grows as (cells)^2; wider plates coarsen

export default {
  id: 'dielectrics',
  title: 'Dielectrics',
  phase: 7,
  available: true,
  summary: 'Two to four dielectrics between parallel plates: layered (same D) or side by side (same E), bound charge, fixed Q vs fixed V, slab force.',
  extent: [-0.02, 0.02, -0.011, 0.011],
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', default: true },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'Dmag', label: '|D|', kind: 'scalar', unit: 'C/m²', log: true, eq: 'D' },
    { id: 'w', label: 'Energy density', kind: 'scalar', unit: 'J/m³', log: true, eq: 'E' },
    { id: 'sigma', label: 'Surface charge (free on the plates, bound on the faces)', kind: 'scalar', unit: 'C/m²', signed: true, eq: 'sigma' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'D', label: 'D field', kind: 'vector', styles: ['arrows'] },
    { id: 'P', label: 'P field', kind: 'vector', styles: ['arrows'] },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour', eq: 'V', default: true },
  ],

  pDefaults: { w: 25, d: 5, depth: 100, V: 100, Q: 1, theta: 25 }, // mm, mm, mm, V, nC, degrees
  regDefaults: [{ eps: 5, f: 0.5 }, { eps: 2, f: 0.5 }],

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `d_${k}`, this.p[k]);
    this.mode = MODES.some(([m]) => m === s.dm) ? s.dm : 'layered';
    this.hold = s.dq === 'Q' ? 'Q' : 'V';
    const eps = getList(s, 'de', null)?.map(Number), fr = getList(s, 'df', null)?.map(Number);
    this.regions = eps && eps.every(Number.isFinite) ? eps.slice(0, MAX_REGIONS).map((e, k) => ({ eps: Math.max(1, e), f: Number.isFinite(fr?.[k]) ? Math.max(0, fr[k]) : 1 / eps.length })) : this.regDefaults.map((r) => ({ ...r }));
    this.res = RES.some(([r]) => r === getNum(s, 'res', 20)) ? getNum(s, 'res', 20) : 20;
    this.walls = s.walls === 'dirichlet' ? 'dirichlet' : 'neumann';
    this.client = new SolverClient({ onFrame: (m) => this.onFrame(m) });
    this.force = null;
    this.build();
    this.views = [plotView('cut', 'Cutline', (ctx, w, h) => this.drawCutline(ctx, w, h))];
    this.buildControls();
    this.solve();
  },

  destroy() { this.client?.terminate(); this.client = null; this.shell.solverRunning = false; },

  // ------------------------------------------------------------ model

  build(extra = {}) {
    const mm = 1e-3;
    let res = this.res, coarsened = false;
    const cellsX = (this.p.w + 3 * this.p.d) / this.p.d; // plate + padding, in gaps
    while (res > 6 && cellsX * res + 1 > MAX_NX) { res -= 2; coarsened = true; }
    this.solver = buildPlates({ w: this.p.w * mm, d: this.p.d * mm, regions: this.regions, mode: this.mode, theta: this.p.theta, res, walls: this.walls, ...extra });
    this.meta = this.solver.meta; this.meta.coarsened = coarsened;
    this.shell.setExtent(this.solver.extent, ['x', 'y']);
    this.V = new Float64Array(this.solver.V);
    this.results = null;
    this.sweeps = 0; this.residual = Infinity; this.converged = false;
  },

  /** Scale from the 1 V solve to the held quantity: V itself, or V = Q / C once C is known. */
  scale() {
    if (this.hold === 'V') return this.p.V;
    const C = this.results?.C;
    return C ? (this.p.Q * 1e-9) / C : this.lastScale ?? this.p.V;
  },
  depth() { return this.p.depth * 1e-3; },
  tol() { return 2e-8; },

  async solve() {
    if (!this.client) return;
    this.shell.solverRunning = true; this.shell.renderEquations();
    const id = this.solveId = (this.solveId ?? 0) + 1;
    this.running = true; this.converged = false;
    try {
      await this.client.init(this.solver, 'cartesian');
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

  /** A Relax2D carrying the current V, for the core bookkeeping functions. */
  solverWithV() {
    const s0 = this.solver;
    const s = new Relax2D(s0.nx, s0.ny, s0.extent, { boundary: s0.boundary, boxV: s0.boxV });
    s.V.set(this.V); s.fixed.set(s0.fixed); s.eps.set(s0.eps); s.meta = s0.meta; s.reg = s0.reg;
    return s;
  },

  /** Everything the panel reports, per metre of depth at 1 V, then scaled in renderResults. */
  finish() {
    const s = this.solverWithV();
    const W1 = s.energy();                       // J/m at 1 V
    const plates = plateCharges(s), bound = boundCharges(s), qGauss = gaussTopPlate(s);
    const ideal = idealC(this.meta);
    const rows = regionTable(s, plates);
    const L = this.depth();
    this.results = { C: 2 * W1 * L, cGauss: qGauss * L, cPlate: plates.top * L, cIdeal: ideal.C * L, idealLabel: ideal.label, lo: ideal.lo * L, hi: ideal.hi * L, plates, bound, rows, W1 };
    this.lastScale = this.scale();
    this.renderResults();
    this.shell.recompute();
    this.shell.syncUrl();
  },

  compute() {
    const s = this.solver, sc = this.scale();
    const V = new Float64Array(this.V.length); for (let k = 0; k < V.length; k++) V[k] = sc * this.V[k];
    this.gridV = new Grid2D(s.nx, s.ny, s.extent, V);
    [this.gridEx, this.gridEy] = this.gridV.negGradient();
    this.gridEmag = magnitude(this.gridEx, this.gridEy);
    this.gridDmag = new Grid2D(s.nx, s.ny, s.extent); this.gridW = new Grid2D(s.nx, s.ny, s.extent);
    for (let k = 0; k < V.length; k++) { const e = s.eps[k]; this.gridDmag.data[k] = EPS0 * e * this.gridEmag.data[k]; this.gridW.data[k] = 0.5 * EPS0 * e * this.gridEmag.data[k] ** 2; }
    // surface charge map: free on conductor nodes, bound on dielectric nodes (sigma from the 1 V solve, scaled)
    const sv = this.solverWithV();
    const pc = plateCharges(sv), bc = boundCharges(sv);
    this.gridSigma = new Grid2D(s.nx, s.ny, s.extent);
    for (let k = 0; k < V.length; k++) this.gridSigma.data[k] = sc * (pc.sigma[k] + bc.sigma[k]);
    this.sigmaFree = pc.sigma; this.sigmaBound = bc.sigma;
    const e = Array.from(this.gridEmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    this.eRange = e.length ? [e[Math.floor(0.05 * (e.length - 1))], e[Math.floor(0.995 * (e.length - 1))]] : [1, 10];
    const emax = Math.max(...this.meta.regions.map((r) => r.eps));
    this.dRange = [EPS0 * this.eRange[0], EPS0 * emax * this.eRange[1]];
    this.wRange = [0.5 * EPS0 * this.eRange[0] ** 2, 0.5 * EPS0 * emax * this.eRange[1] ** 2];
    let smax = 0; for (const v of this.gridSigma.data) if (Math.abs(v) > smax) smax = Math.abs(v);
    this.sRange = [-smax || -1, smax || 1];
  },

  epsAt(x, y) {
    const s = this.solver;
    const i = Math.min(s.nx - 1, Math.max(0, Math.round((x - s.extent[0]) / s.h))), j = Math.min(s.ny - 1, Math.max(0, Math.round((y - s.extent[2]) / s.h)));
    return s.eps[s.idx(i, j)];
  },
  nodeAt(x, y) {
    const s = this.solver;
    const i = Math.min(s.nx - 1, Math.max(0, Math.round((x - s.extent[0]) / s.h))), j = Math.min(s.ny - 1, Math.max(0, Math.round((y - s.extent[2]) / s.h)));
    return s.idx(i, j);
  },

  render(layer, ctx, view, opts) {
    const eFn = (x, y) => [this.gridEx.sample(x, y), this.gridEy.sample(x, y)];
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? 0, max: opts.max ?? this.scale() });
      case 'Emag': return drawScalarField(ctx, this.gridEmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.eRange[0], max: opts.max ?? this.eRange[1] });
      case 'Dmag': return drawScalarField(ctx, this.gridDmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.dRange[0], max: opts.max ?? this.dRange[1] });
      case 'w': return drawScalarField(ctx, this.gridW, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.wRange[0], max: opts.max ?? this.wRange[1] });
      case 'sigma': return drawScalarField(ctx, this.gridSigma, { map: opts.map, extent: opts.extent, min: opts.min ?? this.sRange[0], max: opts.max ?? this.sRange[1] });
      case 'E':
        if (opts.style === 'lines') {
          const { w, d, h } = this.meta, seeds = [];
          for (let k = 0; k < 24; k++) seeds.push([-w / 2 - 2 * h + (k + 0.5) * (w + 4 * h) / 24, d / 2 + 3 * h]);
          for (let k = 1; k < 5; k++) for (const sgn of [-1, 1]) seeds.push([sgn * (w / 2 + 2 * h), d / 2 + h + k * 2 * d / 5]);
          const stop = (x, y) => { const s = this.solver; const i = Math.round((x - s.extent[0]) / s.h), j = Math.round((y - s.extent[2]) / s.h); return i < 0 || j < 0 || i >= s.nx || j >= s.ny || s.fixed[s.idx(i, j)] === 1; };
          drawStreamlines(ctx, view, eFn, seeds, { stopFn: stop, maxSteps: 2500 });
        } else drawQuiver(ctx, view, eFn, { normalize: true, spacing: 22 });
        return null;
      case 'D': drawQuiver(ctx, view, (x, y) => { const [ex, ey] = eFn(x, y); const e = this.epsAt(x, y); return [e * ex, e * ey]; }, { normalize: false, spacing: 22, color: 'rgba(255,220,120,0.9)' }); return null;
      case 'P': drawQuiver(ctx, view, (x, y) => { const [ex, ey] = eFn(x, y); const e = this.epsAt(x, y) - 1; return [e * ex, e * ey]; }, { normalize: false, spacing: 22, color: 'rgba(160,255,160,0.9)' }); return null;
      case 'Veq': drawContours(ctx, view, this.gridV, levelsBetween(0, this.scale(), 19), { color: 'rgba(0,0,0,0.5)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const m = this.meta, s = this.solver, { h, w, d } = m;
    const gx0 = -w / 2 - h / 2, gx1 = w / 2 + h / 2, gy0 = -d / 2, gy1 = d / 2; // the gap, to the plate surfaces
    const rectPx = (x0, x1, y0, y1) => { const [a, b] = view.toPx(x0, y1), [c, e] = view.toPx(x1, y0); return [a, b, c - a, e - b]; };
    ctx.save();
    // regions: one tint each. Layered and side-by-side regions are rectangles between the
    // half-cell interfaces; the tilted interface is the line itself, clipped to the gap.
    const bounds = []; // [x0, x1, y0, y1] per region, plus interface segments
    if (m.mode === 'layered') {
      let q = 0;
      m.regions.forEach((r, k) => { const y0 = k === 0 ? gy0 : s.y(m.jBot + q) + h / 2, y1 = k === m.n - 1 ? gy1 : s.y(m.jBot + q + r.cells) + h / 2; bounds.push([gx0, gx1, y0, y1]); q += r.cells; });
    } else if (m.mode === 'side') {
      let p = m.iL;
      m.regions.forEach((r, k) => { const x0 = k === 0 ? gx0 : s.x(p) - h / 2, x1 = k === m.n - 1 ? gx1 : s.x(p + r.cells) - h / 2; bounds.push([x0, x1, gy0, gy1]); p += r.cells; });
    }
    if (bounds.length) {
      bounds.forEach((b, k) => { ctx.fillStyle = `${TINTS[k % TINTS.length]}0.28)`; ctx.fillRect(...rectPx(...b)); });
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
      bounds.slice(1).forEach((b) => { if (m.mode === 'layered') { const [a, c] = view.toPx(b[0], b[2]), [e] = view.toPx(b[1], b[2]); ctx.moveTo(a, c); ctx.lineTo(e, c); } else { const [a, c] = view.toPx(b[0], b[2]), [, e] = view.toPx(b[0], b[3]); ctx.moveTo(a, c); ctx.lineTo(a, e); } });
      ctx.stroke();
    } else {
      const t = Math.tan((m.theta * Math.PI) / 180), big = 10 * (w + d);
      ctx.save(); ctx.beginPath(); ctx.rect(...rectPx(gx0, gx1, gy0, gy1)); ctx.clip();
      ctx.fillStyle = `${TINTS[0]}0.28)`; ctx.fillRect(...rectPx(gx0, gx1, gy0, gy1));
      ctx.fillStyle = `${TINTS[1]}0.28)`; ctx.beginPath();
      const [ax, ay] = view.toPx(-big, -big * t), [bx, by] = view.toPx(big, big * t), [, top] = view.toPx(0, big);
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, top); ctx.lineTo(ax, top); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.restore();
    }
    // plates
    const plate = (y0, y1, fill) => { ctx.fillStyle = fill; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; const r = rectPx(gx0, gx1, y0, y1); ctx.fillRect(...r); ctx.strokeRect(...r); };
    plate(d / 2, d / 2 + 1.5 * h, 'rgba(229,72,77,0.9)');
    plate(-d / 2 - 1.5 * h, -d / 2, 'rgba(59,130,246,0.9)');
    // labels
    ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3;
    const sc = this.scale();
    let [lx, ly] = view.toPx(0, d / 2 + 1.5 * h); ctx.fillText(`+${fmt(sc)} V`, lx, ly - 4);
    [lx, ly] = view.toPx(0, -d / 2 - 1.5 * h); ctx.fillText('0 V', lx, ly + 14);
    for (const [k, r] of m.regions.entries()) {
      const c = this.regionCentre(k); if (!c) continue;
      const [x, y] = view.toPx(c[0], c[1]);
      ctx.fillText(`εr = ${r.eps}`, x, y + 4);
    }
    ctx.restore();
  },

  regionCentre(k) {
    const s = this.solver, m = this.meta;
    if (m.centres) return m.centres[k] ?? null;
    m.centres = m.regions.map((_, q) => { let sx = 0, sy = 0, n = 0; for (let j = m.jBot + 1; j < m.jTop; j++) for (let i = m.iL; i <= m.iR; i++) if (s.reg[s.idx(i, j)] === q) { sx += s.x(i); sy += s.y(j); n++; } return n ? [sx / n, sy / n] : null; });
    return m.centres[k] ?? null;
  },

  statusText() {
    const r = Number.isFinite(this.residual) ? (this.residual * this.scale()).toExponential(2) : '—';
    const m = this.meta;
    const regs = m.regions.map((q) => `${(100 * q.f).toFixed(1)}%`).join(' / ');
    return `${this.solver.nx}×${this.solver.ny} grid, h = ${(m.h * 1e3).toFixed(3)} mm${m.coarsened ? ' (coarsened to fit)' : ''} · ${m.mode === 'tilted' ? `tilt ${m.theta}°, area split ${regs}` : `regions on the grid: ${regs} of ${m.mode === 'layered' ? 'd' : 'w'}`} · sweep ${this.sweeps} · max |ΔV| = ${r} V · ${this.running ? 'solving' : this.converged ? 'converged' : 'not converged'}${this.hold === 'Q' && this.running ? ' (scaled to Q when converged)' : ''}`;
  },

  probe(x, y) {
    const ex = this.gridEx.sample(x, y), ey = this.gridEy.sample(x, y), e = this.epsAt(x, y), k = this.nodeAt(x, y), sc = this.scale();
    const out = [
      { label: 'V', value: this.gridV.sample(x, y), unit: 'V' },
      { label: 'Ex', value: ex, unit: 'V/m' }, { label: 'Ey', value: ey, unit: 'V/m' },
      { label: '|E|', value: Math.hypot(ex, ey), unit: 'V/m' },
      { label: 'εr here', value: e, unit: '' },
      { label: '|D| = ε0 εr |E|', value: EPS0 * e * Math.hypot(ex, ey), unit: 'C/m²' },
      { label: '|P| = ε0 (εr − 1) |E|', value: EPS0 * (e - 1) * Math.hypot(ex, ey), unit: 'C/m²' },
      { label: 'energy density', value: 0.5 * EPS0 * e * (ex * ex + ey * ey), unit: 'J/m³' },
    ];
    if (this.solver.fixed[k]) out.push({ label: 'free σ on this conductor node', value: sc * this.sigmaFree[k], unit: 'C/m²' });
    else if (this.sigmaBound[k] !== 0) out.push({ label: 'bound σ on this dielectric face', value: sc * this.sigmaBound[k], unit: 'C/m²' });
    const r = this.solver.reg[k]; if (r >= 0) out.push({ label: 'region', value: r + 1, unit: '' });
    return out;
  },

  getState() {
    const s = { dm: this.mode, dq: this.hold, de: this.regions.map((r) => r.eps), df: this.regions.map((r) => +r.f.toPrecision(4)), res: this.res, walls: this.walls };
    for (const [k, v] of Object.entries(this.p)) s[`d_${k}`] = v;
    return s;
  },

  csv() {
    const s = this.solver, sc = this.scale();
    const gV = new Grid2D(s.nx, s.ny, s.extent, this.V);
    const [ex, ey] = gV.negGradient();
    const lines = ['x_m,y_m,V_V,Ex_Vpm,Ey_Vpm,eps_r,region,sigma_free_Cpm2,sigma_bound_Cpm2'];
    for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) { const k = s.idx(i, j); lines.push(`${s.x(i)},${s.y(j)},${sc * this.V[k]},${sc * ex.data[k]},${sc * ey.data[k]},${s.eps[k]},${s.reg[k] + 1},${sc * (this.sigmaFree?.[k] ?? 0)},${sc * (this.sigmaBound?.[k] ?? 0)}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Dielectrics'));
    box.appendChild(ui.lead(shell, 'Parallel plates with up to four dielectrics in the gap, layered or side by side.'));

    const re = () => { this.client?.cancel(); this.force = null; this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); this.solve(); };
    const rescale = () => { this.lastScale = this.scale(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max, onChange = re) => ui.field(label, ui.number(this.p[key], { min, max, onChange: (v) => { this.p[key] = v; onChange(); } }));

    const r0 = ui.el('div', 'row');
    r0.appendChild(ui.field('Arrangement', ui.select(MODES, this.mode, (v) => { this.mode = v; re(); })));
    box.appendChild(r0);
    const r1 = ui.el('div', 'row'); r1.append(pf('w', 'Plate width w (mm)', 5, 80), pf('d', 'Gap d (mm)', 1, 40), pf('depth', 'Depth into the page (mm)', 1, 10000, rescale)); box.appendChild(r1);
    if (this.mode === 'tilted') { const rt = ui.el('div', 'row'); rt.appendChild(pf('theta', 'Interface tilt θ from the plates (°)', -80, 80)); box.appendChild(rt); }

    // hold V or Q
    const r2 = ui.el('div', 'row');
    r2.appendChild(ui.field('Hold fixed', ui.select([['V', 'Voltage V (on a battery)'], ['Q', 'Charge Q (isolated)']], this.hold, (v) => { this.hold = v; if (v === 'Q' && this.results) this.p.Q = +((this.p.V * this.results.C) * 1e9).toPrecision(6); if (v === 'V' && this.results) this.p.V = +((this.p.Q * 1e-9) / this.results.C).toPrecision(6); rescale(); })));
    if (this.hold === 'V') r2.appendChild(pf('V', 'Applied voltage V (V)', 0.001, 1e6, rescale));
    else r2.appendChild(pf('Q', 'Charge on the top plate Q (nC)', 1e-6, 1e6, rescale));
    box.appendChild(r2);
    box.appendChild(ui.el('p', 'hint', 'The solver runs once at 1 V; everything scales. Holding V, Q = CV follows the dielectric; holding Q, the voltage V = Q/C follows it (the handout\'s "inserting a dielectric" table). Change a permittivity below and watch which one moves.'));

    // regions
    box.appendChild(ui.el('h2', '', `Dielectric regions (${this.mode === 'layered' ? 'bottom to top' : this.mode === 'side' ? 'left to right' : 'below / above the interface'})`));
    const tilted = this.mode === 'tilted';
    this.regions.forEach((r, k) => {
      const row = ui.el('div', 'row');
      row.appendChild(ui.field(`εr, region ${k + 1}`, ui.number(r.eps, { min: 1, max: 1e4, onChange: (v) => { r.eps = v; re(); }, ariaLabel: `Relative permittivity of region ${k + 1}` })));
      if (!tilted) row.appendChild(ui.field(`${this.mode === 'layered' ? 'thickness' : 'width'} (% of ${this.mode === 'layered' ? 'd' : 'w'})`, ui.number(+(100 * r.f).toPrecision(4), { min: 0.1, max: 100, onChange: (v) => { r.f = v / 100; this.normalize(k); re(); }, ariaLabel: `Fraction of region ${k + 1}` })));
      if (this.regions.length > 1 && !(tilted && this.regions.length <= 2)) row.appendChild(ui.button('remove', () => { this.regions.splice(k, 1); this.normalize(); re(); }, 'btn btn-small'));
      box.appendChild(row);
    });
    const rb = ui.el('div', 'row');
    if (this.regions.length < MAX_REGIONS && !tilted) rb.appendChild(ui.button('Add a region', () => { this.regions.push({ eps: 1, f: 1 / (this.regions.length + 1) }); this.normalize(this.regions.length - 1); re(); }, 'btn btn-small'));
    rb.appendChild(ui.button('Air-gap preset', () => { this.mode = 'layered'; this.regions = [{ eps: 5, f: 0.95 }, { eps: 1, f: 0.05 }]; this.res = 30; re(); }, 'btn btn-small'));
    rb.appendChild(ui.button('Handout Example 3', () => { this.mode = 'layered'; this.regions = [{ eps: 6, f: 2 / 3 }, { eps: 2, f: 1 / 3 }]; this.hold = 'V'; this.p.V = 100; this.p.d = 3; re(); }, 'btn btn-small'));
    box.appendChild(rb);
    box.appendChild(ui.el('p', 'hint', `Fractions are renormalized to 100 % and snapped to the grid (a region must be at least one cell; the thinnest layer against a plate is 1.5 cells, so a 5 % air gap needs the fine resolution). The status line shows the fractions actually used, and the ideal formulas use those.${tilted ? ' The tilted interface uses the first two regions and ignores the fractions.' : ''}`));

    const r4 = ui.el('div', 'row');
    r4.appendChild(ui.field('Resolution', ui.select(RES, String(this.res), (v) => { this.res = parseInt(v, 10); re(); })));
    r4.appendChild(ui.field('Box walls', ui.select([['neumann', 'Insulating (isolated)'], ['dirichlet', 'Grounded enclosure']], this.walls, (v) => { this.walls = v; re(); })));
    box.appendChild(r4);
    box.appendChild(ui.el('p', 'hint', 'Plain neighbour averaging: normal resolution takes a few seconds, fine about ten. The box is the plates plus 1.5 gaps of clear space on every side; wide plates are coarsened to keep the grid under 361 cells across (the status line says so).'));

    box.appendChild(ui.el('h2', '', 'Capacitance, charge, energy'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'Energy: C = 2W/V². Gauss: C = Q/V with Q the flux of D out of a box around the top plate. Plate: the same Q summed face by face on the plate (D·n at the conductor). Ideal: the handout\'s series or parallel formula with no fringing, for the snapped fractions; a tilted interface has no closed form, so the Wiener bounds (the series and parallel values for the same areas) are shown instead. With w/d = 5 fringing adds roughly 10–25 % to C (more when the gap is air): the extra charge sits at the plate edges and on their outer faces, listed below.'));

    box.appendChild(ui.el('h2', '', 'Region by region'));
    this.regionEl = ui.el('table', 'probe-table'); this.regionEl.appendChild(document.createElement('tbody')); box.appendChild(this.regionEl);
    box.appendChild(ui.el('p', 'hint', this.mode === 'layered' ? 'Down the centre of the plates. D is the same in every layer (normal D is continuous), E and the voltage drop differ: the low-ε layer takes more than its share of V. The drops add up to V.'
      : this.mode === 'side' ? 'E is the same in every region (tangential E is continuous), D and the plate charge differ: more charge sits over the high-ε region. The charges add up to the gap-side charge on the plate.'
        : 'Sampled two cells either side of the interface at the centre of the gap. The field near a tilted interface between finite plates is not uniform, so this is a local reading of the refraction, not the clean law (the Interface tab has that). C lies between the series and parallel values.'));

    box.appendChild(ui.el('h2', '', 'Free and bound charge'));
    this.chargeEl = ui.el('table', 'probe-table'); this.chargeEl.appendChild(document.createElement('tbody')); box.appendChild(this.chargeEl);
    box.appendChild(ui.el('p', 'hint', 'Bound charge on each dielectric face from P·n̂ (for a face between two dielectrics, both sides added). Against the + plate the dielectric face is negative and screens the plate: with one dielectric the net charge at the plate is Q/εr, which is why the field and voltage drop by εr at fixed Q. The "edge" faces are the dielectric\'s own ends at the plate edges.'));

    if (this.mode === 'side') {
      box.appendChild(ui.el('h2', '', 'Slab force'));
      const rf = ui.el('div', 'row');
      this.btnForce = ui.button(this.force?.running ? 'Computing…' : 'Compute slab force', () => this.computeForce(), 'btn');
      rf.appendChild(this.btnForce); box.appendChild(rf);
      this.forceEl = ui.el('table', 'probe-table'); this.forceEl.appendChild(document.createElement('tbody')); box.appendChild(this.forceEl);
      box.appendChild(ui.el('p', 'hint', 'Two more solves with the first interface moved one cell either way give dC/dx by central difference, and F = ½V²·dC/dx is the force pulling region 1 into region 2 (positive: region 1 is drawn in). At fixed Q the same number is Q²/(2C²)·dC/dx. The handout\'s formula (ε₁ − ε₂)ε₀ℓV²/(2d) comes out almost exactly: moving an interface in the middle of the plates changes only the 1-D part of the field, and the fringe at the plate ends, which is what physically does the pulling, does not move.'));
    }

    const cr = ui.el('div', 'row');
    cr.append(ui.button('Show cutline', () => { shell.setStageView('cut'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Download cutline CSV', () => { const t = this.cutlineCSV(); if (t) downloadText('dielectrics-cutline.csv', t); }, 'btn btn-small'));
    box.appendChild(cr);
    box.appendChild(ui.el('p', 'hint', this.mode === 'side' ? 'Cutline: the free charge density along the top plate and E_y along the middle of the gap, against x.' : 'Cutline: D, ε₀E and P up the centre of the gap, against y. D is continuous; E and P step at each interface.'));
    this.renderResults();
  },

  /** Keep the fractions summing to 1; the region just edited keeps its value, the others share the rest. */
  normalize(keep = -1) {
    const n = this.regions.length;
    if (n === 1) { this.regions[0].f = 1; return; }
    if (keep >= 0) {
      const fk = Math.min(0.99, Math.max(0.01, this.regions[keep].f));
      this.regions[keep].f = fk;
      const others = this.regions.filter((_, k) => k !== keep), sum = others.reduce((a, r) => a + r.f, 0);
      for (const r of others) r.f = sum > 0 ? (r.f / sum) * (1 - fk) : (1 - fk) / others.length;
    } else { const sum = this.regions.reduce((a, r) => a + r.f, 0) || 1; for (const r of this.regions) r.f /= sum; }
  },

  renderResults() {
    const fill = (el, rows) => { if (!el) return; const tb = el.tBodies[0]; tb.innerHTML = ''; for (const [a, b] of rows) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); } };
    if (!this.results) { fill(this.resultsEl, [['C', this.running ? 'solving…' : '—']]); fill(this.regionEl, []); fill(this.chargeEl, []); fill(this.forceEl, []); return; }
    const r = this.results, sc = this.scale(), L = this.depth(), m = this.meta;
    const Q = r.cPlate * sc, W = r.W1 * L * sc * sc;
    const cap = [
      ['C (energy, 2W/V²)', `${sci(r.C, 5)} F`], ['C (Gauss box around the top plate)', `${sci(r.cGauss, 5)} F`], ['C (charge summed on the plate)', `${sci(r.cPlate, 5)} F`],
    ];
    if (Number.isFinite(r.cIdeal)) cap.push([`Ideal C, ${r.idealLabel}`, `${sci(r.cIdeal, 5)} F`], ['Simulated / ideal', (r.C / r.cIdeal).toFixed(4)], ['% difference (fringing)', `${(100 * (r.C - r.cIdeal) / r.cIdeal).toFixed(2)} %`]);
    else cap.push(['Ideal C', r.idealLabel], ['Series value (lower Wiener bound)', `${sci(r.lo, 5)} F`], ['Parallel value (upper Wiener bound)', `${sci(r.hi, 5)} F`], ['Inside the bounds?', r.C >= r.lo * 0.999 && r.C <= r.hi * 1.001 ? 'yes' : 'no']);
    cap.push([this.hold === 'V' ? 'V (held)' : 'V = Q/C', `${sci(sc, 5)} V`], [this.hold === 'Q' ? 'Q (held)' : 'Q = CV', `${sci(Q, 5)} C`], ['Stored energy W = ½CV²', `${sci(W, 5)} J`], ['E in the gap if uniform, V/d', `${sci(sc / m.d, 4)} V/m`]);
    fill(this.resultsEl, cap);

    const reg = [];
    for (const row of r.rows) {
      const name = `Region ${row.k + 1} (εr = ${row.eps})`;
      if (m.mode === 'layered') reg.push([`${name}: thickness`, `${(row.len * 1e3).toFixed(3)} mm (${(100 * row.len / m.d).toFixed(1)} % of d)`], [`${name}: E`, `${sci(row.E * sc, 4)} V/m`], [`${name}: D = ε0 εr E`, `${sci(row.D * sc, 4)} C/m²`], [`${name}: voltage across`, `${sci(row.V * sc, 4)} V (${(100 * row.share).toFixed(1)} % of V)`]);
      else if (m.mode === 'side') reg.push([`${name}: width`, `${(row.len * 1e3).toFixed(3)} mm (${(100 * row.len / m.w).toFixed(1)} % of w)`], [`${name}: E`, `${sci(row.E * sc, 4)} V/m`], [`${name}: D = ε0 εr E`, `${sci(row.D * sc, 4)} C/m²`], [`${name}: plate charge over it`, `${sci(row.Q * L * sc, 4)} C (${(100 * row.share).toFixed(1)} % of the gap-side charge)`]);
      else reg.push([`${name}: |E|, |D|`, `${sci(row.E * sc, 4)} V/m, ${sci(row.D * sc, 4)} C/m²`], [`${name}: D normal / tangential`, `${sci(row.Dn * sc, 4)} / ${sci(row.Dt * sc, 4)} C/m²`], [`${name}: E normal / tangential`, `${sci(row.En * sc, 4)} / ${sci(row.Et * sc, 4)} V/m`], [`${name}: angle of E from the interface normal`, `${row.angle.toFixed(1)}°`]);
    }
    if (m.mode === 'layered') { const sum = r.rows.reduce((a, q) => a + q.V, 0); reg.push(['Sum of the drops', `${sci(sum * sc, 5)} V`]); }
    if (m.mode === 'side') { const sum = r.rows.reduce((a, q) => a + q.Q, 0); reg.push(['Sum of the region charges', `${sci(sum * L * sc, 5)} C (gap side of the top plate)`]); }
    fill(this.regionEl, reg);

    const pl = r.plates, ch = [];
    const topGap = pl.topGap.reduce((a, b) => a + b, 0);
    ch.push(['Free charge on the top plate, gap side', `${sci(topGap * L * sc, 4)} C`], ['Free charge on the top plate, edges and outer face (fringing)', `${sci(pl.topOuter * L * sc, 4)} C (${(100 * pl.topOuter / pl.top).toFixed(1)} % of Q)`], ['Free charge on the bottom plate', `${sci(pl.bottom * L * sc, 4)} C`]);
    const faceName = (f) => { const a = typeof f.a === 'number' ? (f.a < 0 ? 'air' : `region ${f.a + 1}`) : f.a, b = typeof f.b === 'number' ? (f.b < 0 ? 'air' : `region ${f.b + 1}`) : `${f.b} plate`; return f.a < 0 || f.b < 0 ? `edge face, ${a === 'air' ? b : a} | air` : `${a} | ${b}`; };
    let boundTop = 0;
    for (const f of r.bound.faces.sort((x, y) => String(x.key).localeCompare(String(y.key)))) { ch.push([`Bound charge, ${faceName(f)}`, `${sci(f.Q * L * sc, 4)} C`]); if (f.b === 'top') boundTop += f.Q; }
    const topRegion = m.regions[m.mode === 'layered' ? m.n - 1 : 0];
    if (boundTop !== 0) ch.push(['Net at the top plate (free, gap side + bound face)', `${sci((topGap + boundTop) * L * sc, 4)} C`], ['Net / free', `${((topGap + boundTop) / topGap).toFixed(4)}${m.mode === 'layered' || m.n === 1 ? ` (1/εr of the layer against it = ${(1 / topRegion.eps).toFixed(4)})` : ''}`]);
    fill(this.chargeEl, ch);

    if (this.forceEl) {
      if (!this.force) fill(this.forceEl, [['F', 'press Compute slab force']]);
      else if (this.force.running) fill(this.forceEl, [['F', 'solving the two shifted cases…']]);
      else {
        const f = this.force, F = 0.5 * sc * sc * f.dCdx, Fi = idealSlabForce(m, sc) * L;
        fill(this.forceEl, [['dC/dx (interface 1|2 moved ±1 cell)', `${sci(f.dCdx, 4)} F/m`], ['F = ½V²·dC/dx = Q²/(2C²)·dC/dx', `${sci(F, 4)} N`], ['Handout: (ε₁ − ε₂)ε₀ℓV²/(2d)', `${sci(Fi, 4)} N`], ['Simulated / handout', (F / Fi).toFixed(4)], ['Direction', F > 0 ? 'region 1 pulled in (toward larger C)' : F < 0 ? 'region 2 pulled in (toward larger C)' : '—']]);
      }
    }
  },

  // ------------------------------------------------------------ slab force

  async computeForce() {
    if (this.force?.running || this.mode !== 'side' || !this.client) return;
    this.force = { running: true }; this.renderResults(); if (this.btnForce) this.btnForce.textContent = 'Computing…';
    const main = this.solver, mainV = this.V, mainMeta = this.meta;
    const mm = 1e-3, Cs = [];
    try {
      for (const shift of [-1, +1]) {
        const s = buildPlates({ w: this.p.w * mm, d: this.p.d * mm, regions: this.regions, mode: 'side', res: this.meta.res, walls: this.walls, colShift: shift });
        if (s.meta.regions[0].cells === mainMeta.regions[0].cells) throw new Error('cannot shift');
        this.shell.solverRunning = true;
        await this.client.init(s, 'cartesian');
        const done = await this.client.run({ k: 50, tol: this.tol() });
        s.V.set(done.V);
        Cs.push({ C: 2 * s.energy() * this.depth(), x: s.meta.regions[0].f * s.meta.w });
      }
      this.force = { running: false, dCdx: (Cs[1].C - Cs[0].C) / (Cs[1].x - Cs[0].x) };
    } catch { this.force = null; }
    // restore the main case in the worker (so a later step/frame refers to it) without re-solving
    this.solver = main; this.V = mainV; this.meta = mainMeta;
    this.shell.solverRunning = false;
    if (this.btnForce) this.btnForce.textContent = 'Compute slab force';
    this.renderResults(); this.shell.recompute();
  },

  // ------------------------------------------------------------ cutline

  cutline() {
    if (!this.gridV) this.compute();
    const s = this.solver, m = this.meta, sc = this.scale(), out = [];
    if (m.mode === 'side') {
      for (let i = 0; i < s.nx; i++) {
        const x = s.x(i), jm = Math.round((m.jBot + m.jTop) / 2);
        const onPlate = i >= m.iL && i <= m.iR;
        out.push({ x, sigmaFree: onPlate ? sc * this.sigmaFree[s.idx(i, m.jTop)] : 0, sigmaBound: sc * this.sigmaBound[s.idx(i, m.jTop - 1)], Ey: sc * (this.V[s.idx(i, jm - 1)] - this.V[s.idx(i, jm + 1)]) / (2 * s.h) * -1, eps: s.eps[s.idx(i, jm)] });
      }
    } else {
      for (let j = m.jBot - 2; j <= m.jTop + 2; j++) {
        if (j < 0 || j >= s.ny) continue;
        const k = s.idx(m.ic, j), y = s.y(j), e = s.eps[k];
        const ey = j > 0 && j < s.ny - 1 ? -sc * (this.V[k + s.nx] - this.V[k - s.nx]) / (2 * s.h) : 0;
        out.push({ y, Ey: ey, D: EPS0 * e * ey, e0E: EPS0 * ey, P: EPS0 * (e - 1) * ey, eps: e, conductor: s.fixed[k] });
      }
    }
    return out;
  },

  drawCutline(ctx, W, H) {
    if (!this.gridV) return;
    const m = this.meta, rows = this.cutline();
    ctx.font = '12px system-ui';
    const L = 80, T = 58, B = 56, Rm = 20;
    const axes = (lo, hi, a0, a1, xlabel, ylabel, fmtX) => {
      const px = (v) => L + ((v - a0) / (a1 - a0 || 1)) * (W - L - Rm), py = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
      ctx.fillStyle = '#5a5955';
      for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 4, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(W - Rm, py(v)); ctx.stroke(); }
      for (let k = 0; k <= 6; k++) { const v = a0 + (k / 6) * (a1 - a0); ctx.fillText(fmtX(v), px(v) - 12, H - B + 16); }
      ctx.fillText(xlabel, W / 2 - 60, H - 8);
      ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, -14, 0); ctx.restore();
      ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke();
      return [px, py];
    };
    const legend = (items) => { let lx = L; for (const [name, color] of items) { ctx.fillStyle = color; ctx.fillRect(lx, 10, 12, 12); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 16, 20); lx += 16 + 8 * name.length + 20; } };
    const line = (pts, color, dash = []) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath(); pts.forEach(([X, Y], k) => (k === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y))); ctx.stroke(); ctx.setLineDash([]); };
    if (m.mode === 'side') {
      const vals = rows.flatMap((r) => [r.sigmaFree, r.sigmaBound]).filter(Number.isFinite);
      const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
      const [px, py] = axes(lo, hi, rows[0].x, rows[rows.length - 1].x, 'x along the top plate (mm)', 'C/m²', (v) => (v * 1e3).toFixed(1));
      // region bands
      let p = m.iL; for (const [k, r] of m.regions.entries()) { ctx.fillStyle = `${TINTS[k % TINTS.length]}0.25)`; const x0 = this.solver.x(p) - m.h / 2, x1 = this.solver.x(p + r.cells - 1) + m.h / 2; ctx.fillRect(px(x0), T, px(x1) - px(x0), H - T - B); p += r.cells; }
      line(rows.map((r) => [px(r.x), py(r.sigmaFree)]), '#e5484d');
      line(rows.map((r) => [px(r.x), py(r.sigmaBound)]), '#2a9d4b');
      // E_y on a second scale, drawn as a dashed line normalised to the plot height
      const eMax = Math.max(...rows.map((r) => Math.abs(r.Ey))) || 1;
      line(rows.map((r) => [px(r.x), T + (1 - Math.abs(r.Ey) / eMax) * (H - T - B)]), '#1f5fbf', [5, 4]);
      legend([['free σ on the plate', '#e5484d'], ['bound σ on the dielectric face', '#2a9d4b'], ['|E_y| mid-gap, dashed (peak ' + sci(eMax, 3) + ' V/m)', '#1f5fbf']]);
      ctx.fillStyle = '#5a5955'; ctx.fillText('Same E in every region; the plate charge steps by the permittivity ratio. Bands: the regions.', L, 40);
    } else {
      const pts = rows.filter((r) => !r.conductor);
      const vals = pts.flatMap((r) => [r.D, r.e0E, r.P]).filter(Number.isFinite);
      const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
      const [px, py] = axes(lo, hi, rows[0].y, rows[rows.length - 1].y, 'y up the centre of the gap (mm)', 'C/m²', (v) => (v * 1e3).toFixed(2));
      ctx.fillStyle = 'rgba(229,72,77,0.15)'; ctx.fillRect(px(m.d / 2), T, px(m.d / 2 + m.h) - px(m.d / 2), H - T - B);
      ctx.fillStyle = 'rgba(59,130,246,0.15)'; ctx.fillRect(px(-m.d / 2 - m.h), T, px(-m.d / 2) - px(-m.d / 2 - m.h), H - T - B);
      if (m.mode === 'layered') { let q = 0; for (const [k, r] of m.regions.entries()) { ctx.fillStyle = `${TINTS[k % TINTS.length]}0.25)`; const y0 = this.solver.y(m.jBot + q + 1) - m.h / 2 - (k === 0 ? m.h / 2 : 0), y1 = this.solver.y(m.jBot + q + r.cells) + m.h / 2 + (k === m.n - 1 ? m.h / 2 : 0); ctx.fillRect(px(y0), T, px(y1) - px(y0), H - T - B); q += r.cells; } }
      for (const [key, color] of [['D', '#1f5fbf'], ['e0E', '#e5484d'], ['P', '#2a9d4b']]) line(pts.map((r) => [px(r.y), py(r[key])]), color);
      legend([['D', '#1f5fbf'], ['ε₀E', '#e5484d'], ['P', '#2a9d4b']]);
      ctx.fillStyle = '#5a5955'; ctx.fillText('D (normal) is continuous across the layers; E and P step by the permittivity ratio. Shaded bands: the plates and the regions.', L, 40);
    }
  },

  cutlineCSV() {
    const rows = this.cutline();
    if (this.meta.mode === 'side') return ['x_m,eps_r_midgap,sigma_free_Cpm2,sigma_bound_Cpm2,Ey_midgap_Vpm', ...rows.map((r) => `${r.x},${r.eps},${r.sigmaFree},${r.sigmaBound},${r.Ey}`)].join('\n');
    return ['y_m,eps_r,Ey_Vpm,Dy_Cpm2,eps0Ey_Cpm2,Py_Cpm2,conductor', ...rows.map((r) => `${r.y},${r.eps},${r.Ey},${r.D},${r.e0E},${r.P},${r.conductor}`)].join('\n');
  },
};

function fmt(v) { return Math.abs(v) >= 1000 || Math.abs(v) < 0.01 ? v.toExponential(2) : +v.toPrecision(4); }
