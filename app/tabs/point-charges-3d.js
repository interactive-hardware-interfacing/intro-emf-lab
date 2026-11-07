// 3D point charges: up to four charges anywhere in a box, drawn in true 3D with an
// orbitable orthographic camera. Three movable cut planes (XY, XZ, YZ) are painted with the
// chosen colour layer (V or |E|), field lines are traced in 3D from each charge, and the
// charges are drawn as spheres. Pure canvas 2D: each axis-aligned cut plane projects to a
// parallelogram, so its image is drawn with one affine transform.

import { pointChargesField } from '../../core/analytic.js';
import { Grid2D } from '../../core/grid.js';
import { camera, depthOf, drawPlane, drawBoxOutline, drawChargeSphere, drawFieldLines3d, bindOrbit } from '../scene3d.js';
import { getNum } from '../state.js';
import { ui } from '../shell.js';
import { plotView } from '../views.js';

const BOX = { x: [0, 0.5], y: [0, 0.5], z: [-0.25, 0.25] };
const DEFAULTS = [
  { q: 2, x: 0.2, y: 0.3, z: 0.05 },
  { q: -2, x: 0.3, y: 0.2, z: -0.05 },
  { q: 1, x: 0.15, y: 0.15, z: 0.1 },
  { q: -1, x: 0.35, y: 0.35, z: -0.1 },
];
const PLANE_N = 97;

export default {
  id: 'point-charges-3d',
  title: '3D point charges',
  phase: 5,
  available: true,
  hideField: true,
  summary: 'Up to four point charges in a box, in true 3D: cut planes, field lines, an orbitable view.',
  extent: [0, 0.5, 0, 0.5],
  axes: ['x', 'y'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', signed: true, default: true },
    { id: 'Emag', label: '|E|', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'lines', label: 'E field lines (3D)', kind: 'contour', eq: 'E', default: true },
    { id: 'pxy', label: 'XY cut plane', kind: 'contour', eq: 'V', default: true },
    { id: 'pxz', label: 'XZ cut plane', kind: 'contour', eq: 'V', default: false },
    { id: 'pyz', label: 'YZ cut plane', kind: 'contour', eq: 'V', default: false },
    { id: 'box', label: 'Box outline', kind: 'contour', default: true },
  ],

  n: 4,
  charges: DEFAULTS.map((c) => ({ ...c })),
  cut: { z: 0, y: 0.25, x: 0.25 },
  cam: { az: 0.6, el: 0.5 },
  density: 10,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.n = Math.min(4, Math.max(1, Math.round(getNum(s, 'n', 4))));
    this.charges = DEFAULTS.map((c) => ({ ...c }));
    for (let k = 0; k < 4; k++) for (const key of ['q', 'x', 'y', 'z']) this.charges[k][key] = getNum(s, `${key}${k + 1}`, DEFAULTS[k][key]);
    this.cut = { z: getNum(s, 'cz', 0), y: getNum(s, 'cy', 0.25), x: getNum(s, 'cx', 0.25) };
    this.cam = { az: getNum(s, 'az', 0.6), el: getNum(s, 'el', 0.5) };
    this.density = Math.round(getNum(s, 'dens', 10));
    this.views = [plotView('3d', '3D view', (ctx, w, h) => this.draw3d(ctx, w, h), {
      footer: true,
      controls: (ctl, inst) => {
        ctl.append(ui.el('span', '', 'Orbit:'));
        ctl.appendChild(ui.range(this.cam.az, { min: -3.14, max: 3.14, step: 0.01, ariaLabel: 'orbit (azimuth)', onInput: (v) => { this.cam.az = v; inst.update(); this.queueUrl(); } }));
        ctl.append(ui.el('span', '', 'Tilt:'));
        ctl.appendChild(ui.range(this.cam.el, { min: 0, max: 1.5, step: 0.01, ariaLabel: 'tilt (elevation)', onInput: (v) => { this.cam.el = v; inst.update(); this.queueUrl(); } }));
        ctl.append(ui.el('span', '', 'Field lines per charge:'));
        ctl.appendChild(ui.range(this.density, { min: 0, max: 30, step: 1, ariaLabel: 'field lines per charge', onInput: (v) => { this.density = v; inst.update(); this.queueUrl(); } }));
        ctl.append(ui.el('span', '', 'Drag on the picture to orbit.'));
      },
    })];
    this.buildControls();
  },

  queueUrl() { clearTimeout(this.urlT); this.urlT = setTimeout(() => this.shell.syncUrl(), 300); },

  active() { return this.charges.slice(0, this.n).map((c) => ({ q: c.q, pos: [c.x, c.y, c.z] })); },
  field(p) { return pointChargesField(this.active(), p); },

  compute() {
    // Colour range shared by the three planes: percentiles of the chosen quantity on them.
    const id = this.shell.colorLayer;
    const vals = [];
    const sample = (fn) => { for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) { const v = fn(i / 39, j / 39); if (Number.isFinite(v) && (id !== 'Emag' || v > 0)) vals.push(v); } };
    const q = (p) => (id === 'Emag' ? Math.hypot(...this.field(p).E) : this.field(p).V);
    const [x0, x1] = BOX.x, [y0, y1] = BOX.y, [z0, z1] = BOX.z;
    sample((a, b) => q([x0 + a * (x1 - x0), y0 + b * (y1 - y0), this.cut.z]));
    sample((a, b) => q([x0 + a * (x1 - x0), this.cut.y, z0 + b * (z1 - z0)]));
    sample((a, b) => q([this.cut.x, y0 + a * (y1 - y0), z0 + b * (z1 - z0)]));
    vals.sort((a, b) => a - b);
    const pct = (f) => vals[Math.floor(f * (vals.length - 1))];
    if (id === 'Emag') this.range = [pct(0.03), pct(0.97)];
    else { const m = Math.max(Math.abs(pct(0.02)), Math.abs(pct(0.98))); this.range = [-m, m]; }
  },

  render() { return null; },

  // ------------------------------------------------------------ 3D drawing

  camera(w, h) { return camera(w, h, { center: [0.25, 0.25, 0], size: 0.75, az: this.cam.az, el: this.cam.el }); },

  draw3d(ctx, w, h) {
    this.compute();
    const { P } = this.camera(w, h);
    const shell = this.shell;
    const id = shell.colorLayer;
    const on = (L) => !!shell.layerOn.get(L);
    const log = id === 'Emag';
    const opts = { map: shell.$('cmap').value, min: parseFloat(shell.$('cmin').value), max: parseFloat(shell.$('cmax').value), log };
    if (!Number.isFinite(opts.min)) opts.min = this.range?.[0];
    if (!Number.isFinite(opts.max)) opts.max = this.range?.[1];
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    const [x0, x1] = BOX.x, [y0, y1] = BOX.y, [z0, z1] = BOX.z;
    const q = (p) => (log ? Math.hypot(...this.field(p).E) : this.field(p).V);

    // Planes: image + world corners (origin, u-axis end, v-axis end), painted far first
    const planes = [];
    if (id && on('pxy')) planes.push({ grid: Grid2D.fromFunction(PLANE_N, PLANE_N, [x0, x1, y0, y1], (x, y) => q([x, y, this.cut.z])), o: [x0, y1, this.cut.z], u: [x1, y1, this.cut.z], v: [x0, y0, this.cut.z], c: [0.25, 0.25, this.cut.z], label: `z = ${this.cut.z.toFixed(3)} m` });
    if (id && on('pxz')) planes.push({ grid: Grid2D.fromFunction(PLANE_N, PLANE_N, [x0, x1, z0, z1], (x, z) => q([x, this.cut.y, z])), o: [x0, this.cut.y, z1], u: [x1, this.cut.y, z1], v: [x0, this.cut.y, z0], c: [0.25, this.cut.y, 0], label: `y = ${this.cut.y.toFixed(3)} m` });
    if (id && on('pyz')) planes.push({ grid: Grid2D.fromFunction(PLANE_N, PLANE_N, [y0, y1, z0, z1], (y, z) => q([this.cut.x, y, z])), o: [this.cut.x, y0, z1], u: [this.cut.x, y1, z1], v: [this.cut.x, y0, z0], c: [this.cut.x, 0.25, 0], label: `x = ${this.cut.x.toFixed(3)} m` });
    for (const pl of planes) pl.depth = depthOf(P, pl.c);
    planes.sort((a, b) => b.depth - a.depth);
    let range = null;
    for (const pl of planes) range = drawPlane(ctx, P, { ...pl, opts });
    const scalar = shell.tab.layers.find((L) => L.id === id);
    if (range && scalar) { shell.drawColorbar({ ...range, layer: scalar }, opts.map); } else shell.drawColorbar(null);

    if (on('box')) drawBoxOutline(ctx, P, BOX);

    if (on('lines') && this.density > 0) {
      const charges = this.active();
      drawFieldLines3d(ctx, P, charges, (p) => this.field(p), {
        density: this.density,
        inside: (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1 && p[2] >= z0 && p[2] <= z1,
        stop: (p) => charges.some((c) => Math.hypot(p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]) < 0.006),
      });
    }

    // Charges as spheres, far first
    const spheres = this.active().map((c, k) => ({ c, k, s: P(...c.pos) })).sort((a, b) => b.s[2] - a.s[2]);
    for (const { c, k, s } of spheres) drawChargeSphere(ctx, s, c.q, k + 1);
    ctx.fillStyle = '#ddd'; ctx.font = '12px system-ui';
    ctx.fillText(`colour = ${scalar?.label ?? 'none'} on the cut planes · field lines leave + and enter −`, 12, h - 10);

    bindOrbit(ctx.canvas, this.cam, () => { this.shell.updateStageView(); this.queueUrl(); });
  },

  // ------------------------------------------------------------ shell hooks

  statusText() { return `${this.n} charge${this.n > 1 ? 's' : ''} in 3D`; },

  probe(x, y) {
    const p = [x, y, this.cut.z];
    const f = this.field(p);
    return [
      { label: 'probe z (XY cut)', value: this.cut.z, unit: 'm', note: 'The probe sits on the XY cut plane; move the plane to change z.' },
      { label: 'V', value: f.V, unit: 'V' },
      { label: 'Ex', value: f.E[0], unit: 'V/m' }, { label: 'Ey', value: f.E[1], unit: 'V/m' }, { label: 'Ez', value: f.E[2], unit: 'V/m' },
      { label: '|E|', value: Math.hypot(...f.E), unit: 'V/m' },
    ];
  },

  getState() {
    const s = { n: this.n, cz: this.cut.z, cy: this.cut.y, cx: this.cut.x, az: this.cam.az, el: this.cam.el, dens: this.density };
    for (let k = 0; k < 4; k++) for (const key of ['q', 'x', 'y', 'z']) s[`${key}${k + 1}`] = this.charges[k][key];
    return s;
  },

  csv() {
    const lines = ['x_m,y_m,z_m,V_V,Ex_Vpm,Ey_Vpm,Ez_Vpm'];
    const N = 41;
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = [BOX.x[0] + (i / (N - 1)) * 0.5, BOX.y[0] + (j / (N - 1)) * 0.5, BOX.z[0] + (k / (N - 1)) * 0.5];
      const f = this.field(p);
      lines.push(`${p[0]},${p[1]},${p[2]},${f.V},${f.E[0]},${f.E[1]},${f.E[2]}`);
    }
    return lines.join('\n');
  },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', '3D point charges'));
    box.appendChild(ui.lead(shell, 'Point charges anywhere in a 0.5 m box, shown in 3D with cut planes and field lines.'));
    const re = () => { shell.recompute(); shell.syncUrl(); };
    box.appendChild(ui.field('Number of charges', ui.select([[1, '1'], [2, '2'], [3, '3'], [4, '4']], String(this.n), (v) => { this.n = parseInt(v, 10); this.buildControls(); re(); })));
    const head = ui.el('div', 'source-row'); head.style.gridTemplateColumns = '22px 1fr 1fr 1fr 1fr';
    head.append(ui.el('span', 'idx', ''), ui.el('span', 'hint', 'q (C)'), ui.el('span', 'hint', 'x (m)'), ui.el('span', 'hint', 'y (m)'), ui.el('span', 'hint', 'z (m)'));
    box.appendChild(head);
    for (let k = 0; k < this.n; k++) {
      const c = this.charges[k];
      const row = ui.el('div', 'source-row'); row.style.gridTemplateColumns = '22px 1fr 1fr 1fr 1fr';
      row.appendChild(ui.el('span', 'idx', String(k + 1)));
      const mk = (key, min, max) => ui.number(c[key], { min, max, ariaLabel: `charge ${k + 1} ${({ q: 'q (C)', x: 'x (m)', y: 'y (m)', z: 'z (m)' })[key]}`, onChange: (v) => { c[key] = v; re(); } });
      row.append(mk('q', -5, 5), mk('x', 0.05, 0.45), mk('y', 0.05, 0.45), mk('z', -0.2, 0.2));
      box.appendChild(row);
    }
    box.appendChild(ui.el('p', 'hint', 'Charges −5 to +5 C; x and y from 0.05 to 0.45 m, z from −0.2 to 0.2 m.'));
    box.appendChild(ui.el('h2', '', 'Cut planes'));
    const slider = (label, key, min, max) => {
      const wrap = ui.el('div', '');
      const lab = ui.el('div', 'hint', `${label}: ${this.cut[key].toFixed(3)} m`);
      const r = ui.range(this.cut[key], { min, max, step: 0.005, ariaLabel: label, onInput: (v) => { this.cut[key] = v; lab.textContent = `${label}: ${v.toFixed(3)} m`; shell.updateStageView(); this.queueUrl(); } });
      r.addEventListener('change', () => { shell.recompute(); });
      wrap.append(lab, r);
      return wrap;
    };
    box.append(slider('XY plane at z', 'z', BOX.z[0], BOX.z[1]), slider('XZ plane at y', 'y', BOX.y[0], BOX.y[1]), slider('YZ plane at x', 'x', BOX.x[0], BOX.x[1]));
    box.appendChild(ui.el('p', 'hint', 'Switch planes on and off in the Layers panel on the right; the colour map (V or |E|) applies to all of them with one shared scale. The probe reads values on the XY plane at the x, y you enter.'));
  },
};
