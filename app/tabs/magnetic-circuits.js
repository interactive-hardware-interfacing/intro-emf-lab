// Magnetic circuits tab: a core with an air gap and a winding, as a circuit of reluctances.
// A schematic with the flux, the MMF drops, B in the core and gap, L = N²/ℛ, the energy split,
// the pull on the pole faces; B against NI with and without the gap (saturation); L against gap
// length. Field-less; closed form (core/magcircuit.js). The Inductors tab is the field solution
// of the same idea.

import { MU0 } from '../../core/constants.js';
import { solve, sweepNI, sweepGap } from '../../core/magcircuit.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame, wrapText } from '../views.js';

const PRESETS = {
  'Lab-style ferrite core, 1 mm gap': { lc: 200, w: 20, d: 20, g: 1, muR: 2000, Bsat: 0, N: 200, I: 1 },
  'Same core, no gap': { lc: 200, w: 20, d: 20, g: 0, muR: 2000, Bsat: 0, N: 200, I: 1 },
  'Saturating steel, gapped (B_sat 1.2 T)': { lc: 200, w: 20, d: 20, g: 1, muR: 2000, Bsat: 1.2, N: 200, I: 5 },
  'Saturating steel, no gap': { lc: 200, w: 20, d: 20, g: 0, muR: 2000, Bsat: 1.2, N: 200, I: 5 },
  'Electromagnet lifting: 5 mm gap, 1000 turns, 10 A': { lc: 300, w: 40, d: 40, g: 5, muR: 1000, Bsat: 1.5, N: 1000, I: 10 },
};

export default {
  id: 'magnetic-circuits',
  title: 'Magnetic circuits',
  phase: 8,
  available: true,
  hideField: true,
  summary: 'A core with an air gap as a circuit of reluctances: NI = Φ Σℛ, B in core and gap, L = N²/ℛ, where the energy sits, the pull on the pole faces, fringing, saturation, and why a gap linearises an inductor.',
  layers: [],
  pDefaults: { lc: 200, w: 20, d: 20, g: 1, muR: 2000, Bsat: 0, N: 200, I: 1, fringe: 1 }, // mm, mm, mm, mm, –, T (0 = linear), turns, A, 0/1

  init(shell) {
    this.shell = shell; const s = shell.state;
    this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `mc_${k}`, this.p[k]);
    this.views = [
      plotView('circuit', 'Core, gap and the circuit', (ctx, w, h) => this.drawCircuit(ctx, w, h)),
      plotView('sat', 'B against NI', (ctx, w, h) => this.drawSat(ctx, w, h)),
      plotView('gap', 'L against gap', (ctx, w, h) => this.drawGap(ctx, w, h)),
    ];
    this.results = null; this.buildControls();
  },
  phys() { const p = this.p; return { lc: p.lc * 1e-3, w: p.w * 1e-3, d: p.d * 1e-3, g: p.g * 1e-3, muR: p.muR, Bsat: p.Bsat, N: p.N, I: p.I, fringe: !!p.fringe }; },
  compute() { this.results = solve(this.phys()); this.renderResults(); },
  render() { return null; },

  drawCircuit(ctx, W, H) {
    if (!this.results) this.compute();
    const r = this.results, p = this.p;
    // left: the core (a square ring with a gap at the top right), right: the equivalent circuit
    const cx = W * 0.27, cy = H * 0.5, S = Math.min(W * 0.4, H * 0.7), t = S * 0.18, gpx = Math.max(6, Math.min(S * 0.25, (S * 0.3 * p.g) / Math.max(p.w, 1e-9)));
    ctx.save(); ctx.lineWidth = 1;
    ctx.fillStyle = '#d9d2c5'; ctx.strokeStyle = '#8a8378';
    // ring as four bars
    const L0 = cx - S / 2, T0 = cy - S / 2;
    ctx.fillRect(L0, T0, t, S); ctx.strokeRect(L0, T0, t, S); // left leg
    ctx.fillRect(L0, T0 + S - t, S, t); ctx.strokeRect(L0, T0 + S - t, S, t); // bottom
    ctx.fillRect(L0 + S - t, T0, t, S); ctx.strokeRect(L0 + S - t, T0, t, S); // right leg
    if (p.g > 0) { const mid = L0 + S / 2; ctx.fillRect(L0, T0, mid - gpx / 2 - L0, t); ctx.strokeRect(L0, T0, mid - gpx / 2 - L0, t); ctx.fillRect(mid + gpx / 2, T0, L0 + S - mid - gpx / 2, t); ctx.strokeRect(mid + gpx / 2, T0, L0 + S - mid - gpx / 2, t); ctx.fillStyle = '#ff5ad6'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`gap ${p.g} mm`, mid, T0 - 6); ctx.textAlign = 'left'; }
    else { ctx.fillRect(L0, T0, S, t); ctx.strokeRect(L0, T0, S, t); }
    // winding on the left leg
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2.5; const nTurn = 7; for (let k = 0; k < nTurn; k++) { const y = T0 + t + 10 + ((S - 2 * t - 20) * k) / (nTurn - 1); ctx.beginPath(); ctx.ellipse(L0 + t / 2, y, t / 2 + 8, 5, 0, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.fillStyle = '#b8860b'; ctx.font = '12px system-ui'; ctx.fillText(`N = ${p.N}, I = ${p.I} A`, L0 - 10, T0 + S + 18); ctx.fillText(`NI = ${sci(r.NI, 3)} A·t`, L0 - 10, T0 + S + 34);
    // flux arrows around the ring
    ctx.strokeStyle = '#1f5fbf'; ctx.fillStyle = '#1f5fbf'; ctx.lineWidth = 2;
    const path = [[L0 + t / 2, T0 + S - t / 2], [L0 + t / 2, T0 + t / 2], [L0 + S - t / 2, T0 + t / 2], [L0 + S - t / 2, T0 + S - t / 2], [L0 + t / 2, T0 + S - t / 2]];
    for (let k = 0; k < 4; k++) { const [x0, y0] = path[k], [x1, y1] = path[k + 1], mx = (x0 + x1) / 2, my = (y0 + y1) / 2, a = Math.atan2(y1 - y0, x1 - x0); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx + 7 * Math.cos(a), my + 7 * Math.sin(a)); ctx.lineTo(mx - 6 * Math.cos(a - 0.5), my - 6 * Math.sin(a - 0.5)); ctx.lineTo(mx - 6 * Math.cos(a + 0.5), my - 6 * Math.sin(a + 0.5)); ctx.closePath(); ctx.fill(); }
    ctx.fillText(`Φ = ${sci(r.Phi, 3)} Wb, B_core = ${sci(r.Bc, 3)} T`, cx - S / 2 + t + 8, cy + 4);
    // equivalent circuit on the right
    const X = W * 0.62, Y = H * 0.25, Wc = W * 0.3, Hc = H * 0.5;
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5; ctx.strokeRect(X, Y, Wc, Hc);
    // MMF source on the left side, reluctances on top (core) and right (gap)
    ctx.fillStyle = '#fff'; ctx.fillRect(X - 14, Y + Hc / 2 - 14, 28, 28); ctx.strokeStyle = '#b8860b'; ctx.beginPath(); ctx.arc(X, Y + Hc / 2, 14, 0, 2 * Math.PI); ctx.stroke(); ctx.fillStyle = '#b8860b'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('NI', X, Y + Hc / 2 + 4); ctx.textAlign = 'left';
    const box = (x, y, label, val, col) => { ctx.fillStyle = '#fff'; ctx.fillRect(x - 36, y - 9, 72, 18); ctx.strokeStyle = col; ctx.strokeRect(x - 36, y - 9, 72, 18); ctx.fillStyle = col; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 4); ctx.fillText(val, x, y + 24); ctx.textAlign = 'left'; };
    box(X + Wc / 2, Y, 'ℛ_core', `${sci(r.Rc, 3)} /H`, '#8a8378'); box(X + Wc, Y + Hc / 2, 'ℛ_gap', `${sci(r.Rg, 3)} /H`, '#ff5ad6');
    ctx.fillStyle = '#1f5fbf'; ctx.font = '12px system-ui'; ctx.fillText(`Φ = NI / (ℛ_core + ℛ_gap) = ${sci(r.Phi, 3)} Wb`, X - 20, Y + Hc + 22);
    ctx.fillText(`MMF across the gap: ${(100 * r.gapShare).toFixed(1)} % of NI; across the core ${(100 * (1 - r.gapShare)).toFixed(1)} %`, X - 20, Y + Hc + 40);
    // caption
    ctx.fillStyle = '#5a5955';
    let yy = 18; yy = wrapText(ctx, `L = N²/ℛ = ${sci(r.L, 4)} H · energy ${sci(r.W, 3)} J, of which ${(100 * r.Wg / r.W).toFixed(0)} % sits in the gap · pull on the pole faces ${sci(r.F, 3)} N (${sci(r.F / 9.81, 3)} kgf)`, 12, yy, W - 24);
    wrapText(ctx, p.g > 0 ? 'The gap is a few millimetres of air in series with a quarter metre of iron, and still takes most of the magnetomotive force, because its reluctance is μ_r times larger per metre. That is why the inductance, the stored energy and the lifting force are all set by the gap.' : 'Without a gap the whole NI drives flux through the iron alone: a large L, but one that depends on μ_r (and so on temperature, frequency and saturation). Add a gap to make it predictable.', 12, yy + 2, W - 24);
    ctx.restore();
  },
  drawSat(ctx, W, H) {
    const q = this.phys(), NImax = Math.max(2 * q.N * q.I, 500), sw = sweepNI(q, NImax, 200), Bmax = Math.max(...sw.BnoGap, ...sw.Bgap) * 1.05;
    const A = axesFrame(ctx, W, H, { lo: 0, hi: Bmax, a0: 0, a1: NImax, xlabel: 'magnetomotive force N I (ampere-turns)', ylabel: 'B in the core (T)', top: 76, fmt: (v) => sci(v, 2) });
    A.line(sw.NI, sw.BnoGap, '#8a8378', [5, 4]); A.line(sw.NI, sw.Bgap, '#1f5fbf'); A.vline(q.N * q.I, '#b8860b', `NI now`);
    if (q.Bsat) A.hline(q.Bsat, '#e5484d', `B_sat = ${q.Bsat} T`);
    const y = A.legend([[`with the ${this.p.g} mm gap`, '#1f5fbf'], ['the same core without a gap', '#8a8378', [5, 4]]]);
    A.caption(q.Bsat ? 'The gapped core needs far more NI for the same B but stays linear much further: the gap’s reluctance does not saturate, so it swamps the core’s until the iron is near B_sat. This is the design trade in every inductor that must carry DC.' : 'With a linear core both curves are straight; set B_sat to see what the gap is for. The slope is μ_eff = B/(μ₀H_avg): the gap lowers it by about l_c/(μ_r g).', y);
  },
  drawGap(ctx, W, H) {
    const q = this.phys(), gMax = Math.max(5e-3, 3 * q.g), sw = sweepGap(q, gMax, 120);
    const A = axesFrame(ctx, W, H, { lo: 0, hi: 1.05, a0: 0, a1: gMax * 1e3, xlabel: 'gap length g (mm)', ylabel: 'normalised', top: 76, fmt: (v) => v.toFixed(2) });
    const L0 = sw.L[0];
    A.line(sw.g.map((v) => v * 1e3), sw.L.map((v) => v / L0), '#1f5fbf'); A.line(sw.g.map((v) => v * 1e3), sw.gapShare, '#ff5ad6', [5, 4]); A.vline(q.g * 1e3, '#b8860b', 'g now');
    const y = A.legend([[`L / L(g = 0) (L(0) = ${sci(L0, 3)} H)`, '#1f5fbf'], ['fraction of NI across the gap', '#ff5ad6', [5, 4]]]);
    A.caption('L = N²/(ℛ_c + ℛ_g) falls as 1/(1 + μ_r g/l_c): a gap of l_c/μ_r (0.1 mm for μ_r = 2000 and l_c = 0.2 m) already halves it. Beyond that L ≈ N²μ₀A/g: the iron has become a flux pipe and the gap sets everything.', y);
  },
  statusText() { const r = this.results; if (!r) return ''; return `ℛ_core = ${sci(r.Rc, 3)} /H, ℛ_gap = ${sci(r.Rg, 3)} /H · Φ = ${sci(r.Phi, 4)} Wb · B_core = ${sci(r.Bc, 4)} T, B_gap = ${sci(r.Bg, 4)} T · L = ${sci(r.L, 4)} H · F = ${sci(r.F, 3)} N`; },
  probe() { return []; },
  getState() { const s = {}; for (const [k, v] of Object.entries(this.p)) s[`mc_${k}`] = v; return s; },
  csv() { const q = this.phys(), sw = sweepGap(q, Math.max(5e-3, 3 * q.g), 50), lines = ['g_m,L_H,gapShare']; sw.g.forEach((g, i) => lines.push(`${g},${sw.L[i]},${sw.gapShare[i]}`)); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Magnetic circuits'));
    box.appendChild(ui.lead(shell, 'Flux goes where the iron goes, so a core is a circuit: NI plays the voltage, Φ the current, and l/(μA) the resistance. The gap is the big resistor.'));
    const re = () => { shell.recompute(); shell.updateStageView(); shell.syncUrl(); };
    const pf = (key, label, min, max) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Core'));
    box.appendChild(ui.field('Preset', ui.select([['', '— choose —'], ...Object.keys(PRESETS).map((k) => [k, k])], '', (k) => { if (!PRESETS[k]) return; Object.assign(p, PRESETS[k]); this.buildControls(); re(); })));
    row(pf('lc', 'Mean path in the iron l_c (mm)', 10, 5000), pf('g', 'Air gap g (mm)', 0, 50));
    row(pf('w', 'Section width (mm)', 1, 500), pf('d', 'Section depth (mm)', 1, 500));
    row(pf('muR', 'Core μ_r (initial if saturating)', 1, 1e5), pf('Bsat', 'B_sat (T; 0 = linear)', 0, 3));
    box.appendChild(ui.field('Fringing', ui.select([['1', 'gap area widened by g on each side'], ['0', 'none (A_gap = A_core)']], String(p.fringe), (v) => { p.fringe = +v; re(); })));
    box.appendChild(ui.el('h2', '', 'Winding'));
    row(pf('N', 'Turns N', 1, 1e5), pf('I', 'Current I (A)', 0, 1e4));
    const ind = shell.tabs.find((t) => t.id === 'inductors');
    box.appendChild(ui.el('p', 'hint', `The Inductors tab solves the fields of a real coil and core; this tab is the one-line model a designer uses first${ind?.results?.Lflux ? ` (that tab currently reads L = ${sci(ind.results.Lflux, 3)} H)` : ''}.`));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Circuit', () => { shell.setStageView('circuit'); shell.syncUrl(); }, 'btn btn-small'), ui.button('B vs NI', () => { shell.setStageView('sat'); shell.syncUrl(); }, 'btn btn-small'), ui.button('L vs gap', () => { shell.setStageView('gap'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('ℛ_core = l_c/(μA_c)', `${sci(r.Rc, 4)} /H`); row('ℛ_gap = g/(μ₀A_g)', `${sci(r.Rg, 4)} /H (A_g = ${sci(r.Ag, 3)} m²)`);
    row('Φ = NI/ℛ_total', `${sci(r.Phi, 4)} Wb`); row('B_core, B_gap', `${sci(r.Bc, 4)} T, ${sci(r.Bg, 4)} T`); row('H_core, H_gap', `${sci(r.Hc, 4)} A/m, ${sci(r.Hg, 4)} A/m`);
    row('MMF drops H_c l_c + H_g g', `${sci(r.Hc * this.phys().lc, 3)} + ${sci(r.Hg * this.phys().g, 3)} = ${sci(r.NI, 3)} A·t`);
    row('L = N²/ℛ_total = NΦ/I', `${sci(r.L, 4)} H (gapless ${sci(r.Lgapless, 4)} H)`); row(this.p.Bsat ? 'stored energy ∫H dB (not ½LI² once the iron saturates), share in the gap' : 'energy ½LI², share in the gap', `${sci(r.W, 4)} J, ${(100 * r.Wg / (r.W || 1)).toFixed(1)} %`);
    row('pull on the pole faces B²A/2μ₀', `${sci(r.F, 4)} N`); if (this.p.Bsat) row('effective μ_r of the core now', sci(r.muEff, 4));
  },
};
