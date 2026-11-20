// Vector calculus tab: a scalar field and its gradient; a path you draw by clicking; the line
// integral ∫F·dl along it compared with V(start) − V(end) for a gradient field, or the
// circulation for a non-conservative one; the polar/cylindrical unit vectors at the probe and
// the field's components in them. Closed form + quadrature (core/vectorcalc.js).

import { PI } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawContours, levelsBetween } from '../../core/render.js';
import { SCALARS, VECTORS, lineIntegral, pathLength, circulationCircle, unitVectors, toPolar } from '../../core/vectorcalc.js';
import { getNum, getStr, getList } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame } from '../views.js';

const N = 161, EXTENT = [-2, 2, -1.5, 1.5];

export default {
  id: 'vector-calculus',
  title: 'Gradient and line integrals',
  phase: 8,
  available: true,
  summary: 'The gradient as a field, line integrals along a path you draw, path independence for gradient fields against circulation for non-conservative ones, and the polar unit vectors at a point.',
  extent: EXTENT,
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'the scalar field V', kind: 'scalar', unit: '', signed: true, default: true, eq: 'V' },
    { id: 'Fmag', label: '|F|', kind: 'scalar', unit: '', log: true, eq: 'F' },
    { id: 'F', label: 'F arrows (= −∇V for the gradient fields)', kind: 'vector', styles: ['arrows'], default: true, eq: 'F' },
    { id: 'Vc', label: 'level curves of V (F is normal to them)', kind: 'contour', default: true, eq: 'V' },
    { id: 'path', label: 'the path and the running integral', kind: 'info', default: true, eq: 'line' },
    { id: 'basis', label: 'r̂ and φ̂ at the probe', kind: 'info', default: true, eq: 'basis' },
  ],

  init(shell) {
    this.shell = shell; const s = shell.state;
    this.field = VECTORS[getStr(s, 'vc_f', 'pointCharge')] ? getStr(s, 'vc_f', 'pointCharge') : 'pointCharge';
    const pl = getList(s, 'vc_path', null); this.path = pl ? [] : [[-1.2, -0.8], [0.6, -0.9], [1.2, 0.9]];
    if (pl) for (let i = 0; i + 1 < pl.length; i += 2) this.path.push([+pl[i], +pl[i + 1]]);
    this.views = [plotView('along', '∫F·dl along the path', (ctx, w, h) => this.drawAlong(ctx, w, h))];
    this.shell.setExtent(EXTENT, ['x', 'y']);
    if (Math.abs(shell.probePt[0]) < 1e-12 && Math.abs(shell.probePt[1]) < 1e-12) { shell.probePt = [0.8, 0.6]; shell.$('probe-x').value = '0.8'; shell.$('probe-y').value = '0.6'; }
    this.buildControls();
  },
  vf() { return VECTORS[this.field]; },
  compute() {
    const v = this.vf(), E = EXTENT;
    this.gridV = v.V ? Grid2D.fromFunction(N, N, E, (x, y) => v.V(x, y)) : null;
    this.gridF = Grid2D.fromFunction(N, N, E, (x, y) => Math.hypot(...v.F(x, y)));
    if (this.gridV) { const vs = Array.from(this.gridV.data).map(Math.abs).filter(Number.isFinite).sort((a, b) => a - b); this.vMax = vs[Math.floor(0.95 * vs.length)] || 1; }
    const I = this.path.length > 1 ? lineIntegral(v.F, this.path, 400) : 0, a = this.path[0], b = this.path[this.path.length - 1];
    const dV = v.V && a && b ? v.V(...a) - v.V(...b) : NaN, closed = a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
    this.results = { I, dV, closed, len: pathLength(this.path), circ: circulationCircle(v.F, 0, 0, 1), circOff: circulationCircle(v.F, 1.2, 0.6, 0.3) };
    this.renderResults();
  },
  render(layer, ctx, view, opts) {
    const v = this.vf();
    switch (layer) {
      case 'V': if (!this.gridV) return null; return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? -this.vMax, max: opts.max ?? this.vMax });
      case 'Fmag': { const a = Array.from(this.gridF.data).filter((x) => x > 0).sort((p, q) => p - q); return drawScalarField(ctx, this.gridF, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? a[Math.floor(0.05 * a.length)], max: opts.max ?? a[Math.floor(0.97 * a.length)] }); }
      case 'F': drawQuiver(ctx, view, (x, y) => v.F(x, y), { normalize: true }); return null;
      case 'Vc': if (this.gridV) drawContours(ctx, view, this.gridV, levelsBetween(-this.vMax, this.vMax, 16), { color: 'rgba(255,255,255,0.65)', lineWidth: 1 }); return null;
      default: return null;
    }
  },
  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    const v = this.vf(), H = view.height;
    ctx.save(); ctx.font = 'bold 12px system-ui'; ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 4; // dark text: the default colour map here is light
    if (this.shell.layerOn.get('path') && this.path.length) {
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 3; ctx.beginPath();
      this.path.forEach(([x, y], i) => { const [px, py] = view.toPx(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke();
      this.path.forEach(([x, y], i) => { const [px, py] = view.toPx(x, y); ctx.fillStyle = i === 0 ? '#2a9d4b' : i === this.path.length - 1 ? '#e5484d' : '#ffd166'; ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * PI); ctx.fill(); });
      // running integral labels at the vertices
      let acc = 0; ctx.fillStyle = '#7a5a00';
      for (let k = 1; k < this.path.length; k++) { acc += lineIntegral(v.F, [this.path[k - 1], this.path[k]], 400); const [px, py] = view.toPx(...this.path[k]); ctx.fillText(sci(acc, 3), px + 8, py - 8); }
      const [px0, py0] = view.toPx(...this.path[0]); ctx.fillStyle = '#2a9d4b'; ctx.fillText('a', px0 + 8, py0 - 8);
      ctx.fillStyle = '#222';
      ctx.fillText(v.conservative ? `∫F·dl along the path = ${sci(r.I, 4)};  V(a) − V(b) = ${sci(r.dV, 4)}  (equal: the path does not matter)` : `∫F·dl along the path = ${sci(r.I, 4)}; this field is not a gradient, so another path gives another value`, 10, H - 28);
      ctx.fillText('click to add points to the path; Shift-click to start over', 10, H - 10);
    }
    if (this.shell.layerOn.get('basis')) {
      const [x, y] = this.shell.probePt, u = unitVectors(x, y), [px, py] = view.toPx(x, y), L = 36;
      const arrow = (dx, dy, color, label) => { ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + L * dx, py - L * dy); ctx.stroke(); ctx.fillText(label, px + L * dx + 4, py - L * dy + 4); };
      arrow(u.rhat[0], u.rhat[1], '#0a7a5a', 'r̂'); arrow(u.phihat[0], u.phihat[1], '#b8008a', 'φ̂');
      const [fx, fy] = v.F(x, y), pol = toPolar(fx, fy, x, y);
      ctx.fillStyle = '#222'; ctx.fillText(`at the probe: r = ${sci(u.r, 3)}, φ = ${((180 / PI) * u.phi).toFixed(1)}°; F = ${sci(pol.Fr, 3)} r̂ + ${sci(pol.Fphi, 3)} φ̂`, 10, 18);
    }
    ctx.restore();
  },
  onPointer(type, x, y, e) {
    if (type !== 'down') return false;
    if (e?.shiftKey) this.path = [[x, y]]; else this.path.push([+x.toPrecision(4), +y.toPrecision(4)]);
    this.compute(); this.shell.redrawOverlay(); this.shell.refreshStatus(); this.shell.updateStageView(); this.shell.syncUrl();
    return true;
  },
  drawAlong(ctx, W, H) {
    if (!this.results) this.compute();
    const v = this.vf(), pts = this.path; if (pts.length < 2) { ctx.fillStyle = '#5a5955'; ctx.font = '12px system-ui'; ctx.fillText('Add at least two points to the path.', 20, 30); return; }
    const n = 400, ss = [], Ft = [], acc = [], Vs = [], total = pathLength(pts); let s = 0, run = 0;
    for (let k = 0; k + 1 < pts.length; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], L = Math.hypot(x1 - x0, y1 - y0), m = Math.max(2, Math.round((n * L) / total)); for (let i = 0; i < m; i++) { const t = (i + 0.5) / m, x = x0 + t * (x1 - x0), y = y0 + t * (y1 - y0), [fx, fy] = v.F(x, y), ft = (fx * (x1 - x0) + fy * (y1 - y0)) / L; s += L / m; run += ft * (L / m); ss.push(s); Ft.push(ft); acc.push(run); Vs.push(v.V ? v.V(...pts[0]) - v.V(x, y) : NaN); } }
    const m1 = Math.max(...Ft.map(Math.abs)) || 1, m2 = Math.max(...acc.map(Math.abs), ...Vs.filter(Number.isFinite).map(Math.abs)) || 1;
    const A = axesFrame(ctx, W, H, { lo: -1.1, hi: 1.1, a0: 0, a1: total, xlabel: 'distance along the path s', ylabel: 'normalised', top: 76, fmt: (v2) => v2.toFixed(2) });
    A.hline(0, '#bbb', ''); A.line(ss, Ft.map((x) => x / m1), '#1f5fbf', [4, 3]); A.line(ss, acc.map((x) => x / m2), '#e5484d'); if (v.V) A.line(ss, Vs.map((x) => x / m2), '#2a9d4b', [2, 3]);
    let sAcc = 0; for (let k = 1; k + 1 < pts.length; k++) { sAcc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); A.vline(sAcc, '#ffd166', ''); }
    const y = A.legend([[`F · t̂ (tangential component) / ${sci(m1, 3)}`, '#1f5fbf', [4, 3]], [`running ∫F·dl / ${sci(m2, 3)}`, '#e5484d'], ...(v.V ? [[`V(a) − V(s) / ${sci(m2, 3)}`, '#2a9d4b', [2, 3]]] : [])]);
    A.caption(v.conservative ? 'The running integral of a gradient field is exactly V(a) − V(s) at every point of the path: the red and green curves coincide. The tangential component changes sign where the path crosses level curves the other way; the area under it is what accumulates.' : 'For a non-conservative field the running integral has no potential to track: it depends on the route, and a closed loop around the right region leaves a net circulation. For the wire field the loop integral is 2π if the loop encloses the origin and 0 otherwise.', y);
  },
  statusText() { const r = this.results; if (!r) return ''; const v = this.vf(); return `${v.label} · ∫F·dl = ${sci(r.I, 4)} over ${sci(r.len, 3)} of path${v.conservative ? ` = V(a) − V(b) = ${sci(r.dV, 4)}` : ` · circulation around the unit circle ${sci(r.circ, 4)}, around a circle away from the origin ${sci(r.circOff, 4)}`}`; },
  probe(x, y) { const v = this.vf(), [fx, fy] = v.F(x, y), pol = toPolar(fx, fy, x, y); return [...(v.V ? [{ label: 'V', value: v.V(x, y), unit: '' }] : []), { label: 'F_x, F_y', value: fx, unit: '', note: `F_y = ${sci(fy, 3)}` }, { label: 'F_r, F_φ (polar)', value: pol.Fr, unit: '', note: `F_φ = ${sci(pol.Fphi, 3)}` }, { label: '|F|', value: Math.hypot(fx, fy), unit: '' }]; },
  getState() { return { vc_f: this.field, vc_path: this.path.flat().map((v) => +v.toPrecision(4)).join(',') }; },
  csv() { const g = this.gridF, lines = ['x,y,V,Fmag']; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${this.gridV ? this.gridV.get(i, j) : ''},${g.get(i, j)}`); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Gradient and line integrals'));
    box.appendChild(ui.lead(shell, 'The gradient turns a scalar field into a vector field pointing uphill; the line integral turns a vector field back into a number along a path, and for a gradient field that number only depends on the ends.'));
    box.appendChild(ui.el('h2', '', 'Field'));
    box.appendChild(ui.field('F', ui.select(Object.entries(VECTORS).map(([k, v]) => [k, v.label]), this.field, (v) => { this.field = v; shell.recompute(); shell.updateStageView(); shell.syncUrl(); this.buildControls(); })));
    const v = this.vf();
    box.appendChild(ui.el('p', 'hint', v.conservative ? 'A gradient field: E = −∇V points downhill in V, is normal to the level curves, and ∫E·dl between two points is V(start) − V(end) whatever the path. Draw two different paths between the same points and compare.' : v.curl ? `Not a gradient field: curl ${v.curl()}. The line integral depends on the path, and around a closed loop it equals curl × area (Stokes). Draw a loop.` : 'The field of a straight wire: curl-free everywhere except on the wire, so a loop that does not enclose the wire gives 0 while any loop around it gives 2π (Ampère). Draw both.'));
    box.appendChild(ui.el('h2', '', 'Path'));
    box.appendChild(ui.el('p', 'hint', `${this.path.length} point${this.path.length === 1 ? '' : 's'}. Click the picture to add a point, Shift-click to start a new path there.`));
    const row = ui.el('div', 'row'); row.append(ui.button('Close the loop', () => { if (this.path.length > 2) { this.path.push([...this.path[0]]); shell.recompute(); shell.updateStageView(); shell.syncUrl(); this.buildControls(); } }, 'btn btn-small'), ui.button('Clear', () => { this.path = []; shell.recompute(); shell.updateStageView(); shell.syncUrl(); this.buildControls(); }, 'btn btn-small'), ui.button('Unit circle', () => { this.path = []; for (let k = 0; k <= 36; k++) this.path.push([+Math.cos((2 * PI * k) / 36).toPrecision(4), +Math.sin((2 * PI * k) / 36).toPrecision(4)]); shell.recompute(); shell.updateStageView(); shell.syncUrl(); this.buildControls(); }, 'btn btn-small')); box.appendChild(row);
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Along the path', () => { shell.setStageView('along'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Field', () => { shell.setStageView('field'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, v = this.vf(), tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('∫F·dl along the path', sci(r.I, 5)); row('path length', sci(r.len, 4));
    if (v.conservative) { row('V(a) − V(b)', sci(r.dV, 5)); row('difference', sci(r.I - r.dV, 3)); }
    if (r.closed) row('closed loop', v.conservative ? 'should be 0 for a gradient field' : `circulation; Stokes: ∮F·dl = ∬(∇×F)·dA`);
    row('circulation around the unit circle (numeric)', sci(r.circ, 5)); row('around a circle of radius 0.3 at (1.2, 0.6)', sci(r.circOff, 5));
  },
};
