// Canvas rendering for 2D fields: colour maps, quiver arrows, streamlines, contour lines.
// Everything draws into a CanvasRenderingContext2D through a Viewport that maps physical
// metres to pixels. No DOM creation here; the shell owns the canvases.

import { Grid2D } from './grid.js';

// ---------------------------------------------------------------- viewport

export class Viewport {
  /**
   * @param {[number,number,number,number]} extent [xmin, xmax, ymin, ymax] metres
   * @param {number} width  pixels
   * @param {number} height pixels
   */
  constructor(extent, width, height) {
    this.extent = extent;
    this.width = width;
    this.height = height;
  }
  /** metres -> pixels. y is flipped so +y is up on screen. */
  toPx(x, y) {
    const [x0, x1, y0, y1] = this.extent;
    return [((x - x0) / (x1 - x0)) * this.width, (1 - (y - y0) / (y1 - y0)) * this.height];
  }
  /** pixels -> metres. */
  toWorld(px, py) {
    const [x0, x1, y0, y1] = this.extent;
    return [x0 + (px / this.width) * (x1 - x0), y0 + (1 - py / this.height) * (y1 - y0)];
  }
  /** metres per pixel along x. */
  get scale() { return (this.extent[1] - this.extent[0]) / this.width; }
}

// ---------------------------------------------------------------- colour maps

// Viridis, 9 control points, linearly interpolated. Perceptually uniform, colour-blind safe.
const VIRIDIS = [
  [68, 1, 84], [72, 36, 117], [65, 68, 135], [53, 95, 141], [42, 120, 142],
  [33, 145, 140], [34, 168, 132], [68, 191, 112], [122, 209, 81], [189, 223, 38], [253, 231, 37],
];
// Diverging blue-white-red for signed quantities (V, A_z, B_z).
const COOLWARM = [
  [59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249], [221, 221, 221],
  [245, 196, 173], [244, 154, 123], [222, 96, 77], [180, 4, 38],
];

export const COLORMAPS = { viridis: VIRIDIS, coolwarm: COOLWARM };

/** Returns a function t in [0,1] -> [r, g, b]. */
export function colormap(name = 'viridis') {
  const stops = COLORMAPS[name] ?? VIRIDIS;
  const n = stops.length - 1;
  return (t) => {
    if (!Number.isFinite(t)) return [0, 0, 0];
    t = Math.min(Math.max(t, 0), 1) * n;
    const i = Math.min(Math.floor(t), n - 1);
    const f = t - i;
    const a = stops[i], b = stops[i + 1];
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
  };
}

/**
 * Paint a scalar grid as a colour map filling the canvas.
 * opts: { min, max, map: 'viridis'|'coolwarm', log: false, extent }
 * When min/max are omitted the grid's own range is used. With log, |value| is mapped on a
 * log10 scale between min and max (both must be > 0). `extent` is the physical window the
 * canvas shows (default: the grid's own extent); the grid is sampled there, so a zoomed
 * view paints only the zoomed region.
 */
/**
 * Colour bounds for a scalar layer: the caller's min/max when finite (and, on a log scale,
 * positive), else the grid's own range; on a log scale an all-zero or empty grid falls back
 * to a decade around 1 rather than 1e-300, and max is kept above min.
 */
export function scalarBounds(grid, opts = {}) {
  const ok = (v) => v !== undefined && v !== null && Number.isFinite(+v) && (!opts.log || +v > 0);
  let lo, hi;
  if (opts.log) {
    let plo = Infinity, phi = -Infinity;
    for (const v of grid.data) { const a = Math.abs(v); if (Number.isFinite(a) && a > 0) { if (a < plo) plo = a; if (a > phi) phi = a; } }
    if (!(plo < Infinity)) { plo = 0.1; phi = 10; }
    lo = ok(opts.min) ? +opts.min : plo;
    hi = ok(opts.max) ? +opts.max : phi;
    lo = Math.log10(lo); hi = Math.log10(hi);
  } else {
    [lo, hi] = grid.range();
    if (ok(opts.min)) lo = +opts.min;
    if (ok(opts.max)) hi = +opts.max;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  }
  if (!(hi > lo)) hi = lo + (opts.log ? 1 : Math.abs(lo) || 1);
  return [lo, hi];
}

export function drawScalarField(ctx, grid, opts = {}) {
  const { width, height } = ctx.canvas;
  const cmap = colormap(opts.map);
  const [lo, hi] = scalarBounds(grid, opts);
  const span = hi - lo || 1;

  const img = ctx.createImageData(width, height);
  const px = img.data;
  const [x0, x1, y0, y1] = opts.extent ?? grid.extent;
  for (let py = 0; py < height; py++) {
    const y = y1 - ((py + 0.5) / height) * (y1 - y0);
    for (let pxi = 0; pxi < width; pxi++) {
      const x = x0 + ((pxi + 0.5) / width) * (x1 - x0);
      let v = grid.sample(x, y);
      if (opts.log) v = Math.log10(Math.max(Math.abs(v), 1e-300));
      const [r, g, b] = cmap((v - lo) / span);
      const k = (py * width + pxi) * 4;
      px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { min: lo, max: hi };
}

/**
 * Draw a colour bar legend into its own small canvas. Horizontal (min at left) when the
 * canvas is wider than tall, otherwise vertical (max at top).
 */
export function drawColorbar(ctx, opts = {}) {
  const { width, height } = ctx.canvas;
  const cmap = colormap(opts.map);
  const img = ctx.createImageData(width, height);
  const horizontal = width > height;
  for (let py = 0; py < height; py++) {
    for (let x = 0; x < width; x++) {
      const t = horizontal ? x / (width - 1) : 1 - py / (height - 1);
      const [r, g, b] = cmap(t);
      const k = (py * width + x) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- quiver

/**
 * Arrows for a vector field. fieldFn(x, y) -> [fx, fy] in physical units.
 * opts: { spacing: px between arrows, color, normalize: true (equal-length arrows showing
 * direction only) | false (length ~ log magnitude), maxLen }
 */
export function drawQuiver(ctx, view, fieldFn, opts = {}) {
  const spacing = opts.spacing ?? 28;
  const color = opts.color ?? 'rgba(255,255,255,0.9)';
  const normalize = opts.normalize ?? true;
  const maxLen = opts.maxLen ?? spacing * 0.8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;

  // Pass 1: magnitudes, for the log scaling when not normalized.
  const samples = [];
  let lmin = Infinity, lmax = -Infinity;
  for (let py = spacing / 2; py < view.height; py += spacing) {
    for (let px = spacing / 2; px < view.width; px += spacing) {
      const [x, y] = view.toWorld(px, py);
      const [fx, fy] = fieldFn(x, y);
      const m = Math.hypot(fx, fy);
      if (!Number.isFinite(m) || m === 0) continue;
      const lm = Math.log10(m);
      lmin = Math.min(lmin, lm); lmax = Math.max(lmax, lm);
      samples.push([px, py, fx / m, -fy / m, lm]);
    }
  }
  const span = lmax - lmin || 1;
  for (const [px, py, ux, uy, lm] of samples) {
    const len = normalize ? maxLen : maxLen * (0.25 + 0.75 * (lm - lmin) / span);
    arrow(ctx, px - ux * len / 2, py - uy * len / 2, px + ux * len / 2, py + uy * len / 2);
  }
  ctx.restore();
}

function arrow(ctx, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  const head = Math.min(6, len * 0.4);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * ux + head * 0.5 * uy, y1 - head * uy - head * 0.5 * ux);
  ctx.lineTo(x1 - head * ux - head * 0.5 * uy, y1 - head * uy + head * 0.5 * ux);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- streamlines

/**
 * Trace field lines with RK2 (midpoint) steps of fixed pixel length from each seed.
 * seeds: [[x, y], ...] in metres. Each seed is traced both forward and backward.
 * opts: { stepPx: 2, maxSteps: 2000, color, stopFn(x,y) -> true to stop (e.g. inside a conductor) }
 */
export function drawStreamlines(ctx, view, fieldFn, seeds, opts = {}) {
  const stepPx = opts.stepPx ?? 2;
  const maxSteps = opts.maxSteps ?? 1500;
  const h = stepPx * view.scale; // metres per step
  ctx.save();
  ctx.strokeStyle = opts.color ?? 'rgba(255,255,255,0.75)';
  ctx.lineWidth = opts.lineWidth ?? 1;
  const [x0, x1, y0, y1] = view.extent;
  const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

  for (const [sx, sy] of seeds) {
    for (const dir of [1, -1]) {
      let x = sx, y = sy;
      ctx.beginPath();
      const [px, py] = view.toPx(x, y);
      ctx.moveTo(px, py);
      for (let n = 0; n < maxSteps; n++) {
        const [fx, fy] = fieldFn(x, y);
        const m = Math.hypot(fx, fy);
        if (!Number.isFinite(m) || m === 0) break;
        const mx = x + dir * h * 0.5 * fx / m, my = y + dir * h * 0.5 * fy / m;
        const [gx, gy] = fieldFn(mx, my);
        const gm = Math.hypot(gx, gy);
        if (!Number.isFinite(gm) || gm === 0) break;
        x += dir * h * gx / gm;
        y += dir * h * gy / gm;
        if (!inside(x, y)) break;
        if (opts.stopFn && opts.stopFn(x, y)) break;
        const [qx, qy] = view.toPx(x, y);
        ctx.lineTo(qx, qy);
      }
      ctx.stroke();
      // Arrowhead at the forward end of the forward trace
      if (dir === 1) {
        const [fx, fy] = fieldFn(x, y);
        const m = Math.hypot(fx, fy);
        if (Number.isFinite(m) && m > 0) {
          const [qx, qy] = view.toPx(x, y);
          ctx.fillStyle = ctx.strokeStyle;
          arrow(ctx, qx - 6 * fx / m, qy + 6 * fy / m, qx, qy);
        }
      }
    }
  }
  ctx.restore();
}

/** Seeds on a small circle around a point source, for field lines leaving a charge/wire. */
export function radialSeeds(cx, cy, r, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n;
    out.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
  }
  return out;
}

// ---------------------------------------------------------------- contours

/**
 * Marching-squares contour lines of a scalar grid at the given levels.
 * opts: { color, lineWidth, labels: false }
 */
export function drawContours(ctx, view, grid, levels, opts = {}) {
  ctx.save();
  ctx.strokeStyle = opts.color ?? 'rgba(255,255,255,0.6)';
  ctx.lineWidth = opts.lineWidth ?? 1;
  const { nx, ny } = grid;
  for (const lv of levels) {
    ctx.beginPath();
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = grid.get(i, j), b = grid.get(i + 1, j), c = grid.get(i + 1, j + 1), d = grid.get(i, j + 1);
        if (![a, b, c, d].every(Number.isFinite)) continue;
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const xa = grid.x(i), xb = grid.x(i + 1), ya = grid.y(j), yb = grid.y(j + 1);
        // Edge interpolation points: top (a-b), right (b-c), bottom (d-c), left (a-d)
        const t = (p, q) => (lv - p) / (q - p);
        const top = [xa + t(a, b) * (xb - xa), ya];
        const right = [xb, ya + t(b, c) * (yb - ya)];
        const bottom = [xa + t(d, c) * (xb - xa), yb];
        const left = [xa, ya + t(a, d) * (yb - ya)];
        const segs = MS_SEGMENTS[idx];
        for (const [e0, e1] of segs) {
          const p0 = [top, right, bottom, left][e0];
          const p1 = [top, right, bottom, left][e1];
          const [px0, py0] = view.toPx(p0[0], p0[1]);
          const [px1, py1] = view.toPx(p1[0], p1[1]);
          ctx.moveTo(px0, py0);
          ctx.lineTo(px1, py1);
        }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Marching squares lookup: case index (a,b,c,d bits) -> list of [edge0, edge1] segments.
// Edges: 0 top, 1 right, 2 bottom, 3 left. Saddles (5, 10) resolved without centre test.
const MS_SEGMENTS = {
  1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]],
  8: [[0, 3]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
};

/** n evenly spaced levels strictly between lo and hi. */
export function levelsBetween(lo, hi, n) {
  const out = [];
  for (let k = 1; k <= n; k++) out.push(lo + ((hi - lo) * k) / (n + 1));
  return out;
}

// ---------------------------------------------------------------- markers

/** Draw a filled circle with an outline at physical (x, y). */
export function drawMarker(ctx, view, x, y, opts = {}) {
  const [px, py] = view.toPx(x, y);
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, opts.radius ?? 6, 0, 2 * Math.PI);
  ctx.fillStyle = opts.fill ?? '#fff';
  ctx.strokeStyle = opts.stroke ?? '#000';
  ctx.lineWidth = opts.lineWidth ?? 1.5;
  ctx.fill();
  ctx.stroke();
  if (opts.label) {
    ctx.fillStyle = opts.labelColor ?? '#000';
    ctx.font = `${opts.fontSize ?? 11}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.label, px, py);
  }
  ctx.restore();
}

/** Red X probe marker, as in the COMSOL apps. */
export function drawProbeMarker(ctx, view, x, y) {
  const [px, py] = view.toPx(x, y);
  ctx.save();
  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py + 6);
  ctx.moveTo(px - 6, py + 6); ctx.lineTo(px + 6, py - 6);
  ctx.stroke();
  ctx.restore();
}

export { Grid2D };
