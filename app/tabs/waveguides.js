// Waveguides tab: a rectangular guide. The TE10 fields on the x–z plane animated (E_y as
// colour, H in the plane as arrows), the bouncing-plane-wave picture, the mode chart with
// cutoffs, the dispersion diagram with v_p and v_g, and the numbers at the chosen frequency.
// Closed form (core/waveguide.js).

import { PI } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField, drawQuiver } from '../../core/render.js';
import { C0, cutoff, modeList, propagation, singleModeBand, te10Fields, te10Power, dispersion, STANDARD } from '../../core/waveguide.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame, wrapText } from '../views.js';

const N = 161;

export default {
  id: 'waveguides',
  title: 'Waveguides',
  phase: 8,
  available: true,
  summary: 'A rectangular waveguide: TE10 fields animated, the cutoff of every mode, the dispersion diagram with v_p > c > v_g, the guide wavelength and the bouncing-wave angle.',
  extent: [-0.02, 0.08, 0, 0.0229],
  axes: ['z', 'x'],
  layers: [
    { id: 'Ey', label: 'E_y (TE10, snapshot)', kind: 'scalar', unit: 'V/m', signed: true, default: true, eq: 'Ey' },
    { id: 'Emag', label: '|E_y| envelope', kind: 'scalar', unit: 'V/m', eq: 'Ey' },
    { id: 'H', label: 'H in the plane (snapshot)', kind: 'vector', styles: ['arrows'], default: true, eq: 'H' },
    { id: 'rays', label: 'bouncing plane waves', kind: 'info', default: true, eq: 'rays' },
  ],
  pDefaults: { a: 22.86, b: 10.16, f: 10, m: 1, n: 0 }, // mm, mm, GHz, mode indices for the numbers

  init(shell) {
    this.shell = shell; const s = shell.state;
    this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `wg_${k}`, this.p[k]);
    this.kind = getStr(s, 'wg_kind', 'TE'); this.t = getNum(s, 't', 0); this.speed = getNum(s, 'spd', 0.1); this.playing = false;
    this.views = [plotView('modes', 'Mode chart and dispersion', (ctx, w, h) => this.drawModes(ctx, w, h))];
    this.build(); this.buildControls();
  },
  destroy() { this.stop(); },
  a() { return this.p.a * 1e-3; }, b() { return this.p.b * 1e-3; }, f() { return this.p.f * 1e9; },
  build() {
    const a = this.a(), pr = propagation(a, this.b(), 1, 0, this.f()), span = pr.propagating ? Math.max(1.2 * pr.lamG, 1.5 * a) : 3 * a; // a guide wavelength or so along z, the guide width across
    this.extent = [0, span, 0, a]; this.shell.setExtent(this.extent, ['z', 'x']); this.results = null;
  },
  compute() {
    const a = this.a(), b = this.b(), f = this.f(), E = this.extent, t = this.t;
    this.grid = Grid2D.fromFunction(N, N, E, (z, x) => te10Fields(a, f, x, z, t).Ey);
    this.gridEnv = Grid2D.fromFunction(N, N, E, (z, x) => { const u = te10Fields(a, f, x, z, 0), v = te10Fields(a, f, x, z, 0.25 / f); return Math.hypot(u.Ey, v.Ey); });
    const pr10 = propagation(a, b, 1, 0, f), prSel = propagation(a, b, this.p.m, this.p.n, f, this.kind);
    this.results = { pr10, prSel, band: singleModeBand(a, b), modes: modeList(a, b, 3 * cutoff(a, b, 1, 0)), P: te10Power(a, b, f, 1) };
    this.renderResults();
  },
  render(layer, ctx, view, opts) {
    const a = this.a(), f = this.f();
    switch (layer) {
      case 'Ey': return drawScalarField(ctx, this.grid, { map: opts.map, extent: opts.extent, min: opts.min ?? -1, max: opts.max ?? 1 });
      case 'Emag': return drawScalarField(ctx, this.gridEnv, { map: opts.map, extent: opts.extent, min: opts.min ?? 0, max: opts.max ?? 1 });
      case 'H': drawQuiver(ctx, view, (z, x) => { const F = te10Fields(a, f, x, z, this.t); return [F.Hz, F.Hx]; }, { normalize: true }); return null;
      default: return null;
    }
  },
  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    const W = view.width, H = view.height;
    ctx.save(); ctx.font = '12px system-ui'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    // walls
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(W, 2); ctx.moveTo(0, H - 2); ctx.lineTo(W, H - 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(`walls at x = 0 and x = a = ${this.p.a} mm; the guide runs along z →`, 10, 18);
    if (this.shell.layerOn.get('rays') && r.pr10.propagating) {
      // a ray at angle θ to the axis, bouncing between the walls (the picture's scale is uniform, so pixel angles are true)
      const th = r.pr10.theta, [z0] = view.toPx(0.05 * this.extent[1], 0);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
      let zx = z0, xx = H - 2, dir = -1;
      for (let k = 0; k < 12 && zx < W; k++) { const nz = zx + (H - 4) / Math.tan(th), nx = xx + dir * (H - 4); ctx.beginPath(); ctx.moveTo(zx, xx); ctx.lineTo(nz, nx); ctx.stroke(); zx = nz; xx = nx; dir = -dir; }
      ctx.fillStyle = '#ffd166'; ctx.fillText(`TE10 = two plane waves bouncing at θ = ${((180 / PI) * th).toFixed(1)}° to the axis (cos θ = β/k)`, 10, H - 28);
    }
    if (!r.pr10.propagating) { ctx.fillStyle = '#ff5ad6'; ctx.fillText(`below cutoff (f < ${sci(r.pr10.fc, 4)} Hz): no wave, the field decays as e^{−αz}, α = ${sci(r.pr10.alpha, 3)} Np/m`, 10, H - 28); }
    ctx.fillStyle = '#fff'; ctx.fillText(`f = ${this.p.f} GHz · λ₀ = ${sci(C0 / this.f(), 3)} m · λ_g = ${r.pr10.propagating ? sci(r.pr10.lamG, 3) + ' m' : '—'} · t = ${(this.t * this.f()).toFixed(2)} T`, 10, H - 10);
    ctx.restore();
  },
  tick() { this.compute(); this.shell.redraw(); this.shell.refreshStatus(); },
  play() { this.playing = true; let last = performance.now(); const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; const T = 1 / this.f(); this.t = (this.t + dt * this.speed * T) % T; this.tick(); this.raf = requestAnimationFrame(step); }; this.raf = requestAnimationFrame(step); },
  stop() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; },

  drawModes(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, a = this.a(), b = this.b(), f10 = cutoff(a, b, 1, 0), f1 = 3.2 * f10, modes = r.modes.slice(0, 6), curves = dispersion(a, b, modes, 0, f1, 200);
    const kmax = (2 * PI * f1) / C0;
    const A = axesFrame(ctx, W, H, { lo: 0, hi: kmax * 1.05, a0: 0, a1: f1, xlabel: 'frequency (Hz)', ylabel: 'β (rad/m)', top: 92, fmt: (v) => sci(v, 2) });
    // light line β = k
    A.line(curves[0].f, curves[0].f.map((ff) => (2 * PI * ff) / C0), '#bbb', [2, 3], 1);
    const cols = ['#e5484d', '#1f5fbf', '#2a9d4b', '#7b61ff', '#f5a623', '#06d6a0'];
    curves.forEach((c, i) => { A.line(c.f, c.beta, cols[i % cols.length], c.kind === 'TM' ? [5, 4] : []); A.vline(c.fc, cols[i % cols.length], `${c.kind}${c.m}${c.n}`, A.T + 12 + 13 * (i % 3)); });
    A.vline(this.f(), '#5a5955', `f = ${this.p.f} GHz`, A.T + 60);
    const y = A.legend([...curves.map((c, i) => [`${c.kind}${c.m}${c.n} (f_c ${sci(c.fc, 3)} Hz)`, cols[i % cols.length], c.kind === 'TM' ? [5, 4] : []]), ['free space β = ω/c', '#bbb', [2, 3]]]);
    A.caption(`Every mode starts at its cutoff with β = 0 (v_p → ∞, v_g → 0) and bends toward the free-space line at high frequency. Below cutoff there is no curve: the mode is evanescent. Single-mode band ${sci(r.band.lo, 3)}–${sci(r.band.hi, 3)} Hz (ratio ${r.band.ratio.toFixed(2)}): run the guide there and only TE10 carries power. The slope of a curve is 1/v_g, the slope from the origin 1/v_p.`, y);
  },
  statusText() { const r = this.results; if (!r) return ''; const p = r.pr10; return `TE10: f_c = ${sci(p.fc, 4)} Hz · ${p.propagating ? `β = ${sci(p.beta, 4)} rad/m, λ_g = ${sci(p.lamG, 4)} m, v_p = ${sci(p.vp, 4)}, v_g = ${sci(p.vg, 4)} m/s, Z_TE = ${sci(p.Z, 4)} Ω` : `below cutoff, α = ${sci(p.alpha, 4)} Np/m`} · t = ${(this.t * this.f()).toFixed(2)} T`; },
  probe(z, x) { const F = te10Fields(this.a(), this.f(), x, z, this.t); return [{ label: 'E_y / E₀', value: F.Ey, unit: '' }, { label: 'H_x', value: F.Hx, unit: 'A/m per V/m' }, { label: 'H_z', value: F.Hz, unit: 'A/m per V/m' }, { label: 'x/a', value: x / this.a(), unit: '', note: 'E_y ∝ sin(πx/a): max at the centre, zero on the walls' }]; },
  getState() { const s = { wg_kind: this.kind, t: +this.t.toPrecision(4), spd: +this.speed.toPrecision(3) }; for (const [k, v] of Object.entries(this.p)) s[`wg_${k}`] = v; return s; },
  csv() { const g = this.grid, lines = ['z_m,x_m,Ey_rel']; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)}`); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Waveguides'));
    box.appendChild(ui.lead(shell, 'A hollow metal pipe carries a wave only above a cutoff frequency, as plane waves bouncing between the walls; the result travels slower than light in energy and faster in phase.'));
    const re = () => { this.stop(); this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Guide'));
    box.appendChild(ui.field('Standard size', ui.select([['', '— choose —'], ...Object.entries(STANDARD).map(([k, v]) => [k, v.label])], '', (k) => { if (!STANDARD[k]) return; p.a = +(STANDARD[k].a * 1e3).toFixed(3); p.b = +(STANDARD[k].b * 1e3).toFixed(3); re(); })));
    row(pf('a', 'Width a (mm)', 1, 500), pf('b', 'Height b (mm)', 1, 500), pf('f', 'Frequency (GHz)', 0.01, 300));
    box.appendChild(ui.el('h2', '', 'Mode for the numbers'));
    row(ui.field('Type', ui.select([['TE', 'TE'], ['TM', 'TM']], this.kind, (v) => { this.kind = v; shell.recompute(); shell.syncUrl(); })), pf('m', 'm', 0, 6, () => { shell.recompute(); shell.syncUrl(); }), pf('n', 'n', 0, 6, () => { shell.recompute(); shell.syncUrl(); }));
    box.appendChild(ui.el('p', 'hint', 'The picture is always TE10, the dominant mode (the one with the lowest cutoff when a > b). TM modes need m, n ≥ 1.'));
    box.appendChild(ui.el('h2', '', 'Animation'));
    const ar = ui.el('div', 'row'); const play = ui.button(this.playing ? 'Pause' : 'Play', () => { if (this.playing) this.stop(); else this.play(); play.textContent = this.playing ? 'Pause' : 'Play'; }, 'btn'); ar.append(play, ui.button('t = 0', () => { this.t = 0; this.tick(); }, 'btn btn-small')); box.appendChild(ar);
    const lab = ui.el('div', 'hint', `playback: ${this.speed.toPrecision(2)} periods per second`); box.appendChild(lab);
    box.appendChild(ui.range(Math.log10(this.speed), { min: -1.5, max: 0.5, step: 0.05, ariaLabel: 'playback speed (log)', onInput: (v) => { this.speed = Math.pow(10, v); lab.textContent = `playback: ${this.speed.toPrecision(2)} periods per second`; } }));
    box.appendChild(ui.el('p', 'hint', 'Press Play: the pattern slides along z at v_p, faster than light; the energy (and a pulse) would go at v_g, slower. Lower f toward cutoff and watch λ_g stretch and v_p run away.'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Modes and dispersion', () => { shell.setStageView('modes'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Field', () => { shell.setStageView('field'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, p = this.p, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('single-mode band (TE10 only)', `${sci(r.band.lo, 4)}–${sci(r.band.hi, 4)} Hz`);
    row('cutoffs below 3 f_c10', r.modes.map((m) => `${m.kind}${m.m}${m.n} ${sci(m.fc, 3)}`).join(', '));
    const s = r.prSel, name = `${this.kind}${p.m}${p.n}`;
    if (Number.isNaN(s.kc) || (this.kind === 'TM' && (p.m === 0 || p.n === 0)) || (p.m === 0 && p.n === 0)) row(name, 'not a mode');
    else if (!s.propagating) row(`${name} at ${p.f} GHz`, `cutoff ${sci(s.fc, 4)} Hz: evanescent, α = ${sci(s.alpha, 4)} Np/m = ${sci(s.alphaDb, 4)} dB/m`);
    else { row(`${name}: cutoff`, `${sci(s.fc, 4)} Hz`); row('β, λ_g', `${sci(s.beta, 4)} rad/m, ${sci(s.lamG, 4)} m (λ₀ = ${sci(s.lam0, 4)} m)`); row('v_p, v_g (v_p v_g = c²)', `${sci(s.vp, 4)}, ${sci(s.vg, 4)} m/s`); row(`wave impedance Z_${this.kind}`, `${sci(s.Z, 4)} Ω`); row('bounce angle cos θ = β/k', `${((180 / PI) * s.theta).toFixed(2)}°`); }
    if (r.pr10.propagating) row('TE10 power for E₀ = 1 V/m', `${sci(r.P, 4)} W`);
  },
};
