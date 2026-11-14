// Faraday's law tab: ε = −dΦ/dt in the four textbook settings, animated. A bar sliding on
// rails through a field region (motional EMF; drive it or let it coast and brake), a loop
// carried through the region (the entering and leaving pulses), a stationary loop in a
// changing B, and the rotating-loop generator. The scene shows the induced current's
// direction (Lenz) and the force or torque; the plots show Φ, ε and I against time; the
// table shows the power balance.

import { PI } from '../../core/constants.js';
import { barState, loopState, fieldState, fieldB, generatorState } from '../../core/faraday.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const MODES = [['bar', 'Sliding bar on rails (motional EMF)'], ['loop', 'Loop moving through a field region'], ['field', 'Stationary loop, changing B(t)'], ['generator', 'Rotating loop (generator)']];
const DEF = {
  bar: { B: 1, W: 300, l: 200, R: 0.1, v0: 1, x0: -150, drive: 'drive', m: 50 },        // T, mm, mm, Ω, m/s, mm, —, g
  loop: { B: 0.5, W: 200, w: 80, h: 50, R: 0.05, v: 1, x0: -150 },                       // T, mm, mm, mm, Ω, m/s, mm
  field: { wave: 'sine', B0: 0.2, f: 50, rate: 2, tau: 10, A: 100, N: 10, R: 5 },        // T, Hz, T/s, ms, cm², —, Ω
  generator: { B: 0.3, w: 100, h: 100, N: 50, R: 10, rpm: 3600, theta0: 0 },            // T, mm, mm, —, Ω, rpm, °
};

export default {
  id: 'faraday',
  title: "Faraday's law",
  phase: 7,
  available: true,
  hideField: true,
  summary: 'ε = −dΦ/dt animated: a bar on rails, a loop through a field region, a loop in a changing B, a generator; Lenz, braking force, power balance.',
  extent: [0, 1, 0, 1],
  axes: ['x', 'y'],
  layers: [],

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.mode = MODES.some(([m]) => m === s.fm) ? s.fm : 'bar';
    this.p = {};
    for (const [m, d] of Object.entries(DEF)) { this.p[m] = { ...d }; for (const k of Object.keys(d)) { const v = s[`${m}_${k}`]; if (v === undefined) continue; this.p[m][k] = typeof d[k] === 'number' ? getNum(s, `${m}_${k}`, d[k]) : v; } }
    this.t = getNum(s, 't', 0); this.speed = getNum(s, 'spd', this.mode === 'generator' || this.mode === 'field' ? 0.02 : 0.5);
    this.playing = false; this.raf = null;
    this.views = [
      plotView('scene', 'Scene', (ctx, w, h) => this.drawScene(ctx, w, h), { controls: (ctl, inst) => this.timeControls(ctl, inst) }),
      plotView('plots', 'Φ, ε, I against time', (ctx, w, h) => this.drawPlots(ctx, w, h), { controls: (ctl, inst) => this.timeControls(ctl, inst) }),
    ];
    this.buildControls();
  },

  destroy() { this.stop(); },

  // ------------------------------------------------------------ model (SI)

  params() {
    const p = this.p[this.mode], mm = 1e-3;
    switch (this.mode) {
      case 'bar': return { B: p.B, W: p.W * mm, l: p.l * mm, R: p.R, v0: p.v0, x0: p.x0 * mm, mode: p.drive, m: p.m * 1e-3 };
      case 'loop': return { B: p.B, W: p.W * mm, w: p.w * mm, h: p.h * mm, R: p.R, v: p.v, x0: p.x0 * mm };
      case 'field': return { wave: p.wave, B0: p.B0, f: p.f, rate: p.rate, tau: p.tau * 1e-3, A: p.A * 1e-4, N: p.N, R: p.R };
      default: return { B: p.B, A: p.w * mm * p.h * mm, N: p.N, R: p.R, omega: (2 * PI * p.rpm) / 60, theta0: (p.theta0 * PI) / 180 };
    }
  },
  state(t = this.t) {
    const q = this.params();
    switch (this.mode) { case 'bar': return barState(q, t); case 'loop': return loopState(q, t); case 'field': return fieldState(q, t); default: return generatorState(q, t); }
  },
  /** The time window the plots show and the animation loops over. */
  window() {
    const q = this.params();
    switch (this.mode) {
      case 'bar': return q.mode === 'coast' && q.B > 0 ? Math.max((q.W - q.x0) / q.v0, 4 * (q.m * q.R) / (q.B * q.B * q.l * q.l)) * 1.2 : ((q.W - q.x0) / q.v0) * 1.3;
      case 'loop': return ((q.W + q.w - q.x0) / q.v) * 1.15;
      case 'field': return q.wave === 'sine' ? 2 / q.f : q.wave === 'ramp' ? 1 : 6 * q.tau;
      default: return (2 * 2 * PI) / q.omega;
    }
  },

  compute() { this.cur = this.state(); this.renderResults(); },
  render() { return null; },

  // ------------------------------------------------------------ animation

  timeControls(ctl, inst) {
    const T = this.window();
    const play = ui.button(this.playing ? 'Pause' : 'Play', () => { if (this.playing) this.stop(); else this.play(); play.textContent = this.playing ? 'Pause' : 'Play'; }, 'btn btn-small');
    const reset = ui.button('t = 0', () => { this.t = 0; this.tick(); }, 'btn btn-small');
    const lab = ui.el('span', '', `t = ${sci(this.t, 3)} s`);
    const sl = ui.range(this.t, { min: 0, max: T, step: T / 1000, ariaLabel: 'time (s)', onInput: (v) => { this.t = v; this.tick(); } });
    sl.style.width = '220px';
    ctl.append(play, reset, ui.el('span', '', 'time:'), sl, lab, ui.el('span', '', 'speed:'));
    ctl.appendChild(ui.range(Math.log10(this.speed), { min: -3, max: 1, step: 0.05, ariaLabel: 'playback speed (log)', onInput: (v) => { this.speed = Math.pow(10, v); this.shell.syncUrl(); } }));
    ctl.appendChild(ui.el('span', 'hint', '(simulated seconds per real second, log scale)'));
    this.timeUi = { lab, sl, inst };
  },
  tick() {
    this.cur = this.state(); this.renderResults();
    if (this.timeUi) { this.timeUi.lab.textContent = `t = ${sci(this.t, 3)} s`; this.timeUi.sl.value = this.t; }
    this.shell.updateStageView(); this.shell.refreshStatus();
    clearTimeout(this.urlT); this.urlT = setTimeout(() => this.shell.syncUrl(), 400);
  },
  play() {
    this.playing = true; let last = performance.now();
    const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; this.t += dt * this.speed; const T = this.window(); if (this.t > T) this.t -= T; this.tick(); this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  },
  stop() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; },

  // ------------------------------------------------------------ scene

  drawScene(ctx, W, H) {
    if (!this.cur) this.compute();
    ctx.font = '12px system-ui';
    if (this.mode === 'generator') return this.drawGenerator(ctx, W, H);
    const q = this.params(), s = this.cur;
    // world box in metres: x from xmin to xmax, y centred
    let xmin, xmax, ymax;
    if (this.mode === 'bar') { xmin = Math.min(q.x0, -0.05) - 0.02; xmax = Math.max(q.W + 0.1, q.x0 + q.v0 * this.window()) + 0.02; ymax = q.l * 0.8; }
    else if (this.mode === 'loop') { xmin = q.x0 - q.w / 2 - 0.02; xmax = q.W + q.w + 0.05; ymax = Math.max(q.h, 0.04); }
    else { const side = Math.sqrt(q.A); xmin = -side; xmax = side; ymax = side; }
    const sc = Math.min((W - 40) / (xmax - xmin), (H - 90) / (2 * ymax));
    const ox = 20 + ((W - 40) - sc * (xmax - xmin)) / 2, oy = 40 + (H - 90) / 2;
    const X = (x) => ox + sc * (x - xmin), Y = (y) => oy - sc * y;
    // field region with × (into page) marks, density by |B|
    const fieldRect = (x0, x1, y0, y1, B) => {
      ctx.fillStyle = 'rgba(31,95,191,0.08)'; ctx.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
      ctx.strokeStyle = 'rgba(31,95,191,0.5)'; ctx.setLineDash([4, 4]); ctx.strokeRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1)); ctx.setLineDash([]);
      const n = Math.max(2, Math.min(14, Math.round(6 + 12 * Math.min(1, Math.abs(B) / 1.0)))), dx = (x1 - x0) / n, ny = Math.max(2, Math.round(n * (y1 - y0) / (x1 - x0))), dy = (y1 - y0) / ny;
      ctx.fillStyle = 'rgba(31,95,191,0.8)'; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (Math.abs(B) > 1e-9) for (let i = 0; i < n; i++) for (let j = 0; j < ny; j++) ctx.fillText(B > 0 ? '×' : '•', X(x0 + (i + 0.5) * dx), Y(y0 + (j + 0.5) * dy));
      ctx.font = '12px system-ui'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    };
    // current arrows along a rectangle path (ccw if I > 0)
    const arrows = (pts, I, Imax) => {
      if (Math.abs(I) < 1e-12 * Math.max(Imax, 1e-30)) return;
      const dir = I > 0 ? 1 : -1, col = I > 0 ? '#e5484d' : '#7b61ff';
      ctx.strokeStyle = col; ctx.lineWidth = 2 + 4 * Math.min(1, Math.abs(I) / (Imax || 1));
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke();
        const mx = (X(a[0]) + X(b[0])) / 2, my = (Y(a[1]) + Y(b[1])) / 2, ang = Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0])) + (dir > 0 ? 0 : PI);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    };
    const forceArrow = (x, y, F, Fmax, label) => { if (Math.abs(F) < 1e-15) return; const len = 20 + 60 * Math.min(1, Math.abs(F) / (Fmax || 1)), d = Math.sign(F); ctx.strokeStyle = '#2a9d4b'; ctx.fillStyle = '#2a9d4b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x) + d * len, Y(y)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(x) + d * (len + 8), Y(y)); ctx.lineTo(X(x) + d * len, Y(y) - 5); ctx.lineTo(X(x) + d * len, Y(y) + 5); ctx.closePath(); ctx.fill(); ctx.fillText(label, X(x) + d * (len + 12) - (d < 0 ? 60 : 0), Y(y) - 8); };
    const Imax = this.peakI();
    if (this.mode === 'bar') {
      fieldRect(0, q.W, -q.l / 2, q.l / 2, q.B);
      // rails
      ctx.strokeStyle = '#5a5955'; ctx.lineWidth = 3; for (const y of [-q.l / 2, q.l / 2]) { ctx.beginPath(); ctx.moveTo(X(xmin + 0.01), Y(y)); ctx.lineTo(X(xmax - 0.01), Y(y)); ctx.stroke(); }
      // resistor at the left end
      const xr = xmin + 0.01; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(xr), Y(q.l / 2)); ctx.lineTo(X(xr), Y(q.l * 0.15)); for (let k = 0; k < 6; k++) ctx.lineTo(X(xr) + (k % 2 ? -6 : 6), Y(q.l * 0.15 - (k + 0.5) * q.l * 0.3 / 6)); ctx.lineTo(X(xr), Y(-q.l * 0.15)); ctx.lineTo(X(xr), Y(-q.l / 2)); ctx.stroke(); ctx.fillStyle = '#5a5955'; ctx.fillText(`R = ${q.R} Ω`, X(xr) + 10, Y(0) + 4);
      // bar
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(X(s.x), Y(-q.l / 2)); ctx.lineTo(X(s.x), Y(q.l / 2)); ctx.stroke();
      // velocity and force arrows
      forceArrow(s.x, q.l / 2 + 0.3 * q.l * 0.2, s.v, Math.abs(q.v0), `v = ${s.v.toFixed(3)} m/s`);
      forceArrow(s.x, 0, s.F, this.peakF(), `F = ${sci(s.F, 3)} N`);
      // current loop: resistor end, rails, bar
      arrows([[xr, -q.l / 2], [s.x, -q.l / 2], [s.x, q.l / 2], [xr, q.l / 2]], s.I, Imax);
      ctx.fillStyle = '#5a5955'; ctx.fillText(`Φ = B·l·(length of circuit in the field) = ${sci(s.Phi, 4)} Wb · ε = −dΦ/dt = ${sci(s.emf, 4)} V · I = ${sci(s.I, 4)} A${s.inField ? '' : ' (bar outside the field: no EMF)'}`, 12, H - 12);
    } else if (this.mode === 'loop') {
      fieldRect(0, q.W, -ymax, ymax, q.B);
      const a0 = s.x - q.w / 2, a1 = s.x + q.w / 2;
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 4; ctx.strokeRect(X(a0), Y(q.h / 2), X(a1) - X(a0), Y(-q.h / 2) - Y(q.h / 2));
      arrows([[a0, -q.h / 2], [a1, -q.h / 2], [a1, q.h / 2], [a0, q.h / 2]], s.I, Imax);
      forceArrow(s.x, q.h / 2 + 0.01, q.v, q.v, `v = ${q.v} m/s`);
      forceArrow(s.edges.lead && !s.edges.trail ? a1 : a0, 0, s.F, this.peakF(), `F = ${sci(s.F, 3)} N`);
      ctx.fillStyle = '#5a5955'; ctx.fillText(`Φ = ${sci(s.Phi, 4)} Wb · ε = ${sci(s.emf, 4)} V · I = ${sci(s.I, 4)} A · ${s.edges.lead && s.edges.trail ? 'both edges inside: Φ constant, no EMF' : s.edges.lead ? 'entering: flux rising' : s.edges.trail ? 'leaving: flux falling' : 'outside the field'}`, 12, H - 12);
    } else {
      const side = Math.sqrt(q.A);
      fieldRect(-side * 0.9, side * 0.9, -side * 0.9, side * 0.9, s.B);
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 4; ctx.strokeRect(X(-side / 2), Y(side / 2), X(side / 2) - X(-side / 2), Y(-side / 2) - Y(side / 2));
      arrows([[-side / 2, -side / 2], [side / 2, -side / 2], [side / 2, side / 2], [-side / 2, side / 2]], s.I, Imax);
      ctx.fillStyle = '#5a5955'; ctx.fillText(`B(t) = ${sci(s.B, 4)} T, dB/dt = ${sci(s.dB, 4)} T/s · Φ = N B A = ${sci(s.Phi, 4)} Wb · ε = −N A dB/dt = ${sci(s.emf, 4)} V · I = ${sci(s.I, 4)} A`, 12, H - 12);
      wrapText(ctx, '× marks: B into the page (density ∝ |B|); • when B reverses. Red arrows: induced current counter-clockwise (seen from above); purple: clockwise.', 12, 20, W - 24);
    }
    if (this.mode !== 'field') wrapText(ctx, 'Red arrows: induced current counter-clockwise (ε > 0); purple: clockwise. Green: velocity, and the magnetic force on the moving conductor, which always opposes the motion (Lenz).', 12, 20, W - 24);
  },

  drawGenerator(ctx, W, H) {
    const q = this.params(), s = this.cur, p = this.p.generator;
    const cx = W * 0.32, cy = H / 2, R = Math.min(W * 0.18, H * 0.3);
    // B arrows left to right
    ctx.strokeStyle = 'rgba(31,95,191,0.6)'; ctx.fillStyle = 'rgba(31,95,191,0.6)'; ctx.lineWidth = 1.5;
    for (let k = -3; k <= 3; k++) { const y = cy + k * R * 0.3; ctx.beginPath(); ctx.moveTo(cx - R * 1.5, y); ctx.lineTo(cx + R * 1.5, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + R * 1.5 + 8, y); ctx.lineTo(cx + R * 1.5, y - 4); ctx.lineTo(cx + R * 1.5, y + 4); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#5a5955'; ctx.fillText(`B = ${q.B} T →`, cx + R * 1.5 + 14, cy - 3 * R * 0.3 + 4);
    // the loop seen from above its axis: a line of half-length R at angle θ to the vertical (normal at θ to B)
    const th = s.theta, nx = Math.cos(th), ny = Math.sin(th); // normal in the (B, ⊥) plane: B along +x on screen
    const px = -ny * R, py = nx * R * 0.0 - nx * R; // loop line perpendicular to the normal
    ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - (-ny) * R, cy - (nx) * R); ctx.lineTo(cx + (-ny) * R, cy + (nx) * R); ctx.stroke();
    void px; void py;
    // normal arrow
    ctx.strokeStyle = '#2a9d4b'; ctx.fillStyle = '#2a9d4b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + nx * R * 0.7, cy - ny * R * 0.7); ctx.stroke(); ctx.fillText('n̂', cx + nx * R * 0.75, cy - ny * R * 0.75);
    // rotation arrow
    ctx.strokeStyle = '#5a5955'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, PI / 2 - 0.5, PI / 2 + 0.5); ctx.stroke(); ctx.fillStyle = '#5a5955'; ctx.textAlign = 'center'; ctx.fillText(`ω = ${p.rpm} rpm`, cx, cy + R * 1.1 + 16); ctx.textAlign = 'left';
    // flux "through the loop": |cos θ| as a bar
    ctx.fillStyle = '#5a5955';
    ctx.fillText(`θ = ωt = ${((th * 180) / PI % 360).toFixed(1)}°   Φ = N B A cos θ = ${sci(s.Phi, 4)} Wb`, 12, H - 48);
    ctx.fillText(`ε = N B A ω sin θ = ${sci(s.emf, 4)} V (peak ${sci(s.emfPeak, 4)} V, rms ${sci(s.emfRms, 4)} V) · I = ${sci(s.I, 4)} A · torque on the loop ${sci(s.torque, 4)} N·m, opposing the rotation`, 12, H - 30);
    ctx.fillText(`mechanical power in τω = ${sci(s.Pmech, 4)} W = electrical power out ε²/R = ${sci(s.Pelec, 4)} W`, 12, H - 12);
    wrapText(ctx, 'View along the axis of rotation: the loop is the orange bar, B points right, n̂ is the loop normal. Flux is largest when n̂ is along B and the EMF is then zero; a quarter turn later the EMF peaks.', 12, 20, W - 24);
    // small EMF dial on the right
    const gx = W * 0.82, gy = H / 2, gr = Math.min(W * 0.11, H * 0.22);
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, 2 * PI); ctx.stroke();
    const ang = -PI / 2 + (s.emf / s.emfPeak) * (PI / 2);
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + gr * 0.9 * Math.cos(ang), gy + gr * 0.9 * Math.sin(ang)); ctx.stroke();
    ctx.fillStyle = '#5a5955'; ctx.textAlign = 'center'; ctx.fillText(`ε = ${sci(s.emf, 3)} V`, gx, gy + gr + 16); ctx.fillText(`−${sci(s.emfPeak, 2)}`, gx - gr, gy + 4); ctx.fillText(`+${sci(s.emfPeak, 2)}`, gx + gr, gy + 4); ctx.textAlign = 'left';
  },

  peakI() { const T = this.window(); let m = 0; for (let k = 0; k <= 400; k++) m = Math.max(m, Math.abs(this.state((T * k) / 400).I)); return m || 1; },
  peakF() { const T = this.window(); let m = 0; for (let k = 0; k <= 400; k++) { const s = this.state((T * k) / 400); m = Math.max(m, Math.abs(s.F ?? s.torque ?? 0)); } return m || 1; },

  // ------------------------------------------------------------ plots

  drawPlots(ctx, W, H) {
    if (!this.cur) this.compute();
    const T = this.window(), n = 600, ts = [], series = { Phi: [], emf: [], I: [] };
    for (let k = 0; k < n; k++) { const t = (T * k) / (n - 1); ts.push(t); const s = this.state(t); series.Phi.push(s.Phi); series.emf.push(s.emf); series.I.push(s.I); }
    const rows = [['Φ (Wb)', series.Phi, '#1f5fbf'], ['ε = −dΦ/dt (V)', series.emf, '#e5484d'], ['I = ε/R (A)', series.I, '#2a9d4b']];
    const L = 84, Rm = 20, top = 30, each = (H - top - 40) / 3;
    ctx.font = '12px system-ui';
    rows.forEach(([name, ys, color], r) => {
      const T0 = top + r * each, Hh = each - 14;
      let lo = Math.min(0, ...ys), hi = Math.max(0, ...ys); if (!(hi > lo)) { hi = lo + 1; } const pad = 0.08 * (hi - lo); lo -= pad; hi += pad;
      const px = (t) => L + (t / T) * (W - L - Rm), py = (v) => T0 + (1 - (v - lo) / (hi - lo)) * Hh;
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T0); ctx.lineTo(L, T0 + Hh); ctx.lineTo(W - Rm, T0 + Hh); ctx.stroke();
      ctx.fillStyle = '#5a5955'; for (let k = 0; k <= 2; k++) { const v = lo + (k / 2) * (hi - lo); ctx.fillText(sci(v, 3), 20, py(v) + 4); }
      ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ys.forEach((v, k) => (k ? ctx.lineTo(px(ts[k]), py(v)) : ctx.moveTo(px(ts[k]), py(v)))); ctx.stroke();
      ctx.fillStyle = color; ctx.fillText(name, L + 6, T0 + 12);
      // cursor
      const tc = this.t % T; ctx.strokeStyle = '#f5a623'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px(tc), T0); ctx.lineTo(px(tc), T0 + Hh); ctx.stroke(); ctx.setLineDash([]);
      const sv = this.state(tc)[r === 0 ? 'Phi' : r === 1 ? 'emf' : 'I']; ctx.fillStyle = '#f5a623'; ctx.beginPath(); ctx.arc(px(tc), py(sv), 4, 0, 2 * PI); ctx.fill();
      if (r === 2) { for (let k = 0; k <= 5; k++) { const t = (T * k) / 5; ctx.fillStyle = '#5a5955'; ctx.fillText(sci(t, 3), px(t) - 14, T0 + Hh + 14); } ctx.fillText('time (s)', W / 2 - 20, H - 6); }
    });
    ctx.fillStyle = '#5a5955'; ctx.fillText('ε is minus the slope of Φ: it is largest where Φ changes fastest and zero where Φ is flat, whatever the value of Φ itself. The orange marker is the current time.', L, 18);
  },

  // ------------------------------------------------------------ shell hooks

  statusText() {
    const s = this.cur; if (!s) return '';
    return `${MODES.find(([m]) => m === this.mode)[1]} · t = ${sci(this.t, 3)} s · Φ = ${sci(s.Phi, 4)} Wb · ε = ${sci(s.emf, 4)} V · I = ${sci(s.I, 4)} A`;
  },
  probe() { return []; },
  getState() {
    const s = { fm: this.mode, t: +this.t.toPrecision(5), spd: +this.speed.toPrecision(3) };
    for (const [k, v] of Object.entries(this.p[this.mode])) s[`${this.mode}_${k}`] = v;
    return s;
  },
  csv() {
    const T = this.window(), lines = ['t_s,Phi_Wb,emf_V,I_A' + (this.mode === 'generator' ? ',torque_Nm' : this.mode === 'field' ? ',B_T' : ',x_m,F_N')];
    for (let k = 0; k <= 500; k++) { const t = (T * k) / 500, s = this.state(t); lines.push(`${t},${s.Phi},${s.emf},${s.I},${this.mode === 'generator' ? s.torque : this.mode === 'field' ? s.B : `${s.x},${s.F}`}`); }
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', "Faraday's law"));
    box.appendChild(ui.lead(shell, 'ε = −dΦ/dt: change the flux through a circuit, by moving it, moving a field through it, changing the field, or turning it, and a current flows that opposes the change.'));
    const re = () => { this.stop(); this.t = Math.min(this.t, this.window()); this.buildControls(); shell.recompute(); shell.syncUrl(); shell.updateStageView(); };
    box.appendChild(ui.field('Setting', ui.select(MODES, this.mode, (v) => { this.mode = v; this.t = 0; this.speed = v === 'generator' || v === 'field' ? 0.02 : 0.5; re(); })));
    const p = this.p[this.mode];
    const pf = (key, label, min, max) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = key === 'N' ? Math.max(1, Math.round(v)) : v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    if (this.mode === 'bar') {
      row(pf('B', 'B into the page (T)', -5, 5), pf('W', 'Field region width W (mm)', 10, 2000)); row(pf('l', 'Rail spacing = bar length l (mm)', 10, 1000), pf('R', 'Circuit resistance R (Ω)', 1e-4, 1e4));
      row(pf('v0', 'Speed v₀ (m/s)', 0.01, 100), pf('x0', 'Start position x₀ (mm)', -1000, 0));
      row(ui.field('Bar is', ui.select([['drive', 'pushed at constant speed'], ['coast', 'coasting (mass m, magnetic braking)']], p.drive, (v) => { p.drive = v; re(); })));
      if (p.drive === 'coast') row(pf('m', 'Bar mass m (g)', 1, 1e5));
      box.appendChild(ui.el('p', 'hint', 'Inside the field the moving bar has ε = B l v across it, a current ε/R flows, and the field pushes back on the bar with F = B I l = B²l²v/R. Pushed at constant speed, the agent supplies F·v = ε²/R, all of it heating R. Coasting, the braking force decays the speed with τ = mR/(B²l²): the bar never stops inside a wide enough field, it only slows exponentially.'));
    } else if (this.mode === 'loop') {
      row(pf('B', 'B into the page (T)', -5, 5), pf('W', 'Field region width W (mm)', 10, 2000)); row(pf('w', 'Loop width w (mm)', 5, 1000), pf('h', 'Loop height h (mm)', 5, 1000));
      row(pf('R', 'Loop resistance R (Ω)', 1e-4, 1e4), pf('v', 'Speed v (m/s)', 0.01, 100)); row(pf('x0', 'Start position of the centre x₀ (mm)', -2000, 0));
      box.appendChild(ui.el('p', 'hint', 'Only an edge inside the field has an EMF (B h v on it). Entering, the leading edge alone is inside and the flux rises; fully inside, both edges are and their EMFs cancel: no current, no force, however strong the field. Leaving, the trailing edge alone is inside and the current reverses. Make the loop wider than the region and see the pulses overlap.'));
    } else if (this.mode === 'field') {
      row(ui.field('B(t)', ui.select([['sine', 'B₀ sin 2πft'], ['ramp', 'B₀ + (rate)·t'], ['pulse', 'B₀ (1 − e^{−t/τ})']], p.wave, (v) => { p.wave = v; this.t = 0; re(); })), pf('B0', 'B₀ (T)', -10, 10));
      if (p.wave === 'sine') row(pf('f', 'Frequency f (Hz)', 0.01, 1e5)); if (p.wave === 'ramp') row(pf('rate', 'Rate dB/dt (T/s)', -1e4, 1e4)); if (p.wave === 'pulse') row(pf('tau', 'Time constant τ (ms)', 0.01, 1e4));
      row(pf('A', 'Loop area A (cm²)', 0.01, 1e5), pf('N', 'Turns N', 1, 1e5)); row(pf('R', 'Resistance R (Ω)', 1e-4, 1e6));
      box.appendChild(ui.el('p', 'hint', 'Nothing moves: the EMF comes from ∂B/∂t alone, ε = −N A dB/dt, which is the transformer EMF. For a sinusoid the EMF leads the flux by 90° and its amplitude grows with frequency, N B₀ A ω. For a ramp the EMF is constant while B climbs.'));
    } else {
      row(pf('B', 'B (T)', -5, 5), pf('rpm', 'Rotation speed (rpm)', 1, 1e5)); row(pf('w', 'Loop width (mm)', 5, 2000), pf('h', 'Loop height (mm)', 5, 2000)); row(pf('N', 'Turns N', 1, 1e5), pf('R', 'Load resistance R (Ω)', 1e-3, 1e6)); row(pf('theta0', 'Angle at t = 0 (°)', -180, 180));
      box.appendChild(ui.el('p', 'hint', 'Φ = N B A cos ωt, so ε = N B A ω sin ωt: a sinusoid at the rotation frequency with peak N B A ω. The current through the load makes a torque N I A B sin ωt that opposes the rotation, and τω equals ε²/R at every instant: the mechanical work in is the electrical energy out.'));
    }
    box.appendChild(ui.el('h2', '', 'Now (at the current time)'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Scene', () => { shell.setStageView('scene'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Plots', () => { shell.setStageView('plots'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    box.appendChild(ui.el('p', 'hint', 'Play, pause and scrub the time under the picture. The animation loops over one pass (or two periods).'));
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl) return;
    const s = this.cur ?? this.state(), q = this.params(), tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('t', `${sci(this.t, 4)} s`); row('Φ', `${sci(s.Phi, 4)} Wb`); row('ε = −dΦ/dt', `${sci(s.emf, 4)} V`); row('I = ε/R', `${sci(s.I, 4)} A`);
    if (this.mode === 'bar') { row('bar position, speed', `${(s.x * 1e3).toFixed(1)} mm, ${s.v.toFixed(4)} m/s`); row('ε = B l v (while in the field)', `${sci(q.B * q.l * s.v, 4)} V`); row('force on the bar F = B I l', `${sci(s.F, 4)} N (${s.F ? 'opposes the motion' : '—'})`); row('mechanical power F·v', `${sci(s.Pmech, 4)} W`); row('electrical power ε²/R', `${sci(s.Pelec, 4)} W`); if (q.mode === 'coast') row('braking time constant mR/(B²l²)', `${sci((q.m * q.R) / (q.B * q.B * q.l * q.l), 4)} s`); }
    if (this.mode === 'loop') { row('loop centre', `${(s.x * 1e3).toFixed(1)} mm`); row('edge EMF B h v', `${sci(q.B * q.h * q.v, 4)} V`); row('net force on the loop', `${sci(s.F, 4)} N`); row('power F·v = ε²/R', `${sci(s.Pmech, 4)} W = ${sci(s.Pelec, 4)} W`); row('charge passed while entering, Q = ΔΦ/R', `${sci((q.B * q.h * Math.min(q.w, q.W)) / q.R, 4)} C (independent of speed)`); }
    if (this.mode === 'field') { row('B(t), dB/dt', `${sci(s.B, 4)} T, ${sci(s.dB, 4)} T/s`); if (q.wave === 'sine') row('EMF amplitude N B₀ A ω', `${sci(q.N * q.B0 * q.A * 2 * PI * q.f, 4)} V`); row('power in R', `${sci(s.Pelec, 4)} W`); }
    if (this.mode === 'generator') { row('θ = ωt + θ₀', `${(((s.theta * 180) / PI) % 360).toFixed(1)}°`); row('peak EMF N B A ω', `${sci(s.emfPeak, 4)} V`); row('rms EMF', `${sci(s.emfRms, 4)} V`); row('frequency', `${sci(q.omega / (2 * PI), 4)} Hz`); row('torque on the loop', `${sci(s.torque, 4)} N·m`); row('mechanical power τω = electrical ε²/R', `${sci(s.Pmech, 4)} W = ${sci(s.Pelec, 4)} W`); row('average power ε_rms²/R', `${sci((s.emfRms * s.emfRms) / q.R, 4)} W`); }
  },
};

function wrapText(ctx, text, x, y, maxW) {
  const words = text.split(' '); let line = '';
  for (const w of words) { const trial = line ? `${line} ${w}` : w; if (ctx.measureText(trial).width > maxW && line) { ctx.fillText(line, x, y); y += 14; line = w; } else line = trial; }
  if (line) ctx.fillText(line, x, y);
  return y + 14;
}
