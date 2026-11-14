// Coupled coils tab: two coaxial windings. Mutual inductance from the filament sum, the
// coupling coefficient, the field of coil 1 with its lines through coil 2, M and k against the
// offset, and the transformer in sinusoidal steady state (open-circuit ratio, a load on the
// secondary, the reflected impedance). Air core; closed forms throughout.

import { PI } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawContours, levelsBetween } from '../../core/render.js';
import { turnsB, turnsPsi } from '../../core/solenoid.js';
import { coilTurns, mutualInductance, selfInductance, coupling, transformer, fluxFraction } from '../../core/coupled.js';
import { cabs, carg } from '../../core/tline.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const NZ = 161, NX = 121;
const PRESETS = [
  { label: 'Nested coils (tight coupling)', p: { N1: 100, a1: 15, l1: 30, N2: 50, a2: 20, l2: 20, d: 0 } },
  { label: 'Lab 5 coil and the ring sensor', p: { N1: 100, a1: 15, l1: 30, N2: 20, a2: 15, l2: 4, d: 25 } },
  { label: 'End to end', p: { N1: 100, a1: 15, l1: 30, N2: 100, a2: 15, l2: 30, d: 32 } },
  { label: 'Two single loops', p: { N1: 1, a1: 50, l1: 0, N2: 1, a2: 50, l2: 0, d: 50 } },
  { label: 'Far apart (k → 0)', p: { N1: 100, a1: 15, l1: 30, N2: 50, a2: 20, l2: 20, d: 120 } },
];

export default {
  id: 'coupled-coils',
  title: 'Coupled coils',
  phase: 7,
  available: true,
  summary: 'Two coaxial coils: mutual inductance and coupling from the filament sum, the flux of one through the other, M and k against offset, transformer action with a load.',
  extent: [-0.08, 0.08, -0.05, 0.05],
  axes: ['z', 'x'],
  layers: [
    { id: 'Bmag', label: '|B| of coil 1', kind: 'scalar', unit: 'T', log: true, default: true, eq: 'B' },
    { id: 'B', label: 'B of coil 1', kind: 'vector', styles: ['arrows'] },
    { id: 'psi', label: 'Field lines of coil 1 (ψ contours)', kind: 'contour', default: true, eq: 'psi' },
    { id: 'link', label: 'Lines that thread coil 2', kind: 'contour', default: true, eq: 'M' },
  ],

  pDefaults: { N1: 100, a1: 15, l1: 30, N2: 50, a2: 20, l2: 20, d: 0, rw: 0.5, f: 1000, V1: 10, R: 10, open: true }, // turns, mm, mm, …, Hz, V, Ω

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) { const v = s[`cc_${k}`]; if (v === undefined) continue; this.p[k] = typeof this.pDefaults[k] === 'boolean' ? v === '1' : getNum(s, `cc_${k}`, this.p[k]); }
    this.p.N1 = Math.max(1, Math.round(this.p.N1)); this.p.N2 = Math.max(1, Math.round(this.p.N2));
    this.views = [plotView('sweep', 'M and k against offset', (ctx, w, h) => this.drawSweep(ctx, w, h)), plotView('xfmr', 'Transformer waveforms', (ctx, w, h) => this.drawXfmr(ctx, w, h))];
    this.build();
    this.buildControls();
  },

  coils() { const p = this.p, mm = 1e-3; return { c1: { N: p.N1, a: p.a1 * mm, l: p.l1 * mm, zc: 0 }, c2: { N: p.N2, a: p.a2 * mm, l: p.l2 * mm, zc: p.d * mm } }; },
  build() {
    const { c1, c2 } = this.coils();
    const span = Math.max(c1.l / 2, c1.a, Math.abs(c2.zc) + c2.l / 2, c2.a) * 1.5 + 0.005;
    this.extent = [-span, span, -0.8 * span, 0.8 * span];
    this.shell.setExtent(this.extent, ['z', 'x']);
    this.T1 = coilTurns(c1).map((t) => ({ I: 1, R: t.R, zc: t.zc }));
    this.results = null;
  },

  compute() {
    const E = this.extent, T = this.T1;
    const gm = new Grid2D(NZ, NX, E), gz = new Grid2D(NZ, NX, E), gx = new Grid2D(NZ, NX, E), gp = new Grid2D(NZ, NX, E), mid = (NX - 1) / 2;
    for (let j = 0; j <= mid; j++) { const x = gm.y(j); for (let i = 0; i < NZ; i++) { const z = gm.x(i), [br, bz] = turnsB(T, Math.abs(x), z), psi = turnsPsi(T, Math.abs(x), z); for (const [jj, sx] of [[j, 1], [NX - 1 - j, -1]]) { const k = jj * NZ + i; gm.data[k] = Math.hypot(br, bz); gz.data[k] = bz; gx.data[k] = sx * (x < 0 ? -br : br); gp.data[k] = psi; } } }
    this.gridBmag = gm; this.gridBz = gz; this.gridBx = gx; this.gridPsi = gp;
    const b = Array.from(gm.data).filter((v) => Number.isFinite(v) && v > 0).sort((p, q) => p - q), hi = b[Math.floor(0.985 * (b.length - 1))] || 1;
    this.bRange = [Math.max(b[Math.floor(0.03 * (b.length - 1))] || 1e-9, 1e-3 * hi), hi];
    const ps = Array.from(gp.data).filter(Number.isFinite).sort((p, q) => p - q); this.psiRange = [ps[Math.floor(0.01 * ps.length)], ps[Math.floor(0.995 * ps.length)]];
    this.finish();
  },

  finish() {
    const { c1, c2 } = this.coils(), p = this.p, rw = p.rw * 1e-3;
    const L1 = selfInductance(c1, rw), L2 = selfInductance(c2, rw), M = mutualInductance(c1, c2), k = coupling(M, L1, L2);
    const w = 2 * PI * p.f;
    const open = transformer({ L1, L2, M, R: Infinity, w, V1: p.V1 }), loaded = transformer({ L1, L2, M, R: p.open ? Infinity : p.R, w, V1: p.V1 });
    // ψ at coil 2's winding (its flux per turn from coil 1 at unit current) for the linked-lines contour
    const psi2 = turnsPsi(this.T1, c2.a, c2.zc);
    this.results = { L1, L2, M, k, open, loaded, w, psi2, frac: fluxFraction(M, L1), ratioTurns: p.N2 / p.N1 };
    this.renderResults();
  },

  render(layer, ctx, view, opts) {
    switch (layer) {
      case 'Bmag': return drawScalarField(ctx, this.gridBmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.bRange[0], max: opts.max ?? this.bRange[1] });
      case 'B': drawQuiver(ctx, view, (z, x) => { const [br, bz] = turnsB(this.T1, Math.abs(x), z); return [bz, x < 0 ? -br : br]; }, { normalize: true }); return null;
      case 'psi': drawContours(ctx, view, this.gridPsi, levelsBetween(this.psiRange[0], this.psiRange[1], 20), { color: 'rgba(0,0,0,0.45)' }); return null;
      case 'link': if (this.results) drawContours(ctx, view, this.gridPsi, [this.results.psi2], { color: '#e5484d', lineWidth: 2.5 }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const { c1, c2 } = this.coils();
    ctx.save();
    const coil = (c, color, label) => {
      const turns = coilTurns(c), small = turns.length > 40;
      for (const t of turns) for (const s of [1, -1]) { const [px, py] = view.toPx(t.zc, s * t.R); ctx.beginPath(); ctx.arc(px, py, small ? 2.5 : 5, 0, 2 * PI); ctx.fillStyle = color; ctx.fill(); }
      const [lx, ly] = view.toPx(c.zc, c.a); ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3; ctx.fillText(label, lx, ly - 10);
    };
    coil(c1, '#f5a623', `coil 1: N₁ = ${c1.N}`); coil(c2, '#7b61ff', `coil 2: N₂ = ${c2.N}`);
    const [x0, y0] = view.toPx(this.extent[0], 0), [x1] = view.toPx(this.extent[1], 0); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke(); ctx.setLineDash([]);
    const r = this.results; ctx.textAlign = 'left';
    if (r) { ctx.fillText(`M = ${sci(r.M, 4)} H · k = M/√(L₁L₂) = ${r.k.toFixed(4)}`, 10, view.height - 26); ctx.fillText('red: the field line of coil 1 that grazes coil 2; the flux inside it threads coil 2', 10, view.height - 10); }
    ctx.restore();
  },

  // ------------------------------------------------------------ plots

  frame(ctx, W, H, { lo, hi, a0, a1, xlabel, ylabel, top = 70, bottom = 48, left = 84, fmtX = (v) => sci(v, 3) }) {
    const L = left, T = top, B = bottom, Rm = 20;
    const px = (v) => L + ((v - a0) / (a1 - a0 || 1)) * (W - L - Rm), py = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955'; ctx.textAlign = 'left';
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 22, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(W - Rm, py(v)); ctx.stroke(); }
    for (let k = 0; k <= 6; k++) { const v = a0 + (k / 6) * (a1 - a0); ctx.fillStyle = '#5a5955'; ctx.fillText(fmtX(v), Math.min(px(v) - 14, W - Rm - 50), H - B + 16); }
    ctx.fillText(xlabel, W / 2 - 80, H - 6);
    ctx.save(); ctx.translate(10, T + 0.5 * (H - T - B)); ctx.rotate(-PI / 2); ctx.textAlign = 'center'; ctx.fillText(ylabel, 0, 0); ctx.restore(); ctx.textAlign = 'left';
    if (lo < 0 && hi > 0) { ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke(); }
    const line = (xs, ys, color, dash = [], width = 2) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); xs.forEach((x, k) => (k ? ctx.lineTo(px(x), py(ys[k])) : ctx.moveTo(px(x), py(ys[k])))); ctx.stroke(); ctx.setLineDash([]); };
    const legend = (items, y0 = 16) => { let lx = L, ly = y0; for (const [name, color, dash] of items) { const wdt = ctx.measureText(name).width + 46; if (lx + wdt > W - Rm && lx > L) { lx = L; ly += 16; } ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash(dash ?? []); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 28, ly + 4); lx += wdt; } return ly + 16; };
    const caption = (text, y) => { const words = text.split(' '); let lineTxt = ''; ctx.fillStyle = '#5a5955'; for (const wd of words) { const trial = lineTxt ? `${lineTxt} ${wd}` : wd; if (ctx.measureText(trial).width > W - L - Rm && lineTxt) { ctx.fillText(lineTxt, L, y); y += 14; lineTxt = wd; } else lineTxt = trial; } if (lineTxt) ctx.fillText(lineTxt, L, y); return y + 14; };
    return { px, py, line, legend, caption, L, T, B, Rm };
  },

  drawSweep(ctx, W, H) {
    if (!this.results) this.compute();
    const { c1, c2 } = this.coils(), r = this.results, p = this.p;
    const dmax = Math.max(0.12, 3 * Math.max(c1.l, c2.l, c1.a, c2.a)), n = 120, ds = [], Ms = [], ks = [];
    for (let i = 0; i < n; i++) { const d = (dmax * i) / (n - 1); const M = mutualInductance(c1, { ...c2, zc: d }); ds.push(d * 1e3); Ms.push(M); ks.push(coupling(M, r.L1, r.L2)); }
    const A = this.frame(ctx, W, H, { lo: Math.min(0, ...ks), hi: Math.max(...ks) * 1.1 || 1, a0: 0, a1: dmax * 1e3, xlabel: 'centre-to-centre offset d (mm)', ylabel: 'k = M/√(L₁L₂)', top: 84, fmtX: (v) => v.toFixed(0) });
    A.line(ds, ks, '#1f5fbf');
    ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(A.px(p.d), A.py(r.k), 5, 0, 2 * PI); ctx.fill();
    const y = A.legend([['k(d); the dot is the current offset', '#1f5fbf']]);
    A.caption(`M at the current offset is ${sci(r.M, 4)} H (k = ${r.k.toFixed(4)}); the curve is the filament sum repeated along the axis. For a long inner coil inside a short outer one the coupling is nearly flat until the ends pass; for two loops it falls off like a dipole, 1/d³ once d ≫ a.`, y);
  },

  drawXfmr(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, p = this.p, x = r.loaded, T = 1 / p.f, n = 400, ts = [], v1 = [], i1 = [], v2 = [], i2 = [];
    const inst = (c, t) => c[0] * Math.cos(r.w * t) - c[1] * Math.sin(r.w * t);
    for (let k = 0; k < n; k++) { const t = (2 * T * k) / (n - 1); ts.push(t * 1e3); v1.push(p.V1 * Math.cos(r.w * t)); i1.push(inst(x.I1, t)); v2.push(inst(x.V2, t)); i2.push(inst(x.I2, t)); }
    const half = Math.floor(H * 0.55);
    const vm = Math.max(p.V1, ...v2.map(Math.abs)) * 1.1;
    const A = this.frame(ctx, W, half, { lo: -vm, hi: vm, a0: 0, a1: 2 * T * 1e3, xlabel: '', ylabel: 'V', top: 76, bottom: 20, fmtX: (v) => v.toPrecision(3) });
    A.line(ts, v1, '#f5a623'); A.line(ts, v2, '#7b61ff', [5, 4]);
    const y = A.legend([[`v₁ (${p.V1} V)`, '#f5a623'], [`v₂ (${sci(cabs(x.V2), 4)} V, ${((carg(x.V2) * 180) / PI).toFixed(1)}°)${p.open ? ', open circuit' : `, across R = ${p.R} Ω`}`, '#7b61ff', [5, 4]]]);
    A.caption(p.open ? `Open secondary: v₂ = M di₁/dt and v₁ = L₁ di₁/dt, so v₂/v₁ = M/L₁ = k√(L₂/L₁) = ${r.open.ratio.toFixed(4)} (turns ratio N₂/N₁ = ${r.ratioTurns.toFixed(4)}; the ideal transformer would give that). The two voltages are in phase.` : `Loaded secondary: i₂ flows, its flux opposes i₁'s (Lenz), and i₁ grows to supply the load: the primary sees Z_in = jωL₁ + ω²M²/(R + jωL₂), whose real part ${sci(x.Zref[0], 4)} Ω is the load reflected into the primary.`, y);
    ctx.save(); ctx.translate(0, half);
    const im = Math.max(...i1.map(Math.abs), ...i2.map(Math.abs)) * 1.1 || 1;
    const B = this.frame(ctx, W, H - half, { lo: -im, hi: im, a0: 0, a1: 2 * T * 1e3, xlabel: 'time (ms)', ylabel: 'A', top: 26, bottom: 44, fmtX: (v) => v.toPrecision(3) });
    B.line(ts, i1, '#f5a623'); B.line(ts, i2, '#7b61ff', [5, 4]);
    B.legend([[`i₁ (${sci(cabs(x.I1), 4)} A)`, '#f5a623'], [`i₂ (${sci(cabs(x.I2), 4)} A)`, '#7b61ff', [5, 4]]], 12);
    ctx.restore();
  },

  // ------------------------------------------------------------ shell hooks

  statusText() { const r = this.results; if (!r) return ''; return `L₁ = ${sci(r.L1, 4)} H, L₂ = ${sci(r.L2, 4)} H, M = ${sci(r.M, 4)} H, k = ${r.k.toFixed(4)} · open-circuit v₂/v₁ = ${r.open.ratio.toFixed(4)}`; },
  probe(z, x) { const [br, bz] = turnsB(this.T1, Math.abs(x), z); return [{ label: 'B_z of coil 1 per ampere', value: bz, unit: 'T/A' }, { label: 'B_x of coil 1 per ampere', value: x < 0 ? -br : br, unit: 'T/A' }, { label: 'ψ = ρA_φ per ampere', value: turnsPsi(this.T1, Math.abs(x), z), unit: 'Wb/A' }, { label: 'threads coil 2?', value: this.results && Math.abs(turnsPsi(this.T1, Math.abs(x), z)) > Math.abs(this.results.psi2) ? 1 : 0, unit: '' }]; },
  getState() { const s = {}; for (const [k, v] of Object.entries(this.p)) s[`cc_${k}`] = typeof v === 'boolean' ? (v ? 1 : 0) : v; return s; },
  csv() {
    const { c1, c2 } = this.coils(); if (!this.results) this.finish();
    const lines = ['d_m,M_H,k'];
    for (let i = 0; i <= 100; i++) { const d = (0.15 * i) / 100, M = mutualInductance(c1, { ...c2, zc: d }); lines.push(`${d},${M},${coupling(M, this.results.L1, this.results.L2)}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Coupled coils'));
    box.appendChild(ui.lead(shell, 'Two coils share flux: the current in one links the other through M, and a changing current induces a voltage there. That is the transformer.'));
    const re = () => { this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const light = () => { this.finish(); this.buildControls(); shell.updateStageView(); shell.refreshStatus(); shell.syncUrl(); };
    box.appendChild(ui.el('h2', '', 'Presets'));
    const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
    for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => { Object.assign(p, pr.p); re(); }, 'btn btn-small'));
    box.appendChild(pw);
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = key.startsWith('N') ? Math.max(1, Math.round(v)) : v; after(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Coil 1 (driven)')); row(pf('N1', 'Turns N₁', 1, 2000), pf('a1', 'Radius a₁ (mm)', 1, 500), pf('l1', 'Length l₁ (mm)', 0, 1000));
    box.appendChild(ui.el('h2', '', 'Coil 2')); row(pf('N2', 'Turns N₂', 1, 2000), pf('a2', 'Radius a₂ (mm)', 1, 500), pf('l2', 'Length l₂ (mm)', 0, 1000));
    const lab = ui.el('div', 'hint', `centre-to-centre offset d: ${p.d} mm`); box.appendChild(lab);
    box.appendChild(ui.range(p.d, { min: 0, max: 200, step: 1, ariaLabel: 'offset of coil 2 (mm)', onInput: (v) => { p.d = v; lab.textContent = `centre-to-centre offset d: ${v} mm`; this.build(); this.finish(); shell.redraw(); shell.refreshStatus(); clearTimeout(this.urlT); this.urlT = setTimeout(() => shell.syncUrl(), 300); } }));
    row(pf('rw', 'Wire radius for a single turn (mm)', 0.01, 10, light));
    box.appendChild(ui.el('p', 'hint', 'M is Maxwell’s coaxial-filament formula summed over every pair of turns; L₁ and L₂ are Nagaoka’s single-layer formula (the ring formula for one turn). k = M/√(L₁L₂) ≤ 1: how much of one coil’s flux the other catches. The red field line of coil 1 grazes coil 2’s winding; the lines inside it are the shared flux.'));
    box.appendChild(ui.el('h2', '', 'Transformer'));
    row(pf('f', 'Frequency f (Hz)', 0.1, 1e9, light), pf('V1', 'Primary voltage amplitude V₁ (V)', 1e-3, 1e5, light));
    row(ui.field('Secondary', ui.select([['1', 'open circuit'], ['0', 'resistive load R']], p.open ? '1' : '0', (v) => { p.open = v === '1'; light(); })));
    if (!p.open) row(pf('R', 'Load R (Ω)', 1e-3, 1e9, light));
    box.appendChild(ui.el('p', 'hint', 'v₁ = L₁ di₁/dt + M di₂/dt and v₂ = M di₁/dt + L₂ di₂/dt. Open secondary: v₂/v₁ = M/L₁. With a load the secondary current opposes the primary flux, the primary draws more current, and the load appears in the primary as ω²M²/(R + jωL₂). Air-core coils here, so the ideal turns ratio is only approached as k → 1.'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('M, k vs offset', () => { shell.setStageView('sweep'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Transformer waveforms', () => { shell.setStageView('xfmr'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, p = this.p, x = r.loaded, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('L₁ (Nagaoka)', `${sci(r.L1, 5)} H`); row('L₂', `${sci(r.L2, 5)} H`); row('M (filament sum over turn pairs)', `${sci(r.M, 5)} H`); row('k = M/√(L₁L₂)', r.k.toFixed(5)); row('flux fraction M/L₁ = N₂Φ₂₁/(N₁Φ₁₁)', r.frac.toFixed(5)); row('turns ratio N₂/N₁', r.ratioTurns.toFixed(4));
    row('open-circuit v₂/v₁ = M/L₁ = k√(L₂/L₁)', r.open.ratio.toFixed(5)); row('open-circuit v₂ amplitude', `${sci(cabs(r.open.V2), 4)} V`); row('magnetizing current amplitude V₁/ωL₁', `${sci(cabs(r.open.I1), 4)} A`);
    if (!p.open) { row(`with R = ${p.R} Ω: v₂, i₂`, `${sci(cabs(x.V2), 4)} V, ${sci(cabs(x.I2), 4)} A`); row('i₁', `${sci(cabs(x.I1), 4)} A (phase ${((carg(x.I1) * 180) / PI).toFixed(1)}°)`); row('Z_in seen by the source', `${sci(x.Zin[0], 4)} + j${sci(x.Zin[1], 4)} Ω`); row('reflected impedance ω²M²/(R + jωL₂)', `${sci(x.Zref[0], 4)} + j${sci(x.Zref[1], 4)} Ω`); row('power in = power to the load', `${sci(x.Pin, 4)} W = ${sci(x.Pload, 4)} W`); }
  },
};
