// Boundary conditions at a plane interface (x = 0) between two media. A uniform field in
// medium 1 (x < 0) arrives at angle θ1 from the normal; the field in medium 2 (x > 0)
// follows from the boundary conditions, so the whole picture is closed form:
//   electric:  E_t continuous,  D_n continuous (+ρ_s)   ->  tan θ2 / tan θ1 = ε2 / ε1
//   magnetic:  H_t continuous (+K), B_n continuous      ->  tan θ2 / tan θ1 = μ2 / μ1
//   conductor (electric): E2 = 0, E1 normal to the surface, ρ_s = D1·n
// The bound surface charge (ρ_sb = (P1 − P2)·n) or magnetisation current is reported too.

import { EPS0, MU0 } from '../../core/constants.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween } from '../../core/render.js';
import { getNum } from '../state.js';
import { ui } from '../shell.js';

const L = 0.1;                    // half-width of the window (m)
const EXTENT = [-L, L, -L, L];
const GRID_N = 121;
const deg = Math.PI / 180;
const sci = (v, d = 4) => (Number.isFinite(v) ? v.toPrecision(d) : '—');

export default {
  id: 'interface',
  title: 'Interface',
  phase: 6,
  available: true,
  summary: 'Boundary conditions at a plane interface: tangential and normal components, refraction of field lines.',
  extent: EXTENT,
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V (or A_z)', kind: 'scalar', unit: 'V', signed: true, default: true },
    { id: 'Fmag', label: '|E| (or |B|)', kind: 'scalar', unit: 'V/m', log: false, eq: 'E' },
    { id: 'Fn', label: 'Normal component E_x (or B_x)', kind: 'scalar', unit: 'V/m', signed: true, eq: 'E' },
    { id: 'Ft', label: 'Tangential component E_y (or H_y)', kind: 'scalar', unit: 'V/m', signed: true, eq: 'E' },
    { id: 'E', label: 'E (or B) field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'D', label: 'D (or H) field', kind: 'vector', styles: ['arrows'], eq: 'D' },
    { id: 'P', label: 'P (or M) field', kind: 'vector', styles: ['arrows'], eq: 'P' },
    { id: 'Veq', label: 'Equipotentials (or A_z contours)', kind: 'contour', eq: 'V' },
  ],

  mode: 'electric',      // 'electric' | 'conductor' | 'magnetic'
  e1: 1, e2: 4,          // εr (or μr in magnetic mode)
  F1: 100,               // |E1| in V/m, or |B1| in µT
  th1: 40,               // degrees from the normal (x axis)
  rs: 0,                 // free surface charge density nC/m² (electric) or sheet current A/m (magnetic)

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.mode = ['electric', 'conductor', 'magnetic'].includes(s.mode) ? s.mode : 'electric';
    this.e1 = Math.max(1, getNum(s, 'e1', 1)); this.e2 = Math.max(1, getNum(s, 'e2', 4));
    this.F1 = getNum(s, 'F', 100); this.th1 = getNum(s, 'th', 40); this.rs = getNum(s, 'rs', 0);
    this.buildControls();
  },

  /** Solve the boundary conditions once; everything else is uniform fields. */
  solve() {
    const mag = this.mode === 'magnetic', cond = this.mode === 'conductor';
    const th1 = (cond ? 0 : this.th1) * deg;
    const F1 = mag ? this.F1 * 1e-6 : this.F1;                   // B1 in T, or E1 in V/m
    const k1 = mag ? MU0 * this.e1 : EPS0 * this.e1;             // μ1 or ε1
    const k2 = mag ? MU0 * this.e2 : EPS0 * this.e2;
    const F1n = F1 * Math.cos(th1), F1t = F1 * Math.sin(th1);    // normal = x, tangential = y
    let F2n, F2t, rs = 0;
    if (cond) {
      // perfect conductor on the right: E2 = 0; the free surface charge terminates D1
      F2n = 0; F2t = 0; rs = k1 * F1n;
    } else if (!mag) {
      // E_t continuous; D2n = D1n + ρs  (n from 1 to 2)
      rs = this.rs * 1e-9;
      F2t = F1t; F2n = (k1 * F1n + rs) / k2;
    } else {
      // B_n continuous; H2t = H1t - K  (sheet current K along z, n from 1 to 2)
      rs = this.rs;
      F2n = F1n; F2t = k2 * (F1t / k1 - rs);
    }
    const th2 = Math.atan2(F2t, F2n);
    this.sol = { mag, cond, th1, th2, F1n, F1t, F2n, F2t, k1, k2, rs,
      // bound surface charge (P1 - P2)·n, or magnetisation surface current (M1 - M2)×n -> z component
      bound: mag ? ((k1 / MU0 - 1) * F1t / k1 - (k2 / MU0 - 1) * F2t / k2) : ((k1 - EPS0) * F1n - (k2 - EPS0) * F2n),
      D1n: k1 * F1n, D2n: k2 * F2n };
    return this.sol;
  },

  /** Field at a point: [Fx, Fy] of E (or B), plus V (or A_z, continuous across the interface). */
  at(x, y) {
    const s = this.sol ?? this.solve();
    const left = x < 0;
    const Fx = left ? s.F1n : s.F2n, Fy = left ? s.F1t : s.F2t;
    // V = -∫E·dl from the origin, continuous at x = 0 because E_t is continuous
    let V;
    if (!s.mag) V = -(Fx * x + Fy * y);
    else V = Fx * y - Fy * x;  // A_z with B = curl(A_z ẑ): Bx = ∂A/∂y, By = -∂A/∂x
    return { F: [Fx, Fy], V, k: left ? s.k1 : s.k2 };
  },

  compute() {
    this.solve();
    const mk = () => new Grid2D(GRID_N, GRID_N, EXTENT);
    this.gridV = mk(); this.gridFx = mk(); this.gridFy = mk();
    for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
      const f = this.at(this.gridV.x(i), this.gridV.y(j));
      this.gridV.set(i, j, f.V); this.gridFx.set(i, j, f.F[0]); this.gridFy.set(i, j, f.F[1]);
    }
    this.gridFmag = magnitude(this.gridFx, this.gridFy);
    const s = this.sol;
    const m = Math.max(Math.hypot(s.F1n, s.F1t), Math.hypot(s.F2n, s.F2t)) || 1;
    this.fRange = [0, m];
    this.nRange = [-m, m];
    const vm = Math.max(...Array.from(this.gridV.data).map(Math.abs)) || 1;
    this.vRange = [-vm, vm];
    this.renderResults();
  },

  render(layer, ctx, view, opts) {
    const s = this.sol, fFn = (x, y) => this.at(x, y).F;
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? this.vRange[0], max: opts.max ?? this.vRange[1] });
      case 'Fmag': return drawScalarField(ctx, this.gridFmag, { map: opts.map, extent: opts.extent, min: opts.min ?? this.fRange[0], max: opts.max ?? this.fRange[1] });
      case 'Fn': return drawScalarField(ctx, this.gridFx, { map: opts.map, extent: opts.extent, min: opts.min ?? this.nRange[0], max: opts.max ?? this.nRange[1] });
      case 'Ft': {
        // Tangential component shown as E_y (electric) or H_y (magnetic): the one that is continuous
        const g = new Grid2D(GRID_N, GRID_N, EXTENT);
        for (let k = 0; k < g.data.length; k++) g.data[k] = s.mag ? this.gridFy.data[k] / (g.x(k % GRID_N) < 0 ? s.k1 : s.k2) : this.gridFy.data[k];
        const m = Math.max(...Array.from(g.data).map(Math.abs)) || 1;
        return drawScalarField(ctx, g, { map: opts.map, extent: opts.extent, min: opts.min ?? -m, max: opts.max ?? m });
      }
      case 'E':
        if (opts.style === 'lines') {
          // seed along the left edge (and the right edge, for lines that enter from there)
          const seeds = [];
          for (let k = 0; k < 22; k++) { const y = -L + (2 * L * (k + 0.5)) / 22; seeds.push([-L + 1e-4, y], [L - 1e-4, y]); }
          drawStreamlines(ctx, view, fFn, seeds, { maxSteps: 3000 });
        } else drawQuiver(ctx, view, fFn, { normalize: false, spacing: 26 });
        return null;
      case 'D': drawQuiver(ctx, view, (x, y) => { const f = this.at(x, y); return s.mag ? [f.F[0] / f.k, f.F[1] / f.k] : [f.F[0] * f.k, f.F[1] * f.k]; }, { normalize: false, spacing: 26, color: 'rgba(255,220,120,0.9)' }); return null;
      case 'P': drawQuiver(ctx, view, (x, y) => { const f = this.at(x, y); const fac = s.mag ? (f.k / MU0 - 1) / f.k : (f.k - EPS0); return [f.F[0] * fac, f.F[1] * fac]; }, { normalize: false, spacing: 26, color: 'rgba(160,255,160,0.9)' }); return null;
      case 'Veq': drawContours(ctx, view, this.gridV, levelsBetween(this.vRange[0], this.vRange[1], 20), { color: 'rgba(0,0,0,0.55)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const s = this.sol;
    const [px0] = view.toPx(0, 0);
    ctx.save();
    // the interface
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(px0, 0); ctx.lineTo(px0, view.height); ctx.stroke();
    ctx.setLineDash([]);
    // shade the conductor
    if (s.cond) { ctx.fillStyle = 'rgba(120,120,140,0.55)'; ctx.fillRect(px0, 0, view.width - px0, view.height); }
    // labels
    ctx.font = 'bold 14px system-ui';
    const sym = s.mag ? 'μr' : 'εr';
    const haloText = (t, x, y) => { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(t, x, y); ctx.fillStyle = '#111'; ctx.fillText(t, x, y); };
    haloText(`medium 1: ${sym} = ${this.e1}`, 12, 22);
    ctx.textAlign = 'right';
    haloText(s.cond ? 'perfect conductor' : `medium 2: ${sym} = ${this.e2}`, view.width - 12, 22);
    ctx.textAlign = 'start';
    // the field direction through the origin, and the angle each ray makes with the normal:
    // θ1 between the incoming ray (lower left, direction −E1) and the −x normal, θ2 between
    // the outgoing ray (direction E2) and the +x normal
    const [ox, oy] = view.toPx(0, 0);
    const ray = (dx, dy, color) => { ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + 90 * dx, oy - 90 * dy); ctx.stroke(); };
    const arc = (base, th, color, label, lx, ly) => {
      const r = 40;
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
      ctx.arc(ox, oy, r, -base, -(base + th), th > 0); // canvas angles run clockwise: negate world angles
      ctx.stroke();
      ctx.font = 'bold 14px system-ui'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(label, ox + lx, oy + ly);
      ctx.fillStyle = color; ctx.fillText(label, ox + lx, oy + ly);
    };
    if (!s.cond) {
      ray(-Math.cos(s.th1), -Math.sin(s.th1), '#b45309'); ray(Math.cos(s.th2), Math.sin(s.th2), '#1e3a8a');
      arc(Math.PI, s.th1, '#b45309', `θ1 = ${(s.th1 / deg).toFixed(1)}°`, -120, 60);
      arc(0, s.th2, '#1e3a8a', `θ2 = ${(s.th2 / deg).toFixed(1)}°`, 48, -48);
    } else ray(-1, 0, '#b45309');
    // the normal
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(ox - 70, oy); ctx.lineTo(ox + 70, oy); ctx.stroke();
    ctx.restore();
  },

  statusText() {
    const s = this.sol;
    if (!s) return '';
    if (s.cond) return `conductor: E inside = 0, ρs = D1·n = ${sci(s.rs, 3)} C/m²`;
    return `tan θ2 / tan θ1 = ${sci(Math.tan(s.th2) / Math.tan(s.th1) || 0, 3)} = ${s.mag ? 'μ2/μ1' : 'ε2/ε1'} = ${sci(this.e2 / this.e1, 3)} (with ${s.mag ? 'K' : 'ρs'} = 0)`;
  },

  probe(x, y) {
    const f = this.at(x, y), s = this.sol;
    const u = s.mag ? 'T' : 'V/m';
    const rows = [
      { label: s.mag ? 'A_z' : 'V', value: f.V, unit: s.mag ? 'T·m' : 'V' },
      { label: s.mag ? 'B_x (normal)' : 'E_x (normal)', value: f.F[0], unit: u },
      { label: s.mag ? 'B_y (tangential)' : 'E_y (tangential)', value: f.F[1], unit: u },
    ];
    if (s.mag) rows.push({ label: 'H_x', value: f.F[0] / f.k, unit: 'A/m' }, { label: 'H_y (continuous)', value: f.F[1] / f.k, unit: 'A/m' });
    else rows.push({ label: 'D_x (continuous)', value: f.F[0] * f.k, unit: 'C/m²' }, { label: 'D_y', value: f.F[1] * f.k, unit: 'C/m²' });
    rows.push({ label: 'medium', value: x < 0 ? 1 : 2, unit: '' });
    return rows;
  },

  getState() { return { mode: this.mode, e1: this.e1, e2: this.e2, F: this.F1, th: this.th1, rs: this.rs }; },

  csv() {
    const s = this.sol, lines = [s.mag ? 'x_m,y_m,Az_Tm,Bx_T,By_T,mu_r' : 'x_m,y_m,V_V,Ex_Vpm,Ey_Vpm,eps_r'];
    for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
      const x = this.gridV.x(i), y = this.gridV.y(j), f = this.at(x, y);
      lines.push(`${x},${y},${f.V},${f.F[0]},${f.F[1]},${f.k / (s.mag ? MU0 : EPS0)}`);
    }
    return lines.join('\n');
  },

  renderResults() {
    if (!this.resultsEl || !this.sol) return;
    const s = this.sol, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    const u = s.mag ? 'T' : 'V/m';
    row(`θ1, θ2 (from the normal)`, `${(s.th1 / deg).toFixed(1)}°, ${(s.th2 / deg).toFixed(1)}°`);
    row(s.mag ? '|B1|, |B2|' : '|E1|, |E2|', `${sci(Math.hypot(s.F1n, s.F1t))}, ${sci(Math.hypot(s.F2n, s.F2t))} ${u}`);
    if (s.mag) {
      row('B_n (continuous)', `${sci(s.F1n)} → ${sci(s.F2n)} T`);
      row('H_t', `${sci(s.F1t / s.k1)} → ${sci(s.F2t / s.k2)} A/m${this.rs ? ' (jump = K)' : ' (continuous)'}`);
      row('magnetisation current (M1−M2)×n', `${sci(s.bound)} A/m`);
    } else {
      row('E_t (continuous)', `${sci(s.F1t)} → ${sci(s.F2t)} V/m`);
      row('D_n', `${sci(s.D1n)} → ${sci(s.D2n)} C/m²${s.cond || this.rs ? ' (jump = ρs)' : ' (continuous)'}`);
      if (s.cond) row('free surface charge ρs', `${sci(s.rs)} C/m²`);
      row('bound surface charge (P1−P2)·n', `${sci(s.bound)} C/m²`);
    }
  },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Interface'));
    box.appendChild(ui.lead(shell, 'A uniform field meets a plane interface: which components are continuous, and how the field lines bend.'));
    const re = () => { shell.recompute(); shell.syncUrl(); };
    box.appendChild(ui.field('Case', ui.select([['electric', 'Dielectric – dielectric (E, D, P)'], ['conductor', 'Dielectric – perfect conductor'], ['magnetic', 'Magnetic – magnetic (B, H, M)']], this.mode, (v) => { this.mode = v; this.buildControls(); re(); })));
    const mag = this.mode === 'magnetic', cond = this.mode === 'conductor';
    const sym = mag ? 'μr' : 'εr';
    const r1 = ui.el('div', 'row');
    r1.appendChild(ui.field(`${sym} of medium 1 (left)`, ui.number(this.e1, { min: 1, max: 1e4, onChange: (v) => { this.e1 = Math.max(1, v); re(); } })));
    if (!cond) r1.appendChild(ui.field(`${sym} of medium 2 (right)`, ui.number(this.e2, { min: 1, max: 1e4, onChange: (v) => { this.e2 = Math.max(1, v); re(); } })));
    box.appendChild(r1);
    const r2 = ui.el('div', 'row');
    r2.appendChild(ui.field(mag ? '|B1| in medium 1 (µT)' : '|E1| in medium 1 (V/m)', ui.number(this.F1, { min: 0, max: 1e6, onChange: (v) => { this.F1 = v; re(); } })));
    if (!cond) r2.appendChild(ui.field('θ1 from the normal (°)', ui.number(this.th1, { min: -89, max: 89, onChange: (v) => { this.th1 = Math.max(-89, Math.min(89, v)); re(); } })));
    box.appendChild(r2);
    if (cond) box.appendChild(ui.el('p', 'hint', 'At a perfect conductor the tangential E must vanish, so the field in medium 1 is forced normal to the surface (θ1 = 0) and D1·n is terminated by free surface charge.'));
    else {
      box.appendChild(ui.field(mag ? 'Sheet current K on the interface (A/m, along z)' : 'Free surface charge ρs on the interface (nC/m²)', ui.number(this.rs, { onChange: (v) => { this.rs = v; re(); } })));
      box.appendChild(ui.el('p', 'hint', mag
        ? 'B_n is continuous; H_t jumps by K. With K = 0 the lines refract by tan θ2 / tan θ1 = μ2/μ1: a high-μ medium pulls B nearly parallel to its surface.'
        : 'E_t is continuous; D_n jumps by ρs. With ρs = 0 the lines refract by tan θ2 / tan θ1 = ε2/ε1, and the bound charge (P1 − P2)·n is what bends them.'));
    }
    box.appendChild(ui.el('h2', '', 'Boundary conditions'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    this.renderResults();
  },
};
