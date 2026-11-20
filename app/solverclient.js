// SolverClient: a small promise/callback wrapper around relax-worker.js for tabs that
// run the solver to convergence (Capacitors, Conduction, Inductors) rather than
// interactively stepping it (Sandbox).
//
// Ordering: the worker handles messages in order, so every frame or 'done' it posted before
// it processed an 'init' arrives here BEFORE that init's 'ready'. Those messages belong to
// the previous geometry, whose arrays may be a different size; routeMessage() drops them
// while an init is pending, so a tab never receives a frame that does not match its solver.
// (Without this, rebuilding a tab while a solve was running could deliver a stale frame to
// the new grid: Float64Array.set threw "offset is out of bounds" on the Dielectrics tab.)

/**
 * Pure routing of a worker message against the client's state; returns what to do.
 *   state: { initPending: boolean, pending: boolean }
 *   -> { action: 'ready' | 'frame' | 'done' | 'drop' }
 */
export function routeMessage(state, m) {
  if (m.type === 'ready') return { action: 'ready' };
  if (state.initPending) return { action: 'drop' };          // from the previous geometry
  if (m.type === 'frame') return { action: 'frame' };
  if (m.type === 'done') return { action: state.pending ? 'done' : 'drop' };
  return { action: 'drop' };
}

export class SolverClient {
  constructor({ onFrame } = {}) {
    this.worker = new Worker(new URL('./workers/relax-worker.js', import.meta.url), { type: 'module' });
    this.onFrame = onFrame;
    this.pending = null;
    this.initPending = false;
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      const { action } = routeMessage({ initPending: this.initPending, pending: !!this.pending }, m);
      if (action === 'ready') { this.initPending = false; const r = this.ready; this.ready = null; r?.(); return; }
      if (action === 'frame') { this.onFrame?.(m); return; }
      if (action === 'done') { const p = this.pending; this.pending = null; this.onFrame?.(m); p?.resolve(m); }
    };
  }

  /** Send a solver and its arrays. `kind` is 'axisym' or 'cartesian'. Any run in flight is cancelled. */
  init(solver, kind) {
    if (this.pending) { this.pending.reject?.(new Error('cancelled')); this.pending = null; }
    this.initPending = true;
    const base = { cmd: 'init', kind, V: solver.V, fixed: solver.fixed, eps: solver.eps, rho: solver.rho, boundary: solver.boundary, boxV: solver.boxV };
    if (solver.faceR) { solver.prepare?.(); Object.assign(base, { faceR: solver.faceR, faceZ: solver.faceZ, facesExplicit: solver.facesExplicit }); }
    if (solver.sat) base.sat = { mask: solver.sat.mask, muI: solver.sat.muI, Bsat: solver.sat.Bsat, damping: solver.sat.damping };
    if (kind === 'axisym' || kind === 'axisym-mag' || kind === 'axisym-eddy') Object.assign(base, { nr: solver.nr, nz: solver.nz, h: solver.h, z0: solver.z0 });
    if (kind === 'axisym-eddy') Object.assign(base, { Vi: solver.Vi, sigma: solver.sigma, omega: solver.omega });
    else Object.assign(base, { nx: solver.nx, ny: solver.ny, extent: solver.extent });
    return new Promise((resolve) => { this.ready = resolve; this.worker.postMessage(base); });
  }

  /** Run to convergence. Resolves with the final frame { V, delta, sweeps, residual, converged }. */
  run({ k = 50, tol = 1e-6, maxSweeps = 400000 } = {}) {
    if (this.pending) this.pending.reject?.(new Error('cancelled'));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage({ cmd: 'run', k, tol, maxSweeps });
    });
  }

  pause() { this.worker.postMessage({ cmd: 'pause' }); }

  /** Abort anything running and forget it. */
  cancel() {
    if (this.pending) { this.pending.reject?.(new Error('cancelled')); this.pending = null; }
    this.worker.postMessage({ cmd: 'pause' });
  }

  terminate() { this.cancel(); this.worker.terminate(); }
}
