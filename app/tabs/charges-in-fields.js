// Charges in fields tab: the Lorentz force. A particle tracer in piecewise-uniform E and B
// (cyclotron circles, the E×B cycloid, the velocity selector and mass spectrometer, the
// parabola in E alone) integrated with the Boris pusher and compared with the closed forms;
// the Hall effect in a strip; the force between parallel wires (the ampere); the torque on
// a current loop (the motor). Field-less tab: scenes and plots, closed form plus the tracer.

import { MU0, PI } from '../../core/constants.js';
import { PARTICLES, E_CHARGE, trace, cyclotron, exbDrift, selectorSpeed, spectrometerRadius, hall, wireForcePerLength, loopTorque } from '../../core/lorentz.js';
import { getNum, getList } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const MODES = [['particle', 'Charged particles in E and B'], ['hall', 'Hall effect in a strip'], ['wires', 'Force between parallel wires'], ['loop', 'Torque on a current loop']];
const SPECIES = [['proton', 'proton'], ['electron', 'electron'], ['deuteron', 'deuteron'], ['alpha', 'alpha particle'], ['custom', 'custom q, m']];
const MATERIALS = { copper: { n: 8.5e28, sign: -1, label: 'copper (n = 8.5e28 /m³, electrons)' }, aluminium: { n: 1.8e29, sign: -1, label: 'aluminium (1.8e29, electrons)' }, nsi: { n: 1e21, sign: -1, label: 'n-type silicon (1e21, electrons)' }, psi: { n: 1e21, sign: 1, label: 'p-type silicon (1e21, holes)' }, custom: { n: 1e22, sign: -1, label: 'custom' } };
const PRESETS = [
  { label: 'Proton circle in B', set: { parts: [{ sp: 'proton', v: 1e5, ang: 0, y0: 0 }], split: false, E1x: 0, E1y: 0, B1: 0.5, dur: 0.4 } },
  { label: 'Electron circle (opposite sense)', set: { parts: [{ sp: 'electron', v: 1e6, ang: 0, y0: 0 }], split: false, E1x: 0, E1y: 0, B1: 0.002, dur: 0.06 } },
  { label: 'E×B cycloid from rest', set: { parts: [{ sp: 'proton', v: 0, ang: 0, y0: 0 }], split: false, E1x: 1e4, E1y: 0, B1: 0.5, dur: 0.5 } },
  { label: 'Parabola in E alone', set: { parts: [{ sp: 'electron', v: 2e6, ang: 0, y0: 0 }], split: false, E1x: 0, E1y: -2e3, B1: 0, dur: 0.02 } },
  { label: 'Velocity selector: three speeds', set: { parts: [{ sp: 'proton', v: 0.8e5, ang: 0, y0: 0 }, { sp: 'proton', v: 1e5, ang: 0, y0: 0 }, { sp: 'proton', v: 1.2e5, ang: 0, y0: 0 }], split: true, E1x: 0, E1y: 5e4, B1: 0.5, E2x: 0, E2y: 0, B2: 0.5, x0: -6, dur: 0.25 } },
  { label: 'Mass spectrometer: H⁺, D⁺, He²⁺ at the selected speed', set: { parts: [{ sp: 'proton', v: 1e5, ang: 0, y0: 0 }, { sp: 'deuteron', v: 1e5, ang: 0, y0: 0 }, { sp: 'alpha', v: 1e5, ang: 0, y0: 0 }], split: true, E1x: 0, E1y: 5e4, B1: 0.5, E2x: 0, E2y: 0, B2: 0.5, x0: -6, dur: 0.35 } },
];

export default {
  id: 'charges-in-fields',
  title: 'Charges in fields',
  phase: 7,
  available: true,
  hideField: true,
  summary: 'The Lorentz force: a particle tracer (cyclotron motion, E×B drift, velocity selector, mass spectrometer, parabola), the Hall effect, the force between wires, torque on a loop.',
  extent: [0, 1, 0, 1],
  axes: ['x', 'y'],
  layers: [],

  defaults: {
    particle: { parts: [{ sp: 'proton', v: 1e5, ang: 0, y0: 0, qc: 1, mc: 1 }], split: false, E1x: 0, E1y: 0, B1: 0.5, E2x: 0, E2y: 0, B2: 0.5, x0: 0, dur: 0.4, vz: 0, slit: 0.5 }, // speeds m/s, angles °, y0 mm, fields V/m and T, x0 mm (start), dur µs
    hall: { mat: 'copper', n: 8.5e28, sign: -1, I: 1, B: 1, w: 10, t: 1 },   // A, T, mm, mm
    wires: { I1: 10, I2: 10, d: 20 },                                          // A, A, mm
    loop: { N: 10, I: 2, a: 40, b: 25, B: 0.5, theta: 60 },                     // —, A, mm, mm, T, °
  },

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.mode = MODES.some(([m]) => m === s.cm) ? s.cm : 'particle';
    this.p = JSON.parse(JSON.stringify(this.defaults));
    for (const [m, d] of Object.entries(this.defaults)) for (const k of Object.keys(d)) { if (k === 'parts') continue; const v = s[`${m}_${k}`]; if (v === undefined) continue; this.p[m][k] = typeof d[k] === 'number' ? getNum(s, `${m}_${k}`, d[k]) : typeof d[k] === 'boolean' ? v === '1' : v; }
    const pl = getList(s, 'parts', null);
    if (pl && pl.length) { const parts = []; for (let k = 0; k + 5 < pl.length + 1 && k < 15; k += 5) parts.push({ sp: pl[k], v: +pl[k + 1], ang: +pl[k + 2], y0: +pl[k + 3], qc: +(pl[k + 4]?.split?.('/')[0] ?? 1), mc: +(pl[k + 4]?.split?.('/')[1] ?? 1) }); if (parts.length) this.p.particle.parts = parts; }
    this.t = getNum(s, 't', 0); this.playing = false; this.speed = getNum(s, 'spd', 0.3);
    this.views = [
      plotView('scene', 'Scene', (ctx, w, h) => this.drawScene(ctx, w, h), { controls: (ctl, inst) => this.timeControls(ctl, inst) }),
      plotView('plots', 'Plots', (ctx, w, h) => this.drawPlots(ctx, w, h)),
    ];
    this.buildControls();
  },
  destroy() { this.stop(); },

  // ------------------------------------------------------------ model

  species(part) { if (part.sp === 'custom') return { q: part.qc * E_CHARGE, m: part.mc * PARTICLES.proton.m, label: `custom (${part.qc} e, ${part.mc} mₚ)` }; return PARTICLES[part.sp] ?? PARTICLES.proton; },
  fieldAt(x) {
    const p = this.p.particle;
    if (!p.split || x[0] < 0) return { E: [p.E1x, p.E1y, 0], B: [0, 0, p.B1] };
    return { E: [p.E2x, p.E2y, 0], B: [0, 0, p.B2] };
  },

  compute() {
    if (this.mode === 'particle') this.computeTraces();
    else if (this.mode === 'hall') { const p = this.p.hall; this.res = hall({ I: p.I, B: p.B, n: p.n, qc: p.sign * E_CHARGE, w: p.w * 1e-3, t: p.t * 1e-3 }); }
    else if (this.mode === 'wires') { const p = this.p.wires; this.res = { fL: wireForcePerLength(p.I1, p.I2, p.d * 1e-3), B1at2: (MU0 * p.I1) / (2 * PI * p.d * 1e-3), B2at1: (MU0 * p.I2) / (2 * PI * p.d * 1e-3) }; }
    else { const p = this.p.loop; this.res = loopTorque(p.N, p.I, p.a * p.b * 1e-6, p.B, (p.theta * PI) / 180); this.res.Fside = p.N * p.I * p.b * 1e-3 * p.B; }
    this.renderResults();
  },

  computeTraces() {
    const p = this.p.particle, dur = p.dur * 1e-6;
    this.traces = p.parts.map((part) => {
      const { q, m } = this.species(part);
      const ang = (part.ang * PI) / 180, v0 = [part.v * Math.cos(ang), part.v * Math.sin(ang), p.vz];
      const Bmax = Math.max(Math.abs(p.B1), p.split ? Math.abs(p.B2) : 0);
      const wc = (Math.abs(q) * Bmax) / m;
      const dt = wc > 0 ? Math.min((2 * PI) / wc / 400, dur / 2000) : dur / 4000;
      const steps = Math.min(200000, Math.ceil(dur / dt));
      // two regions: a plate at x = 0 with a slit of half-width `slit` around the entry height; a
      // particle that reaches the plate off the slit stops there, and one that comes back to the
      // plate from region 2 has hit the detector
      let entered = false;
      const slit = p.slit * 1e-3, yEntry = part.y0 * 1e-3;
      const stop = p.split ? (x) => { if (x[0] > 0) { entered = true; return false; } if (entered) return true; return x[0] >= -1e-9 && Math.abs(x[1] - yEntry) > slit; } : null;
      const tr = trace({ q, m, x0: [p.x0 * 1e-3, part.y0 * 1e-3, 0], v0 }, (x) => this.fieldAt(x), { dt, steps, every: Math.max(1, Math.floor(steps / 3000)), stop });
      tr.detector = entered && tr.stopped;
      const B = this.fieldAt(tr.x[0]).B, cyc = cyclotron(q, m, Math.hypot(v0[0], v0[1]), B[2]);
      return { part, q, m, tr, cyc, drift: exbDrift(this.fieldAt(tr.x[0]).E, B), sel: p.split ? selectorSpeed([p.E1x, p.E1y, 0], [0, 0, p.B1]) : NaN, r2: p.split && p.B2 ? spectrometerRadius(m, part.v, q, p.B2) : NaN };
    });
    // bounding box of everything
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const T of this.traces) for (const x of T.tr.x) { x0 = Math.min(x0, x[0]); x1 = Math.max(x1, x[0]); y0 = Math.min(y0, x[1]); y1 = Math.max(y1, x[1]); }
    const padx = 0.1 * (x1 - x0 || 1e-3), pady = 0.1 * (y1 - y0 || 1e-3);
    this.bbox = [x0 - padx, x1 + padx, y0 - pady, y1 + pady];
    if (p.split) { this.bbox[0] = Math.min(this.bbox[0], -padx); this.bbox[1] = Math.max(this.bbox[1], padx); }
  },

  render() { return null; },

  // ------------------------------------------------------------ time

  duration() { return this.mode === 'particle' ? this.p.particle.dur * 1e-6 : this.mode === 'hall' ? 1 : 1; },
  timeControls(ctl, inst) {
    if (this.mode === 'wires' || this.mode === 'loop') { ctl.appendChild(ui.el('span', 'hint', 'Static picture; change the numbers on the left.')); return; }
    const T = this.duration();
    const play = ui.button(this.playing ? 'Pause' : 'Play', () => { if (this.playing) this.stop(); else this.play(); play.textContent = this.playing ? 'Pause' : 'Play'; }, 'btn btn-small');
    const lab = ui.el('span', '', `t = ${sci(this.t, 3)} s`);
    const sl = ui.range(this.t, { min: 0, max: T, step: T / 1000, ariaLabel: 'time', onInput: (v) => { this.t = v; this.tick(); } }); sl.style.width = '220px';
    ctl.append(play, ui.button('t = 0', () => { this.t = 0; this.tick(); }, 'btn btn-small'), ui.el('span', '', 'time:'), sl, lab, ui.el('span', '', 'speed:'));
    ctl.appendChild(ui.range(Math.log10(this.speed), { min: -2, max: 1, step: 0.05, ariaLabel: 'playback speed (log)', onInput: (v) => { this.speed = Math.pow(10, v); } }));
    this.timeUi = { lab, sl, inst };
  },
  tick() { if (this.timeUi) { this.timeUi.lab.textContent = `t = ${sci(this.t, 3)} s`; this.timeUi.sl.value = this.t; } this.shell.updateStageView(); this.shell.refreshStatus(); },
  play() { this.playing = true; let last = performance.now(); const T = this.duration(); const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; this.t += dt * this.speed * T / 5; if (this.t > T) this.t -= T; this.tick(); this.raf = requestAnimationFrame(step); }; this.raf = requestAnimationFrame(step); },
  stop() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; },

  // ------------------------------------------------------------ scenes

  drawScene(ctx, W, H) {
    if (this.mode === 'particle' && !this.traces) this.compute();
    if (this.mode !== 'particle' && !this.res) this.compute();
    ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (this.mode === 'particle') return this.drawParticles(ctx, W, H);
    if (this.mode === 'hall') return this.drawHall(ctx, W, H);
    if (this.mode === 'wires') return this.drawWires(ctx, W, H);
    return this.drawLoop(ctx, W, H);
  },

  fieldMarks(ctx, X, Y, x0, x1, y0, y1, E, Bz) {
    ctx.fillStyle = 'rgba(31,95,191,0.06)'; ctx.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
    const n = 9, dx = (x1 - x0) / n, ny = Math.max(2, Math.round(n * (y1 - y0) / (x1 - x0))), dy = (y1 - y0) / ny;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '13px system-ui';
    for (let i = 0; i < n; i++) for (let j = 0; j < ny; j++) {
      const px = X(x0 + (i + 0.5) * dx), py = Y(y0 + (j + 0.5) * dy);
      if (Math.abs(Bz) > 0) { ctx.fillStyle = 'rgba(31,95,191,0.55)'; ctx.fillText(Bz < 0 ? '×' : '•', px, py); }
      const em = Math.hypot(E[0], E[1]); if (em > 0) { const ux = E[0] / em, uy = E[1] / em, L = 10; ctx.strokeStyle = 'rgba(229,72,77,0.6)'; ctx.fillStyle = 'rgba(229,72,77,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px - ux * L, py + uy * L); ctx.lineTo(px + ux * L, py - uy * L); ctx.stroke(); ctx.beginPath(); ctx.moveTo(px + ux * (L + 5), py - uy * (L + 5)); ctx.lineTo(px + ux * L - uy * 4, py - uy * L - ux * 4); ctx.lineTo(px + ux * L + uy * 4, py - uy * L + ux * 4); ctx.closePath(); ctx.fill(); }
    }
    ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  },

  drawParticles(ctx, W, H) {
    const p = this.p.particle, [bx0, bx1, by0, by1] = this.bbox;
    const sc = Math.min((W - 40) / (bx1 - bx0), (H - 100) / (by1 - by0));
    const ox = 20 + ((W - 40) - sc * (bx1 - bx0)) / 2, oy = 50 + (H - 100) / 2 + sc * (by1 + by0) / 2;
    const X = (x) => ox + sc * (x - bx0), Y = (y) => oy - sc * y;
    if (p.split) { this.fieldMarks(ctx, X, Y, bx0, 0, by0, by1, [p.E1x, p.E1y], p.B1); this.fieldMarks(ctx, X, Y, 0, bx1, by0, by1, [p.E2x, p.E2y], p.B2); ctx.strokeStyle = '#999'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(0), Y(by0)); ctx.lineTo(X(0), Y(by1)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5a5955'; ctx.fillText('region 1 (x < 0)', X(bx0) + 6, Y(by1) + 14); ctx.fillText('region 2 (x > 0)', X(0) + 6, Y(by1) + 14);
      // the plate with its slit
      const ys = p.parts[0].y0 * 1e-3, sl = p.slit * 1e-3; ctx.strokeStyle = '#5a5955'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X(0), Y(by0)); ctx.lineTo(X(0), Y(ys - sl)); ctx.moveTo(X(0), Y(ys + sl)); ctx.lineTo(X(0), Y(by1)); ctx.stroke(); ctx.fillText('plate + slit / detector', X(0) + 6, Y(by0) - 6); }
    else this.fieldMarks(ctx, X, Y, bx0, bx1, by0, by1, [p.E1x, p.E1y], p.B1);
    const colors = ['#e5484d', '#1f5fbf', '#2a9d4b'];
    const tNow = this.t;
    this.traces.forEach((T, k) => {
      const col = colors[k % 3]; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      T.tr.x.forEach((x, i) => (i ? ctx.lineTo(X(x[0]), Y(x[1])) : ctx.moveTo(X(x[0]), Y(x[1])))); ctx.stroke();
      // dot at t
      let i = T.tr.t.findIndex((t) => t >= tNow); if (i < 0) i = T.tr.t.length - 1;
      const x = T.tr.x[i], v = T.tr.v[i];
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(x[0]), Y(x[1]), 6, 0, 2 * PI); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      // velocity and force arrows at the dot
      const { E, B } = this.fieldAt(x), F = [T.q * (E[0] + v[1] * B[2]), T.q * (E[1] - v[0] * B[2])];
      const arrow = (fx, fy, color, label) => { const m = Math.hypot(fx, fy); if (!m) return; const L = 34, ux = fx / m, uy = fy / m; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x[0]), Y(x[1])); ctx.lineTo(X(x[0]) + ux * L, Y(x[1]) - uy * L); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(x[0]) + ux * (L + 7), Y(x[1]) - uy * (L + 7)); ctx.lineTo(X(x[0]) + ux * L - uy * 4, Y(x[1]) - uy * L - ux * 4); ctx.lineTo(X(x[0]) + ux * L + uy * 4, Y(x[1]) - uy * L + ux * 4); ctx.closePath(); ctx.fill(); ctx.fillText(label, X(x[0]) + ux * (L + 10), Y(x[1]) - uy * (L + 10)); };
      arrow(v[0], v[1], '#5a5955', 'v'); arrow(F[0], F[1], '#f5a623', 'F');
      if (T.tr.stopped) { const xe = T.tr.x[T.tr.x.length - 1]; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(xe[0]), Y(xe[1]), 5, 0, 2 * PI); ctx.fill(); ctx.fillText(T.tr.detector ? 'detector' : 'hits the plate', X(xe[0]) + 8, Y(xe[1]) - 8); }
      ctx.fillStyle = col; ctx.fillText(`${k + 1}: ${this.species(T.part).label}, v = ${sci(T.part.v, 3)} m/s${T.tr.stopped ? ` (stopped at t = ${sci(T.tr.t[T.tr.t.length - 1], 3)} s)` : ''}`, 12, H - 44 + 14 * k);
    });
    ctx.fillStyle = '#5a5955';
    wrapText(ctx, `Blue • / ×: B out of / into the page. Red arrows: E. Each particle: its path, its position at t (dot), velocity (grey) and force qE + qv×B (orange).`, 12, 20, W - 24);
    ctx.fillText(`box ${((bx1 - bx0) * 1e3).toFixed(1)} × ${((by1 - by0) * 1e3).toFixed(1)} mm`, W - 160, H - 8);
  },

  drawHall(ctx, W, H) {
    const p = this.p.hall, r = this.res;
    const L = W * 0.6, Hs = H * 0.28, x0 = W * 0.12, y0 = H * 0.5 - Hs / 2;
    // B marks around (B along +z out of the page for B > 0)
    ctx.fillStyle = 'rgba(31,95,191,0.5)'; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) ctx.fillText(p.B >= 0 ? '•' : '×', x0 - 40 + (i + 0.5) * (L + 80) / 12, y0 - 50 + (j + 0.5) * (Hs + 100) / 6);
    ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // strip
    ctx.fillStyle = '#e8dcc8'; ctx.fillRect(x0, y0, L, Hs); ctx.strokeStyle = '#8a7a60'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, L, Hs);
    // current arrow
    ctx.strokeStyle = '#5a5955'; ctx.fillStyle = '#5a5955'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 - 60, y0 + Hs / 2); ctx.lineTo(x0 - 10, y0 + Hs / 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x0 - 4, y0 + Hs / 2); ctx.lineTo(x0 - 14, y0 + Hs / 2 - 6); ctx.lineTo(x0 - 14, y0 + Hs / 2 + 6); ctx.closePath(); ctx.fill(); ctx.fillText(`I = ${p.I} A`, x0 - 60, y0 + Hs / 2 - 10);
    // carriers: dots drifting; the magnetic force pushes them to one edge; in steady state E_H balances it
    const sign = p.sign, vdir = sign > 0 ? 1 : -1; // holes move with I, electrons against
    // F = q v × B: v along ±x, B along z: F_y = -q v_x B; for electrons (q<0, v_x<0): F_y = -(−)(−)B = −B... compute numerically
    const Fy = -(sign * E_CHARGE) * (vdir) * p.B; // sign of the deflection in y (screen up = +y)
    const edgeTop = Fy > 0;
    const n = 14, phase = (this.t % 1);
    for (let k = 0; k < n; k++) for (let row = 0; row < 3; row++) {
      let fx = ((k + phase * vdir + n) % n) / n; const px = x0 + fx * L, py = y0 + Hs * (0.25 + 0.25 * row);
      ctx.fillStyle = sign > 0 ? '#e5484d' : '#1f5fbf'; ctx.beginPath(); ctx.arc(px, py, 4, 0, 2 * PI); ctx.fill();
    }
    // accumulated edge charge
    ctx.font = '14px system-ui'; ctx.textAlign = 'center';
    for (let k = 0; k < 10; k++) { const px = x0 + (k + 0.5) * L / 10; ctx.fillStyle = sign > 0 ? '#e5484d' : '#1f5fbf'; ctx.fillText(sign > 0 ? '+' : '−', px, edgeTop ? y0 + 10 : y0 + Hs - 4); ctx.fillStyle = sign > 0 ? '#1f5fbf' : '#e5484d'; ctx.fillText(sign > 0 ? '−' : '+', px, edgeTop ? y0 + Hs - 4 : y0 + 10); }
    ctx.font = '12px system-ui'; ctx.textAlign = 'left';
    // force arrows on a carrier
    const cx = x0 + L * 0.5, cy = y0 + Hs / 2; const dir = edgeTop ? -1 : 1;
    ctx.strokeStyle = '#f5a623'; ctx.fillStyle = '#f5a623'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + dir * 40); ctx.stroke(); ctx.fillText('q v × B', cx + 6, cy + dir * 40);
    ctx.strokeStyle = '#2a9d4b'; ctx.fillStyle = '#2a9d4b'; ctx.beginPath(); ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 30, cy - dir * 40); ctx.stroke(); ctx.fillText('q E_H (balances it)', cx + 36, cy - dir * 40);
    // voltmeter
    ctx.strokeStyle = '#5a5955'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 + L + 20, y0); ctx.lineTo(x0 + L + 50, y0); ctx.lineTo(x0 + L + 50, y0 + Hs / 2 - 14); ctx.moveTo(x0 + L + 50, y0 + Hs / 2 + 14); ctx.lineTo(x0 + L + 50, y0 + Hs); ctx.lineTo(x0 + L + 20, y0 + Hs); ctx.stroke(); ctx.beginPath(); ctx.arc(x0 + L + 50, y0 + Hs / 2, 14, 0, 2 * PI); ctx.stroke(); ctx.fillStyle = '#5a5955'; ctx.textAlign = 'center'; ctx.fillText('V', x0 + L + 50, y0 + Hs / 2 + 4); ctx.textAlign = 'left';
    ctx.fillText(`V_H (top − bottom)`, x0 + L + 70, y0 + Hs / 2 - 6); ctx.fillText(`= ${sci((edgeTop ? sign : -sign) * Math.abs(r.VH), 4)} V`, x0 + L + 70, y0 + Hs / 2 + 10);
    wrapText(ctx, `Carriers (${sign > 0 ? 'holes, red' : 'electrons, blue'}) drift at v_d = ${sci(Math.abs(r.vd), 3)} m/s ${vdir > 0 ? 'with' : 'against'} the current. B pushes them to the ${edgeTop ? 'top' : 'bottom'} edge until the Hall field E_H = v_d B balances the push. The sign of V_H tells the sign of the carriers: it is how we know electrons carry the current in copper and holes in p-type silicon.`, 12, 20, W - 24);
    ctx.fillText(`E_H = ${sci(Math.abs(r.EH), 4)} V/m · V_H = I B / (n q t) = ${sci(Math.abs(r.VH), 4)} V · R_H = 1/(n q) = ${sci(r.RH, 4)} m³/C`, 12, H - 12);
  },

  drawWires(ctx, W, H) {
    const p = this.p.wires, r = this.res;
    const cx = W / 2, cy = H / 2, sep = Math.min(W * 0.3, 220);
    const wire = (x, I) => { ctx.fillStyle = I > 0 ? '#f5a623' : '#7b61ff'; ctx.beginPath(); ctx.arc(x, cy, 16, 0, 2 * PI); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(I > 0 ? '•' : '×', x, cy + 1); ctx.font = '12px system-ui'; ctx.textBaseline = 'alphabetic'; };
    // B of each wire at the other: circles around wire 1 passing through wire 2
    ctx.strokeStyle = 'rgba(31,95,191,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx - sep / 2, cy, sep, 0, 2 * PI); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + sep / 2, cy, sep, 0, 2 * PI); ctx.stroke(); ctx.setLineDash([]);
    wire(cx - sep / 2, p.I1); wire(cx + sep / 2, p.I2);
    const attract = r.fL > 0;
    const farrow = (x, dir, label) => { const L = 50 + 50 * Math.min(1, Math.abs(r.fL) / 1e-3); ctx.strokeStyle = '#2a9d4b'; ctx.fillStyle = '#2a9d4b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + dir * L, cy); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + dir * (L + 10), cy); ctx.lineTo(x + dir * L, cy - 6); ctx.lineTo(x + dir * L, cy + 6); ctx.closePath(); ctx.fill(); ctx.textAlign = 'center'; ctx.fillText(label, x + dir * L / 2, cy - 12); ctx.textAlign = 'left'; };
    farrow(cx - sep / 2 + 18, attract ? 1 : -1, 'F on 1'); farrow(cx + sep / 2 - 18, attract ? -1 : 1, 'F on 2');
    // B arrows at each wire due to the other: tangent to the dashed circle (B of wire 1 at wire 2 is along ±y)
    const barrow = (x, Iother, side, label) => { const dir = Iother > 0 ? side : -side; ctx.strokeStyle = '#1f5fbf'; ctx.fillStyle = '#1f5fbf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, cy - 24); ctx.lineTo(x, cy - 24 - dir * 40); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, cy - 24 - dir * 48); ctx.lineTo(x - 5, cy - 24 - dir * 40); ctx.lineTo(x + 5, cy - 24 - dir * 40); ctx.closePath(); ctx.fill(); ctx.textAlign = 'center'; ctx.fillText(label, x, cy - 24 - dir * 58 + (dir < 0 ? 12 : 0)); ctx.textAlign = 'left'; };
    barrow(cx + sep / 2, p.I1, 1, `B₁ at 2 = ${sci(r.B1at2, 3)} T`); barrow(cx - sep / 2, p.I2, -1, `B₂ at 1 = ${sci(r.B2at1, 3)} T`);
    ctx.fillStyle = '#5a5955'; ctx.textAlign = 'center'; ctx.fillText(`d = ${p.d} mm`, cx, cy + 40); ctx.textAlign = 'left';
    wrapText(ctx, `Each wire sits in the other's field B = μ₀I/(2πd) (dashed circle) and feels F = I L B: F/L = μ₀ I₁ I₂ / (2πd) = ${sci(r.fL, 4)} N/m, ${attract ? 'attracting (currents parallel)' : 'repelling (currents antiparallel)'}. Two 1 A currents 1 m apart feel 2 × 10⁻⁷ N/m: that was the definition of the ampere until 2019.`, 12, 20, W - 24);
  },

  drawLoop(ctx, W, H) {
    const p = this.p.loop, r = this.res, th = (p.theta * PI) / 180;
    const cx = W * 0.4, cy = H / 2, R = Math.min(W * 0.2, H * 0.3);
    // B along +x
    ctx.strokeStyle = 'rgba(31,95,191,0.6)'; ctx.fillStyle = 'rgba(31,95,191,0.6)'; ctx.lineWidth = 1.5;
    for (let k = -3; k <= 3; k++) { const y = cy + k * R * 0.35; ctx.beginPath(); ctx.moveTo(cx - R * 1.6, y); ctx.lineTo(cx + R * 1.6, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + R * 1.6 + 8, y); ctx.lineTo(cx + R * 1.6, y - 4); ctx.lineTo(cx + R * 1.6, y + 4); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#5a5955'; ctx.fillText(`B = ${p.B} T →`, cx + R * 1.6 + 14, cy - 3 * R * 0.35 + 4);
    // loop edge-on: normal at θ from B; the loop line perpendicular to the normal
    const nx = Math.cos(th), ny = Math.sin(th);
    const ax = cx - (-ny) * R, ay = cy - nx * R, bx = cx + (-ny) * R, by = cy + nx * R; // ends = the two sides of length b, seen end-on
    ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const end = (x, y, out) => { ctx.fillStyle = out ? '#f5a623' : '#7b61ff'; ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * PI); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(out ? '•' : '×', x, y + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; };
    end(ax, ay, p.I > 0); end(bx, by, p.I <= 0);
    // forces on the b-sides: F = I b B along ±y (perpendicular to B, in the plane), equal and opposite: a couple
    const F = r.Fside, L = 30 + 60 * Math.min(1, Math.abs(F) / 1);
    const farrow = (x, y, dir) => { ctx.strokeStyle = '#2a9d4b'; ctx.fillStyle = '#2a9d4b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + dir * L); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y + dir * (L + 10)); ctx.lineTo(x - 6, y + dir * L); ctx.lineTo(x + 6, y + dir * L); ctx.closePath(); ctx.fill(); };
    const s1 = p.I > 0 ? -1 : 1; farrow(ax, ay, s1); farrow(bx, by, -s1);
    ctx.fillStyle = '#2a9d4b'; ctx.fillText(`F = N I b B = ${sci(Math.abs(F), 3)} N on each side`, ax + 14, ay + s1 * L);
    // normal and torque
    ctx.strokeStyle = '#e5484d'; ctx.fillStyle = '#e5484d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + nx * R * 0.8, cy - ny * R * 0.8); ctx.stroke(); ctx.fillText('m = N I A n̂', cx + nx * R * 0.85, cy - ny * R * 0.85);
    ctx.strokeStyle = '#5a5955'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, -th, 0, false); ctx.stroke(); ctx.fillStyle = '#5a5955'; ctx.fillText(`θ = ${p.theta}°`, cx + R * 0.5, cy - R * 0.15);
    wrapText(ctx, `Side view along the a-sides: the two b-sides (end-on dots) carry current out of and into the page and feel equal and opposite forces I b B, a couple with lever a sin θ: τ = N I A B sin θ = m B sin θ. The torque turns m toward B (θ → 0), where U = −m·B is lowest. A motor reverses the current every half turn so the torque never changes sign.`, 12, 20, W - 24);
    ctx.fillText(`m = ${sci(r.m, 4)} A·m² · τ = ${sci(r.torque, 4)} N·m · U = −mB cos θ = ${sci(r.U, 4)} J`, 12, H - 12);
  },

  // ------------------------------------------------------------ plots

  drawPlots(ctx, W, H) {
    if (this.mode === 'particle' && !this.traces) this.compute();
    if (this.mode !== 'particle' && !this.res) this.compute();
    ctx.font = '12px system-ui';
    const frame = (lo, hi, a0, a1, xl, yl, top = 50) => {
      const L = 84, Rm = 20, B = 48, T = top;
      const px = (v) => L + ((v - a0) / (a1 - a0 || 1)) * (W - L - Rm), py = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
      ctx.fillStyle = '#5a5955'; for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 22, py(v) + 4); }
      for (let k = 0; k <= 6; k++) { const v = a0 + (k / 6) * (a1 - a0); ctx.fillText(sci(v, 3), Math.min(px(v) - 14, W - Rm - 50), H - B + 16); }
      ctx.fillText(xl, W / 2 - 60, H - 6); ctx.save(); ctx.translate(10, T + 0.5 * (H - T - B)); ctx.rotate(-PI / 2); ctx.textAlign = 'center'; ctx.fillText(yl, 0, 0); ctx.restore(); ctx.textAlign = 'left';
      if (lo < 0 && hi > 0) { ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke(); }
      const line = (xs, ys, color, dash = []) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath(); xs.forEach((x, k) => (k ? ctx.lineTo(px(x), py(ys[k])) : ctx.moveTo(px(x), py(ys[k])))); ctx.stroke(); ctx.setLineDash([]); };
      const legend = (items) => { let lx = L; for (const [name, color, dash] of items) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash(dash ?? []); ctx.beginPath(); ctx.moveTo(lx, 16); ctx.lineTo(lx + 22, 16); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5a5955'; ctx.fillText(name, lx + 28, 20); lx += ctx.measureText(name).width + 50; } };
      return { px, py, line, legend, L };
    };
    if (this.mode === 'particle') {
      // speed and kinetic energy against time for each particle: constant in B alone, changing with E
      const colors = ['#e5484d', '#1f5fbf', '#2a9d4b'];
      const all = this.traces.flatMap((T) => T.tr.ke), tmax = Math.max(...this.traces.map((T) => T.tr.t[T.tr.t.length - 1]));
      const hi = Math.max(...all) * 1.1 || 1;
      const A = frame(0, hi, 0, tmax, 'time (s)', 'kinetic energy (J)');
      this.traces.forEach((T, k) => A.line(T.tr.t, T.tr.ke, colors[k % 3]));
      A.legend(this.traces.map((T, k) => [`${k + 1}: ½mv² (${this.species(T.part).label})`, colors[k % 3]]));
      ctx.fillStyle = '#5a5955'; ctx.fillText('A magnetic field does no work: in B alone the kinetic energy is exactly constant (the Boris integrator keeps it so). Only E changes the speed.', A.L, 36);
    } else if (this.mode === 'hall') {
      const p = this.p.hall, Bs = [], Vs = []; for (let k = 0; k <= 100; k++) { const B = (2 * Math.abs(p.B) * k) / 100; Bs.push(B); Vs.push(Math.abs(hall({ I: p.I, B, n: p.n, qc: p.sign * E_CHARGE, w: p.w * 1e-3, t: p.t * 1e-3 }).VH)); }
      const A = frame(0, Math.max(...Vs) * 1.1 || 1, 0, Bs[100], 'B (T)', '|V_H| (V)'); A.line(Bs, Vs, '#1f5fbf');
      ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(A.px(Math.abs(p.B)), A.py(Math.abs(this.res.VH)), 5, 0, 2 * PI); ctx.fill();
      ctx.fillStyle = '#5a5955'; ctx.fillText('V_H is linear in B, which is what makes a Hall probe a magnetometer; its slope IR_H/t is tiny for a metal and large for a lightly doped semiconductor.', A.L, 36);
    } else if (this.mode === 'wires') {
      const p = this.p.wires, ds = [], fs = []; for (let k = 1; k <= 100; k++) { const d = (3 * p.d * 1e-3 * k) / 100; ds.push(d * 1e3); fs.push(Math.abs(wireForcePerLength(p.I1, p.I2, d))); }
      const A = frame(0, fs[Math.floor(100 * 0.05)] || 1, 0, ds[99], 'separation d (mm)', '|F/L| (N/m)'); A.line(ds, fs, '#2a9d4b');
      ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(A.px(p.d), A.py(Math.min(Math.abs(this.res.fL), fs[5])), 5, 0, 2 * PI); ctx.fill();
      ctx.fillStyle = '#5a5955'; ctx.fillText('The force per length falls as 1/d: doubling the spacing halves it.', A.L, 36);
    } else {
      const p = this.p.loop, ths = [], taus = [], Us = []; for (let k = 0; k <= 180; k++) { const th = (k * 2 * PI) / 180; const r = loopTorque(p.N, p.I, p.a * p.b * 1e-6, p.B, th); ths.push(k * 2); taus.push(r.torque); Us.push(r.U); }
      const m = Math.max(...taus.map(Math.abs), ...Us.map(Math.abs)) * 1.1 || 1;
      const A = frame(-m, m, 0, 360, 'θ between m and B (°)', 'τ (N·m), U (J)'); A.line(ths, taus, '#2a9d4b'); A.line(ths, Us, '#e5484d', [6, 4]);
      ctx.fillStyle = '#2a9d4b'; ctx.beginPath(); ctx.arc(A.px(p.theta), A.py(this.res.torque), 5, 0, 2 * PI); ctx.fill();
      A.legend([['τ = mB sin θ', '#2a9d4b'], ['U = −mB cos θ', '#e5484d', [6, 4]]]);
      ctx.fillStyle = '#5a5955'; ctx.fillText('The torque is zero where the energy is extreme: stable at θ = 0 (m along B), unstable at 180°. |τ| = dU/dθ, and it acts to reduce θ.', A.L, 36);
    }
  },

  // ------------------------------------------------------------ shell hooks

  statusText() {
    if (this.mode === 'particle' && this.traces) { const T = this.traces[0]; return `${this.traces.length} particle${this.traces.length > 1 ? 's' : ''} · t = ${sci(this.t, 3)} s of ${sci(this.duration(), 3)} s · particle 1: r_c = ${sci(T.cyc.r, 3)} m, T_c = ${sci(T.cyc.T, 3)} s · ${T.tr.t.length} samples`; }
    if (this.mode === 'hall' && this.res) return `Hall: v_d = ${sci(Math.abs(this.res.vd), 3)} m/s, V_H = ${sci(Math.abs(this.res.VH), 4)} V`;
    if (this.mode === 'wires' && this.res) return `F/L = ${sci(this.res.fL, 4)} N/m (${this.res.fL > 0 ? 'attract' : 'repel'})`;
    if (this.res) return `m = ${sci(this.res.m, 4)} A·m², τ = ${sci(this.res.torque, 4)} N·m`;
    return '';
  },
  probe() { return []; },
  getState() {
    const s = { cm: this.mode, t: +this.t.toPrecision(4), spd: +this.speed.toPrecision(3) };
    const d = this.defaults[this.mode];
    for (const k of Object.keys(d)) { if (k === 'parts') continue; const v = this.p[this.mode][k]; s[`${this.mode}_${k}`] = typeof v === 'boolean' ? (v ? 1 : 0) : v; }
    if (this.mode === 'particle') s.parts = this.p.particle.parts.flatMap((q) => [q.sp, q.v, q.ang, q.y0, `${q.qc ?? 1}/${q.mc ?? 1}`]);
    return s;
  },
  csv() {
    if (this.mode === 'particle') { if (!this.traces) this.compute(); const lines = ['particle,t_s,x_m,y_m,z_m,vx_mps,vy_mps,vz_mps,KE_J']; this.traces.forEach((T, k) => T.tr.t.forEach((t, i) => lines.push(`${k + 1},${t},${T.tr.x[i].join(',')},${T.tr.v[i].join(',')},${T.tr.ke[i]}`))); return lines.join('\n'); }
    if (!this.res) this.compute();
    return ['quantity,value', ...Object.entries(this.res).map(([k, v]) => `${k},${v}`)].join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Charges in fields'));
    box.appendChild(ui.lead(shell, 'F = q(E + v × B): what the fields do to charges and currents. A magnetic field bends but never speeds up; an electric field does the work.'));
    const re = () => { this.stop(); this.traces = null; this.res = null; this.buildControls(); shell.recompute(); shell.syncUrl(); shell.updateStageView(); };
    box.appendChild(ui.field('Setting', ui.select(MODES, this.mode, (v) => { this.mode = v; this.t = 0; re(); })));
    const p = this.p[this.mode];
    const pf = (obj, key, label, min, max) => ui.field(label, ui.number(obj[key], { min, max, onChange: (v) => { obj[key] = v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    if (this.mode === 'particle') {
      box.appendChild(ui.el('h2', '', 'Presets'));
      const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
      for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => { Object.assign(this.p.particle, JSON.parse(JSON.stringify(pr.set))); this.p.particle.parts.forEach((q) => { q.qc ??= 1; q.mc ??= 1; }); this.t = 0; re(); }, 'btn btn-small'));
      box.appendChild(pw);
      box.appendChild(ui.el('h2', '', 'Particles (up to three)'));
      p.parts.forEach((q, k) => {
        const r1 = ui.el('div', 'row');
        r1.appendChild(ui.field(`${k + 1}: species`, ui.select(SPECIES, q.sp, (v) => { q.sp = v; re(); })));
        r1.appendChild(ui.field('speed (m/s)', ui.number(q.v, { min: 0, max: 1e8, ariaLabel: `particle ${k + 1} speed`, onChange: (v) => { q.v = v; re(); } })));
        r1.appendChild(ui.field('direction (° from +x)', ui.number(q.ang, { min: -180, max: 180, ariaLabel: `particle ${k + 1} direction`, onChange: (v) => { q.ang = v; re(); } })));
        r1.appendChild(ui.field('start y (mm)', ui.number(q.y0, { min: -1000, max: 1000, ariaLabel: `particle ${k + 1} start y`, onChange: (v) => { q.y0 = v; re(); } })));
        if (p.parts.length > 1) r1.appendChild(ui.button('remove', () => { p.parts.splice(k, 1); re(); }, 'btn btn-small'));
        box.appendChild(r1);
        if (q.sp === 'custom') { const r2 = ui.el('div', 'row'); r2.append(ui.field('charge (e)', ui.number(q.qc, { min: -100, max: 100, ariaLabel: `particle ${k + 1} charge`, onChange: (v) => { q.qc = v; re(); } })), ui.field('mass (proton masses)', ui.number(q.mc, { min: 1e-4, max: 1e4, ariaLabel: `particle ${k + 1} mass`, onChange: (v) => { q.mc = v; re(); } }))); box.appendChild(r2); }
      });
      if (p.parts.length < 3) box.appendChild(ui.button('Add a particle', () => { p.parts.push({ ...p.parts[p.parts.length - 1] }); re(); }, 'btn btn-small'));
      row(pf(p, 'x0', 'Start x (mm)', -1000, 1000), pf(p, 'vz', 'v_z out of the page (m/s)', -1e8, 1e8), pf(p, 'dur', 'Duration (µs)', 1e-4, 1e4));
      box.appendChild(ui.el('h2', '', 'Fields (E in the plane, B along z)'));
      box.appendChild(ui.field('Regions', ui.select([['0', 'one region: the same fields everywhere'], ['1', 'two regions: x < 0 and x > 0 (selector + spectrometer)']], p.split ? '1' : '0', (v) => { p.split = v === '1'; re(); })));
      row(pf(p, 'E1x', `E_x ${p.split ? '(x < 0) ' : ''}(V/m)`, -1e9, 1e9), pf(p, 'E1y', `E_y ${p.split ? '(x < 0) ' : ''}(V/m)`, -1e9, 1e9), pf(p, 'B1', `B_z ${p.split ? '(x < 0) ' : ''}(T)`, -100, 100));
      if (p.split) { row(pf(p, 'E2x', 'E_x (x > 0) (V/m)', -1e9, 1e9), pf(p, 'E2y', 'E_y (x > 0) (V/m)', -1e9, 1e9), pf(p, 'B2', 'B_z (x > 0) (T)', -100, 100)); row(pf(p, 'slit', 'Slit half-width in the plate at x = 0 (mm)', 0.001, 100)); }
      box.appendChild(ui.el('p', 'hint', 'B_z > 0 points out of the page (•). A positive charge moving along +x in B_z > 0 is pushed toward −y (F = qv × B) and circles clockwise; a negative charge circles the other way. With E_y = v B_z the electric and magnetic forces cancel for exactly one speed, E/B: the velocity selector. Integrated with the Boris pusher, which conserves energy in a pure B exactly.'));
    } else if (this.mode === 'hall') {
      row(ui.field('Material', ui.select(Object.entries(MATERIALS).map(([k, v]) => [k, v.label]), p.mat, (v) => { p.mat = v; if (v !== 'custom') { p.n = MATERIALS[v].n; p.sign = MATERIALS[v].sign; } re(); })));
      if (p.mat === 'custom') row(pf(p, 'n', 'Carrier density n (/m³)', 1e15, 1e30), ui.field('Carrier sign', ui.select([['-1', 'negative (electrons)'], ['1', 'positive (holes)']], String(p.sign), (v) => { p.sign = parseInt(v, 10); re(); })));
      row(pf(p, 'I', 'Current I (A)', -1e3, 1e3), pf(p, 'B', 'B out of the page (T)', -50, 50)); row(pf(p, 'w', 'Strip width w (mm)', 0.01, 1000), pf(p, 't', 'Thickness t along B (mm)', 1e-4, 100));
      box.appendChild(ui.el('p', 'hint', 'The carriers drift at v_d = I/(n q w t) and B pushes them sideways until the charge piled on one edge makes a transverse field E_H = v_d B that stops the drift: V_H = E_H w = I B/(n q t). Metals have so many carriers that v_d and V_H are tiny; a thin, lightly doped semiconductor gives millivolts, which is what a Hall sensor is.'));
    } else if (this.mode === 'wires') {
      row(pf(p, 'I1', 'I₁ (A)', -1e4, 1e4), pf(p, 'I2', 'I₂ (A)', -1e4, 1e4), pf(p, 'd', 'Separation d (mm)', 0.1, 1e4));
      box.appendChild(ui.el('p', 'hint', 'Wire 2 sits in the field of wire 1, B₁ = μ₀I₁/(2πd), and a length L of it feels F = I₂ L B₁. Parallel currents attract; antiparallel repel. Newton’s third law holds: wire 1 feels the same force the other way.'));
    } else {
      row(pf(p, 'N', 'Turns N', 1, 1e4), pf(p, 'I', 'Current I (A)', -100, 100), pf(p, 'B', 'B (T)', -10, 10)); row(pf(p, 'a', 'Side a (mm, along B when θ = 90°)', 1, 1000), pf(p, 'b', 'Side b (mm, the sides that feel the force)', 1, 1000));
      const lab = ui.el('div', 'hint', `θ between m and B: ${p.theta}°`); const sl = ui.range(p.theta, { min: 0, max: 360, step: 1, ariaLabel: 'angle between m and B (degrees)', onInput: (v) => { p.theta = v; lab.textContent = `θ between m and B: ${v}°`; this.compute(); shell.updateStageView(); shell.refreshStatus(); clearTimeout(this.urlT); this.urlT = setTimeout(() => shell.syncUrl(), 300); } }); box.append(lab, sl);
      box.appendChild(ui.el('p', 'hint', 'The two sides perpendicular to B feel equal and opposite forces N I b B; they form a couple whose lever is a sin θ, so τ = N I a b B sin θ = m × B with m = N I A. The loop turns to align m with B; that is a galvanometer, and with a commutator a motor.'));
    }
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Scene', () => { shell.setStageView('scene'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Plots', () => { shell.setStageView('plots'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl) return;
    const tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    if (this.mode !== 'particle' && !this.res) return;
    if (this.mode === 'particle') {
      if (!this.traces) return;
      const p = this.p.particle;
      this.traces.forEach((T, k) => {
        const sp = this.species(T.part); const name = `${k + 1} (${sp.label})`;
        row(`${name}: q, m`, `${sci(T.q, 4)} C, ${sci(T.m, 4)} kg`);
        if (T.cyc.r < Infinity) { row(`${name}: cyclotron radius m v⊥/(|q|B)`, `${sci(T.cyc.r, 4)} m`); row(`${name}: period 2πm/(|q|B), frequency`, `${sci(T.cyc.T, 4)} s, ${sci(T.cyc.f, 4)} Hz`); }
        if (Number.isFinite(T.drift[0]) && (Math.abs(T.drift[0]) + Math.abs(T.drift[1]) > 0)) row(`${name}: E×B drift velocity (region 1)`, `(${sci(T.drift[0], 3)}, ${sci(T.drift[1], 3)}) m/s`);
        if (p.split) { row(`${name}: selector passes v = E/B`, `${sci(T.sel, 4)} m/s → ${Math.abs(T.part.v / T.sel - 1) < 1e-6 ? 'this one passes straight' : T.part.v > T.sel ? 'too fast: magnetic force wins' : 'too slow: electric force wins'}`); if (Number.isFinite(T.r2)) row(`${name}: radius in region 2, m v/(|q|B₂)`, `${sci(T.r2, 4)} m (lands 2r = ${sci(2 * T.r2, 4)} m from the entry)`); }
        row(`${name}: kinetic energy`, `${sci(T.tr.ke[0], 4)} J = ${sci(T.tr.ke[0] / E_CHARGE, 4)} eV (final ${sci(T.tr.ke[T.tr.ke.length - 1] / E_CHARGE, 4)} eV)`);
      });
    } else if (this.mode === 'hall') { const r = this.res, p = this.p.hall; row('drift speed v_d = I/(n q w t)', `${sci(Math.abs(r.vd), 4)} m/s`); row('Hall field E_H = v_d B', `${sci(Math.abs(r.EH), 4)} V/m`); row('Hall voltage V_H = I B/(n q t)', `${sci(Math.abs(r.VH), 4)} V`); row('Hall coefficient R_H = 1/(n q)', `${sci(r.RH, 4)} m³/C (${r.RH < 0 ? 'negative: electrons' : 'positive: holes'})`); row('V_H per tesla', `${sci(Math.abs(r.VH / p.B), 4)} V/T`); }
    else if (this.mode === 'wires') { const r = this.res, p = this.p.wires; row('B of wire 1 at wire 2', `${sci(r.B1at2, 4)} T`); row('F/L = μ₀I₁I₂/(2πd)', `${sci(r.fL, 4)} N/m`); row('on 1 m of wire', `${sci(r.fL, 4)} N (${r.fL > 0 ? 'attraction' : 'repulsion'})`); row('the ampere: 1 A, 1 A, 1 m', `${sci(wireForcePerLength(1, 1, 1), 4)} N/m`); void p; }
    else { const r = this.res, p = this.p.loop; row('magnetic moment m = N I A', `${sci(r.m, 4)} A·m²`); row('force on each b-side, N I b B', `${sci(r.Fside, 4)} N`); row('torque τ = m B sin θ', `${sci(r.torque, 4)} N·m`); row('maximum torque (θ = 90°)', `${sci(r.m * p.B, 4)} N·m`); row('energy U = −m·B', `${sci(r.U, 4)} J`); }
  },
};

function wrapText(ctx, text, x, y, maxW) {
  const words = text.split(' '); let line = '';
  for (const w of words) { const trial = line ? `${line} ${w}` : w; if (ctx.measureText(trial).width > maxW && line) { ctx.fillText(line, x, y); y += 14; line = w; } else line = trial; }
  if (line) ctx.fillText(line, x, y);
  return y + 14;
}
