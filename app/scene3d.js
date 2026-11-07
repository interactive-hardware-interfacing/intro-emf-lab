// Small 3D helpers shared by the 3D tabs (3D point charges, Gauss's law): an orbitable
// orthographic camera, axis-aligned cut planes painted with a colour layer, a box outline,
// shaded spheres for charges, 3D field-line tracing, and drag-to-orbit. Pure canvas 2D:
// each axis-aligned plane projects to a parallelogram, so its image is drawn with one
// affine transform. Depth (the third value P returns) increases away from the viewer.

import { drawScalarField } from '../core/render.js';

/**
 * Orthographic camera looking at `center`, orbited by azimuth az and elevation el.
 * Returns { P(x, y, z) -> [sx, sy, depth], s }; `size` is the world span that fills the view.
 */
export function camera(w, h, { center, size, az, el }) {
  const [cx, cy, cz] = center;
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const s = 0.78 * Math.min(w, h) / size;
  const P = (x, y, z) => {
    const xr = (x - cx) * ca - (y - cy) * sa;
    const yr = (x - cx) * sa + (y - cy) * ca;
    return [w / 2 + xr * s, h / 2 - ((z - cz) * ce + yr * se) * s, yr * ce - (z - cz) * se];
  };
  return { P, s };
}

/** Depth of a world point, for painter's-algorithm sorting. */
export const depthOf = (P, p) => P(...p)[2];

/**
 * Paint a planar image: `grid` is a Grid2D whose u axis runs o -> u and v axis o -> v in
 * world space. Returns the colour range drawScalarField used.
 */
export function drawPlane(ctx, P, { grid, o, u, v, label, opts, alpha = 0.92 }) {
  const img = document.createElement('canvas'); img.width = 256; img.height = 256;
  const range = drawScalarField(img.getContext('2d'), grid, opts);
  const [ox, oy] = P(...o), [ux, uy] = P(...u), [vx, vy] = P(...v);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setTransform((ux - ox) / 256, (uy - oy) / 256, (vx - ox) / 256, (vy - oy) / 256, ox, oy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  const [wx, wy] = P(u[0] + v[0] - o[0], u[1] + v[1] - o[1], u[2] + v[2] - o[2]);
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ux, uy); ctx.lineTo(wx, wy); ctx.lineTo(vx, vy); ctx.closePath(); ctx.stroke();
  if (label) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '11px system-ui'; ctx.fillText(label, ox + 4, oy - 4); }
  ctx.restore();
  return range;
}

/** Wireframe of the axis-aligned box {x:[x0,x1], y:[..], z:[..]} with axis labels. */
export function drawBoxOutline(ctx, P, box, { color = 'rgba(255,255,255,0.25)', labels = true } = {}) {
  const [x0, x1] = box.x, [y0, y1] = box.y, [z0, z1] = box.z;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1;
  const C = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, b] of E) { const [ax, ay] = P(...C[a]), [bx, by] = P(...C[b]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  if (labels) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '11px system-ui';
    const lab = (p, t) => { const [lx, ly] = P(...p); ctx.fillText(t, lx + 4, ly + 12); };
    lab([x1, y0, z0], 'x'); lab([x0, y1, z0], 'y'); lab([x0, y0, z1], 'z');
  }
  ctx.restore();
}

/** Shaded sphere marker for a charge, red for positive and blue for negative, with a label. */
export function drawChargeSphere(ctx, s, q, label, r = 9) {
  const g = ctx.createRadialGradient(s[0] - r / 3, s[1] - r / 3, 1, s[0], s[1], r);
  g.addColorStop(0, q > 0 ? '#ff9a9e' : '#9ec5ff'); g.addColorStop(1, q > 0 ? '#c0282d' : '#1d4ed8');
  ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  if (label != null) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(label), s[0], s[1]); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
}

/**
 * Trace E field lines in 3D from each charge (golden-spiral seeds on a small sphere) and
 * draw them shaded by depth. `field(p)` returns { E: [Ex, Ey, Ez] }; `inside(p)` bounds
 * the trace; `stop(p)` ends it (e.g. near another charge).
 */
export function drawFieldLines3d(ctx, P, charges, field, { density = 10, hStep = 0.004, inside, stop, seedR = 0.008, maxSteps = 700 } = {}) {
  ctx.save(); ctx.lineWidth = 1;
  for (const c of charges) {
    const dir = c.q > 0 ? 1 : -1;
    for (let k = 0; k < density; k++) {
      const t = (k + 0.5) / density, phi = Math.acos(1 - 2 * t), th = Math.PI * (1 + Math.sqrt(5)) * k;
      let p = [c.pos[0] + seedR * Math.sin(phi) * Math.cos(th), c.pos[1] + seedR * Math.sin(phi) * Math.sin(th), c.pos[2] + seedR * Math.cos(phi)];
      const pts = [P(...p)];
      for (let n = 0; n < maxSteps; n++) {
        const e1 = field(p).E, m1 = Math.hypot(...e1); if (!(m1 > 0)) break;
        const mid = [p[0] + dir * hStep * 0.5 * e1[0] / m1, p[1] + dir * hStep * 0.5 * e1[1] / m1, p[2] + dir * hStep * 0.5 * e1[2] / m1];
        const e2 = field(mid).E, m2 = Math.hypot(...e2); if (!(m2 > 0)) break;
        p = [p[0] + dir * hStep * e2[0] / m2, p[1] + dir * hStep * e2[1] / m2, p[2] + dir * hStep * e2[2] / m2];
        pts.push(P(...p));
        if ((inside && !inside(p)) || (stop && stop(p))) break;
      }
      ctx.beginPath();
      pts.forEach(([sx, sy], i) => (i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)));
      const d = pts[Math.floor(pts.length / 2)][2];
      ctx.strokeStyle = `rgba(255,255,255,${(0.75 - 0.9 * d).toFixed(2)})`;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Drag-to-orbit on a canvas (bound once); onChange(az, el) receives the new angles. */
export function bindOrbit(canvas, cam, onChange) {
  if (canvas.dataset.orbit === '1') return;
  canvas.dataset.orbit = '1';
  let last = null;
  canvas.addEventListener('pointerdown', (e) => { last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    cam.az += (e.clientX - last[0]) * 0.01;
    cam.el = Math.min(1.5, Math.max(0, cam.el + (e.clientY - last[1]) * 0.01));
    last = [e.clientX, e.clientY];
    onChange(cam.az, cam.el);
  });
  canvas.addEventListener('pointerup', () => { last = null; });
}
