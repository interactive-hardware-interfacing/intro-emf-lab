// Lossy lines tab: R′, L′, G′, C′ → α, β, Z₀; attenuation; the distortionless condition;
// dispersion of v_p and v_g with frequency; the standing wave on a lossy terminated line with
// the power lost along it. Closed form (core/lossyline.js).

import { PI } from '../../core/constants.js';
import { cabs, carg } from '../../core/tline.js';
import { lineConstants, approximations, groupVelocity, sweep, steadyStateLossy, matchedLoss } from '../../core/lossyline.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame } from '../views.js';
import { lineParams } from './transmission-lines.js';

const PRESETS = {
  'RG-58 coax, ~100 MHz (R′ 0.7 Ω/m, G′ small)': { R: 0.7, L: 250, C: 100, G: 1e-4, f: 100, len: 20, RL: 50, XL: 0 },
  'Lossless 50 Ω': { R: 0, L: 250, C: 100, G: 0, f: 100, len: 5, RL: 100, XL: 0 },
  'Distortionless (R′/L′ = G′/C′)': { R: 1, L: 250, C: 100, G: 0.4e-3, f: 100, len: 20, RL: 50, XL: 0 },
  'Telephone pair, audio (R′ heavy, low f)': { R: 0.1, L: 0.6, C: 50, G: 1e-7, f: 0.01, len: 2000, RL: 600, XL: 0 },
};

export default {
  id: 'lossy-lines',
  title: 'Lossy lines',
  phase: 8,
  available: true,
  hideField: true,
  summary: 'R′, L′, G′, C′ to γ = α + jβ and a complex Z₀; attenuation in dB; the distortionless condition; dispersion of v_p and v_g; the standing wave on a lossy terminated line and where the power goes.',
  layers: [],
  pDefaults: { R: 0.7, L: 250, C: 100, G: 1e-4, f: 100, len: 20, RL: 100, XL: 0, Vs: 2, Rs: 50 }, // Ω/m, nH/m, pF/m, S/m, MHz, m, Ω, Ω, V, Ω

  init(shell) {
    this.shell = shell; const s = shell.state;
    this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `ll_${k}`, this.p[k]);
    this.views = [
      plotView('wave', 'Voltage and power along the line', (ctx, w, h) => this.drawWave(ctx, w, h)),
      plotView('disp', 'α, v_p, v_g against frequency', (ctx, w, h) => this.drawDisp(ctx, w, h)),
    ];
    this.results = null; this.buildControls();
  },
  consts() { const p = this.p; return { R: p.R, L: p.L * 1e-9, G: p.G, C: p.C * 1e-12 }; },
  compute() {
    const p = this.p, pr = this.consts(), w = 2 * PI * p.f * 1e6, c = lineConstants(pr, w), ap = approximations(pr), vg = groupVelocity(pr, w);
    const ss = steadyStateLossy({ Vs: p.Vs, Rs: p.Rs, l: p.len, ZL: [p.RL, p.XL] }, c);
    this.results = { c, ap, vg, ss, ml: matchedLoss(c.alpha, p.len), w };
    this.renderResults();
  },
  render() { return null; },
  drawWave(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, p = this.p, n = 400, ds = [], V = [], Pw = [], envL = [];
    for (let k = 0; k < n; k++) { const d = (p.len * k) / (n - 1); ds.push(d); V.push(cabs(r.ss.V(d))); Pw.push(r.ss.P(d)); envL.push(cabs(r.ss.Vp) * Math.exp(r.c.alpha * d) * (1 + cabs(r.ss.GL) * Math.exp(-2 * r.c.alpha * d))); }
    const vmax = Math.max(...V, ...envL) * 1.1, pmax = Math.max(...Pw.map(Math.abs)) || 1;
    const A = axesFrame(ctx, W, H, { lo: 0, hi: 1.1, a0: 0, a1: p.len, xlabel: 'distance from the load d (m)   ← generator is at the right', ylabel: 'normalised', top: 80, fmt: (v) => sci(v, 3) });
    A.line(ds, V.map((v) => v / vmax), '#e5484d'); A.line(ds, envL.map((v) => v / vmax), '#e5484d', [3, 3], 1); A.line(ds, Pw.map((v) => v / pmax), '#2a9d4b', [6, 4]);
    const y = A.legend([[`|V(d)| / ${sci(vmax, 3)} V`, '#e5484d'], ['its upper envelope |V⁺|e^{αd}(1 + |Γ|e^{−2αd})', '#e5484d', [3, 3]], [`power flowing toward the load / ${sci(pmax, 3)} W`, '#2a9d4b', [6, 4]]]);
    A.caption(`The standing-wave ripple shrinks toward the generator: the reflected wave has been attenuated twice over, so a long lossy line looks matched from its input whatever the load (|Γ_in| = |Γ_L| e^{−2αl} = ${sci(cabs(r.ss.Gin), 3)}). The power curve falls from P_in = ${sci(r.ss.Pin, 3)} W to P_L = ${sci(r.ss.PL, 3)} W; the difference heats the line.`, y);
  },
  drawDisp(ctx, W, H) {
    if (!this.results) this.compute();
    const p = this.p, pr = this.consts(), f0 = Math.max(1e3, p.f * 1e6 / 1000), f1 = p.f * 1e6 * 100, sw = sweep(pr, f0, f1, 200), ap = approximations(pr);
    const A = axesFrame(ctx, W, H, { lo: 0, hi: 1.1, a0: f0, a1: f1, xlabel: 'frequency (Hz, log)', ylabel: 'v / v_lossless;  α in dB/m / max', logx: true, top: 80, fmt: (v) => v.toFixed(2) });
    const amax = Math.max(...sw.alphaDb) || 1;
    A.line(sw.f, sw.vp.map((v) => v / ap.vLossless), '#1f5fbf'); A.line(sw.f, sw.vg.map((v) => v / ap.vLossless), '#7b61ff', [5, 4]); A.line(sw.f, sw.alphaDb.map((v) => v / amax), '#e5484d', [2, 3]);
    A.hline(1, '#bbb', 'lossless 1/√(L′C′)'); A.vline(p.f * 1e6, '#5a5955', `f = ${p.f} MHz`);
    const y = A.legend([['phase velocity v_p / v_lossless', '#1f5fbf'], ['group velocity v_g / v_lossless', '#7b61ff', [5, 4]], [`attenuation α (dB/m) / ${sci(amax, 3)}`, '#e5484d', [2, 3]]]);
    A.caption(ap.distortionless ? 'Distortionless: R′/L′ = G′/C′ makes v_p the same at every frequency and α constant, so a pulse keeps its shape and just shrinks. Heaviside’s loading coils raised L′ on telephone lines to get there.' : 'Where R′ matters (f below R′/L′) the velocity depends on frequency and the line is dispersive: the parts of a pulse travel at different speeds and it smears. At high frequency v_p → 1/√(L′C′) and α levels off at R′/2Z₀ + G′Z₀/2.', y);
  },
  statusText() { const r = this.results; if (!r) return ''; return `α = ${sci(r.c.alpha, 3)} Np/m = ${sci(r.c.alphaDb, 3)} dB/m · β = ${sci(r.c.beta, 4)} rad/m · Z₀ = ${sci(r.c.Z0[0], 4)} ${r.c.Z0[1] < 0 ? '−' : '+'} j${sci(Math.abs(r.c.Z0[1]), 3)} Ω · P_in ${sci(r.ss.Pin, 3)} W → P_L ${sci(r.ss.PL, 3)} W`; },
  probe() { return []; },
  getState() { const s = {}; for (const [k, v] of Object.entries(this.p)) s[`ll_${k}`] = v; return s; },
  csv() { const r = this.results, p = this.p, lines = ['d_m,|V|_V,P_W']; for (let k = 0; k <= 200; k++) { const d = (p.len * k) / 200; lines.push(`${d},${cabs(r.ss.V(d))},${r.ss.P(d)}`); } return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Lossy lines'));
    box.appendChild(ui.lead(shell, 'Real lines have series resistance and shunt leakage: the wave shrinks as it goes, Z₀ picks up a phase, and unless R′/L′ = G′/C′ different frequencies travel at different speeds.'));
    const re = () => { shell.recompute(); shell.updateStageView(); shell.syncUrl(); };
    const pf = (key, label, min, max) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Line'));
    box.appendChild(ui.field('Preset', ui.select([['', '— choose —'], ...Object.keys(PRESETS).map((k) => [k, k])], '', (k) => { if (!PRESETS[k]) return; Object.assign(p, PRESETS[k]); this.buildControls(); re(); })));
    row(pf('R', 'R′ (Ω/m)', 0, 1e3), pf('L', 'L′ (nH/m)', 0.01, 1e5)); row(pf('G', 'G′ (S/m)', 0, 10), pf('C', 'C′ (pF/m)', 0.01, 1e5));
    row(pf('f', 'Frequency (MHz)', 1e-4, 1e5), pf('len', 'Length (m)', 0.01, 1e5));
    box.appendChild(ui.el('h2', '', 'Source and load'));
    row(pf('Vs', 'V_s (V)', 0, 1e3), pf('Rs', 'R_s (Ω)', 0, 1e4)); row(pf('RL', 'R_L (Ω)', 0, 1e6), pf('XL', 'X_L (Ω)', -1e6, 1e6));
    const tl = shell.tabs.find((t) => t.id === 'transmission-lines');
    if (tl && tl.a !== undefined) box.appendChild(ui.button('Take L′ and C′ from the Transmission lines tab', () => { const g = lineParams(tl.params()); p.L = +(g.L * 1e9).toPrecision(5); p.C = +(g.C * 1e12).toPrecision(5); this.buildControls(); re(); }, 'btn btn-small'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Along the line', () => { shell.setStageView('wave'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Against frequency', () => { shell.setStageView('disp'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, p = this.p, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('γ = α + jβ', `${sci(r.c.alpha, 4)} + j${sci(r.c.beta, 4)} per m`); row('attenuation', `${sci(r.c.alphaDb, 4)} dB/m; ${sci(r.ml.dB, 4)} dB over ${p.len} m if matched`);
    row('low-loss estimate R′/2Z₀ + G′Z₀/2', `${sci(r.ap.alphaLowLoss, 4)} Np/m`); row('Z₀', `${sci(r.c.Z0[0], 4)} ${r.c.Z0[1] < 0 ? '−' : '+'} j${sci(Math.abs(r.c.Z0[1]), 4)} Ω (lossless √(L′/C′) = ${sci(r.ap.Z0, 4)} Ω)`);
    row('v_p, v_g', `${sci(r.c.vp, 4)}, ${sci(r.vg, 4)} m/s (lossless ${sci(r.ap.vLossless, 4)})`); row('wavelength on the line', `${sci(r.c.lam, 4)} m`);
    row('distortionless R′/L′ = G′/C′?', r.ap.distortionless ? 'yes: α = √(R′G′), no dispersion' : `no (R′/L′ = ${sci(p.R / (p.L * 1e-9), 3)}, G′/C′ = ${sci(p.G / (p.C * 1e-12), 3)})`);
    row('Γ_L, |Γ| seen at the generator', `${sci(cabs(r.ss.GL), 4)} ∠ ${((180 / PI) * carg(r.ss.GL)).toFixed(1)}°, ${sci(cabs(r.ss.Gin), 4)}`);
    row('Z_in', `${sci(r.ss.Zin[0], 4)} ${r.ss.Zin[1] < 0 ? '−' : '+'} j${sci(Math.abs(r.ss.Zin[1]), 4)} Ω`);
    row('P_in → P_load, lost in the line', `${sci(r.ss.Pin, 4)} W → ${sci(r.ss.PL, 4)} W, ${sci(r.ss.Plost, 4)} W (${(100 * r.ss.Plost / (r.ss.Pin || 1)).toFixed(1)} %)`);
  },
};
