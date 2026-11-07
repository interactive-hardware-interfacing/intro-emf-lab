// Ring and line charge tab.
//   Mode "ring" (Lab 1 Module 1): a ring of radius R carrying either N point charges of
//     q each or a continuous line charge lambda. 3D fields; any cut plane. Difference map.
//   Mode "rods" (Lab 2 Module 0 reference): two oppositely charged infinite line charges
//     +-lambda at (+-d, 0), the analytic picture the students' solver must reproduce.

import { EPS0 } from '../../core/constants.js';
import { pointChargesField, ringChargeField, ringAsPointCharges, lineChargeE, lineChargeV } from '../../core/analytic.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween, drawMarker, radialSeeds } from '../../core/render.js';
import { CutPlane } from '../cutplane.js';
import { getNum } from '../state.js';
import { ui } from '../shell.js';

const GRID_N = 141;
const RING_EXTENTS = { xy: [-0.5, 0.5, -0.5, 0.5], xz: [-0.5, 0.5, -0.5, 0.5], yz: [-0.5, 0.5, -0.5, 0.5] };
const RODS_EXTENT = [-1, 1, -1, 1];

/**
 * Two tabs share this module: 'ring-charge' (N point charges on a ring versus a continuous
 * line charge, in 3D with cut planes) and 'line-charge' (two oppositely charged infinite
 * rods in cross-section). makeTab(mode) returns a fresh tab object for each.
 */
export function makeTab(mode) {
  return { ...TAB, mode, id: mode === 'ring' ? 'ring-charge' : 'line-charge', title: mode === 'ring' ? 'Ring charge' : 'Line charge',
    summary: mode === 'ring' ? 'A ring of N point charges versus the same ring as a continuous line charge, in 3D.' : 'Two oppositely charged infinite rods in cross-section: the field of two line charges.',
    extent: mode === 'ring' ? RING_EXTENTS.xy : RODS_EXTENT,
    layers: TAB.layers.map((L) => ({ ...L })) };
}

const TAB = {
  phase: 1,
  available: true,
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', signed: true, default: true },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'diff', label: 'Discrete − continuous |E|', kind: 'scalar', unit: 'V/m', signed: true, eq: 'E' },
    { id: 'En', label: 'E normal to plane', kind: 'scalar', unit: 'V/m', signed: true, eq: 'E' },
    { id: 'E', label: 'E field (in plane)', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour', eq: 'V' },
  ],

  mode: 'ring',
  source: 'discrete',  // ring: 'discrete' | 'continuous'
  N: 12,
  q: 1,
  lambda: 1,          // C/m
  R: 0.2,
  // rods
  d: 0.4,
  lam: 1e-9,
  a: 0.1,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.source = s.src === 'continuous' ? 'continuous' : 'discrete';
    this.N = Math.max(1, Math.round(getNum(s, 'N', 12)));
    this.q = getNum(s, 'q', 1);
    this.lambda = getNum(s, 'lam', 1);
    this.R = getNum(s, 'R', 0.2);
    this.d = getNum(s, 'd', 0.4);
    this.lam = getNum(s, 'laml', 1e-9);
    this.a = getNum(s, 'a', 0.1);
    this.cut = new CutPlane({ plane: s.plane ?? 'xy', offset: getNum(s, 'off', 0), range: [-0.5, 0.5], extents: RING_EXTENTS });
    this.applyMode();
    this.buildControls();
  },

  applyMode() {
    const shell = this.shell;
    const L = (id) => this.layers.find((l) => l.id === id);
    const ring = this.mode === 'ring';
    L('diff').available = ring;
    L('En').available = ring;
    if (!ring && (shell.colorLayer === 'diff' || shell.colorLayer === 'En')) shell.colorLayer = 'V';
    if (ring) shell.setExtent(this.cut.extent, this.cut.axes);
    else shell.setExtent(RODS_EXTENT, ['x', 'y']);
    shell.refreshLayers();
  },

  buildControls() {
    const shell = this.shell;
    const box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', this.title));
    const re = () => { shell.recompute(); shell.syncUrl(); };
    if (this.mode === 'ring') {
      box.appendChild(ui.lead(shell, 'A ring of N point charges versus a continuous line charge, in 3D.'));
      box.appendChild(ui.field('Show', ui.select([['discrete', 'Discrete: N point charges'], ['continuous', 'Continuous: line charge λ']], this.source, (v) => { this.source = v; re(); })));
      const r1 = ui.el('div', 'row');
      r1.appendChild(ui.field('Number of point charges N', ui.number(this.N, { min: 1, max: 400, onChange: (v) => { this.N = Math.round(v); re(); } })));
      r1.appendChild(ui.field('Charge per point q (C)', ui.number(this.q, { min: -10, max: 10, onChange: (v) => { this.q = v; re(); } })));
      box.appendChild(r1);
      const r2 = ui.el('div', 'row');
      r2.appendChild(ui.field('Line charge density λ (C/m)', ui.number(this.lambda, { min: -100, max: 100, onChange: (v) => { this.lambda = v; re(); } })));
      r2.appendChild(ui.field('Ring radius R (m)', ui.number(this.R, { min: 0.02, max: 0.45, onChange: (v) => { this.R = v; re(); } })));
      box.appendChild(r2);
      const eq = ui.el('p', 'hint');
      eq.textContent = `Equivalent λ for these N charges: ${(this.N * this.q / (2 * Math.PI * this.R)).toPrecision(4)} C/m. Equivalent q for this λ: ${(this.lambda * 2 * Math.PI * this.R / this.N).toPrecision(4)} C.`;
      box.appendChild(eq);
      box.appendChild(ui.el('h2', '', 'View'));
      box.appendChild(this.cut.controls((what) => {
        if (what === 'plane') { this.cut.refreshLabel(); shell.setExtent(this.cut.extent, this.cut.axes); }
        re();
      }));
      box.appendChild(ui.el('p', 'hint', 'The field is computed in 3D. XY at z = 0 is the plane of the ring; YZ at x = 0 cuts through the axis. Move the offset to leave the plane of the ring. The box is 1 m square, so the ring radius is limited to 0.45 m.'));
    } else {
      box.appendChild(ui.lead(shell, 'Two conducting rods in cross-section: the exact two-line-charge field.'));
      const r1 = ui.el('div', 'row');
      r1.appendChild(ui.field('Half separation d (m)', ui.number(this.d, { min: 0.05, max: 0.9, onChange: (v) => { this.d = v; re(); } })));
      r1.appendChild(ui.field('Rod radius a (m)', ui.number(this.a, { min: 0.01, max: 0.5, onChange: (v) => { this.a = Math.min(v, this.d - 0.01); re(); } })));
      box.appendChild(r1);
      box.appendChild(ui.field('Line charge λ (C/m)', ui.number(this.lam, { onChange: (v) => { this.lam = v; re(); } })));
      const vRod = this.rodPotential();
      const p = ui.el('p', 'hint');
      p.textContent = `Rod surface potentials ±${vRod.toPrecision(4)} V (reference V = 0 at x = 0). Capacitance per unit length between the rods: ${(this.lam / (2 * vRod)).toExponential(3)} F/m = πε₀ / acosh(d/a). The thin-wire approximation πε₀ / ln(2d/a) gives ${(Math.PI * EPS0 / Math.log(2 * this.d / this.a)).toExponential(3)} F/m.`;
      box.appendChild(p);
      box.appendChild(ui.el('p', 'hint', 'Use this as the cutline comparison for your own solver: set the rod potentials to ±V shown here and compare V and E along the x-axis.'));
    }
  },

  // ------------------------------------------------------------ model

  ringCharges() { return ringAsPointCharges(this.N, this.q, this.R, [0, 0, 0]); },

  /** 3D field at a point for the ring mode. Returns { E:[3], V, Ed:[3], Ec:[3] } */
  ringField(p) {
    const disc = pointChargesField(this.ringCharges(), p);
    const cont = ringChargeField(this.lambda, this.R, [0, 0, 0], p);
    const f = this.source === 'discrete' ? disc : cont;
    return { E: f.E, V: f.V, Ed: disc.E, Ec: cont.E };
  },

  /**
   * Exact solution for two conducting cylinders of radius a centred at x = +-d: the field
   * outside the rods is that of two line charges +-lambda at x = +-b with b = sqrt(d^2 - a^2)
   * (the images), for which the rod surfaces are exact equipotentials at
   * +-V_rod = (lambda / 2 pi eps0) acosh(d/a). Capacitance per unit length pi eps0 / acosh(d/a).
   */
  imageOffset() { return Math.sqrt(Math.max(this.d * this.d - this.a * this.a, 1e-12)); },

  rodPotential() { return (this.lam / (2 * Math.PI * EPS0)) * Math.acosh(this.d / this.a); },

  rodsField(x, y) {
    const inLeft = Math.hypot(x + this.d, y) <= this.a, inRight = Math.hypot(x - this.d, y) <= this.a;
    if (inLeft || inRight) {
      // Inside a conductor: E = 0, V = the surface value
      return { E: [0, 0], V: inRight ? this.rodPotential() : -this.rodPotential() };
    }
    const b = this.imageOffset();
    const e1 = lineChargeE(this.lam, [b, 0], [x, y]), e2 = lineChargeE(-this.lam, [-b, 0], [x, y]);
    const v = lineChargeV(this.lam, [b, 0], [x, y], 1) + lineChargeV(-this.lam, [-b, 0], [x, y], 1);
    return { E: [e1[0] + e2[0], e1[1] + e2[1]], V: v };
  },

  /** In-plane 2D field function for the current mode, plus V and extras. */
  at(u, v) {
    if (this.mode === 'rods') return this.rodsField(u, v);
    const f = this.ringField(this.cut.point(u, v));
    return { E: this.cut.inPlane(f.E), V: f.V, En: this.cut.normalComp(f.E), diff: Math.hypot(...f.Ed) - Math.hypot(...f.Ec) };
  },

  compute() {
    const ext = this.shell.view.extent;
    const mk = () => new Grid2D(GRID_N, GRID_N, ext);
    this.gridV = mk(); this.gridEx = mk(); this.gridEy = mk();
    const ring = this.mode === 'ring';
    if (ring) { this.gridDiff = mk(); this.gridEn = mk(); }
    // One pass: the ring integral is the expensive part, so evaluate it once per node.
    for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
      const f = this.at(this.gridV.x(i), this.gridV.y(j));
      this.gridV.set(i, j, f.V); this.gridEx.set(i, j, f.E[0]); this.gridEy.set(i, j, f.E[1]);
      if (ring) { this.gridDiff.set(i, j, f.diff); this.gridEn.set(i, j, f.En); }
    }
    this.gridEmag = magnitude(this.gridEx, this.gridEy);
    const pct = (grid, lo, hi) => { const a = Array.from(grid.data).filter(Number.isFinite).sort((x, y) => x - y); return [a[Math.floor(lo * (a.length - 1))], a[Math.floor(hi * (a.length - 1))]]; };
    const sym = ([lo, hi]) => { const m = Math.max(Math.abs(lo), Math.abs(hi)); return [-m, m]; };
    this.vRange = sym(pct(this.gridV, 0.02, 0.98));
    const e = Array.from(this.gridEmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
    this.eRange = [e[Math.floor(0.02 * (e.length - 1))], e[Math.floor(0.98 * (e.length - 1))]];
    if (this.mode === 'ring') { this.dRange = sym(pct(this.gridDiff, 0.02, 0.98)); this.nRange = sym(pct(this.gridEn, 0.02, 0.98)); }
  },

  render(layer, ctx, view, opts) {
    const eFn = (u, v) => this.at(u, v).E;
    switch (layer) {
      case 'V': return drawScalarField(ctx, this.gridV, { map: opts.map, extent: opts.extent, min: opts.min ?? this.vRange[0], max: opts.max ?? this.vRange[1] });
      case 'Emag': return drawScalarField(ctx, this.gridEmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.eRange[0], max: opts.max ?? this.eRange[1] });
      case 'diff': return drawScalarField(ctx, this.gridDiff, { map: opts.map, extent: opts.extent, min: opts.min ?? this.dRange[0], max: opts.max ?? this.dRange[1] });
      case 'En': return drawScalarField(ctx, this.gridEn, { map: opts.map, extent: opts.extent, min: opts.min ?? this.nRange[0], max: opts.max ?? this.nRange[1] });
      case 'E':
        if (opts.style === 'lines') {
          const seeds = [];
          if (this.mode === 'rods') {
            seeds.push(...radialSeeds(this.d, 0, this.a * 1.08, 20), ...radialSeeds(-this.d, 0, this.a * 1.08, 20));
            const stop = (x, y) => Math.hypot(x - this.d, y) < this.a || Math.hypot(x + this.d, y) < this.a;
            drawStreamlines(ctx, view, eFn, seeds, { stopFn: stop });
          } else {
            // seeds on a small circle around the ring's trace in this plane, or around the axis
            if (this.cut.plane === 'xy') seeds.push(...radialSeeds(0, 0, this.R * 1.03, 24), ...radialSeeds(0, 0, this.R * 0.97, 12));
            else { for (let k = 0; k < 16; k++) { const th = (2 * Math.PI * k) / 16; seeds.push([this.R + 0.012 * Math.cos(th), 0.012 * Math.sin(th)], [-this.R + 0.012 * Math.cos(th), 0.012 * Math.sin(th)]); } }
            drawStreamlines(ctx, view, eFn, seeds, { maxSteps: 2000 });
          }
        } else drawQuiver(ctx, view, eFn, { normalize: true });
        return null;
      case 'Veq':
        drawContours(ctx, view, this.gridV, levelsBetween(this.vRange[0], this.vRange[1], 18), { color: 'rgba(0,0,0,0.55)' });
        return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    if (this.mode === 'rods') {
      for (const [x, sign] of [[-this.d, -1], [this.d, 1]]) {
        const [px, py] = view.toPx(x, 0);
        const rPx = this.a / view.scale;
        ctx.save();
        ctx.beginPath(); ctx.arc(px, py, rPx, 0, 2 * Math.PI);
        ctx.fillStyle = sign > 0 ? 'rgba(229,72,77,0.85)' : 'rgba(59,130,246,0.85)';
        ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sign > 0 ? '+λ' : '−λ', px, py);
        ctx.restore();
      }
      return;
    }
    // Ring trace in this plane
    const pl = this.cut.plane, off = this.cut.offset;
    if (pl === 'xy') {
      if (Math.abs(off) < 1e-9) {
        if (this.source === 'discrete') for (const c of this.ringCharges()) drawMarker(ctx, view, c.pos[0], c.pos[1], { radius: this.N > 60 ? 2 : 5, fill: this.q > 0 ? '#e5484d' : '#3b82f6', stroke: '#fff', lineWidth: 1 });
        else { const [cx, cy] = view.toPx(0, 0); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, this.R / view.scale, 0, 2 * Math.PI); ctx.strokeStyle = this.lambda > 0 ? '#e5484d' : '#3b82f6'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
      } else {
        const [cx, cy] = view.toPx(0, 0); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, this.R / view.scale, 0, 2 * Math.PI); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
    } else {
      // The ring crosses an XZ or YZ plane through the axis at two points, u = +-R (if offset within R)
      const w = off; // offset along the normal (y for xz, x for yz)
      if (Math.abs(w) < this.R) {
        const u = Math.sqrt(this.R * this.R - w * w);
        for (const s of [-1, 1]) drawMarker(ctx, view, s * u, 0, { radius: 5, fill: (this.source === 'discrete' ? this.q : this.lambda) > 0 ? '#e5484d' : '#3b82f6', stroke: '#fff', lineWidth: 1 });
      }
    }
  },

  statusText() {
    if (this.mode === 'rods') return `two rods, d = ${this.d} m, a = ${this.a} m`;
    return `${this.source === 'discrete' ? `${this.N} charges of ${this.q} C` : `λ = ${this.lambda} C/m`} on R = ${this.R} m, ${this.cut.plane.toUpperCase()} plane at ${this.cut.def.normal} = ${this.cut.offset}`;
  },

  probe(u, v) {
    const f = this.at(u, v);
    const rows = [
      { label: 'V', value: f.V, unit: 'V' },
      { label: `E${this.shell.tab.axes[0]}`, value: f.E[0], unit: 'V/m' },
      { label: `E${this.shell.tab.axes[1]}`, value: f.E[1], unit: 'V/m' },
      { label: '|E| in plane', value: Math.hypot(f.E[0], f.E[1]), unit: 'V/m' },
    ];
    if (this.mode === 'ring') {
      const p = this.cut.point(u, v);
      const disc = pointChargesField(this.ringCharges(), p), cont = ringChargeField(this.lambda, this.R, [0, 0, 0], p);
      rows.push({ label: `E${this.cut.def.normal} (normal)`, value: f.En, unit: 'V/m' });
      rows.push({ label: '|E| discrete (3D)', value: Math.hypot(...disc.E), unit: 'V/m' });
      rows.push({ label: '|E| continuous (3D)', value: Math.hypot(...cont.E), unit: 'V/m' });
      rows.push({ label: 'V discrete', value: disc.V, unit: 'V' });
      rows.push({ label: 'V continuous', value: cont.V, unit: 'V' });
    }
    return rows;
  },

  getState() {
    const s = {};
    if (this.mode === 'ring') Object.assign(s, { src: this.source, N: this.N, q: this.q, lam: this.lambda, R: this.R, ...this.cut.state() });
    else Object.assign(s, { d: this.d, a: this.a, laml: this.lam });
    return s;
  },

  csv() {
    const g = this.gridV, a = this.shell.tab.axes;
    const lines = [`${a[0]}_m,${a[1]}_m,V_V,E${a[0]}_Vpm,E${a[1]}_Vpm`];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridEx.get(i, j)},${this.gridEy.get(i, j)}`);
    return lines.join('\n');
  },
};
