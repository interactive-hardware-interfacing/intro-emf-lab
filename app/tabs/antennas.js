// Antennas tab: the finite dipole (pattern, directivity, radiation resistance, beamwidth
// against length) and a two-element array of dipoles (array factor, pattern multiplication,
// broadside, end-fire, grating lobes). Polar cuts and numbers. Far field, closed form +
// quadrature (core/antennas.js).

import { PI } from '../../core/constants.js';
import { dipolePattern, dipoleFigures, arrayFactor, arrayPattern, arrayDirectivity, isotropicArrayDirectivity, cuts, ARRAY_PRESETS } from '../../core/antennas.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame, wrapText } from '../views.js';

export default {
  id: 'antennas',
  title: 'Antennas',
  phase: 8,
  available: true,
  hideField: true,
  summary: 'Beyond the Hertzian dipole: the finite dipole’s pattern, directivity, 73 Ω and beamwidth against length; two dipoles as an array with the array factor, broadside, end-fire and grating lobes.',
  layers: [],
  pDefaults: { L: 0.5, d: 0.5, delta: 0 }, // wavelengths, wavelengths, degrees

  init(shell) {
    this.shell = shell; const s = shell.state;
    this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `an_${k}`, this.p[k]);
    this.mode = getStr(s, 'an_mode', 'dipole'); // 'dipole' | 'array'
    this.views = [
      plotView('polar', 'Pattern cuts', (ctx, w, h) => this.drawPolar(ctx, w, h)),
      plotView('length', 'Dipole figures against length', (ctx, w, h) => this.drawLength(ctx, w, h)),
      plotView('af', 'Array factor against angle', (ctx, w, h) => this.drawAF(ctx, w, h)),
    ];
    this.results = null; this.buildControls();
  },
  delta() { return (this.p.delta * PI) / 180; },
  compute() {
    const p = this.p, fig = dipoleFigures(p.L), arr = this.mode === 'array' ? { D: arrayDirectivity(p.L, p.d, this.delta()), Diso: isotropicArrayDirectivity(p.d, this.delta()) } : null;
    this.results = { fig, arr, cuts: cuts(p.L, p.d, this.delta(), 361, this.mode === 'array') };
    this.renderResults();
  },
  render() { return null; },

  polar(ctx, cx, cy, R, samples, color, label, axisLabels, fromRight = false) { // angle from the top clockwise (θ from z), or from the right counter-clockwise (φ from x)
    for (const g of [0.25, 0.5, 0.75, 1]) { ctx.strokeStyle = '#e5e5e5'; ctx.beginPath(); ctx.arc(cx, cy, R * g, 0, 2 * PI); ctx.stroke(); }
    ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(cx, cy - R * 1.08); ctx.lineTo(cx, cy + R * 1.08); ctx.moveTo(cx - R * 1.08, cy); ctx.lineTo(cx + R * 1.08, cy); ctx.stroke();
    ctx.fillStyle = '#5a5955'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(axisLabels[0], cx, cy - R * 1.08 - 4); ctx.fillText(axisLabels[1], cx + R * 1.02, cy - 8); ctx.textAlign = 'left';
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    samples.forEach((v, i) => { const a = (2 * PI * i) / (samples.length - 1), x = cx + R * v * (fromRight ? Math.cos(a) : Math.sin(a)), y = cy - R * v * (fromRight ? Math.sin(a) : Math.cos(a)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    ctx.fillStyle = color; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, cx, cy + R * 1.08 + 18); ctx.textAlign = 'left';
  },
  drawPolar(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, R = Math.min(W / 4.6, H / 3.2), cy = H * 0.52;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    let y = wrapText(ctx, this.mode === 'array' ? `Two dipoles of ${this.p.L} λ along z, on the x axis ${this.p.d} λ apart, fed ${this.p.delta}° apart. Left: the E-plane cut (φ = 0, the x–z plane, angle θ from the dipole axis). Right: the H-plane cut (θ = 90°, the x–y plane, angle φ from the array axis). Normalised field patterns.` : `A dipole of ${this.p.L} λ along z. Left: the E-plane (θ from the axis). Right: the H-plane (θ = 90°), a circle: the dipole is omnidirectional around its axis. Normalised field pattern |F|/F_max.`, 12, 18, W - 24);
    this.polar(ctx, W * 0.27, cy, R, r.cuts.E, '#e5484d', 'E-plane: θ from the dipole axis (up = z)', ['z (dipole axis)', 'x']);
    this.polar(ctx, W * 0.73, cy, R, r.cuts.H, '#1f5fbf', 'H-plane: φ in the x–y plane (right = x, the array axis)', ['y', 'x'], true);
    const f = r.fig;
    wrapText(ctx, this.mode === 'array' ? `Array directivity D = ${f && r.arr ? r.arr.D.toFixed(2) : ''} (${(10 * Math.log10(r.arr.D)).toFixed(2)} dBi); the same array of isotropic sources would give ${r.arr.Diso.toFixed(2)}; one dipole alone ${f.D.toFixed(2)}.` : `D = ${f.D.toFixed(3)} (${f.DdBi.toFixed(2)} dBi), R_in = ${sci(f.Rin, 4)} Ω, half-power beamwidth ${f.hpbw.toFixed(1)}°.`, 12, H - 24, W - 24);
  },
  drawLength(ctx, W, H) {
    const n = 120, Ls = [], D = [], Rin = [], Rr = [], bw = [];
    for (let i = 0; i < n; i++) { const L = 0.05 + (1.95 * i) / (n - 1), f = dipoleFigures(L, 600); Ls.push(L); D.push(f.D); Rin.push(Math.min(f.Rin, 5000)); Rr.push(f.Rrad); bw.push(f.hpbw); }
    const A = axesFrame(ctx, W, H, { lo: 0, hi: 1.05, a0: 0, a1: 2, xlabel: 'dipole length L (wavelengths)', ylabel: 'normalised', top: 80, xticks: 8, fmt: (v) => v.toFixed(2) });
    const Dm = Math.max(...D), Rm = 500, bm = 180;
    A.line(Ls, D.map((v) => v / Dm), '#e5484d'); A.line(Ls, Rr.map((v) => Math.min(v, Rm) / Rm), '#1f5fbf'); A.line(Ls, Rin.map((v) => Math.min(v, Rm) / Rm), '#1f5fbf', [5, 4]); A.line(Ls, bw.map((v) => v / bm), '#2a9d4b', [2, 3]);
    A.vline(0.5, '#b8860b', 'λ/2'); A.vline(1, '#b8860b', 'λ', A.T + 28); A.vline(this.p.L, '#5a5955', `L now`, A.T + 44);
    const y = A.legend([[`directivity / ${Dm.toFixed(2)}`, '#e5484d'], [`R_rad referred to I_max / ${Rm} Ω`, '#1f5fbf'], [`R_in referred to the feed current / ${Rm} Ω (clipped)`, '#1f5fbf', [5, 4]], ['half-power beamwidth / 180°', '#2a9d4b', [2, 3]]]);
    A.caption('The half-wave dipole is the sweet spot: 73 Ω (easy to feed), D = 1.64, 78° beamwidth. Shorter dipoles have a tiny R_in ∝ (L/λ)² and are hard to match; the full-wave dipole has D = 2.41 but an input resistance that runs away because the feed sits at a current node; D peaks at 1.25 λ, then the main lobe tilts away from broadside (the cusp) and side lobes grow.', y);
  },
  drawAF(ctx, W, H) {
    const p = this.p, n = 361, ph = [], af = [], el = [], tot = [];
    for (let i = 0; i < n; i++) { const a = (2 * PI * i) / (n - 1); ph.push((a * 180) / PI); af.push(arrayFactor(p.d, this.delta(), PI / 2, a) / 2); el.push(Math.abs(dipolePattern(p.L, PI / 2)) / (dipoleFigures(p.L, 200).Fmax || 1)); tot.push(arrayPattern(p.L, p.d, this.delta(), PI / 2, a)); }
    const tm = Math.max(...tot) || 1;
    const A = axesFrame(ctx, W, H, { lo: 0, hi: 1.05, a0: 0, a1: 360, xlabel: 'φ in the H-plane (degrees from the array axis x)', ylabel: 'normalised', top: 76, xticks: 8, fmt: (v) => `${Math.round(v)}`, yfmt: (v) => v.toFixed(2) });
    A.line(ph, af, '#7b61ff'); A.line(ph, el, '#e5484d', [5, 4]); A.line(ph, tot.map((v) => v / tm), '#1f5fbf', [2, 3]);
    const y = A.legend([['array factor |AF|/2 = |cos(ψ/2)|, ψ = kd cosφ + δ', '#7b61ff'], ['element pattern in this plane (a dipole is omnidirectional here)', '#e5484d', [5, 4]], ['total = element × AF', '#1f5fbf', [2, 3]]]);
    A.caption(`${this.mode === 'array' ? '' : 'Shown for d = ' + p.d + ' λ, δ = ' + p.delta + '° (choose “two dipoles as an array” to change them). '}ψ = kd cosφ + δ is the phase difference of the two paths. Maxima where ψ = 0 mod 2π, nulls where ψ = π. Broadside (δ = 0, d = λ/2): max at 90°, null at 0°. End-fire (d = λ/4, δ = −90°): max at 0°, null at 180°: the phase lag makes the two waves add forward and cancel backward. d ≥ λ brings a second maximum: a grating lobe.`, y);
  },
  statusText() { const r = this.results; if (!r) return ''; const f = r.fig; return `dipole ${this.p.L} λ: D = ${f.D.toFixed(3)} (${f.DdBi.toFixed(2)} dBi), R_in = ${sci(f.Rin, 4)} Ω, HPBW ${f.hpbw.toFixed(1)}°${r.arr ? ` · array d = ${this.p.d} λ, δ = ${this.p.delta}°: D = ${r.arr.D.toFixed(3)} (${(10 * Math.log10(r.arr.D)).toFixed(2)} dBi)` : ''}`; },
  probe() { return []; },
  getState() { const s = { an_mode: this.mode }; for (const [k, v] of Object.entries(this.p)) s[`an_${k}`] = v; return s; },
  csv() { const r = this.results, lines = ['angle_deg,Eplane_rel,Hplane_rel']; r.cuts.E.forEach((v, i) => lines.push(`${i},${v},${r.cuts.H[i]}`)); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Antennas'));
    box.appendChild(ui.lead(shell, 'Make the dipole longer than the Hertzian element and the current along it interferes with itself; put two of them together and their fields interfere with each other. Both shape the beam.'));
    const re = () => { shell.recompute(); shell.updateStageView(); shell.syncUrl(); };
    const pf = (key, label, min, max) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Dipole'));
    box.appendChild(ui.field('What', ui.select([['dipole', 'one dipole'], ['array', 'two dipoles as an array']], this.mode, (v) => { this.mode = v; this.buildControls(); re(); })));
    row(pf('L', 'Length L (wavelengths)', 0.02, 2));
    box.appendChild(ui.el('p', 'hint', 'The current is the standing wave sin(k(L/2 − |z|)), a good model for a thin wire. The pattern is [cos(kL/2 cosθ) − cos(kL/2)]/sinθ; everything else is integrated from it.'));
    if (this.mode === 'array') {
      box.appendChild(ui.el('h2', '', 'Array'));
      box.appendChild(ui.field('Preset', ui.select([['', '— choose —'], ...Object.keys(ARRAY_PRESETS).map((k) => [k, k])], '', (k) => { if (!ARRAY_PRESETS[k]) return; p.d = ARRAY_PRESETS[k].d; p.delta = Math.round((ARRAY_PRESETS[k].delta * 180) / PI); this.buildControls(); re(); })));
      row(pf('d', 'Spacing d (wavelengths, along x)', 0, 3), pf('delta', 'Phase of element 2 relative to 1, δ (degrees)', -180, 180));
      box.appendChild(ui.el('p', 'hint', 'Pattern multiplication: total = (element pattern) × (array factor). The array factor only knows the geometry and the phasing; it is the same for any kind of element.'));
    }
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Pattern cuts', () => { shell.setStageView('polar'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Against length', () => { shell.setStageView('length'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Array factor', () => { shell.setStageView('af'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, f = r.fig, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('directivity D', `${f.D.toFixed(4)} = ${f.DdBi.toFixed(2)} dBi`); row('R_rad (referred to I_max)', `${sci(f.Rrad, 4)} Ω`); row('R_in (referred to the feed current)', f.Rin === Infinity ? '∞ (feed at a current null)' : `${sci(f.Rin, 4)} Ω`); row('main lobe at θ', `${f.thetaMax.toFixed(1)}°${f.thetaMax < 89 ? ' (tilted off broadside)' : ' (broadside)'}`); row('half-power beamwidth', `${f.hpbw.toFixed(1)}°`);
    row('P_rad for I_max = 1 A', `${sci(f.P, 4)} W`);
    if (r.arr) { row('array directivity', `${r.arr.D.toFixed(4)} = ${(10 * Math.log10(r.arr.D)).toFixed(2)} dBi`); row('… with isotropic elements', r.arr.Diso.toFixed(4)); row('gain over one dipole', `${(10 * Math.log10(r.arr.D / f.D)).toFixed(2)} dB`); }
  },
};
