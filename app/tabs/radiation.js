// Radiation tab: the Hertzian dipole. The exact fields of a short current element in the
// plane through its axis, animated, with the E field lines as contours of r sinθ H_φ so the
// detaching loops are visible; the near-field to far-field transition along a radius; the
// sin²θ pattern; radiation resistance and power. Closed form.

import { PI } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawContours, levelsBetween } from '../../core/render.js';
import { wavenumber, hertzFields, farFields, instantaneous, streamPsi, poyntingAvg, radiation, nearFarBoundary } from '../../core/radiation.js';
import { ETA0 } from '../../core/planewave.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const N = 161;

export default {
  id: 'radiation',
  title: 'Radiation',
  phase: 7,
  available: true,
  summary: 'The Hertzian dipole: exact fields animated with the detaching field lines, near vs far field along a radius, the sin²θ pattern, radiation resistance and power.',
  extent: [-1.5, 1.5, -1.5, 1.5],
  axes: ['x', 'z'],
  layers: [
    { id: 'Emag', label: '|E| (snapshot)', kind: 'scalar', unit: 'V/m', log: true, default: true, eq: 'E' },
    { id: 'Hphi', label: 'H_φ (snapshot, signed)', kind: 'scalar', unit: 'A/m', signed: true, eq: 'H' },
    { id: 'S', label: 'time-average Poynting S_r', kind: 'scalar', unit: 'W/m²', log: true, eq: 'S' },
    { id: 'E', label: 'E (snapshot)', kind: 'vector', styles: ['arrows'] },
    { id: 'lines', label: 'E field lines (snapshot)', kind: 'contour', default: true, eq: 'psi', note: 'Level curves of the stream function of the instantaneous E; the E arrows are tangent to them.' },
    { id: 'nf', label: 'near/far boundary kr = 1', kind: 'contour', default: true, eq: 'kr' },
  ],

  pDefaults: { f: 300, dl: 10, I0: 1, span: 1.5, dist: 1000 }, // MHz, mm, A, extent in wavelengths, distance for the far-field number (m)

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `rd_${k}`, this.p[k]);
    this.t = getNum(s, 't', 0); this.speed = getNum(s, 'spd', 0.1); this.playing = false;
    this.views = [plotView('radial', 'Near and far field along a radius', (ctx, w, h) => this.drawRadial(ctx, w, h)), plotView('pattern', 'Radiation pattern', (ctx, w, h) => this.drawPattern(ctx, w, h))];
    this.build();
    if (Math.abs(shell.probePt[0]) < 1e-12 && Math.abs(shell.probePt[1]) < 1e-12) { const px = +(0.4 * this.lambda).toPrecision(3), pz = +(0.25 * this.lambda).toPrecision(3); shell.probePt = [px, pz]; shell.$('probe-x').value = String(px); shell.$('probe-y').value = String(pz); }
    this.buildControls();
    this.shell.layerOn.set('E', false);
  },
  destroy() { this.stop(); },

  f() { return this.p.f * 1e6; },
  dl() { return this.p.dl * 1e-3; },
  build() { const { lambda } = wavenumber(this.f()); this.lambda = lambda; const L = this.p.span * lambda; this.extent = [-L, L, -L, L]; this.shell.setExtent(this.extent, ['x', 'z']); this.rmin = 0.03 * lambda; this.results = null; },

  fieldsAt(x, z, t) {
    const r = Math.max(Math.hypot(x, z), this.rmin), th = Math.atan2(Math.abs(x), z);
    const i = instantaneous(this.p.I0, this.dl(), this.f(), r, th, t);
    // unit vectors in the (x, z) plane: r̂ = (sinθ sgn(x), cosθ), θ̂ = (cosθ sgn(x), −sinθ)
    const sg = x < 0 ? -1 : 1, s = Math.sin(th), c = Math.cos(th);
    return { Ex: sg * (i.Er * s + i.Eth * c), Ez: i.Er * c - i.Eth * s, Hph: sg * i.Hph, Emag: Math.hypot(i.Er, i.Eth), r, th };
  },

  compute() {
    const E = this.extent, t = this.t;
    this.gridE = Grid2D.fromFunction(N, N, E, (x, z) => this.fieldsAt(x, z, t).Emag);
    this.gridH = Grid2D.fromFunction(N, N, E, (x, z) => this.fieldsAt(x, z, t).Hph);
    this.gridS = Grid2D.fromFunction(N, N, E, (x, z) => { const r = Math.max(Math.hypot(x, z), this.rmin); return poyntingAvg(this.p.I0, this.dl(), this.f(), r, Math.atan2(Math.abs(x), z)); });
    this.gridPsi = Grid2D.fromFunction(N, N, E, (x, z) => { const r = Math.max(Math.hypot(x, z), this.rmin); return streamPsi(this.p.I0, this.dl(), this.f(), r, Math.atan2(Math.abs(x), z), t); });
    const pct = (g, lo, hi) => { const a = Array.from(g.data).filter((v) => Number.isFinite(v) && v > 0).sort((p, q) => p - q); return [a[Math.floor(lo * (a.length - 1))] || 1e-12, a[Math.floor(hi * (a.length - 1))] || 1]; };
    this.eRange = pct(this.gridE, 0.05, 0.97); this.sRange = pct(this.gridS, 0.05, 0.97);
    const hm = Array.from(this.gridH.data).map(Math.abs).sort((p, q) => p - q)[Math.floor(0.95 * N * N)] || 1; this.hRange = [-hm, hm];
    this.psiFar = (wavenumber(this.f()).k * this.p.I0 * this.dl()) / (4 * PI); // far-field amplitude of r sinθ H_φ: the outer loops live at fractions of it
    this.finish();
  },
  finish() { const r = radiation(this.p.I0, this.dl(), this.f()); const far = farFields(this.p.I0, this.dl(), this.f(), this.p.dist, PI / 2); this.results = { ...r, k: wavenumber(this.f()).k, nf: nearFarBoundary(this.f()), Efar: Math.hypot(...far.Eth), Sfar: (Math.hypot(...far.Eth) ** 2) / (2 * ETA0) }; this.renderResults(); },

  render(layer, ctx, view, opts) {
    switch (layer) {
      case 'Emag': return drawScalarField(ctx, this.gridE, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.eRange[0], max: opts.max ?? this.eRange[1] });
      case 'Hphi': return drawScalarField(ctx, this.gridH, { map: opts.map, extent: opts.extent, min: opts.min ?? this.hRange[0], max: opts.max ?? this.hRange[1] });
      case 'S': return drawScalarField(ctx, this.gridS, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.sRange[0], max: opts.max ?? this.sRange[1] });
      case 'E': drawQuiver(ctx, view, (x, z) => { const f = this.fieldsAt(x, z, this.t); return [f.Ex, f.Ez]; }, { normalize: true }); return null;
      case 'lines': { const lv = []; for (const fr of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.2, 1.8, 2.8, 4.5, 7, 11]) lv.push(fr * this.psiFar, -fr * this.psiFar); drawContours(ctx, view, this.gridPsi, lv, { color: 'rgba(255,255,255,0.8)', lineWidth: 1.2 }); return null; }
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    ctx.save();
    const [cx, cy] = view.toPx(0, 0), [ex] = view.toPx(r.nf, 0);
    if (this.shell.layerOn.get('nf')) { ctx.beginPath(); ctx.arc(cx, cy, ex - cx, 0, 2 * PI); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3.5; ctx.stroke(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ff5ad6'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]); ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#ff5ad6'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3; ctx.fillText('kr = 1', ex + 5, cy - 5); ctx.shadowBlur = 0; }
    // the dipole
    const [, zt] = view.toPx(0, 0.06 * this.lambda), [, zb] = view.toPx(0, -0.06 * this.lambda);
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, zt); ctx.lineTo(cx, zb); ctx.stroke();
    const [, lz] = view.toPx(0, this.extent[3]); const [lx] = view.toPx(this.lambda, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, lz + 16); ctx.lineTo(lx, lz + 16); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3; ctx.fillText(`λ = ${sci(this.lambda, 3)} m`, cx + 4, lz + 30);
    ctx.fillText(`I₀ dl = ${this.p.I0} A × ${this.p.dl} mm along z, f = ${this.p.f} MHz, t = ${(this.t * this.f()).toFixed(2)} T`, 10, view.height - 26);
    ctx.fillText('white: E field lines at this instant (contours of r sinθ·H_φ/j) · pink: kr = 1, the near/far boundary', 10, view.height - 10);
    ctx.restore();
  },

  // ------------------------------------------------------------ time (the field view animates)

  tick() { this.compute(); this.shell.redraw(); this.shell.refreshStatus(); },
  play() { this.playing = true; let last = performance.now(); const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; const T = 1 / this.f(); this.t = (this.t + dt * this.speed * T) % T; this.tick(); this.raf = requestAnimationFrame(step); }; this.raf = requestAnimationFrame(step); },
  stop() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; },

  // ------------------------------------------------------------ plots

  frame(ctx, W, H, { lo, hi, a0, a1, xlabel, ylabel, logx = false, logy = false, top = 70, bottom = 48, left = 90 }) {
    const L = left, T = top, B = bottom, Rm = 20;
    const fx = (v) => (logx ? Math.log10(v) : v), fy = (v) => (logy ? Math.log10(v) : v), X0 = fx(a0), X1 = fx(a1), Y0 = fy(lo), Y1 = fy(hi);
    const px = (v) => L + ((fx(v) - X0) / (X1 - X0 || 1)) * (W - L - Rm), py = (v) => T + (1 - (fy(v) - Y0) / (Y1 - Y0 || 1)) * (H - T - B);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955'; ctx.textAlign = 'left';
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    if (logy) for (let e = Math.ceil(Y0); e <= Math.floor(Y1); e++) { const y = py(10 ** e); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - Rm, y); ctx.stroke(); ctx.fillStyle = '#5a5955'; ctx.fillText(`1e${e}`, 30, y + 4); }
    else for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 22, py(v) + 4); }
    if (logx) for (let e = Math.ceil(X0); e <= Math.floor(X1); e++) { const x = px(10 ** e); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke(); ctx.fillStyle = '#5a5955'; ctx.fillText(`${10 ** e}`, x - 10, H - B + 16); }
    ctx.fillText(xlabel, W / 2 - 80, H - 6); ctx.save(); ctx.translate(10, T + 0.5 * (H - T - B)); ctx.rotate(-PI / 2); ctx.textAlign = 'center'; ctx.fillText(ylabel, 0, 0); ctx.restore(); ctx.textAlign = 'left';
    const line = (xs, ys, color, dash = [], width = 2) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); let pen = false; for (let k = 0; k < xs.length; k++) { const y = ys[k]; if (!Number.isFinite(y) || (logy && y <= 0) || y < lo || y > hi) { pen = false; continue; } const X = px(xs[k]), Y = py(y); if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; } } ctx.stroke(); ctx.setLineDash([]); };
    const legend = (items, y0 = 16) => { let lx = L, ly = y0; for (const [name, color, dash] of items) { const wdt = ctx.measureText(name).width + 46; if (lx + wdt > W - Rm && lx > L) { lx = L; ly += 16; } ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash(dash ?? []); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 28, ly + 4); lx += wdt; } return ly + 16; };
    const caption = (text, y) => { const words = text.split(' '); let lineTxt = ''; ctx.fillStyle = '#5a5955'; for (const wd of words) { const trial = lineTxt ? `${lineTxt} ${wd}` : wd; if (ctx.measureText(trial).width > W - L - Rm && lineTxt) { ctx.fillText(lineTxt, L, y); y += 14; lineTxt = wd; } else lineTxt = trial; } if (lineTxt) ctx.fillText(lineTxt, L, y); return y + 14; };
    const vline = (x, color, label) => { const X = px(x); ctx.strokeStyle = color; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X, T); ctx.lineTo(X, H - B); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.fillText(label, X + 4, T + 12); };
    return { px, py, line, legend, caption, vline, L, T, B, Rm };
  },

  drawRadial(ctx, W, H) {
    if (!this.results) this.finish();
    const I0 = this.p.I0, dl = this.dl(), f = this.f(), k = this.results.k, n = 400;
    const r0 = 0.001 / k, r1 = 1000 / k, krs = [], Eth = [], Er = [], far = [], nearT = [], midT = [];
    for (let i = 0; i < n; i++) { const kr = r0 * k * Math.pow((r1 * k) / (r0 * k), i / (n - 1)), r = kr / k; const F = hertzFields(I0, dl, f, r, PI / 2), Fr = hertzFields(I0, dl, f, r, PI / 4); krs.push(kr); Eth.push(Math.hypot(...F.Eth)); Er.push(Math.hypot(...Fr.Er)); const A = (ETA0 * k * I0 * dl) / (4 * PI * r); far.push(A); midT.push(A / kr); nearT.push(A / (kr * kr)); }
    const A = this.frame(ctx, W, H, { lo: Math.min(...Eth) * 0.5, hi: Math.max(...Eth) * 2, a0: krs[0], a1: krs[n - 1], xlabel: 'kr = 2πr/λ (log)', ylabel: '|E| (V/m, log)', logx: true, logy: true, top: 112 });
    A.line(krs, nearT, '#2a9d4b', [2, 3], 1); A.line(krs, midT, '#f5a623', [2, 3], 1); A.line(krs, far, '#7b61ff', [2, 3], 1);
    A.line(krs, Eth, '#e5484d'); A.line(krs, Er, '#1f5fbf', [5, 4]);
    A.vline(1, '#5a5955', 'kr = 1: r = λ/2π');
    const y = A.legend([['|E_θ| at θ = 90° (exact)', '#e5484d'], ['|E_r| at θ = 45° (exact)', '#1f5fbf', [5, 4]], ['1/r³ term (quasi-static dipole)', '#2a9d4b', [2, 3]], ['1/r² term (induction)', '#f5a623', [2, 3]], ['1/r term (radiation)', '#7b61ff', [2, 3]]]);
    A.caption('Close in, E is the static dipole field falling as 1/r³ (and E_r is comparable to E_θ); beyond kr = 1 only the 1/r radiation term survives, E_r dies away as 1/r², and E_θ/H_φ → η₀. The three terms are equal in size exactly at kr = 1.', y);
  },

  drawPattern(ctx, W, H) {
    if (!this.results) this.finish();
    const cx = W / 2, cy = H / 2 + 10, R = Math.min(W, H) * 0.36;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955'; ctx.textAlign = 'left';
    for (const g of [0.25, 0.5, 0.75, 1]) { ctx.strokeStyle = '#e5e5e5'; ctx.beginPath(); ctx.arc(cx, cy, R * g, 0, 2 * PI); ctx.stroke(); ctx.fillText(`${g}`, cx + R * g + 3, cy - 3); }
    ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(cx, cy - R * 1.1); ctx.lineTo(cx, cy + R * 1.1); ctx.moveTo(cx - R * 1.1, cy); ctx.lineTo(cx + R * 1.1, cy); ctx.stroke();
    ctx.fillText('z (dipole axis)', cx + 6, cy - R * 1.1 + 4); ctx.fillText('θ = 90°', cx + R * 1.1 - 40, cy + 16);
    // power pattern sin²θ and field pattern |sinθ|
    const poly = (fn, color, dash) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash ?? []); ctx.beginPath(); for (let i = 0; i <= 360; i++) { const th = (i * PI) / 180, v = fn(th), x = cx + R * v * Math.sin(th), y = cy - R * v * Math.cos(th); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]); };
    poly((th) => Math.sin(th) ** 2, '#e5484d'); poly((th) => Math.abs(Math.sin(th)), '#1f5fbf', [5, 4]);
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.stroke();
    // half-power points
    for (const th of [PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4]) { const x = cx + R * 0.5 * Math.sin(th), y = cy - R * 0.5 * Math.cos(th); ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * PI); ctx.fill(); }
    ctx.fillStyle = '#e5484d'; ctx.fillText('power pattern sin²θ (normalised); dots: half-power at 45° and 135°, beamwidth 90°', 12, 20);
    ctx.fillStyle = '#1f5fbf'; ctx.fillText('dashed: field pattern |sinθ|', 12, 36);
    ctx.fillStyle = '#5a5955'; ctx.fillText('No radiation along the axis, maximum broadside. Directivity D = 1.5 (1.76 dBi): the outer circle is 1.5 × what an', 12, H - 26); ctx.fillText('isotropic source of the same total power would give in every direction.', 12, H - 12);
  },

  // ------------------------------------------------------------ shell hooks

  statusText() { const r = this.results; if (!r) return ''; return `λ = ${sci(this.lambda, 3)} m, dl/λ = ${(this.dl() / this.lambda).toExponential(2)} · R_rad = ${sci(r.Rrad, 4)} Ω, P_rad = ${sci(r.Prad, 4)} W · kr = 1 at r = ${sci(r.nf, 3)} m · t = ${(this.t * this.f()).toFixed(2)} T`; },
  probe(x, z) {
    const f = this.fieldsAt(x, z, this.t), F = hertzFields(this.p.I0, this.dl(), this.f(), f.r, f.th), far = farFields(this.p.I0, this.dl(), this.f(), f.r, f.th);
    return [{ label: 'r, θ', value: f.r, unit: 'm', note: `θ = ${((f.th * 180) / PI).toFixed(1)}°, kr = ${(this.results.k * f.r).toPrecision(3)}` }, { label: '|E| now', value: f.Emag, unit: 'V/m' }, { label: '|E_θ| amplitude (exact)', value: Math.hypot(...F.Eth), unit: 'V/m' }, { label: '|E_θ| far-field term alone', value: Math.hypot(...far.Eth), unit: 'V/m' }, { label: '|E_r| amplitude', value: Math.hypot(...F.Er), unit: 'V/m' }, { label: '|H_φ| amplitude', value: Math.hypot(...F.Hph), unit: 'A/m' }, { label: '|E_θ| / |H_φ|', value: Math.hypot(...F.Eth) / Math.hypot(...F.Hph), unit: 'Ω', note: '→ η₀ = 376.7 Ω far away' }, { label: 'time-average S_r', value: poyntingAvg(this.p.I0, this.dl(), this.f(), f.r, f.th), unit: 'W/m²' }];
  },
  getState() { const s = { t: +this.t.toPrecision(4), spd: +this.speed.toPrecision(3) }; for (const [k, v] of Object.entries(this.p)) s[`rd_${k}`] = v; return s; },
  csv() {
    const g = this.gridE, lines = ['x_m,z_m,Emag_Vpm,Hphi_Apm,Sr_Wpm2,psi'];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridH.get(i, j)},${this.gridS.get(i, j)},${this.gridPsi.get(i, j)}`);
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Radiation'));
    box.appendChild(ui.lead(shell, 'A short current element oscillating at f: close in it is the quasi-static dipole, far out a wave that carries power away for good.'));
    const re = () => { this.stop(); this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Dipole'));
    row(pf('f', 'Frequency f (MHz)', 0.01, 1e5), pf('dl', 'Length dl (mm, ≪ λ)', 0.01, 1e4), pf('I0', 'Current amplitude I₀ (A)', 1e-6, 1e4));
    row(pf('span', 'Picture half-width (wavelengths)', 0.3, 6));
    box.appendChild(ui.el('p', 'hint', `λ = ${sci(this.lambda, 4)} m; dl/λ = ${(this.dl() / this.lambda).toExponential(2)}${this.dl() / this.lambda > 0.1 ? ' (the short-dipole formulas assume dl ≪ λ; this is getting long)' : ''}. The fields near the element are clipped inside r = 0.03 λ for display.`));
    box.appendChild(ui.el('h2', '', 'Animation'));
    const ar = ui.el('div', 'row');
    const play = ui.button(this.playing ? 'Pause' : 'Play', () => { if (this.playing) this.stop(); else this.play(); play.textContent = this.playing ? 'Pause' : 'Play'; }, 'btn');
    ar.append(play, ui.button('t = 0', () => { this.t = 0; this.tick(); }, 'btn btn-small')); box.appendChild(ar);
    const lab = ui.el('div', 'hint', `playback: ${this.speed.toPrecision(2)} periods per second`);
    box.appendChild(lab); box.appendChild(ui.range(Math.log10(this.speed), { min: -1.5, max: 0.5, step: 0.05, ariaLabel: 'playback speed (log)', onInput: (v) => { this.speed = Math.pow(10, v); lab.textContent = `playback: ${this.speed.toPrecision(2)} periods per second`; } }));
    box.appendChild(ui.el('p', 'hint', 'Watch the E lines: near the dipole they open and close like a static dipole\'s; at about kr = 1 they pinch off into closed loops that move outward at c and never come back. That pinching-off is radiation.'));
    box.appendChild(ui.el('h2', '', 'Far-field number at a distance'));
    row(pf('dist', 'Distance r (m), broadside', 0.01, 1e7, () => { this.finish(); shell.syncUrl(); }));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'R_rad = η(k dl)²/6π ≈ 80π²(dl/λ)² is the resistance the source feels for the power that leaves; it is tiny for a short dipole, which is why short antennas are hard to feed. The power through any sphere is the same: nothing is lost on the way.'));
    const vr = ui.el('div', 'row'); vr.append(ui.button('Near vs far along a radius', () => { shell.setStageView('radial'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Pattern', () => { shell.setStageView('pattern'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, p = this.p, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('wavelength λ, k', `${sci(this.lambda, 4)} m, ${sci(r.k, 4)} rad/m`); row('near/far boundary kr = 1', `r = λ/2π = ${sci(r.nf, 4)} m`);
    row('radiation resistance η(k dl)²/6π', `${sci(r.Rrad, 4)} Ω (80π²(dl/λ)² gives ${sci(r.Rrad80, 4)} Ω)`); row('radiated power ½I₀²R_rad', `${sci(r.Prad, 4)} W`); row('directivity', '1.5 = 1.76 dBi; half-power beamwidth 90°');
    row(`|E_θ| at r = ${p.dist} m, broadside (far field)`, `${sci(r.Efar, 4)} V/m`); row('power density there, |E|²/2η₀', `${sci(r.Sfar, 4)} W/m² (= 1.5 P_rad / 4πr² = ${sci((1.5 * r.Prad) / (4 * PI * p.dist * p.dist), 4)})`);
  },
};
