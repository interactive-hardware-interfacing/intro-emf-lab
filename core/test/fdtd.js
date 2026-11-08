// Checks for the 2-D FDTD solver (core/fdtd2d.js): wave speed, open boundaries, and
// reflection coefficients against the 1-D textbook values. All use a plane wave from a
// line source so the problem is effectively one-dimensional along x.

import { FDTD2D, C0, fillRect } from '../fdtd2d.js';

function planeWaveBox({ nx = 401, ny = 41, h = 0.01, f = 1e9, abc = 'pml' } = {}) {
  const s = new FDTD2D(nx, ny, { h, yWall: 'mirror', abc });
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
    // Numerical dispersion: a CW wave's phase velocity on the grid follows the Yee relation
    //   sin^2(w dt/2) / (c dt)^2 = sin^2(k h/2) / h^2   (on-axis), v_p = w/k.
    // At 30 cells per wavelength and S = 0.99/sqrt2 that is v_p/c = 0.99906; measure it from
    // the phase difference between two probes 1 m apart (the 1% peak test above cannot see it).
    {
      const f = 1e9, w = 2 * Math.PI * f, cw = planeWaveBox({ f });
      const srcs = cw.sources; cw.sources = srcs.map((q) => ({ ...q, wave: 'cw' }));
      const h = cw.h, dt = cw.dt;
      const kNum = (2 / h) * Math.asin((h / (C0 * dt)) * Math.sin(w * dt / 2));
      const vYee = w / kNum;
      // steady state after 1400 steps: fit phase at two probes over one period
      const probes = [Math.round(1.0 / h), Math.round(2.0 / h)], acc = probes.map(() => [0, 0]);
      for (let n = 0; n < 1400; n++) cw.step(1);
      const N = Math.round(1 / (f * dt));
      for (let n = 0; n < N; n++) { cw.step(1); probes.forEach((i, p) => { const v = cw.ez(i, 20); acc[p][0] += v * Math.cos(w * cw.t); acc[p][1] += v * Math.sin(w * cw.t); }); }
      const ph = acc.map(([c, s]) => Math.atan2(s, c));
      let dph = ph[1] - ph[0]; while (dph < 0) dph += 2 * Math.PI; while (dph > 2 * Math.PI) dph -= 2 * Math.PI;
      const cycles = Math.floor((probes[1] - probes[0]) * h * kNum / (2 * Math.PI));
      const kMeas = (dph + 2 * Math.PI * cycles) / ((probes[1] - probes[0]) * h);
      check('fdtd: CW phase velocity matches the Yee dispersion relation (1e-4)', w / kMeas, vYee, 1e-4);
      check('fdtd: numerical dispersion at 30 cells/lambda is about -0.1%', vYee / C0, 0.99906, 2e-4);
    }
    check('fdtd: pulse amplitude survives the trip (plane wave, 2%)', Math.abs(peakOf(t2)[1]) / Math.abs(peakOf(t1)[1]), 1, 2e-2);
    check('fdtd: trace records every step', s.trace.v.length, 1400, 0);
  }
  // 2. Energy bounded with the Mur walls: after the pulse has left, the stored energy is a
  //    small fraction of its peak and does not grow.
  {
    for (const abc of ['mur', 'pml']) {
      const s = new FDTD2D(101, 101, { h: 0.01, abc });
      s.addSource({ kind: 'point', i: 50, j: 50, wave: 'pulse', f: 1e9 });
      let peak = 0, late = 0, later = 0;
      for (let n = 0; n < 900; n++) { s.step(1); const W = s.energy(); if (W > peak) peak = W; if (n === 599) late = W; if (n === 899) later = W; }
      check(`fdtd: energy after the pulse exits < 2% of the peak (${abc})`, late / peak < 0.02 ? 1 : 0, 1, 0);
      check(`fdtd: energy keeps falling, no late growth (${abc})`, later <= late * 1.01 ? 1 : 0, 1, 0);
    }
  }
  // 3. Dielectric half-space: reflection = (1 - n) / (1 + n), transmission = 2 / (1 + n).
  //    Source at x = 0.2 m, interface at x = 3.5 m, probes at 2.5 m (incident, then reflected)
  //    and 4.5 m (transmitted). The pulse (tau = 0.5 ns, centred at t0 = 1.5 ns) is 1.5 ns wide.
  {
    const n_ = 2, s = planeWaveBox({ nx: 601, abc: 'mur' });
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
  // 3b. The same slab runs up to the right wall: the Mur wall must absorb with the local wave
  //     speed c/n, or the transmitted pulse comes back. Probe at 4.5 m sees the transmitted
  //     pulse (~19 ns) and, if the wall reflects, an echo after another 3 m at c/2 (~39 ns).
  {
    const n_ = 2, s = planeWaveBox({ nx: 601 });
    fillRect(s, 3.5, 6.0, 0, 0.4, { epsR: n_ * n_ });
    const tr = [];
    for (let n = 0; n < 2600; n++) { s.step(1); tr.push([s.t, s.ez(450, 20)]); }
    const tSplit = 3.3 / C0 + 1.0 / (C0 / n_) + 1.5e-9 + 4e-9;
    const tpk = peakOf(tr.filter((p) => p[0] < tSplit)), echo = peakOf(tr.filter((p) => p[0] > tSplit));
    check('fdtd: Mur wall inside a dielectric (n = 2) reflects < 2% of the transmitted pulse', Math.abs(echo[1] / tpk[1]) < 0.02 ? 1 : 0, 1, 0);
  }
  // 3b'. Same, with the PML: matched in any material by construction.
  {
    const n_ = 2, s = planeWaveBox({ nx: 601 });
    fillRect(s, 3.5, 6.0, 0, 0.4, { epsR: n_ * n_ });
    const tr = [];
    for (let n = 0; n < 2600; n++) { s.step(1); tr.push([s.t, s.ez(450, 20)]); }
    const tSplit = 3.3 / C0 + 1.0 / (C0 / n_) + 1.5e-9 + 4e-9;
    const tpk = peakOf(tr.filter((p) => p[0] < tSplit)), echo = peakOf(tr.filter((p) => p[0] > tSplit));
    check('fdtd: PML inside a dielectric (n = 2) reflects < 2% of the transmitted pulse', Math.abs(echo[1] / tpk[1]) < 0.02 ? 1 : 0, 1, 0);
  }
  // 3c. Open-wall reflection, normal incidence: Mur ~6e-4 here, the PML an order better.
  //     And a grazing case in 2-D: a point source 15 cm from the top wall, probe 1.2 m along
  //     it, against a reference box whose top wall is far away. Mur leaves tens of percent
  //     of the direct peak there; the PML a couple of percent.
  {
    const wallRefl = (abc) => {
      // line source mid-box (x = 3 m), probe at 4.5 m: direct pulse ~5-7 ns, right-wall echo ~15 ns
      const s = new FDTD2D(601, 11, { h: 0.01, yWall: 'mirror', abc }); s.addSource({ kind: 'line', i: 300, f: 1e9 }); s.setTrace(450, 5);
      for (let n = 0; n < 1000; n++) s.step(1);
      let dir = 0, ref = 0;
      for (let k = 0; k < s.trace.v.length; k++) { const v = Math.abs(s.trace.v[k]); if (s.trace.t[k] < 11e-9) dir = Math.max(dir, v); else ref = Math.max(ref, v); }
      return ref / dir;
    };
    const rMur = wallRefl('mur'), rPml = wallRefl('pml');
    check('fdtd: Mur wall reflection at normal incidence < 1e-3', rMur < 1e-3 ? 1 : 0, 1, 0);
    check('fdtd: PML wall reflection at normal incidence < 1e-4', rPml < 1e-4 ? 1 : 0, 1, 0);
    const grazing = (abc) => {
      const n = 201, h = 0.01;
      const g = new FDTD2D(n, n, { h, abc }); g.addSource({ i: 40, j: 185, f: 1e9 }); g.setTrace(160, 185);
      const r = new FDTD2D(n, 401, { h, abc }); r.addSource({ i: 40, j: 185, f: 1e9 }); r.setTrace(160, 185);
      for (let k = 0; k < 900; k++) { g.step(1); r.step(1); }
      let err = 0, pk = 0;
      for (let k = 0; k < g.trace.v.length; k++) { err = Math.max(err, Math.abs(g.trace.v[k] - r.trace.v[k])); pk = Math.max(pk, Math.abs(r.trace.v[k])); }
      return err / pk;
    };
    const gMur = grazing('mur'), gPml = grazing('pml');
    check('fdtd: PML error at grazing incidence < 5% of the direct peak', gPml < 0.05 ? 1 : 0, 1, 0);
    check('fdtd: PML beats Mur at grazing incidence by 10x or more', gMur / gPml > 10 ? 1 : 0, 1, 0);
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

  // 7. A paint stroke while a wave is inside the PML must not disturb it: materials change in
  //    place (worker cmd "materials"), so prepare() with the same eps must reproduce the
  //    continuous run exactly, and a geometry change far from the wave only locally.
  {
    const run = (paintAt) => {
      const s = new FDTD2D(201, 201, { h: 0.01, abc: 'pml' }); s.addSource({ i: 100, j: 100, f: 1e9 });
      for (let k = 0; k < 750; k++) { s.step(1); if (k === paintAt) { fillRect(s, 1.6, 1.7, 0.9, 1.1, { epsR: 4 }); s.prepare(); } }
      return s;
    };
    const ref = run(-1), painted = run(350);
    let d = 0; for (let k = 0; k < ref.Ez.length; k++) d = Math.max(d, Math.abs(ref.Ez[k] - painted.Ez[k]));
    // the pulse has passed x = 1.6 m by step 350 (it is 1.65 m out at 7.4 ns... it reached the walls), so the late field must still agree closely
    check('fdtd: changing materials in place mid-run keeps the PML memory (late field within 1e-3 of the pulse peak)', d < 1e-3 ? 1 : 0, 1, 0);
    const t = new FDTD2D(41, 41, { h: 0.01 }); t.setTrace(20, 20); t.addSource({ i: 10, j: 20, f: 1e9 }); t.step(300);
    check('fdtd: trace values are finite', t.trace.v.every(Number.isFinite) ? 1 : 0, 1, 0);
  }

  // 8. Lossy half-space: a plane wave in a conductor (sigma, eps_r = 1) decays as exp(-alpha x) with
  //    alpha = w sqrt(mu eps/2) [ sqrt(1 + (sigma/w eps)^2) - 1 ]^(1/2); the (1 - loss)/(1 + loss)
  //    coefficients are otherwise untested.
  {
    const f = 1e9, w = 2 * Math.PI * f, sigma = 0.01, eps = 8.8541878128e-12, mu = 4e-7 * Math.PI;
    const alpha = w * Math.sqrt(mu * eps / 2) * Math.sqrt(Math.sqrt(1 + (sigma / (w * eps)) ** 2) - 1);
    const s = new FDTD2D(401, 11, { h: 0.01, yWall: 'mirror', abc: 'pml' });
    s.addSource({ kind: 'line', i: 30, f, wave: 'cw' });
    for (let k = 0; k < s.sigma.length; k++) if (k % 401 >= 100) s.sigma[k] = sigma;
    s.prepare();
    for (let n = 0; n < 2500; n++) s.step(1);
    const amp = (i) => { let m = 0; const N = Math.round(1 / (f * s.dt)); for (let n = 0; n < N; n++) { s.step(1); m = Math.max(m, Math.abs(s.ez(i, 5))); } return m; };
    const a1 = amp(150), a2 = amp(250);
    check('fdtd: lossy medium attenuation over 1 m matches exp(-alpha d) (2%)', a2 / a1, Math.exp(-alpha * 1.0), 2e-2);
  }
  // 9. prepare() mid-run must be a no-op for the fields: the PML memory and the Mur history
  //    survive it (a paint stroke calls prepare() while waves may be inside the layer).
  {
    const run = (prepAt) => { const s = new FDTD2D(201, 201, { h: 0.01, abc: 'pml' }); s.addSource({ i: 100, j: 100, f: 1e9 }); for (let k = 0; k < 600; k++) { s.step(1); if (k === prepAt) s.prepare(); } return s; };
    const ref = run(-1), p = run(190);
    let d = 0; for (let k = 0; k < ref.Ez.length; k++) d = Math.max(d, Math.abs(ref.Ez[k] - p.Ez[k]));
    check('fdtd: prepare() while the pulse is in the PML changes nothing (1e-12)', d < 1e-12 ? 1 : 0, 1, 0);
  }
}
