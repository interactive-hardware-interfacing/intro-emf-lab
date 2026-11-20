// Method of images tab: point charge over a grounded plane, line charge over a plane, point
// charge near a grounded sphere, point charge in a 90° corner. The real field (zero inside the
// conductor), the images shown or hidden, the induced surface charge along the conductor and
// its total, and the force on the charge. Closed form (core/images.js).

import { PI, EPS0 } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawContours, levelsBetween } from '../../core/render.js';
import { imageSet, inRegion, fieldAt, potentialAt, inducedSigma, inducedTotal, force, closedForms } from '../../core/images.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame } from '../views.js';

const N = 161;
const KINDS = { plane: 'Point charge above a grounded plane', linePlane: 'Line charge above a grounded plane', sphere: 'Point charge near a grounded sphere', corner: 'Point charge in a 90° corner (two grounded planes)' };

export default {
  id: 'images',
  title: 'Images',
  phase: 8,
  available: true,
  summary: 'The method of images: a charge near a grounded plane, sphere or corner. The real field with the conductor at V = 0, the image charges that produce it, the induced surface charge and the force.',
  extent: [-0.4, 0.4, -0.3, 0.3],
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'V', kind: 'scalar', unit: 'V', signed: true, default: true, eq: 'V' },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'E', label: 'E arrows', kind: 'vector', styles: ['arrows'], default: true },
    { id: 'Vc', label: 'equipotentials', kind: 'contour', default: true, eq: 'V' },
    { id: 'img', label: 'show the image charges and their field', kind: 'info', eq: 'images' },
    { id: 'sigma', label: 'induced surface charge (bars)', kind: 'info', default: true, eq: 'sigma' },
  ],
  pDefaults: { q: 1, d: 0.1, a: 0.1, D: 0.25, x0: 0.12, y0: 0.08 }, // nC (nC/m for the line), m …

  init(shell) {
    this.shell = shell; const st = shell.state;
    this.kind = getStr(st, 'im_kind', 'plane'); this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(st, `im_${k}`, this.p[k]);
    this.views = [plotView('sigma', 'Induced surface charge', (ctx, w, h) => this.drawSigma(ctx, w, h))];
    this.build();
    if (Math.abs(shell.probePt[0]) < 1e-12 && Math.abs(shell.probePt[1]) < 1e-12) { shell.probePt = [0.05, 0.05]; shell.$('probe-x').value = '0.05'; shell.$('probe-y').value = '0.05'; }
    this.buildControls();
  },
  phys() { return { ...this.p, q: this.p.q * 1e-9 }; },
  build() {
    const k = this.kind, p = this.p, L = k === 'sphere' ? 2 * p.D : k === 'corner' ? 2.2 * Math.max(p.x0, p.y0) : 2.5 * p.d;
    this.extent = k === 'corner' ? [-0.25 * L, (4 / 3) * L - 0.25 * L, -0.25 * L, L - 0.25 * L] : [-(4 / 3) * L, (4 / 3) * L, -L, L];
    this.shell.setExtent(this.extent, ['x', 'y']); this.results = null;
  },
  compute() {
    const k = this.kind, q = this.phys(), E = this.extent, showImg = this.shell.layerOn.get('img');
    const fieldFn = showImg ? (x, y) => this.fullField(x, y) : (x, y) => fieldAt(k, q, x, y);
    const potFn = showImg ? (x, y) => this.fullPotential(x, y) : (x, y) => potentialAt(k, q, x, y);
    this.gridV = Grid2D.fromFunction(N, N, E, potFn);
    this.gridE = Grid2D.fromFunction(N, N, E, (x, y) => Math.hypot(...fieldFn(x, y)));
    const vs = Array.from(this.gridV.data).filter(Number.isFinite).sort((a, b) => a - b);
    this.vRange = [vs[Math.floor(0.02 * vs.length)], vs[Math.floor(0.98 * vs.length)]];
    const F = force(k, q), cf = closedForms(k, q);
    this.results = { set: imageSet(k, q), F, Fmag: Math.hypot(...F), Qind: inducedTotal(k, q), cf };
    this.renderResults();
  },
  // the images' field everywhere (what the images layer shows: the unphysical continuation inside the conductor)
  fullField(x, y) { let ex = 0, ey = 0; for (const c of this.results?.set ?? imageSet(this.kind, this.phys())) { const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy; if (!r2) continue; const f = this.kind === 'linePlane' ? c.q / (2 * PI * EPS0 * r2) : c.q / (4 * PI * EPS0 * r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy; } return [ex, ey]; },
  fullPotential(x, y) { let V = 0; for (const c of this.results?.set ?? imageSet(this.kind, this.phys())) { const r = Math.hypot(x - c.x, y - c.y); if (!r) continue; V += this.kind === 'linePlane' ? (-c.q / (2 * PI * EPS0)) * Math.log(r) : c.q / (4 * PI * EPS0 * r); } return V; },
  render(layer, ctx, view, opts) {
    const k = this.kind, q = this.phys(), showImg = this.shell.layerOn.get('img');
    switch (layer) {
      case 'V': { const m = Math.max(Math.abs(this.vRange[0]), Math.abs(this.vRange[1])); return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? -m, max: opts.max ?? m }); }
      case 'Emag': { const a = Array.from(this.gridE.data).filter((v) => v > 0).sort((p, q2) => p - q2); return drawScalarField(ctx, this.gridE, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? a[Math.floor(0.05 * a.length)], max: opts.max ?? a[Math.floor(0.98 * a.length)] }); }
      case 'E': drawQuiver(ctx, view, showImg ? (x, y) => this.fullField(x, y) : (x, y) => fieldAt(k, q, x, y), { normalize: true }); return null;
      case 'Vc': { const m = Math.max(Math.abs(this.vRange[0]), Math.abs(this.vRange[1])); drawContours(ctx, view, this.gridV, levelsBetween(-m, m, 16), { color: 'rgba(255,255,255,0.65)', lineWidth: 1 }); return null; }
      default: return null;
    }
  },
  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    const k = this.kind, p = this.p, W = view.width, H = view.height;
    ctx.save(); ctx.font = '12px system-ui'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    // the conductor
    ctx.fillStyle = 'rgba(120,120,120,0.55)'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
    if (k === 'plane' || k === 'linePlane') { const [, y0] = view.toPx(0, 0); ctx.fillRect(0, y0, W, H - y0); ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke(); }
    else if (k === 'sphere') { const [cx, cy] = view.toPx(0, 0), [ax] = view.toPx(p.a, 0); ctx.beginPath(); ctx.arc(cx, cy, ax - cx, 0, 2 * PI); ctx.fill(); ctx.stroke(); }
    else { const [x0, y0] = view.toPx(0, 0); ctx.fillRect(0, 0, x0, H); ctx.fillRect(0, y0, W, H - y0); ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, y0); ctx.lineTo(W, y0); ctx.stroke(); }
    // induced charge bars along the conductor
    if (this.shell.layerOn.get('sigma')) {
      ctx.fillStyle = '#5ad6ff';
      const q = this.phys(), n = 60;
      if (k === 'plane' || k === 'linePlane' || k === 'corner') {
        const sMax = inducedSigma(k, q, k === 'corner' ? p.x0 : 0), x0w = k === 'corner' ? 0 : this.extent[0], x1w = this.extent[1];
        for (let i = 0; i < n; i++) { const x = x0w + ((i + 0.5) / n) * (x1w - x0w), s = inducedSigma(k, q, x) / Math.abs(sMax); const [px, py] = view.toPx(x, 0); const h = 40 * Math.abs(s); ctx.fillRect(px - 2, py, 4, h); }
        if (k === 'corner') { // the vertical plane x = 0: σ = ε₀ E_x(0⁺, y), scaled by its value level with the charge
          const sMax2 = Math.abs(EPS0 * fieldAt('corner', q, 1e-12, p.y0)[0]) || 1;
          for (let i = 0; i < n; i++) { const y = ((i + 0.5) / n) * this.extent[3], s = (EPS0 * fieldAt('corner', q, 1e-12, y)[0]) / sMax2, [px, py] = view.toPx(0, y); ctx.fillRect(px - 40 * Math.abs(s), py - 2, 40 * Math.abs(s), 4); }
        }
      } else { const [cx, cy] = view.toPx(0, 0), [ax] = view.toPx(p.a, 0), R = ax - cx, s0 = Math.abs(inducedSigma('sphere', q, 0)); for (let i = 0; i < n; i++) { const th = ((i + 0.5) / n) * 2 * PI, s = inducedSigma('sphere', q, th) / s0, h = 40 * Math.abs(s); ctx.beginPath(); ctx.moveTo(cx + R * Math.cos(th), cy - R * Math.sin(th)); ctx.lineTo(cx + (R - h) * Math.cos(th), cy - (R - h) * Math.sin(th)); ctx.lineWidth = 3; ctx.strokeStyle = '#5ad6ff'; ctx.stroke(); } }
      ctx.fillStyle = '#5ad6ff'; ctx.fillText(`blue bars: induced σ, all of one sign, total ${sci(r.Qind, 3)} ${k === 'linePlane' ? 'C/m' : 'C'}`, 10, H - 28);
    }
    // charges
    for (const c of r.set) {
      if (!c.real && !this.shell.layerOn.get('img')) continue;
      const [x, y] = view.toPx(c.x, c.y); ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * PI); ctx.fillStyle = c.q > 0 ? '#e5484d' : '#1f5fbf'; ctx.globalAlpha = c.real ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c.real ? '#fff' : '#ffd166'; ctx.lineWidth = 2; if (!c.real) ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.fillText(c.real ? `q = ${sci(c.q, 3)} ${k === 'linePlane' ? 'C/m' : 'C'}` : `image ${sci(c.q, 3)}`, x + 10, y - 8);
    }
    // force arrow on the real charge
    const real = r.set.find((c) => c.real), [fx0, fy0] = view.toPx(real.x, real.y), L = 50, nrm = r.Fmag || 1, dx = (r.F[0] / nrm) * L, dy = (-r.F[1] / nrm) * L;
    ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx0, fy0); ctx.lineTo(fx0 + dx, fy0 + dy); ctx.stroke(); ctx.fillStyle = '#06d6a0'; ctx.fillText(`F = ${sci(r.Fmag, 3)} ${k === 'linePlane' ? 'N/m' : 'N'}`, fx0 + dx / 2 - 20, fy0 + dy / 2 + 18);
    ctx.fillStyle = '#fff'; ctx.fillText(this.shell.layerOn.get('img') ? 'With the images: their field inside the conductor is fiction; what is real is that they make its surface V = 0.' : 'Grey: the grounded conductor, V = 0. The images layer shows what produces this field.', 10, H - 10);
    ctx.restore();
  },
  drawSigma(ctx, W, H) {
    if (!this.results) this.compute();
    const k = this.kind, q = this.phys(), n = 300, xs = [], ys = [];
    const isSphere = k === 'sphere', a0 = isSphere ? 0 : k === 'corner' ? 0 : this.extent[0], a1 = isSphere ? 180 : this.extent[1];
    for (let i = 0; i < n; i++) { const s = a0 + ((a1 - a0) * i) / (n - 1); xs.push(s); ys.push(inducedSigma(k, q, isSphere ? (s * PI) / 180 : s)); }
    const m = Math.max(...ys.map(Math.abs)) || 1, neg = ys.every((v) => v <= 0); // σ has the sign opposite to q
    const A = axesFrame(ctx, W, H, { lo: neg ? -1.05 * m : -0.05 * m, hi: neg ? 0.05 * m : 1.05 * m, a0, a1, xlabel: isSphere ? 'angle from the line to the charge (degrees)' : 'position along the plane y = 0 (m)', ylabel: 'induced σ (C/m²)', top: 70, fmt: (v) => sci(v, 2) });
    A.hline(0, '#bbb', ''); A.line(xs, ys, '#1f5fbf');
    const y = A.legend([['induced surface charge density', '#1f5fbf']]);
    const cf = this.results.cf;
    A.caption(k === 'plane' ? `σ(x) = −q d / 2π (x² + d²)^{3/2}: peak −q/2πd² = ${sci(cf.sigma0, 3)} C/m² directly under the charge, falling as 1/x³; the integral over the whole plane is exactly −q.` : k === 'linePlane' ? `σ(x) = −λ d / π (x² + d²): peak ${sci(cf.sigma0, 3)} C/m², a Lorentzian that integrates to −λ per metre.` : k === 'sphere' ? `σ(θ) = −q (D² − a²) / 4π a (a² + D² − 2aD cosθ)^{3/2}: densest on the near side, total −q a/D = ${sci(this.results.Qind, 3)} C (less than q: some field lines escape to infinity).` : 'On each plane σ = ε₀E_n; densest nearest the charge; the two planes together carry −q.', y);
  },
  statusText() { const r = this.results; if (!r) return ''; return `${KINDS[this.kind]} · images: ${r.set.filter((c) => !c.real).map((c) => `${sci(c.q, 3)} at (${sci(c.x, 3)}, ${sci(c.y, 3)})`).join(', ')} · |F| = ${sci(r.Fmag, 4)} ${this.kind === 'linePlane' ? 'N/m' : 'N'} · induced ${sci(r.Qind, 4)} ${this.kind === 'linePlane' ? 'C/m' : 'C'}`; },
  probe(x, y) { const k = this.kind, q = this.phys(), [ex, ey] = fieldAt(k, q, x, y); return [{ label: 'V', value: potentialAt(k, q, x, y), unit: 'V', note: inRegion(k, q, x, y) ? '' : 'inside the conductor: 0' }, { label: '|E|', value: Math.hypot(ex, ey), unit: 'V/m' }, { label: 'E_x, E_y', value: ex, unit: 'V/m', note: `E_y = ${sci(ey, 3)}` }]; },
  getState() { const s = { im_kind: this.kind }; for (const [k, v] of Object.entries(this.p)) s[`im_${k}`] = +v.toPrecision(5); return s; },
  csv() { const g = this.gridV, lines = ['x_m,y_m,V_V,Emag_Vpm']; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridE.get(i, j)}`); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p, k = this.kind;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Method of images'));
    box.appendChild(ui.lead(shell, 'A grounded conductor near a charge is replaced by imaginary charges that make the conductor’s surface V = 0; by uniqueness the field outside is then the real one.'));
    const re = () => { this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Problem'));
    box.appendChild(ui.field('Geometry', ui.select(Object.entries(KINDS), k, (v) => { this.kind = v; re(); })));
    row(pf('q', k === 'linePlane' ? 'λ (nC/m)' : 'q (nC)', -100, 100));
    if (k === 'plane' || k === 'linePlane') row(pf('d', 'Height above the plane d (m)', 0.01, 1));
    if (k === 'sphere') row(pf('a', 'Sphere radius a (m)', 0.01, 1), pf('D', 'Charge distance from the centre D (m)', 0.011, 2));
    if (k === 'corner') row(pf('x0', 'x₀ (m)', 0.01, 1), pf('y0', 'y₀ (m)', 0.01, 1));
    if (k === 'sphere' && p.D <= p.a) box.appendChild(ui.el('p', 'hint', 'D must exceed a: the charge is outside the sphere.'));
    box.appendChild(ui.el('p', 'hint', { plane: 'One image −q at the mirror point. The induced charge integrates to −q: every field line from q ends on the plane.', linePlane: 'The 2-D version: fields fall as 1/r and the induced σ is a Lorentzian.', sphere: 'The image q′ = −q a/D sits at a²/D from the centre (inside). Only a/D of the charge is induced: the rest of the field lines escape to infinity. An isolated (ungrounded) sphere would need a second image +q a/D at the centre.', corner: 'Three images: −q across each plane and +q across both. The planes must meet at 180°/n for the method to close (90°: four charges).' }[k]));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Induced charge', () => { shell.setStageView('sigma'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Field', () => { shell.setStageView('field'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, k = this.kind, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    for (const c of r.set.filter((c) => !c.real)) row('image', `${sci(c.q, 4)} ${k === 'linePlane' ? 'C/m' : 'C'} at (${sci(c.x, 4)}, ${sci(c.y, 4)}) m`);
    row('force on the charge', `${sci(r.Fmag, 4)} ${k === 'linePlane' ? 'N/m' : 'N'}, toward the conductor`);
    if (k === 'plane') { row('= q²/4πε₀(2d)²', `${sci(r.cf.F, 4)} N`); row('σ under the charge, −q/2πd²', `${sci(r.cf.sigma0, 4)} C/m²`); row('energy of the system (half the two-charge value)', `${sci(r.cf.W, 4)} J`); }
    if (k === 'linePlane') { row('= λ²/4πε₀d', `${sci(r.cf.F, 4)} N/m`); row('σ under the line, −λ/πd', `${sci(r.cf.sigma0, 4)} C/m²`); }
    if (k === 'sphere') { row('= q² a D / 4πε₀(D² − a²)²', `${sci(r.cf.F, 4)} N`); row('q′ = −q a/D at a²/D', `${sci(r.cf.qImage, 4)} C at ${sci(r.cf.bImage, 4)} m`); }
    row('total induced charge', `${sci(r.Qind, 4)} ${k === 'linePlane' ? 'C/m' : 'C'}`);
  },
};
