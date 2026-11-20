// Electric dipole tab: the pair ±q a distance s apart against the ideal point dipole p = qs;
// the 1/r³ law and the 2:1 axis/broadside ratio; the dipole in a uniform field with its torque
// and energy against angle. Closed form (core/dipole.js).

import { PI } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawContours, levelsBetween } from '../../core/render.js';
import { exactField, exactPotential, idealField, idealPotential, idealAxisBroadside, inUniformField, idealError, totalField, totalPotential } from '../../core/dipole.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame } from '../views.js';

const N = 161;

export default {
  id: 'dipole',
  title: 'Electric dipole',
  phase: 8,
  available: true,
  summary: 'The electric dipole: the ±q pair against the ideal point dipole, the 1/r³ field with its 2:1 axis-to-broadside ratio, and a dipole in a uniform field: torque p × E and energy −p·E.',
  extent: [-0.2, 0.2, -0.15, 0.15],
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'V', kind: 'scalar', unit: 'V', signed: true, default: true, eq: 'V' },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'E', label: 'E arrows', kind: 'vector', styles: ['arrows'], default: true },
    { id: 'Vc', label: 'equipotentials', kind: 'contour', default: true, eq: 'V' },
    { id: 'ideal', label: 'ideal-dipole equipotentials (dashed) for comparison', kind: 'contour', eq: 'ideal' },
  ],
  pDefaults: { q: 1, s: 20, span: 0.15, theta: 30, E0: 0 }, // nC, mm, m, degrees, V/m (background field, x̂)

  init(shell) {
    this.shell = shell; const st = shell.state;
    this.mode = getStr(st, 'dp_mode', 'free'); this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(st, `dp_${k}`, this.p[k]);
    this.views = [plotView('falloff', '|E| against distance', (ctx, w, h) => this.drawFalloff(ctx, w, h)), plotView('torque', 'Torque and energy against angle', (ctx, w, h) => this.drawTorque(ctx, w, h))];
    this.build();
    if (Math.abs(shell.probePt[0]) < 1e-12 && Math.abs(shell.probePt[1]) < 1e-12) { shell.probePt = [0.05, 0.05]; shell.$('probe-x').value = '0.05'; shell.$('probe-y').value = '0.05'; }
    this.buildControls();
  },
  q() { return this.p.q * 1e-9; }, s() { return this.p.s * 1e-3; }, pm() { return this.q() * this.s(); }, th() { return this.mode === 'field' ? (this.p.theta * PI) / 180 : PI / 2; },
  build() { const L = this.p.span; this.extent = [-(4 / 3) * L, (4 / 3) * L, -L, L]; this.shell.setExtent(this.extent, ['x', 'y']); this.results = null; },
  fieldFn() { const q = this.q(), s = this.s(); return this.mode === 'field' ? (x, y) => totalField(q, s, this.th(), this.p.E0, x, y) : (x, y) => exactField(q, s, x, y); },
  potFn() { const q = this.q(), s = this.s(); return this.mode === 'field' ? (x, y) => totalPotential(q, s, this.th(), this.p.E0, x, y) : (x, y) => exactPotential(q, s, x, y); },
  compute() {
    const E = this.extent, f = this.fieldFn(), v = this.potFn();
    this.gridV = Grid2D.fromFunction(N, N, E, v); this.gridE = Grid2D.fromFunction(N, N, E, (x, y) => Math.hypot(...f(x, y)));
    this.gridVi = Grid2D.fromFunction(N, N, E, (x, y) => idealPotential(this.pm(), x, y));
    const vs = Array.from(this.gridV.data).map(Math.abs).sort((a, b) => a - b); this.vMax = vs[Math.floor(0.95 * vs.length)];
    const p = this.pm(), r = 5 * this.s(), err = idealError(this.q(), this.s(), r), uf = inUniformField(p, this.th(), this.p.E0);
    this.results = { p, r, err, uf, ab: idealAxisBroadside(p, r) };
    this.renderResults();
  },
  render(layer, ctx, view, opts) {
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? -this.vMax, max: opts.max ?? this.vMax });
      case 'Emag': { const a = Array.from(this.gridE.data).filter((x) => x > 0).sort((p, q) => p - q); return drawScalarField(ctx, this.gridE, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? a[Math.floor(0.05 * a.length)], max: opts.max ?? a[Math.floor(0.97 * a.length)] }); }
      case 'E': drawQuiver(ctx, view, this.fieldFn(), { normalize: true }); return null;
      case 'Vc': drawContours(ctx, view, this.gridV, levelsBetween(-this.vMax, this.vMax, 18), { color: 'rgba(255,255,255,0.7)', lineWidth: 1 }); return null;
      case 'ideal': drawContours(ctx, view, this.gridVi, levelsBetween(-this.vMax, this.vMax, 18), { color: 'rgba(255,215,0,0.9)', lineWidth: 1.2, dash: [4, 3] }); return null;
      default: return null;
    }
  },
  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    const s = this.s(), th = this.th(), cx = (s / 2) * Math.cos(th), cy = (s / 2) * Math.sin(th);
    ctx.save(); ctx.font = '12px system-ui'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    for (const sg of [1, -1]) { const [x, y] = view.toPx(sg * cx, sg * cy); ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * PI); ctx.fillStyle = sg > 0 ? '#e5484d' : '#1f5fbf'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    const [x0, y0] = view.toPx(-cx, -cy), [x1, y1] = view.toPx(cx, cy); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(`p = q s = ${sci(r.p, 3)} C·m${this.mode === 'field' ? `, θ = ${this.p.theta}° from E₀ = ${sci(this.p.E0, 3)} V/m (x̂)` : ' (along +y)'}`, 10, 18);
    if (this.mode === 'field') { const [ax, ay] = view.toPx(0, 0), R = Math.hypot(x1 - ax, y1 - ay) + 16, a0 = -th, a1 = 0; if (Math.abs(th) > 1e-6 && Math.abs(Math.abs(th) - PI) > 1e-6) { ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, R, a0, a1, th < 0); ctx.stroke(); const tipA = a1, tx = ax + R * Math.cos(tipA), ty = ay + R * Math.sin(tipA), dir = th > 0 ? 1 : -1; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 8, ty - dir * 9); ctx.lineTo(tx + 8, ty - dir * 9); ctx.closePath(); ctx.fillStyle = '#06d6a0'; ctx.fill(); } ctx.fillStyle = '#06d6a0'; ctx.fillText(`τ = ${sci(r.uf.torque, 3)} N·m (${r.uf.torque < 0 ? 'turning p toward E₀, clockwise' : 'turning p toward E₀, counter-clockwise'}), U = −p·E = ${sci(r.uf.U, 3)} J`, 10, view.height - 10); }
    else ctx.fillText(`at r = 5 s = ${sci(r.r, 3)} m the ideal dipole is off by ${(100 * r.err.axis).toFixed(2)} % on the axis and ${(100 * r.err.broadside).toFixed(2)} % broadside`, 10, view.height - 10);
    ctx.restore();
  },
  drawFalloff(ctx, W, H) {
    if (!this.results) this.compute();
    const q = this.q(), s = this.s(), p = this.pm(), n = 200, rs = [], ax = [], br = [], iax = [], ibr = [], mono = [];
    for (let i = 0; i < n; i++) { const r = s * Math.pow(50, i / (n - 1)) * 0.6; rs.push(r / s); ax.push(Math.hypot(...exactField(q, s, 0, r))); br.push(Math.hypot(...exactField(q, s, r, 0))); const id = idealAxisBroadside(p, r); iax.push(id.axis); ibr.push(id.broadside); mono.push((8.9875517923e9 * q) / (r * r)); }
    const A = axesFrame(ctx, W, H, { lo: Math.min(...ibr) * 0.5, hi: Math.max(...ax) * 2, a0: rs[0], a1: rs[n - 1], xlabel: 'distance from the centre, r / s (log)', ylabel: '|E| (V/m, log)', logx: true, logy: true, top: 90 });
    A.line(rs, mono, '#aaa', [2, 3], 1); A.line(rs, iax, '#e5484d', [5, 4], 1.5); A.line(rs, ibr, '#1f5fbf', [5, 4], 1.5); A.line(rs, ax, '#e5484d'); A.line(rs, br, '#1f5fbf');
    const y = A.legend([['exact pair, on the axis', '#e5484d'], ['exact pair, broadside', '#1f5fbf'], ['ideal dipole 2Kp/r³', '#e5484d', [5, 4]], ['ideal dipole Kp/r³', '#1f5fbf', [5, 4]], ['a single charge Kq/r² for comparison', '#aaa', [2, 3]]]);
    A.caption('Close to the pair the field is that of whichever charge is nearer (1/r²); beyond a few s the two nearly cancel and what survives falls as 1/r³, twice as strong on the axis as broadside. The ideal dipole is the r ≫ s limit; the slope on log axes is −3 against −2 for a single charge.', y);
  },
  drawTorque(ctx, W, H) {
    const p = this.pm(), E0 = this.mode === 'field' ? this.p.E0 : 1e4, n = 181, th = [], tq = [], U = [];
    for (let i = 0; i < n; i++) { const t = (i * 2 * PI) / (n - 1), r = inUniformField(p, t, E0); th.push((t * 180) / PI); tq.push(r.torque); U.push(r.U); }
    const m = p * E0 || 1;
    const A = axesFrame(ctx, W, H, { lo: -1.1, hi: 1.1, a0: 0, a1: 360, xlabel: 'angle θ between p and E (degrees)', ylabel: 'normalised to pE', top: 76, xticks: 6, fmt: (v) => (Number.isInteger(v) ? `${v}` : v.toFixed(1)) });
    A.hline(0, '#bbb', ''); A.line(th, tq.map((v) => v / m), '#e5484d'); A.line(th, U.map((v) => v / m), '#1f5fbf', [5, 4]);
    if (this.mode === 'field') A.vline(((this.p.theta % 360) + 360) % 360, '#06d6a0', `θ = ${this.p.theta}°`);
    const y = A.legend([[`torque τ_z = −pE sinθ (pE = ${sci(m, 3)} N·m)`, '#e5484d'], ['energy U = −pE cosθ', '#1f5fbf', [5, 4]]]);
    A.caption('The torque is restoring: it is zero aligned (stable, U minimum) and anti-aligned (unstable, U maximum) and largest at 90°. τ = −dU/dθ. In a uniform field there is no net force; a gradient gives F = (p·∇)E, which is how a comb picks up paper.', y);
  },
  statusText() { const r = this.results; if (!r) return ''; return `p = ${sci(r.p, 4)} C·m · ideal vs exact at r = 5 s: ${(100 * r.err.axis).toFixed(2)} % (axis), ${(100 * r.err.broadside).toFixed(2)} % (broadside)${this.mode === 'field' ? ` · τ = ${sci(r.uf.torque, 4)} N·m, U = ${sci(r.uf.U, 4)} J` : ''}`; },
  probe(x, y) { const f = this.fieldFn()(x, y), id = idealField(this.pm(), x, y), r = Math.hypot(x, y); return [{ label: 'V', value: this.potFn()(x, y), unit: 'V' }, { label: '|E| (exact)', value: Math.hypot(...f), unit: 'V/m' }, { label: '|E| ideal dipole', value: Math.hypot(...id), unit: 'V/m', note: this.mode === 'field' ? 'pair alone, along y' : `r/s = ${(r / this.s()).toFixed(2)}` }, { label: 'θ from the axis', value: (Math.atan2(Math.abs(x), y) * 180) / PI, unit: '°' }]; },
  getState() { const s = { dp_mode: this.mode }; for (const [k, v] of Object.entries(this.p)) s[`dp_${k}`] = v; return s; },
  csv() { const g = this.gridV, lines = ['x_m,y_m,V_V,Emag_Vpm']; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridE.get(i, j)}`); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Electric dipole'));
    box.appendChild(ui.lead(shell, 'Two equal and opposite charges a small distance apart: the simplest neutral object with a field, and the building block of every dielectric.'));
    const re = () => { this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Dipole'));
    box.appendChild(ui.field('Situation', ui.select([['free', 'the pair alone (axis along y)'], ['field', 'the pair in a uniform field E₀ (x̂)']], this.mode, (v) => { this.mode = v; if (v === 'field' && !p.E0) p.E0 = 1e4; re(); })));
    row(pf('q', 'q (nC)', -100, 100), pf('s', 'separation s (mm)', 0.1, 200), pf('span', 'Picture half-height (m)', 0.01, 2));
    if (this.mode === 'field') row(pf('theta', 'Angle of p from E₀ (degrees)', -180, 180, () => { shell.recompute(); shell.updateStageView(); shell.syncUrl(); }), pf('E0', 'E₀ (V/m)', 0, 1e7));
    box.appendChild(ui.el('p', 'hint', this.mode === 'free' ? 'Turn on the dashed ideal-dipole equipotentials: they match the pair’s beyond a few s and part company inside, where the pair is really two charges. Shrink s and the match extends inward; p = qs is all that survives.' : 'The torque p × E tries to line p up with E₀; the field picture shows the two charges pulled opposite ways. In a uniform field the pulls cancel: a dipole feels a torque, not a force.'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('|E| against distance', () => { shell.setStageView('falloff'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Torque and energy', () => { shell.setStageView('torque'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Field', () => { shell.setStageView('field'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('dipole moment p = q s', `${sci(r.p, 4)} C·m`); row(`ideal |E| at r = 5 s = ${sci(r.r, 3)} m`, `axis 2Kp/r³ = ${sci(r.ab.axis, 4)} V/m, broadside Kp/r³ = ${sci(r.ab.broadside, 4)} V/m`);
    row('exact pair vs ideal there', `${(100 * r.err.axis).toFixed(3)} % (axis, +½(s/r)²), ${(100 * r.err.broadside).toFixed(3)} % (broadside, −⅜(s/r)²)`);
    if (this.mode === 'field') { row('torque τ = p × E', `${sci(r.uf.torque, 4)} N·m`); row('energy U = −p·E', `${sci(r.uf.U, 4)} J`); row('force in a uniform field', '0 (the two pulls cancel)'); }
  },
};
