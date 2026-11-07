// Checks for the 2-D FDTD solver (core/fdtd2d.js): wave speed, open boundaries, and
// reflection coefficients against the 1-D textbook values. All use a plane wave from a
// line source so the problem is effectively one-dimensional along x.

import { FDTD2D, C0, fillRect } from '../core/fdtd2d.js';

function planeWaveBox({ nx = 401, ny = 41, h = 0.01, f = 1e9 } = {}) {
  const s = new FDTD2D(nx, ny, { h, yWall: 'mirror' });
  s.addSource({ kind: 'line', i: 20, wave: 'pulse', f });
  return s;
}

/** Time of the peak |Ez| at (i, j) over nSteps. */
function peakTime(s, i, j, nSteps) {
  let best = 0, tBest = 0;
  for (let n = 0; n < nSteps; n++) { s.step(1); const v = Math.abs(s.ez(i, j)); if (v > best) { best = v; tBest = s.t; } }
  return [tBest, best];
}

const peakOf = (a) => a.reduce((b, p) => (Math.abs(p[1]) > Math.abs(b[1]) ? p : b));

export function fdtdChecks(check) {
  // 1. Free-space pulse speed: the peak reaches two probes 2 m apart with a delay of 2/c.
  {
    const s = planeWaveBox();
    s.setTrace(320, 20);
    const t1 = [], t2 = [];
    for (let n = 0; n < 1400; n++) { s.step(1); t1.push([s.t, s.ez(120, 20)]); t2.push([s.t, s.ez(320, 20)]); }
    const dt = peakOf(t2)[0] - peakOf(t1)[0];
    check('fdtd: free-space pulse travels 2 m in 2/c (1%)', dt, 2 / C0, 1e-2);
    check('fdtd: pulse amplitude survives the trip (plane wave, 2%)', Math.abs(peakOf(t2)[1]) / Math.abs(peakOf(t1)[1]), 1, 2e-2);
    check('fdtd: trace records every step', s.trace.v.length, 1400, 0);
  }
  // 2. Energy bounded with the Mur walls: after the pulse has left, the stored energy is a
  //    small fraction of its peak and does not grow.
  {
    const s = new FDTD2D(101, 101, { h: 0.01 });
    s.addSource({ kind: 'point', i: 50, j: 50, wave: 'pulse', f: 1e9 });
    let peak = 0, late = 0, later = 0;
    for (let n = 0; n < 900; n++) { s.step(1); const W = s.energy(); if (W > peak) peak = W; if (n === 599) late = W; if (n === 899) later = W; }
    check('fdtd: energy after the pulse exits < 2% of the peak (Mur ABC)', late / peak < 0.02 ? 1 : 0, 1, 0);
    check('fdtd: energy keeps falling (no late growth)', later <= late * 1.01 ? 1 : 0, 1, 0);
  }
  // 3. Dielectric half-space: reflection = (1 - n) / (1 + n), transmission = 2 / (1 + n).
  //    Source at x = 0.2 m, interface at x = 3.5 m, probes at 2.5 m (incident, then reflected)
  //    and 4.5 m (transmitted). The pulse (tau = 0.5 ns, centred at t0 = 1.5 ns) is 1.5 ns wide.
  {
    const n_ = 2, s = planeWaveBox({ nx: 601 });
    fillRect(s, 3.5, 6.0, 0, 0.4, { epsR: n_ * n_ });
    const inc = [], tr = [];
    for (let n = 0; n < 1500; n++) { s.step(1); inc.push([s.t, s.ez(250, 20)]); tr.push([s.t, s.ez(450, 20)]); }
    const tSplit = 3.3 / C0 + 1.5e-9; // between the incident (2.3 m) and reflected (4.3 m) arrivals
    const first = peakOf(inc.filter((p) => p[0] < tSplit));
    const second = peakOf(inc.filter((p) => p[0] > tSplit));
    const tpk = peakOf(tr);
    check('fdtd: reflection off n = 2 half-space is (1-n)/(1+n) (3%)', second[1] / first[1], (1 - n_) / (1 + n_), 3e-2);
    check('fdtd: transmission into n = 2 half-space is 2/(1+n) (3%)', tpk[1] / first[1], 2 / (1 + n_), 3e-2);
  }
  // 4. PEC wall at x = 3.0 m, probe at 2.0 m: reflection -1.
  {
    const s = planeWaveBox({ nx: 401 });
    fillRect(s, 3.0, 3.05, 0, 0.4, { pec: 1 });
    const rec = [];
    for (let n = 0; n < 1200; n++) { s.step(1); rec.push([s.t, s.ez(200, 20)]); }
    const tSplit = 2.8 / C0 + 1.5e-9; // incident arrives at 1.8 m / c, reflected at 3.8 m / c
    const first = peakOf(rec.filter((p) => p[0] < tSplit)), second = peakOf(rec.filter((p) => p[0] > tSplit));
    check('fdtd: reflection off a PEC wall is -1 (1%)', second[1] / first[1], -1, 1e-2);
  }
  // 5. Courant number as set
  {
    const s = new FDTD2D(11, 11, { h: 0.01 });
    check('fdtd: dt = 0.99 h / (c sqrt 2)', C0 * s.dt * Math.SQRT2 / s.h, 0.99, 1e-12);
  }
}
