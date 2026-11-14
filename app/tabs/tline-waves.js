// Transmission-line waves tab: what happens on a line once it has a load. Sinusoidal steady
// state: the reflection coefficient, VSWR, the standing-wave envelopes with the forward and
// reflected waves animated, the input impedance along the line. Step transient: the bounce
// diagram, V(z, t) snapshots and the staircase at the load. Z0 and v can be pulled from the
// Transmission lines tab (its cross-section).

import { PI, MU0, EPS0 } from '../../core/constants.js';
import { loadZ, gamma, vswr, returnLossDb, zin, steadyState, instantaneous, extrema, stepSetup, bounces, stepV, stepI, cabs, carg } from '../../core/tline.js';
import { lineParams } from './transmission-lines.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const C0 = 1 / Math.sqrt(MU0 * EPS0);
const LOADS = [['R', 'resistor R'], ['matched', 'matched (R = Z₀)'], ['open', 'open circuit'], ['short', 'short circuit'], ['RL', 'R in series with L'], ['RC', 'R in series with C']];
const PRESETS = [
  { label: 'Matched: no reflection', p: { load: 'R', RL: 50 } },
  { label: 'Open end (Γ = +1)', p: { load: 'open' } },
  { label: 'Short end (Γ = −1)', p: { load: 'short' } },
  { label: '100 Ω on 50 Ω (VSWR 2)', p: { load: 'R', RL: 100 } },
  { label: 'Quarter-wave line, 100 Ω → 25 Ω', p: { load: 'R', RL: 100, len: 0.25 } },
  { label: 'Inductive load 25 + jωL', p: { load: 'RL', RL: 25, Lload: 4 } },
  { label: 'Step: Rs = 25, RL = 150 (bounces)', p: { Rs: 25, RL: 150, load: 'R' }, view: 'bounce' },
  { label: 'Step into an open line', p: { Rs: 50, load: 'open' }, view: 'transient' },
];

export default {
  id: 'tline-waves',
  title: 'Line waves',
  phase: 7,
  available: true,
  hideField: true,
  summary: 'Waves on a terminated line: Γ, VSWR, standing waves animated, Z_in along the line, the step bounce diagram and V(z, t).',
  extent: [0, 1, 0, 1],
  axes: ['x', 'y'],
  layers: [],

  pDefaults: { Z0: 50, vc: 0.667, f: 1e9, len: 0.37, Vs: 2, Rs: 50, load: 'R', RL: 100, Lload: 4, Cload: 2, tp: 0 }, // Ω, v/c, Hz, length in wavelengths, V, Ω, —, Ω, nH, pF, pulse width in delays (0 = step)

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) this.p[k] = typeof this.pDefaults[k] === 'number' ? getNum(s, `tw_${k}`, this.p[k]) : (s[`tw_${k}`] ?? this.p[k]);
    if (!LOADS.some(([k]) => k === this.p.load)) this.p.load = 'R';
    this.src = s.tw_src ?? '';
    this.t = getNum(s, 't', 0); this.speed = getNum(s, 'spd', 0.05); this.playing = false;
    this.views = [
      plotView('standing', 'Standing wave', (ctx, w, h) => this.drawStanding(ctx, w, h), { controls: (ctl, inst) => this.timeControls(ctl, inst, 'ss') }),
      plotView('impedance', 'Z_in along the line', (ctx, w, h) => this.drawImpedance(ctx, w, h)),
      plotView('bounce', 'Bounce diagram', (ctx, w, h) => this.drawBounce(ctx, w, h)),
      plotView('transient', 'Step: V(z, t)', (ctx, w, h) => this.drawTransient(ctx, w, h), { controls: (ctl, inst) => this.timeControls(ctl, inst, 'tr') }),
    ];
    this.buildControls();
  },
  destroy() { this.stop(); },

  // ------------------------------------------------------------ model

  line() { const p = this.p, v = p.vc * C0, w = 2 * PI * p.f, lam = v / p.f; return { Z0: p.Z0, v, w, beta: w / v, lam, l: p.len * lam, T: (p.len * lam) / v }; },
  ZL() { const p = this.p, L = this.line(); return loadZ({ kind: p.load, R: p.RL, L: p.Lload * 1e-9, C: p.Cload * 1e-12, Z0: p.Z0 }, L.w); },
  compute() {
    const p = this.p, L = this.line(), ZL = this.ZL();
    const ss = steadyState({ Vs: p.Vs, Rs: p.Rs, Z0: p.Z0, beta: L.beta, l: L.l, ZL });
    const ex = extrema(ss.GL, L.beta);
    const RLt = p.load === 'open' ? Infinity : p.load === 'short' ? 0 : p.load === 'matched' ? p.Z0 : p.RL; // the transient uses the resistive part
    const su = stepSetup({ Vs: p.Vs, Rs: p.Rs, Z0: p.Z0, RL: RLt, l: L.l, v: L.v });
    this.res = { L, ZL, ss, ex, su, waves: bounces(su, 12), RLt, rl: returnLossDb(ss.GL) };
    this.renderResults();
  },
  render() { return null; },

  // ------------------------------------------------------------ time

  duration(kind) { const L = this.line(); return kind === 'ss' ? 2 / this.p.f : 8 * L.T; },
  timeControls(ctl, inst, kind) {
    const T = this.duration(kind);
    const play = ui.button(this.playing ? 'Pause' : 'Play', () => { if (this.playing) this.stop(); else this.play(kind); play.textContent = this.playing ? 'Pause' : 'Play'; }, 'btn btn-small');
    const lab = ui.el('span', '', kind === 'ss' ? `t = ${(this.t * this.p.f).toFixed(2)} periods` : `t = ${(this.t / this.line().T).toFixed(2)} delays`);
    const sl = ui.range(Math.min(this.t, T), { min: 0, max: T, step: T / 1000, ariaLabel: 'time', onInput: (v) => { this.t = v; this.tick(kind); } }); sl.style.width = '220px';
    ctl.append(play, ui.button('t = 0', () => { this.t = 0; this.tick(kind); }, 'btn btn-small'), ui.el('span', '', 'time:'), sl, lab, ui.el('span', '', 'speed:'));
    ctl.appendChild(ui.range(Math.log10(this.speed), { min: -2.5, max: 0.5, step: 0.05, ariaLabel: 'playback speed (log)', onInput: (v) => { this.speed = Math.pow(10, v); } }));
    this.timeUi = { lab, sl, inst, kind };
  },
  tick(kind) { if (this.timeUi) { this.timeUi.lab.textContent = kind === 'ss' ? `t = ${(this.t * this.p.f).toFixed(2)} periods` : `t = ${(this.t / this.line().T).toFixed(2)} delays`; this.timeUi.sl.value = this.t; } this.shell.updateStageView(); },
  play(kind) { this.playing = true; let last = performance.now(); const T = this.duration(kind); const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; this.t += dt * this.speed * T; if (this.t > T) this.t -= T; this.tick(kind); this.raf = requestAnimationFrame(step); }; this.raf = requestAnimationFrame(step); },
  stop() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; },

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
    const line = (xs, ys, color, dash = [], width = 2) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); let pen = false; for (let k = 0; k < xs.length; k++) { const y = ys[k]; if (!Number.isFinite(y)) { pen = false; continue; } const X = px(xs[k]), Y = Math.max(T - 2, Math.min(H - B + 2, py(y))); if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; } } ctx.stroke(); ctx.setLineDash([]); };
    const legend = (items, y0 = 16) => { let lx = L, ly = y0; for (const [name, color, dash] of items) { const wdt = ctx.measureText(name).width + 46; if (lx + wdt > W - Rm && lx > L) { lx = L; ly += 16; } ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash(dash ?? []); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 28, ly + 4); lx += wdt; } return ly + 16; };
    const caption = (text, y) => { const words = text.split(' '); let lineTxt = ''; ctx.fillStyle = '#5a5955'; for (const wd of words) { const trial = lineTxt ? `${lineTxt} ${wd}` : wd; if (ctx.measureText(trial).width > W - L - Rm && lineTxt) { ctx.fillText(lineTxt, L, y); y += 14; lineTxt = wd; } else lineTxt = trial; } if (lineTxt) ctx.fillText(lineTxt, L, y); return y + 14; };
    const vline = (x, color, label, rowIdx = 0) => { const X = px(x); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X, T); ctx.lineTo(X, H - B); ctx.stroke(); ctx.setLineDash([]); if (label) { ctx.fillStyle = color; const tw = ctx.measureText(label).width; ctx.fillText(label, X + 4 + tw > W - Rm ? X - 4 - tw : X + 4, T + 12 + 14 * rowIdx); } };
    return { px, py, line, legend, caption, vline, L, T, B, Rm };
  },

  drawStanding(ctx, W, H) {
    if (!this.res) this.compute();
    const r = this.res, L = r.L, p = this.p, n = 400;
    const ds = [], env = [], envI = [], fwd = [], ref = [], tot = [];
    for (let k = 0; k < n; k++) { const d = (L.l * k) / (n - 1); ds.push(d); env.push(cabs(r.ss.V(d))); envI.push(cabs(r.ss.I(d)) * p.Z0); const inst = instantaneous(r.ss, L.beta, L.w, d, this.t); fwd.push(inst.fwd); ref.push(inst.ref); tot.push(inst.total); }
    const m = Math.max(...env, 1e-12) * 1.1;
    const A = this.frame(ctx, W, H, { lo: -m, hi: m, a0: L.l, a1: 0, xlabel: 'position: generator (left) → load (right); distance from the load d (m)', ylabel: 'V', top: 100, fmtX: (v) => (v).toPrecision(3) });
    A.line(ds, env, '#1f5fbf', [], 1.5); A.line(ds, env.map((v) => -v), '#1f5fbf', [], 1.5);
    A.line(ds, envI, '#2a9d4b', [3, 3], 1); A.line(ds, envI.map((v) => -v), '#2a9d4b', [3, 3], 1);
    A.line(ds, fwd, '#f5a623', [5, 4]); A.line(ds, ref, '#7b61ff', [5, 4]); A.line(ds, tot, '#e5484d', [], 2.5);
    for (let d = r.ex.dmax, k = 0; d <= L.l && k < 20; d += L.lam / 2, k++) A.vline(d, '#1f5fbf', k === 0 ? `V_max at d = ${d.toPrecision(3)} m` : '', 0);
    for (let d = r.ex.dmin, k = 0; d <= L.l && k < 20; d += L.lam / 2, k++) A.vline(d, '#9aa4b8', k === 0 ? `V_min at d = ${d.toPrecision(3)} m` : '', 1);
    const y = A.legend([['|V(d)| envelope', '#1f5fbf'], ['Z₀|I(d)| envelope', '#2a9d4b', [3, 3]], ['forward wave V⁺(d, t)', '#f5a623', [5, 4]], ['reflected wave V⁻(d, t)', '#7b61ff', [5, 4]], ['total V(d, t)', '#e5484d']]);
    A.caption(`|Γ_L| = ${cabs(r.ss.GL).toFixed(3)} ∠${((carg(r.ss.GL) * 180) / PI).toFixed(1)}°, VSWR = ${Number.isFinite(r.ss.vswr) ? r.ss.vswr.toFixed(3) : '∞'}: the total wave's envelope has maxima every λ/2 where the forward and reflected waves add in phase; V_max/V_min = VSWR. The forward wave travels toward the load, the reflected one back; a mismatch makes the sum partly a standing wave.`, y);
  },

  drawImpedance(ctx, W, H) {
    if (!this.res) this.compute();
    const r = this.res, L = r.L, p = this.p, n = 600, ds = [], re = [], im = [], mag = [];
    const span = Math.max(L.l, L.lam);
    for (let k = 0; k < n; k++) { const d = (span * k) / (n - 1); const z = zin(r.ZL, p.Z0, L.beta, d); ds.push(d / L.lam); re.push(Number.isFinite(z[0]) ? z[0] : NaN); im.push(Number.isFinite(z[1]) ? z[1] : NaN); mag.push(Number.isFinite(z[0]) ? cabs(z) : NaN); }
    const vals = [...re, ...im].filter(Number.isFinite).sort((a, b) => a - b), lo = Math.min(-p.Z0, vals[Math.floor(0.03 * vals.length)]), hi = Math.max(2 * p.Z0, vals[Math.floor(0.97 * vals.length)]);
    const A = this.frame(ctx, W, H, { lo, hi, a0: 0, a1: span / L.lam, xlabel: 'distance from the load d (wavelengths)', ylabel: 'Z_in (Ω)', top: 96, fmtX: (v) => v.toFixed(2) });
    ctx.strokeStyle = '#bbb'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(A.px(0), A.py(p.Z0)); ctx.lineTo(A.px(span / L.lam), A.py(p.Z0)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#999'; ctx.fillText('Z₀', A.px(span / L.lam) - 20, A.py(p.Z0) - 4);
    A.line(ds, re, '#1f5fbf'); A.line(ds, im, '#e5484d', [5, 4]); A.line(ds, mag, '#5a5955', [2, 3], 1);
    A.vline(L.l / L.lam, '#2a9d4b', `generator end: Z_in = ${fmtZ(r.ss.Zin)}`, 0); A.vline(0.25, '#999', 'λ/4', 1); A.vline(0.5, '#999', 'λ/2', 2);
    const y = A.legend([['Re Z_in', '#1f5fbf'], ['Im Z_in', '#e5484d', [5, 4]], ['|Z_in|', '#5a5955', [2, 3]]]);
    A.caption(`Z_in(d) = Z₀ (Z_L + jZ₀ tan βd)/(Z₀ + jZ_L tan βd) repeats every λ/2; at d = λ/4 it is Z₀²/Z_L (${fmtZ(zin(r.ZL, p.Z0, L.beta, L.lam / 4))}), the quarter-wave transformer. A matched load is the only one that reads Z₀ everywhere.`, y);
  },

  drawBounce(ctx, W, H) {
    if (!this.res) this.compute();
    const r = this.res, su = r.su, L = r.L, nT = 8;
    const Lm = 100, Rm = 130, T0 = 84, B0 = 44;
    const X = (z) => Lm + (z / L.l) * (W - Lm - Rm), Y = (t) => T0 + (t / (nT * su.T)) * (H - T0 - B0);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(nT * su.T)); ctx.moveTo(X(L.l), Y(0)); ctx.lineTo(X(L.l), Y(nT * su.T)); ctx.stroke();
    ctx.fillText(`generator  Γ_s = ${su.Gs.toFixed(3)}`, X(0) - 10, Y(0) - 10); ctx.textAlign = 'right'; ctx.fillText(`load  Γ_L = ${su.GL.toFixed(3)}`, X(L.l) + 60, Y(0) - 10); ctx.textAlign = 'left';
    for (let k = 0; k <= nT; k++) { ctx.fillStyle = '#5a5955'; ctx.fillText(`${k}T`, 40, Y(k * su.T) + 4); ctx.strokeStyle = '#f3f3f3'; ctx.beginPath(); ctx.moveTo(X(0), Y(k * su.T)); ctx.lineTo(X(L.l), Y(k * su.T)); ctx.stroke(); }
    let Vl = 0, Vg = 0;
    for (const w of r.waves) {
      if (w.t0 >= nT * su.T) break;
      const x0 = w.dir > 0 ? 0 : L.l, x1 = w.dir > 0 ? L.l : 0;
      ctx.strokeStyle = w.dir > 0 ? '#e5484d' : '#1f5fbf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x0), Y(w.t0)); ctx.lineTo(X(x1), Y(w.t0 + su.T)); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(`${w.amp >= 0 ? '+' : ''}${sci(w.amp, 3)} V`, (X(x0) + X(x1)) / 2 - 20, (Y(w.t0) + Y(w.t0 + su.T)) / 2 - 4);
      if (w.dir > 0) { Vl += w.amp * (1 + su.GL); ctx.fillStyle = '#5a5955'; ctx.fillText(`V_L = ${sci(Vl, 4)} V`, X(L.l) + 8, Y(w.t0 + su.T) + 4); }
      else { Vg += w.amp * (1 + su.Gs); ctx.fillStyle = '#5a5955'; ctx.fillText(`V_in = ${sci(su.V1 + Vg, 4)} V`, 4, Y(w.t0 + su.T) + 16); }
    }
    ctx.fillStyle = '#5a5955';
    const cap = `A step of ${this.p.Vs} V through R_s = ${this.p.Rs} Ω launches V₁⁺ = V_s Z₀/(R_s + Z₀) = ${sci(su.V1, 4)} V. Each wave reflects at the load with Γ_L and at the source with Γ_s; the voltage at either end is the running sum. Final value V_s R_L/(R_s + R_L) = ${Number.isFinite(su.Vfinal) ? sci(su.Vfinal, 4) : '—'} V. One-way delay T = l/v = ${sci(su.T, 3)} s.`;
    const words = cap.split(' '); let line = '', y = 18; for (const wd of words) { const trial = line ? `${line} ${wd}` : wd; if (ctx.measureText(trial).width > W - 24 && line) { ctx.fillText(line, 12, y); y += 14; line = wd; } else line = trial; } if (line) ctx.fillText(line, 12, y);
  },

  drawTransient(ctx, W, H) {
    if (!this.res) this.compute();
    const r = this.res, su = r.su, L = r.L, p = this.p, tp = p.tp * su.T;
    const half = Math.floor(H * 0.55);
    const n = 400, zs = [], Vz = [], Iz = [];
    for (let k = 0; k < n; k++) { const z = (L.l * k) / (n - 1); zs.push(z); Vz.push(stepV(su, r.waves, L.l, z, this.t, tp)); Iz.push(stepI(su, r.waves, L.l, z, this.t, p.Z0, tp) * p.Z0); }
    const vm = Math.max(Math.abs(p.Vs), ...Vz.map(Math.abs), ...Iz.map(Math.abs)) * 1.15 || 1;
    const A = this.frame(ctx, W, half, { lo: -vm, hi: vm, a0: 0, a1: L.l, xlabel: 'z along the line (m): generator at 0, load at l', ylabel: 'V', top: 60, bottom: 40, fmtX: (v) => v.toPrecision(3) });
    A.line(zs, Vz, '#e5484d'); A.line(zs, Iz, '#2a9d4b', [4, 3]);
    const y = A.legend([[`V(z) at t = ${(this.t / su.T).toFixed(2)} T`, '#e5484d'], ['Z₀ I(z)', '#2a9d4b', [4, 3]]]);
    A.caption(`${tp > 0 ? `a pulse ${p.tp} delays wide` : 'a step'} travelling and reflecting: where only a forward wave exists V = Z₀I; after a reflection the two differ by the reflected wave`, y);
    ctx.save(); ctx.translate(0, half);
    const Hb = H - half, nt = 400, ts = [], VL = [], VG = [];
    for (let k = 0; k < nt; k++) { const t = (8 * su.T * k) / (nt - 1); ts.push(t / su.T); VL.push(stepV(su, r.waves, L.l, L.l, t, tp)); VG.push(stepV(su, r.waves, L.l, 0, t, tp)); }
    const B = this.frame(ctx, W, Hb, { lo: -vm, hi: vm, a0: 0, a1: 8, xlabel: 'time (one-way delays T)', ylabel: 'V', top: 28, bottom: 44, fmtX: (v) => v.toFixed(1) });
    B.line(ts, VL, '#e5484d'); B.line(ts, VG, '#1f5fbf', [5, 4]);
    if (Number.isFinite(su.Vfinal) && tp === 0) { ctx.strokeStyle = '#bbb'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(B.px(0), B.py(su.Vfinal)); ctx.lineTo(B.px(8), B.py(su.Vfinal)); ctx.stroke(); ctx.setLineDash([]); }
    B.vline(this.t / su.T, '#f5a623', 'now', 0);
    B.legend([['V at the load', '#e5484d'], ['V at the generator end', '#1f5fbf', [5, 4]]], 14);
    ctx.restore();
  },

  // ------------------------------------------------------------ shell hooks

  statusText() { const r = this.res; if (!r) return ''; return `Z₀ = ${this.p.Z0} Ω, v = ${this.p.vc} c, l = ${this.p.len} λ = ${r.L.l.toPrecision(3)} m · Γ_L = ${cabs(r.ss.GL).toFixed(3)} ∠${((carg(r.ss.GL) * 180) / PI).toFixed(1)}° · VSWR ${Number.isFinite(r.ss.vswr) ? r.ss.vswr.toFixed(3) : '∞'} · Z_in = ${fmtZ(r.ss.Zin)}`; },
  probe() { return []; },
  getState() { const s = { t: +this.t.toPrecision(4), spd: +this.speed.toPrecision(3) }; for (const [k, v] of Object.entries(this.p)) s[`tw_${k}`] = v; if (this.src) s.tw_src = this.src; return s; },
  csv() {
    if (!this.res) this.compute();
    const r = this.res, lines = ['d_m,Vmag_V,Imag_A,ReZin_ohm,ImZin_ohm'];
    for (let k = 0; k <= 400; k++) { const d = (r.L.l * k) / 400, z = zin(r.ZL, this.p.Z0, r.L.beta, d); lines.push(`${d},${cabs(r.ss.V(d))},${cabs(r.ss.I(d))},${z[0]},${z[1]}`); }
    return lines.join('\n');
  },

  fromTlTab() {
    const t = this.shell.tabs.find((x) => x.id === 'transmission-lines');
    if (!t || t.a === undefined) return { err: 'visit the Transmission lines tab first; its current cross-section is used' };
    const r = lineParams(t.params());
    return { Z0: r.Z0, vc: r.v / C0, label: `Transmission lines tab (${t.geom}, εr ${t.epsR})` };
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Line waves'));
    box.appendChild(ui.lead(shell, 'A transmission line with a load: the part of the wave the load does not absorb comes back, and the two together make a standing wave.'));
    const re = () => { this.stop(); this.res = null; this.buildControls(); shell.recompute(); shell.syncUrl(); shell.updateStageView(); };
    box.appendChild(ui.el('h2', '', 'Presets'));
    const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
    for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => { Object.assign(this.p, this.pDefaults, pr.p); this.t = 0; re(); if (pr.view) { shell.setStageView(pr.view); shell.syncUrl(); } }, 'btn btn-small'));
    box.appendChild(pw);
    const pf = (key, label, min, max) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; if (key === 'Z0' || key === 'vc') this.src = ''; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Line'));
    row(pf('Z0', 'Z₀ (Ω)', 1, 1e4), pf('vc', 'v / c', 0.01, 1), pf('f', 'Frequency f (Hz)', 1, 1e12));
    row(pf('len', 'Length (wavelengths)', 0.01, 10), ui.button('Z₀, v from the Transmission lines tab', () => { const v = this.fromTlTab(); if (v.err) { this.srcNote.textContent = v.err; return; } p.Z0 = +v.Z0.toPrecision(5); p.vc = +v.vc.toPrecision(4); this.src = v.label; re(); }, 'btn btn-small'));
    this.srcNote = ui.el('p', 'hint', this.src ? `Z₀ and v are from the ${this.src}.` : `λ = v/f = ${sci(this.line().lam, 4)} m, so the line is ${sci(this.line().l, 4)} m long; one-way delay ${sci(this.line().T, 3)} s.`);
    box.appendChild(this.srcNote);
    box.appendChild(ui.el('h2', '', 'Source and load'));
    row(pf('Vs', 'Source amplitude V_s (V)', 1e-3, 1e4), pf('Rs', 'Source resistance R_s (Ω)', 0, 1e5));
    row(ui.field('Load', ui.select(LOADS, p.load, (v) => { p.load = v; re(); })));
    if (['R', 'RL', 'RC'].includes(p.load)) row(pf('RL', 'R_L (Ω)', 0, 1e6)); if (p.load === 'RL') row(pf('Lload', 'L (nH)', 0, 1e6)); if (p.load === 'RC') row(pf('Cload', 'C (pF)', 1e-3, 1e9));
    box.appendChild(ui.el('p', 'hint', 'Γ_L = (Z_L − Z₀)/(Z_L + Z₀): 0 when matched, +1 open, −1 short; a reactive load gives a complex Γ with |Γ| = 1 only if it is purely reactive. The step transient uses the resistive part of the load (open and short included).'));
    box.appendChild(ui.el('h2', '', 'Step transient'));
    row(pf('tp', 'Pulse width (one-way delays; 0 = step)', 0, 20));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.style.flexWrap = 'wrap';
    for (const [id, lab] of [['standing', 'Standing wave'], ['impedance', 'Z_in'], ['bounce', 'Bounce diagram'], ['transient', 'V(z, t)']]) vr.appendChild(ui.button(lab, () => { shell.setStageView(id); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(vr);
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.res) return;
    const r = this.res, p = this.p, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('wavelength λ = v/f, line length', `${sci(r.L.lam, 4)} m, ${sci(r.L.l, 4)} m (${p.len} λ)`);
    row('Z_L at f', fmtZ(r.ZL)); row('Γ_L = (Z_L − Z₀)/(Z_L + Z₀)', `${cabs(r.ss.GL).toFixed(4)} ∠ ${((carg(r.ss.GL) * 180) / PI).toFixed(2)}°`);
    row('VSWR = (1 + |Γ|)/(1 − |Γ|)', Number.isFinite(r.ss.vswr) ? r.ss.vswr.toFixed(4) : '∞'); row('return loss −20 log|Γ|', Number.isFinite(r.rl) ? `${r.rl.toFixed(2)} dB` : '∞ (no reflection)');
    row('Z_in at the generator end', fmtZ(r.ss.Zin)); row('Z_in at λ/4 from the load (Z₀²/Z_L)', fmtZ(zin(r.ZL, p.Z0, r.L.beta, r.L.lam / 4)));
    row('first V_max, V_min from the load', `${r.ex.dmax.toPrecision(4)} m, ${r.ex.dmin.toPrecision(4)} m`);
    row('|V⁺|, |V_max|, |V_min|', `${sci(cabs(r.ss.Vp), 4)}, ${sci(cabs(r.ss.Vp) * (1 + cabs(r.ss.GL)), 4)}, ${sci(cabs(r.ss.Vp) * (1 - cabs(r.ss.GL)), 4)} V`);
    row('power: forward, reflected (|Γ|²), delivered', `${sci(r.ss.Pfwd, 4)}, ${sci(r.ss.Pref, 4)}, ${sci(r.ss.PL, 4)} W (input ${sci(r.ss.Pin, 4)} W)`);
    row('step: V₁⁺ = V_s Z₀/(R_s + Z₀)', `${sci(r.su.V1, 4)} V`); row('step: Γ_s, Γ_L (resistive)', `${r.su.Gs.toFixed(4)}, ${r.su.GL.toFixed(4)}`); row('step: one-way delay T = l/v', `${sci(r.su.T, 4)} s`); row('step: final V_s R_L/(R_s + R_L)', Number.isFinite(r.su.Vfinal) ? `${sci(r.su.Vfinal, 4)} V` : '—');
  },
};

function fmtZ(z) { if (!Number.isFinite(z[0])) return '∞'; const m = Math.hypot(z[0], z[1]) || 1, re = Math.abs(z[0]) < 1e-9 * m ? 0 : z[0], im = Math.abs(z[1]) < 1e-9 * m ? 0 : z[1]; return `${re.toPrecision(4)} ${im >= 0 ? '+' : '−'} j${Math.abs(im).toPrecision(4)} Ω`; }
