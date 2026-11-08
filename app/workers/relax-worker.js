// Web Worker wrapper around core/relax2d.js so the page stays responsive while the
// neighbour-averaging solver runs. Protocol (postMessage):
//   { cmd: 'init', nx, ny, extent, boundary, V, fixed, eps, rho }   arrays are copied in
//   { cmd: 'init', kind: 'axisym', nr, nz, h, z0, boundary: {rmax, zmin, zmax}, V, fixed, eps, rho }
//   { cmd: 'init', kind: 'axisym-mag', ... }  same shape; V holds psi = r A_phi, eps holds mu_r, rho holds J_phi
//   { cmd: 'materials', epsR, pec }                 fdtd: paint while keeping fields and PML memory
//   { cmd: 'init', kind: 'fdtd', nx, ny, h, epsR, pec, sigma, yWall, abc, sources: [...], trace: {i, j},
//                  Ez?, Hx?, Hy?, t?, step? }   time-domain solver (core/fdtd2d.js); warm fields optional
//     run: { cmd: 'run', k }  k time steps per frame, until 'pause';  step: { cmd: 'step', k };  reset
//     frames: { type: 'frame', step, t, Ez, Hx, Hy, energy, trace: { t, v } }
//   { cmd: 'run', k, tol, maxSweeps }      run until converged, posting a frame every k sweeps
//   { cmd: 'step', k }                      run exactly k sweeps, post one frame, stop
//   { cmd: 'pause' }
//   { cmd: 'reset', guess }
// Frames: { type: 'frame', sweeps, residual, converged, V (Float64Array copy), delta }
// Done:   { type: 'done', sweeps, residual, converged, hitMax }

import { Relax2D } from '../../core/relax2d.js';
import { Axisym, AxisymMag } from '../../core/axisym.js';
import { FDTD2D } from '../../core/fdtd2d.js';

let solver = null;
let running = false;
let timer = null;

function post(type, extra = {}) {
  const V = new Float64Array(solver.V);
  const delta = new Float64Array(solver.delta);
  const msg = { type, sweeps: solver.sweeps, residual: solver.residual, V, delta, ...extra };
  const transfer = [V.buffer, delta.buffer];
  if (solver.sat) { msg.eps = new Float64Array(solver.eps); msg.meanMu = solver.meanMu(); transfer.push(msg.eps.buffer); } // nonlinear mu: send the material back too
  self.postMessage(msg, transfer);
}

// ---- time-domain (FDTD) branch: no residual, no convergence; runs until paused
function postFdtd(type, extra = {}) {
  const Ez = new Float64Array(solver.Ez), Hx = new Float64Array(solver.Hx), Hy = new Float64Array(solver.Hy);
  const tr = solver.trace ? { t: Float64Array.from(solver.trace.t.slice(-6000)), v: Float64Array.from(solver.trace.v.slice(-6000)) } : null;
  const msg = { type, step: solver.nStep, t: solver.t, Ez, Hx, Hy, energy: solver.energy(), trace: tr, ...extra };
  const transfer = [Ez.buffer, Hx.buffer, Hy.buffer];
  if (tr) transfer.push(tr.t.buffer, tr.v.buffer);
  self.postMessage(msg, transfer);
}

function fdtdLoop(k) {
  if (!running) return;
  const t0 = performance.now();
  let n = 0;
  while (n < k && performance.now() - t0 < 40) { solver.step(1); n++; }
  postFdtd('frame');
  timer = setTimeout(() => fdtdLoop(k), 0);
}

function fdtdInit(m) {
  solver = new FDTD2D(m.nx, m.ny, { h: m.h, epsR: m.epsR, pec: m.pec, sigma: m.sigma, yWall: m.yWall, abc: m.abc ?? 'pml' });
  for (const src of m.sources ?? []) solver.addSource(src);
  if (m.trace) { solver.setTrace(m.trace.i, m.trace.j); if (m.trace.t?.length) { solver.trace.t = Array.from(m.trace.t); solver.trace.v = Array.from(m.trace.v); } } // a warm init keeps the record
  if (m.Ez) { solver.Ez.set(m.Ez); solver.Hx.set(m.Hx); solver.Hy.set(m.Hy); solver.t = m.t ?? 0; solver.step_ = m.step ?? 0; }
  self.postMessage({ type: 'ready' });
}

function runLoop(k, tol, maxSweeps) {
  if (!running) return;
  let r = Infinity;
  const t0 = performance.now();
  // Do up to k sweeps, but cap the chunk at ~40 ms so pause/step stay responsive on big grids
  let n = 0;
  while (n < k && performance.now() - t0 < 40) { r = solver.sweep(); n++; }
  const muChange = solver.sat ? solver.updateMu() : 0;
  solver.history.push([solver.sweeps, r]);
  const converged = r < tol && muChange < 1e-4;
  const hitMax = solver.sweeps >= maxSweeps;
  if (converged || hitMax) {
    running = false;
    post('done', { converged, hitMax });
    return;
  }
  post('frame', { converged: false });
  timer = setTimeout(() => runLoop(k, tol, maxSweeps), 0);
}

self.onmessage = (ev) => {
  const m = ev.data;
  switch (m.cmd) {
    case 'init': {
      running = false;
      clearTimeout(timer);
      if (m.kind === 'fdtd') { fdtdInit(m); break; }
      solver = m.kind === 'axisym'
        ? new Axisym(m.nr, m.nz, { h: m.h, z0: m.z0, boundary: m.boundary, boxV: m.boxV ?? 0 })
        : m.kind === 'axisym-mag'
          ? new AxisymMag(m.nr, m.nz, { h: m.h, z0: m.z0, boundary: m.boundary })
          : new Relax2D(m.nx, m.ny, m.extent, { boundary: m.boundary, boxV: m.boxV ?? 0 });
      solver.V.set(m.V);
      solver.fixed.set(m.fixed);
      solver.eps.set(m.eps);
      solver.rho.set(m.rho);
      if (m.faceR && solver.faceR) { solver.faceR.set(m.faceR); solver.faceZ.set(m.faceZ); solver.facesExplicit = !!m.facesExplicit; solver.facesDirty = false; }
      else if (solver.facesDirty !== undefined) solver.facesDirty = true;
      if (m.sat && solver.setSaturation) solver.setSaturation({ mask: m.sat.mask, muI: m.sat.muI, Bsat: m.sat.Bsat, damping: m.sat.damping ?? 0.5 });
      solver.sweeps = m.sweeps ?? 0;
      self.postMessage({ type: 'ready' });
      break;
    }
    case 'run':
      if (!solver) return;
      running = true;
      clearTimeout(timer);
      if (solver instanceof FDTD2D) { fdtdLoop(m.k ?? 4); break; }
      runLoop(m.k ?? 10, m.tol ?? 1e-6, m.maxSweeps ?? 200000);
      break;
    case 'probe':
      if (solver instanceof FDTD2D) { solver.setTrace(m.i, m.j); if (!running) postFdtd('frame'); }
      break;
    case 'materials':
      // Paint stroke: change eps_r / PEC in place. Fields, clock, trace and the PML's memory
      // arrays all continue, so a wave inside the layer is not disturbed.
      if (solver instanceof FDTD2D) { solver.epsR.set(m.epsR); solver.pec.set(m.pec); solver.prepare(); if (!running) postFdtd('frame'); }
      break;
    case 'step': {
      if (!solver) return;
      running = false;
      clearTimeout(timer);
      if (solver instanceof FDTD2D) { solver.step(m.k ?? 1); postFdtd('frame'); break; }
      let r = Infinity;
      for (let n = 0; n < (m.k ?? 1); n++) r = solver.sweep();
      solver.history.push([solver.sweeps, r]);
      post('frame', { converged: r < (m.tol ?? 1e-6) });
      break;
    }
    case 'pause':
      running = false;
      clearTimeout(timer);
      if (solver instanceof FDTD2D) { postFdtd('frame', { paused: true }); break; }
      if (solver) post('frame', { converged: false, paused: true });
      break;
    case 'reset':
      running = false;
      clearTimeout(timer);
      if (solver instanceof FDTD2D) { solver.reset(); postFdtd('frame'); break; }
      if (solver) { solver.reset(m.guess ?? 0); post('frame', { converged: false }); }
      break;
    default:
      break;
  }
};
