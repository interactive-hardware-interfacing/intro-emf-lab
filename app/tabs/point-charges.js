// Point charges tab: 1 to 4 charges in the Lab 1 Module 2 box (0 to 0.5 m), closed-form
// E and V, probe, and a Randomize mode with a Reveal button. Everything here is exact
// superposition; the colour map is sampled on a grid only for drawing.

import { pointChargesField } from '../../core/analytic.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween, drawMarker, radialSeeds } from '../../core/render.js';
import { CutPlane } from '../cutplane.js';
import { getNum } from '../state.js';
import { ui } from '../shell.js';

const EXTENT = [0, 0.5, 0, 0.5];
// Charges sit in the z = 0 plane; XZ and YZ cuts show z from -0.25 to 0.25.
const EXTENTS = { xy: EXTENT, xz: [0, 0.5, -0.25, 0.25], yz: [0, 0.5, -0.25, 0.25] };
const GRID_N = 161;
const DEFAULTS = [
  { q: 2, x: 0.2, y: 0.3 },
  { q: -2, x: 0.3, y: 0.2 },
  { q: 1, x: 0.15, y: 0.15 },
  { q: -1, x: 0.35, y: 0.35 },
];

export default {
  id: 'point-charges',
  title: 'Point charges',
  phase: 1,
  available: true,
  summary: 'Coulomb superposition for up to four charges. Lab 1 Module 2 and bonus.',
  extent: EXTENT,
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', signed: true, default: true },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour', eq: 'V', default: false },
    { id: 'D', label: 'D field', kind: 'vector', styles: ['arrows'], note: 'same direction as E, scaled by eps0' },
    { id: 'J', label: 'J', kind: 'info', available: false, note: 'J = 0 here' },
  ],

  // ------------------------------------------------------------ state
  n: 4,
  charges: DEFAULTS.map((c) => ({ ...c })),
  mode: 'set',       // 'set' | 'random'
  revealed: false,
  guess: '',

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.n = Math.min(4, Math.max(1, Math.round(getNum(s, 'n', 4))));
    this.mode = s.mode === 'random' ? 'random' : 'set';
    this.revealed = false;
    for (let k = 0; k < 4; k++) {
      const c = this.charges[k];
      c.q = getNum(s, `q${k + 1}`, DEFAULTS[k].q);
      c.x = getNum(s, `x${k + 1}`, DEFAULTS[k].x);
      c.y = getNum(s, `y${k + 1}`, DEFAULTS[k].y);
    }
    this.cut = new CutPlane({ plane: s.plane ?? 'xy', offset: getNum(s, 'off', 0), range: [-0.25, 0.25], extents: EXTENTS });
    this.applyCut();
    this.buildControls();
  },

  applyCut() {
    this.cut.range = this.cut.plane === 'xy' ? [-0.25, 0.25] : [0, 0.5];
    this.shell.setExtent(this.cut.extent, this.cut.axes);
  },

  buildControls() {
    const shell = this.shell;
    const box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Point charges'));
    box.appendChild(ui.el('p', 'lead', 'Up to four point charges in a 0.5 m square. Fields are exact Coulomb superposition; the colour map is sampled on a 161 x 161 grid for display only.'));

    const modeRow = ui.el('div', 'row');
    modeRow.appendChild(ui.field('Mode', ui.select([['set', 'Set charges'], ['random', 'Randomize (hidden)']], this.mode, (v) => {
      this.mode = v;
      this.revealed = false;
      if (v === 'random') this.randomize();
      this.buildControls();
      shell.recompute();
      shell.syncUrl();
    })));
    modeRow.appendChild(ui.field('Number of charges', ui.select([[1, '1'], [2, '2'], [3, '3'], [4, '4']], String(this.n), (v) => {
      this.n = parseInt(v, 10);
      if (this.mode === 'random') this.randomize();
      this.buildControls();
      shell.recompute();
      shell.syncUrl();
    })));
    box.appendChild(modeRow);

    const hidden = this.mode === 'random' && !this.revealed;
    const head = ui.el('div', 'source-row');
    head.append(ui.el('span', 'idx', ''), ui.el('span', 'hint', 'q (C)'), ui.el('span', 'hint', 'x (m)'), ui.el('span', 'hint', 'y (m)'));
    box.appendChild(head);
    for (let k = 0; k < this.n; k++) {
      const c = this.charges[k];
      const row = ui.el('div', 'source-row' + (hidden ? ' hidden-values' : ''));
      row.appendChild(ui.el('span', 'idx', String(k + 1)));
      const mk = (key, min, max) => {
        const inp = ui.number(hidden ? '' : c[key], { min, max, onChange: (v) => { c[key] = v; shell.recompute(); shell.syncUrl(); } });
        if (hidden) { inp.disabled = true; inp.value = '?'; }
        return inp;
      };
      row.append(mk('q', -5, 5), mk('x', 0.1, 0.4), mk('y', 0.1, 0.4));
      box.appendChild(row);
    }
    box.appendChild(ui.el('p', 'hint', 'Positions 0.1 to 0.4 m, charge -5 to +5 C, as in the Lab 1 handout.'));

    if (this.mode === 'random') {
      const r = ui.el('div', 'row');
      r.appendChild(ui.button('Randomize charges and positions', () => { this.randomize(); this.revealed = false; this.buildControls(); shell.recompute(); shell.syncUrl(); }, 'btn btn-primary'));
      box.appendChild(r);
      box.appendChild(ui.el('p', 'hint', 'Use the probe (E and V readouts) to infer the sign and magnitude of each charge. Write your answer below, then reveal.'));
      const guess = document.createElement('input');
      guess.type = 'text';
      guess.placeholder = 'e.g. q1 = +2.1 C, q2 = -0.8 C, ...';
      guess.value = this.guess;
      guess.addEventListener('input', () => { this.guess = guess.value; reveal.disabled = guess.value.trim().length < 3; });
      box.appendChild(ui.field('Your answer', guess));
      const reveal = ui.button(this.revealed ? 'Revealed' : 'Reveal actual values', () => {
        this.revealed = true;
        this.buildControls();
        shell.redraw();
      }, 'btn');
      reveal.disabled = this.revealed || this.guess.trim().length < 3;
      box.appendChild(reveal);
      if (this.revealed) {
        const t = ui.el('table', 'probe-table');
        const tb = document.createElement('tbody');
        for (let k = 0; k < this.n; k++) {
          const c = this.charges[k];
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>q${k + 1}</td><td>${c.q.toFixed(3)} C at (${c.x.toFixed(3)}, ${c.y.toFixed(3)}) m</td>`;
          tb.appendChild(tr);
        }
        t.appendChild(tb);
        box.appendChild(t);
        box.appendChild(ui.el('p', 'hint', 'Record these with your answer in the report. The share link reproduces this exact configuration.'));
      }
    }

    box.appendChild(ui.el('h2', '', 'View'));
    box.appendChild(this.cut.controls((what) => {
      if (what === 'plane') { this.cut.offset = 0; this.applyCut(); this.buildControls(); }
      shell.recompute(); shell.syncUrl();
    }));
    box.appendChild(ui.el('p', 'hint', 'The field is computed in 3D; the plane is only what is drawn. XY at z = 0 is the plane of the charges (the COMSOL view). Lab 1 asks for XY and YZ cuts.'));
  },

  randomize() {
    const rnd = (lo, hi, dp) => Math.round((lo + Math.random() * (hi - lo)) * 10 ** dp) / 10 ** dp;
    for (let k = 0; k < 4; k++) {
      let q = rnd(-5, 5, 2);
      if (Math.abs(q) < 0.3) q = q < 0 ? -0.3 : 0.3; // avoid near-zero charges that are unguessable
      this.charges[k] = { q, x: rnd(0.1, 0.4, 3), y: rnd(0.1, 0.4, 3) };
    }
  },

  // ------------------------------------------------------------ model

  active() { return this.charges.slice(0, this.n).map((c) => ({ q: c.q, pos: [c.x, c.y, 0] })); },

  /** 3D field at a canvas point (u, v) of the current cut plane: { E:[in-plane], En, V, E3 } */
  field(u, v) {
    const f = pointChargesField(this.active(), this.cut.point(u, v));
    return { E: this.cut.inPlane(f.E), En: this.cut.normalComp(f.E), V: f.V, E3: f.E };
  },

  compute() {
    const ext = this.cut.extent;
    this.gridV = Grid2D.fromFunction(GRID_N, GRID_N, ext, (u, v) => this.field(u, v).V);
    this.gridEx = Grid2D.fromFunction(GRID_N, GRID_N, ext, (u, v) => this.field(u, v).E[0]);
    this.gridEy = Grid2D.fromFunction(GRID_N, GRID_N, ext, (u, v) => this.field(u, v).E[1]);
    this.gridEmag = magnitude(this.gridEx, this.gridEy);
    // Clip the V colour range to a robust percentile so singularities don't wash out the map
    const vals = Array.from(this.gridV.data).filter(Number.isFinite).sort((a, b) => a - b);
    const p = (f) => vals[Math.floor(f * (vals.length - 1))];
    this.vRange = [p(0.02), p(0.98)];
    const m = Math.max(Math.abs(this.vRange[0]), Math.abs(this.vRange[1]));
    this.vRange = [-m, m];
    const e = Array.from(this.gridEmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    this.eRange = [e[Math.floor(0.02 * (e.length - 1))], e[Math.floor(0.98 * (e.length - 1))]];
  },

  render(layer, ctx, view, opts) {
    const eFn = (u, v) => this.field(u, v).E;
    const inPlane = this.cut.plane === 'xy' && Math.abs(this.cut.offset) < 1e-9;
    switch (layer) {
      case 'V':
        return drawScalarField(ctx, this.gridV, { map: opts.map, min: opts.min ?? this.vRange[0], max: opts.max ?? this.vRange[1] });
      case 'Emag':
        return drawScalarField(ctx, this.gridEmag, { map: opts.map, log: true, min: opts.min ?? this.eRange[0], max: opts.max ?? this.eRange[1] });
      case 'E':
      case 'D':
        if (opts.style === 'lines') {
          const seeds = [];
          if (inPlane) for (const c of this.active()) seeds.push(...radialSeeds(c.pos[0], c.pos[1], 0.006, 16));
          else { const [u0, u1, v0, v1] = this.cut.extent; for (let k = 1; k < 12; k++) { seeds.push([u0 + (k / 12) * (u1 - u0), v0 + 1e-4], [u0 + (k / 12) * (u1 - u0), v1 - 1e-4], [u0 + 1e-4, v0 + (k / 12) * (v1 - v0)], [u1 - 1e-4, v0 + (k / 12) * (v1 - v0)]); } }
          const stop = (x, y) => inPlane && this.active().some((c) => Math.hypot(x - c.pos[0], y - c.pos[1]) < 0.005);
          drawStreamlines(ctx, view, eFn, seeds, { stopFn: stop, color: layer === 'D' ? 'rgba(255,220,120,0.8)' : 'rgba(255,255,255,0.8)' });
        } else {
          drawQuiver(ctx, view, eFn, { normalize: true, color: layer === 'D' ? 'rgba(255,220,120,0.9)' : 'rgba(255,255,255,0.9)' });
        }
        return null;
      case 'Veq':
        drawContours(ctx, view, this.gridV, levelsBetween(this.vRange[0], this.vRange[1], 18), { color: 'rgba(0,0,0,0.55)', lineWidth: 1 });
        return null;
      default:
        return null;
    }
  },

  drawOverlay(ctx, view) {
    const hidden = this.mode === 'random' && !this.revealed;
    // Charges live at z = 0. In XY they are points (dashed if the plane is offset); in XZ/YZ
    // each charge appears where it projects onto the plane, at v = 0.
    this.active().forEach((c, k) => {
      let u, v;
      if (this.cut.plane === 'xy') { u = c.pos[0]; v = c.pos[1]; }
      else if (this.cut.plane === 'xz') { u = c.pos[0]; v = 0; if (Math.abs(c.pos[1] - this.cut.offset) > 0.03) return; }
      else { u = c.pos[1]; v = 0; if (Math.abs(c.pos[0] - this.cut.offset) > 0.03) return; }
      drawMarker(ctx, view, u, v, {
        radius: 9,
        fill: hidden ? '#888' : c.q > 0 ? '#e5484d' : '#3b82f6',
        stroke: '#fff',
        label: hidden ? String(k + 1) : c.q > 0 ? '+' : '−',
        labelColor: '#fff',
        fontSize: 13,
      });
    });
  },

  statusText() {
    return `${this.n} charge${this.n > 1 ? 's' : ''}, ${this.mode === 'random' ? 'hidden' : 'set'} mode`;
  },

  probe(u, v) {
    const f = this.field(u, v);
    const vg = this.gridV.sample(u, v);
    const [a0, a1] = this.cut.axes;
    return [
      { label: 'V (exact)', value: f.V, unit: 'V' },
      { label: 'V (grid interp.)', value: vg, unit: 'V', note: 'Bilinear interpolation of the 161x161 display grid; compare with the exact value to see discretisation error.' },
      { label: 'Ex', value: f.E3[0], unit: 'V/m' },
      { label: 'Ey', value: f.E3[1], unit: 'V/m' },
      { label: 'Ez', value: f.E3[2], unit: 'V/m' },
      { label: '|E|', value: Math.hypot(...f.E3), unit: 'V/m' },
      { label: `angle of E in ${a0}${a1}`, value: (Math.atan2(f.E[1], f.E[0]) * 180) / Math.PI, unit: 'deg' },
    ];
  },

  getState() {
    const s = { n: this.n, mode: this.mode, ...this.cut.state() };
    // In random mode the values are deliberately kept out of the URL until revealed, so a
    // shared link doesn't leak the answer; after reveal they are included so the view is reproducible.
    if (this.mode !== 'random' || this.revealed) {
      for (let k = 0; k < 4; k++) {
        s[`q${k + 1}`] = this.charges[k].q;
        s[`x${k + 1}`] = this.charges[k].x;
        s[`y${k + 1}`] = this.charges[k].y;
      }
    }
    return s;
  },

  csv() {
    const [a0, a1] = this.cut.axes;
    const lines = [`${a0}_m,${a1}_m,V_V,E${a0}_Vpm,E${a1}_Vpm`];
    const g = this.gridV;
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridEx.get(i, j)},${this.gridEy.get(i, j)}`);
    }
    return lines.join('\n');
  },
};
