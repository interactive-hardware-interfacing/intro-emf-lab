// Charged bodies tab: Gauss's law for the textbook distributions (uniform sphere, spherical
// shell, infinite cylinder, cylindrical shell, slab). The field and potential in a cut plane,
// a Gaussian surface you drag, the enclosed charge and the flux through it, and E(r), V(r)
// and Q_enc(r) as plots. Closed form (core/charged-bodies.js).

import { PI, EPS0 } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawContours, levelsBetween } from '../../core/render.js';
import { BODIES, enclosed, fieldMag, gaussArea, potential, fieldAt, potentialAt, densities } from '../../core/charged-bodies.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame } from '../views.js';

const N = 161;

export default {
  id: 'charged-bodies',
  title: 'Charged bodies',
  phase: 8,
  available: true,
  summary: 'Gauss’s law for the textbook distributions: uniform sphere, spherical shell, infinite cylinder, cylindrical shell, slab. Drag the Gaussian surface; E, V and Q_enc against radius.',
  extent: [-0.4, 0.4, -0.3, 0.3],
  axes: ['x', 'y'],
  layers: [
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, default: true, eq: 'E' },
    { id: 'V', label: 'V', kind: 'scalar', unit: 'V', signed: true, eq: 'V' },
    { id: 'E', label: 'E arrows', kind: 'vector', styles: ['arrows'], default: true },
    { id: 'Vc', label: 'equipotentials', kind: 'contour', eq: 'V' },
    { id: 'gauss', label: 'Gaussian surface (drag it)', kind: 'info', default: true, eq: 'gauss' },
  ],
  pDefaults: { a: 0.1, Q: 1, lambda: 1, rho: 1, s: 0.15 }, // m, nC, nC/m, µC/m³, m

  init(shell) {
    this.shell = shell; const st = shell.state;
    this.kind = getStr(st, 'cb_kind', 'sphere'); this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(st, `cb_${k}`, this.p[k]);
    this.views = [plotView('radial', 'E, V and Q_enc against distance', (ctx, w, h) => this.drawRadial(ctx, w, h))];
    this.build();
    if (Math.abs(shell.probePt[0]) < 1e-12 && Math.abs(shell.probePt[1]) < 1e-12) { shell.probePt = [0.05, 0.03]; shell.$('probe-x').value = '0.05'; shell.$('probe-y').value = '0.03'; }
    this.buildControls();
  },
  phys() { return { Q: this.p.Q * 1e-9, lambda: this.p.lambda * 1e-9, rho: this.p.rho * 1e-6, a: this.p.a }; },
  build() { const L = 3 * this.p.a; this.extent = [-(4 / 3) * L, (4 / 3) * L, -L, L]; this.shell.setExtent(this.extent, ['x', 'y']); this.results = null; },
  compute() {
    const k = this.kind, q = this.phys(), E = this.extent;
    this.gridE = Grid2D.fromFunction(N, N, E, (x, y) => { const [ex, ey] = fieldAt(k, q, x, y); return Math.hypot(ex, ey); });
    this.gridV = Grid2D.fromFunction(N, N, E, (x, y) => potentialAt(k, q, x, y));
    const s = this.p.s, Qenc = enclosed(k, q, s), Es = fieldMag(k, q, s), A = gaussArea(k, s);
    this.results = { Qenc, Es, A, flux: Es * A, fluxGauss: Qenc / EPS0, Vs: potential(k, q, s), Ea: fieldMag(k, q, q.a), dens: densities(k, q), Vmax: Math.max(...this.gridV.data), Vmin: Math.min(...this.gridV.data) };
    this.renderResults();
  },
  render(layer, ctx, view, opts) {
    const k = this.kind, q = this.phys();
    switch (layer) {
      case 'Emag': { const a = Array.from(this.gridE.data).filter((v) => v > 0).sort((p, q2) => p - q2); return drawScalarField(ctx, this.gridE, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? a[Math.floor(0.02 * a.length)], max: opts.max ?? a[Math.floor(0.995 * a.length)] }); }
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? this.results.Vmin, max: opts.max ?? this.results.Vmax });
      case 'E': drawQuiver(ctx, view, (x, y) => fieldAt(k, q, x, y), { normalize: true, color: '#ffffffb0' }); return null;
      case 'Vc': drawContours(ctx, view, this.gridV, levelsBetween(this.results.Vmin, this.results.Vmax, 14), { color: 'rgba(255,255,255,0.7)', lineWidth: 1 }); return null;
      default: return null;
    }
  },
  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    const k = this.kind, a = this.p.a, s = this.p.s, [cx, cy] = view.toPx(0, 0), [ax] = view.toPx(a, 0), [sx] = view.toPx(s, 0);
    ctx.save(); ctx.font = '12px system-ui'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    // the body
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5; ctx.fillStyle = 'rgba(255,209,102,0.12)';
    if (k === 'slab') { const [x0] = view.toPx(-a, 0); ctx.fillRect(x0, 0, ax - x0, view.height); ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, view.height); ctx.moveTo(ax, 0); ctx.lineTo(ax, view.height); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(cx, cy, ax - cx, 0, 2 * PI); if (k === 'sphere' || k === 'cylinder') ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ffd166'; ctx.fillText(BODIES[k].label, 10, 18);
    if (this.shell.layerOn.get('gauss')) {
      ctx.strokeStyle = '#ff5ad6'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
      if (k === 'slab') { const [x0] = view.toPx(-s, 0), [y0] = [cy - 0.25 * view.height], h = 0.5 * view.height; ctx.strokeRect(x0, y0, sx - x0, h); }
      else { ctx.beginPath(); ctx.arc(cx, cy, sx - cx, 0, 2 * PI); ctx.stroke(); }
      ctx.setLineDash([]); ctx.fillStyle = '#ff5ad6';
      const what = k === 'slab' ? 'pillbox |x| ≤ s' : BODIES[k].dim === 3 ? 'Gaussian sphere' : 'Gaussian cylinder (per metre)';
      ctx.fillText(`${what}, s = ${sci(s, 3)} m: Φ = E·A = ${sci(r.flux, 4)} = Q_enc/ε₀ = ${sci(r.fluxGauss, 4)} ${BODIES[k].dim === 3 ? 'V·m' : BODIES[k].dim === 2 ? 'V (per metre of length)' : 'V/m (per m² of face)'}`, 10, view.height - 10);
    }
    ctx.restore();
  },
  onPointer(type, x, y) {
    if (type !== 'down' && type !== 'drag') return false;
    const s = this.kind === 'slab' ? Math.abs(x) : Math.hypot(x, y);
    if (type === 'down' && Math.abs(s - this.p.s) > 0.25 * this.p.s + 0.02 * this.p.a) return false; // grab near the surface only
    this.p.s = Math.max(0.01 * this.p.a, Math.min(s, 0.95 * Math.min(this.extent[1], this.extent[3])));
    this.compute(); this.shell.redrawOverlay?.(); this.shell.refreshStatus?.(); if (this.sLab) this.sLab.textContent = `s = ${sci(this.p.s, 3)} m`; if (this.sRange) this.sRange.value = this.p.s;
    this.shell.syncUrl?.();
    return true;
  },
  drawRadial(ctx, W, H) {
    if (!this.results) this.compute();
    const k = this.kind, q = this.phys(), a = this.p.a, n = 300, ss = [], Es = [], Vs = [], Qs = [];
    for (let i = 0; i < n; i++) { const s = (3 * a * i) / (n - 1) + 1e-9; ss.push(s); Es.push(fieldMag(k, q, s)); Vs.push(potential(k, q, s)); Qs.push(enclosed(k, q, s)); }
    const Emax = Math.max(...Es.filter(Number.isFinite).map(Math.abs)) || 1, Vmax = Math.max(...Vs.map(Math.abs)) || 1, Qmax = Math.max(...Qs.map(Math.abs)) || 1; // signed curves, normalised by magnitude (negative charges flip them)
    const A = axesFrame(ctx, W, H, { lo: -1.05, hi: 1.05, a0: 0, a1: 3 * a, xlabel: k === 'slab' ? 'distance from the mid-plane s (m)' : 'distance from the centre / axis s (m)', ylabel: 'normalised to each curve’s |maximum|', top: 76, fmt: (v) => sci(v, 2) });
    A.hline(0, '#bbb', '');
    A.line(ss, Es.map((v) => v / Emax), '#e5484d'); A.line(ss, Vs.map((v) => v / Vmax), '#1f5fbf', [5, 4]); A.line(ss, Qs.map((v) => v / Qmax), '#2a9d4b', [2, 3]);
    A.vline(a, '#b8860b', `a = ${sci(a, 3)} m`); A.vline(this.p.s, '#ff5ad6', `Gaussian s`, A.T + 28);
    const y = A.legend([[`E / ${sci(Emax, 3)} V/m`, '#e5484d'], [`V / ${sci(Vmax, 3)} V`, '#1f5fbf', [5, 4]], [`Q_enc / ${sci(Qmax, 3)} ${BODIES[k].dim === 3 ? 'C' : BODIES[k].dim === 2 ? 'C/m' : 'C/m²'}`, '#2a9d4b', [2, 3]]]);
    const text = { sphere: 'Inside, Q_enc grows as s³ and the area as s², so E grows linearly; outside E falls as 1/s² exactly as if all the charge sat at the centre. V is continuous and flat-topped: V(0) = 1.5 V(a).', shell: 'Nothing is enclosed inside, so E = 0 and V is constant there; E jumps by σ/ε₀ at the shell. Outside, identical to the sphere.', cylinder: 'Inside, Q_enc per metre grows as s² and the area per metre as s, so E grows linearly; outside E falls as 1/s. V is referenced to 10a: a line charge has no V(∞).', cylShell: 'E = 0 and V constant inside; outside λ/(2πε₀s), the line-charge field.', slab: 'Q_enc per unit face area grows linearly with s inside, and the pillbox faces do not grow, so E is linear inside and constant outside: the slab looks like a sheet of σ = 2ρa from outside.' }[k];
    A.caption(text, y);
  },
  statusText() { const r = this.results; if (!r) return ''; return `${BODIES[this.kind].label} · E(a) = ${sci(r.Ea, 4)} V/m · at s = ${sci(this.p.s, 3)} m: E = ${sci(r.Es, 4)} V/m, Q_enc = ${sci(r.Qenc, 4)}, V = ${sci(r.Vs, 4)} V`; },
  probe(x, y) { const k = this.kind, q = this.phys(), [ex, ey] = fieldAt(k, q, x, y), s = k === 'slab' ? Math.abs(x) : Math.hypot(x, y); return [{ label: '|E|', value: Math.hypot(ex, ey), unit: 'V/m' }, { label: 'V', value: potentialAt(k, q, x, y), unit: 'V', note: k === 'cylinder' || k === 'cylShell' ? 'zero at 10a' : k === 'slab' ? 'zero at the mid-plane' : 'zero at infinity' }, { label: 's', value: s, unit: 'm', note: s < q.a ? 'inside the body' : 'outside' }, { label: 'Q enclosed by a surface through here', value: enclosed(k, q, s), unit: BODIES[k].dim === 3 ? 'C' : BODIES[k].dim === 2 ? 'C/m' : 'C/m²' }]; },
  getState() { const s = { cb_kind: this.kind }; for (const [k, v] of Object.entries(this.p)) s[`cb_${k}`] = +v.toPrecision(5); return s; },
  csv() { const g = this.gridE, lines = ['x_m,y_m,Emag_Vpm,V_V']; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridV.get(i, j)}`); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Charged bodies'));
    box.appendChild(ui.lead(shell, 'The five distributions whose symmetry makes Gauss’s law do all the work. Drag the Gaussian surface and watch E × area track Q_enc/ε₀.'));
    const re = () => { this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Body'));
    box.appendChild(ui.field('Distribution', ui.select(Object.entries(BODIES).map(([k, v]) => [k, v.label]), this.kind, (v) => { this.kind = v; re(); })));
    const k = this.kind;
    row(pf('a', 'Radius / half-thickness a (m)', 0.01, 1), k === 'sphere' || k === 'shell' ? pf('Q', 'Total charge Q (nC)', -100, 100) : k === 'slab' ? pf('rho', 'ρ (µC/m³)', -100, 100) : pf('lambda', 'Charge per metre λ (nC/m)', -100, 100));
    const d = this.results?.dens ?? densities(k, this.phys());
    box.appendChild(ui.el('p', 'hint', k === 'sphere' ? `ρ = Q/(4πa³/3) = ${sci(d.rho, 3)} C/m³` : k === 'shell' ? `σ = Q/4πa² = ${sci(d.sigma, 3)} C/m²` : k === 'cylinder' ? `ρ = λ/πa² = ${sci(d.rho, 3)} C/m³` : k === 'cylShell' ? `σ = λ/2πa = ${sci(d.sigma, 3)} C/m²` : `seen from outside the slab is a sheet of σ = 2ρa = ${sci(d.sigmaEquivalent, 3)} C/m²`));
    box.appendChild(ui.el('h2', '', 'Gaussian surface'));
    this.sLab = ui.el('div', 'hint', `s = ${sci(p.s, 3)} m`); box.appendChild(this.sLab);
    this.sRange = ui.range(p.s, { min: 0.01 * p.a, max: 2.8 * p.a, step: 0.001 * p.a, ariaLabel: 'Gaussian surface size', onInput: (v) => { p.s = v; this.sLab.textContent = `s = ${sci(p.s, 3)} m`; this.compute(); shell.redrawOverlay(); shell.refreshStatus(); shell.updateStageView(); }, onChange: () => shell.syncUrl() }); box.appendChild(this.sRange);
    box.appendChild(ui.el('p', 'hint', 'Or drag the pink surface on the picture. The flux through it is E × area because the symmetry makes E the same size everywhere on it and normal to it; that is the whole trick.'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('E, V, Q_enc against s', () => { shell.setStageView('radial'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Field', () => { shell.setStageView('field'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, k = this.kind, q = this.phys(), tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    const unit = BODIES[k].dim === 3 ? 'C' : BODIES[k].dim === 2 ? 'C/m' : 'C/m²';
    row(`Q enclosed by s = ${sci(this.p.s, 3)} m`, `${sci(r.Qenc, 4)} ${unit}`); row('area of the Gaussian surface', `${sci(r.A, 4)} ${BODIES[k].dim === 3 ? 'm²' : BODIES[k].dim === 2 ? 'm²/m' : '(two faces, per m²)'}`);
    row('E on the surface, from Gauss', `${sci(r.Es, 4)} V/m`); row('flux E·A vs Q_enc/ε₀', `${sci(r.flux, 4)} vs ${sci(r.fluxGauss, 4)}`);
    row('E at the body’s surface', `${sci(r.Ea, 4)} V/m`); row(`V at s`, `${sci(r.Vs, 4)} V`);
    if (k === 'sphere') row('V(0) / V(a)', '1.5'); if (k === 'shell' || k === 'cylShell') row('jump in E at the shell, σ/ε₀', `${sci(r.dens.sigma / EPS0, 4)} V/m`);
  },
};
