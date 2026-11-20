// Smith chart tab: the chart drawn live, the load, the constant-|Γ| circle, the walk toward the
// generator, the admittance point, and the two matching recipes (quarter-wave transformer,
// single shunt stub) marked on the chart and worked out in the numbers. Closed form (core/smith.js).

import { PI } from '../../core/constants.js';
import { cabs, carg } from '../../core/tline.js';
import { gammaOf, zOf, yOf, swrOf, moveToward, zinAt, extremaOf, quarterWave, singleStub, rCircle, xCircle } from '../../core/smith.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame, wrapText } from '../views.js';

const PRESETS = {
  'Textbook stub example: 60 − j80 Ω on 50 Ω': { Z0: 50, RL: 60, XL: -80 },
  'Inductive load 100 + j50 Ω': { Z0: 50, RL: 100, XL: 50 },
  'Short circuit': { Z0: 50, RL: 0, XL: 0 },
  'Open circuit': { Z0: 50, RL: 1e9, XL: 0 },
  'Matched': { Z0: 50, RL: 50, XL: 0 },
  'Capacitive 25 − j25 Ω': { Z0: 50, RL: 25, XL: -25 },
};

export default {
  id: 'smith',
  title: 'Smith chart',
  phase: 8,
  available: true,
  hideField: true,
  summary: 'The Smith chart: Γ ↔ normalised z, the SWR circle, moving toward the generator, admittance, and quarter-wave and single-stub matching worked on the chart.',
  layers: [],
  pDefaults: { Z0: 50, RL: 60, XL: -80, d: 0.11 }, // Ω, Ω, Ω, wavelengths from the load

  init(shell) {
    this.shell = shell; const s = shell.state;
    this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `sm_${k}`, this.p[k]);
    this.show = getStr(s, 'sm_show', 'stub'); // 'none' | 'stub' | 'qw'
    this.views = [
      plotView('chart', 'Smith chart', (ctx, w, h) => this.drawChart(ctx, w, h)),
      plotView('along', 'z_in along the line', (ctx, w, h) => this.drawAlong(ctx, w, h)),
    ];
    this.results = null; this.buildControls();
  },
  compute() {
    const z = [this.p.RL / this.p.Z0, this.p.XL / this.p.Z0], G = gammaOf(z), y = yOf(z), Gd = moveToward(G, this.p.d), zin = zOf(Gd);
    this.results = { z, G, y, Gd, zin, yin: yOf(zin), swr: swrOf(G), ext: extremaOf(G), qw: quarterWave(z), stub: singleStub(z) };
    this.renderResults();
  },
  render() { return null; },

  // ------------------------------------------------------------ the chart
  drawChart(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, R = Math.min(W * 0.36, H * 0.43), cx = W - R - 40, cy = H / 2 + 8, capW = cx - R - 40;
    const P = (G) => [cx + R * G[0], cy - R * G[1]];
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * PI); ctx.clip();
    ctx.lineWidth = 1; ctx.font = '11px system-ui';
    // constant-r circles
    for (const rr of [0, 0.2, 0.5, 1, 2, 5]) { const c = rCircle(rr); ctx.strokeStyle = rr === 1 ? '#8a8a8a' : '#d8d8d8'; ctx.beginPath(); ctx.arc(cx + R * c.cx, cy, R * c.R, 0, 2 * PI); ctx.stroke(); }
    // constant-x arcs (both signs)
    for (const xx of [0.2, 0.5, 1, 2, 5]) for (const sg of [1, -1]) { const c = xCircle(sg * xx); ctx.strokeStyle = xx === 1 ? '#8a8a8a' : '#d8d8d8'; ctx.beginPath(); ctx.arc(cx + R * c.cx, cy - R * c.cy, R * c.R, 0, 2 * PI); ctx.stroke(); }
    ctx.strokeStyle = '#8a8a8a'; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * PI); ctx.stroke();
    // labels along the real axis and the rim
    ctx.fillStyle = '#5a5955'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    for (const rr of [0.2, 0.5, 1, 2, 5]) { const g = gammaOf([rr, 0]); const [x, y] = P(g); ctx.fillText(`${rr}`, x, y - 3); }
    for (const xx of [0.5, 1, 2]) for (const sg of [1, -1]) { const g = gammaOf([0, sg * xx]); const [x, y] = P(g); ctx.fillText(`${sg > 0 ? '+' : '−'}j${xx}`, x + 14 * g[0], y - 14 * g[1] + 4); }
    ctx.fillText('0', cx - R - 8, cy + 4); ctx.fillText('∞', cx + R + 8, cy + 4);
    ctx.font = '11px system-ui'; ctx.textAlign = 'right'; ctx.fillText('toward the generator: clockwise, λ/2 per turn ↻', cx + R, cy + R + 34);
    ctx.textAlign = 'left';
    // SWR circle
    const g = cabs(r.G); ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 1.8; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cx, cy, R * Math.min(g, 1), 0, 2 * PI); ctx.stroke(); ctx.setLineDash([]);
    // walk from the load to d: arc clockwise
    const a0 = carg(r.G), a1 = carg(r.Gd); ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R * Math.min(g, 1), -a0, -a1, false); ctx.stroke();
    const dot = (G, color, label, dy = -8) => { const [x, y] = P(G); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * PI); ctx.fill(); ctx.fillStyle = color; ctx.font = 'bold 12px system-ui'; ctx.fillText(label, x + 8, y + dy); };
    dot(r.G, '#e5484d', `z_L = ${sci(r.z[0], 3)} ${r.z[1] < 0 ? '−' : '+'} j${sci(Math.abs(r.z[1]), 3)}`);
    dot(r.Gd, '#b8860b', `z_in at ${this.p.d.toFixed(3)} λ`, 14);
    dot([-r.G[0], -r.G[1]], '#2a9d4b', `y_L (= z_L turned over)`, 14);
    if (this.show === 'stub') {
      // g = 1 circle on the admittance chart = the r = 1 circle turned over: centre (−0.5, 0), radius 0.5
      ctx.strokeStyle = '#2a9d4b'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx - 0.5 * R, cy, 0.5 * R, 0, 2 * PI); ctx.stroke(); ctx.setLineDash([]);
      for (const [i, s] of r.stub.entries()) { const Gy = moveToward(gammaOf(r.y), s.d); dot([-Gy[0], -Gy[1]], '#2a9d4b', `y = 1 ${s.b < 0 ? '−' : '+'} j${sci(Math.abs(s.b), 3)} at d${i + 1} = ${s.d.toFixed(3)} λ`, i ? 16 : -8); }
    } else if (this.show === 'qw') {
      for (const s of r.qw) dot(moveToward(r.G, s.d), '#7b61ff', `real z = ${sci(s.r, 3)} at ${s.d.toFixed(3)} λ: Z_T = ${sci(s.zT * this.p.Z0, 4)} Ω`, s.r > 1 ? -8 : 16);
    }
    // legend / caption
    ctx.fillStyle = '#5a5955'; ctx.font = '12px system-ui';
    let yy = 20;
    yy = wrapText(ctx, `Z₀ = ${this.p.Z0} Ω · Γ = ${sci(cabs(r.G), 3)} ∠ ${((180 / PI) * carg(r.G)).toFixed(1)}° · SWR = ${r.swr === Infinity ? '∞' : sci(r.swr, 3)}`, 12, yy, capW);
    yy = wrapText(ctx, 'Blue dashed: the constant-|Γ| (SWR) circle. Red arc: the walk from the load toward the generator. Green: the load admittance, which sits diametrically opposite, so the same chart serves for y; the dotted green circle is g = 1, where a shunt stub can cancel the rest.', 12, yy + 6, capW);
    if (this.show === 'stub') wrapText(ctx, 'Single stub: walk to where the admittance circle meets g = 1 (two places per half wavelength), then hang a stub whose susceptance is −b. The numbers give both solutions with open- and short-circuit stub lengths.', 12, yy + 6, capW);
    if (this.show === 'qw') wrapText(ctx, 'Quarter-wave transformer: at a voltage maximum or minimum the line is purely resistive, r; a λ/4 section of Z_T = Z₀√r makes it 1.', 12, yy + 6, capW);
  },

  drawAlong(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, n = 301, ds = [], re = [], im = [], mag = [];
    for (let k = 0; k < n; k++) { const d = (0.5 * k) / (n - 1), zin = zOf(moveToward(r.G, d)); ds.push(d); re.push(zin[0]); im.push(zin[1]); mag.push(cabs(zin)); }
    const hi = Math.min(10, Math.max(2, ...mag.filter(Number.isFinite)) * 1.05);
    const A = axesFrame(ctx, W, H, { lo: -hi, hi, a0: 0, a1: 0.5, xlabel: 'distance from the load d (wavelengths)', ylabel: 'normalised z_in', top: 70, xticks: 5, fmt: (v) => v.toFixed(2) });
    A.hline(0, '#bbb', ''); A.hline(1, '#ddd', 'r = 1');
    A.line(ds, re, '#e5484d'); A.line(ds, im, '#1f5fbf');
    A.vline(this.p.d, '#b8860b', `d = ${this.p.d.toFixed(3)} λ`);
    A.vline(r.ext.dmax, '#2a9d4b', `V max (z real, = SWR)`, A.T + 28); A.vline(r.ext.dmin, '#7b61ff', `V min (z real, = 1/SWR)`, A.T + 44);
    const y = A.legend([['r_in = Re z_in', '#e5484d'], ['x_in = Im z_in', '#1f5fbf']]);
    A.caption('The impedance repeats every half wavelength and inverts every quarter; it is real exactly at the voltage maxima (r = SWR) and minima (r = 1/SWR), which is where a quarter-wave transformer goes.', y);
  },

  // ------------------------------------------------------------ shell hooks
  statusText() { const r = this.results; if (!r) return ''; return `z_L = ${sci(r.z[0], 3)} ${r.z[1] < 0 ? '−' : '+'} j${sci(Math.abs(r.z[1]), 3)} · |Γ| = ${sci(cabs(r.G), 3)}, SWR = ${r.swr === Infinity ? '∞' : sci(r.swr, 3)} · z_in(${this.p.d} λ) = ${sci(r.zin[0], 3)} ${r.zin[1] < 0 ? '−' : '+'} j${sci(Math.abs(r.zin[1]), 3)}`; },
  probe() { return []; },
  getState() { const s = { sm_show: this.show }; for (const [k, v] of Object.entries(this.p)) s[`sm_${k}`] = v; return s; },
  csv() { const r = this.results, lines = ['d_lambda,r_in,x_in,|Gamma|,arg_Gamma_deg']; for (let k = 0; k <= 200; k++) { const d = k / 400, G = moveToward(r.G, d), z = zOf(G); lines.push(`${d},${z[0]},${z[1]},${cabs(G)},${(180 / PI) * carg(G)}`); } return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Smith chart'));
    box.appendChild(ui.lead(shell, 'Every impedance is a point inside the unit circle of Γ; moving along a lossless line is a rotation; matching is a walk to the centre.'));
    const re = () => { shell.recompute(); shell.updateStageView(); shell.syncUrl(); };
    const pf = (key, label, min, max) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Load'));
    box.appendChild(ui.field('Preset', ui.select([['', '— choose —'], ...Object.keys(PRESETS).map((k) => [k, k])], '', (k) => { if (!PRESETS[k]) return; Object.assign(p, PRESETS[k]); this.buildControls(); re(); })));
    row(pf('Z0', 'Z₀ (Ω)', 1, 1e4), pf('RL', 'R_L (Ω)', 0, 1e9), pf('XL', 'X_L (Ω, − capacitive)', -1e9, 1e9));
    const tl = shell.tabs.find((t) => t.id === 'tline-waves');
    if (tl?.results?.Zin) box.appendChild(ui.el('p', 'hint', 'The Line waves tab’s load and Z₀ can be typed here to see the same problem on the chart.'));
    box.appendChild(ui.el('h2', '', 'Along the line'));
    const lab = ui.el('div', 'hint', `d = ${p.d.toFixed(3)} λ toward the generator`); box.appendChild(lab);
    box.appendChild(ui.range(p.d, { min: 0, max: 0.5, step: 0.001, ariaLabel: 'distance from the load (wavelengths)', onInput: (v) => { p.d = v; lab.textContent = `d = ${p.d.toFixed(3)} λ toward the generator`; shell.recompute(); shell.updateStageView(); }, onChange: () => shell.syncUrl() }));
    box.appendChild(ui.el('h2', '', 'Matching'));
    box.appendChild(ui.field('Show', ui.select([['none', 'nothing extra'], ['stub', 'single shunt stub'], ['qw', 'quarter-wave transformer']], this.show, (v) => { this.show = v; re(); })));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Chart', () => { shell.setStageView('chart'); shell.syncUrl(); }, 'btn btn-small'), ui.button('z_in along the line', () => { shell.setStageView('along'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, p = this.p, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    const cz = (c) => `${sci(c[0], 4)} ${c[1] < 0 ? '−' : '+'} j${sci(Math.abs(c[1]), 4)}`;
    row('z_L = Z_L/Z₀', cz(r.z)); row('Γ_L', `${sci(cabs(r.G), 4)} ∠ ${((180 / PI) * carg(r.G)).toFixed(2)}° (${cz(r.G)})`); row('SWR', r.swr === Infinity ? '∞' : sci(r.swr, 4));
    row('y_L = 1/z_L', cz(r.y)); row(`z_in at d = ${p.d.toFixed(3)} λ`, `${cz(r.zin)} → Z_in = ${cz([r.zin[0] * p.Z0, r.zin[1] * p.Z0])} Ω`);
    row('first V max, V min from the load', `${r.ext.dmax.toFixed(4)} λ (z = ${sci(r.swr === Infinity ? Infinity : r.swr, 4)}), ${r.ext.dmin.toFixed(4)} λ (z = ${sci(r.swr === Infinity ? 0 : 1 / r.swr, 4)})`);
    for (const s of r.qw) row(`λ/4 transformer at d = ${s.d.toFixed(4)} λ`, `line there is real, r = ${sci(s.r, 4)}; Z_T = Z₀√r = ${sci(s.zT * p.Z0, 4)} Ω`);
    for (const [i, s] of r.stub.entries()) row(`shunt stub, solution ${i + 1}: d = ${s.d.toFixed(4)} λ`, `y = 1 ${s.b < 0 ? '−' : '+'} j${sci(Math.abs(s.b), 4)}; stub ${s.stubShort.toFixed(4)} λ (short) or ${s.stubOpen.toFixed(4)} λ (open)`);
  },
};
