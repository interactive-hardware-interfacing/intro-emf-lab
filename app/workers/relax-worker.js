// Web Worker wrapper around core/relax2d.js so the page stays responsive while the
// neighbour-averaging solver runs. Protocol (postMessage):
//   { cmd: 'init', nx, ny, extent, boundary, V, fixed, eps, rho }   arrays are copied in
//   { cmd: 'init', kind: 'axisym', nr, nz, h, z0, boundary: {rmax, zmin, zmax}, V, fixed, eps, rho }
//   { cmd: 'init', kind: 'axisym-mag', ... }  same shape; V holds psi = r A_phi, eps holds mu_r, rho holds J_phi
//   { cmd: 'run', k, tol, maxSweeps }      run until converged, posting a frame every k sweeps
//   { cmd: 'step', k }                      run exactly k sweeps, post one frame, stop
//   { cmd: 'pause' }
//   { cmd: 'reset', guess }
// Frames: { type: 'frame', sweeps, residual, converged, V (Float64Array copy), delta }
// Done:   { type: 'done', sweeps, residual, converged, hitMax }

import { Relax2D } from '../../core/relax2d.js';
import { Axisym, AxisymMag } from '../../core/axisym.js';

let solver = null;
let running = false;
let timer = null;

function post(type, extra = {}) {
  const V = new Float64Array(solver.V);
  const delta = new Float64Array(solver.delta);
  self.postMessage({ type, sweeps: solver.sweeps, residual: solver.residual, V, delta, ...extra }, [V.buffer, delta.buffer]);
}

function runLoop(k, tol, maxSweeps) {
  if (!running) return;
  let r = Infinity;
  const t0 = performance.now();
  // Do up to k sweeps, but cap the chunk at ~40 ms so pause/step stay responsive on big grids
  let n = 0;
  while (n < k && performance.now() - t0 < 40) { r = solver.sweep(); n++; }
  solver.history.push([solver.sweeps, r]);
  const converged = r < tol;
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
      solver = m.kind === 'axisym'
        ? new Axisym(m.nr, m.nz, { h: m.h, z0: m.z0, boundary: m.boundary, boxV: m.boxV ?? 0 })
        : m.kind === 'axisym-mag'
          ? new AxisymMag(m.nr, m.nz, { h: m.h, z0: m.z0, boundary: m.boundary })
          : new Relax2D(m.nx, m.ny, m.extent, { boundary: m.boundary, boxV: m.boxV ?? 0 });
      solver.V.set(m.V);
      solver.fixed.set(m.fixed);
      solver.eps.set(m.eps);
      solver.rho.set(m.rho);
      solver.sweeps = m.sweeps ?? 0;
      self.postMessage({ type: 'ready' });
      break;
    }
    case 'run':
      if (!solver) return;
      running = true;
      clearTimeout(timer);
      runLoop(m.k ?? 10, m.tol ?? 1e-6, m.maxSweeps ?? 200000);
      break;
    case 'step': {
      if (!solver) return;
      running = false;
      clearTimeout(timer);
      let r = Infinity;
      for (let n = 0; n < (m.k ?? 1); n++) r = solver.sweep();
      solver.history.push([solver.sweeps, r]);
      post('frame', { converged: r < (m.tol ?? 1e-6) });
      break;
    }
    case 'pause':
      running = false;
      clearTimeout(timer);
      if (solver) post('frame', { converged: false, paused: true });
      break;
    case 'reset':
      running = false;
      clearTimeout(timer);
      if (solver) { solver.reset(m.guess ?? 0); post('frame', { converged: false }); }
      break;
    default:
      break;
  }
};
