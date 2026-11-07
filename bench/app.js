// Tests of the app layer that can run under node: the worker protocol, URL state, the
// Sandbox geometry encoding, mirroring, CSV alignment, tab/equation/DOM contracts, and the
// golden files that freeze the numbers quoted in the handouts.
//
// Usage: imported by run.js. `node bench/run.js --freeze` rewrites bench/golden.json from the
// current code; do that deliberately (and say so in the commit) when a solver change is
// meant to move a quoted number.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { EPS0 } from '../core/constants.js';
import { Grid2D } from '../core/grid.js';
import { Relax2D, lab2Preset } from '../core/relax2d.js';
import { diskCapacitor, solenoidWithObject, idealLayeredC } from '../core/axisym.js';
import { pointChargesField, wiresField } from '../core/analytic.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

export async function run(check) {
  // ------------------------------------------------------------ 1. layered-stack identity
  for (const cpl of [2, 4, 6]) {
    const s = diskCapacitor({ V: 5, g: 4e-3, R: 6e-3, epsR: 2, epsR2: 8, cellsPerLayer: cpl, boxFactor: 2.5 });
    const jc = Math.round(-s.z0 / s.h);
    let inv = 0;
    for (let j = 0; j < s.nz - 1; j++) { const zf = s.z(j) + s.h / 2; if (Math.abs(zf) < 2e-3) inv += 1 / s.faceZ[s.idx(0, j)]; } // faces strictly inside the gap
    check(`diskCapacitor: sum 1/eps over axis faces = N(2/eps2 + 1/eps1), N = ${cpl}`, inv, cpl * (2 / 8 + 1 / 2), 1e-12);
  }
  {
    // and the full solve now sits above the ideal value for a layered stack too
    const s = diskCapacitor({ V: 5, g: 4e-3, R: 6e-3, epsR: 2, epsR2: 8, cellsPerLayer: 4, boxFactor: 2.5 });
    s.solve(2e-6 * 5, 1e6, 100);
    const c = 2 * s.energy() / 25, ideal = idealLayeredC({ g: 4e-3, R: 6e-3, epsR: 2, epsR2: 8 });
    check('diskCapacitor layered 2/8: C/C_ideal in (1.05, 1.5) (was 0.85 with node-centred layers)', c / ideal > 1.05 && c / ideal < 1.5 ? 1 : 0, 1, 0);
  }

  // ------------------------------------------------------------ 2. worker protocol under node
  {
    const received = [];
    globalThis.self = { postMessage: (m) => received.push(m) };
    await import('../app/workers/relax-worker.js');
    const send = (m) => globalThis.self.onmessage({ data: m });
    const until = (type) => new Promise((resolve, reject) => {
      const t0 = Date.now();
      const poll = () => { const m = received.find((x) => x.type === type); if (m) resolve(m); else if (Date.now() - t0 > 20000) reject(new Error('timeout')); else setTimeout(poll, 5); };
      poll();
    });
    // cartesian
    let s = lab2Preset('two-rods', { n: 33 });
    send({ cmd: 'init', kind: 'cartesian', nx: s.nx, ny: s.ny, extent: s.extent, boundary: s.boundary, V: s.V, fixed: s.fixed, eps: s.eps, rho: s.rho });
    await until('ready');
    received.length = 0;
    send({ cmd: 'step', k: 3 });
    const f1 = await until('frame');
    check('worker: step k=3 reports 3 sweeps', f1.sweeps, 3, 0);
    check('worker: frame carries a V array of the grid size', f1.V.length, s.nx * s.ny, 0);
    received.length = 0;
    send({ cmd: 'run', k: 20, tol: 1e-6, maxSweeps: 100000 });
    const d1 = await until('done');
    check('worker: run converges and reports it', d1.converged ? 1 : 0, 1, 0);
    const ref = lab2Preset('two-rods', { n: 33 }); ref.solve(1e-6, 100000, 20);
    check('worker: result matches an in-process solve (1%)', d1.V[ref.idx(20, 16)], ref.V[ref.idx(20, 16)], 1e-2);
    received.length = 0;
    send({ cmd: 'reset', guess: 0 });
    const f2 = await until('frame');
    check('worker: reset clears the sweep count', f2.sweeps, 0, 0);
    // axisym with explicit faces
    const cap = diskCapacitor({ cellsPerLayer: 2, boxFactor: 1.5 });
    received.length = 0;
    send({ cmd: 'init', kind: 'axisym', nr: cap.nr, nz: cap.nz, h: cap.h, z0: cap.z0, boundary: cap.boundary, V: cap.V, fixed: cap.fixed, eps: cap.eps, rho: cap.rho, faceR: cap.faceR, faceZ: cap.faceZ, facesExplicit: true });
    await until('ready'); received.length = 0;
    send({ cmd: 'run', k: 50, tol: 1e-5, maxSweeps: 100000 });
    const d2 = await until('done');
    const capRef = diskCapacitor({ cellsPerLayer: 2, boxFactor: 1.5 }); capRef.solve(1e-5, 100000, 50);
    check('worker: axisym with explicit faces matches in-process', d2.V[capRef.idx(0, Math.round(-capRef.z0 / capRef.h))], capRef.V[capRef.idx(0, Math.round(-capRef.z0 / capRef.h))], 1e-9);
    // axisym-mag
    const coil = solenoidWithObject({ nr: 41, box: 4 });
    received.length = 0;
    send({ cmd: 'init', kind: 'axisym-mag', nr: coil.nr, nz: coil.nz, h: coil.h, z0: coil.z0, boundary: coil.boundary, V: coil.V, fixed: coil.fixed, eps: coil.eps, rho: coil.rho });
    await until('ready'); received.length = 0;
    send({ cmd: 'run', k: 50, tol: 1e-12, maxSweeps: 100000 });
    const d3 = await until('done');
    check('worker: axisym-mag runs to convergence', d3.converged ? 1 : 0, 1, 0);
    received.length = 0;
    send({ cmd: 'pause' });
    const f3 = await until('frame');
    check('worker: pause answers with a paused frame', f3.paused ? 1 : 0, 1, 0);
    delete globalThis.self;
  }

  // ------------------------------------------------------------ 3. URL state round trip + geometry RLE
  {
    globalThis.location = { pathname: '/x/', search: '', hash: '' };
    globalThis.history = { replaceState: (_, __, url) => { globalThis.location.search = url.slice(url.indexOf('?')); }, pushState: (_, __, url) => { globalThis.location.search = url.slice(url.indexOf('?')); } };
    const { writeState, readState } = await import('../app/state.js');
    writeState({ tab: 'sandbox', color: 'none', ov: 'none', px: 0.123456789, q1: -2.5, list: ['a', 'b'], empty: '', undef: undefined });
    const back = readState();
    check('state: tab round-trips', back.tab === 'sandbox' ? 1 : 0, 1, 0);
    check('state: "none" sentinels survive', back.color === 'none' && back.ov === 'none' ? 1 : 0, 1, 0);
    check('state: numbers keep 6 significant digits', parseFloat(back.px), 0.123457, 1e-9);
    check('state: arrays become comma lists', back.list === 'a,b' ? 1 : 0, 1, 0);
    check('state: empty and undefined are omitted', back.empty === undefined && back.undef === undefined ? 1 : 0, 1, 0);
    // Sandbox geometry RLE on a painted grid
    const { default: sandbox } = await import('../app/tabs/sandbox.js');
    const g = lab2Preset('square-rods', { n: 65 });
    g.epsWhere((x, y) => y > 0.5, 3.5);
    g.rho[g.idx(10, 10)] = 2e-9;
    const stub = { n: g.nx, fixed: g.fixed, Vfix: g.V, eps: g.eps, rho: g.rho, boundary: 'dirichlet' };
    const str = sandbox.geometryString.call(stub);
    const stub2 = { boundary: 'dirichlet', adopt(s) { this.out = s; }, loadPreset() { this.failed = true; } };
    sandbox.loadGeometryString.call(stub2, str);
    const o = stub2.out;
    let same = o && !stub2.failed && o.nx === g.nx ? 1 : 0;
    if (same) for (let k = 0; k < g.V.length; k++) if (o.fixed[k] !== g.fixed[k] || o.eps[k] !== g.eps[k] || o.rho[k] !== g.rho[k] || (g.fixed[k] && o.V[k] !== g.V[k])) { same = 0; break; }
    check('sandbox: geometry RLE round-trips fixed, V, eps, rho exactly', same, 1, 0);
    check('sandbox: RLE of a preset is short enough for a URL', str.length < 6000 ? 1 : 0, 1, 0);
    delete globalThis.location; delete globalThis.history;
  }

  // ------------------------------------------------------------ 4. mirrorGrid + CSV alignment
  {
    const { mirrorGrid } = await import('../app/mirror.js');
    const g = Grid2D.fromFunction(11, 7, [0, 1, -1, 1], (r, z) => r * r + z);
    const m = mirrorGrid(g), mf = mirrorGrid(g, true);
    check('mirrorGrid: doubled width, symmetric extent', m.nx === 21 && m.extent[0] === -1 && m.extent[1] === 1 ? 1 : 0, 1, 0);
    check('mirrorGrid: even scalar', m.sample(-0.37, 0.2), g.sample(0.37, 0.2), 1e-12);
    check('mirrorGrid: odd component flips sign', mf.sample(-0.37, 0.2), -g.sample(0.37, 0.2), 1e-12);
    const { default: capacitors } = await import('../app/tabs/capacitors.js');
    const s = diskCapacitor({ cellsPerLayer: 2, boxFactor: 1.5 });
    s.solve(1e-4, 1e5, 50);
    const stub = { solver: s, V: s.V, mirror: true };
    const rows = capacitors.csv.call(stub).split('\n');
    check('capacitors csv: one row per solver node (+ header)', rows.length, s.nr * s.nz + 1, 0);
    const k = s.idx(2, Math.round(-s.z0 / s.h));
    const cols = rows[1 + k].split(',');
    check('capacitors csv: eps column aligned with the node', parseFloat(cols[5]), s.eps[k], 0);
    check('capacitors csv: r column is the node radius', parseFloat(cols[0]), s.r(2), 1e-12);
  }

  // ------------------------------------------------------------ 5. tab / equation / DOM contracts
  {
    const { TABS } = await import('../app/tabs/index.js');
    const { EQUATIONS, ALIASES } = await import('../app/equations.js');
    let missingEq = 0, badLayerEq = 0, dupIds = 0;
    const ids = new Set();
    for (const t of TABS) {
      if (ids.has(t.id)) dupIds++; ids.add(t.id);
      if (!(t.layers?.length)) continue; // a page like About has no fields and no equations
      const set = EQUATIONS[ALIASES[t.id] ?? t.id];
      if (!set) { missingEq++; console.error(`tab ${t.id} has no equations`); continue; }
      for (const L of t.layers ?? []) { const key = L.eq ?? L.id; if (L.kind !== 'info' && (L.kind === 'scalar' || L.kind === 'vector') && !set.layers?.[key]) { badLayerEq++; console.error(`tab ${t.id} layer ${L.id} -> no equation for ${key}`); } }
    }
    check('contracts: every tab has an equation set', missingEq, 0, 0);
    check('contracts: every scalar/vector layer maps to an equation', badLayerEq, 0, 0);
    check('contracts: tab ids are unique', dupIds, 0, 0);
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const domIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const shell = readFileSync(join(ROOT, 'app', 'shell.js'), 'utf8');
    const used = new Set([...shell.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
    const missing = [...used].filter((id) => !domIds.has(id));
    if (missing.length) console.error('shell uses missing DOM ids:', missing.join(', '));
    check('contracts: every DOM id the shell touches exists in index.html', missing.length, 0, 0);
  }

  // ------------------------------------------------------------ 5b. Gauss's law and Interface tabs (closed form, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const gauss = TABS.find((t) => t.id === 'gauss-law');
    // one charge at the centre of a sphere: the midpoint sum is exact for every patch count
    gauss.n = 1; gauss.charges[0] = { q: 2, x: 0.25, y: 0.25, z: 0 }; gauss.surf = { kind: 'sphere', cx: 0.25, cy: 0.25, cz: 0, R: 0.1, a: 0.08 }; gauss.res = 12;
    gauss.compute();
    check('gauss-law: centred charge in a sphere, flux = q/eps0 (1e-9)', gauss.results.flux, 2 / EPS0, 1e-9);
    // off-centre charge in a cube, fine patches: midpoint rule within 1%
    gauss.surf = { kind: 'box', cx: 0.25, cy: 0.25, cz: 0, R: 0.1, a: 0.08 }; gauss.charges[0] = { q: -1.5, x: 0.28, y: 0.22, z: 0.03 }; gauss.res = 48;
    gauss.compute();
    check('gauss-law: off-centre charge in a cube, flux = q/eps0 (1%)', gauss.results.flux, -1.5 / EPS0, 1e-2);
    check('gauss-law: cube faces sum to the total', Object.values(gauss.results.perFace).reduce((a, b) => a + b, 0), gauss.results.flux, 1e-12);
    // charge outside: zero net flux (compared with the q/eps0 scale)
    gauss.charges[0] = { q: 3, x: 0.45, y: 0.25, z: 0 }; gauss.compute();
    check('gauss-law: charge outside the cube gives ~zero net flux (0.5% of q/eps0)', 1 + gauss.results.flux / (3 / EPS0), 1, 5e-3);
    check('gauss-law: Q_enc counts only charges inside', gauss.results.Qenc, 0, 0);
    gauss.n = 2; gauss.charges = gauss.charges.map((c, k) => ({ q: 2, x: 0.25, y: 0.25, z: 0 })); // restore something sane

    const iface = TABS.find((t) => t.id === 'interface');
    iface.mode = 'electric'; iface.e1 = 2; iface.e2 = 5; iface.F1 = 100; iface.th1 = 30; iface.rs = 0;
    let sol = iface.solve();
    check('interface: tan(th2)/tan(th1) = eps2/eps1', Math.tan(sol.th2) / Math.tan(sol.th1), 2.5, 1e-12);
    check('interface: E_t continuous', sol.F2t, sol.F1t, 1e-12);
    check('interface: D_n continuous', sol.D2n, sol.D1n, 1e-12);
    check('interface: bound charge = (P1-P2).n = eps0 (E2n - E1n) since D_n is continuous', sol.bound, EPS0 * (sol.F2n - sol.F1n), 1e-9);
    iface.rs = 10; sol = iface.solve();
    check('interface: D_n jumps by the free surface charge', sol.D2n - sol.D1n, 10e-9, 1e-12);
    iface.mode = 'conductor'; iface.rs = 0; sol = iface.solve();
    check('interface: conductor: E2 = 0 and rho_s = D1n', sol.rs, EPS0 * 2 * 100, 1e-12);
    iface.mode = 'magnetic'; iface.e1 = 1; iface.e2 = 1000; iface.th1 = 10; sol = iface.solve();
    check('interface: magnetic: tan(th2)/tan(th1) = mu2/mu1', Math.tan(sol.th2) / Math.tan(sol.th1), 1000, 1e-9);
    check('interface: magnetic: B_n continuous, H_t continuous', Math.abs(sol.F2n - sol.F1n) + Math.abs(sol.F2t / sol.k2 - sol.F1t / sol.k1), 0, 1e-12);
    iface.mode = 'electric'; iface.e1 = 1; iface.e2 = 4; iface.th1 = 40; iface.compute();
    check('interface: V is continuous across the interface', iface.at(-1e-9, 0.03).V, iface.at(1e-9, 0.03).V, 1e-6);
  }

  // ------------------------------------------------------------ 5c. every equation renders in KaTeX
  {
    const { EQUATIONS } = await import('../app/equations.js');
    const src = readFileSync(join(ROOT, 'vendor', 'katex', 'katex.min.js'), 'utf8');
    const mod = { exports: {} };
    new Function('module', 'exports', 'self', src)(mod, mod.exports, undefined); // UMD build -> module.exports
    const katex = mod.exports.default ?? mod.exports;
    let bad = 0;
    for (const [tab, set] of Object.entries(EQUATIONS)) {
      const all = [...set.governing.map((e) => [e.title, e.tex]), ...Object.entries(set.layers ?? {}).map(([k, e]) => [`layer ${k}`, e.tex]), ...(set.solver ? [['solver', set.solver.tex]] : [])];
      for (const [name, tex] of all) { try { katex.renderToString(tex, { throwOnError: true }); } catch (e) { bad++; console.error(`equations: ${tab} / ${name}: ${e.message.slice(0, 120)}`); } }
    }
    check('equations: every TeX string renders in KaTeX', bad, 0, 0);
  }

  // ------------------------------------------------------------ 6. golden files (handout numbers)
  {
    const cases = {};
    const cap = (p) => { const s = diskCapacitor(p); s.solve(2e-6 * (p.V ?? 5), 1e6, 100); return 2 * s.energy() / (p.V ?? 5) ** 2; };
    cases['lab3 run1 C (5V,4mm,6mm,5,5) coarse'] = cap({ V: 5, g: 4e-3, R: 6e-3, epsR: 5, epsR2: 5, cellsPerLayer: 2 });
    cases['lab3 run1 C (5V,4mm,6mm,5,5) normal'] = cap({ V: 5, g: 4e-3, R: 6e-3, epsR: 5, epsR2: 5, cellsPerLayer: 4 });
    cases['lab3 layered C (5V,4mm,6mm,2,8) normal'] = cap({ V: 5, g: 4e-3, R: 6e-3, epsR: 2, epsR2: 8, cellsPerLayer: 4 });
    const coil = solenoidWithObject({}); coil.solve(1e-7 * 1.25663706e-6 * 100 * 1 * 15e-3, 1e6, 50);
    cases['lab5 default L flux (uH)'] = 2 * coil.energyJA() * 1e6;
    const empty = solenoidWithObject({ a: 0, muR: 1 }); empty.solve(1e-7 * 1.25663706e-6 * 100 * 1 * 15e-3, 1e6, 50);
    cases['lab5 empty coil L flux (uH)'] = 2 * empty.energyJA() * 1e6;
    cases['lab1 probe V (2C@0.2,0.3; -2C@0.3,0.2) at (0.25,0.25)'] = pointChargesField([{ q: 2, pos: [0.2, 0.3, 0] }, { q: -2, pos: [0.3, 0.2, 0] }], [0.25, 0.25, 0]).V;
    cases['lab4 probe |B| (2A@-15,15mm; -2A@-15,-15mm) at (0,0)'] = Math.hypot(...wiresField([{ I: 2, pos: [-0.015, 0.015] }, { I: -2, pos: [-0.015, -0.015] }], [0, 0]).B);
    const path = join(ROOT, 'bench', 'golden.json');
    if (process.argv.includes('--freeze')) {
      writeFileSync(path, JSON.stringify({ frozen: new Date().toISOString().slice(0, 10), cases }, null, 2) + '\n');
      console.log(`golden.json re-frozen with ${Object.keys(cases).length} cases`);
    }
    let golden = null;
    try { golden = JSON.parse(readFileSync(path, 'utf8')); } catch { /* none yet */ }
    if (!golden) check('golden: bench/golden.json exists (run with --freeze to create it)', 0, 1, 0);
    else for (const [name, value] of Object.entries(cases)) {
      if (golden.cases[name] === undefined) { check(`golden: ${name} (new case, freeze it)`, 0, 1, 0); continue; }
      check(`golden (${golden.frozen}): ${name}`, value, golden.cases[name], 5e-3);
    }
  }
}
