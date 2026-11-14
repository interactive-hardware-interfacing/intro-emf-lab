// Ampère's law: closed-form 2-D current distributions (currents along z, fields in the x-y
// plane), an Amperian loop (circle or rectangle) cut into segments, the circulation
// ∮ B·dl by midpoint quadrature on those segments, and the enclosed current by geometry.
// Everything here is pure functions on plain objects so the bench can check it.
//
// Sources, each { type, ...params } with B(p) -> [Bx, By] and the enclosed current for a loop:
//   wires     { wires: [{ I, pos: [x, y] }] }                 infinite straight wires
//   thick     { I, a }                                          round wire of radius a, uniform J
//   coax      { I, a, b, c }                                    inner conductor radius a, shell b..c, return -I
//   sheet     { K, w }                                          strip x in [-w/2, w/2] at y = 0, K along +z
//   solenoid  { N, I, L, a }                                    cross-section: N turns at y = +a (current +z) and y = -a (-z), x in [-L/2, L/2];
//                                                               a winding that is very wide in z, so B inside points along +x and the
//                                                               Ampère argument is the textbook one (the round solenoid is the Solenoids tab)
//   toroid    { N, I, R1, R2 }                                  cross-section: N turns on the inner circle R1 (+z) and the outer circle R2 (-z)
// Signs: a positive I means current along +z (out of the page); the loop is traversed
// counter-clockwise, so ∮ B·dl = +μ0 I for a positive enclosed current (right-hand rule).

import { MU0, PI } from './constants.js';
import { wiresField, sheetB } from './analytic.js';

// ---------------------------------------------------------------- sources

/** Turns of a solenoid cut lengthwise: axis along x, half-height a, N turns over length L; B inside along +x for I > 0. */
export function solenoidSectionWires(N, I, L, a) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const x = N === 1 ? 0 : -L / 2 + (L * (k + 0.5)) / N;
    out.push({ I: I, pos: [x, a] }, { I: -I, pos: [x, -a] });
  }
  return out;
}

/** Turns of a toroid cut through its equatorial plane: N on the inner circle R1 (+z), N on the outer R2 (-z). */
export function toroidSectionWires(N, I, R1, R2) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const th = (2 * PI * (k + 0.5)) / N;
    out.push({ I: I, pos: [R1 * Math.cos(th), R1 * Math.sin(th)] }, { I: -I, pos: [R2 * Math.cos(th), R2 * Math.sin(th)] });
  }
  return out;
}

/** Current enclosed by a circle of radius r about the axis for the round-wire sources. */
export function radialIenc(src, r) {
  if (src.type === 'thick') return r >= src.a ? src.I : src.I * (r * r) / (src.a * src.a);
  if (src.type === 'coax') {
    const { I, a, b, c } = src;
    if (r < a) return I * (r * r) / (a * a);
    if (r < b) return I;
    if (r < c) return I * (1 - (r * r - b * b) / (c * c - b * b));
    return 0;
  }
  return NaN;
}

/** Current density J_z at a point for the distributed sources (A/m^2); 0 for wire-type sources. */
export function currentDensity(src, p) {
  const r = Math.hypot(p[0], p[1]);
  if (src.type === 'thick') return r < src.a ? src.I / (PI * src.a * src.a) : 0;
  if (src.type === 'coax') {
    const { I, a, b, c } = src;
    if (r < a) return I / (PI * a * a);
    if (r >= b && r < c) return -I / (PI * (c * c - b * b));
    return 0;
  }
  return 0;
}

/** The wires of a wire-type source (wires, solenoid, toroid); [] otherwise. */
export function sourceWires(src) {
  if (src.type === 'wires') return src.wires;
  if (src.type === 'solenoid') return src._wires ??= solenoidSectionWires(src.N, src.I, src.L, src.a);
  if (src.type === 'toroid') return src._wires ??= toroidSectionWires(src.N, src.I, src.R1, src.R2);
  return [];
}

/**
 * Sheet current along +z: strip x in [-w/2, w/2] in the plane y = 0 with density K.
 * analytic.sheetB has the strip in z = 0 with current along +y; the right-handed map
 * (X, Y, Z) = (-x, z, y) carries that to this one, so Bx = -BX(-x, y), By = BZ(-x, y).
 */
export function sheetAlongZB(K, w, x, y) {
  const [bX, bZ] = sheetB(K, w, -x, y);
  return [-bX, bZ];
}

/** B at p for any source. [Bx, By]; NaN on a wire. */
export function sourceB(src, p) {
  if (src.type === 'thick' || src.type === 'coax') {
    const r = Math.hypot(p[0], p[1]);
    if (r === 0) return [0, 0];
    const f = (MU0 * radialIenc(src, r)) / (2 * PI * r * r);
    return [-f * p[1], f * p[0]];
  }
  if (src.type === 'sheet') return sheetAlongZB(src.K, src.w, p[0], p[1]);
  return wiresField(sourceWires(src), p).B;
}

/** A_z where it is cheap (wire-type sources); NaN otherwise. */
export function sourceAz(src, p, rRef = 1) {
  const w = sourceWires(src);
  if (!w.length) return NaN;
  return wiresField(w, p, rRef).Az;
}

// ---------------------------------------------------------------- the loop

/**
 * Cut a loop into segments { c: midpoint, t: unit tangent (counter-clockwise), dl, s: arc length at the midpoint, side }.
 *   loop = { shape: 'circle', cx, cy, R } | { shape: 'rect', cx, cy, w, h }
 *   n = total number of segments (a rectangle gets n/4 per side, at least 1)
 */
export function loopSegments(loop, n = 64) {
  const out = [];
  if (loop.shape === 'circle') {
    const { cx, cy, R } = loop, dth = (2 * PI) / n;
    for (let k = 0; k < n; k++) {
      const th = (k + 0.5) * dth;
      out.push({ c: [cx + R * Math.cos(th), cy + R * Math.sin(th)], t: [-Math.sin(th), Math.cos(th)], dl: R * dth, s: R * th, side: 'circle' });
    }
    return out;
  }
  const { cx, cy, w, h } = loop, m = Math.max(1, Math.round(n / 4));
  const corners = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
  const names = ['bottom', 'right', 'top', 'left'];
  let s = 0;
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], dl = len / m;
    for (let k = 0; k < m; k++) { const f = (k + 0.5) / m; out.push({ c: [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])], t, dl, s: s + (k + 0.5) * dl, side: names[e] }); }
    s += len;
  }
  return out;
}

export function loopLength(loop) { return loop.shape === 'circle' ? 2 * PI * loop.R : 2 * (loop.w + loop.h); }

export function pointInLoop(loop, p) {
  if (loop.shape === 'circle') return Math.hypot(p[0] - loop.cx, p[1] - loop.cy) < loop.R;
  return Math.abs(p[0] - loop.cx) < loop.w / 2 && Math.abs(p[1] - loop.cy) < loop.h / 2;
}

/** ∮ B·dl by the midpoint rule on the segments; fills seg.Bt and returns { circ, segments }. */
export function circulation(src, segments, ccw = true) {
  let circ = 0;
  const sgn = ccw ? 1 : -1;
  for (const g of segments) {
    const B = sourceB(src, g.c);
    g.B = B;
    g.Bt = sgn * (B[0] * g.t[0] + B[1] * g.t[1]);
    g.Bmag = Math.hypot(B[0], B[1]);
    circ += g.Bt * g.dl;
  }
  return { circ, segments };
}

/**
 * Current enclosed by the loop, by geometry: wires by point-in-loop, the sheet by the length
 * of strip inside, and distributed J by a radial integral with nq steps per conductor (see
 * below). Returns { I, parts: [{ label, I }] }.
 */
export function enclosedCurrent(src, loop, nq = 400) {
  const parts = [];
  let I = 0;
  const wires = sourceWires(src);
  if (wires.length) {
    if (src.type === 'wires') wires.forEach((w, k) => { if (pointInLoop(loop, w.pos)) { parts.push({ label: `wire ${k + 1}`, I: w.I }); I += w.I; } });
    else {
      let plus = 0, minus = 0, nPlus = 0, nMinus = 0;
      for (const w of wires) if (pointInLoop(loop, w.pos)) { if (w.I > 0) { plus += w.I; nPlus++; } else { minus += w.I; nMinus++; } }
      if (nPlus) parts.push({ label: `${nPlus} turn${nPlus > 1 ? 's' : ''} out of the page`, I: plus });
      if (nMinus) parts.push({ label: `${nMinus} turn${nMinus > 1 ? 's' : ''} into the page`, I: minus });
      I = plus + minus;
    }
    return { I, parts };
  }
  if (src.type === 'sheet') {
    // length of the strip y = 0, |x| <= w/2 that lies inside the loop
    let lo = -Infinity, hi = Infinity;
    if (loop.shape === 'circle') { if (Math.abs(loop.cy) >= loop.R) return { I: 0, parts }; const half = Math.sqrt(loop.R * loop.R - loop.cy * loop.cy); lo = loop.cx - half; hi = loop.cx + half; }
    else { if (Math.abs(loop.cy) >= loop.h / 2) return { I: 0, parts }; lo = loop.cx - loop.w / 2; hi = loop.cx + loop.w / 2; }
    const len = Math.max(0, Math.min(hi, src.w / 2) - Math.max(lo, -src.w / 2));
    if (len > 0) parts.push({ label: `K × ${(len * 1e3).toFixed(2)} mm of sheet`, I: src.K * len });
    return { I: src.K * len, parts };
  }
  // distributed J (round conductors about the origin): J depends on r only, so integrate
  // J(r) r θ_in(r) dr region by region, where θ_in(r) is the angle of the circle of radius r
  // that lies inside the loop. For a circular loop θ_in is analytic; for a rectangle it is
  // sampled on a fine set of angles. A loop that contains a whole conductor gets its current
  // exactly (θ_in = 2π throughout), so the coax outside reads zero, not a quadrature residue.
  const regions = src.type === 'thick' ? [{ r0: 0, r1: src.a, J: src.I / (PI * src.a * src.a), label: 'J × area inside the loop' }]
    : [{ r0: 0, r1: src.a, J: src.I / (PI * src.a * src.a), label: 'inner conductor (J × area inside)' }, { r0: src.b, r1: src.c, J: -src.I / (PI * (src.c * src.c - src.b * src.b)), label: 'outer shell (J × area inside)' }];
  const d = Math.hypot(loop.cx, loop.cy);
  const thetaIn = (r) => {
    if (r === 0) return pointInLoop(loop, [0, 0]) ? 2 * PI : 0;
    if (loop.shape === 'circle') {
      const R = loop.R;
      if (r + d <= R) return 2 * PI;          // the circle of radius r is wholly inside the loop
      if (d + R <= r || Math.abs(R - r) >= d && r >= R) return 0; // wholly outside (or the loop inside it)
      const c = (r * r + d * d - R * R) / (2 * r * d);
      return 2 * Math.acos(Math.max(-1, Math.min(1, c)));
    }
    const nA = 1440; let inside = 0;
    for (let k = 0; k < nA; k++) { const th = ((k + 0.5) / nA) * 2 * PI; if (pointInLoop(loop, [r * Math.cos(th), r * Math.sin(th)])) inside++; }
    return (2 * PI * inside) / nA;
  };
  for (const g of regions) {
    if (loop.shape === 'rect' && g.r0 === 0) { // rectangle wholly inside the inner conductor: exact area
      const far = Math.hypot(Math.abs(loop.cx) + loop.w / 2, Math.abs(loop.cy) + loop.h / 2);
      if (far <= g.r1) { const Ig = g.J * loop.w * loop.h; parts.push({ label: g.label, I: Ig }); I += Ig; continue; }
    }
    const nr = nq, dr = (g.r1 - g.r0) / nr; let acc = 0;
    for (let k = 0; k < nr; k++) { const r = g.r0 + (k + 0.5) * dr; acc += r * thetaIn(r) * dr; }
    const Ig = g.J * acc;
    if (Math.abs(Ig) > 1e-12 * Math.abs(src.I)) parts.push({ label: g.label, I: Ig });
    I += Ig;
  }
  return { I, parts };
}

/** Exact enclosed current when the loop is a circle centred on a round-wire source (for tests and the panel). */
export function centredIenc(src, loop) {
  if (loop.shape !== 'circle' || Math.hypot(loop.cx, loop.cy) > 1e-12) return NaN;
  return radialIenc(src, loop.R);
}

/** The textbook field of each source where it has one, for the panel. */
export function textbookB(src, p) {
  const r = Math.hypot(p[0], p[1]);
  switch (src.type) {
    case 'thick': case 'coax': return { label: 'μ₀ I_enc(r) / (2πr)', B: r > 0 ? (MU0 * radialIenc(src, r)) / (2 * PI * r) : 0 };
    case 'sheet': return { label: 'μ₀K/2 (infinite sheet)', B: (MU0 * src.K) / 2 };
    case 'solenoid': return { label: 'μ₀ n I = μ₀ N I / L (long solenoid, inside)', B: (MU0 * src.N * src.I) / src.L };
    case 'toroid': return { label: 'μ₀ N I / (2πr) (inside the winding)', B: r > 0 && r > src.R1 && r < src.R2 ? (MU0 * src.N * src.I) / (2 * PI * r) : 0 };
    default: return null;
  }
}
