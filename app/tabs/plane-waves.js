// Plane waves tab: the uniform plane wave as a closed form. E and H along z at a time you
// can play, in one medium or incident on a second one (normal incidence: reflection,
// transmission, the standing wave in front, the decay behind); lossy media and the skin
// depth; polarization (the tip of E traced over a period). The Time-varying tab is the same
// physics computed by FDTD; this one is the textbook formulas.

import { PI } from '../../core/constants.js';
import { medium, normalIncidence, instantaneous, phasors, poynting, polarization, polarizationTrace, C0, ETA0 } from '../../core/planewave.js';
import { cabs, carg } from '../../core/tline.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const MEDIA = { air: { label: 'air / vacuum', epsR: 1, muR: 1, sigma: 0 }, glass: { label: 'glass (εr 2.25)', epsR: 2.25, muR: 1, sigma: 0 }, water: { label: 'fresh water (εr 81, σ 0.01)', epsR: 81, muR: 1, sigma: 0.01 }, sea: { label: 'seawater (εr 81, σ 4)', epsR: 81, muR: 1, sigma: 4 }, soil: { label: 'wet soil (εr 20, σ 0.02)', epsR: 20, muR: 1, sigma: 0.02 }, copper: { label: 'copper (σ 5.8e7)', epsR: 1, muR: 1, sigma: 5.8e7 }, custom: { label: 'custom', epsR: 4, muR: 1, sigma: 0 } };
const PRESETS = [
  { label: 'Free space, 1 GHz', p: { f: 1e9, m1: 'air', iface: false } },
  { label: 'Glass: slower, shorter, lower η', p: { f: 1e9, m1: 'glass', iface: false } },
  { label: 'Seawater at 1 MHz (lossy)', p: { f: 1e6, m1: 'sea', iface: false } },
  { label: 'Copper at 1 GHz (skin depth 2 µm)', p: { f: 1e9, m1: 'copper', iface: false } },
  { label: 'Air → glass (Γ = −0.2)', p: { f: 1e9, m1: 'air', m2: 'glass', iface: true } },
  { label: 'Air → seawater at 100 MHz', p: { f: 1e8, m1: 'air', m2: 'sea', iface: true } },
  { label: 'Air → copper (mirror)', p: { f: 1e9, m1: 'air', m2: 'copper', iface: true } },
  { label: 'Circular polarization', p: { Ex: 1, Ey: 1, phi: -90 }, view: 'polar' },
  { label: 'Elliptical, tilted', p: { Ex: 1, Ey: 0.5, phi: -60 }, view: 'polar' },
];

export default {
  id: 'plane-waves',
  title: 'Plane waves',
  phase: 7,
  available: true,
  hideField: true,
  summary: 'The uniform plane wave in closed form: E and H along z, lossy media and skin depth, normal incidence on a second medium, polarization.',
  extent: [0, 1, 0, 1],
  axes: ['x', 'y'],
  layers: [],

  pDefaults: { f: 1e9, E0: 1, m1: 'air', e1: 1, u1: 1, s1: 0, m2: 'glass', e2: 2.25, u2: 1, s2: 0, iface: false, Ex: 1, Ey: 0, phi: 0 },

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.p = { ...this.pDefaults };
    for (const k of Object.keys(this.p)) { const v = s[`pw_${k}`]; if (v === undefined) continue; this.p[k] = typeof this.pDefaults[k] === 'number' ? getNum(s, `pw_${k}`, this.p[k]) : typeof this.pDefaults[k] === 'boolean' ? v === '1' : v; }
    for (const [m, e, u, sg] of [['m1', 'e1', 'u1', 's1'], ['m2', 'e2', 'u2', 's2']]) if (!MEDIA[this.p[m]]) this.p[m] = 'custom'; else if (this.p[m] !== 'custom' && s[`pw_${e}`] === undefined) { this.p[e] = MEDIA[this.p[m]].epsR; this.p[u] = MEDIA[this.p[m]].muR; this.p[sg] = MEDIA[this.p[m]].sigma; }
    this.t = getNum(s, 't', 0); this.speed = getNum(s, 'spd', 0.1); this.playing = false;
    this.views = [
      plotView('wave', 'E and H along z', (ctx, w, h) => this.drawWave(ctx, w, h), { controls: (ctl, inst) => this.timeControls(ctl, inst) }),
      plotView('envelope', 'Amplitude along z', (ctx, w, h) => this.drawEnvelope(ctx, w, h)),
      plotView('polar', 'Polarization', (ctx, w, h) => this.drawPolar(ctx, w, h), { controls: (ctl, inst) => this.timeControls(ctl, inst) }),
    ];
    this.buildControls();
  },
  destroy() { this.stop(); },

  // ------------------------------------------------------------ model

  compute() {
    const p = this.p;
    const m1 = medium({ f: p.f, epsR: p.e1, muR: p.u1, sigma: p.s1 }), m2 = p.iface ? medium({ f: p.f, epsR: p.e2, muR: p.u2, sigma: p.s2 }) : null;
    const inc = m2 ? normalIncidence(m1, m2) : null;
    const pol = polarization(p.Ex, p.Ey, (p.phi * PI) / 180);
    this.res = { m1, m2, inc, pol, S: poynting(p.E0, m1) };
    this.renderResults();
  },
  render() { return null; },
  period() { return 1 / this.p.f; },
  /** z range shown: a few wavelengths of medium 1 (capped to a few skin depths when lossy), and the same again of medium 2 when there is an interface. */
  zRange() {
    const r = this.res, span1 = Math.min(2.5 * r.m1.lambda, r.m1.delta < Infinity ? Math.max(3 * r.m1.delta, 0.5 * r.m1.lambda) : Infinity);
    if (!r.m2) return [0, span1];
    const span2 = Math.min(1.5 * r.m2.lambda, r.m2.delta < Infinity ? Math.max(4 * r.m2.delta, 0.1 * span1) : Infinity);
    return [-span1, Math.max(span2, 0.15 * span1)];
  },

  // ------------------------------------------------------------ time

  timeControls(ctl, inst) {
    const T = this.period();
    const play = ui.button(this.playing ? 'Pause' : 'Play', () => { if (this.playing) this.stop(); else this.play(); play.textContent = this.playing ? 'Pause' : 'Play'; }, 'btn btn-small');
    const lab = ui.el('span', '', `t = ${(this.t / T).toFixed(2)} T`);
    const sl = ui.range(this.t % T, { min: 0, max: T, step: T / 400, ariaLabel: 'time (periods)', onInput: (v) => { this.t = v; this.tick(); } }); sl.style.width = '220px';
    ctl.append(play, ui.button('t = 0', () => { this.t = 0; this.tick(); }, 'btn btn-small'), ui.el('span', '', 'time:'), sl, lab, ui.el('span', '', 'speed:'));
    ctl.appendChild(ui.range(Math.log10(this.speed), { min: -2, max: 0.5, step: 0.05, ariaLabel: 'playback speed (periods per second, log)', onInput: (v) => { this.speed = Math.pow(10, v); } }));
    this.timeUi = { lab, sl };
  },
  tick() { const T = this.period(); if (this.timeUi) { this.timeUi.lab.textContent = `t = ${(this.t / T).toFixed(2)} T`; this.timeUi.sl.value = this.t % T; } this.shell.updateStageView(); },
  play() { this.playing = true; let last = performance.now(); const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; const T = this.period(); this.t = (this.t + dt * this.speed * T) % T; this.tick(); this.raf = requestAnimationFrame(step); }; this.raf = requestAnimationFrame(step); },
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

  drawWave(ctx, W, H) {
    if (!this.res) this.compute();
    const r = this.res, p = this.p, [z0, z1] = this.zRange(), n = 800;
    const zs = [], E = [], Hn = [], Ef = [], Er = [];
    for (let k = 0; k < n; k++) { const z = z0 + ((z1 - z0) * k) / (n - 1); zs.push(z); const i = instantaneous(p.E0, r.m1, r.m2, z, this.t); E.push(i.E); Hn.push(i.H * ETA0); Ef.push(i.Efwd); Er.push(i.Eref); }
    const m = Math.max(p.E0 * (r.inc ? 1 + cabs(r.inc.G) : 1), ...Hn.map(Math.abs)) * 1.15;
    const A = this.frame(ctx, W, H, { lo: -m, hi: m, a0: z0, a1: z1, xlabel: 'z (m), the wave travels toward +z', ylabel: 'E (V/m), η₀H (V/m)', top: 96, fmtX: (v) => sci(v, 3) });
    if (r.m2) { ctx.fillStyle = 'rgba(31,95,191,0.07)'; ctx.fillRect(A.px(0), A.T, A.px(z1) - A.px(0), H - A.T - A.B); A.vline(0, '#5a5955', 'interface', 0); ctx.fillStyle = '#5a5955'; ctx.fillText(`medium 1: ${MEDIA[p.m1]?.label ?? 'custom'}`, A.px(z0) + 6, H - A.B - 8); ctx.textAlign = 'right'; ctx.fillText(`medium 2: ${MEDIA[p.m2]?.label ?? 'custom'}`, A.px(z1) - 6, H - A.B - 8); ctx.textAlign = 'left'; }
    if (r.m2) { A.line(zs, Ef, '#f5a623', [5, 4], 1.5); A.line(zs, Er, '#7b61ff', [5, 4], 1.5); }
    A.line(zs, E, '#e5484d', [], 2.5); A.line(zs, Hn, '#1f5fbf', [], 2);
    if (r.m1.delta < Infinity && r.m1.delta < (z1 - z0)) A.vline(r.m1.delta, '#2a9d4b', `δ = ${sci(r.m1.delta, 3)} m`, 1);
    if (r.m2 && r.m2.delta < Infinity && r.m2.delta < z1) A.vline(r.m2.delta, '#2a9d4b', `δ₂ = ${sci(r.m2.delta, 3)} m`, 1);
    const y = A.legend([['E_x(z, t)', '#e5484d'], ['η₀ H_y(z, t) (scaled to the same units)', '#1f5fbf'], ...(r.m2 ? [['incident', '#f5a623', [5, 4]], ['reflected', '#7b61ff', [5, 4]]] : [])]);
    A.caption(r.m2 ? `Γ = (η₂ − η₁)/(η₂ + η₁) = ${fmtC(r.inc.G)}, τ = 1 + Γ = ${fmtC(r.inc.tau)}; the incident and reflected waves add to a partial standing wave in medium 1 (SWR ${Number.isFinite(r.inc.swr) ? r.inc.swr.toFixed(3) : '∞'}); E and H are continuous at the interface; in medium 2 the transmitted wave ${r.m2.alpha * r.m2.lambda > 0.5 ? 'decays within a skin depth' : 'travels on with the new wavelength and η'}.`
      : `E and H are in phase and perpendicular, with E/H = η = ${fmtC(r.m1.eta)} Ω${r.m1.alpha > 0 ? `; in a lossy medium H lags E by ${((carg(r.m1.eta) * 180) / PI).toFixed(1)}° and both decay as e^{−αz} with δ = 1/α = ${sci(r.m1.delta, 3)} m` : ''}. λ = ${sci(r.m1.lambda, 4)} m, v_p = ${sci(r.m1.vp, 4)} m/s = ${(r.m1.vp / C0).toFixed(4)} c.`, y);
  },

  drawEnvelope(ctx, W, H) {
    if (!this.res) this.compute();
    const r = this.res, p = this.p, [z0, z1] = this.zRange(), n = 800, zs = [], Em = [], Hm = [];
    for (let k = 0; k < n; k++) { const z = z0 + ((z1 - z0) * k) / (n - 1); zs.push(z); const ph = phasors(p.E0, r.m1, r.m2, z); Em.push(cabs(ph.E)); Hm.push(cabs(ph.H) * ETA0); }
    const m = Math.max(...Em, ...Hm) * 1.1;
    const A = this.frame(ctx, W, H, { lo: 0, hi: m, a0: z0, a1: z1, xlabel: 'z (m)', ylabel: 'amplitude (V/m)', top: 84 });
    if (r.m2) { ctx.fillStyle = 'rgba(31,95,191,0.07)'; ctx.fillRect(A.px(0), A.T, A.px(z1) - A.px(0), H - A.T - A.B); A.vline(0, '#5a5955', 'interface', 0); }
    A.line(zs, Em, '#e5484d'); A.line(zs, Hm, '#1f5fbf', [5, 4]);
    if (r.m1.delta < Infinity) { const dz = r.m1.delta; if (dz < z1 - z0) A.vline(r.m2 ? -dz : dz, '#2a9d4b', `one skin depth: amplitude × 1/e`, 1); }
    const y = A.legend([['|E(z)|', '#e5484d'], ['η₀|H(z)|', '#1f5fbf', [5, 4]]]);
    A.caption(r.m2 ? `In front of the interface |E| swings between E₀(1 + |Γ|) = ${sci(p.E0 * (1 + cabs(r.inc.G)), 4)} and E₀(1 − |Γ|) = ${sci(p.E0 * (1 - cabs(r.inc.G)), 4)} V/m every λ₁/2 = ${sci(r.m1.lambda / 2, 3)} m, and |H| is maximal where |E| is minimal. Behind it the amplitude is |τ|E₀ = ${sci(p.E0 * cabs(r.inc.tau), 4)} V/m${r.m2.alpha > 0 ? ` falling as e^{−z/δ₂}, δ₂ = ${sci(r.m2.delta, 3)} m` : ''}.`
      : `${r.m1.alpha > 0 ? `The amplitude falls as e^{−αz}: α = ${sci(r.m1.alpha, 4)} Np/m, δ = ${sci(r.m1.delta, 3)} m; after one skin depth 37 % of the field and 13.5 % of the power remain.` : 'A lossless medium: the amplitude is the same everywhere; only the phase advances.'} Loss tangent σ/ωε = ${sci(r.m1.lossTan, 3)}${r.m1.lossTan > 100 ? ' (good conductor: α ≈ β ≈ √(πfμσ))' : r.m1.lossTan < 0.01 ? ' (good dielectric)' : ''}.`, y);
  },

  drawPolar(ctx, W, H) {
    if (!this.res) this.compute();
    const p = this.p, pol = this.res.pol, phi = (p.phi * PI) / 180;
    const cx = W * 0.32, cy = H / 2, R = Math.min(W * 0.22, H * 0.36), amp = Math.max(Math.abs(p.Ex), Math.abs(p.Ey), 1e-12);
    const X = (x) => cx + (x / amp) * R, Y = (y) => cy - (y / amp) * R;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(X(-1.1 * amp), cy); ctx.lineTo(X(1.1 * amp), cy); ctx.moveTo(cx, Y(-1.1 * amp)); ctx.lineTo(cx, Y(1.1 * amp)); ctx.stroke();
    ctx.fillText('x', X(1.1 * amp) + 4, cy + 4); ctx.fillText('y', cx + 4, Y(1.1 * amp) - 4); ctx.fillText('⊙ z toward you (the wave comes at you)', cx - R, Y(-1.1 * amp) + 24);
    const pts = polarizationTrace(p.Ex, p.Ey, phi);
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
    // E now
    const wt = 2 * PI * p.f * this.t, ex = p.Ex * Math.cos(wt), ey = p.Ey * Math.cos(wt + phi);
    ctx.strokeStyle = '#e5484d'; ctx.fillStyle = '#e5484d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(ex), Y(ey)); ctx.stroke(); ctx.beginPath(); ctx.arc(X(ex), Y(ey), 5, 0, 2 * PI); ctx.fill();
    // components
    ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(ex), cy); ctx.moveTo(cx, cy); ctx.lineTo(cx, Y(ey)); ctx.stroke(); ctx.setLineDash([]);
    // right side: the two components against time
    const L2 = W * 0.6, R2 = W - 20, T2 = 60, B2 = H - 60, n = 300;
    const px = (k) => L2 + (k / (n - 1)) * (R2 - L2), py = (v) => T2 + (1 - (v / amp + 1) / 2) * (B2 - T2);
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L2, T2); ctx.lineTo(L2, B2); ctx.lineTo(R2, B2); ctx.stroke(); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L2, py(0)); ctx.lineTo(R2, py(0)); ctx.stroke();
    const draw = (fn, color) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < n; k++) { const th = (2 * PI * k) / (n - 1); const y = py(fn(th)); if (k) ctx.lineTo(px(k), y); else ctx.moveTo(px(k), y); } ctx.stroke(); };
    draw((th) => p.Ex * Math.cos(th), '#2a9d4b'); draw((th) => p.Ey * Math.cos(th + phi), '#7b61ff');
    const kNow = ((wt % (2 * PI)) / (2 * PI)) * (n - 1); ctx.strokeStyle = '#e5484d'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px(kNow), T2); ctx.lineTo(px(kNow), B2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#2a9d4b'; ctx.fillText('E_x(t) = E_x0 cos ωt', L2, T2 - 24); ctx.fillStyle = '#7b61ff'; ctx.fillText(`E_y(t) = E_y0 cos(ωt + φ), φ = ${p.phi}°`, L2, T2 - 8); ctx.fillStyle = '#5a5955'; ctx.fillText('one period →', L2, B2 + 16);
    ctx.fillText(`${pol.type}${pol.sense ? `, ${pol.sense}` : ''}${pol.type === 'elliptical' ? `; axial ratio ${pol.axialRatio.toFixed(3)}, major axis at ${((pol.tilt * 180) / PI).toFixed(1)}°` : pol.type === 'linear' ? ` at ${((pol.tilt * 180) / PI).toFixed(1)}° from x` : ''}`, 12, 20);
    ctx.fillText('Blue: the path of the tip of E at z = 0 over one period; red: E now. φ < 0 means E_y lags E_x, so E turns from x toward y (right-handed, IEEE).', 12, 36);
  },

  // ------------------------------------------------------------ shell hooks

  statusText() { const r = this.res; if (!r) return ''; return `${MEDIA[this.p.m1]?.label ?? 'custom'} at ${sci(this.p.f, 3)} Hz: λ = ${sci(r.m1.lambda, 4)} m, v = ${(r.m1.vp / C0).toFixed(4)} c, η = ${fmtC(r.m1.eta)} Ω${r.m1.alpha > 0 ? `, δ = ${sci(r.m1.delta, 3)} m` : ''}${r.m2 ? ` · Γ = ${fmtC(r.inc.G)}` : ''} · ${r.pol.type} polarization`; },
  probe() { return []; },
  getState() { const s = { t: +this.t.toPrecision(4), spd: +this.speed.toPrecision(3) }; for (const [k, v] of Object.entries(this.p)) s[`pw_${k}`] = typeof v === 'boolean' ? (v ? 1 : 0) : v; return s; },
  csv() {
    if (!this.res) this.compute();
    const r = this.res, p = this.p, [z0, z1] = this.zRange(), lines = ['z_m,E_amp_Vpm,H_amp_Apm,E_inst_Vpm,H_inst_Apm'];
    for (let k = 0; k <= 400; k++) { const z = z0 + ((z1 - z0) * k) / 400, ph = phasors(p.E0, r.m1, r.m2, z), i = instantaneous(p.E0, r.m1, r.m2, z, this.t); lines.push(`${z},${cabs(ph.E)},${cabs(ph.H)},${i.E},${i.H}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Plane waves'));
    box.appendChild(ui.lead(shell, 'The uniform plane wave: E and H perpendicular, in phase in a lossless medium, travelling at v = 1/√(με) with E/H = η.'));
    const re = () => { this.stop(); this.res = null; this.buildControls(); shell.recompute(); shell.syncUrl(); shell.updateStageView(); };
    box.appendChild(ui.el('h2', '', 'Presets'));
    const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
    for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => { Object.assign(p, pr.p); for (const [m, e, u, sg] of [['m1', 'e1', 'u1', 's1'], ['m2', 'e2', 'u2', 's2']]) if (pr.p[m] && pr.p[m] !== 'custom') { p[e] = MEDIA[p[m]].epsR; p[u] = MEDIA[p[m]].muR; p[sg] = MEDIA[p[m]].sigma; } this.t = 0; re(); if (pr.view) { shell.setStageView(pr.view); shell.syncUrl(); } }, 'btn btn-small'));
    box.appendChild(pw);
    const pf = (key, label, min, max, after) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after?.(); re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Wave'));
    row(pf('f', 'Frequency f (Hz)', 1, 1e15), pf('E0', 'Amplitude E₀ (V/m)', 1e-6, 1e9));
    const mediumUi = (title, m, e, u, sg) => {
      box.appendChild(ui.el('h2', '', title));
      row(ui.field('Material', ui.select(Object.entries(MEDIA).map(([k, v]) => [k, v.label]), p[m], (v) => { p[m] = v; if (v !== 'custom') { p[e] = MEDIA[v].epsR; p[u] = MEDIA[v].muR; p[sg] = MEDIA[v].sigma; } re(); })));
      row(pf(e, 'εr', 1, 1e4, () => { p[m] = 'custom'; }), pf(u, 'μr', 1, 1e4, () => { p[m] = 'custom'; }), pf(sg, 'σ (S/m)', 0, 1e8, () => { p[m] = 'custom'; }));
    };
    mediumUi('Medium 1 (the wave starts here)', 'm1', 'e1', 'u1', 's1');
    row(ui.field('Second medium', ui.select([['0', 'none: one medium throughout'], ['1', 'interface at z = 0, normal incidence']], p.iface ? '1' : '0', (v) => { p.iface = v === '1'; re(); })));
    if (p.iface) mediumUi('Medium 2 (z > 0)', 'm2', 'e2', 'u2', 's2');
    box.appendChild(ui.el('h2', '', 'Polarization'));
    row(pf('Ex', 'E_x amplitude', 0, 1e9), pf('Ey', 'E_y amplitude', 0, 1e9), pf('phi', 'phase of E_y relative to E_x, φ (°)', -180, 180));
    box.appendChild(ui.el('p', 'hint', 'φ = 0 or 180°: linear. Equal amplitudes and φ = ∓90°: circular (right/left-handed). Anything else: elliptical. The E/H plots use the x component; the Polarization view shows both.'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.style.flexWrap = 'wrap';
    for (const [id, lab] of [['wave', 'E and H along z'], ['envelope', 'Amplitude along z'], ['polar', 'Polarization']]) vr.appendChild(ui.button(lab, () => { shell.setStageView(id); shell.syncUrl(); }, 'btn btn-small'));
    box.appendChild(vr);
    box.appendChild(ui.el('p', 'hint', 'The Time-varying tab computes the same reflections by FDTD; this tab is the closed form, so the two can be compared.'));
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.res) return;
    const r = this.res, p = this.p, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    const med = (m, name) => {
      row(`${name}: β, λ = 2π/β`, `${sci(m.beta, 4)} rad/m, ${sci(m.lambda, 4)} m`); row(`${name}: v_p = ω/β`, `${sci(m.vp, 4)} m/s = ${(m.vp / C0).toPrecision(4)} c`); row(`${name}: η = √(μ/ε_c)`, `${fmtC(m.eta)} Ω (|η| ${cabs(m.eta).toPrecision(4)}, ∠${((carg(m.eta) * 180) / PI).toFixed(2)}°)`);
      row(`${name}: loss tangent σ/ωε`, sci(m.lossTan, 3)); if (m.alpha > 0) { row(`${name}: α, skin depth δ = 1/α`, `${sci(m.alpha, 4)} Np/m, ${sci(m.delta, 4)} m`); row(`${name}: good-conductor √(πfμσ)`, `${sci(m.goodConductorAlpha, 4)} Np/m (${(100 * m.goodConductorAlpha / m.alpha).toFixed(1)} % of α)`); }
    };
    med(r.m1, 'medium 1');
    row('time-average power density ½E₀² Re(1/η)', `${sci(r.S, 4)} W/m²`);
    if (r.m2) { med(r.m2, 'medium 2'); row('Γ = (η₂ − η₁)/(η₂ + η₁)', `${fmtC(r.inc.G)} (|Γ| ${cabs(r.inc.G).toFixed(4)})`); row('τ = 1 + Γ', fmtC(r.inc.tau)); row('power reflected |Γ|², transmitted', `${(100 * r.inc.R).toFixed(2)} %, ${(100 * r.inc.T).toFixed(2)} % (sum ${(100 * (r.inc.R + r.inc.T)).toFixed(2)} %)`); row('standing-wave ratio in medium 1', Number.isFinite(r.inc.swr) ? r.inc.swr.toFixed(4) : '∞'); row('|E| max, min in front', `${sci(p.E0 * (1 + cabs(r.inc.G)), 4)}, ${sci(p.E0 * (1 - cabs(r.inc.G)), 4)} V/m`); }
    row('polarization', `${r.pol.type}${r.pol.sense ? `; ${r.pol.sense}` : ''}`); if (r.pol.type === 'elliptical') row('axial ratio, tilt of the major axis', `${r.pol.axialRatio.toFixed(3)}, ${((r.pol.tilt * 180) / PI).toFixed(1)}°`);
  },
};

function fmtC(z) { const m = Math.hypot(z[0], z[1]) || 1, re = Math.abs(z[0]) < 1e-9 * m ? 0 : z[0], im = Math.abs(z[1]) < 1e-9 * m ? 0 : z[1]; return im === 0 ? re.toPrecision(4) : `${re.toPrecision(4)} ${im >= 0 ? '+' : '−'} j${Math.abs(im).toPrecision(4)}`; }
