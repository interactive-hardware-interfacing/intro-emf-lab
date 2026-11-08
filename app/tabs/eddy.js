// Eddy currents (quasi-static) tab: the Inductors geometry with a conducting object and an
// AC coil current. Frequency-domain magnetic diffusion is solved for the complex
// psi = r A_phi in the Web Worker (core/eddy.js). Layers show the field amplitude and phase,
// the induced current density, the dissipated power density and a snapshot of the field at
// an adjustable (or animated) phase of the cycle. The side panel reports the skin depth, the
// coil impedance R + jwL, the change from the empty coil, and the eddy power; a frequency
// sweep view plots L(f) and R(f).

import { MU0, PI } from '../../core/constants.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { solenoidWithObject } from '../../core/axisym.js';
import { AxisymEddy } from '../../core/eddy.js';
import { drawScalarField, drawQuiver, drawContours, levelsBetween } from '../../core/render.js';
import { SolverClient } from '../solverclient.js';
import { mirrorGrid } from '../mirror.js';
import { plotView } from '../views.js';
import { getNum, downloadText } from '../state.js';
import { ui, sci } from '../shell.js';

const MATERIALS = [
  ['copper', 'Copper (σ = 5.8e7 S/m)', 5.8e7, 1],
  ['aluminium', 'Aluminium (σ = 3.5e7 S/m)', 3.5e7, 1],
  ['brass', 'Brass (σ = 1.5e7 S/m)', 1.5e7, 1],
  ['steel', 'Mild steel (σ = 1e7 S/m, μr = 100)', 1e7, 100],
  ['graphite', 'Graphite (σ = 1e5 S/m)', 1e5, 1],
  ['custom', 'Custom σ, μr', null, null],
];
const DEF = { N: 100, I: 1, Rc: 15, l: 30, tw: 1, a: 5, Lo: 20, zPos: -10 };

export default {
  id: 'eddy',
  title: 'Eddy currents',
  phase: 7,
  available: true,
  summary: 'A conductor in an AC coil: skin depth, induced currents, the coil’s R + jωL, quasi-static (∂B/∂t without waves).',
  extent: [0, 0.064, -0.064, 0.064],
  axes: ['r', 'z'],
  layers: [
    { id: 'Bamp', label: '|B| amplitude', kind: 'scalar', unit: 'T', log: true, default: true, eq: 'B' },
    { id: 'Bphase', label: 'Phase of B_z (deg, vs the coil current)', kind: 'scalar', unit: '°', signed: true, eq: 'B' },
    { id: 'Bsnap', label: 'B_z at the chosen phase', kind: 'scalar', unit: 'T', signed: true, eq: 'B' },
    { id: 'Jamp', label: '|J_eddy| amplitude', kind: 'scalar', unit: 'A/m²', log: true, eq: 'Je' },
    { id: 'Jsnap', label: 'J_eddy at the chosen phase', kind: 'scalar', unit: 'A/m²', signed: true, eq: 'Je' },
    { id: 'pw', label: 'Dissipated power density (time average)', kind: 'scalar', unit: 'W/m³', log: true, eq: 'P' },
    { id: 'B', label: 'B at the chosen phase', kind: 'vector', styles: ['arrows'] },
    { id: 'flux', label: 'Flux lines at the chosen phase', kind: 'contour', eq: 'B', default: true },
  ],

  p: { ...DEF },
  mat: 'copper',
  sigma: 5.8e7,
  muR: 1,
  f: 1000,          // Hz
  nr: 61,
  objectIn: true,
  zoom: 'coil',
  mirror: true,
  phase: 0,         // degrees of the cycle shown by the snapshot layers
  animate: false,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...DEF };
    for (const k of Object.keys(DEF)) this.p[k] = getNum(s, `e_${k}`, this.p[k]);
    this.mat = MATERIALS.some(([id]) => id === s.mat) ? s.mat : 'copper';
    const m = MATERIALS.find(([id]) => id === this.mat);
    this.sigma = this.mat === 'custom' ? Math.max(1, getNum(s, 'sig', 5.8e7)) : m[2];
    this.muR = this.mat === 'custom' ? Math.max(1, getNum(s, 'emu', 1)) : m[3];
    this.f = Math.min(1e6, Math.max(0.1, getNum(s, 'f', 1000)));
    this.nr = [61, 81, 121].includes(getNum(s, 'nr', 61)) ? getNum(s, 'nr', 61) : 61;
    this.objectIn = s.obj !== '0';
    this.zoom = s.zoom === 'box' ? 'box' : 'coil';
    this.mirror = s.half !== '1';
    this.phase = getNum(s, 'ph', 0);
    this.sweep = { f0: getNum(s, 'sf0', 10), f1: getNum(s, 'sf1', 1e5), n: Math.round(getNum(s, 'sfn', 11)), rows: [], running: false };
    this.client = new SolverClient({ onFrame: (m) => this.onFrame(m) });
    this.build();
    this.views = [
      plotView('radial', 'Across the object', (ctx, w, h) => this.drawRadial(ctx, w, h)),
      plotView('sweep', 'Frequency sweep', (ctx, w, h) => this.drawSweep(ctx, w, h)),
    ];
    this.buildControls();
    this.solve();
  },

  destroy() { this.stopAnimation(); this.client?.terminate(); this.client = null; this.shell.solverRunning = false; },

  // ------------------------------------------------------------ model

  build(p = this.p, f = this.f) {
    const mm = 1e-3;
    const mag = solenoidWithObject({ N: p.N, I: p.I, Rc: p.Rc * mm, l: p.l * mm, tw: p.tw * mm, a: this.objectIn ? p.a * mm : 0, Lo: p.Lo * mm, muR: this.objectIn ? this.muR : 1, zPos: p.zPos * mm, nr: this.nr, box: 4 });
    const { h } = mag.meta, a = p.a * mm, zPos = p.zPos * mm, Lo = p.Lo * mm;
    const inObject = (r, z) => this.objectIn && r <= a + h / 4 && z >= zPos - h / 4 && z <= zPos + Lo + h / 4;
    this.solver = AxisymEddy.fromMag(mag, { omega: 2 * PI * f, sigmaAt: (r, z) => (inObject(r, z) ? this.sigma : 0) });
    this.meta = { ...mag.meta, sigma: this.sigma, f, omega: 2 * PI * f, delta: this.solver.skinDepth(this.sigma, this.muR) };
    this.applyZoom();
    this.V = new Float64Array(this.solver.V); this.Vi = new Float64Array(this.solver.Vi);
    this.results = null;
    this.sweeps = 0; this.residual = Infinity; this.converged = false;
  },

  applyZoom() {
    const { S } = this.meta;
    const Z = this.zoom === 'box' ? S : S / 2;
    if (this.mirror) this.shell.setExtent([-Z, Z, -Z, Z], ['x', 'z']);
    else this.shell.setExtent([0, 2 * Z, -Z, Z], ['r', 'z']);
  },

  // 20x tighter than the Inductors tab: R_eddy comes from the small quadrature part of psi and
  // settles later than L (at the Inductors tolerance it was still moving in its 4th digit).
  tol() { return 5e-9 * MU0 * this.meta.N * this.meta.I * this.meta.Rc; },

  async solve() {
    if (!this.client) return;
    this.shell.solverRunning = true;
    this.running = true; this.converged = false;
    try {
      await this.client.init(this.solver, 'axisym-eddy');
      const done = await this.client.run({ k: 50, tol: this.tol() });
      this.V = done.V; this.Vi = done.Vi; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
      this.finish();
    } catch { /* cancelled */ }
    this.running = false; this.shell.solverRunning = false; this.shell.refreshStatus();
  },

  onFrame(m) {
    this.V = m.V; if (m.Vi) this.Vi = m.Vi; this.sweeps = m.sweeps; this.residual = m.residual;
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.shell.recompute(); });
  },

  solverWithV() {
    const s = new AxisymEddy(this.solver.nr, this.solver.nz, { h: this.solver.h, z0: this.solver.z0, boundary: this.solver.boundary, omega: this.solver.omega });
    s.V.set(this.V); s.Vi.set(this.Vi); s.fixed.set(this.solver.fixed); s.eps.set(this.solver.eps); s.rho.set(this.solver.rho); s.sigma.set(this.solver.sigma);
    return s;
  },

  /** The empty coil's L at this grid, for the "change from empty coil" readout (solved once per geometry). */
  emptyL() {
    // Same grid as the object solve: the box size follows the largest dimension, so the
    // object's a and Lo must be passed (with mu_r = 1 and no conductivity they do nothing else).
    const key = `${this.nr}|${this.p.N}|${this.p.Rc}|${this.p.l}|${this.p.tw}|${this.p.a}|${this.p.Lo}|${this.objectIn}`;
    if (this.emptyCache?.key === key) return this.emptyCache.L;
    const mm = 1e-3, p = this.p;
    const mag = solenoidWithObject({ N: p.N, I: p.I, Rc: p.Rc * mm, l: p.l * mm, tw: p.tw * mm, a: this.objectIn ? p.a * mm : 0, Lo: p.Lo * mm, muR: 1, zPos: p.zPos * mm, nr: this.nr, box: 4 });
    mag.solve(this.tol(), 400000, 100);
    const L = 2 * mag.energyJA() / (p.I * p.I);
    this.emptyCache = { key, L };
    return L;
  },

  finish() {
    const s = this.solverWithV();
    const { I } = this.meta;
    const Z = s.impedance(I);
    const { total } = s.power();
    this.results = { ...Z, P: total, L0: this.emptyL() };
    this.renderResults();
    this.shell.recompute();
  },

  compute() {
    const s = this.solverWithV();
    const [brr, bzr, bri, bzi] = s.Bc();
    const [jr, ji] = s.Je();
    const { density } = s.power();
    const n = s.nr * s.nz, ph = (this.phase * PI) / 180, c = Math.cos(ph), sn = Math.sin(ph);
    const mk = () => new Grid2D(s.nr, s.nz, s.extent);
    this.gridBamp = mk(); this.gridBphase = mk(); this.gridBsnap = mk(); this.gridBrSnap = mk(); this.gridJamp = mk(); this.gridJsnap = mk(); this.gridPsiSnap = mk();
    for (let k = 0; k < n; k++) {
      this.gridBamp.data[k] = Math.hypot(Math.hypot(brr.data[k], bri.data[k]), Math.hypot(bzr.data[k], bzi.data[k]));
      this.gridBphase.data[k] = (Math.atan2(bzi.data[k], bzr.data[k]) * 180) / PI;
      // snapshot at phase: Re[(x + j y) e^{j ph}] = x cos ph - y sin ph
      this.gridBsnap.data[k] = bzr.data[k] * c - bzi.data[k] * sn;
      this.gridBrSnap.data[k] = brr.data[k] * c - bri.data[k] * sn;
      this.gridJamp.data[k] = Math.hypot(jr.data[k], ji.data[k]);
      this.gridJsnap.data[k] = jr.data[k] * c - ji.data[k] * sn;
      this.gridPsiSnap.data[k] = this.V[k] * c - this.Vi[k] * sn;
    }
    this.gridPw = density;
    const pct = (g, lo, hi) => { const a = Array.from(g.data).filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y); return a.length ? [a[Math.floor(lo * (a.length - 1))], a[Math.floor(hi * (a.length - 1))]] : [1e-9, 1]; };
    this.bRange = pct(this.gridBamp, 0.05, 0.995);
    this.jRange = pct(this.gridJamp, 0.02, 0.995);
    this.pRange = pct(this.gridPw, 0.02, 0.995);
    const sym = (g, q = 0.985, nonzero = false) => { const a = Array.from(g.data).map(Math.abs).filter((v) => Number.isFinite(v) && (!nonzero || v > 0)).sort((x, y) => x - y); const m = a[Math.floor(q * (a.length - 1))] || 1e-12; return [-m, m]; };
    this.bsRange = sym(this.gridBsnap); this.jsRange = sym(this.gridJamp, 0.995, true); // J lives only in the conductor: scale by its own cells
    this.psiRange = [Math.min(...this.gridPsiSnap.data), Math.max(...this.gridPsiSnap.data)];
    if (this.mirror) {
      for (const k of ['gridBamp', 'gridBphase', 'gridBsnap', 'gridJamp', 'gridJsnap', 'gridPw', 'gridPsiSnap']) this[k] = mirrorGrid(this[k]);
      this.gridBrSnap = mirrorGrid(this.gridBrSnap, true);
    }
  },

  render(layer, ctx, view, opts) {
    const o = (min, max, log = false) => ({ map: opts.map, extent: opts.extent, log, min: opts.min ?? min, max: opts.max ?? max });
    switch (layer) {
      case 'Bamp': return drawScalarField(ctx, this.gridBamp, o(this.bRange[0], this.bRange[1], true));
      case 'Bphase': return drawScalarField(ctx, this.gridBphase, o(-180, 180));
      case 'Bsnap': return drawScalarField(ctx, this.gridBsnap, o(this.bsRange[0], this.bsRange[1]));
      case 'Jamp': return drawScalarField(ctx, this.gridJamp, o(Math.max(this.jRange[0], 1e-3), this.jRange[1], true));
      case 'Jsnap': return drawScalarField(ctx, this.gridJsnap, o(this.jsRange[0], this.jsRange[1]));
      case 'pw': return drawScalarField(ctx, this.gridPw, o(Math.max(this.pRange[0], 1e-6), this.pRange[1], true));
      case 'B': drawQuiver(ctx, view, (r, z) => [this.gridBrSnap.sample(r, z), this.gridBsnap.sample(r, z)], { normalize: true, spacing: 24 }); return null;
      case 'flux': drawContours(ctx, view, this.gridPsiSnap, levelsBetween(this.psiRange[0], this.psiRange[1], 24), { color: 'rgba(255,255,255,0.65)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const { Rc, l, tw, a, Lo, zPos, delta } = this.meta;
    const rect = (r0, r1, z0, z1, fill, stroke) => {
      const [x0, y0] = view.toPx(r0, z1), [x1, y1] = view.toPx(r1, z0);
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    };
    ctx.save();
    rect(Rc - tw / 2, Rc + tw / 2, -l / 2, l / 2, 'rgba(245,166,35,0.85)', '#fff');
    if (this.mirror) rect(-Rc - tw / 2, -Rc + tw / 2, -l / 2, l / 2, 'rgba(245,166,35,0.85)', '#fff');
    if (this.objectIn && a > 0) {
      rect(this.mirror ? -a : 0, a, zPos, zPos + Lo, 'rgba(200,120,60,0.25)', '#fff');
      // skin-depth marker: a dashed line delta inside the object's surface
      if (delta < a) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        for (const sgn of this.mirror ? [-1, 1] : [1]) { const [x0, y0] = view.toPx(sgn * (a - delta), zPos + Lo), [, y1] = view.toPx(0, zPos); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke(); }
        ctx.setLineDash([]);
        const [lx, ly] = view.toPx(a - delta, zPos + Lo); ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.fillText('δ', lx + 3, ly - 4);
      }
    }
    const [ax, ay0] = view.toPx(0, view.extent[2]), [, ay1] = view.toPx(0, view.extent[3]);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(ax + 1, ay0); ctx.lineTo(ax + 1, ay1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ddd'; ctx.font = '12px system-ui';
    ctx.fillText(`ωt = ${Math.round(this.phase)}°${this.animate ? ' (animating)' : ''} · f = ${this.fmtF(this.meta.f)} · δ = ${(delta * 1e3).toPrecision(3)} mm`, 12, view.height - 10);
    ctx.restore();
  },

  fmtF(f) { return f >= 1e6 ? `${(f / 1e6).toPrecision(3)} MHz` : f >= 1e3 ? `${(f / 1e3).toPrecision(3)} kHz` : `${f.toPrecision(3)} Hz`; },

  statusText() {
    const r = Number.isFinite(this.residual) ? this.residual.toExponential(2) : '—';
    return `${this.sweep?.progress ? this.sweep.progress + ' · ' : ''}${this.solver.nr}×${this.solver.nz} (r,z) grid, h = ${(this.meta.h * 1e3).toFixed(2)} mm · complex ψ · sweep ${this.sweeps} · max |Δψ| = ${r} · ${this.running ? 'solving' : this.converged ? 'converged' : 'not converged'}`;
  },

  probe(x, z) {
    const r = this.mirror ? Math.abs(x) : x;
    const amp = this.gridBamp.sample(x, z), phs = this.gridBphase.sample(x, z);
    const rows = [
      { label: '|B| amplitude', value: amp, unit: 'T' },
      { label: 'phase of B_z vs coil current', value: phs, unit: '°' },
      { label: `B_z at ωt = ${Math.round(this.phase)}°`, value: this.gridBsnap.sample(x, z), unit: 'T' },
      { label: '|J_eddy| amplitude', value: this.gridJamp.sample(x, z), unit: 'A/m²' },
      { label: 'power density (avg)', value: this.gridPw.sample(x, z), unit: 'W/m³' },
    ];
    const { a, zPos, Lo, delta } = this.meta;
    if (this.objectIn && r <= a && z >= zPos && z <= zPos + Lo) rows.push({ label: 'depth below the surface / δ', value: (a - r) / delta, unit: '' });
    return rows;
  },

  getState() {
    const s = { mat: this.mat, f: this.f, nr: this.nr, obj: this.objectIn ? '1' : '0', zoom: this.zoom, half: this.mirror ? '0' : '1', ph: this.phase, sf0: this.sweep.f0, sf1: this.sweep.f1, sfn: this.sweep.n };
    if (this.mat === 'custom') { s.sig = this.sigma; s.emu = this.muR; }
    for (const k of Object.keys(DEF)) s[`e_${k}`] = this.p[k];
    return s;
  },

  csv() {
    const s = this.solverWithV();
    const [brr, bzr, bri, bzi] = s.Bc(), [jr, ji] = s.Je(), { density } = s.power();
    const lines = ['r_m,z_m,Br_re_T,Br_im_T,Bz_re_T,Bz_im_T,Je_re_Apm2,Je_im_Apm2,p_avg_Wpm3,sigma_Spm,mu_r'];
    for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nr; i++) { const k = s.idx(i, j); lines.push(`${s.r(i)},${s.z(j)},${brr.data[k]},${bri.data[k]},${bzr.data[k]},${bzi.data[k]},${jr.data[k]},${ji.data[k]},${density.data[k]},${s.sigma[k]},${s.eps[k]}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ animation

  startAnimation() {
    if (this.animTimer) return;
    this.animate = true;
    let last = performance.now();
    const tick = (now) => {
      this.phase = (this.phase + 0.09 * (now - last)) % 360; last = now;   // one cycle in ~4 s
      if (this.phaseSlider) { this.phaseSlider.value = String(Math.round(this.phase)); this.phaseLabel.textContent = `Phase of the cycle ωt (°): ${Math.round(this.phase)}`; }
      this.shell.recompute();
      this.animTimer = requestAnimationFrame(tick);
    };
    this.animTimer = requestAnimationFrame(tick);
  },
  stopAnimation() { if (this.animTimer) cancelAnimationFrame(this.animTimer); this.animTimer = null; this.animate = false; },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Eddy currents'));
    box.appendChild(ui.lead(shell, 'A conductor inside an AC coil: the changing field drives currents that push the field out to a skin depth and load the coil.'));
    const re = () => { this.client?.cancel(); this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); this.solve(); };
    const pf = (key, label, min, max) => ui.field(label, ui.number(this.p[key], { min, max, onChange: (v) => { this.p[key] = v; re(); } }));

    box.appendChild(ui.el('h2', '', 'Drive'));
    const fLabel = ui.el('div', 'hint', `Frequency: ${this.fmtF(this.f)}`);
    const fRange = ui.range(Math.log10(this.f), { min: -1, max: 6, step: 0.02, ariaLabel: 'frequency (log scale)', onInput: (v) => { this.f = Math.pow(10, v); fLabel.textContent = `Frequency: ${this.fmtF(this.f)}`; } });
    fRange.addEventListener('change', () => re());
    box.append(fLabel, fRange);
    const r1 = ui.el('div', 'row'); r1.append(pf('I', 'Current amplitude I (A)', 1e-3, 1e3), pf('N', 'Turns N', 1, 5000)); box.appendChild(r1);
    const r2 = ui.el('div', 'row'); r2.append(pf('Rc', 'Coil radius (mm)', 1, 200), pf('l', 'Coil length (mm)', 0.5, 400), pf('tw', 'Winding thickness (mm)', 0.2, 50)); box.appendChild(r2);

    box.appendChild(ui.el('h2', '', 'Object'));
    const objRow = document.createElement('label'); objRow.className = 'layer';
    const objC = document.createElement('input'); objC.type = 'checkbox'; objC.checked = this.objectIn;
    objC.addEventListener('change', () => { this.objectIn = objC.checked; re(); });
    objRow.append(objC, ui.el('span', '', 'Conducting object inside the coil'));
    box.appendChild(objRow);
    box.appendChild(ui.field('Material', ui.select(MATERIALS.map(([id, label]) => [id, label]), this.mat, (v) => { this.mat = v; const m = MATERIALS.find(([id]) => id === v); if (m[2] != null) { this.sigma = m[2]; this.muR = m[3]; } re(); })));
    if (this.mat === 'custom') {
      const rc = ui.el('div', 'row');
      rc.append(ui.field('Conductivity σ (S/m)', ui.number(this.sigma, { min: 1, max: 1e8, onChange: (v) => { this.sigma = Math.max(1, v); re(); } })), ui.field('Relative permeability μr', ui.number(this.muR, { min: 1, max: 1e4, onChange: (v) => { this.muR = Math.max(1, v); re(); } })));
      box.appendChild(rc);
    }
    const r3 = ui.el('div', 'row'); r3.append(pf('a', 'Object radius (mm)', 0.5, 150), pf('Lo', 'Object length (mm)', 0.5, 400), pf('zPos', 'Bottom end position (mm)', -80, 80)); box.appendChild(r3);
    box.appendChild(ui.el('p', 'hint', `Skin depth δ = √(2/ωμσ) = ${(this.meta.delta * 1e3).toPrecision(3)} mm; object radius a = ${this.p.a} mm, so a/δ = ${(this.p.a * 1e-3 / this.meta.delta).toPrecision(3)}. For a/δ ≪ 1 the field passes through the object almost unchanged; for a/δ ≫ 1 the eddy currents confine it to a skin and the object looks like a flux-excluding (diamagnetic) cylinder. Steel's μr pulls flux in while its σ pushes it out; the balance depends on frequency.`));

    box.appendChild(ui.el('h2', '', 'Snapshot phase'));
    this.phaseLabel = ui.el('div', 'hint', `Phase of the cycle ωt (°): ${Math.round(this.phase)}`);
    this.phaseSlider = ui.range(this.phase, { min: 0, max: 359, step: 1, ariaLabel: 'phase of the cycle', onInput: (v) => { this.phase = v; this.phaseLabel.textContent = `Phase of the cycle ωt (°): ${Math.round(v)}`; shell.recompute(); } });
    this.phaseSlider.addEventListener('change', () => shell.syncUrl());
    box.append(this.phaseLabel, this.phaseSlider);
    const anRow = document.createElement('label'); anRow.className = 'layer';
    const anC = document.createElement('input'); anC.type = 'checkbox'; anC.checked = this.animate;
    anC.addEventListener('change', () => (anC.checked ? this.startAnimation() : this.stopAnimation()));
    anRow.append(anC, ui.el('span', '', 'Animate the cycle'));
    box.appendChild(anRow);
    box.appendChild(ui.el('p', 'hint', 'Amplitude and phase layers do not depend on the phase; the "at the chosen phase" layers, the arrows and the flux lines show the instantaneous field Re[B e^{jωt}]. Inside the conductor the field lags the coil current: watch the flux lines sweep inward as the phase advances.'));

    const r4 = ui.el('div', 'row');
    r4.appendChild(ui.field('Resolution', ui.select([[61, 'normal (61 radial cells)'], [81, 'fine (81)'], [121, 'finest (121, slow)']], String(this.nr), (v) => { this.nr = parseInt(v, 10); re(); })));
    r4.appendChild(ui.field('View', ui.select([['coil', 'Coil region'], ['box', 'Whole box']], this.zoom, (v) => { this.zoom = v; this.applyZoom(); shell.recompute(); shell.syncUrl(); })));
    r4.appendChild(ui.field('Section', ui.select([['full', 'Full cross-section'], ['half', 'r–z half-plane']], this.mirror ? 'full' : 'half', (v) => { this.mirror = v === 'full'; this.applyZoom(); shell.recompute(); shell.syncUrl(); })));
    box.appendChild(r4);
    box.appendChild(ui.el('p', 'hint', 'The box is 4× the largest dimension here (closer walls than the Inductors tab, for a finer grid around the object); the empty-coil L is solved on the same grid so ΔL is unaffected. The skin depth should span at least two cells for the current distribution to be resolved: at high frequency pick a finer grid, a lower conductivity or a larger object. Mild steel is the hard case: with μr = 100 and σ = 1e7 S/m its skin depth is about four times thinner than copper\'s (δ ∝ 1/√(μσ)).'));

    box.appendChild(ui.el('h2', '', 'Coil impedance and losses'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'Z = jωΛ/I with the complex flux linkage Λ = (1/I)∫J·A dv: L = Re Λ/I, R_eddy = −ω Im Λ/I. The eddy power ∫|J_e|²/(2σ) dv must equal ½R_eddy I²; the two are computed independently and shown together as a check. The metal-detector principle: a non-magnetic conductor lowers L and raises R; a permeable conductor raises L, and the rise shrinks with frequency as the flux is confined to a thinner skin.'));

    box.appendChild(ui.el('h2', '', 'Across the object'));
    box.appendChild(ui.el('div', 'row')).append(ui.button('Show radial profiles', () => { shell.setStageView('radial'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Download profile CSV', () => { const t = this.radialCSV(); if (t) downloadText('eddy-radial-profile.csv', t); }, 'btn btn-small'));

    box.appendChild(ui.el('h2', '', 'Frequency sweep'));
    const sr = ui.el('div', 'row');
    sr.append(ui.field('From (Hz)', ui.number(this.sweep.f0, { min: 0.1, onChange: (v) => { this.sweep.f0 = v; shell.syncUrl(); } })), ui.field('To (Hz)', ui.number(this.sweep.f1, { max: 1e6, onChange: (v) => { this.sweep.f1 = v; shell.syncUrl(); } })), ui.field('Points (log-spaced)', ui.number(this.sweep.n, { min: 2, max: 31, onChange: (v) => { this.sweep.n = Math.round(v); shell.syncUrl(); } })));
    box.appendChild(sr);
    const sr2 = ui.el('div', 'row');
    this.btnSweep = ui.button('Run sweep', () => (this.sweep.running ? this.stopSweep() : this.runSweep()), 'btn');
    sr2.append(this.btnSweep, ui.button('Download sweep CSV', () => { if (this.sweep.rows.length) downloadText('eddy-impedance-vs-frequency.csv', this.sweepCSV()); }, 'btn btn-small'));
    box.appendChild(sr2);
    this.sweepEl = ui.el('table', 'probe-table'); this.sweepEl.appendChild(document.createElement('tbody')); box.appendChild(this.sweepEl);
    this.renderResults(); this.renderSweep();
  },

  renderResults() {
    if (!this.resultsEl) return;
    const tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    if (!this.results) { row('Z', this.running ? 'solving…' : '—'); return; }
    const r = this.results, uH = (x) => `${(x * 1e6).toPrecision(4)} µH`;
    const cells = this.meta.delta / this.meta.h;
    row('skin depth δ', `${(this.meta.delta * 1e3).toPrecision(3)} mm (a/δ = ${(this.p.a * 1e-3 / this.meta.delta).toPrecision(3)}; δ = ${cells.toPrecision(2)} cells${cells < 1.5 ? ' — under-resolved, use a finer grid or lower f' : ''})`);
    row('L with the object', uH(r.L));
    row('L, empty coil (same grid)', uH(r.L0));
    row('ΔL / L₀', `${(100 * (r.L / r.L0 - 1)).toFixed(2)} %`);
    row('R_eddy (coil, from Im Λ)', `${sci(r.R, 4)} Ω`);
    row('ωL', `${sci(r.X, 4)} Ω`);
    row('Q = ωL / R_eddy', Number.isFinite(r.X / r.R) && r.R > 0 ? (r.X / r.R).toPrecision(4) : '—');
    row('eddy power ∫|J|²/2σ dv', `${sci(r.P, 4)} W`);
    row('½ R_eddy I² (check)', `${sci(r.Pcoil, 4)} W`);
  },

  // ------------------------------------------------------------ radial profile

  radial() {
    if (!this.gridBamp) this.compute();
    const s = this.solver, { a, zPos, Lo } = this.meta;
    const zMid = zPos + Lo / 2, out = [];
    for (let i = 0; i < s.nr; i++) {
      const r = s.r(i);
      if (r > Math.max(a, this.meta.Rc) * 1.3) break;
      out.push({ r, Bamp: this.gridBamp.sample(r, zMid), phase: this.gridBphase.sample(r, zMid), Jamp: this.gridJamp.sample(r, zMid), p: this.gridPw.sample(r, zMid) });
    }
    return out;
  },

  drawRadial(ctx, W, H) {
    if (!this.gridBamp) return;
    const rows = this.radial();
    const { a, Rc, delta } = this.meta;
    const r0 = 0, r1 = rows[rows.length - 1].r;
    const L = 80, T = 58, B = 56, Rm = 20;
    const px = (r) => L + ((r - r0) / (r1 - r0 || 1)) * (W - L - Rm);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 6; k++) { const r = r0 + (k / 6) * (r1 - r0); ctx.fillText(`${(r * 1e3).toFixed(1)}`, px(r) - 12, H - B + 16); }
    ctx.fillText('r through the middle of the object (mm)', W / 2 - 110, H - 8);
    if (this.objectIn) { ctx.fillStyle = 'rgba(200,120,60,0.15)'; ctx.fillRect(px(0), T, px(a) - px(0), H - T - B); if (delta < a) { ctx.fillStyle = 'rgba(200,120,60,0.25)'; ctx.fillRect(px(a - delta), T, px(a) - px(a - delta), H - T - B); } }
    ctx.fillStyle = 'rgba(245,166,35,0.25)'; ctx.fillRect(px(Rc - this.meta.tw / 2), T, Math.max(2, px(Rc + this.meta.tw / 2) - px(Rc - this.meta.tw / 2)), H - T - B);
    const series = [['Bamp', '#1f5fbf', '|B| (T)'], ['Jamp', '#e5484d', '|J_eddy| (A/m²)'], ['phase', '#2a9d4b', 'phase of B_z (°, ±180)']];
    let lx = L;
    for (const [key, color, label] of series) {
      const vals = rows.map((r) => r[key]);
      const m = key === 'phase' ? 180 : Math.max(...vals.map(Math.abs)) || 1;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      rows.forEach((r, k) => { const X = px(r.r), Y = key === 'phase' ? T + (1 - (r[key] / m + 1) / 2) * (H - T - B) : T + (1 - r[key] / m) * (H - T - B); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(lx, 10, 12, 12); ctx.fillStyle = '#5a5955'; ctx.fillText(`${label}${key === 'phase' ? '' : `, peak ${sci(m, 3)}`}`, lx + 16, 20); lx += 220;
    }
    ctx.fillStyle = '#5a5955'; ctx.fillText(`Amplitudes scaled to their peaks. Shaded: object (darker band = one skin depth, δ = ${(delta * 1e3).toPrecision(3)} mm) and the winding.`, L, 40);
  },

  radialCSV() { return ['r_m,Bamp_T,phase_deg,Jamp_Apm2,p_avg_Wpm3', ...this.radial().map((r) => `${r.r},${r.Bamp},${r.phase},${r.Jamp},${r.p}`)].join('\n'); },

  // ------------------------------------------------------------ frequency sweep

  async runSweep() {
    if (this.sweep.running) return;
    const { f0, f1, n } = this.sweep;
    this.sweep.rows = []; this.sweep.running = true; this.btnSweep.textContent = 'Stop sweep';
    this.client?.cancel();
    this.shell.setStageView('sweep'); this.shell.syncUrl();
    const savedF = this.f;
    let prev = null;
    for (let k = 0; k < n && this.sweep.running; k++) {
      const f = f0 * Math.pow(f1 / f0, k / (n - 1));
      this.sweep.progress = `sweep point ${k + 1} of ${n} (${this.fmtF(f)})`;
      this.build(this.p, f);
      if (prev && prev.V.length === this.solver.V.length) for (let q = 0; q < prev.V.length; q++) if (!this.solver.fixed[q]) { this.solver.V[q] = prev.V[q]; this.solver.Vi[q] = prev.Vi[q]; }
      this.shell.recompute(); this.shell.solverRunning = true;
      try {
        await this.client.init(this.solver, 'axisym-eddy');
        const done = await this.client.run({ k: 50, tol: this.tol() });
        if (!this.sweep.running) break;
        this.V = done.V; this.Vi = done.Vi; this.sweeps = done.sweeps; this.residual = done.residual; this.converged = done.converged;
        prev = { V: done.V, Vi: done.Vi };
        this.finish();
        this.sweep.rows.push({ f, delta: this.meta.delta, ...this.results });
        this.renderSweep();
      } catch { break; }
    }
    this.sweep.running = false; this.sweep.progress = ''; this.btnSweep.textContent = 'Run sweep'; this.shell.solverRunning = false;
    this.f = savedF; this.build(); this.buildControls(); this.shell.recompute(); this.solve();
  },

  stopSweep() { this.sweep.running = false; this.client?.cancel(); },

  renderSweep() {
    if (!this.sweepEl) return;
    const tb = this.sweepEl.tBodies[0]; tb.innerHTML = '';
    this.shell.updateStageView();
    for (const r of this.sweep.rows) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${this.fmtF(r.f)}</td><td>${(r.L * 1e6).toPrecision(4)} µH · ${sci(r.R, 3)} Ω</td>`; tb.appendChild(tr); }
  },

  drawSweep(ctx, W, H) {
    const rows = this.sweep.rows;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    if (!rows.length) { ctx.fillText('Run a frequency sweep from the side panel to plot L(f) and R(f) here.', 20, 30); return; }
    const xs = rows.map((r) => Math.log10(r.f));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const L = 80, T = 44, B = 56, Rm = 80;
    const px = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rm);
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let d = Math.ceil(x0); d <= Math.floor(x1); d++) { ctx.fillStyle = '#5a5955'; ctx.fillText(this.fmtF(Math.pow(10, d)), px(d) - 14, H - B + 16); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(px(d), T); ctx.lineTo(px(d), H - B); ctx.stroke(); }
    ctx.fillStyle = '#5a5955'; ctx.fillText('frequency (log scale)', W / 2 - 50, H - 8);
    // L on the left axis (linear), R on the right axis (log)
    const Ls = rows.map((r) => r.L * 1e6), Rs = rows.map((r) => Math.max(r.R, 1e-12));
    const lo = Math.min(...Ls, rows[0].L0 * 1e6) * 0.98, hi = Math.max(...Ls, rows[0].L0 * 1e6) * 1.02;
    const pyL = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    const rlo = Math.log10(Math.min(...Rs)) - 0.2, rhi = Math.log10(Math.max(...Rs)) + 0.2;
    const pyR = (v) => T + (1 - (Math.log10(v) - rlo) / (rhi - rlo || 1)) * (H - T - B);
    for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillStyle = '#1f5fbf'; ctx.fillText(v.toPrecision(4), 8, pyL(v) + 4); const rv = Math.pow(10, rlo + (k / 4) * (rhi - rlo)); ctx.fillStyle = '#e5484d'; ctx.fillText(sci(rv, 2), W - Rm + 6, pyR(rv) + 4); }
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#1f5fbf'; ctx.fillText('L (µH)', -16, 0); ctx.restore();
    ctx.save(); ctx.translate(W - 10, H / 2); ctx.rotate(Math.PI / 2); ctx.fillStyle = '#e5484d'; ctx.fillText('R_eddy (Ω)', -30, 0); ctx.restore();
    ctx.strokeStyle = '#999'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(L, pyL(rows[0].L0 * 1e6)); ctx.lineTo(W - Rm, pyL(rows[0].L0 * 1e6)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#5a5955'; ctx.fillText('empty coil L₀', L + 6, pyL(rows[0].L0 * 1e6) - 4);
    const line = (ys, color, py) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); rows.forEach((r, k) => { const X = px(Math.log10(r.f)), Y = py(ys[k]); if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }); ctx.stroke(); ctx.fillStyle = color; rows.forEach((r, k) => { ctx.beginPath(); ctx.arc(px(Math.log10(r.f)), py(ys[k]), 3, 0, 2 * PI); ctx.fill(); }); };
    line(Ls, '#1f5fbf', pyL); line(Rs, '#e5484d', pyR);
    // mark where a = delta
    const fd = rows.find((r) => r.delta <= this.p.a * 1e-3);
    if (fd) { ctx.strokeStyle = '#2a9d4b'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(px(Math.log10(fd.f)), T); ctx.lineTo(px(Math.log10(fd.f)), H - B); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#2a9d4b'; ctx.fillText('δ ≈ a', px(Math.log10(fd.f)) + 4, T + 12); }
  },

  sweepCSV() { return ['f_Hz,delta_m,L_H,L0_H,R_eddy_ohm,P_eddy_W', ...this.sweep.rows.map((r) => `${r.f},${r.delta},${r.L},${r.L0},${r.R},${r.P}`)].join('\n'); },
};
