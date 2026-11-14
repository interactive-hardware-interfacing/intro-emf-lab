// Filters tab (Capacitors handout §6): RC and series-RLC filters as circuits, not fields.
// Bode magnitude and phase, the steady-state waveforms at a chosen drive frequency with the
// energy sloshing between C and L, the step response and its ringing, and the impedance of
// a real capacitor (ESR, ESL, self-resonance). C and L can be pulled from the capacitor and
// inductor tabs, so a geometry a student just built becomes the component in the filter,
// and Q·V_in at resonance is held against the breakdown voltage of that same gap.

import { PI } from '../../core/constants.js';
import { transfer, gainDb, phaseDeg, characteristics, steadyState, stepResponse, realCapacitorZ, selfResonance, rlcLimits } from '../../core/filters.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const OUTPUTS = { rc: [['C', 'the capacitor (low-pass)'], ['R', 'the resistor (high-pass)']], rlc: [['C', 'the capacitor (low-pass)'], ['R', 'the resistor (band-pass)'], ['L', 'the inductor (high-pass)'], ['LC', 'L and C together (band-stop)']] };
const PRESETS = [
  { label: 'Example 6.1: RC low-pass, 88.5 pF, 1 kΩ', p: { circuit: 'rc', output: 'C', R: 1000, L: 10, C: 0.0885, V: 1, f: 1.8e6 } },
  { label: 'Example 6.2: series RLC band-pass, Q = 10', p: { circuit: 'rlc', output: 'R', R: 10, L: 10, C: 1, V: 10, f: 1.5915e6 } },
  { label: 'Same RLC, output across C (low-pass, peak Q)', p: { circuit: 'rlc', output: 'C', R: 10, L: 10, C: 1, V: 10, f: 1.5915e6 } },
  { label: 'Butterworth: Q = 1/√2, no peak', p: { circuit: 'rlc', output: 'C', R: 141.42, L: 10, C: 1, V: 1, f: 1.5915e6 } },
  { label: 'Overdamped: Q = 0.25', p: { circuit: 'rlc', output: 'C', R: 400, L: 10, C: 1, V: 1, f: 1.5915e6 } },
  { label: 'Example 6.3: real 100 nF capacitor (ESL 1 nH, ESR 10 mΩ)', p: { circuit: 'rlc', output: 'C', R: 0.01, L: 0.001, C: 100, V: 1, f: 15.9e6, esr: 10, esl: 1 }, view: 'zcap' },
];
const FMIN = 1e2, FMAX = 1e10;

export default {
  id: 'filters',
  title: 'Filters',
  phase: 7,
  available: true,
  hideField: true,
  summary: 'RC and series-RLC filters: Bode plots, waveforms and energy at a drive frequency, step response, the real capacitor; C and L from the field tabs.',
  extent: [0, 1, 0, 1],
  axes: ['x', 'y'],
  layers: [],

  pDefaults: { circuit: 'rlc', output: 'R', R: 10, L: 10, C: 1, V: 10, f: 1.5915e6, esr: 10, esl: 1, ebd: 3, gap: 1 }, // Ω, µH, nF, V, Hz, mΩ, nH, MV/m, mm

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) if (typeof this.p[k] === 'number') this.p[k] = getNum(s, `f_${k}`, this.p[k]);
    this.p.circuit = s.f_circuit === 'rc' ? 'rc' : 'rlc';
    this.p.output = OUTPUTS[this.p.circuit].some(([o]) => o === s.f_output) ? s.f_output : this.p.circuit === 'rc' ? 'C' : 'R';
    this.src = { C: s.f_csrc ?? '', L: s.f_lsrc ?? '' };
    this.results = null;
    this.views = [
      plotView('bode', 'Bode plot', (ctx, w, h) => this.drawBode(ctx, w, h)),
      plotView('time', 'Waveforms at f', (ctx, w, h) => this.drawTime(ctx, w, h)),
      plotView('step', 'Step response', (ctx, w, h) => this.drawStep(ctx, w, h)),
      plotView('zcap', 'Real capacitor |Z|', (ctx, w, h) => this.drawZcap(ctx, w, h)),
    ];
    this.buildControls();
  },

  // ------------------------------------------------------------ model (SI)

  circ() { const p = this.p; return { circuit: p.circuit, output: p.output, R: p.R, L: p.circuit === 'rc' ? 0 : p.L * 1e-6, C: p.C * 1e-9 }; },

  compute() {
    const c = this.circ(), p = this.p, w = 2 * PI * p.f;
    const ch = characteristics(c);
    const H = transfer(c, w);
    const ss = steadyState(c, w, p.V);
    const r = { ch, H, db: gainDb(H), ph: phaseDeg(H), ss, Vout: p.V * Math.hypot(...H) };
    if (c.circuit === 'rlc') {
      const s0 = steadyState(c, ch.w0, p.V);
      r.res = { I: s0.amp.I, vC: s0.amp.vC, vL: s0.amp.vL, wC: Math.max(...s0.wC), wL: Math.max(...s0.wL), P: s0.Pavg, lossPerCycle: s0.Pavg * s0.T };
      r.res.Qenergy = (2 * PI * r.res.wC) / r.res.lossPerCycle;
      r.limits = rlcLimits(c.output, ch.Q);
    }
    r.Vmax = p.ebd * 1e6 * p.gap * 1e-3;
    r.fsr = selfResonance({ C: c.C, esl: p.esl * 1e-9 });
    this.results = r;
    this.renderResults();
  },

  render() { return null; },

  // ------------------------------------------------------------ plots

  frame(ctx, W, H, { lo, hi, a0, a1, logx = false, xlabel, ylabel, top = 72, bottom = 48, left = 84 }) {
    const L = left, T = top, B = bottom, Rm = 20;
    const fx = (v) => (logx ? Math.log10(v) : v), X0 = fx(a0), X1 = fx(a1);
    const px = (v) => L + ((fx(v) - X0) / (X1 - X0 || 1)) * (W - L - Rm), py = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955'; ctx.textAlign = 'left';
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 22, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(W - Rm, py(v)); ctx.stroke(); }
    if (logx) { for (let e = Math.ceil(X0); e <= Math.floor(X1); e++) { const x = px(10 ** e); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke(); ctx.fillStyle = '#5a5955'; ctx.fillText(fmtHz(10 ** e), x - 14, H - B + 16); } }
    else for (let k = 0; k <= 6; k++) { const v = a0 + (k / 6) * (a1 - a0); ctx.fillText(sci(v, 3), Math.min(px(v) - 14, W - Rm - 50), H - B + 16); }
    ctx.fillText(xlabel, W / 2 - 60, H - 6);
    ctx.save(); ctx.translate(10, T + 0.5 * (H - T - B)); ctx.rotate(-PI / 2); ctx.textAlign = 'center'; ctx.fillText(ylabel, 0, 0); ctx.restore();
    if (lo < 0 && hi > 0) { ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke(); }
    const line = (xs, ys, color, dash = []) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath(); let pen = false; for (let k = 0; k < xs.length; k++) { const y = ys[k]; if (!Number.isFinite(y)) { pen = false; continue; } const X = px(xs[k]), Y = Math.max(T - 2, Math.min(H - B + 2, py(y))); if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; } } ctx.stroke(); ctx.setLineDash([]); };
    const vline = (x, color, label, rowIdx = 0) => { const X = px(x); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X, T); ctx.lineTo(X, H - B); ctx.stroke(); ctx.setLineDash([]); if (label) { ctx.fillStyle = color; const tw = ctx.measureText(label).width; ctx.fillText(label, X + 4 + tw > W - Rm ? X - 4 - tw : X + 4, T + 12 + 14 * rowIdx); } };
    const legend = (items, y0 = 16) => { let lx = L, ly = y0; for (const [name, color, dash] of items) { const wdt = ctx.measureText(name).width + 46; if (lx + wdt > W - Rm && lx > L) { lx = L; ly += 16; } ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash(dash ?? []); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 28, ly + 4); lx += wdt; } return ly + 16; };
    const caption = (text, y) => { const words = text.split(' '); let lineTxt = ''; for (const wd of words) { const trial = lineTxt ? `${lineTxt} ${wd}` : wd; if (ctx.measureText(trial).width > W - L - Rm && lineTxt) { ctx.fillStyle = '#5a5955'; ctx.fillText(lineTxt, L, y); y += 14; lineTxt = wd; } else lineTxt = trial; } if (lineTxt) { ctx.fillStyle = '#5a5955'; ctx.fillText(lineTxt, L, y); } };
    return { px, py, line, vline, legend, caption, L, T, B, Rm };
  },

  drawBode(ctx, W, H) {
    if (!this.results) this.compute();
    const c = this.circ(), p = this.p, r = this.results, ch = r.ch;
    const fc = c.circuit === 'rc' ? ch.fc : ch.f0;
    const f0 = Math.max(FMIN, fc / 1000), f1 = Math.min(FMAX, fc * 1000);
    const n = 600, fs = [], db = [], ph = [];
    for (let k = 0; k < n; k++) { const f = f0 * Math.pow(f1 / f0, k / (n - 1)); const Hk = transfer(c, 2 * PI * f); fs.push(f); db.push(gainDb(Hk)); ph.push(phaseDeg(Hk)); }
    const half = Math.floor(H * 0.58);
    // magnitude (top)
    const dbMax = Math.max(5, Math.ceil(Math.max(...db) / 10) * 10 + 5), dbMin = Math.max(-120, Math.min(...db.filter(Number.isFinite)) - 5);
    const A = this.frame(ctx, W, half, { lo: dbMin, hi: dbMax, a0: f0, a1: f1, logx: true, xlabel: '', ylabel: '|H| (dB)', top: 60, bottom: 18 });
    A.line(fs, db, '#1f5fbf');
    A.vline(fc, '#e5484d', c.circuit === 'rc' ? `f_c = ${fmtHz(fc)}` : `f₀ = ${fmtHz(fc)}`, 0);
    if (c.circuit === 'rlc' && c.output !== 'C' && c.output !== 'L') { A.vline(ch.f1, '#2a9d4b', `f₁ = ${fmtHz(ch.f1)}`, 1); A.vline(ch.f2, '#2a9d4b', `f₂ = ${fmtHz(ch.f2)}`, 2); }
    A.vline(p.f, '#f5a623', `drive ${fmtHz(p.f)}: ${r.db.toFixed(2)} dB`, 3);
    ctx.strokeStyle = '#bbb'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(A.px(f0), A.py(-3)); ctx.lineTo(A.px(f1), A.py(-3)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#999'; ctx.fillText('−3 dB', A.px(f1) - 44, A.py(-3) - 4);
    const y = A.legend([[`|H| = |V_out / V_in|, output across ${OUTPUTS[c.circuit].find(([o]) => o === c.output)[1]}`, '#1f5fbf']]);
    A.caption(c.circuit === 'rc' ? `first order: 20 dB per decade beyond f_c = 1/2πRC = ${fmtHz(ch.fc)}, −3 dB and ∓45° at f_c` : `second order: ${r.limits.slope}; Q = ${ch.Q.toFixed(3)}, |H| at f₀ = ${r.limits.w0 === 1 ? '1' : r.limits.w0 === 0 ? '0' : `Q = ${ch.Q.toFixed(3)}`}, bandwidth B = f₀/Q = ${fmtHz(ch.fB)}${ch.Q > 0.7072 ? ' (peaks: Q > 1/√2)' : ch.Q > 0.7070 ? ' (maximally flat)' : ' (no peak)'}`, y);
    // phase (bottom)
    ctx.save(); ctx.translate(0, half);
    const Hb = H - half;
    const Pm = this.frame(ctx, W, Hb, { lo: -180, hi: 180, a0: f0, a1: f1, logx: true, xlabel: 'frequency (Hz, log)', ylabel: 'phase (°)', top: 10, bottom: 44 });
    Pm.line(fs, ph, '#7b61ff');
    Pm.vline(fc, '#e5484d'); Pm.vline(p.f, '#f5a623', `${r.ph.toFixed(1)}° at the drive`, 0);
    ctx.restore();
  },

  drawTime(ctx, W, H) {
    if (!this.results) this.compute();
    const c = this.circ(), p = this.p, r = this.results, ss = r.ss;
    const half = Math.floor(H * 0.6);
    const vals = [...ss.vin, ...ss.vout, ...(c.circuit === 'rlc' ? [...ss.vC, ...ss.vL] : [])];
    const m = Math.max(...vals.map(Math.abs)) * 1.08 || 1;
    const A = this.frame(ctx, W, half, { lo: -m, hi: m, a0: 0, a1: ss.t[ss.t.length - 1], xlabel: '', ylabel: 'V', top: 76, bottom: 18 });
    const tus = ss.t;
    A.line(tus, ss.vin, '#5a5955', [5, 4]); A.line(tus, ss.vout, '#1f5fbf');
    const items = [['v_in', '#5a5955', [5, 4]], [`v_out (${r.Vout.toPrecision(4)} V, ${(r.ph).toFixed(1)}°)`, '#1f5fbf']];
    if (c.circuit === 'rlc') { A.line(tus, ss.vC, '#e5484d', [2, 3]); A.line(tus, ss.vL, '#2a9d4b', [2, 3]); items.push([`v_C (${ss.amp.vC.toPrecision(4)} V)`, '#e5484d', [2, 3]], [`v_L (${ss.amp.vL.toPrecision(4)} V)`, '#2a9d4b', [2, 3]]); }
    const y = A.legend(items);
    A.caption(`steady state at f = ${fmtHz(p.f)}, three periods (T = ${sci(ss.T, 3)} s); current amplitude ${sci(ss.amp.I, 4)} A${c.circuit === 'rlc' ? `; at resonance v_C and v_L are each Q·V_in = ${sci(r.res.vC, 4)} V and cancel in the loop` : ''}`, y);
    // energies (bottom)
    ctx.save(); ctx.translate(0, half);
    const Hb = H - half, em = Math.max(...ss.wC, ...ss.wL, 1e-300) * 1.1;
    const E = this.frame(ctx, W, Hb, { lo: 0, hi: em, a0: 0, a1: ss.t[ss.t.length - 1], xlabel: 'time (s)', ylabel: 'energy (J)', top: 24, bottom: 44 });
    E.line(tus, ss.wC, '#e5484d'); if (c.circuit === 'rlc') { E.line(tus, ss.wL, '#2a9d4b'); E.line(tus, ss.wC.map((v, k) => v + ss.wL[k]), '#5a5955', [3, 3]); }
    E.legend(c.circuit === 'rlc' ? [['½Cv_C²', '#e5484d'], ['½Li²', '#2a9d4b'], ['sum', '#5a5955', [3, 3]]] : [['½Cv_C²', '#e5484d']], 12);
    ctx.restore();
  },

  drawStep(ctx, W, H) {
    if (!this.results) this.compute();
    const c = this.circ(), p = this.p, ch = this.results.ch;
    const Tend = c.circuit === 'rc' ? 6 * ch.tau : (ch.zeta < 1 ? 8 / Math.max(ch.zeta * ch.w0, ch.w0 / 40) : 8 / (ch.w0 * (ch.zeta - Math.sqrt(ch.zeta * ch.zeta - 1))));
    const n = 2000, ts = []; for (let k = 0; k < n; k++) ts.push((Tend * k) / (n - 1));
    const s = stepResponse(c, p.V, ts);
    const vals = [...s.vout, ...s.vC, ...(c.circuit === 'rlc' ? s.vL : [])];
    const lo = Math.min(0, ...vals) * 1.08, hi = Math.max(p.V, ...vals) * 1.08;
    const A = this.frame(ctx, W, H, { lo, hi, a0: 0, a1: Tend, xlabel: 'time after the step (s)', ylabel: 'V', top: 76 });
    ctx.strokeStyle = '#bbb'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(A.px(0), A.py(p.V)); ctx.lineTo(A.px(Tend), A.py(p.V)); ctx.stroke(); ctx.setLineDash([]);
    A.line(ts, s.vout, '#1f5fbf');
    const items = [['v_out', '#1f5fbf']];
    if (c.output !== 'C') { A.line(ts, s.vC, '#e5484d', [2, 3]); items.push(['v_C', '#e5484d', [2, 3]]); }
    if (c.circuit === 'rlc' && c.output !== 'L') { A.line(ts, s.vL, '#2a9d4b', [2, 3]); items.push(['v_L', '#2a9d4b', [2, 3]]); }
    const y = A.legend(items);
    if (c.circuit === 'rc') A.caption(`v_C rises as 1 − e^{−t/τ}, τ = RC = ${sci(ch.tau, 4)} s: 63 % at τ, 95 % at 3τ; the resistor sees the rest`, y);
    else { const os = ch.zeta < 1 ? 100 * Math.exp(-PI * ch.zeta / Math.sqrt(1 - ch.zeta * ch.zeta)) : 0; A.caption(`ζ = 1/2Q = ${ch.zeta.toFixed(4)}: ${ch.damping}${ch.zeta < 1 ? `; rings at f_d = f₀√(1−ζ²) = ${fmtHz(ch.f0 * Math.sqrt(1 - ch.zeta * ch.zeta))}, overshoot of v_C ${os.toFixed(1)} %, envelope decays as e^{−t/2τ} with 2L/R = ${sci(2 * c.L / c.R, 3)} s` : ''}`, y); }
  },

  drawZcap(ctx, W, H) {
    if (!this.results) this.compute();
    const p = this.p, C = p.C * 1e-9, esr = p.esr * 1e-3, esl = p.esl * 1e-9, fsr = selfResonance({ C, esl });
    const f0 = Math.max(FMIN, fsr / 1e4), f1 = Math.min(FMAX, fsr * 1e3);
    const n = 600, fs = [], z = [], zc = [], zl = [];
    for (let k = 0; k < n; k++) { const f = f0 * Math.pow(f1 / f0, k / (n - 1)), w = 2 * PI * f; fs.push(f); z.push(Math.log10(realCapacitorZ({ C, esr, esl }, w))); zc.push(Math.log10(1 / (w * C))); zl.push(Math.log10(w * esl)); }
    const lo = Math.min(...z) - 0.3, hi = Math.max(...z) + 0.3;
    const A = this.frame(ctx, W, H, { lo, hi, a0: f0, a1: f1, logx: true, xlabel: 'frequency (Hz, log)', ylabel: 'log₁₀ |Z| (Ω)', top: 76 });
    A.line(fs, zc, '#e5484d', [4, 3]); A.line(fs, zl, '#2a9d4b', [4, 3]); A.line(fs, z, '#1f5fbf');
    ctx.strokeStyle = '#bbb'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(A.px(f0), A.py(Math.log10(esr))); ctx.lineTo(A.px(f1), A.py(Math.log10(esr))); ctx.stroke(); ctx.setLineDash([]);
    A.vline(fsr, '#e5484d', `f_SR = ${fmtHz(fsr)}`, 0); A.vline(p.f, '#f5a623', `drive: |Z| = ${sci(realCapacitorZ({ C, esr, esl }, 2 * PI * p.f), 4)} Ω`, 1);
    const y = A.legend([['|Z| of the real part', '#1f5fbf'], ['1/2πfC (ideal capacitor)', '#e5484d', [4, 3]], ['2πf·ESL (its leads)', '#2a9d4b', [4, 3]]]);
    A.caption(`C = ${p.C} nF, ESL = ${p.esl} nH, ESR = ${p.esr} mΩ: a capacitor below f_SR, an inductor above it, |Z| = ESR at f_SR (dotted). Adding more of the same part above f_SR adds inductance, not capacitance.`, y);
  },

  // ------------------------------------------------------------ shell hooks

  statusText() {
    const r = this.results; if (!r) return '';
    const c = this.circ(), ch = r.ch;
    return c.circuit === 'rc' ? `RC, output across ${c.output}: f_c = ${fmtHz(ch.fc)}, τ = ${sci(ch.tau, 3)} s · at ${fmtHz(this.p.f)}: ${r.db.toFixed(2)} dB, ${r.ph.toFixed(1)}°`
      : `series RLC, output across ${c.output}: f₀ = ${fmtHz(ch.f0)}, Q = ${ch.Q.toFixed(3)}, B = ${fmtHz(ch.fB)} · at ${fmtHz(this.p.f)}: ${r.db.toFixed(2)} dB, ${r.ph.toFixed(1)}°`;
  },

  probe() { return []; },

  getState() {
    const s = { f_circuit: this.p.circuit, f_output: this.p.output };
    for (const [k, v] of Object.entries(this.p)) if (typeof v === 'number') s[`f_${k}`] = v;
    if (this.src.C) s.f_csrc = this.src.C; if (this.src.L) s.f_lsrc = this.src.L;
    return s;
  },

  csv() {
    if (!this.results) this.compute();
    const c = this.circ(), ch = this.results.ch, fc = c.circuit === 'rc' ? ch.fc : ch.f0;
    const lines = ['f_Hz,gain_dB,phase_deg'];
    for (let k = 0; k < 300; k++) { const f = (fc / 1000) * Math.pow(1e6, k / 299), Hk = transfer(c, 2 * PI * f); lines.push(`${f},${gainDb(Hk)},${phaseDeg(Hk)}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ cross-tab components

  /** The last solved C or L of a field tab in this session, or null with a reason. */
  fromTab(id) {
    const t = this.shell.tabs.find((x) => x.id === id);
    if (!t?.results) return { err: `visit the ${t?.title ?? id} tab first; its last solved value is used` };
    switch (id) {
      case 'capacitors': return { C: t.results.cEnergy, gap: t.p.g, label: `Capacitors (C from energy, gap ${t.p.g} mm)` };
      case 'dielectrics': return { C: t.results.C, gap: t.p.d, label: `Dielectrics (gap ${t.p.d} mm, depth ${t.p.depth} mm)` };
      case 'inductors': return { L: t.results.Lflux, label: `Inductors (flux linkage${t.objectIn ? ', with the object' : ', empty coil'})` };
      case 'solenoids': return { L: t.results.Lnag, label: 'Solenoids (Nagaoka, air core)' };
      default: return { err: 'unknown tab' };
    }
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Filters'));
    box.appendChild(ui.lead(shell, 'RC and series-RLC circuits as frequency-dependent voltage dividers: everything follows from i = C dv/dt and v = L di/dt.'));
    const re = () => { shell.recompute(); shell.syncUrl(); };
    const reb = () => { this.buildControls(); re(); };

    box.appendChild(ui.el('h2', '', 'Presets (handout §6)'));
    const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
    for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => { Object.assign(this.p, pr.p); this.src = { C: '', L: '' }; this.buildControls(); shell.recompute(); if (pr.view) shell.setStageView(pr.view); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(pw);

    box.appendChild(ui.el('h2', '', 'Circuit'));
    const r0 = ui.el('div', 'row');
    r0.appendChild(ui.field('Elements in series', ui.select([['rc', 'R and C'], ['rlc', 'R, L and C']], p.circuit, (v) => { p.circuit = v; if (!OUTPUTS[v].some(([o]) => o === p.output)) p.output = 'C'; reb(); })));
    r0.appendChild(ui.field('Output across', ui.select(OUTPUTS[p.circuit], p.output, (v) => { p.output = v; reb(); })));
    box.appendChild(r0);
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after(); } }));
    const r1 = ui.el('div', 'row'); r1.append(pf('R', 'R (Ω)', 1e-3, 1e9, () => { re(); })); if (p.circuit === 'rlc') r1.append(pf('L', 'L (µH)', 1e-6, 1e9, () => { this.src.L = ''; reb(); })); r1.append(pf('C', 'C (nF)', 1e-9, 1e9, () => { this.src.C = ''; reb(); })); box.appendChild(r1);
    const srcRow = ui.el('div', 'row'); srcRow.style.flexWrap = 'wrap';
    const pull = (id, what) => ui.button(`${what} from ${this.shell.tabs.find((x) => x.id === id)?.title ?? id}`, () => {
      const v = this.fromTab(id);
      if (v.err) { this.srcNote.textContent = v.err; return; }
      if (v.C !== undefined) { p.C = +(v.C * 1e9).toPrecision(6); this.src.C = v.label; if (v.gap) p.gap = v.gap; }
      if (v.L !== undefined) { p.L = +(v.L * 1e6).toPrecision(6); this.src.L = v.label; }
      reb();
    }, 'btn btn-small');
    srcRow.append(pull('capacitors', 'C'), pull('dielectrics', 'C')); if (p.circuit === 'rlc') srcRow.append(pull('inductors', 'L'), pull('solenoids', 'L'));
    box.appendChild(srcRow);
    this.srcNote = ui.el('p', 'hint', [this.src.C ? `C is ${p.C} nF from ${this.src.C}.` : '', this.src.L ? `L is ${p.L} µH from ${this.src.L}.` : ''].filter(Boolean).join(' ') || 'Pull C or L from a field tab you have solved in this session, and the geometry you built becomes the component here (and its gap sets the breakdown check below).');
    box.appendChild(this.srcNote);

    box.appendChild(ui.el('h2', '', 'Drive'));
    const r2 = ui.el('div', 'row'); r2.append(pf('V', 'Input amplitude V_in (V)', 1e-6, 1e6), pf('f', 'Drive frequency f (Hz)', FMIN, FMAX)); box.appendChild(r2);
    const fl = ui.el('div', 'hint', `f = ${fmtHz(p.f)}`);
    const fr = ui.range(Math.log10(p.f), { min: Math.log10(FMIN), max: Math.log10(FMAX), step: 0.005, ariaLabel: 'drive frequency (log slider)', onInput: (v) => { p.f = +Math.pow(10, v).toPrecision(5); fl.textContent = `f = ${fmtHz(p.f)}`; this.compute(); shell.updateStageView(); shell.refreshStatus(); clearTimeout(this.urlT); this.urlT = setTimeout(() => shell.syncUrl(), 300); } });
    box.append(fl, fr);
    const fb = ui.el('div', 'row');
    const ch = characteristics(this.circ()), fc = p.circuit === 'rc' ? ch.fc : ch.f0;
    for (const [lab, mult] of [['f/10', 0.1], [p.circuit === 'rc' ? 'f = f_c' : 'f = f₀', 1], ['10 f', 10]]) fb.appendChild(ui.button(lab, () => { p.f = +(fc * mult).toPrecision(6); reb(); }, 'btn btn-small'));
    if (p.circuit === 'rlc') for (const [lab, val] of [['f₁', ch.f1], ['f₂', ch.f2]]) fb.appendChild(ui.button(`f = ${lab}`, () => { p.f = +val.toPrecision(6); reb(); }, 'btn btn-small'));
    box.appendChild(fb);

    box.appendChild(ui.el('h2', '', 'Breakdown check'));
    const r3 = ui.el('div', 'row'); r3.append(pf('ebd', 'Dielectric strength E_bd (MV/m)', 0.01, 1e4), pf('gap', 'Gap d (mm)', 1e-4, 1e4)); box.appendChild(r3);
    box.appendChild(ui.el('p', 'hint', 'V_max = E_bd·d for a uniform gap (air 3 MV/m, polyethylene ~20, Teflon 60). At resonance the capacitor sees Q·V_in, not V_in; it has to be rated for that.'));

    if (p.circuit === 'rlc') { box.appendChild(ui.el('h2', '', 'Real capacitor')); const r4 = ui.el('div', 'row'); r4.append(pf('esr', 'ESR (mΩ)', 1e-3, 1e6), pf('esl', 'ESL (nH)', 1e-4, 1e6)); box.appendChild(r4); box.appendChild(ui.el('p', 'hint', 'The part itself is a series RLC: f_SR = 1/2π√(ESL·C). The "Real capacitor |Z|" view draws it for the C above.')); }

    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.style.flexWrap = 'wrap';
    for (const [id, lab] of [['bode', 'Bode plot'], ['time', 'Waveforms'], ['step', 'Step response'], ['zcap', 'Real capacitor']]) vr.appendChild(ui.button(lab, () => { shell.setStageView(id); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(vr);
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, c = this.circ(), p = this.p, ch = r.ch, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    if (c.circuit === 'rc') {
      row('τ = RC', `${sci(ch.tau, 4)} s`); row('f_c = 1/2πRC', fmtHz(ch.fc)); row('ω_c = 1/RC', `${sci(ch.wc, 4)} rad/s`);
      row(`|H| at ${fmtHz(p.f)}`, `${Math.hypot(...r.H).toPrecision(4)} = ${r.db.toFixed(2)} dB`); row('phase', `${r.ph.toFixed(2)}°`); row('V_out amplitude', `${sci(r.Vout, 4)} V`);
      row('one decade above f_c', `${gainDb(transfer(c, 2 * PI * 10 * ch.fc)).toFixed(2)} dB (−20 dB/decade)`);
    } else {
      row('ω₀ = 1/√LC', `${sci(ch.w0, 4)} rad/s`); row('f₀', fmtHz(ch.f0));
      row('Q = ω₀L/R = 1/ω₀RC = (1/R)√(L/C)', ch.Q.toPrecision(4)); row('bandwidth B = ω₀/Q = R/L', `${sci(ch.B, 4)} rad/s = ${fmtHz(ch.fB)}`);
      row('half-power f₁, f₂', `${fmtHz(ch.f1)}, ${fmtHz(ch.f2)} (f₂ − f₁ = ${fmtHz(ch.f2 - ch.f1)}, f₁f₂/f₀² = ${((ch.f1 * ch.f2) / (ch.f0 * ch.f0)).toFixed(6)})`);
      row('ζ = 1/2Q', `${ch.zeta.toPrecision(4)} (${ch.damping})`);
      row(`|H| at ${fmtHz(p.f)}`, `${Math.hypot(...r.H).toPrecision(4)} = ${r.db.toFixed(2)} dB, ${r.ph.toFixed(2)}°`); row('V_out amplitude at f', `${sci(r.Vout, 4)} V`);
      row('at resonance: current amplitude V_in/R', `${sci(r.res.I, 4)} A`); row('at resonance: |V_C| = |V_L| = Q·V_in', `${sci(r.res.vC, 4)} V`);
      row('peak energy ½CV_C² = ½LI²', `${sci(r.res.wC, 4)} J = ${sci(r.res.wL, 4)} J`); row('average power in R, ½I²R', `${sci(r.res.P, 4)} W`); row('energy lost per cycle', `${sci(r.res.lossPerCycle, 4)} J`); row('Q = 2π · peak stored / lost per cycle', r.res.Qenergy.toPrecision(4));
      row('|H| at DC, f₀, high f', `${r.limits.dc}, ${r.limits.w0 === 1 || r.limits.w0 === 0 ? r.limits.w0 : `Q = ${ch.Q.toPrecision(4)}`}, ${r.limits.hf}`);
      row('capacitor must withstand', `${sci(r.res.vC, 4)} V; V_max = E_bd·d = ${sci(r.Vmax, 4)} V → ${r.res.vC > r.Vmax ? '<b>breaks down</b>' : 'OK'} (margin ×${(r.Vmax / r.res.vC).toPrecision(3)})`);
      row('self-resonance of the real capacitor', `${fmtHz(r.fsr)} (ESL ${p.esl} nH)${r.fsr < 10 * ch.f0 ? ' — within a decade of f₀: the part is barely a capacitor here' : ''}`);
    }
  },
};

function fmtHz(f) {
  if (!Number.isFinite(f)) return '—';
  const a = Math.abs(f);
  if (a >= 1e9) return `${(f / 1e9).toPrecision(4)} GHz`; if (a >= 1e6) return `${(f / 1e6).toPrecision(4)} MHz`; if (a >= 1e3) return `${(f / 1e3).toPrecision(4)} kHz`;
  return `${f.toPrecision(4)} Hz`;
}
