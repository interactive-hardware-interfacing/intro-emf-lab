// Reusable stage views for the centre window.
//
//   plotView(label, draw)      a full-size canvas; draw(ctx, w, h) is called on every update
//   iso3dView(label, source)   an isometric rendering of an axisymmetric solution: the
//                              vertical cut through the axis plus a horizontal cut at an
//                              adjustable height, both painted with the current colour layer,
//                              with the device geometry drawn as cylinders. Pure canvas 2D:
//                              an isometric projection is affine, so the field images are
//                              drawn with setTransform and clipped to the cut shapes.
//
// source = {
//   grid()      -> the current colour-layer grid, mirrored across the axis (x = -R..R, z)
//   scalarAt(r, z) -> the same quantity at radius r (>= 0), height z
//   log, map, min, max   colour mapping, from the shell's last field redraw
//   zRange()    -> [zmin, zmax] of the solution
//   cylinders() -> [{ r0, r1, z0, z1, color, label }]  geometry to outline (r0 = 0 for a solid)
// }

import { Grid2D } from '../core/grid.js';
import { drawScalarField } from '../core/render.js';
import { ui } from './shell.js';

export function plotView(id, label, draw, { footer = false, controls } = {}) {
  return {
    id, label, footer,
    mount(el) {
      let ctl = null;
      if (controls) { ctl = document.createElement('div'); ctl.className = 'view-controls'; el.appendChild(ctl); }
      const body = document.createElement('div'); body.className = 'view-body'; el.appendChild(body);
      const c = document.createElement('canvas'); body.appendChild(c);
      const inst = {
        update() {
          const w = body.clientWidth || 640, h = body.clientHeight || 640;
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
          const ctx = c.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          draw(ctx, w, h, inst);
        },
      };
      if (controls) controls(ctl, inst);
      new ResizeObserver(() => inst.update()).observe(body);
      return inst;
    },
  };
}

export function iso3dView(id, label, source, shell) {
  const state = { zc: 0, tilt: 0.32, turn: 0.55, showH: true, showV: true };
  return plotView(id, label, (ctx, w, h) => drawIso(ctx, w, h, source, state, shell), {
    footer: true,
    controls: (ctl, inst) => {
      const [zmin, zmax] = source.zRange();
      state.zc = Math.min(Math.max(state.zc, zmin), zmax);
      const lab = ui.el('span', '', 'Cut height z:');
      const rng = ui.range(state.zc, { min: zmin, max: zmax, step: (zmax - zmin) / 200, onInput: (v) => { state.zc = v; val.textContent = `${(v * 1e3).toFixed(2)} mm`; inst.update(); } });
      const val = ui.el('span', '', `${(state.zc * 1e3).toFixed(2)} mm`);
      val.style.fontFamily = 'var(--mono)';
      const turn = ui.range(state.turn, { min: 0.2, max: 0.9, step: 0.01, onInput: (v) => { state.turn = v; inst.update(); } });
      const hv = document.createElement('label'); const hc = document.createElement('input'); hc.type = 'checkbox'; hc.checked = true; hc.addEventListener('change', () => { state.showH = hc.checked; inst.update(); }); hv.append(hc, ui.el('span', '', 'horizontal cut'));
      const vv = document.createElement('label'); const vc = document.createElement('input'); vc.type = 'checkbox'; vc.checked = true; vc.addEventListener('change', () => { state.showV = vc.checked; inst.update(); }); vv.append(vc, ui.el('span', '', 'vertical cut'));
      ctl.append(lab, rng, val, ui.el('span', '', 'Angle:'), turn, hv, vv);
    },
  });
}

function drawIso(ctx, w, h, source, state, shell) {
  const grid = source.grid?.();
  if (!grid) { ctx.fillStyle = '#888'; ctx.font = '14px system-ui'; ctx.fillText('No solution yet.', 20, 30); return; }
  const [x0, x1, z0, z1] = grid.extent;      // mirrored: x0 = -R, x1 = +R
  const R = x1;
  const opts = { map: shell.lastOpts?.map, min: shell.lastRange?.min, max: shell.lastRange?.max, log: source.log };
  if (opts.log && opts.min !== undefined) { opts.min = 10 ** opts.min; opts.max = 10 ** opts.max; } // shell stores log10 bounds

  // Projection: screen = O + x ex + y ey + z ez, pixels per metre s.
  const depth = state.turn; // how far the y axis leans
  const ex = [1, 0], ey = [depth, -state.tilt], ez = [0, -1];
  const extentX = 2 * R * (1 + depth), extentY = (z1 - z0) + 2 * R * state.tilt;
  const s = 0.95 * Math.min(w / extentX, h / extentY);
  const O = [w / 2 - (R * ey[0] * s) / 2, h / 2 + ((z1 + z0) / 2) * s + (R * state.tilt * s) / 2];
  const P = (x, y, z) => [O[0] + (x * ex[0] + y * ey[0] + z * ez[0]) * s, O[1] + (x * ex[1] + y * ey[1] + z * ez[1]) * s];

  // Images: vertical cut (x-z) and horizontal cut (x-y at z = zc)
  const W = 320;
  const vImg = document.createElement('canvas'); vImg.width = W; vImg.height = Math.max(8, Math.round(W * (z1 - z0) / (2 * R)));
  drawScalarField(vImg.getContext('2d'), grid, opts);
  const zc = Math.min(Math.max(state.zc, z0), z1);
  const hGrid = Grid2D.fromFunction(129, 129, [-R, R, -R, R], (x, y) => source.scalarAt(Math.hypot(x, y), zc));
  const hImg = document.createElement('canvas'); hImg.width = W; hImg.height = W;
  drawScalarField(hImg.getContext('2d'), hGrid, opts);

  // affine for an image covering u in [0,W] -> x in [xa, xb], v in [0,H] -> (plane coords)
  const drawVertical = () => {
    const a = (2 * R / vImg.width) * ex[0] * s, b = (2 * R / vImg.width) * ex[1] * s;
    const c = -((z1 - z0) / vImg.height) * ez[0] * s, d = -((z1 - z0) / vImg.height) * ez[1] * s;
    const [e, f] = P(-R, 0, z1);
    ctx.save(); ctx.setTransform(a, b, c, d, e, f); ctx.drawImage(vImg, 0, 0); ctx.restore();
  };
  const drawHorizontalHalf = (back) => {
    const a = (2 * R / W) * ex[0] * s, b = (2 * R / W) * ex[1] * s;
    const c = -(2 * R / W) * ey[0] * s, d = -(2 * R / W) * ey[1] * s; // v increases -> y decreases (toward viewer)
    const [e, f] = P(-R, R, zc);
    ctx.save(); ctx.setTransform(a, b, c, d, e, f);
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, 2 * Math.PI); ctx.clip();
    ctx.beginPath(); ctx.rect(0, back ? 0 : W / 2, W, W / 2); ctx.clip();
    ctx.drawImage(hImg, 0, 0);
    ctx.restore();
  };
  // Cylinders (device geometry) as outlines: ellipse at z0 and z1 and the two silhouette edges.
  const ellipse = (r, z, stroke, fill) => {
    if (r <= 0) return;
    ctx.save(); ctx.beginPath();
    for (let k = 0; k <= 64; k++) { const th = (2 * Math.PI * k) / 64; const [px, py] = P(r * Math.cos(th), r * Math.sin(th), z); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  };
  const cylinder = (cy, strong) => {
    const col = cy.color ?? 'rgba(255,255,255,0.8)';
    for (const r of [cy.r1, cy.r0]) {
      if (r <= 0) continue;
      ellipse(r, cy.z1, col, strong ? cy.fill ?? null : null);
      ellipse(r, cy.z0, col, null);
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
      for (const sx of [-1, 1]) { const [ax, ay] = P(sx * r, 0, cy.z0), [bx, by] = P(sx * r, 0, cy.z1); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
      ctx.stroke(); ctx.restore();
    }
  };

  // background
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
  const cyls = source.cylinders?.() ?? [];
  if (state.showH) drawHorizontalHalf(true);
  for (const cy of cyls) if (cy.z0 > zc) cylinder(cy, false);   // geometry above the horizontal cut, behind the vertical plane: outlines only
  if (state.showV) drawVertical();
  if (state.showH) drawHorizontalHalf(false);
  for (const cy of cyls) cylinder(cy, true);
  // axis and labels
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath();
  const [ax, ay] = P(0, 0, z0 - 0.05 * (z1 - z0)), [bx, by] = P(0, 0, z1 + 0.05 * (z1 - z0)); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#ddd'; ctx.font = '12px system-ui';
  ctx.fillText(`vertical cut through the axis; horizontal cut at z = ${(zc * 1e3).toFixed(2)} mm; colour = ${shell.tab.layers.find((L) => L.id === shell.colorLayer)?.label ?? 'none'}`, 12, h - 10);
  for (const cy of cyls) if (cy.label) { const [lx, ly] = P(cy.r1, 0, cy.z1); ctx.fillText(cy.label, lx + 6, ly - 4); }
}
