// Ampère's law: a closed-form current distribution (currents along z) and an Amperian
// loop you can drag and resize. B·t̂ is drawn segment by segment along the loop as bars,
// summed to ∮B·dl, and compared with μ₀ I_enc from the currents the loop actually encloses.
// Sources: line currents, a thick wire with uniform J, a coax, a sheet, the cross-section
// of a solenoid winding and of a toroid. The loop never has to match the symmetry: an
// off-centre circle or a tilted-looking rectangle gives the same μ₀ I_enc.

import { MU0, PI } from '../../core/constants.js';
import { Grid2D, magnitude } from '../../core/grid.js';
import { drawScalarField, drawQuiver, drawStreamlines, drawContours, levelsBetween, drawMarker } from '../../core/render.js';
import { sourceB, sourceAz, sourceWires, currentDensity, loopSegments, loopLength, pointInLoop, circulation, enclosedCurrent, textbookB } from '../../core/ampere.js';
import { getNum } from '../state.js';
import { ui, sci } from '../shell.js';
import { plotView } from '../views.js';

const GRID_N = 181;
const SOURCES = [
  ['wires', 'Line currents (up to four)'], ['thick', 'Thick wire, uniform J'], ['coax', 'Coaxial cable'],
  ['sheet', 'Sheet current (finite strip)'], ['solenoid', 'Solenoid winding (cross-section)'], ['toroid', 'Toroid (cross-section)'],
];
const HALF = { wires: 0.03, thick: 0.03, coax: 0.03, sheet: 0.03, solenoid: 0.045, toroid: 0.045 }; // half-width of the box per source
const DEFAULT_WIRES = [{ I: 2, x: -0.012, y: 0.0 }, { I: -1, x: 0.012, y: 0.0 }, { I: 1, x: 0, y: 0.015 }, { I: -2, x: 0, y: -0.015 }];
const PRESETS = [
  { label: 'One wire, centred circle', src: 'wires', n: 1, wires: [{ I: 2, x: 0, y: 0 }], loop: { shape: 'circle', cx: 0, cy: 0, R: 0.012 } },
  { label: 'Same wire, loop off-centre', src: 'wires', n: 1, wires: [{ I: 2, x: 0, y: 0 }], loop: { shape: 'circle', cx: 0.006, cy: 0.004, R: 0.012 } },
  { label: 'Two wires, loop between them (nothing enclosed)', src: 'wires', n: 2, wires: [{ I: 2, x: -0.015, y: 0 }, { I: 2, x: 0.015, y: 0 }], loop: { shape: 'circle', cx: 0, cy: 0, R: 0.009 } },
  { label: 'Two opposite wires, rectangle around both', src: 'wires', n: 2, wires: [{ I: 2, x: -0.012, y: 0 }, { I: -2, x: 0.012, y: 0 }], loop: { shape: 'rect', cx: 0, cy: 0, w: 0.04, h: 0.02 } },
  { label: 'Thick wire, loop inside the conductor', src: 'thick', loop: { shape: 'circle', cx: 0, cy: 0, R: 0.006 } },
  { label: 'Coax, loop outside (zero)', src: 'coax', loop: { shape: 'circle', cx: 0, cy: 0, R: 0.024 } },
  { label: 'Sheet, rectangle straddling it', src: 'sheet', loop: { shape: 'rect', cx: 0, cy: 0, w: 0.02, h: 0.006 } },
  { label: 'Solenoid, rectangle through the winding', src: 'solenoid', loop: { shape: 'rect', cx: 0, cy: 0.012, w: 0.02, h: 0.016 } },
  { label: 'Toroid, circle inside the winding', src: 'toroid', loop: { shape: 'circle', cx: 0, cy: 0, R: 0.025 } },
];

export default {
  id: 'ampere',
  title: "Ampère's law",
  phase: 7,
  available: true,
  summary: '∮B·dl around a loop you can move, segment by segment, against μ₀ I_enc; wires, thick wire, coax, sheet, solenoid and toroid cross-sections.',
  extent: [-0.04, 0.04, -0.03, 0.03],
  axes: ['x', 'y'],
  layers: [
    { id: 'Bmag', label: '|B|', kind: 'scalar', unit: 'T', log: true, default: true, eq: 'B' },
    { id: 'Az', label: 'A_z', kind: 'scalar', unit: 'T·m', signed: true, eq: 'A' },
    { id: 'J', label: 'J_z (current density)', kind: 'scalar', unit: 'A/m²', signed: true, eq: 'J' },
    { id: 'B', label: 'B field', kind: 'vector', styles: ['arrows', 'lines'], default: true },
    { id: 'Aeq', label: 'A_z contours (B lines)', kind: 'contour', eq: 'A' },
    { id: 'bars', label: 'B·t̂ bars along the loop', kind: 'contour', default: true, eq: 'Bt' },
  ],

  init(shell) {
    this.shell = shell;
    const s = shell.state;
    this.src = SOURCES.some(([k]) => k === s.src) ? s.src : 'wires';
    this.n = Math.min(4, Math.max(1, Math.round(getNum(s, 'n', 2))));
    this.wires = DEFAULT_WIRES.map((w) => ({ ...w }));
    for (let k = 0; k < 4; k++) { this.wires[k].I = getNum(s, `i${k + 1}`, DEFAULT_WIRES[k].I); this.wires[k].x = getNum(s, `x${k + 1}`, DEFAULT_WIRES[k].x); this.wires[k].y = getNum(s, `y${k + 1}`, DEFAULT_WIRES[k].y); }
    this.p = { I: getNum(s, 'I', 3), a: getNum(s, 'a', 0.01), b: getNum(s, 'b', 0.016), c: getNum(s, 'c', 0.02), K: getNum(s, 'K', 100), w: getNum(s, 'w', 0.03), N: Math.round(getNum(s, 'N', 40)), L: getNum(s, 'L', 0.05), sa: getNum(s, 'sa', 0.01), R1: getNum(s, 'R1', 0.02), R2: getNum(s, 'R2', 0.03) };
    this.loop = { shape: s.ls === 'rect' ? 'rect' : 'circle', cx: getNum(s, 'lx', 0), cy: getNum(s, 'ly', 0), R: getNum(s, 'lr', 0.018), w: getNum(s, 'lw', 0.02), h: getNum(s, 'lh', 0.012) };
    this.ccw = s.cw !== '1';
    this.nseg = [16, 64, 256].includes(getNum(s, 'ns', 64)) ? getNum(s, 'ns', 64) : 64;
    this.views = [plotView('loop', 'Along the loop', (ctx, w, h) => this.drawLoopPlot(ctx, w, h))];
    this.applySource();
    this.buildControls();
  },

  // ------------------------------------------------------------ model

  source() {
    const p = this.p;
    switch (this.src) {
      case 'thick': return { type: 'thick', I: p.I, a: p.a };
      case 'coax': return { type: 'coax', I: p.I, a: p.a, b: p.b, c: p.c };
      case 'sheet': return { type: 'sheet', K: p.K, w: p.w };
      case 'solenoid': return { type: 'solenoid', N: p.N, I: p.I, L: p.L, a: p.sa };
      case 'toroid': return { type: 'toroid', N: p.N, I: p.I, R1: p.R1, R2: p.R2 };
      default: return { type: 'wires', wires: this.wires.slice(0, this.n).map((w) => ({ I: w.I, pos: [w.x, w.y] })) };
    }
  },

  applySource() {
    const H = HALF[this.src];
    this.extent = [-(4 / 3) * H, (4 / 3) * H, -H, H]; // 4:3 picture
    this.shell.setExtent(this.extent, ['x', 'y']);
    const L = (id) => this.layers.find((l) => l.id === id);
    const hasA = ['wires', 'solenoid', 'toroid'].includes(this.src), hasJ = ['thick', 'coax'].includes(this.src);
    L('Az').available = hasA; L('Aeq').available = hasA; L('J').available = hasJ;
    if (!hasA && (this.shell.colorLayer === 'Az')) this.shell.colorLayer = 'Bmag';
    if (!hasJ && (this.shell.colorLayer === 'J')) this.shell.colorLayer = 'Bmag';
    if (!hasA) this.shell.layerOn.set('Aeq', false);
    this.shell.refreshLayers();
    this.clampLoop();
  },

  clampLoop() {
    const H = HALF[this.src], l = this.loop;
    l.R = Math.min(Math.max(l.R, 0.002), H); l.w = Math.min(Math.max(l.w, 0.002), 2 * H); l.h = Math.min(Math.max(l.h, 0.002), 2 * H);
    l.cx = Math.min(Math.max(l.cx, -H), H); l.cy = Math.min(Math.max(l.cy, -H), H);
  },

  compute() {
    const src = this.srcObj = this.source(), E = this.extent;
    const rRef = HALF[this.src];
    this.gridBx = Grid2D.fromFunction(GRID_N, GRID_N, E, (x, y) => sourceB(src, [x, y])[0]);
    this.gridBy = Grid2D.fromFunction(GRID_N, GRID_N, E, (x, y) => sourceB(src, [x, y])[1]);
    this.gridBmag = magnitude(this.gridBx, this.gridBy);
    const b = Array.from(this.gridBmag.data).filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
    const hi = b[Math.floor(0.985 * (b.length - 1))] || 1;
    this.bRange = [Math.max(b[Math.floor(0.03 * (b.length - 1))] || 1e-9, 1e-3 * hi), hi];
    if (this.layers.find((l) => l.id === 'Az').available) {
      this.gridAz = Grid2D.fromFunction(GRID_N, GRID_N, E, (x, y) => sourceAz(src, [x, y], rRef));
      const a = Array.from(this.gridAz.data).filter(Number.isFinite).sort((x, y) => x - y);
      const m = Math.max(Math.abs(a[Math.floor(0.02 * a.length)]), Math.abs(a[Math.floor(0.98 * a.length)])) || 1;
      this.aRange = [-m, m];
    } else this.gridAz = null;
    if (this.layers.find((l) => l.id === 'J').available) {
      this.gridJ = Grid2D.fromFunction(GRID_N, GRID_N, E, (x, y) => currentDensity(src, [x, y]));
      let m = 0; for (const v of this.gridJ.data) m = Math.max(m, Math.abs(v)); this.jRange = [-m || -1, m || 1];
    } else this.gridJ = null;
    this.computeLoop();
  },

  /** The loop part only (cheap): segments, circulation, enclosed current. */
  computeLoop() {
    const src = this.srcObj ?? this.source();
    const segs = loopSegments(this.loop, this.nseg);
    const { circ } = circulation(src, segs, this.ccw);
    const enc = enclosedCurrent(src, this.loop);
    const Ienc = this.ccw ? enc.I : -enc.I;
    this.segs = segs;
    this.results = { circ, Ienc, parts: enc.parts, expect: MU0 * Ienc, length: loopLength(this.loop), meanBt: circ / loopLength(this.loop) };
    let m = 0; for (const g of segs) if (Number.isFinite(g.Bt)) m = Math.max(m, Math.abs(g.Bt)); this.btMax = m || 1;
    this.renderResults();
  },

  render(layer, ctx, view, opts) {
    const src = this.srcObj, bFn = (x, y) => sourceB(src, [x, y]);
    switch (layer) {
      case 'Bmag': return drawScalarField(ctx, this.gridBmag, { map: opts.map, extent: opts.extent, log: true, min: opts.min ?? this.bRange[0], max: opts.max ?? this.bRange[1] });
      case 'Az': return this.gridAz ? drawScalarField(ctx, this.gridAz, { map: opts.map, extent: opts.extent, min: opts.min ?? this.aRange[0], max: opts.max ?? this.aRange[1] }) : null;
      case 'J': return this.gridJ ? drawScalarField(ctx, this.gridJ, { map: opts.map, extent: opts.extent, min: opts.min ?? this.jRange[0], max: opts.max ?? this.jRange[1] }) : null;
      case 'B':
        if (opts.style === 'lines') {
          const seeds = [], H = HALF[this.src];
          const wires = sourceWires(src);
          if (wires.length && wires.length <= 4) for (const w of wires) for (let r = 0.0015; r < 0.02; r *= 1.45) seeds.push([w.pos[0] + r, w.pos[1] + r * 0.3]);
          else if (this.src === 'solenoid') { for (let k = 0; k < 9; k++) seeds.push([0, -this.p.sa * 0.95 + (k / 8) * 1.9 * this.p.sa]); for (let k = 1; k < 5; k++) seeds.push([0, this.p.sa + k * 0.006], [0, -this.p.sa - k * 0.006]); }
          else if (this.src === 'toroid') { for (let k = 0; k < 7; k++) { const r = this.p.R1 + ((k + 0.5) / 7) * (this.p.R2 - this.p.R1); seeds.push([r, 0]); } for (let k = 1; k < 4; k++) seeds.push([this.p.R1 * k / 4, 0], [this.p.R2 + 0.004 * k, 0]); }
          else if (this.src === 'sheet') { for (let k = 0; k < 12; k++) { const y = -H + ((k + 0.5) / 12) * 2 * H; if (Math.abs(y) > 1e-3) seeds.push([0, y]); } }
          else for (let k = 1; k < 12; k++) seeds.push([0, -H + (k / 12) * 2 * H]);
          const stop = (x, y) => wires.length <= 4 && wires.some((w) => Math.hypot(x - w.pos[0], y - w.pos[1]) < 0.0008);
          drawStreamlines(ctx, view, bFn, seeds, { stopFn: stop, maxSteps: 3000 });
        } else drawQuiver(ctx, view, bFn, { normalize: true });
        return null;
      case 'Aeq': if (this.gridAz) drawContours(ctx, view, this.gridAz, levelsBetween(this.aRange[0], this.aRange[1], 24), { color: 'rgba(0,0,0,0.6)' }); return null;
      default: return null;
    }
  },

  drawOverlay(ctx, view) {
    const src = this.srcObj ?? this.source(), p = this.p, H = HALF[this.src];
    ctx.save();
    // ---- the source
    const circle = (r, stroke, fill, dash = []) => { const [cx, cy] = view.toPx(0, 0), [ex] = view.toPx(r, 0); ctx.beginPath(); ctx.arc(cx, cy, ex - cx, 0, 2 * PI); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); } };
    if (this.src === 'thick') circle(p.a, '#fff', 'rgba(245,166,35,0.35)');
    if (this.src === 'coax') { circle(p.c, '#fff', 'rgba(123,97,255,0.35)'); circle(p.b, '#fff', 'rgba(0,0,0,0)'); circle(p.a, '#fff', 'rgba(245,166,35,0.35)'); }
    if (this.src === 'sheet') { const [x0, y0] = view.toPx(-p.w / 2, 0), [x1] = view.toPx(p.w / 2, 0); ctx.strokeStyle = p.K >= 0 ? '#f5a623' : '#7b61ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke(); }
    const wires = sourceWires(src);
    const small = wires.length > 4;
    for (const w of wires) drawMarker(ctx, view, w.pos[0], w.pos[1], { radius: small ? (wires.length > 80 ? 2.5 : 4) : 9, fill: w.I > 0 ? '#f5a623' : '#7b61ff', stroke: '#fff', lineWidth: small ? 1 : 2, label: small ? '' : w.I > 0 ? '•' : '×', labelColor: '#fff', fontSize: 14 });
    if (!small) for (const w of wires) if (pointInLoop(this.loop, w.pos)) { const [x, y] = view.toPx(w.pos[0], w.pos[1]); ctx.beginPath(); ctx.arc(x, y, 14, 0, 2 * PI); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.5; ctx.stroke(); }

    // ---- the loop, with B·t̂ bars on every segment
    const segs = this.segs ?? [];
    const on = this.shell.layerOn.get('bars');
    const scale = (0.14 * H) / this.btMax; // bar length in metres per tesla
    if (on) for (const g of segs) {
      if (!Number.isFinite(g.Bt)) continue;
      const nrm = [g.t[1], -g.t[0]]; // outward normal for a counter-clockwise loop
      const len = g.Bt * scale;
      const a0 = [g.c[0] - 0.5 * g.dl * g.t[0], g.c[1] - 0.5 * g.dl * g.t[1]], a1 = [g.c[0] + 0.5 * g.dl * g.t[0], g.c[1] + 0.5 * g.dl * g.t[1]];
      const b0 = [a0[0] + len * nrm[0], a0[1] + len * nrm[1]], b1 = [a1[0] + len * nrm[0], a1[1] + len * nrm[1]];
      const P = [a0, a1, b1, b0].map((q) => view.toPx(q[0], q[1]));
      ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      ctx.fillStyle = g.Bt >= 0 ? 'rgba(229,72,77,0.75)' : 'rgba(59,130,246,0.75)'; ctx.fill();
    }
    // the loop line and its direction arrows
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
    if (this.loop.shape === 'circle') { const [cx, cy] = view.toPx(this.loop.cx, this.loop.cy), [ex] = view.toPx(this.loop.cx + this.loop.R, this.loop.cy); ctx.arc(cx, cy, ex - cx, 0, 2 * PI); }
    else { const l = this.loop, [x0, y0] = view.toPx(l.cx - l.w / 2, l.cy + l.h / 2), [x1, y1] = view.toPx(l.cx + l.w / 2, l.cy - l.h / 2); ctx.rect(x0, y0, x1 - x0, y1 - y0); }
    ctx.stroke();
    const nArrow = this.loop.shape === 'circle' ? 4 : 4;
    for (let k = 0; k < nArrow; k++) {
      const g = segs[Math.floor(((k + 0.5) / nArrow) * segs.length)]; if (!g) continue;
      const dir = this.ccw ? 1 : -1, [x, y] = view.toPx(g.c[0], g.c[1]);
      const ang = Math.atan2(-g.t[1] * dir, g.t[0] * dir); // canvas y is down
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // handles: centre and one resize handle
    const [hx, hy] = view.toPx(this.loop.cx, this.loop.cy);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 2 * PI); ctx.fill();
    const rh = this.resizeHandle(); const [rx, ry] = view.toPx(rh[0], rh[1]);
    ctx.fillStyle = '#fde047'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(rx - 5, ry - 5, 10, 10); ctx.fill(); ctx.stroke();
    // caption
    const r = this.results;
    if (r) { ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3; ctx.fillText(`∮B·dl = ${sci(r.circ, 4)} T·m   μ₀I_enc = ${sci(r.expect, 4)} T·m   (I_enc = ${sci(r.Ienc, 4)} A)`, 10, view.height - 10); }
    ctx.restore();
  },

  resizeHandle() { const l = this.loop; return l.shape === 'circle' ? [l.cx + l.R * Math.SQRT1_2, l.cy + l.R * Math.SQRT1_2] : [l.cx + l.w / 2, l.cy + l.h / 2]; },

  // dragging: the centre moves the loop; the yellow handle resizes it
  onPointer(type, x, y) {
    const l = this.loop, view = this.shell.view;
    if (type === 'leave' || type === 'move') return false;
    if (type === 'down') {
      const [px, py] = view.toPx(x, y), [cx, cy] = view.toPx(l.cx, l.cy), rh = this.resizeHandle(), [rx, ry] = view.toPx(rh[0], rh[1]);
      if (Math.hypot(px - rx, py - ry) < 14) { this.drag = 'resize'; return true; }
      if (Math.hypot(px - cx, py - cy) < 16 || pointInLoop(l, [x, y])) { this.drag = 'move'; this.dragOff = [x - l.cx, y - l.cy]; return true; }
      return false;
    }
    if (type === 'drag' && this.drag) {
      if (this.drag === 'move') { l.cx = x - this.dragOff[0]; l.cy = y - this.dragOff[1]; }
      else if (l.shape === 'circle') l.R = Math.hypot(x - l.cx, y - l.cy);
      else { l.w = 2 * Math.abs(x - l.cx); l.h = 2 * Math.abs(y - l.cy); }
      this.clampLoop(); this.computeLoop(); this.shell.redrawOverlay(); this.shell.updateStageView(); this.shell.refreshStatus(); this.syncSliders();
      return true;
    }
    if (type === 'up' && this.drag) { this.drag = null; this.shell.syncUrl(); return true; }
    return false;
  },

  // ------------------------------------------------------------ loop plot

  drawLoopPlot(ctx, W, H) {
    if (!this.segs) this.compute();
    const segs = this.segs, r = this.results;
    const L = 92, T = 62, B = 52, Rm = 20;
    const total = r.length;
    const vals = segs.map((g) => g.Bt).filter(Number.isFinite);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals); if (!(hi > lo)) { hi = lo + 1; }
    const pad = 0.08 * (hi - lo); lo -= pad; hi += pad;
    const px = (s) => L + (s / total) * (W - L - Rm), py = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5a5955';
    ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
    for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); ctx.fillText(sci(v, 3), 24, py(v) + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(L, py(v)); ctx.lineTo(W - Rm, py(v)); ctx.stroke(); }
    for (let k = 0; k <= 5; k++) { const s = (k / 5) * total; ctx.fillText((s * 1e3).toFixed(1), px(s) - 10, H - B + 16); }
    ctx.fillText('distance along the loop s (mm), counter-clockwise from the start', W / 2 - 170, H - 8);
    ctx.save(); ctx.translate(10, T + 0.5 * (H - T - B)); ctx.rotate(-PI / 2); ctx.textAlign = 'center'; ctx.fillText('B·t̂ (T)', 0, 0); ctx.restore(); ctx.textAlign = 'left';
    ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(W - Rm, py(0)); ctx.stroke();
    // rectangle: side boundaries
    if (this.loop.shape === 'rect') { let s = 0; for (const [i, len] of [this.loop.w, this.loop.h, this.loop.w, this.loop.h].entries()) { const name = ['bottom', 'right', 'top', 'left'][i]; ctx.fillStyle = 'rgba(0,0,0,0.06)'; if (i % 2) ctx.fillRect(px(s), T, px(s + len) - px(s), H - T - B); ctx.fillStyle = '#5a5955'; ctx.fillText(name, px(s) + 4, T + 14); s += len; } }
    // bars (the integrand) and the running integral
    for (const g of segs) { if (!Number.isFinite(g.Bt)) continue; const x0 = px(g.s - g.dl / 2), x1 = px(g.s + g.dl / 2); ctx.fillStyle = g.Bt >= 0 ? 'rgba(229,72,77,0.6)' : 'rgba(59,130,246,0.6)'; ctx.fillRect(x0, Math.min(py(0), py(g.Bt)), Math.max(1, x1 - x0), Math.abs(py(g.Bt) - py(0))); }
    let acc = 0; const pts = [[px(0), 0]];
    for (const g of segs) { acc += (Number.isFinite(g.Bt) ? g.Bt : 0) * g.dl; pts.push([px(g.s + g.dl / 2), acc]); }
    const cm = Math.max(Math.abs(r.expect), Math.abs(acc), 1e-30);
    ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
    pts.forEach(([x, v], i) => { const y = T + (1 - (0.5 + 0.45 * v / cm)) * (H - T - B); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#5a5955';
    const wrap = (text, y0) => { const words = text.split(' '); let lineTxt = '', y = y0; for (const wd of words) { const trial = lineTxt ? `${lineTxt} ${wd}` : wd; if (ctx.measureText(trial).width > W - L - Rm && lineTxt) { ctx.fillText(lineTxt, L, y); y += 14; lineTxt = wd; } else lineTxt = trial; } if (lineTxt) ctx.fillText(lineTxt, L, y); return y + 14; };
    const y1 = wrap(`bars: B·t̂ on each of ${segs.length} segments; their area is ∮B·dl = ${sci(r.circ, 4)} T·m, against μ₀I_enc = ${sci(r.expect, 4)} T·m`, 20);
    wrap(`dashed: the running integral (own scale), ending at ${sci(acc, 4)} T·m · loop length ${(total * 1e3).toFixed(2)} mm · mean B·t̂ = ${sci(r.meanBt, 4)} T`, y1);
  },

  // ------------------------------------------------------------ shell hooks

  statusText() {
    const r = this.results; if (!r) return '';
    const diff = r.expect !== 0 ? `${(100 * (r.circ - r.expect) / r.expect).toFixed(3)} % off` : `residual ${sci(r.circ, 2)} T·m`;
    return `${this.segs.length} segments · ∮B·dl = ${sci(r.circ, 5)} T·m vs μ₀I_enc = ${sci(r.expect, 5)} T·m (${diff}) · I_enc = ${sci(r.Ienc, 4)} A · loop ${this.ccw ? 'counter-clockwise' : 'clockwise'}`;
  },

  probe(x, y) {
    const src = this.srcObj ?? this.source(), B = sourceB(src, [x, y]), tb = textbookB(src, [x, y]);
    const out = [{ label: 'Bx', value: B[0], unit: 'T' }, { label: 'By', value: B[1], unit: 'T' }, { label: '|B|', value: Math.hypot(...B), unit: 'T' }, { label: 'angle of B', value: (Math.atan2(B[1], B[0]) * 180) / PI, unit: 'deg' }];
    const r = Math.hypot(x, y);
    if (r > 0 && ['thick', 'coax', 'toroid'].includes(this.src)) out.push({ label: 'B_φ (around the axis)', value: (-B[0] * y + B[1] * x) / r, unit: 'T' }, { label: 'r from the axis', value: r, unit: 'm' });
    if (tb) out.push({ label: tb.label, value: tb.B, unit: 'T' });
    if (this.gridJ) out.push({ label: 'J_z here', value: currentDensity(src, [x, y]), unit: 'A/m²' });
    out.push({ label: 'inside the loop?', value: pointInLoop(this.loop, [x, y]) ? 1 : 0, unit: '' });
    return out;
  },

  getState() {
    const s = { src: this.src, ls: this.loop.shape, lx: this.loop.cx, ly: this.loop.cy, lr: this.loop.R, lw: this.loop.w, lh: this.loop.h, ns: this.nseg };
    if (!this.ccw) s.cw = 1;
    if (this.src === 'wires') { s.n = this.n; for (let k = 0; k < 4; k++) { s[`i${k + 1}`] = this.wires[k].I; s[`x${k + 1}`] = this.wires[k].x; s[`y${k + 1}`] = this.wires[k].y; } }
    else for (const k of ({ thick: ['I', 'a'], coax: ['I', 'a', 'b', 'c'], sheet: ['K', 'w'], solenoid: ['N', 'I', 'L', 'sa'], toroid: ['N', 'I', 'R1', 'R2'] })[this.src]) s[k] = this.p[k];
    return s;
  },

  csv() {
    if (!this.segs) this.compute();
    const lines = ['segment,side,xc_m,yc_m,tx,ty,dl_m,Bx_T,By_T,Bt_T,Bt_dl_Tm'];
    this.segs.forEach((g, k) => lines.push(`${k + 1},${g.side},${g.c[0]},${g.c[1]},${g.t[0]},${g.t[1]},${g.dl},${g.B[0]},${g.B[1]},${g.Bt},${g.Bt * g.dl}`));
    lines.push('', `circulation_Tm,${this.results.circ}`, `I_enc_A,${this.results.Ienc}`, `mu0_I_enc_Tm,${this.results.expect}`);
    return lines.join('\n');
  },

  // ------------------------------------------------------------ controls

  applyPreset(pr) {
    this.src = pr.src;
    if (pr.wires) { this.n = pr.n; pr.wires.forEach((w, k) => { this.wires[k] = { ...w }; }); }
    this.loop = { ...this.loop, ...pr.loop };
    this.ccw = true;
    this.applySource(); this.buildControls(); this.shell.recompute(); this.shell.syncUrl();
  },

  syncSliders() { for (const [key, fn] of Object.entries(this.sliderSync ?? {})) fn(this.loop[key]); },

  buildControls() {
    const shell = this.shell, box = shell.controlsEl;
    box.innerHTML = '';
    box.appendChild(ui.el('h1', '', "Ampère's law"));
    box.appendChild(ui.lead(shell, 'A current distribution and a closed loop you can move: ∮B·dl around it is μ₀ times the current threading it, whatever the loop.'));
    const re = () => { shell.recompute(); shell.syncUrl(); };
    const reSrc = () => { this.applySource(); this.buildControls(); re(); };

    box.appendChild(ui.el('h2', '', 'Presets'));
    const pw = ui.el('div', 'row'); pw.style.flexWrap = 'wrap';
    for (const pr of PRESETS) pw.appendChild(ui.button(pr.label, () => this.applyPreset(pr), 'btn btn-small'));
    box.appendChild(pw);

    box.appendChild(ui.el('h2', '', 'Source'));
    box.appendChild(ui.field('Current distribution', ui.select(SOURCES, this.src, (v) => { this.src = v; reSrc(); })));
    const pf = (key, label, min, max, step) => ui.field(label, ui.number(this.p[key], { min, max, step, onChange: (v) => { this.p[key] = key === 'N' ? Math.round(v) : v; re(); } }));
    const row = (...els) => { const r = ui.el('div', 'row'); r.append(...els); box.appendChild(r); };
    if (this.src === 'wires') {
      box.appendChild(ui.field('Number of wires', ui.select([[1, '1'], [2, '2'], [3, '3'], [4, '4']], String(this.n), (v) => { this.n = parseInt(v, 10); this.buildControls(); re(); })));
      const head = ui.el('div', 'source-row'); head.append(ui.el('span', 'idx', ''), ui.el('span', 'hint', 'I (A)'), ui.el('span', 'hint', 'x (m)'), ui.el('span', 'hint', 'y (m)')); box.appendChild(head);
      for (let k = 0; k < this.n; k++) {
        const w = this.wires[k], r = ui.el('div', 'source-row'); r.appendChild(ui.el('span', 'idx', String(k + 1)));
        const mk = (key, min, max) => ui.number(w[key], { min, max, ariaLabel: `wire ${k + 1} ${({ I: 'current I (A)', x: 'x (m)', y: 'y (m)' })[key]}`, onChange: (v) => { w[key] = v; re(); } });
        r.append(mk('I', -10, 10), mk('x', -0.03, 0.03), mk('y', -0.03, 0.03)); box.appendChild(r);
      }
      box.appendChild(ui.el('p', 'hint', 'I > 0 flows along +z, out of the page (•); I < 0 into the page (×). Wires inside the loop are ringed in yellow.'));
    } else if (this.src === 'thick') { row(pf('I', 'Total current I (A)', -50, 50), pf('a', 'Wire radius a (m)', 0.001, 0.03, 0.001)); box.appendChild(ui.el('p', 'hint', 'Uniform J = I/πa². Inside the wire a centred loop encloses only I·(r/a)², so B grows linearly with r and then falls as 1/r outside. Try a rectangle half in, half out: the enclosed current is J times the area inside, and ∮B·dl still matches.')); }
    else if (this.src === 'coax') { row(pf('I', 'Current I (A)', -50, 50), pf('a', 'Inner radius a (m)', 0.001, 0.02, 0.001)); row(pf('b', 'Shell inner radius b (m)', 0.002, 0.028, 0.001), pf('c', 'Shell outer radius c (m)', 0.003, 0.03, 0.001)); box.appendChild(ui.el('p', 'hint', '+I in the inner conductor, −I spread over the shell. Outside the cable the loop encloses zero net current and B is zero, which is why coax does not radiate its signal current. Inside the shell the enclosed current falls with (r² − b²)/(c² − b²).')); }
    else if (this.src === 'sheet') { row(pf('K', 'Sheet current K (A/m)', -1e4, 1e4), pf('w', 'Strip width w (m)', 0.005, 0.06, 0.001)); box.appendChild(ui.el('p', 'hint', 'A strip of width w carrying K along +z. The textbook rectangle straddling the sheet has B along its long sides only (the short sides are perpendicular to B), so 2·B·ℓ = μ₀Kℓ and B = μ₀K/2 for an infinite sheet. Here the strip is finite, so B falls toward its edges and the loop shows the correction.')); }
    else if (this.src === 'solenoid') { row(pf('N', 'Turns N', 2, 200, 1), pf('I', 'Current I (A)', -50, 50)); row(pf('L', 'Length L (m)', 0.01, 0.08, 0.001), pf('sa', 'Half-height a (m)', 0.002, 0.03, 0.001)); box.appendChild(ui.el('p', 'hint', 'Cross-section of a winding very wide in z: N turns come out of the page at the top and go in at the bottom. The textbook rectangle with one side inside and one outside encloses N_enc turns, and B_inside·ℓ ≈ μ₀ n ℓ I because B outside is small and the short sides are perpendicular to B. Shorten L or enlarge a to see the approximation fail while ∮B·dl = μ₀ N_enc I holds exactly.')); }
    else { row(pf('N', 'Turns N', 4, 400, 1), pf('I', 'Current I (A)', -50, 50)); row(pf('R1', 'Inner radius R₁ (m)', 0.005, 0.04, 0.001), pf('R2', 'Outer radius R₂ (m)', 0.01, 0.044, 0.001)); box.appendChild(ui.el('p', 'hint', 'Cross-section of a toroid through its equatorial plane: N turns out of the page on the inner circle, back in on the outer. A centred circle between them encloses NI and B = μ₀NI/(2πr); inside R₁ or outside R₂ the net current is zero. The field is confined to the winding (up to the ripple from N discrete turns).')); }

    box.appendChild(ui.el('h2', '', 'Amperian loop'));
    row(ui.field('Shape', ui.select([['circle', 'Circle'], ['rect', 'Rectangle']], this.loop.shape, (v) => { this.loop.shape = v; this.buildControls(); this.computeLoop(); shell.redraw(); shell.syncUrl(); })),
      ui.field('Direction', ui.select([['ccw', 'Counter-clockwise'], ['cw', 'Clockwise']], this.ccw ? 'ccw' : 'cw', (v) => { this.ccw = v === 'ccw'; this.computeLoop(); shell.redraw(); shell.syncUrl(); })));
    const H = HALF[this.src];
    this.sliderSync = {};
    const sl = (label, key, min, max) => {
      const wrap = ui.el('div', ''); const lab = ui.el('div', 'hint', `${label}: ${(this.loop[key] * 1e3).toFixed(1)} mm`);
      const r = ui.range(this.loop[key], { min, max, step: 0.0005, ariaLabel: `loop ${label} (m)`, onInput: (v) => { this.loop[key] = v; this.clampLoop(); lab.textContent = `${label}: ${(this.loop[key] * 1e3).toFixed(1)} mm`; this.computeLoop(); shell.redrawOverlay(); shell.updateStageView(); shell.refreshStatus(); clearTimeout(this.urlT); this.urlT = setTimeout(() => shell.syncUrl(), 300); } });
      this.sliderSync[key] = (v) => { r.value = v; lab.textContent = `${label}: ${(v * 1e3).toFixed(1)} mm`; };
      wrap.append(lab, r); return wrap;
    };
    box.append(sl('centre x', 'cx', -H, H), sl('centre y', 'cy', -H, H));
    if (this.loop.shape === 'circle') box.appendChild(sl('radius', 'R', 0.002, H)); else box.append(sl('width', 'w', 0.002, 2 * H), sl('height', 'h', 0.002, 2 * H));
    box.appendChild(ui.field('Segments', ui.select([[16, 'coarse (16)'], [64, 'normal (64)'], [256, 'fine (256)']], String(this.nseg), (v) => { this.nseg = parseInt(v, 10); this.computeLoop(); shell.redraw(); shell.syncUrl(); })));
    box.appendChild(ui.el('p', 'hint', 'Drag inside the loop to move it, drag the yellow handle to resize. The bars along the loop are B·t̂ on each segment, red with the loop direction and blue against it; ∮B·dl is their midpoint sum. Switch to clockwise and both sides of the equation change sign.'));

    box.appendChild(ui.el('h2', '', 'Circulation'));
    this.resultsEl = ui.el('table', 'probe-table'); this.resultsEl.appendChild(document.createElement('tbody')); box.appendChild(this.resultsEl);
    box.appendChild(ui.el('p', 'hint', 'I_enc is found by geometry, not from the field: wires by whether they are inside, the sheet by the length of strip inside, distributed J by its area inside the loop. The midpoint sum is exact for a circle around a single wire and converges with finer segments otherwise; the difference grows when the loop passes close to a wire.'));
    const cr = ui.el('div', 'row'); cr.appendChild(ui.button('Show B·t̂ along the loop', () => { shell.setStageView('loop'); shell.syncUrl(); }, 'btn btn-small')); box.appendChild(cr);
    this.renderResults();
  },

  renderResults() {
    if (!this.resultsEl || !this.results) return;
    const r = this.results, tb = this.resultsEl.tBodies[0]; tb.innerHTML = '';
    const row = (a, b) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; tb.appendChild(tr); };
    row('∮B·dl = ΣB·t̂ Δl (numeric)', `${sci(r.circ, 5)} T·m`);
    row('I enclosed (by geometry)', `${sci(r.Ienc, 5)} A`);
    for (const p of r.parts) row(`&nbsp;&nbsp;${p.label}`, `${sci(this.ccw ? p.I : -p.I, 4)} A`);
    row('μ₀ I_enc', `${sci(r.expect, 5)} T·m`);
    row('difference', r.expect !== 0 ? `${(100 * (r.circ - r.expect) / r.expect).toFixed(3)} %` : `${sci(r.circ, 2)} T·m (should be 0)`);
    row('loop length', `${(r.length * 1e3).toFixed(2)} mm`);
    row('mean B·t̂ = ∮B·dl / length', `${sci(r.meanBt, 4)} T`);
    const src = this.srcObj ?? this.source();
    if (this.loop.shape === 'circle' && Math.hypot(this.loop.cx, this.loop.cy) < 1e-9 && ['thick', 'coax', 'toroid'].includes(this.src)) row('B from symmetry, μ₀I_enc/(2πR)', `${sci(r.expect / (2 * PI * this.loop.R), 4)} T (uniform on a centred circle)`);
    if (this.src === 'solenoid' && this.loop.shape === 'rect') {
      const bot = this.segs.filter((g) => g.side === 'bottom').reduce((a, g) => a + g.Bt * g.dl, 0), top = this.segs.filter((g) => g.side === 'top').reduce((a, g) => a + g.Bt * g.dl, 0);
      const lr = this.segs.filter((g) => g.side === 'left' || g.side === 'right').reduce((a, g) => a + g.Bt * g.dl, 0);
      row('bottom side ∫B·dl', `${sci(bot, 4)} T·m`); row('top side ∫B·dl', `${sci(top, 4)} T·m`); row('left + right sides ∫B·dl', `${sci(lr, 4)} T·m (perpendicular to B when B is along x)`);
      const tbk = textbookB(src, [0, 0]); row('μ₀ n I (long solenoid)', `${sci(tbk.B, 4)} T`); row('two finite sheets: μ₀ n I · (2/π) atan(L/2a)', `${sci(tbk.B * (2 / PI) * Math.atan(this.p.L / (2 * this.p.sa)), 4)} T`); row('B at the centre (actual)', `${sci(sourceB(src, [0, 0])[0], 4)} T`);
    }
  },
};
