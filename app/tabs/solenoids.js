// Solenoids tab: the field of a solenoid built up from its turns by Biot–Savart (the exact
// loop field with elliptic integrals), shown in the plane through the axis. Where
// B = μ₀nI comes from, where it fails (short coils, the ends), the ideal current sheet
// against N discrete turns, a single loop, and the Helmholtz pair. Air core throughout;
// the permeable core is the Inductors tab.

import { MU0, PI } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween } from '../../core/render.js';
import { solenoidTurns, pairTurns, turnsB, turnsPsi, sheetAxisBz, longBz, nagaokaL, axisProfile } from '../../core/solenoid.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const NZ = 161, NX = 121; // grid: z along the screen x axis, transverse x along the screen y axis
const KINDS = [['solenoid', 'Solenoid (N turns)'], ['sheet', 'Ideal current sheet (same n, L, a)'], ['loop', 'Single loop'], ['pair', 'Two loops (Helmholtz when d = a)']];
const PRESETS = [
  { label: 'Long solenoid (L = 10a)', kind: 'solenoid', p: { N: 200, I: 1, L: 100, a: 10 } },
  { label: 'Short coil (L = a)', kind: 'solenoid', p: { N: 20, I: 1, L: 20, a: 20 } },
  { label: 'Lab 5 coil, air core', kind: 'solenoid', p: { N: 100, I: 1, L: 30, a: 15 } },
  { label: 'Ideal sheet, same coil', kind: 'sheet', p: { N: 100, I: 1, L: 30, a: 15 } },
  { label: 'Single loop', kind: 'loop', p: { I: 1, a: 20 } },
  { label: 'Helmholtz pair (d = a)', kind: 'pair', p: { I: 1, a: 30, d: 30, sign: 1 } },
  { label: 'Anti-Helmholtz (gradient)', kind: 'pair', p: { I: 1, a: 30, d: 30, sign: -1 } },
];
const SHEET_FILAMENTS = 400;

export default {
  id: 'solenoids',
  title: 'Solenoids',
  phase: 7,
  available: true,
  summary: 'A solenoid built from its turns by Biot–Savart: where B = μ₀nI holds, the ends, discrete turns vs a current sheet, a single loop, the Helmholtz pair.',
  extent: [-0.075, 0.075, -0.05, 0.05],
  axes: ['z', 'x'],
  layers: [
    { id: 'Bmag', label: '|B|', kind: 'scalar', unit: 'T', log: true, default: true, eq: 'B' },
    { id: 'Bz', label: 'B_z (along the axis)', kind: 'scalar', unit: 'T', signed: true, eq: 'B' },
    { id: 'Bx', label: 'B_x (transverse)', kind: 'scalar', unit: 'T', signed: true, eq: 'B' },
    { id: 'B', label: 'B field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'psi', label: 'Field lines (ψ = ρA_φ contours)', kind: 'contour', default: true, eq: 'psi' },
  ],

  pDefaults: { N: 100, I: 1, L: 30, a: 15, d: 30, sign: 1 }, // turns, A, mm, mm, mm

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.kind = KINDS.some(([k]) => k === s.kind) ? s.kind : 'solenoid';
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `s_${k}`, this.p[k]);
    this.p.N = Math.max(1, Math.round(this.p.N)); this.p.sign = this.p.sign < 0 ? -1 : 1;
    this.views = [
      plotView('axis', 'Along the axis', (ctx, w, h) => this.drawAxisPlot(ctx, w, h)),
      plotView('radial', 'Across the centre', (ctx, w, h) => this.drawRadialPlot(ctx, w, h)),
    ];
    this.build();
    this.buildControls();
  },

  // ------------------------------------------------------------ model

  turns() {
    const mm = 1e-3, p = this.p;
    switch (this.kind) {
      case 'sheet': return solenoidTurns(SHEET_FILAMENTS, (p.N * p.I) / SHEET_FILAMENTS, p.L * mm, p.a * mm);
      case 'loop': return [{ I: p.I, R: p.a * mm, zc: 0 }];
      case 'pair': return pairTurns(p.I, p.a * mm, p.d * mm, p.sign);
      default: return solenoidTurns(p.N, p.I, p.L * mm, p.a * mm);
    }
  },

  /** Length and radius that set the picture: the winding, or the loop(s). */
  dims() { const mm = 1e-3, p = this.p; return this.kind === 'loop' ? { L: 0, a: p.a * mm } : this.kind === 'pair' ? { L: p.d * mm, a: p.a * mm } : { L: p.L * mm, a: p.a * mm }; },

  build() {
    this.T = this.turns();
    const { L, a } = this.dims();
    const span = Math.max(L / 2, a) * 1.6 + 0.004;
    this.extent = [-span, span, -0.72 * span, 0.72 * span];
    this.shell.setExtent(this.extent, ['z', 'x']);
    const p = this.p, mm = 1e-3, n = this.kind === 'loop' ? NaN : this.kind === 'pair' ? NaN : p.N / (p.L * mm);
    this.n = n;
  },

  /** B at (z, x) in the plane: B_x = sign(x) B_rho. */
  B(z, x) { const [br, bz] = turnsB(this.T, Math.abs(x), z); return [bz, x < 0 ? -br : br]; },

  compute() {
    const E = this.extent, T = this.T;
    // symmetric in x: compute the upper half and mirror
    const gz = new Grid2D(NZ, NX, E), gx = new Grid2D(NZ, NX, E), gm = new Grid2D(NZ, NX, E), gp = new Grid2D(NZ, NX, E);
    const mid = (NX - 1) / 2;
    for (let j = 0; j <= mid; j++) {
      const x = gz.y(j);
      for (let i = 0; i < NZ; i++) {
        const z = gz.x(i), [br, bz] = turnsB(T, Math.abs(x), z), psi = turnsPsi(T, Math.abs(x), z);
        const bx = x < 0 ? -br : br;
        const jm = NX - 1 - j;
        for (const [jj, sx] of [[j, 1], [jm, -1]]) { const k = jj * NZ + i; gz.data[k] = bz; gx.data[k] = sx * bx; gm.data[k] = Math.hypot(bx, bz); gp.data[k] = psi; }
      }
    }
    this.gridBz = gz; this.gridBx = gx; this.gridBmag = gm; this.gridPsi = gp;
    const b = Array.from(gm.data).filter((v) => Number.isFinite(v) && v > 0).sort((p, q) => p - q);
    const hi = b[Math.floor(0.985 * (b.length - 1))] || 1;
    this.bRange = [Math.max(b[Math.floor(0.03 * (b.length - 1))] || 1e-9, 1e-3 * hi), hi];
    this.zRange = [-hi, hi];
    const ps = Array.from(gp.data).filter(Number.isFinite).sort((p, q) => p - q);
    this.psiRange = [ps[Math.floor(0.01 * ps.length)], ps[Math.floor(0.995 * ps.length)]];
    this.finish();
  },

  finish() {
    const { L, a } = this.dims(), p = this.p, T = this.T;
    const B0 = turnsB(T, 0, 0)[1];
    const prof = axisProfile(T, L, a);
    const r = { B0, prof };
    if (this.kind === 'solenoid' || this.kind === 'sheet') {
      r.Blong = longBz(this.n, p.I);
      r.Bsheet0 = sheetAxisBz(this.n, p.I, L, a, 0);
      r.Bend = turnsB(T, 0, L / 2)[1];
      r.BsheetEnd = sheetAxisBz(this.n, p.I, L, a, L / 2);
      r.Lnag = nagaokaL(p.N, L, a); r.Llong = (MU0 * p.N * p.N * PI * a * a) / L;
      r.Bwall = turnsB(T, 0.5 * a, 0)[1];
    }
    if (this.kind === 'loop') { r.Bloop = (MU0 * p.I) / (2 * a); r.Bfar = turnsB(T, 0, 5 * a)[1]; r.dipole = (MU0 * p.I * PI * a * a) / (2 * PI * Math.pow(5 * a, 3)); }
    if (this.kind === 'pair') { const h = a / 10, hg = a / 400; r.Bh = turnsB(T, 0, h)[1]; r.Bhelm = p.sign > 0 ? Math.pow(0.8, 1.5) * (MU0 * p.I) / a : 0; r.grad = (turnsB(T, 0, hg)[1] - turnsB(T, 0, -hg)[1]) / (2 * hg); r.gradIdeal = p.sign < 0 ? (48 / (25 * Math.sqrt(5))) * (MU0 * p.I) / (a * a) : 0; }
    this.results = r;
    this.renderResults();
  },

  render(layer, ctx, view, opts) {
    const bFn = (z, x) => this.B(z, x);
    switch (layer) {
      case 'Bmag': return drawScalarField(ctx, this.gridBmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.bRange[0], max: opts.max ?? this.bRange[1] });
      case 'Bz': return drawScalarField(ctx, this.gridBz, { map: opts.map, extent: opts.extent, min: opts.min ?? this.zRange[0], max: opts.max ?? this.zRange[1] });
      case 'Bx': return drawScalarField(ctx, this.gridBx, { map: opts.map, extent: opts.extent, min: opts.min ?? this.zRange[0], max: opts.max ?? this.zRange[1] });
      case 'B':
        if (opts.style === 'lines') {
          const { a } = this.dims(), seeds = [];
          for (let k = 1; k <= 9; k++) for (const s of [-1, 1]) seeds.push([0, s * (k / 10) * a]);
          seeds.push([0, 0]);
          drawStreamlines(ctx, view, bFn, seeds, { maxSteps: 4000, stopFn: (z, x) => this.T.length <= 2 && this.T.some((t) => Math.hypot(z - t.zc, Math.abs(x) - t.R) < 0.02 * t.R) });
        } else drawQuiver(ctx, view, bFn, { normalize: true });
        return null;
      case 'psi': drawContours(ctx, view, this.gridPsi, levelsBetween(this.psiRange[0], this.psiRange[1], 22), { color: 'rgba(0,0,0,0.55)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const T = this.T, small = T.length > 60;
    ctx.save();
    // each turn is two wire cross-sections: + at x = +R (current out of the page for I > 0 on top... phi sense: at x = +R the current flows -y, drawn as ×; at x = -R as •)
    for (const t of T) {
      for (const s of [1, -1]) {
        const [px, py] = view.toPx(t.zc, s * t.R), out = (t.I > 0) === (s < 0);
        if (this.kind === 'sheet') { ctx.fillStyle = t.I > 0 ? 'rgba(245,166,35,0.6)' : 'rgba(123,97,255,0.6)'; ctx.fillRect(px - 1, py - 3, 2, 6); continue; }
        ctx.beginPath(); ctx.arc(px, py, small ? 3 : 7, 0, 2 * PI); ctx.fillStyle = out ? '#f5a623' : '#7b61ff'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        if (!small) { ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(out ? '•' : '×', px, py + 0.5); }
      }
    }
    // the axis
    const [x0, y0] = view.toPx(this.extent[0], 0), [x1] = view.toPx(this.extent[1], 0);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke(); ctx.setLineDash([]);
    // uniform region on the axis
    const r = this.results;
    if (r && this.kind !== 'loop') { const [ua, ub] = r.prof.uniform; if (ub > ua) { const [xa] = view.toPx(ua, 0), [xb] = view.toPx(ub, 0); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xa, y0); ctx.lineTo(xb, y0); ctx.stroke(); } }
    ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    if (r) ctx.fillText(`B on the axis at the centre: ${sci(r.B0, 4)} T${Number.isFinite(this.n) ? `   ·   μ₀nI = ${sci(r.Blong, 4)} T   ·   yellow: within 1 % of the centre value` : ''}`, 10, view.height - 10);
    ctx.restore();
  },

  // ------------------------------------------------------------ plots

  axesBox(ctx, W, H, lo, hi, a0, a1, xlabel, ylabel, fmtX) {
    const L = 92, T = 80, B = 52, Rm = 20;
    const px = (v) => L + ((v - a0) / (a1 - a0 || 1)) * (W - L - Rm), py = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955'; ctx.textAlign = 'left';
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 24, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(W - Rm, py(v)); ctx.stroke(); }
    for (let k = 0; k <= 6; k++) { const v = a0 + (k / 6) * (a1 - a0); ctx.fillText(fmtX(v), px(v) - 12, H - B + 16); }
    ctx.fillText(xlabel, W / 2 - 80, H - 8);
    ctx.save(); ctx.translate(10, T + 0.5 * (H - T - B)); ctx.rotate(-PI / 2); ctx.textAlign = 'center'; ctx.fillText(ylabel, 0, 0); ctx.restore();
    if (lo < 0 && hi > 0) { ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke(); }
    const line = (pts, color, dash = []) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath(); pts.forEach(([X, Y], k) => (k === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y))); ctx.stroke(); ctx.setLineDash([]); };
    const legend = (items) => { let lx = L, ly = 16; for (const [name, color, dash] of items) { const wdt = ctx.measureText(name).width + 28 + 18; if (lx + wdt > W - Rm && lx > L) { lx = L; ly += 16; } ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash(dash ?? []); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 28, ly + 4); lx += wdt; } };
    const caption = (text) => { const words = text.split(' '); let lineTxt = '', y = 52; for (const wd of words) { const trial = lineTxt ? `${lineTxt} ${wd}` : wd; if (ctx.measureText(trial).width > W - L - Rm && lineTxt) { ctx.fillText(lineTxt, L, y); y += 14; lineTxt = wd; } else lineTxt = trial; } if (lineTxt) ctx.fillText(lineTxt, L, y); };
    return { px, py, line, legend, caption, L, T, B, Rm };
  },

  drawAxisPlot(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, { L: len, a } = this.dims(), p = this.p;
    const z = r.prof.z, Bz = r.prof.Bz;
    const curves = [['B_z on the axis (Biot–Savart)', '#1f5fbf', Bz]];
    if (Number.isFinite(this.n)) { curves.push(['ideal sheet (cos θ₁ + cos θ₂)/2 formula', '#e5484d', z.map((zz) => sheetAxisBz(this.n, p.I, len, a, zz)), [6, 4]]); curves.push(['μ₀nI (infinite solenoid)', '#2a9d4b', z.map(() => r.Blong), [2, 3]]); }
    const vals = curves.flatMap((c) => c[2]).filter(Number.isFinite);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const A = this.axesBox(ctx, W, H, lo - 0.05 * (hi - lo), hi + 0.05 * (hi - lo), z[0], z[z.length - 1], 'z along the axis (mm)', 'B_z (T)', (v) => (v * 1e3).toFixed(0));
    if (len > 0) { ctx.fillStyle = 'rgba(245,166,35,0.15)'; ctx.fillRect(A.px(-len / 2), A.T, A.px(len / 2) - A.px(-len / 2), H - A.T - A.B); }
    const [ua, ub] = r.prof.uniform; if (ub > ua) { ctx.fillStyle = 'rgba(253,224,71,0.35)'; ctx.fillRect(A.px(ua), A.T, A.px(ub) - A.px(ua), H - A.T - A.B); }
    for (const [, color, ys, dash] of curves) A.line(z.map((zz, k) => [A.px(zz), A.py(ys[k])]), color, dash);
    A.legend(curves.map(([n, c, , d]) => [n, c, d]));
    ctx.fillStyle = '#5a5955';
    A.caption(Number.isFinite(this.n) ? `centre ${sci(r.B0, 4)} T = ${(100 * r.B0 / r.Blong).toFixed(1)} % of μ₀nI · at the end ${(100 * r.Bend / r.B0).toFixed(1)} % of the centre (→ 50 % for a long coil) · orange band: the winding · yellow: within 1 % of the centre` : `centre ${sci(r.B0, 4)} T · yellow: within 1 % of the centre value`);
  },

  drawRadialPlot(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, { a } = this.dims(), p = this.p;
    const xs = [], bz = [], bx = [];
    const xm = this.extent[3];
    for (let k = 0; k <= 200; k++) { const x = -xm + (2 * xm * k) / 200; xs.push(x); const [z0, x0] = this.B(1e-9, x); bz.push(z0); bx.push(x0); }
    // across the centre plane B_x is zero by symmetry; show B_z and, at a quarter of the length, both
    const { L: len } = this.dims();
    const zq = len > 0 ? len / 2 : a / 2;
    const bzq = xs.map((x) => this.B(zq, x)[0]), bxq = xs.map((x) => this.B(zq, x)[1]);
    const curves = [['B_z across the centre plane (z = 0)', '#1f5fbf', bz], [`B_z at z = ${(zq * 1e3).toFixed(1)} mm${len > 0 ? ' (the end)' : ''}`, '#e5484d', bzq, [6, 4]], [`B_x at z = ${(zq * 1e3).toFixed(1)} mm`, '#2a9d4b', bxq, [2, 3]]];
    const vals = curves.flatMap((c) => c[2]).filter(Number.isFinite);
    const s = vals.slice().sort((u, v) => u - v), lo = Math.min(0, s[Math.floor(0.02 * s.length)]), hi = Math.max(0, s[Math.floor(0.98 * s.length)]);
    const A = this.axesBox(ctx, W, H, lo - 0.05 * (hi - lo), hi + 0.05 * (hi - lo), -xm, xm, 'x across the coil (mm)', 'B (T)', (v) => (v * 1e3).toFixed(0));
    ctx.fillStyle = 'rgba(245,166,35,0.15)'; ctx.fillRect(A.px(-a), A.T, A.px(a) - A.px(-a), H - A.T - A.B);
    for (const [, color, ys, dash] of curves) A.line(xs.map((x, k) => [A.px(x), A.py(Math.max(lo - 0.05 * (hi - lo), Math.min(hi + 0.05 * (hi - lo), ys[k])))]), color, dash);
    A.legend(curves.map(([n, c, , d]) => [n, c, d]));
    ctx.fillStyle = '#5a5955';
    A.caption('orange band: inside the winding (|x| < a). Inside a long coil B_z is flat across the bore; outside it reverses (the return flux) and is weak. At the end B_z is about half and B_x appears.');
    void p;
  },

  // ------------------------------------------------------------ shell hooks

  statusText() {
    const r = this.results; if (!r) return '';
    const { L, a } = this.dims();
    const tn = this.T.length;
    const what = this.kind === 'sheet' ? `${SHEET_FILAMENTS} filaments, L/2a = ${(L / (2 * a)).toFixed(2)}` : this.kind === 'pair' ? `2 loops, d/a = ${(L / a).toFixed(2)}` : this.kind === 'loop' ? '1 loop' : `${tn} turn${tn > 1 ? 's' : ''}, L/2a = ${(L / (2 * a)).toFixed(2)}`;
    return `${what} · B centre ${sci(r.B0, 4)} T${Number.isFinite(this.n) ? ` = ${(100 * r.B0 / r.Blong).toFixed(1)} % of μ₀nI` : ''} · ${NZ}×${NX} grid`;
  },

  probe(z, x) {
    const [bz, bx] = this.B(z, x), out = [{ label: 'B_z', value: bz, unit: 'T' }, { label: 'B_x (transverse)', value: bx, unit: 'T' }, { label: '|B|', value: Math.hypot(bz, bx), unit: 'T' }];
    if (Number.isFinite(this.n)) { out.push({ label: 'μ₀ n I', value: longBz(this.n, this.p.I), unit: 'T' }); if (Math.abs(x) < 1e-6) out.push({ label: 'ideal sheet, on axis', value: sheetAxisBz(this.n, this.p.I, this.dims().L, this.dims().a, z), unit: 'T' }); }
    out.push({ label: 'ψ = ρA_φ (field-line label)', value: turnsPsi(this.T, Math.abs(x), z), unit: 'T·m²' });
    return out;
  },

  getState() { const s = { kind: this.kind }; for (const [k, v] of Object.entries(this.p)) s[`s_${k}`] = v; return s; },

  csv() {
    const g = this.gridBz, lines = ['z_m,x_m,Bz_T,Bx_T,Bmag_T,psi_Tm2'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridBx.get(i, j)},${this.gridBmag.get(i, j)},${this.gridPsi.get(i, j)}`);
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Solenoids'));
    box.appendChild(ui.lead(shell, 'The field of a solenoid built up turn by turn from Biot–Savart, in the plane through its axis.'));
    const re = () => { this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    box.appendChild(ui.el('h2', '', 'Presets'));
    const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
    for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => { this.kind = pr.kind; Object.assign(this.p, pr.p); re(); }, 'btn btn-small'));
    box.appendChild(pw);

    box.appendChild(ui.el('h2', '', 'Winding'));
    box.appendChild(ui.field('Kind', ui.select(KINDS, this.kind, (v) => { this.kind = v; re(); })));
    const pf = (key, label, min, max) => ui.field(label, ui.number(this.p[key], { min, max, onChange: (v) => { this.p[key] = key === 'N' ? Math.max(1, Math.round(v)) : v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    if (this.kind === 'solenoid' || this.kind === 'sheet') {
      row(pf('N', 'Turns N', 1, 400), pf('I', 'Current I (A)', -100, 100));
      row(pf('L', 'Length L (mm)', 1, 300), pf('a', 'Radius a (mm)', 1, 100));
      const n = this.p.N / (this.p.L * 1e-3);
      box.appendChild(ui.el('p', 'hint', `n = N/L = ${n.toFixed(0)} turns/m, so μ₀nI = ${sci(longBz(n, this.p.I), 4)} T. ${this.kind === 'sheet' ? `The ideal sheet is ${SHEET_FILAMENTS} filaments carrying NI between them: the cos θ₁ + cos θ₂ formula is exact for it on the axis.` : 'Each turn is one circular loop (exact elliptic-integral field); the ripple between turns shows near the winding.'}`));
    } else if (this.kind === 'loop') { row(pf('I', 'Current I (A)', -100, 100), pf('a', 'Radius a (mm)', 1, 100)); box.appendChild(ui.el('p', 'hint', 'One turn: B at the centre is μ₀I/2a, and far away the field is a dipole falling as 1/z³. The field lines (ψ contours) are exact.')); }
    else { row(pf('I', 'Current I (A)', -100, 100), pf('a', 'Radius a (mm)', 1, 100)); row(pf('d', 'Separation d (mm)', 1, 300), ui.field('Second loop', ui.select([[1, 'Same sense (Helmholtz)'], [-1, 'Opposite sense (anti-Helmholtz)'], ], String(this.p.sign), (v) => { this.p.sign = parseInt(v, 10); re(); }))); box.appendChild(ui.el('p', 'hint', 'With d = a and the same sense the second derivative of B_z on the axis vanishes at the centre (Helmholtz): B = (4/5)^{3/2} μ₀I/a and flat over a wide region. Opposite senses give zero field and a uniform gradient at the centre (the anti-Helmholtz or Maxwell gradient coil).')); }

    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', this.kind === 'solenoid' || this.kind === 'sheet' ? 'μ₀nI is the infinite-solenoid value; the sheet formula (μ₀nI/2)(cos θ₁ + cos θ₂) is exact on the axis of an ideal current sheet of finite length; the turn-by-turn sum is the real coil. At the end of a long coil B is half the centre value: half the lines have already leaked out. L (Nagaoka) is the single-layer inductance with the end correction, the same reference the Inductors tab uses.' : this.kind === 'loop' ? 'The centre value and the far-field dipole check the loop field at both ends of its range.' : 'The Helmholtz check is the flatness of B_z near the centre: at z = a/10 the field is within 1.5 × 10⁻⁴ of the centre value for d = a; move d away and the error grows quadratically.'));
    const cr = ui.el('div', 'row');
    cr.append(ui.button('B along the axis', () => { shell.setStageView('axis'); shell.syncUrl(); }, 'btn btn-small'), ui.button('B across the coil', () => { shell.setStageView('radial'); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(cr);
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    const { L, a } = this.dims();
    row('B on the axis at the centre (turn by turn)', `${sci(r.B0, 5)} T`);
    if (Number.isFinite(this.n)) {
      row('μ₀ n I (infinite solenoid)', `${sci(r.Blong, 5)} T`);
      row('ideal sheet at the centre, (μ₀nI/2)(cos θ₁ + cos θ₂)', `${sci(r.Bsheet0, 5)} T`);
      row('centre / μ₀nI', `${(r.B0 / r.Blong).toFixed(4)}`);
      row('B at the end of the winding (axis)', `${sci(r.Bend, 5)} T (${(100 * r.Bend / r.B0).toFixed(1)} % of the centre; sheet formula ${sci(r.BsheetEnd, 4)} T)`);
      row('B at the centre plane, halfway to the wall', `${sci(r.Bwall, 5)} T (${(100 * r.Bwall / r.B0).toFixed(2)} % of the axis value)`);
      row('axis region within 1 % of the centre', `${((r.prof.uniform[1] - r.prof.uniform[0]) * 1e3).toFixed(1)} mm of L = ${(L * 1e3).toFixed(1)} mm`);
      row('L (Nagaoka, single layer)', `${sci(r.Lnag, 5)} H`); row('L (long solenoid, μ₀N²πa²/L)', `${sci(r.Llong, 5)} H`);
    }
    if (this.kind === 'loop') { row('μ₀I/2a (centre of one loop)', `${sci(r.Bloop, 5)} T`); row('B on the axis at z = 5a', `${sci(r.Bfar, 5)} T`); row('dipole μ₀m/(2πz³) with m = Iπa²', `${sci(r.dipole, 5)} T (${(100 * r.Bfar / r.dipole).toFixed(2)} %)`); }
    if (this.kind === 'pair') {
      if (this.p.sign > 0) { row('Helmholtz value (4/5)^{3/2} μ₀I/a (exact when d = a)', `${sci(r.Bhelm, 5)} T`); row('B(z = a/10) / B(0) − 1', `${(r.Bh / r.B0 - 1).toExponential(3)}`); }
      else { row('|dB_z/dz| at the centre', `${sci(Math.abs(r.grad), 5)} T/m`); row('anti-Helmholtz value 48μ₀I/(25√5 a²) (d = a)', `${sci(r.gradIdeal, 5)} T/m`); }
      if (this.p.sign > 0) row('axis region within 1 % of the centre', `${((r.prof.uniform[1] - r.prof.uniform[0]) * 1e3).toFixed(1)} mm (a = ${(a * 1e3).toFixed(1)} mm)`);
    }
  },
};
