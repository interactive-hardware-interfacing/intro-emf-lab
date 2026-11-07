// SolverClient: a small promise/callback wrapper around relax-worker.js for tabs that
// run the solver to convergence (Capacitors, Conduction, Inductors) rather than
// interactively stepping it (Sandbox).

export class SolverClient {
  constructor({ onFrame } = {}) {
    this.worker = new Worker(new URL('./workers/relax-worker.js', import.meta.url), { type: 'module' });
    this.onFrame = onFrame;
    this.pending = null;
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') { this.ready?.(); return; }
      if (m.type === 'frame') { this.onFrame?.(m); return; }
      if (m.type === 'done') { const p = this.pending; this.pending = null; this.onFrame?.(m); p?.resolve(m); }
    };
  }

  /** Send a solver and its arrays. `kind` is 'axisym' or 'cartesian'. */
  init(solver, kind) {
    const base = { cmd: 'init', kind, V: solver.V, fixed: solver.fixed, eps: solver.eps, rho: solver.rho, boundary: solver.boundary, boxV: solver.boxV };
    if (kind === 'axisym') Object.assign(base, { nr: solver.nr, nz: solver.nz, h: solver.h, z0: solver.z0 });
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
