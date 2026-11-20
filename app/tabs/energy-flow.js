// Energy flow tab: the Poynting vector in a DC resistor and in a charging capacitor, on the
// (r, z) half-plane. The power enters through the sides, carried by E × H, and the flux
// through the surface equals I²R or d(½CV²)/dt. Closed form (core/poynting.js).

import { PI, EPS0 } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver } from '../../core/render.js';
import { resistor, resistorFields, capacitor, capacitorFields, powerWithin } from '../../core/poynting.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame } from '../views.js';

const N = 161;

export default {
  id: 'energy-flow',
  title: 'Energy flow',
  phase: 8,
  available: true,
  summary: 'Where the power goes: the Poynting vector into a DC resistor (flux I²R through its side) and into a charging capacitor (flux d(½CV²)/dt through its rim, carried by the displacement current’s H).',
  extent: [0, 0.003, -0.015, 0.015],
  axes: ['r', 'z'],
  layers: [
    { id: 'S', label: '|S| = |E × H| (power density)', kind: 'scalar', unit: 'W/m²', default: true, eq: 'S' },
    { id: 'Ez', label: 'E_z', kind: 'scalar', unit: 'V/m', eq: 'E' },
    { id: 'H', label: 'H_φ (azimuthal, around the axis)', kind: 'scalar', unit: 'A/m', eq: 'H' },
    { id: 'Svec', label: 'S arrows', kind: 'vector', styles: ['arrows'], default: true, eq: 'S' },
    { id: 'Evec', label: 'E arrows', kind: 'vector', styles: ['arrows'], eq: 'E' },
    { id: 'body', label: 'the body and a coaxial Poynting surface', kind: 'info', default: true, eq: 'surface' },
  ],
  pDefaults: { I: 1, a: 1, L: 6, sigma: 1e5, ca: 20, g: 1, V: 10, dVdt: 1e6, rs: 0.7 }, // A, mm, mm, S/m | mm, mm, V, V/s | surface radius as a fraction of a
  // the resistor is drawn with z horizontal (it is long and thin), the capacitor with r horizontal (it is wide and flat)

  init(shell) {
    this.shell = shell; const st = shell.state;
    this.kind = getStr(st, 'ef_kind', 'resistor'); this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(st, `ef_${k}`, this.p[k]);
    this.views = [plotView('radial', 'Power entering within radius r', (ctx, w, h) => this.drawRadial(ctx, w, h))];
    this.build();
    if (Math.abs(shell.probePt[0]) < 1e-12 && Math.abs(shell.probePt[1]) < 1e-12) { const [x, y] = this.kind === 'resistor' ? [0.001, 0.0005] : [0.01, 0.0002]; shell.probePt = [x, y]; shell.$('probe-x').value = String(x); shell.$('probe-y').value = String(y); }
    this.buildControls();
  },
  phys() { const p = this.p; return this.kind === 'resistor' ? { I: p.I, a: p.a * 1e-3, L: p.L * 1e-3, sigma: p.sigma } : { a: p.ca * 1e-3, g: p.g * 1e-3, V: p.V, dVdt: p.dVdt }; },
  build() {
    const q = this.phys();
    if (this.kind === 'resistor') { this.extent = [-0.8 * q.L, 0.8 * q.L, 0, Math.max(3.5 * q.a, 0.45 * q.L)]; this.axes = ['z', 'r']; }
    else { const hz = Math.max(3 * q.g, 0.25 * q.a); this.extent = [0, 1.3 * q.a, -hz, hz]; this.axes = ['r', 'z']; }
    this.shell.setExtent(this.extent, this.axes); this.results = null;
  },
  f(r, z) { return this.kind === 'resistor' ? resistorFields(this.phys(), r, z) : capacitorFields(this.phys(), r, z); },
  /** picture coordinates (u, v) → (r, z) */
  rz(u, v) { return this.kind === 'resistor' ? [v, u] : [u, v]; },
  fp(u, v) { const [r, z] = this.rz(u, v); return this.f(r, z); },
  compute() {
    const E = this.extent, q = this.phys();
    this.gridS = Grid2D.fromFunction(N, N, E, (u, v) => Math.abs(this.fp(u, v).Sr));
    this.gridE = Grid2D.fromFunction(N, N, E, (u, v) => this.fp(u, v).Ez);
    this.gridH = Grid2D.fromFunction(N, N, E, (u, v) => this.fp(u, v).Hphi);
    const rsurf = this.p.rs * q.a;
    this.results = this.kind === 'resistor' ? { ...resistor(q), rsurf, Pwithin: powerWithin('resistor', q, rsurf) } : { ...capacitor(q), rsurf, Pwithin: powerWithin('capacitor', q, rsurf) };
    this.renderResults();
  },
  render(layer, ctx, view, opts) {
    const mx = (g) => Math.max(...g.data.map(Math.abs)) || 1;
    switch (layer) {
      case 'S': return drawScalarField(ctx, this.gridS, { map: opts.map, extent: opts.extent, min: opts.min ?? 0, max: opts.max ?? mx(this.gridS) });
      case 'Ez': return drawScalarField(ctx, this.gridE, { map: opts.map, extent: opts.extent, min: opts.min ?? 0, max: opts.max ?? mx(this.gridE) });
      case 'H': return drawScalarField(ctx, this.gridH, { map: opts.map, extent: opts.extent, min: opts.min ?? 0, max: opts.max ?? mx(this.gridH) });
      case 'Svec': drawQuiver(ctx, view, (u, v) => { const S = this.fp(u, v).Sr; return this.kind === 'resistor' ? [0, S] : [S, 0]; }, { normalize: true }); return null;
      case 'Evec': drawQuiver(ctx, view, (u, v) => { const E = this.fp(u, v).Ez; return this.kind === 'resistor' ? [E, 0] : [0, E]; }, { normalize: true }); return null;
      default: return null;
    }
  },
  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    const q = this.phys(), W = view.width, H = view.height;
    ctx.save(); ctx.font = '12px system-ui'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    if (this.shell.layerOn.get('body')) {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5;
      if (this.kind === 'resistor') { const [x0, y0] = view.toPx(-q.L / 2, q.a), [x1, y1] = view.toPx(q.L / 2, 0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = '#ffd166'; ctx.fillText(`resistor a = ${this.p.a} mm × ${this.p.L} mm, σ = ${sci(q.sigma, 2)} S/m, R = ${sci(r.R, 3)} Ω · axis r = 0 at the bottom edge · I flows to the right`, 10, 18); }
      else { const [x0, y0] = view.toPx(0, q.g / 2), [x1, y1] = view.toPx(q.a, -q.g / 2); ctx.fillStyle = 'rgba(255,209,102,0.15)'; ctx.fillRect(x0, y0 - 6, x1 - x0, 6); ctx.fillRect(x0, y1, x1 - x0, 6); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = '#ffd166'; ctx.fillText(`plates a = ${this.p.ca} mm, gap ${this.p.g} mm, V = ${this.p.V} V rising at ${sci(q.dVdt, 2)} V/s · displacement current ${sci(r.Id, 3)} A fills the gap`, 10, 18); }
      const [xs0, ys0] = this.kind === 'resistor' ? view.toPx(-q.L / 2, r.rsurf) : view.toPx(r.rsurf, q.g / 2), [xs1, ys1] = this.kind === 'resistor' ? view.toPx(q.L / 2, r.rsurf) : view.toPx(r.rsurf, -q.g / 2);
      ctx.strokeStyle = '#ff5ad6'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xs0, ys0); ctx.lineTo(xs1, ys1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff5ad6'; ctx.fillText(`pink surface r = ${sci(r.rsurf, 3)} m: ∮S·dA in = ${sci(r.Pwithin, 4)} W`, 10, 50);
    }
    ctx.fillStyle = '#fff'; ctx.fillText(this.kind === 'resistor' ? `through the side r = a: ${sci(r.Pside, 4)} W = I²R: the energy comes in sideways through the field` : `through the rim r = a: ${sci(r.Prim, 4)} W = d(½CV²)/dt: the stored energy comes in through the rim`, 10, 34);
    ctx.restore();
  },
  drawRadial(ctx, W, H) {
    if (!this.results) this.compute();
    const q = this.phys(), kind = this.kind, n = 200, rs = [], Ps = [], Hs = [], Es = [], rmax = this.extent[1];
    for (let i = 0; i < n; i++) { const r = (rmax * i) / (n - 1); rs.push(r / q.a); Ps.push(powerWithin(kind, q, r)); const f = this.f(r, 0); Hs.push(f.Hphi); Es.push(f.Ez); }
    const Pmax = this.kind === 'resistor' ? this.results.PJoule : this.results.dWdt, Hmax = Math.max(...Hs.map(Math.abs)) || 1, Emax = Math.max(...Es.map(Math.abs)) || 1;
    const A = axesFrame(ctx, W, H, { lo: 0, hi: 1.1, a0: 0, a1: rmax / q.a, xlabel: 'radius r / a', ylabel: 'normalised', top: 76, fmt: (v) => v.toFixed(2) });
    A.line(rs, Ps.map((v) => v / Pmax), '#2a9d4b'); A.line(rs, Hs.map((v) => v / Hmax), '#1f5fbf', [5, 4]); A.line(rs, Es.map((v) => v / Emax), '#e5484d', [2, 3]);
    A.vline(1, '#ffd166', 'surface r = a'); A.vline(this.p.rs, '#ff5ad6', 'chosen surface', A.T + 28);
    const y = A.legend([[`power entering within r / ${sci(Pmax, 3)} W`, '#2a9d4b'], [`H_φ / ${sci(Hmax, 3)} A/m`, '#1f5fbf', [5, 4]], [`E_z / ${sci(Emax, 3)} V/m`, '#e5484d', [2, 3]]]);
    A.caption(kind === 'resistor' ? 'Inside, H grows linearly (enclosed current ∝ r²) and E is uniform, so the inward flux through a coaxial surface grows as r² and reaches I²R exactly at the surface: all the heat enters through the side. Outside, H falls as 1/r but E is zero, so no more power flows in.' : 'Between the plates E is uniform and H, driven only by the displacement current, grows linearly with r; the inward flux grows as r² and at the rim equals the rate at which ½CV² grows. Nothing passes through the plates themselves (S is radial).', y);
  },
  statusText() { const r = this.results; if (!r) return ''; return this.kind === 'resistor' ? `R = ${sci(r.R, 4)} Ω, V = ${sci(r.V, 4)} V · E = ${sci(r.E, 4)} V/m, H(a) = ${sci(r.Ha, 4)} A/m, S(a) = ${sci(r.Sa, 4)} W/m² · ∮S·dA = ${sci(r.Pside, 4)} W = I²R` : `C = ${sci(r.C, 4)} F · E = ${sci(r.E, 4)} V/m, H(a) = ${sci(r.Ha, 4)} A/m, I_d = ${sci(r.Id, 4)} A · ∮S·dA = ${sci(r.Prim, 4)} W = C V dV/dt`; },
  probe(u, v) { const f = this.fp(u, v); return [{ label: 'E_z', value: f.Ez, unit: 'V/m' }, { label: 'H_φ', value: f.Hphi, unit: 'A/m' }, { label: 'S_r (negative = inward)', value: f.Sr, unit: 'W/m²' }, ...(this.kind === 'capacitor' ? [{ label: 'displacement current density', value: f.Jd ?? 0, unit: 'A/m²' }] : [])]; },
  getState() { const s = { ef_kind: this.kind }; for (const [k, v] of Object.entries(this.p)) s[`ef_${k}`] = v; return s; },
  csv() { const g = this.gridS, lines = ['r_m,z_m,Ez_Vpm,Hphi_Apm,Sr_Wpm2']; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const [r, z] = this.rz(g.x(i), g.y(j)), f = this.f(r, z); lines.push(`${r},${z},${f.Ez},${f.Hphi},${f.Sr}`); } return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p, k = this.kind;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Energy flow'));
    box.appendChild(ui.lead(shell, 'Poynting’s theorem says power moves through the fields. Here is where it goes in two circuit elements you thought you understood.'));
    const re = () => { this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Element'));
    box.appendChild(ui.field('Which', ui.select([['resistor', 'a resistor carrying DC current'], ['capacitor', 'a capacitor being charged']], k, (v) => { this.kind = v; re(); })));
    if (k === 'resistor') { row(pf('I', 'Current I (A)', 0.001, 1000), pf('sigma', 'Conductivity σ (S/m)', 1, 1e8)); row(pf('a', 'Radius a (mm)', 0.05, 50), pf('L', 'Length (mm)', 0.5, 500)); }
    else { row(pf('ca', 'Plate radius a (mm)', 1, 500), pf('g', 'Gap g (mm)', 0.05, 50)); row(pf('V', 'Voltage now V (V)', -1e4, 1e4), pf('dVdt', 'dV/dt (V/s)', -1e12, 1e12)); }
    box.appendChild(ui.el('h2', '', 'Poynting surface'));
    const lab = ui.el('div', 'hint', `coaxial cylinder at r = ${p.rs.toFixed(2)} a`); box.appendChild(lab);
    box.appendChild(ui.range(p.rs, { min: 0.05, max: 1, step: 0.01, ariaLabel: 'Poynting surface radius as a fraction of a', onInput: (v) => { p.rs = v; lab.textContent = `coaxial cylinder at r = ${p.rs.toFixed(2)} a`; this.compute(); shell.redrawOverlay(); shell.refreshStatus(); shell.updateStageView(); }, onChange: () => shell.syncUrl() }));
    box.appendChild(ui.el('p', 'hint', k === 'resistor' ? 'The battery’s energy travels in the field between the wires and enters the resistor through its curved surface, where E (along the current) and H (around it) are perpendicular. The wire carries current; the field carries the energy.' : 'No charge crosses the gap, yet the energy to charge the capacitor arrives through the gap’s rim, because the changing E makes an H (Ampère–Maxwell) and E × H points inward. Without the displacement current there would be no H and no way in.'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Power vs radius', () => { shell.setStageView('radial'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Field', () => { shell.setStageView('field'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    if (this.kind === 'resistor') { row('R = L/πa²σ', `${sci(r.R, 4)} Ω`); row('E inside = I/πa²σ', `${sci(r.E, 4)} V/m`); row('H at the surface = I/2πa', `${sci(r.Ha, 4)} A/m`); row('S at the surface = E H, inward', `${sci(r.Sa, 4)} W/m²`); row('∮S·dA over the side', `${sci(r.Pside, 4)} W`); row('I²R', `${sci(r.PJoule, 4)} W`); }
    else { row('C = ε₀πa²/g', `${sci(r.C, 4)} F`); row('E = V/g', `${sci(r.E, 4)} V/m`); row('displacement current I_d = C dV/dt', `${sci(r.Id, 4)} A`); row('H at the rim = ε₀ a (dE/dt)/2 = I_d/2πa', `${sci(r.Ha, 4)} A/m`); row('S at the rim, inward', `${sci(r.Sa, 4)} W/m²`); row('∮S·dA over the rim', `${sci(r.Prim, 4)} W`); row('d(½CV²)/dt = C V dV/dt', `${sci(r.dWdt, 4)} W`); row('stored now ½CV²', `${sci(r.W, 4)} J`); }
    row(`within the chosen surface r = ${sci(r.rsurf, 3)} m`, `${sci(r.Pwithin, 4)} W`);
  },
};
