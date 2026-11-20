// Oblique incidence tab: a plane wave meets a plane boundary at an angle. Snapshot of the
// out-of-plane field on the x–z plane (animated), the three rays, Snell, the Fresnel
// coefficients against angle for both polarizations with Brewster and critical angles, total
// internal reflection and its evanescent tail. Closed form (core/oblique.js).

import { PI } from '../../core/constants.js';
import { Grid2D } from '../../core/grid.js';
import { drawScalarField } from '../../core/render.js';
import { cabs, carg } from '../../core/tline.js';
import { fresnel, specialAngles, sweep, evanescentDepth, fieldAt, wavelengths, C0 } from '../../core/oblique.js';
import { getNum, getStr } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView, axesFrame } from '../views.js';

const N = 161, deg = PI / 180;
const PRESETS = {
  'Air → glass': { e1: 1, e2: 2.25, th: 40 },
  'Glass → air (below critical)': { e1: 2.25, e2: 1, th: 30 },
  'Glass → air (total internal reflection)': { e1: 2.25, e2: 1, th: 60 },
  'Air → water (εr 81)': { e1: 1, e2: 81, th: 45 },
  'Brewster for air → glass': { e1: 1, e2: 2.25, th: 56.31 },
};

export default {
  id: 'oblique',
  title: 'Oblique incidence',
  phase: 8,
  available: true,
  summary: 'A plane wave meets a boundary at an angle: Snell, the Fresnel coefficients for both polarizations, Brewster, the critical angle, total internal reflection with its evanescent tail; the field animated.',
  extent: [-2, 2, -1.5, 1.5],
  axes: ['x', 'z'],
  layers: [
    { id: 'field', label: 'E_y (⊥) or H_y (∥) at this instant', kind: 'scalar', unit: 'rel.', signed: true, default: true, eq: 'field' },
    { id: 'rays', label: 'rays and wavefronts', kind: 'info', default: true, eq: 'snell' },
  ],
  pDefaults: { e1: 1, e2: 2.25, th: 40, f: 1000, span: 2 }, // εr1, εr2, θi (deg), MHz, picture half-height in λ1

  init(shell) {
    this.shell = shell; const s = shell.state;
    this.p = { ...this.pDefaults }; for (const k of Object.keys(this.p)) this.p[k] = getNum(s, `ob_${k}`, this.p[k]);
    this.pol = getStr(s, 'ob_pol', 'perp'); this.t = getNum(s, 't', 0); this.speed = getNum(s, 'spd', 0.1); this.playing = false;
    this.views = [plotView('coef', 'Γ and R against angle', (ctx, w, h) => this.drawCoef(ctx, w, h))];
    this.build(); this.buildControls();
  },
  destroy() { this.stop(); },
  f() { return this.p.f * 1e6; },
  build() {
    const l1 = C0 / (this.f() * Math.sqrt(this.p.e1)), L = this.p.span * l1;
    this.lambda1 = l1; this.extent = [-(4 / 3) * L, (4 / 3) * L, -L, L]; this.shell.setExtent(this.extent, ['x', 'z']); this.results = null;
  },
  compute() {
    const E = this.extent, t = this.t, { e1, e2 } = this.p, th = this.p.th * deg, f = this.f(), pol = this.pol;
    this.grid = Grid2D.fromFunction(N, N, E, (x, z) => fieldAt(e1, e2, th, f, pol, x, z, t));
    const fr = fresnel(e1, e2, th), sp = specialAngles(e1, e2), wl = wavelengths(e1, e2, th, f);
    const G = pol === 'perp' ? fr.Gperp : fr.Gpar, T = pol === 'perp' ? fr.Tperp : fr.Tpar, R = pol === 'perp' ? fr.Rperp : fr.Rpar;
    this.results = { fr, sp, wl, G, T, R, Tp: 1 - R, depth: evanescentDepth(e1, e2, th, f), amp: Math.max(1, 1 + cabs(G)) };
    this.renderResults();
  },
  render(layer, ctx, view, opts) {
    if (layer !== 'field') return null;
    const a = this.results?.amp ?? 2;
    return drawScalarField(ctx, this.grid, { map: opts.map, extent: opts.extent, min: opts.min ?? -a, max: opts.max ?? a });
  },
  drawOverlay(ctx, view) {
    const r = this.results; if (!r) return;
    const th = this.p.th * deg, [x0, z0] = view.toPx(0, 0), [xe, ze] = view.toPx(this.extent[1], 0), [xw] = view.toPx(this.extent[0], 0);
    ctx.save();
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xw, z0); ctx.lineTo(xe, z0); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    ctx.fillText(`medium 2: εr = ${this.p.e2} (z > 0)`, xw + 10, z0 - 8); ctx.fillText(`medium 1: εr = ${this.p.e1} (z < 0, the wave arrives from below)`, xw + 10, z0 + 16);
    if (this.shell.layerOn.get('rays')) {
      const Lr = 0.45 * (this.extent[3] - this.extent[2]);
      const seg = (p1, p2, color, label) => {
        const [x1, z1] = view.toPx(...p1), [x2, z2] = view.toPx(...p2);
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x1, z1); ctx.lineTo(x2, z2); ctx.stroke();
        const a2 = Math.atan2(z2 - z1, x2 - x1);
        ctx.beginPath(); ctx.moveTo(x2, z2); ctx.lineTo(x2 - 11 * Math.cos(a2 - 0.4), z2 - 11 * Math.sin(a2 - 0.4)); ctx.lineTo(x2 - 11 * Math.cos(a2 + 0.4), z2 - 11 * Math.sin(a2 + 0.4)); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        ctx.fillText(label, (x1 + x2) / 2 + 8, (z1 + z2) / 2);
      };
      seg([-Lr * Math.sin(th), -Lr * Math.cos(th)], [0, 0], '#ffd166', `incident θi = ${this.p.th}°`);
      seg([0, 0], [Lr * Math.sin(th), -Lr * Math.cos(th)], '#ef476f', `reflected θr = ${this.p.th}°`);
      if (!r.fr.tir) seg([0, 0], [Lr * Math.sin(r.fr.thetaT), Lr * Math.cos(r.fr.thetaT)], '#06d6a0', `transmitted θt = ${(r.fr.thetaT / deg).toFixed(2)}°`);
      else { ctx.fillStyle = '#06d6a0'; ctx.fillText(`total internal reflection: the field in medium 2 decays, 1/e depth ${sci(r.depth, 3)} m`, xw + 10, z0 - 30); }
      // normal
      const [, zn1] = view.toPx(0, -0.3 * Lr), [, zn2] = view.toPx(0, 0.3 * Lr); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0, zn1); ctx.lineTo(x0, zn2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui';
    ctx.fillText(`${this.pol === 'perp' ? '⊥ (E out of the plane): E_y' : '∥ (H out of the plane): H_y'} · Γ = ${sci(r.G[0], 3)}${r.G[1] ? (r.G[1] > 0 ? ' + ' : ' − ') + sci(Math.abs(r.G[1]), 3) + 'j' : ''} · t = ${(this.t * this.f()).toFixed(2)} T`, 10, view.height - 10);
    ctx.restore();
  },

  tick() { this.compute(); this.shell.redraw(); this.shell.refreshStatus(); },
  play() { this.playing = true; let last = performance.now(); const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; const T = 1 / this.f(); this.t = (this.t + dt * this.speed * T) % T; this.tick(); this.raf = requestAnimationFrame(step); }; this.raf = requestAnimationFrame(step); },
  stop() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; },

  drawCoef(ctx, W, H) {
    const { e1, e2 } = this.p, sw = sweep(e1, e2, 181), sp = specialAngles(e1, e2), th = sw.th.map((v) => v / deg);
    const A = axesFrame(ctx, W, H, { lo: -1, hi: 1, a0: 0, a1: 90, xlabel: 'angle of incidence θi (degrees)', ylabel: 'Γ (real part) and R = |Γ|²', top: 76, xticks: 6, fmt: (v) => (Number.isInteger(v) ? `${v}` : v.toFixed(2)) });
    A.hline(0, '#bbb', '');
    A.line(th, sw.Gperp, '#1f5fbf'); A.line(th, sw.Gpar, '#e5484d'); A.line(th, sw.Rperp, '#1f5fbf', [5, 4]); A.line(th, sw.Rpar, '#e5484d', [5, 4]);
    if (!Number.isNaN(sp.brewster)) A.vline(sp.brewster / deg, '#2a9d4b', `Brewster ${(sp.brewster / deg).toFixed(2)}°`);
    if (!Number.isNaN(sp.critical)) A.vline(sp.critical / deg, '#f5a623', `critical ${(sp.critical / deg).toFixed(2)}°`, A.T + 28);
    A.vline(this.p.th, '#5a5955', `θi = ${this.p.th}°`, A.T + 44);
    const y = A.legend([['Γ⊥ (E out of the plane)', '#1f5fbf'], ['Γ∥ (H out of the plane)', '#e5484d'], ['R⊥ = |Γ⊥|²', '#1f5fbf', [5, 4]], ['R∥ = |Γ∥|²', '#e5484d', [5, 4]]]);
    A.caption(e1 < e2 ? 'Going into the denser medium both coefficients start at (η₂ − η₁)/(η₂ + η₁) at normal incidence and reach |Γ| = 1 at grazing (Γ⊥ → −1; Γ∥ → +1 in this sign convention, which refers the reflected E∥ to its own propagation direction); Γ∥ passes through zero at Brewster’s angle, where the reflected and transmitted rays are perpendicular, so reflected light there is fully ⊥-polarised (polarising sunglasses).' : 'Going into the rarer medium both |Γ| reach 1 at the critical angle and stay there: total internal reflection. Past it Γ is complex (unit magnitude, a phase that differs between the polarisations) and the transmitted field only clings to the surface. Γ∥ still crosses zero at Brewster’s angle below critical.', y);
  },

  statusText() { const r = this.results; if (!r) return ''; return `λ₁ = ${sci(this.lambda1, 3)} m · θi = ${this.p.th}° → ${r.fr.tir ? 'total internal reflection' : `θt = ${(r.fr.thetaT / deg).toFixed(2)}°`} · R = ${(100 * r.R).toFixed(2)} %, T = ${(100 * r.Tp).toFixed(2)} % · t = ${(this.t * this.f()).toFixed(2)} T`; },
  probe(x, z) {
    const { e1, e2 } = this.p, th = this.p.th * deg, f = this.f();
    const v = fieldAt(e1, e2, th, f, this.pol, x, z, this.t), amp = Math.hypot(v, fieldAt(e1, e2, th, f, this.pol, x, z, this.t + 0.25 / f));
    return [{ label: this.pol === 'perp' ? 'E_y / E_i now' : 'H_y / H_i now', value: v, unit: '' }, { label: 'amplitude here', value: amp, unit: '× incident', note: z < 0 ? 'incident + reflected: between |1 − |Γ|| and 1 + |Γ|' : 'transmitted' }, { label: 'medium', value: z < 0 ? e1 : e2, unit: 'εr' }];
  },
  getState() { const s = { ob_pol: this.pol, t: +this.t.toPrecision(4), spd: +this.speed.toPrecision(3) }; for (const [k, v] of Object.entries(this.p)) s[`ob_${k}`] = v; return s; },
  csv() { const g = this.grid, lines = ['x_m,z_m,field_rel']; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)}`); return lines.join('\n'); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl, p = this.p;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Oblique incidence'));
    box.appendChild(ui.lead(shell, 'A plane wave arrives at a boundary at an angle. The boundary conditions fix how much reflects, and the answer depends on which way E points.'));
    const re = () => { this.stop(); this.build(); this.buildControls(); shell.recompute(); shell.syncUrl(); };
    const pf = (key, label, min, max, after = re) => ui.field(label, ui.number(p[key], { min, max, onChange: (v) => { p[key] = v; after(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    box.appendChild(ui.el('h2', '', 'Presets'));
    box.appendChild(ui.field('Preset', ui.select([['', '— choose —'], ...Object.keys(PRESETS).map((k) => [k, k])], '', (k) => { if (!PRESETS[k]) return; Object.assign(p, PRESETS[k]); re(); })));
    box.appendChild(ui.el('h2', '', 'Media and angle'));
    row(pf('e1', 'εr of medium 1 (wave arrives here)', 1, 100), pf('e2', 'εr of medium 2', 1, 100));
    row(pf('th', 'Angle of incidence θi (degrees)', 0, 89.9, () => { shell.recompute(); shell.updateStageView(); shell.syncUrl(); }));
    box.appendChild(ui.field('Polarisation', ui.select([['perp', '⊥ (E out of the plane, s / TE)'], ['par', '∥ (E in the plane, p / TM)']], this.pol, (v) => { this.pol = v; shell.recompute(); shell.syncUrl(); })));
    row(pf('f', 'Frequency (MHz)', 1, 1e6), pf('span', 'Picture half-height (λ₁, 4:3)', 0.5, 6));
    box.appendChild(ui.el('h2', '', 'Animation'));
    const ar = ui.el('div', 'row'); const play = ui.button(this.playing ? 'Pause' : 'Play', () => { if (this.playing) this.stop(); else this.play(); play.textContent = this.playing ? 'Pause' : 'Play'; }, 'btn'); ar.append(play, ui.button('t = 0', () => { this.t = 0; this.tick(); }, 'btn btn-small')); box.appendChild(ar);
    const lab = ui.el('div', 'hint', `playback: ${this.speed.toPrecision(2)} periods per second`); box.appendChild(lab);
    box.appendChild(ui.range(Math.log10(this.speed), { min: -1.5, max: 0.5, step: 0.05, ariaLabel: 'playback speed (log)', onInput: (v) => { this.speed = Math.pow(10, v); lab.textContent = `playback: ${this.speed.toPrecision(2)} periods per second`; } }));
    box.appendChild(ui.el('p', 'hint', 'Press Play. In medium 1 the incident and reflected waves make a pattern that moves along the interface and stands across it; the wavelength along the interface is the same on both sides (that is Snell). Past the critical angle nothing propagates into medium 2: the field there just clings to the surface.'));
    box.appendChild(ui.el('h2', '', 'Numbers'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    const vr = ui.el('div', 'row'); vr.append(ui.button('Γ and R against angle', () => { shell.setStageView('coef'); shell.syncUrl(); }, 'btn btn-small'), ui.button('Field', () => { shell.setStageView('field'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(vr);
    this.renderResults();
  },
  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    const cz = (c) => `${sci(c[0], 4)}${Math.abs(c[1]) > 1e-12 ? ` ${c[1] > 0 ? '+' : '−'} ${sci(Math.abs(c[1]), 4)}j (|·| = ${sci(cabs(c), 4)}, ${(carg(c) / deg).toFixed(1)}°)` : ''}`;
    row('n₁, n₂; η₁, η₂', `${Math.sqrt(this.p.e1).toFixed(3)}, ${Math.sqrt(this.p.e2).toFixed(3)}; ${sci(r.fr.eta1, 4)} Ω, ${sci(r.fr.eta2, 4)} Ω`);
    row('Snell: n₁ sin θi = n₂ sin θt', r.fr.tir ? `sin θt would be ${r.fr.sinT.toFixed(3)} > 1: total internal reflection` : `θt = ${(r.fr.thetaT / deg).toFixed(3)}°`);
    row('Γ⊥, τ⊥', `${cz(r.fr.Gperp)}; τ = ${cz(r.fr.Tperp)}`); row('Γ∥, τ∥', `${cz(r.fr.Gpar)}; τ = ${cz(r.fr.Tpar)}`);
    row('power: R⊥, T⊥ / R∥, T∥', `${(100 * r.fr.Rperp).toFixed(2)} %, ${(100 * r.fr.Tperp_power).toFixed(2)} % / ${(100 * r.fr.Rpar).toFixed(2)} %, ${(100 * r.fr.Tpar_power).toFixed(2)} %`);
    row('Brewster (∥): tan θB = √(ε₂/ε₁)', `${(r.sp.brewster / deg).toFixed(3)}°`); row('critical: sin θc = √(ε₂/ε₁)', Number.isNaN(r.sp.critical) ? 'none (ε₂ ≥ ε₁)' : `${(r.sp.critical / deg).toFixed(3)}°`);
    row('wavelengths λ₁, λ₂; along the interface', `${sci(r.wl.l1, 4)} m, ${sci(r.wl.l2, 4)} m; ${sci(r.wl.lx, 4)} m`);
    if (r.fr.tir) row('evanescent 1/e depth in medium 2', `${sci(r.depth, 4)} m = ${(r.depth / r.wl.l2).toFixed(3)} λ₂`);
  },
};
