// Magnetic fields tab (Lab 4).
//   Module 2: up to four line currents along z at (x, y) in +-30 mm, I in +-5 A, probe,
//             Randomize with Reveal.
//   Module 1: N line currents evenly spread across a 30 mm width beside the same width
//             as a continuous sheet current K; drawn in the x-z plane (currents along y),
//             with a difference map.
// Closed form throughout (core/analytic.js). J is the source here, shown as markers.

import { MU0 } from '../../core/constants.js';
import { wiresField, sheetB, sheetAsWiresB, sheetWires } from '../../core/analytic.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween, drawMarker, radialSeeds } from '../../core/render.js';
import { getNum } from '../state.js';
import { ui } from '../shell.js';

const W = 0.03; // half-width of the box and the sheet width (30 mm) per the handout
const EXTENT = [-W, W, -W, W];
const GRID_N = 161;
const DEFAULT_WIRES = [
  { I: 2, x: -0.015, y: 0.015 },   // 1: top left, then counter-clockwise
  { I: -2, x: -0.015, y: -0.015 }, // 2: bottom left
  { I: 1, x: 0.015, y: -0.015 },   // 3: bottom right
  { I: -1, x: 0.015, y: 0.015 },   // 4: top right
];

export default {
  id: 'magnetic-fields',
  title: 'Magnetic fields',
  phase: 1,
  available: true,
  summary: 'Line currents and a sheet current, closed form.',
  extent: EXTENT,
  axes: ['x', 'y'],
  layers: [
    { id: 'Bmag', label: '|B|', kind: 'scalar', unit: 'T', log: true, default: true, eq: 'B' },
    { id: 'Bz', label: 'B normal to plane', kind: 'scalar', unit: 'T', signed: true, eq: 'B', available: false, note: 'zero for these sources' },
    { id: 'Az', label: 'A_z', kind: 'scalar', unit: 'T·m', signed: true, eq: 'A' },
    { id: 'diff', label: 'Discrete − sheet |B|', kind: 'scalar', unit: 'T', signed: true, eq: 'B' },
    { id: 'B', label: 'B field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'Aeq', label: 'A_z contours', kind: 'contour', eq: 'A' },
    { id: 'J', label: 'J (sources)', kind: 'info', note: 'drawn as wire markers' },
  ],

  // state
  module: 2,        // 1: wires vs sheet (x-z plane), 2: four wires (x-y plane)
  n: 4,
  wires: DEFAULT_WIRES.map((w) => ({ ...w })),
  mode: 'set',
  revealed: false,
  guess: '',
  // module 1
  nLines: 5,
  iLine: 1,
  K: 100,           // A/m
  source: 'discrete', // 'discrete' | 'sheet'

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.module = getNum(s, 'm', 2) === 1 ? 1 : 2;
    this.n = Math.min(4, Math.max(1, Math.round(getNum(s, 'n', 4))));
    this.mode = s.mode === 'random' ? 'random' : 'set';
    this.revealed = false;
    for (let k = 0; k < 4; k++) {
      this.wires[k].I = getNum(s, `i${k + 1}`, DEFAULT_WIRES[k].I);
      this.wires[k].x = getNum(s, `x${k + 1}`, DEFAULT_WIRES[k].x);
      this.wires[k].y = getNum(s, `y${k + 1}`, DEFAULT_WIRES[k].y);
    }
    if (this.mode === 'random' && s.i1 === undefined) this.randomize(); // hidden values are kept out of the URL: draw fresh ones
    this.nLines = Math.max(1, Math.round(getNum(s, 'nl', 5)));
    this.iLine = getNum(s, 'il', 1);
    this.K = getNum(s, 'K', 100);
    this.source = s.src === 'sheet' ? 'sheet' : 'discrete';
    this.applyModule();
    this.buildControls();
  },

  applyModule() {
    const shell = this.shell;
    // Module 1 is drawn in the x-z plane with the sheet at z = 0 along x, currents along +y.
    shell.setExtent(EXTENT, this.module === 1 ? ['x', 'z'] : ['x', 'y']);
    const L = (id) => this.layers.find((l) => l.id === id);
    L('diff').available = this.module === 1;
    L('Az').available = this.module === 2;
    L('Aeq').available = this.module === 2;
    if (this.module === 1 && shell.colorLayer === 'Az') shell.colorLayer = 'Bmag';
    if (this.module === 2 && shell.colorLayer === 'diff') shell.colorLayer = 'Bmag';
    if (this.module === 1) shell.layerOn.set('Aeq', false);
    // The sheet itself (z = 0) is singular; keep the default probe just above it.
    if (this.module === 1 && Math.abs(shell.probePt[1]) < 1e-12) { shell.probePt = [shell.probePt[0], 0.01]; shell.$('probe-y').value = '0.01'; }
    shell.refreshLayers();
  },

  buildControls() {
    const shell = this.shell;
    const box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', 'Magnetic fields'));
    box.appendChild(ui.lead(shell, 'Infinite straight currents and a sheet current, closed form.'));
    box.appendChild(ui.field('Module', ui.select([[2, 'Up to four line currents'], [1, 'Line currents vs sheet current']], String(this.module), (v) => {
      this.module = parseInt(v, 10);
      this.applyModule();
      this.buildControls();
      shell.recompute();
      shell.syncUrl();
    })));
    if (this.module === 2) this.buildModule2(box);
    else this.buildModule1(box);
  },

  buildModule2(box) {
    const shell = this.shell;
    const modeRow = ui.el('div', 'row');
    modeRow.appendChild(ui.field('Mode', ui.select([['set', 'Set currents'], ['random', 'Randomize (hidden)']], this.mode, (v) => {
      this.mode = v; this.revealed = false;
      if (v === 'random') this.randomize();
      this.buildControls(); shell.recompute(); shell.syncUrl();
    })));
    modeRow.appendChild(ui.field('Number of wires', ui.select([[1, '1'], [2, '2'], [3, '3'], [4, '4']], String(this.n), (v) => {
      this.n = parseInt(v, 10);
      if (this.mode === 'random') this.randomize();
      this.buildControls(); shell.recompute(); shell.syncUrl();
    })));
    box.appendChild(modeRow);
    const hidden = this.mode === 'random' && !this.revealed;
    const head = ui.el('div', 'source-row');
    head.append(ui.el('span', 'idx', ''), ui.el('span', 'hint', 'I (A)'), ui.el('span', 'hint', 'x (m)'), ui.el('span', 'hint', 'y (m)'));
    box.appendChild(head);
    for (let k = 0; k < this.n; k++) {
      const w = this.wires[k];
      const row = ui.el('div', 'source-row' + (hidden ? ' hidden-values' : ''));
      row.appendChild(ui.el('span', 'idx', String(k + 1)));
      const mk = (key, min, max, hide) => {
        const inp = ui.number(hide ? '' : w[key], { min, max, onChange: (v) => { w[key] = v; shell.recompute(); shell.syncUrl(); } });
        if (hide) { inp.disabled = true; inp.value = '?'; }
        return inp;
      };
      // Per the handout, in randomize mode the locations stay visible; only the currents are hidden.
      row.append(mk('I', -5, 5, hidden), mk('x', -W, W, false), mk('y', -W, W, false));
      box.appendChild(row);
    }
    box.appendChild(ui.el('p', 'hint', 'Wire 1 is top left, numbered counter-clockwise. Current flows along +z for I > 0.'));
    if (this.mode === 'random') {
      box.appendChild(ui.button('Randomize currents', () => { this.randomize(); this.revealed = false; this.buildControls(); shell.recompute(); shell.syncUrl(); }, 'btn btn-primary'));
      box.appendChild(ui.el('p', 'hint', 'Use the probe (Bx, By) at several points to infer the sign and magnitude of each current. Write your answer, then reveal.'));
      const guess = document.createElement('input');
      guess.type = 'text'; guess.placeholder = 'e.g. I1 = +2.1 A, I2 = -0.8 A, ...'; guess.value = this.guess;
      guess.addEventListener('input', () => { this.guess = guess.value; reveal.disabled = guess.value.trim().length < 3; });
      box.appendChild(ui.field('Your answer', guess));
      const reveal = ui.button(this.revealed ? 'Revealed' : 'Reveal actual values', () => { this.revealed = true; this.buildControls(); shell.redraw(); shell.syncUrl(); }, 'btn');
      reveal.disabled = this.revealed || this.guess.trim().length < 3;
      box.appendChild(reveal);
      if (this.revealed) {
        const t = ui.el('table', 'probe-table'); const tb = document.createElement('tbody');
        for (let k = 0; k < this.n; k++) {
          const w = this.wires[k]; const tr = document.createElement('tr');
          tr.innerHTML = `<td>I${k + 1}</td><td>${w.I.toFixed(3)} A at (${(w.x * 1e3).toFixed(1)}, ${(w.y * 1e3).toFixed(1)}) mm</td>`;
          tb.appendChild(tr);
        }
        t.appendChild(tb); box.appendChild(t);
      }
    }
    box.appendChild(ui.el('p', 'hint', 'Bonus: switch the colour map to A_z or turn on A_z contours; B = ∇×A, so the contours of A_z are the B field lines.'));
  },

  buildModule1(box) {
    const shell = this.shell;
    box.appendChild(ui.el('p', 'lead', 'A sheet of width 30 mm in the plane z = 0 carrying K (A/m) along +y, beside the same width populated by N line currents of I each. Shown in the x–z plane.'));
    box.appendChild(ui.field('Show', ui.select([['discrete', 'Discrete line currents'], ['sheet', 'Continuous sheet current']], this.source, (v) => { this.source = v; shell.recompute(); shell.syncUrl(); })));
    const r1 = ui.el('div', 'row');
    r1.appendChild(ui.field('Number of line currents N', ui.number(this.nLines, { min: 1, max: 400, onChange: (v) => { this.nLines = Math.round(v); shell.recompute(); shell.syncUrl(); } })));
    r1.appendChild(ui.field('Line current I (A)', ui.number(this.iLine, { min: -50, max: 50, onChange: (v) => { this.iLine = v; shell.recompute(); shell.syncUrl(); } })));
    box.appendChild(r1);
    box.appendChild(ui.field('Sheet current density K (A/m)', ui.number(this.K, { min: -1e4, max: 1e4, onChange: (v) => { this.K = v; shell.recompute(); shell.syncUrl(); } })));
    const eq = ui.el('p', 'hint');
    eq.textContent = `Equivalent sheet for these lines: K = N·I / w = ${(this.nLines * this.iLine / (2 * W)).toFixed(2)} A/m. Equivalent line current for this sheet: I = K·w / N = ${(this.K * 2 * W / this.nLines).toFixed(4)} A.`;
    box.appendChild(eq);
    box.appendChild(ui.el('p', 'hint', 'The probe reports B for both the discrete and the continuous case at the same point, as the COMSOL app did. The "Discrete − sheet" colour map shows where the two differ.'));
  },

  randomize() {
    const rnd = (lo, hi, dp) => Math.round((lo + Math.random() * (hi - lo)) * 10 ** dp) / 10 ** dp;
    for (let k = 0; k < 4; k++) {
      let I = rnd(-5, 5, 2);
      if (Math.abs(I) < 0.3) I = I < 0 ? -0.3 : 0.3;
      this.wires[k].I = I;
      this.wires[k].x = rnd(-0.025, 0.025, 4);
      this.wires[k].y = rnd(-0.025, 0.025, 4);
    }
  },

  // ------------------------------------------------------------ model

  activeWires() { return this.wires.slice(0, this.n).map((w) => ({ I: w.I, pos: [w.x, w.y] })); },

  /** B and A at a point in the current module's plane. Returns { B: [bu, bv], Az, Bsheet?, Bdisc? } */
  field(u, v) {
    if (this.module === 2) return wiresField(this.activeWires(), [u, v], W);
    const disc = sheetAsWiresB(this.nLines, this.iLine, 2 * W, u, v);
    const sheet = sheetB(this.K, 2 * W, u, v);
    const B = this.source === 'sheet' ? sheet : disc;
    return { B, Az: NaN, Bdisc: disc, Bsheet: sheet };
  },

  compute() {
    const f = (u, v) => this.field(u, v);
    this.gridBx = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (u, v) => f(u, v).B[0]);
    this.gridBy = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (u, v) => f(u, v).B[1]);
    this.gridBmag = magnitude(this.gridBx, this.gridBy);
    if (this.module === 2) {
      this.gridAz = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (u, v) => f(u, v).Az);
      const a = Array.from(this.gridAz.data).filter(Number.isFinite).sort((x, y) => x - y);
      const m = Math.max(Math.abs(a[Math.floor(0.02 * a.length)]), Math.abs(a[Math.floor(0.98 * a.length)]));
      this.aRange = [-m, m];
    } else {
      this.gridDiff = Grid2D.fromFunction(GRID_N, GRID_N, EXTENT, (u, v) => { const r = f(u, v); return Math.hypot(...r.Bdisc) - Math.hypot(...r.Bsheet); });
      const d = Array.from(this.gridDiff.data).filter(Number.isFinite).sort((x, y) => x - y);
      const m = Math.max(Math.abs(d[Math.floor(0.02 * d.length)]), Math.abs(d[Math.floor(0.98 * d.length)]));
      this.dRange = [-m, m];
    }
    const b = Array.from(this.gridBmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
    this.bRange = [b[Math.floor(0.02 * (b.length - 1))], b[Math.floor(0.98 * (b.length - 1))]];
  },

  render(layer, ctx, view, opts) {
    const bFn = (u, v) => this.field(u, v).B;
    switch (layer) {
      case 'Bmag':
        return drawScalarField(ctx, this.gridBmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.bRange[0], max: opts.max ?? this.bRange[1] });
      case 'Az':
        return drawScalarField(ctx, this.gridAz, { map: opts.map, extent: opts.extent, min: opts.min ?? this.aRange[0], max: opts.max ?? this.aRange[1] });
      case 'diff':
        return drawScalarField(ctx, this.gridDiff, { map: opts.map, extent: opts.extent, min: opts.min ?? this.dRange[0], max: opts.max ?? this.dRange[1] });
      case 'B':
        if (opts.style === 'lines') {
          const seeds = [];
          if (this.module === 2) {
            // B lines close around each wire, so seed along a radius from each wire at
            // geometrically spaced distances; every seed starts one closed loop.
            for (const w of this.activeWires()) for (let r = 0.0015; r < 0.02; r *= 1.45) seeds.push([w.pos[0] + r, w.pos[1] + r * 0.3]);
            // plus a few seeds on the box edges so lines fill the far field
            for (let k = 1; k < 6; k++) seeds.push([EXTENT[0] + 1e-4, EXTENT[2] + (k / 6) * 2 * W], [EXTENT[1] - 1e-4, EXTENT[2] + (k / 6) * 2 * W]);
          } else {
            for (let k = 0; k < 14; k++) { const z = -W + ((k + 0.5) / 14) * 2 * W; if (Math.abs(z) > 1e-3) seeds.push([0, z]); }
            for (let k = 1; k < 6; k++) seeds.push([-W + (k / 6) * 2 * W, W * 0.9], [-W + (k / 6) * 2 * W, -W * 0.9]);
          }
          const stop = (u, v) => this.module === 2 && this.activeWires().some((w) => Math.hypot(u - w.pos[0], v - w.pos[1]) < 0.001);
          drawStreamlines(ctx, view, bFn, seeds, { stopFn: stop, maxSteps: 2500 });
        } else {
          drawQuiver(ctx, view, bFn, { normalize: true });
        }
        return null;
      case 'Aeq':
        if (this.gridAz) drawContours(ctx, view, this.gridAz, levelsBetween(this.aRange[0], this.aRange[1], 24), { color: 'rgba(0,0,0,0.6)' });
        return null;
      default:
        return null;
    }
  },

  drawOverlay(ctx, view) {
    if (this.module === 2) {
      const hidden = this.mode === 'random' && !this.revealed;
      this.activeWires().forEach((w, k) => {
        // Conventional dot (out of page, +z) and cross (into page) markers
        drawMarker(ctx, view, w.pos[0], w.pos[1], {
          radius: 9, fill: hidden ? '#888' : w.I > 0 ? '#f5a623' : '#7b61ff', stroke: '#fff',
          label: hidden ? String(k + 1) : w.I > 0 ? '•' : '×', labelColor: '#fff', fontSize: 14,
        });
      });
    } else {
      // Sheet: a bar along x at z = 0; discrete: N dots along it (current along +y, out of the x-z page)
      const [x0, z0] = view.toPx(-W, 0), [x1] = view.toPx(W, 0);
      ctx.save();
      if (this.source === 'sheet') {
        ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x0, z0); ctx.lineTo(x1, z0); ctx.stroke();
      } else {
        for (const w of sheetWires(this.nLines, this.iLine, 2 * W)) {
          drawMarker(ctx, view, w.pos[0], 0, { radius: this.nLines > 40 ? 2 : 4, fill: '#f5a623', stroke: '#fff', lineWidth: 1 });
        }
      }
      ctx.restore();
    }
  },

  statusText() {
    if (this.module === 2) return `${this.n} wire${this.n > 1 ? 's' : ''}, ${this.mode === 'random' ? 'hidden' : 'set'} mode`;
    return `${this.source === 'sheet' ? `sheet K = ${this.K} A/m` : `${this.nLines} lines of ${this.iLine} A`} across 30 mm`;
  },

  probe(u, v) {
    if (this.module === 2) {
      const f = this.field(u, v);
      return [
        { label: 'Bx', value: f.B[0], unit: 'T' },
        { label: 'By', value: f.B[1], unit: 'T' },
        { label: '|B|', value: Math.hypot(f.B[0], f.B[1]), unit: 'T' },
        { label: 'angle of B', value: (Math.atan2(f.B[1], f.B[0]) * 180) / Math.PI, unit: 'deg' },
        { label: 'A_z', value: f.Az, unit: 'T·m', note: 'Zero at r = 30 mm from each wire.' },
        { label: '|B| (grid interp.)', value: this.gridBmag.sample(u, v), unit: 'T' },
      ];
    }
    const f = this.field(u, v);
    return [
      { label: 'Bx discrete', value: f.Bdisc[0], unit: 'T' },
      { label: 'Bz discrete', value: f.Bdisc[1], unit: 'T' },
      { label: '|B| discrete', value: Math.hypot(...f.Bdisc), unit: 'T' },
      { label: 'Bx sheet', value: f.Bsheet[0], unit: 'T' },
      { label: 'Bz sheet', value: f.Bsheet[1], unit: 'T' },
      { label: '|B| sheet', value: Math.hypot(...f.Bsheet), unit: 'T' },
      { label: 'μ₀K/2 (infinite sheet)', value: MU0 * this.K / 2, unit: 'T' },
    ];
  },

  getState() {
    const s = { m: this.module };
    if (this.module === 2) {
      s.n = this.n; s.mode = this.mode;
      for (let k = 0; k < 4; k++) {
        s[`x${k + 1}`] = this.wires[k].x; s[`y${k + 1}`] = this.wires[k].y;
        if (this.mode !== 'random' || this.revealed) s[`i${k + 1}`] = this.wires[k].I;
      }
    } else {
      s.nl = this.nLines; s.il = this.iLine; s.K = this.K; s.src = this.source;
    }
    return s;
  },

  csv() {
    const g = this.gridBx, a = this.shell.tab.axes;
    const lines = [`${a[0]}_m,${a[1]}_m,B${a[0]}_T,B${a[1]}_T,Bmag_T${this.gridAz ? ',Az_Tm' : ''}`];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      lines.push(`${g.x(i)},${g.y(j)},${g.get(i, j)},${this.gridBy.get(i, j)},${this.gridBmag.get(i, j)}${this.gridAz ? ',' + this.gridAz.get(i, j) : ''}`);
    }
    return lines.join('\n');
  },
};
