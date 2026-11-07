// Gauss's law: up to four point charges and a closed surface (sphere or box) you can move
// and resize. The surface is tiled into patches; E·n on every patch is painted as colour
// and summed, Φ = Σ E·n ΔA, and compared with Q_enc/ε₀ from the charges that are inside.
// Move a charge across the surface, or the surface across a charge, and watch the flux
// jump while the field itself changes smoothly. Closed form (Coulomb) throughout.

import { EPS0 } from '../../core/constants.js';
import { pointChargesField } from '../../core/analytic.js';
import { colormap } from '../../core/render.js';
import { camera, drawBoxOutline, drawChargeSphere, drawFieldLines3d, bindOrbit } from '../scene3d.js';
import { getNum } from '../state.js';
import { ui } from '../shell.js';
import { plotView } from '../views.js';

const BOX = { x: [0, 0.5], y: [0, 0.5], z: [-0.25, 0.25] };
const DEFAULTS = [
  { q: 2, x: 0.25, y: 0.25, z: 0.0 },
  { q: -1, x: 0.4, y: 0.15, z: 0.05 },
  { q: 1, x: 0.15, y: 0.38, z: -0.08 },
  { q: -2, x: 0.38, y: 0.4, z: 0.1 },
];
const sci = (v, d = 4) => (Number.isFinite(v) ? v.toPrecision(d) : '—');

export default {
  id: 'gauss-law',
  title: "Gauss's law",
  phase: 6,
  available: true,
  hideField: true,
  summary: 'Flux of E through a closed surface you can move, against Q_enc/ε₀.',
  extent: [0, 0.5, 0, 0.5],
  axes: ['x', 'y'],
  layers: [
    { id: 'En', label: 'E·n on the surface', kind: 'scalar', unit: 'V/m', signed: true, default: true, eq: 'En' },
    { id: 'Emag', label: '|E| on the surface', kind: 'scalar', unit: 'V/m', log: true, eq: 'E' },
    { id: 'lines', label: 'E field lines (3D)', kind: 'contour', eq: 'E', default: true },
    { id: 'mesh', label: 'Surface mesh', kind: 'contour', default: true },
    { id: 'box', label: 'Box outline', kind: 'contour', default: true },
  ],

  n: 2,
  charges: DEFAULTS.map((c) => ({ ...c })),
  surf: { kind: 'sphere', cx: 0.25, cy: 0.25, cz: 0, R: 0.1, a: 0.08 },
  cam: { az: 0.6, el: 0.5 },
  density: 8,
  res: 24,

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.n = Math.min(4, Math.max(1, Math.round(getNum(s, 'n', 2))));
    this.charges = DEFAULTS.map((c) => ({ ...c }));
    for (let k = 0; k < 4; k++) for (const key of ['q', 'x', 'y', 'z']) this.charges[k][key] = getNum(s, `${key}${k + 1}`, DEFAULTS[k][key]);
    this.surf = { kind: s.sk === 'box' ? 'box' : 'sphere', cx: getNum(s, 'sx', 0.25), cy: getNum(s, 'sy', 0.25), cz: getNum(s, 'sz', 0), R: getNum(s, 'sr', 0.1), a: getNum(s, 'sa', 0.08) };
    this.cam = { az: getNum(s, 'az', 0.6), el: getNum(s, 'el', 0.5) };
    this.density = Math.round(getNum(s, 'dens', 8));
    this.res = [12, 24, 48].includes(getNum(s, 'res', 24)) ? getNum(s, 'res', 24) : 24;
    this.views = [plotView('3d', '3D view', (ctx, w, h) => this.draw3d(ctx, w, h), {
      footer: true,
      controls: (ctl, inst) => {
        ctl.append(ui.el('span', '', 'Orbit:'));
        ctl.appendChild(ui.range(this.cam.az, { min: -3.14, max: 3.14, step: 0.01, onInput: (v) => { this.cam.az = v; inst.update(); this.queueUrl(); } }));
        ctl.append(ui.el('span', '', 'Tilt:'));
        ctl.appendChild(ui.range(this.cam.el, { min: 0, max: 1.5, step: 0.01, onInput: (v) => { this.cam.el = v; inst.update(); this.queueUrl(); } }));
        ctl.append(ui.el('span', '', 'Field lines per charge:'));
        ctl.appendChild(ui.range(this.density, { min: 0, max: 30, step: 1, onInput: (v) => { this.density = v; inst.update(); this.queueUrl(); } }));
        ctl.append(ui.el('span', '', 'Drag on the picture to orbit.'));
      },
    })];
    this.buildControls();
  },

  queueUrl() { clearTimeout(this.urlT); this.urlT = setTimeout(() => this.shell.syncUrl(), 300); },

  active() { return this.charges.slice(0, this.n).map((c) => ({ q: c.q, pos: [c.x, c.y, c.z] })); },
  field(p) { return pointChargesField(this.active(), p); },

  /** Is a point inside the Gaussian surface? */
  inside(p) {
    const { kind, cx, cy, cz, R, a } = this.surf;
    if (kind === 'sphere') return Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz) < R;
    return Math.abs(p[0] - cx) < a && Math.abs(p[1] - cy) < a && Math.abs(p[2] - cz) < a;
  },

  /**
   * Tile the surface into patches { c: centre, n: unit normal, dA, corners: [4 points], face }.
   * Sphere: res×(res/2) latitude–longitude patches, each with its exact area.
   * Box: six faces of res×res squares.
   */
  patches() {
    const { kind, cx, cy, cz, R, a } = this.surf, out = [];
    if (kind === 'sphere') {
      const nPhi = this.res, nTh = Math.max(4, this.res / 2);
      for (let j = 0; j < nTh; j++) {
        const t0 = (Math.PI * j) / nTh, t1 = (Math.PI * (j + 1)) / nTh, tm = 0.5 * (t0 + t1);
        for (let i = 0; i < nPhi; i++) {
          const p0 = (2 * Math.PI * i) / nPhi, p1 = (2 * Math.PI * (i + 1)) / nPhi, pm = 0.5 * (p0 + p1);
          const n = [Math.sin(tm) * Math.cos(pm), Math.sin(tm) * Math.sin(pm), Math.cos(tm)];
          const pt = (t, p) => [cx + R * Math.sin(t) * Math.cos(p), cy + R * Math.sin(t) * Math.sin(p), cz + R * Math.cos(t)];
          out.push({ c: [cx + R * n[0], cy + R * n[1], cz + R * n[2]], n, dA: R * R * (Math.cos(t0) - Math.cos(t1)) * (p1 - p0), corners: [pt(t0, p0), pt(t0, p1), pt(t1, p1), pt(t1, p0)], face: 'sphere' });
        }
      }
      return out;
    }
    const m = this.res, d = (2 * a) / m, dA = d * d;
    const faces = [
      { face: '+x', n: [1, 0, 0] }, { face: '−x', n: [-1, 0, 0] },
      { face: '+y', n: [0, 1, 0] }, { face: '−y', n: [0, -1, 0] },
      { face: '+z', n: [0, 0, 1] }, { face: '−z', n: [0, 0, -1] },
    ];
    for (const f of faces) {
      const ax = f.n.findIndex((v) => v !== 0), u = (ax + 1) % 3, v = (ax + 2) % 3;
      const C = [cx, cy, cz];
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        const mk = (su, sv) => { const p = [0, 0, 0]; p[ax] = C[ax] + f.n[ax] * a; p[u] = C[u] - a + su * d; p[v] = C[v] - a + sv * d; return p; };
        out.push({ c: mk(i + 0.5, j + 0.5), n: f.n, dA, corners: [mk(i, j), mk(i + 1, j), mk(i + 1, j + 1), mk(i, j + 1)], face: f.face });
      }
    }
    return out;
  },

  compute() {
    // Flux by midpoint quadrature on the patches, and the enclosed charge by geometry.
    const patches = this.patches();
    let flux = 0;
    const perFace = {};
    for (const p of patches) {
      const E = this.field(p.c).E;
      p.En = E[0] * p.n[0] + E[1] * p.n[1] + E[2] * p.n[2];
      p.Emag = Math.hypot(...E);
      const f = p.En * p.dA;
      flux += f; perFace[p.face] = (perFace[p.face] ?? 0) + f;
    }
    const enclosed = this.active().filter((c) => this.inside(c.pos));
    const Qenc = enclosed.reduce((s, c) => s + c.q, 0);
    this.patchList = patches;
    this.results = { flux, perFace, Qenc, enclosed: enclosed.length, expect: Qenc / EPS0, area: patches.reduce((s, p) => s + p.dA, 0) };
    // Colour range: symmetric percentiles of E·n, or log percentiles of |E|
    const en = patches.map((p) => Math.abs(p.En)).sort((a, b) => a - b);
    const m = en[Math.floor(0.97 * (en.length - 1))] || 1;
    this.enRange = [-m, m];
    const em = patches.map((p) => p.Emag).filter((v) => v > 0).sort((a, b) => a - b);
    this.emRange = [em[Math.floor(0.03 * (em.length - 1))] || 1e-3, em[Math.floor(0.97 * (em.length - 1))] || 1];
    this.renderResults();
  },

  render() { return null; },

  camera(w, h) { return camera(w, h, { center: [0.25, 0.25, 0], size: 0.75, az: this.cam.az, el: this.cam.el }); },

  draw3d(ctx, w, h) {
    if (!this.patchList) this.compute();
    const { P } = this.camera(w, h);
    const shell = this.shell, id = shell.colorLayer;
    const on = (L) => !!shell.layerOn.get(L);
    const [x0, x1] = BOX.x, [y0, y1] = BOX.y, [z0, z1] = BOX.z;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    if (on('box')) drawBoxOutline(ctx, P, BOX);

    // Colour scale for the surface patches
    const map = shell.$('cmap').value, cmap = colormap(map);
    const log = id === 'Emag';
    let lo = parseFloat(shell.$('cmin').value), hi = parseFloat(shell.$('cmax').value);
    const auto = log ? this.emRange : this.enRange;
    if (!Number.isFinite(lo)) lo = auto[0];
    if (!Number.isFinite(hi)) hi = auto[1];
    if (log) { lo = Math.log10(Math.max(lo, 1e-300)); hi = Math.log10(Math.max(hi, 1e-300)); }
    const scalar = shell.tab.layers.find((L) => L.id === id);
    if (id && scalar) shell.drawColorbar({ min: lo, max: hi, layer: scalar }, map); else shell.drawColorbar(null);
    const color = (p) => {
      if (!id) return null;
      const v = log ? Math.log10(Math.max(p.Emag, 1e-300)) : p.En;
      const [r, g, b] = cmap((v - lo) / ((hi - lo) || 1));
      return `rgb(${r | 0},${g | 0},${b | 0})`;
    };

    // Field lines behind the surface are drawn first; the surface is translucent so the
    // ones inside still show through.
    const charges = this.active();
    if (on('lines') && this.density > 0) {
      drawFieldLines3d(ctx, P, charges, (p) => this.field(p), {
        density: this.density,
        inside: (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1 && p[2] >= z0 && p[2] <= z1,
        stop: (p) => charges.some((c) => Math.hypot(p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]) < 0.006),
      });
    }

    // Surface patches, painter's algorithm (far first)
    const proj = this.patchList.map((p) => ({ p, s: p.corners.map((q) => P(...q)), d: P(...p.c)[2] })).sort((a, b) => b.d - a.d);
    ctx.save();
    for (const { p, s } of proj) {
      ctx.beginPath(); s.forEach(([sx, sy], i) => (i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy))); ctx.closePath();
      const fill = color(p);
      if (fill) { ctx.globalAlpha = 0.8; ctx.fillStyle = fill; ctx.fill(); }
      if (on('mesh')) { ctx.globalAlpha = 0.5; ctx.strokeStyle = fill ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.7; ctx.stroke(); }
    }
    ctx.restore();

    // Charges as spheres (enclosed ones get a ring)
    const spheres = charges.map((c, k) => ({ c, k, s: P(...c.pos) })).sort((a, b) => b.s[2] - a.s[2]);
    for (const { c, k, s } of spheres) {
      drawChargeSphere(ctx, s, c.q, k + 1);
      if (this.inside(c.pos)) { ctx.beginPath(); ctx.arc(s[0], s[1], 13, 0, 2 * Math.PI); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const r = this.results;
    ctx.fillStyle = '#ddd'; ctx.font = '12px system-ui';
    ctx.fillText(`Φ = ${sci(r.flux)} V·m   ·   Q_enc/ε₀ = ${sci(r.expect)} V·m   ·   ${r.enclosed} of ${this.n} charge${this.n > 1 ? 's' : ''} enclosed (ringed)`, 12, h - 10);

    bindOrbit(ctx.canvas, this.cam, () => { this.shell.updateStageView(); this.queueUrl(); });
  },

  // ------------------------------------------------------------ shell hooks

  statusText() {
    const r = this.results;
    if (!r) return '';
    const diff = r.expect !== 0 ? `${(100 * (r.flux - r.expect) / r.expect).toFixed(2)}% off` : `residual ${sci(r.flux, 2)} V·m`;
    return `${this.patchList.length} patches · Φ = ${sci(r.flux)} V·m vs Q_enc/ε₀ = ${sci(r.expect)} V·m (${diff})`;
  },

  probe(x, y) {
    const p = [x, y, this.surf.cz];
    const f = this.field(p);
    return [
      { label: 'probe z', value: this.surf.cz, unit: 'm', note: 'The probe sits in the plane z = surface centre.' },
      { label: 'V', value: f.V, unit: 'V' },
      { label: '|E|', value: Math.hypot(...f.E), unit: 'V/m' },
      { label: 'inside the surface?', value: this.inside(p) ? 1 : 0, unit: '' },
    ];
  },

  getState() {
    const s = { n: this.n, sk: this.surf.kind, sx: this.surf.cx, sy: this.surf.cy, sz: this.surf.cz, sr: this.surf.R, sa: this.surf.a, az: this.cam.az, el: this.cam.el, dens: this.density, res: this.res };
    for (let k = 0; k < 4; k++) for (const key of ['q', 'x', 'y', 'z']) s[`${key}${k + 1}`] = this.charges[k][key];
    return s;
  },

  csv() {
    if (!this.patchList) this.compute();
    const lines = ['face,xc_m,yc_m,zc_m,nx,ny,nz,dA_m2,En_Vpm,flux_Vm'];
    for (const p of this.patchList) lines.push(`${p.face},${p.c[0]},${p.c[1]},${p.c[2]},${p.n[0]},${p.n[1]},${p.n[2]},${p.dA},${p.En},${p.En * p.dA}`);
    lines.push('', `total_flux_Vm,${this.results.flux}`, `Q_enc_C,${this.results.Qenc}`, `Q_enc_over_eps0_Vm,${this.results.expect}`);
    return lines.join('\n');
  },

  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('Q enclosed (by geometry)', `${sci(r.Qenc)} C (${r.enclosed} charge${r.enclosed === 1 ? '' : 's'})`);
    row('Q_enc / ε₀', `${sci(r.expect)} V·m`);
    row('Φ = ΣE·n ΔA (numeric)', `${sci(r.flux)} V·m`);
    row('difference', r.expect !== 0 ? `${(100 * (r.flux - r.expect) / r.expect).toFixed(2)} %` : `${sci(r.flux, 2)} V·m (should be 0)`);
    if (this.surf.kind === 'box') for (const f of ['+x', '−x', '+y', '−y', '+z', '−z']) row(`flux through ${f} face`, `${sci(r.perFace[f] ?? 0)} V·m`);
    row('surface area', `${sci(r.area)} m²`);
  },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', "Gauss's law"));
    box.appendChild(ui.lead(shell, 'Point charges and a closed surface: the flux of E through it is Q_enc/ε₀, whatever the surface.'));
    const re = () => { shell.recompute(); shell.syncUrl(); };
    box.appendChild(ui.el('h2', '', 'Gaussian surface'));
    box.appendChild(ui.field('Shape', ui.select([['sphere', 'Sphere'], ['box', 'Cube']], this.surf.kind, (v) => { this.surf.kind = v; this.buildControls(); re(); })));
    const sl = (label, key, min, max, step = 0.005) => {
      const wrap = ui.el('div', '');
      const lab = ui.el('div', 'hint', `${label}: ${this.surf[key].toFixed(3)} m`);
      const r = ui.range(this.surf[key], { min, max, step, onInput: (v) => { this.surf[key] = v; lab.textContent = `${label}: ${v.toFixed(3)} m`; this.compute(); shell.updateStageView(); shell.refreshStatus?.(); this.queueUrl(); } });
      wrap.append(lab, r);
      return wrap;
    };
    box.append(sl('centre x', 'cx', 0.05, 0.45), sl('centre y', 'cy', 0.05, 0.45), sl('centre z', 'cz', -0.2, 0.2));
    box.appendChild(this.surf.kind === 'sphere' ? sl('radius', 'R', 0.02, 0.2) : sl('half-side', 'a', 0.02, 0.2));
    box.appendChild(ui.field('Patches', ui.select([[12, 'coarse (12)'], [24, 'normal (24)'], [48, 'fine (48)']], String(this.res), (v) => { this.res = parseInt(v, 10); re(); })));
    box.appendChild(ui.el('p', 'hint', 'Φ is a midpoint sum over the patches, so it is exact only in the limit of fine patches; the difference grows when a charge sits close to the surface.'));

    box.appendChild(ui.el('h2', '', 'Charges'));
    box.appendChild(ui.field('Number of charges', ui.select([[1, '1'], [2, '2'], [3, '3'], [4, '4']], String(this.n), (v) => { this.n = parseInt(v, 10); this.buildControls(); re(); })));
    const head = ui.el('div', 'source-row'); head.style.gridTemplateColumns = '22px 1fr 1fr 1fr 1fr';
    head.append(ui.el('span', 'idx', ''), ui.el('span', 'hint', 'q (C)'), ui.el('span', 'hint', 'x (m)'), ui.el('span', 'hint', 'y (m)'), ui.el('span', 'hint', 'z (m)'));
    box.appendChild(head);
    for (let k = 0; k < this.n; k++) {
      const c = this.charges[k];
      const row = ui.el('div', 'source-row'); row.style.gridTemplateColumns = '22px 1fr 1fr 1fr 1fr';
      row.appendChild(ui.el('span', 'idx', String(k + 1)));
      const mk = (key, min, max) => ui.number(c[key], { min, max, onChange: (v) => { c[key] = v; re(); } });
      row.append(mk('q', -5, 5), mk('x', 0.05, 0.45), mk('y', 0.05, 0.45), mk('z', -0.2, 0.2));
      box.appendChild(row);
    }
    box.appendChild(ui.el('p', 'hint', 'Drag the centre sliders so the surface swallows or releases a charge: Φ jumps by q/ε₀ while E on the surface changes smoothly.'));

    box.appendChild(ui.el('h2', '', 'Flux'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    this.renderResults();
  },
};
