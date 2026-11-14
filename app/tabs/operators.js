// Operators tab: divergence and curl as what they are defined to be. A library of 2-D
// vector fields painted with their div and curl; at the probe point a small box and a small
// loop whose flux per area and circulation per area are summed numerically and compared with
// ∇·F and ∇×F there, at three sizes, so the limit is visible. The bridge from the Gauss's law
// and Ampère's law tabs to the differential forms.

import { PI } from '../../core/constants.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines } from '../../core/render.js';
import { FIELDS, fieldAt, divAt, curlAt, boxFlux, loopCirculation, numericDivCurl } from '../../core/operators.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';

const EXTENT = [-1.5, 1.5, -1.5, 1.5], GRID_N = 151;
const PRESETS = [
  { label: 'Radial: div 2, curl 0', kind: 'linear', k: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 } },
  { label: 'Rotation: div 0, curl 2', kind: 'linear', k: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 } },
  { label: 'Shear: div 0, curl −1', kind: 'linear', k: { a: 0, b: 1, c: 0, d: 0, e: 0, f: 0 } },
  { label: 'Saddle: div 0, curl 0', kind: 'linear', k: { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 } },
  { label: 'Uniform: div 0, curl 0', kind: 'linear', k: { a: 0, b: 0, c: 1, d: 0, e: 0, f: 0.5 } },
  { label: 'Line source (E of a line charge)', kind: 'source' },
  { label: 'Vortex (B of a wire)', kind: 'vortex' },
  { label: 'Decaying swirl', kind: 'swirl' },
  { label: 'Downhill from a bump', kind: 'hill' },
  { label: 'Dipole', kind: 'dipole' },
];

export default {
  id: 'operators',
  title: 'Div and curl',
  phase: 7,
  available: true,
  summary: 'Divergence as flux per area through a shrinking box, curl as circulation per area around a shrinking loop, on a library of 2-D fields.',
  extent: EXTENT,
  axes: ['x', 'y'],
  layers: [
    { id: 'div', label: '∇·F (divergence)', kind: 'scalar', unit: '', signed: true, default: true, eq: 'div' },
    { id: 'curl', label: '(∇×F)_z (curl)', kind: 'scalar', unit: '', signed: true, eq: 'curl' },
    { id: 'Fmag', label: '|F|', kind: 'scalar', unit: '', log: true, eq: 'F' },
    { id: 'F', label: 'F', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'probe', label: 'Box and loop at the probe', kind: 'contour', default: true, eq: 'box' },
  ],

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.kind = FIELDS[s.fk] ? s.fk : 'linear';
    this.k = { a: getNum(s, 'ka', 1), b: getNum(s, 'kb', 0), c: getNum(s, 'kc', 0), d: getNum(s, 'kd', 0), e: getNum(s, 'ke', 1), f: getNum(s, 'kf', 0) };
    this.size = getNum(s, 'bs', 0.5);
    // the origin is singular for two of the fields; start the probe off it
    if (Math.abs(shell.probePt[0]) < 1e-12 && Math.abs(shell.probePt[1]) < 1e-12) { shell.probePt = [0.5, 0.3]; shell.$('probe-x').value = '0.5'; shell.$('probe-y').value = '0.3'; }
    this.buildControls();
  },

  F(x, y) { return fieldAt(this.kind, x, y, this.k); },

  compute() {
    const f = (x, y) => this.F(x, y);
    this.gridFx = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (x, y) => f(x, y)[0]);
    this.gridFy = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (x, y) => f(x, y)[1]);
    this.gridFmag = magnitude(this.gridFx, this.gridFy);
    this.gridDiv = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (x, y) => { const v = divAt(this.kind, x, y, this.k); return Number.isFinite(v) ? v : NaN; });
    this.gridCurl = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (x, y) => { const v = curlAt(this.kind, x, y, this.k); return Number.isFinite(v) ? v : NaN; });
    const sym = (g) => { const a = Array.from(g.data).filter(Number.isFinite).map(Math.abs).sort((p, q) => p - q); const m = a[Math.floor(0.98 * (a.length - 1))] || 1; return [-m, m]; };
    this.divRange = sym(this.gridDiv); this.curlRange = sym(this.gridCurl);
    const b = Array.from(this.gridFmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((p, q) => p - q);
    this.fRange = [b[Math.floor(0.03 * (b.length - 1))] || 1e-3, b[Math.floor(0.97 * (b.length - 1))] || 1];
    this.updateProbe();
  },

  /** The box and loop numbers at the current probe point, at the chosen size and at half and quarter of it. */
  updateProbe(pt) {
    const [cx, cy] = pt ?? this.shell.probePt ?? [0.5, 0.3];
    const rows = [];
    for (const s of [this.size, this.size / 2, this.size / 4]) { const bx = boxFlux(this.kind, this.k, cx, cy, s), lp = loopCirculation(this.kind, this.k, cx, cy, s / 2); rows.push({ s, flux: bx.flux, fluxPerArea: bx.flux / bx.area, circ: lp.circ, circPerArea: lp.circ / lp.area }); }
    const d = divAt(this.kind, cx, cy, this.k), c = curlAt(this.kind, cx, cy, this.k), num = numericDivCurl(this.kind, this.k, cx, cy);
    this.probeRes = { cx, cy, rows, div: d, curl: c, num, box: boxFlux(this.kind, this.k, cx, cy, this.size), loop: loopCirculation(this.kind, this.k, cx, cy, this.size / 2) };
    this.renderResults();
  },

  render(layer, ctx, view, opts) {
    const fFn = (x, y) => this.F(x, y);
    switch (layer) {
      case 'div': return drawScalarField(ctx, this.gridDiv, { map: opts.map, extent: opts.extent, min: opts.min ?? this.divRange[0], max: opts.max ?? this.divRange[1] });
      case 'curl': return drawScalarField(ctx, this.gridCurl, { map: opts.map, extent: opts.extent, min: opts.min ?? this.curlRange[0], max: opts.max ?? this.curlRange[1] });
      case 'Fmag': return drawScalarField(ctx, this.gridFmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.fRange[0], max: opts.max ?? this.fRange[1] });
      case 'F':
        if (opts.style === 'lines') { const seeds = []; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) seeds.push([-1.4 + (i + 0.5) * 2.8 / 12, -1.4 + (j + 0.5) * 2.8 / 12]); drawStreamlines(ctx, view, fFn, seeds, { color: 'rgba(40,40,40,0.7)', maxSteps: 600, stopFn: (x, y) => Math.hypot(x, y) < 0.03 && this.kind !== 'linear' && this.kind !== 'swirl' && this.kind !== 'hill' }); }
        else drawQuiver(ctx, view, fFn, { normalize: true, color: 'rgba(40,40,40,0.75)' });
        return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    if (!this.shell.layerOn.get('probe') || !this.probeRes) return;
    const r = this.probeRes, s = this.size, { cx, cy } = r;
    ctx.save();
    // bars of F·n on the box (outward positive, red; inward blue) and F·t on the loop
    const scale = 0.25 * s / (Math.max(...r.box.segs.map((g) => Math.abs(g.Fn)), ...r.loop.segs.map((g) => Math.abs(g.Ft)), 1e-12));
    for (const g of r.box.segs) { const len = g.Fn * scale; const [x0, y0] = view.toPx(g.x - 0.5 * g.dl * -g.ny, g.y - 0.5 * g.dl * g.nx), [x1, y1] = view.toPx(g.x + 0.5 * g.dl * -g.ny, g.y + 0.5 * g.dl * g.nx), [x2, y2] = view.toPx(g.x + 0.5 * g.dl * -g.ny + len * g.nx, g.y + 0.5 * g.dl * g.nx + len * g.ny), [x3, y3] = view.toPx(g.x - 0.5 * g.dl * -g.ny + len * g.nx, g.y - 0.5 * g.dl * g.nx + len * g.ny); ctx.fillStyle = g.Fn >= 0 ? 'rgba(229,72,77,0.7)' : 'rgba(59,130,246,0.7)'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill(); }
    for (const g of r.loop.segs) { const len = g.Ft * scale, nx = g.ty, ny = -g.tx; const a0 = [g.x - 0.5 * g.dl * g.tx, g.y - 0.5 * g.dl * g.ty], a1 = [g.x + 0.5 * g.dl * g.tx, g.y + 0.5 * g.dl * g.ty]; const P = [a0, a1, [a1[0] + len * nx, a1[1] + len * ny], [a0[0] + len * nx, a0[1] + len * ny]].map((q) => view.toPx(q[0], q[1])); ctx.fillStyle = g.Ft >= 0 ? 'rgba(245,166,35,0.75)' : 'rgba(123,97,255,0.75)'; ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
    // the box and the loop
    const [bx0, by0] = view.toPx(cx - s / 2, cy + s / 2), [bx1, by1] = view.toPx(cx + s / 2, cy - s / 2);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
    const [lx, ly] = view.toPx(cx, cy), [lr] = view.toPx(cx + s / 2, cy); ctx.beginPath(); ctx.arc(lx, ly, lr - lx, 0, 2 * PI); ctx.stroke();
    ctx.font = '12px system-ui'; ctx.fillStyle = '#222'; ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 4;
    ctx.fillText(`box: flux/area = ${sci(r.rows[0].fluxPerArea, 4)}  (∇·F = ${sci(r.div, 4)})`, 10, view.height - 26);
    ctx.fillText(`loop: circulation/area = ${sci(r.rows[0].circPerArea, 4)}  ((∇×F)_z = ${sci(r.curl, 4)})`, 10, view.height - 10);
    ctx.restore();
  },

  statusText() { const r = this.probeRes; if (!r) return ''; return `${FIELDS[this.kind].label} · at (${r.cx.toFixed(3)}, ${r.cy.toFixed(3)}): ∇·F = ${sci(r.div, 4)}, curl = ${sci(r.curl, 4)} · box ${this.size}: flux/area ${sci(r.rows[0].fluxPerArea, 4)}, circulation/area ${sci(r.rows[0].circPerArea, 4)}`; },

  probe(x, y) {
    this.updateProbe([x, y]);
    const F = this.F(x, y), r = this.probeRes;
    return [{ label: 'Fx', value: F[0], unit: '' }, { label: 'Fy', value: F[1], unit: '' }, { label: '|F|', value: Math.hypot(...F), unit: '' }, { label: '∇·F (closed form)', value: r.div, unit: '' }, { label: '∇·F (central differences, h = 1e-4)', value: r.num.div, unit: '' }, { label: '(∇×F)_z (closed form)', value: r.curl, unit: '' }, { label: '(∇×F)_z (central differences)', value: r.num.curl, unit: '' }, { label: `flux / area, box side ${this.size}`, value: r.rows[0].fluxPerArea, unit: '' }, { label: `circulation / area, loop diameter ${this.size}`, value: r.rows[0].circPerArea, unit: '' }];
  },

  getState() { const s = { fk: this.kind, bs: this.size }; if (this.kind === 'linear') for (const [k, v] of Object.entries(this.k)) s[`k${k}`] = v; return s; },
  csv() {
    const g = this.gridFx, lines = ['x,y,Fx,Fy,divF,curlF'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridFy.get(i, j)},${this.gridDiv.get(i, j)},${this.gridCurl.get(i, j)}`);
    return lines.join('\n');
  },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Div and curl'));
    box.appendChild(ui.lead(shell, 'Divergence is the outward flux per unit area of a vanishing box; curl is the circulation per unit area of a vanishing loop. Here you can see the limit happen.'));
    const re = () => { shell.recompute(); shell.syncUrl(); };
    box.appendChild(ui.el('h2', '', 'Field'));
    const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
    for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => { this.kind = pr.kind; if (pr.k) this.k = { ...pr.k }; this.buildControls(); re(); }, 'btn btn-small'));
    box.appendChild(pw);
    box.appendChild(ui.field('F(x, y)', ui.select(Object.entries(FIELDS).map(([k, v]) => [k, v.label]), this.kind, (v) => { this.kind = v; this.buildControls(); re(); })));
    if (this.kind === 'linear') {
      const r1 = ui.el('div', 'row'), r2 = ui.el('div', 'row');
      const mk = (key, label) => ui.field(label, ui.number(this.k[key], { min: -10, max: 10, ariaLabel: `coefficient ${key}`, onChange: (v) => { this.k[key] = v; re(); this.renderResults(); } }));
      r1.append(mk('a', 'a (x in Fx)'), mk('b', 'b (y in Fx)'), mk('c', 'c')); r2.append(mk('d', 'd (x in Fy)'), mk('e', 'e (y in Fy)'), mk('f', 'f'));
      box.append(r1, r2);
      box.appendChild(ui.el('p', 'hint', `∇·F = a + e = ${(this.k.a + this.k.e).toFixed(3)}, (∇×F)_z = d − b = ${(this.k.d - this.k.b).toFixed(3)}, the same at every point.`));
    }
    box.appendChild(ui.el('p', 'hint', FIELDS[this.kind].note));
    box.appendChild(ui.el('h2', '', 'Box and loop at the probe'));
    const lab = ui.el('div', 'hint', `side of the box = diameter of the loop: ${this.size.toFixed(3)}`);
    box.appendChild(lab);
    box.appendChild(ui.range(this.size, { min: 0.02, max: 1.5, step: 0.01, ariaLabel: 'box size', onInput: (v) => { this.size = v; lab.textContent = `side of the box = diameter of the loop: ${v.toFixed(3)}`; this.updateProbe(); shell.redrawOverlay(); shell.refreshStatus(); clearTimeout(this.urlT); this.urlT = setTimeout(() => shell.syncUrl(), 300); } }));
    box.appendChild(ui.el('p', 'hint', 'Click on the plot to move the probe; the box and loop follow it. Red / blue bars on the box: F·n̂ outward / inward. Orange / purple bars on the loop: F·t̂ with / against counter-clockwise. The table sums them and divides by the area at the chosen size, half of it and a quarter of it.'));
    box.appendChild(ui.el('h2', '', 'Flux per area → divergence, circulation per area → curl'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'For a linear field the ratios are exact at any size (the integrand is linear, the midpoint rule is exact). For the others they converge as the box shrinks, unless the box contains the origin of the source or vortex: then the flux (2π) or circulation (2π) does not shrink with the box at all, which is what a delta-function source means.'));
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.probeRes) return;
    const r = this.probeRes, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('probe point', `(${r.cx.toFixed(3)}, ${r.cy.toFixed(3)})`);
    row('∇·F there (closed form)', Number.isFinite(r.div) ? sci(r.div, 5) : 'singular (delta function)'); row('(∇×F)_z there (closed form)', Number.isFinite(r.curl) ? sci(r.curl, 5) : 'singular (delta function)');
    for (const q of r.rows) { row(`box side ${q.s.toFixed(3)}: flux, flux / area`, `${sci(q.flux, 4)}, <b>${sci(q.fluxPerArea, 5)}</b>`); row(`loop diameter ${q.s.toFixed(3)}: circulation, circulation / area`, `${sci(q.circ, 4)}, <b>${sci(q.circPerArea, 5)}</b>`); }
    row('central differences at the point (h = 1e-4)', `div ${sci(r.num.div, 5)}, curl ${sci(r.num.curl, 5)}`);
  },
};
