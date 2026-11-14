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
    const ref = lab2Preset('two-rods', { n: 33 }); ref.solve(1e-6, 100000, 1); // the worker stops on the first sweep below tol
    check('worker: result equals an in-process solve that stops on the same sweep (deterministic, 1e-12)', d1.V[ref.idx(20, 16)], ref.V[ref.idx(20, 16)], 1e-12);
    check('worker: stops on the first sweep below tol, independent of chunking', d1.sweeps, ref.sweeps, 0);
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
    const capRef = diskCapacitor({ cellsPerLayer: 2, boxFactor: 1.5 }); capRef.solve(1e-5, 100000, 1); // k = 1: the worker stops on the first sweep below tol
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
    const { GROUPS } = await import('../app/tabs/index.js');
    check('contracts: every tab is in exactly one group', GROUPS.flatMap((g) => g.tabs).length === TABS.length && new Set(GROUPS.flatMap((g) => g.tabs)).size === TABS.length ? 1 : 0, 1, 0);
    check('contracts: every tab carries its group label', TABS.every((x) => typeof x.group === 'string') ? 1 : 0, 1, 0);
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
    check('interface: conductor: E2 = 0 and rho_s = D2n - D1n = -D1n (n into the conductor)', sol.rs, -EPS0 * 2 * 100, 1e-12);
    check('interface: conductor: free + bound surface charge = -eps0 E1n', sol.rs + sol.bound, -EPS0 * 100, 1e-9);
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

  // ------------------------------------------------------------ 5d. audit regressions (phase 6g)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const { Shell } = await import('../app/shell.js');
    const { scalarBounds } = await import('../core/render.js');
    const { AxisymMag } = await import('../core/axisym.js');
    const MU0 = 4e-7 * Math.PI;

    // Capacitors: the energy-based C must use the solver's explicit layer faces
    const cap = TABS.find((t) => t.id === 'capacitors');
    const sol = diskCapacitor({ V: 5, R: 4e-3, g: 6e-3, epsR: 2, epsR2: 8, cellsPerLayer: 6 });
    sol.solve(1e-9, 2e5, 50);
    cap.solver = sol; cap.V = new Float64Array(sol.V); cap.meta = sol.meta;
    const cEnergy = 2 * cap.solverWithV().energy() / 25;
    check('capacitors tab: C(energy) from solverWithV equals the solver with explicit faces (1e-9)', cEnergy, 2 * sol.energy() / 25, 1e-9);
    {
      // Gauss C from the box around the top plate, exactly as finish() does
      const { g, R, t, h } = sol.meta;
      const jTop = Math.round((g / 2 - sol.z0) / h), jTopEnd = Math.round((g / 2 + t - sol.z0) / h);
      const q = sol.gaussCharge(0, jTop - 1, Math.min(sol.nr - 2, Math.round((R + 3 * h) / h)), Math.min(sol.nz - 2, jTopEnd + 1));
      check('capacitors tab: C(energy) vs C(Gauss) within 0.5% for a layered stack', cEnergy, q / 5, 5e-3);
    }
    cap.solver = null; cap.V = null; cap.meta = null;

    // Shipped tolerance vs 100x tighter: every panel quantity must already be settled to 1e-4
    // at the tolerance the UI uses (the Gauss-box C used to lag by 1.8e-3 and read like a
    // second method).
    {
      const { AxisymEddy } = await import('../core/eddy.js');
      const panel = (sol, V) => {
        const { g, R, t, h } = sol.meta;
        const jTop = Math.round((g / 2 - sol.z0) / h), jTopEnd = Math.round((g / 2 + t - sol.z0) / h);
        return { cEnergy: 2 * sol.energy() / (V * V), cGauss: sol.gaussCharge(0, jTop - 1, Math.min(sol.nr - 2, Math.round((R + 3 * h) / h)), Math.min(sol.nz - 2, jTopEnd + 1)) / V };
      };
      const mk = () => diskCapacitor({ V: 5, R: 6e-3, g: 4e-3, epsR: 5, epsR2: 5, cellsPerLayer: 4 });
      const a = mk(); a.solve(2e-8 * 5, 2e6, 50); const b = mk(); b.solve(2e-10 * 5, 4e6, 50);
      const pa = panel(a, 5), pb = panel(b, 5);
      for (const k of Object.keys(pa)) check(`capacitors: ${k} at the shipped tolerance is within 1e-4 of a 100x tighter solve`, pa[k], pb[k], 1e-4);
      const tolL = 1e-7 * MU0 * 100 * 1 * 15e-3;
      const la = solenoidWithObject({}); la.solve(tolL, 2e6, 50); const lb = solenoidWithObject({}); lb.solve(tolL / 100, 4e6, 50);
      check('inductors: L (flux linkage) at the shipped tolerance within 1e-4 of a 100x tighter solve', 2 * la.energyJA(), 2 * lb.energyJA(), 1e-4);
      const ed = (tol) => { const m = solenoidWithObject({ a: 5e-3, muR: 1, nr: 61, box: 4 }); const h = m.meta.h; const s = AxisymEddy.fromMag(m, { omega: 2 * Math.PI * 1e3, sigmaAt: (r, z) => (r <= 5e-3 + h / 4 && z >= -10e-3 - h / 4 && z <= 10e-3 + h / 4 ? 5.8e7 : 0) }); s.solve(tol, 4e6, 50); return { ...s.impedance(1), P: s.power().total }; };
      const ea = ed(tolL / 20), eb = ed(tolL / 2000); // the eddy tab runs 20x tighter than Inductors: R_eddy settles later than L
      for (const k of ['L', 'R', 'P']) check(`eddy: ${k} at the shipped tolerance within 1e-4 of a 100x tighter solve`, ea[k], eb[k], 1e-4);
    }

    // Eddy tab: the empty-coil reference must be solved on the object's grid (same h and box)
    {
      const eddyTab = TABS.find((t) => t.id === 'eddy');
      const mm = 1e-3;
      for (const [a, Lo] of [[5, 20], [20, 20], [5, 60]]) {
        const p = { N: 100, I: 1, Rc: 15, l: 30, tw: 1, a, Lo, zPos: -10 };
        const obj = solenoidWithObject({ N: 100, I: 1, Rc: 15e-3, l: 30e-3, tw: 1e-3, a: a * mm, Lo: Lo * mm, muR: 1, zPos: -10e-3, nr: 61, box: 4 });
        eddyTab.p = p; eddyTab.nr = 61; eddyTab.objectIn = true; eddyTab.emptyCache = null;
        // emptyL() solves; just compare the grid it would build
        const empty = solenoidWithObject({ N: 100, I: 1, Rc: 15e-3, l: 30e-3, tw: 1e-3, a: a * mm, Lo: Lo * mm, muR: 1, zPos: -10e-3, nr: 61, box: 4 });
        check(`eddy tab: empty-coil grid matches the object grid (a = ${a} mm, Lo = ${Lo} mm)`, empty.meta.h, obj.meta.h, 1e-12);
      }
    }

    // Probe-log CSV on every tab's LIVE probe output: header and value counts must agree after
    // CSV splitting (a label with a comma broke the Inductors log).
    {
      const { Shell } = await import('../app/shell.js');
      const splitCsv = (line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).filter((x) => x !== '').map((x) => x.replace(/,$/, ''));
      let bad = [];
      for (const tab of TABS) {
        if (!tab.probe) continue;
        const fake = { tab, lastProbe: null, probePt: [0.01, 0.02] };
        try { fake.lastProbe = tab.probe(0.01, 0.02); } catch { continue; } // tabs needing a solved field under node
        if (!Array.isArray(fake.lastProbe)) continue;
        const row = Shell.prototype.probeRow.call(fake);
        const csv = Shell.probeLogCsv([row]).split('\n');
        if (splitCsv(csv[0]).length !== splitCsv(csv[1]).length) bad.push(tab.id);
      }
      check(`probe log csv: header and value counts agree on every tab that probes under node (${bad.join(',') || 'none bad'})`, bad.length, 0, 0);
    }

    // Interface, magnetic: n x (H2 - H1) = K with n from 1 to 2 gives H2t = H1t + K
    const iface = TABS.find((t) => t.id === 'interface');
    iface.mode = 'magnetic'; iface.e1 = 1; iface.e2 = 1; iface.F1 = 100; iface.th1 = 0; iface.rs = 10;
    let m = iface.solve();
    check('interface magnetic: H2t - H1t = +K', m.F2t / m.k2 - m.F1t / m.k1, 10, 1e-9);
    iface.e2 = 50; iface.th1 = 20; m = iface.solve();
    check('interface magnetic: K_m,z = (M1-M2)xn = (B2t-B1t)/mu0 - K', m.bound, (m.F2t - m.F1t) / MU0 - 10, 1e-6);
    iface.mode = 'electric'; iface.rs = 0; iface.e2 = 4; iface.th1 = 40;

    // Probe log CSV: a header precedes every run of rows with a new shape
    const csv = Shell.probeLogCsv([{ header: ['a', 'b'], values: [1, 2] }, { header: ['a', 'b'], values: [3, 4] }, { header: ['a', 'b', 'c'], values: [5, 6, 7] }]);
    const lines = csv.split('\n');
    const okRows = lines.every((l, i) => { if (!/^[a-z]/.test(l)) { let h = i; while (h >= 0 && !/^[a-z]/.test(lines[h])) h--; return lines[h].split(',').length === l.split(',').length; } return true; });
    check('probe log csv: every value row matches the header above it', okRows ? 1 : 0, 1, 0);
    check('probe log csv: header repeated when the row shape changes', lines.filter((l) => /^[a-z]/.test(l)).length, 2, 0);

    // Log colour scales: non-positive or absent bounds never collapse to 1e-300
    const zeros = new Grid2D(5, 5, [0, 1, 0, 1]);
    let [lo, hi] = scalarBounds(zeros, { log: true, min: 0 });
    check('render scalarBounds: log scale with min 0 on an all-zero grid gives finite ordered bounds', Number.isFinite(lo) && Number.isFinite(hi) && hi > lo && lo > -10 ? 1 : 0, 1, 0);
    const g = new Grid2D(5, 5, [0, 1, 0, 1]); g.data.fill(3); g.data[0] = 0; g.data[1] = -7;
    [lo, hi] = scalarBounds(g, { log: true, min: -1, max: 0 });
    check('render scalarBounds: ignores non-positive manual bounds on a log scale (uses |data| > 0)', Math.pow(10, lo), 3, 1e-9);
    check('render scalarBounds: max stays above min', hi > lo ? 1 : 0, 1, 0);

    // Gauss's law: patch areas tile the surface exactly
    const gauss = TABS.find((t) => t.id === 'gauss-law');
    gauss.n = 1; gauss.charges[0] = { q: 1, x: 0.1, y: 0.1, z: 0 };
    gauss.surf = { kind: 'sphere', cx: 0.25, cy: 0.25, cz: 0, R: 0.07, a: 0.05 }; gauss.res = 24; gauss.compute();
    check('gauss-law: sphere patches sum to 4 pi R^2', gauss.results.area, 4 * Math.PI * 0.07 * 0.07, 1e-12);
    gauss.surf.kind = 'box'; gauss.compute();
    check('gauss-law: cube patches sum to 24 a^2', gauss.results.area, 24 * 0.05 * 0.05, 1e-12);

    // mu(B): the converged material satisfies the B-H curve in every masked cell, not just on average
    {
      const h = 0.005, Rc = 0.5, a = 0.2, muI = 50, K = 2e5, Bsat = 1.0;
      const s = new AxisymMag(201, 7, { h, z0: 0, boundary: { zmin: 'neumann', zmax: 'neumann' } });
      s.jWhere((r) => Math.abs(r - Rc) < h / 4, K / h);
      s.muWhere((r) => r <= a + h / 4, muI);
      const mask = new Uint8Array(s.eps.length); for (let k = 0; k < mask.length; k++) if (s.eps[k] === muI) mask[k] = 1;
      s.setSaturation({ mask, muI, Bsat });
      s.solve(1e-12, 1e6, 100);
      const [br, bz] = s.B();
      let worst = 0;
      for (let k = 0; k < mask.length; k++) if (mask[k]) { const B = Math.hypot(br.data[k], bz.data[k]), H = B / (MU0 * s.eps[k]); worst = Math.max(worst, Math.abs(s.eps[k] - AxisymMag.Bcurve(H, muI, Bsat) / (MU0 * H)) / s.eps[k]); }
      check('axisym-mag saturating: every masked cell sits on the B-H curve (1e-3)', worst < 1e-3 ? 1 : 0, 1, 0);
    }

    // FDTD worker: a warm init carries the probe trace along, and the trace stays bounded
    {
      const { FDTD2D, TRACE_MAX } = await import('../core/fdtd2d.js');
      const s = new FDTD2D(41, 41, { h: 0.01 }); s.setTrace(20, 20); s.addSource({ i: 10, j: 20, f: 1e9 });
      s.step(TRACE_MAX + 2500);
      check('fdtd: probe trace is capped', s.trace.t.length <= TRACE_MAX + 1000 ? 1 : 0, 1, 0);
      const msgs = [];
      const self_ = { postMessage: (m) => msgs.push(m), onmessage: null };
      globalThis.self = self_;
      await import('../app/workers/relax-worker.js?audit');
      const send = (m) => self_.onmessage({ data: m });
      const base = { cmd: 'init', kind: 'fdtd', nx: 41, ny: 41, h: 0.01, epsR: new Float64Array(41 * 41).fill(1), pec: new Uint8Array(41 * 41), sources: [{ i: 10, j: 20, f: 1e9 }] };
      send({ ...base, trace: { i: 20, j: 20 } });
      send({ cmd: 'step', k: 50 });
      const f1 = msgs.at(-1);
      send({ ...base, trace: { i: 20, j: 20, t: f1.trace.t, v: f1.trace.v }, Ez: f1.Ez, Hx: f1.Hx, Hy: f1.Hy, t: f1.t, step: f1.step });
      send({ cmd: 'step', k: 10 });
      const f2 = msgs.at(-1);
      check('worker fdtd: warm init keeps the Ez(t) trace (50 + 10 samples)', f2.trace.t.length, 60, 0);
      delete globalThis.self;
    }
  }

  // ------------------------------------------------------------ 5f. Dielectrics tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const { buildPlates } = await import('../core/dielectrics.js');
    const tab = TABS.find((t) => t.id === 'dielectrics');
    // URL state: regions round-trip through de/df lists, hold and mode survive
    const stub = Object.create(tab);
    stub.p = { ...tab.pDefaults, V: 12 }; stub.mode = 'side'; stub.hold = 'Q'; stub.regions = [{ eps: 3, f: 0.25 }, { eps: 7, f: 0.75 }]; stub.res = 10; stub.walls = 'neumann';
    const st = stub.getState();
    check('dielectrics state: eps list', st.de.join(',') === '3,7' ? 1 : 0, 1, 0);
    check('dielectrics state: fraction list', st.df.join(',') === '0.25,0.75' ? 1 : 0, 1, 0);
    check('dielectrics state: mode and hold', `${st.dm}/${st.dq}/${st.d_V}` === 'side/Q/12' ? 1 : 0, 1, 0);
    // csv: one row per node with eps and region columns aligned
    const s = buildPlates({ mode: 'layered', res: 6, regions: [{ eps: 5, f: 0.5 }, { eps: 2, f: 0.5 }] });
    stub.solver = s; stub.V = new Float64Array(s.V); stub.meta = s.meta; stub.results = null; stub.hold = 'V'; stub.p.V = 1;
    const rows = tab.csv.call(stub).split('\n');
    check('dielectrics csv: one row per node (+ header)', rows.length, s.nx * s.ny + 1, 0);
    const k = s.idx(s.meta.ic, s.meta.jBot + 2), cols = rows[1 + k].split(',');
    check('dielectrics csv: eps column aligned with the node', parseFloat(cols[5]), s.eps[k], 0);
    check('dielectrics csv: region column is 1-based', parseFloat(cols[6]), s.reg[k] + 1, 0);
    // the tab's scale(): hold V gives V; hold Q gives Q/C
    stub.results = { C: 2e-12 }; stub.hold = 'Q'; stub.p.Q = 4; // 4 nC
    check('dielectrics scale(): V = Q / C when Q is held', tab.scale.call(stub), 4e-9 / 2e-12, 1e-12);
    stub.hold = 'V'; stub.p.V = 7;
    check('dielectrics scale(): V itself when V is held', tab.scale.call(stub), 7, 0);
  }

  // ------------------------------------------------------------ 5g. Ampère tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'ampere');
    const stub = Object.create(tab);
    stub.src = 'coax'; stub.p = { I: 3, a: 0.004, b: 0.01, c: 0.013, K: 100, w: 0.03, N: 40, L: 0.05, sa: 0.01, R1: 0.02, R2: 0.03 };
    stub.loop = { shape: 'rect', cx: 0.001, cy: -0.002, R: 0.012, w: 0.04, h: 0.03 }; stub.ccw = false; stub.nseg = 64; stub.n = 2; stub.wires = [];
    const st = stub.getState();
    check('ampere state: source params for coax only', Object.keys(st).filter((k) => ['I', 'a', 'b', 'c', 'K', 'N'].includes(k)).sort().join(',') === 'I,a,b,c' ? 1 : 0, 1, 0);
    check('ampere state: clockwise flag', st.cw, 1, 0);
    check('ampere state: loop geometry', `${st.ls}/${st.lx}/${st.ly}/${st.lw}/${st.lh}` === 'rect/0.001/-0.002/0.04/0.03' ? 1 : 0, 1, 0);
    // loop computation without a shell: computeLoop() needs only src/loop; renderResults is a no-op without an element
    stub.srcObj = tab.source.call(stub); stub.resultsEl = null; stub.shell = { layerOn: new Map() };
    tab.computeLoop.call(stub);
    check('ampere stub: clockwise loop around the whole coax reads zero on both sides', Math.abs(stub.results.circ) + Math.abs(stub.results.expect), 0, 1e-12);
    const rows = tab.csv.call(stub).split('\n');
    check('ampere csv: one row per segment + header + totals', rows.length, 64 + 1 + 4, 0);
    check('ampere csv: dl column sums to the perimeter', rows.slice(1, 65).reduce((a, r) => a + parseFloat(r.split(',')[6]), 0), 0.14, 1e-9);
  }

  // ------------------------------------------------------------ 5h. Solenoids tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const { turnsB } = await import('../core/solenoid.js');
    const tab = TABS.find((t) => t.id === 'solenoids');
    const stub = Object.create(tab);
    stub.kind = 'pair'; stub.p = { N: 7, I: 2, L: 30, a: 25, d: 20, sign: -1 };
    const st = stub.getState();
    check('solenoids state: kind and every parameter', st.kind === 'pair' && st.s_N === 7 && st.s_d === 20 && st.s_sign === -1 ? 1 : 0, 1, 0);
    stub.T = tab.turns.call(stub);
    check('solenoids stub: pair has two loops, second reversed', stub.T.length === 2 && stub.T[1].I === -2 ? 1 : 0, 1, 0);
    stub.kind = 'sheet'; stub.T = tab.turns.call(stub);
    check('solenoids stub: ideal sheet carries N I over its filaments', stub.T.reduce((a, t) => a + t.I, 0), 14, 1e-12);
    stub.kind = 'solenoid'; stub.T = tab.turns.call(stub);
    const [bz, bx] = tab.B.call(stub, 0.004, -0.006), [br] = turnsB(stub.T, 0.006, 0.004);
    check('solenoids B(z, x): transverse component is sign(x) B_rho', bx, -br, 1e-15);
    check('solenoids B(z, x): axial component', bz, turnsB(stub.T, 0.006, 0.004)[1], 1e-15);
  }

  // ------------------------------------------------------------ 5i. Filters tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'filters');
    const stub = Object.create(tab);
    stub.p = { ...tab.pDefaults, circuit: 'rc', output: 'R', C: 0.0885, R: 1000, f: 1.8e6 }; stub.src = { C: 'x', L: '' }; stub.resultsEl = null;
    const st = stub.getState();
    check('filters state: circuit, output and numbers', st.f_circuit === 'rc' && st.f_output === 'R' && st.f_C === 0.0885 && st.f_csrc === 'x' ? 1 : 0, 1, 0);
    // cross-tab pulls read the other tabs' last results through the shell
    stub.shell = { tabs: [{ id: 'dielectrics', title: 'Dielectrics', results: { C: 1.3e-11 }, p: { d: 5, depth: 100 } }, { id: 'inductors', title: 'Inductors', results: null }, { id: 'solenoids', title: 'Solenoids', results: { Lnag: 2.04e-4 } }] };
    check('filters fromTab: C from Dielectrics with its gap', (() => { const v = tab.fromTab.call(stub, 'dielectrics'); return v.C === 1.3e-11 && v.gap === 5 ? 1 : 0; })(), 1, 0);
    check('filters fromTab: an unsolved tab gives a reason, not a value', tab.fromTab.call(stub, 'inductors').err ? 1 : 0, 1, 0);
    check('filters fromTab: L from Solenoids (Nagaoka)', tab.fromTab.call(stub, 'solenoids').L, 2.04e-4, 0);
    tab.compute.call(stub);
    check('filters stub compute: RC high-pass at f_c is −3.01 dB', stub.results.db, -20 * Math.log10(Math.SQRT2), 2e-3);
    const rows = tab.csv.call(stub).split('\n');
    check('filters csv: 300 frequency rows + header', rows.length, 301, 0);
    check('filters csv: gain column is finite', rows.slice(1).every((r) => Number.isFinite(parseFloat(r.split(',')[1]))) ? 1 : 0, 1, 0);
  }

  // ------------------------------------------------------------ 5j. Faraday tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'faraday');
    const stub = Object.create(tab);
    stub.mode = 'loop'; stub.p = JSON.parse(JSON.stringify({ bar: { B: 1 }, loop: { B: 0.5, W: 200, w: 80, h: 50, R: 0.05, v: 1, x0: -150 }, field: {}, generator: {} })); stub.t = 0.2; stub.speed = 0.5;
    const st = stub.getState();
    check('faraday state: only the active setting\'s parameters are written', Object.keys(st).filter((k) => k.includes('_')).every((k) => k.startsWith('loop_')) ? 1 : 0, 1, 0);
    check('faraday state: time and speed', st.t === 0.2 && st.spd === 0.5 ? 1 : 0, 1, 0);
    const q = tab.params.call(stub);
    check('faraday params: mm → m', q.W === 0.2 && q.w === 0.08 && q.x0 === -0.15 ? 1 : 0, 1, 0);
    check('faraday window: covers the whole pass', tab.window.call(stub) > (0.2 + 0.08 + 0.15) / 1 ? 1 : 0, 1, 0);
    const rows = tab.csv.call(stub).split('\n');
    check('faraday csv: 501 rows + header', rows.length, 502, 0);
    check('faraday csv: loop columns include x and F', rows[0].split(',').length, 6, 0);
  }

  // ------------------------------------------------------------ 5k. Charges in fields tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'charges-in-fields');
    const stub = Object.create(tab);
    stub.mode = 'particle'; stub.p = JSON.parse(JSON.stringify(tab.defaults)); stub.t = 0; stub.speed = 0.3;
    Object.assign(stub.p.particle, { parts: [{ sp: 'proton', v: 1e5, ang: 0, y0: 0, qc: 1, mc: 1 }, { sp: 'custom', v: 1e5, ang: 0, y0: 0, qc: 2, mc: 4 }], split: true, E1y: 5e4, B1: 0.5, B2: 0.5, x0: -6, dur: 0.3 });
    const st = stub.getState();
    check('charges state: particle list flattens to 5 fields each', st.parts.length, 10, 0);
    check('charges state: custom q/m encoded', st.parts[9] === '2/4' ? 1 : 0, 1, 0);
    check('charges state: booleans as 0/1', st.particle_split, 1, 0);
    tab.compute.call(stub);
    check('charges traces: both selected particles reach the detector', stub.traces.every((T) => T.tr.detector) ? 1 : 0, 1, 0);
    check('charges traces: custom (2e, 4 m_p) lands at the same radius as a deuteron would (m/q = 2)', stub.traces[1].r2 / stub.traces[0].r2, 2, 1e-12);
    const rows = tab.csv.call(stub).split('\n');
    check('charges csv: header + one row per sample per particle', rows.length, 1 + stub.traces.reduce((a, T) => a + T.tr.t.length, 0), 0);
    stub.mode = 'hall'; stub.res = null; tab.compute.call(stub);
    check('charges hall stub: copper default gives −73 nV at 1 A, 1 T, 1 mm', stub.res.VH, -7.343e-8, 1e-3);
  }

  // ------------------------------------------------------------ 5l. Line waves tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'tline-waves');
    const stub = Object.create(tab);
    stub.p = { ...tab.pDefaults, load: 'RL', RL: 25, Lload: 4, len: 0.25 }; stub.t = 0; stub.speed = 0.05; stub.src = ''; stub.resultsEl = null;
    const st = stub.getState();
    check('tline-waves state: every parameter under tw_', Object.keys(st).filter((k) => k.startsWith('tw_')).length, Object.keys(tab.pDefaults).length, 0);
    const L = tab.line.call(stub);
    check('tline-waves line(): λ = v/f and l = len λ', L.l, 0.25 * (0.667 * 299792458 / 1e9), 1e-9);
    tab.compute.call(stub);
    check('tline-waves compute: Z_L is 25 + jωL', stub.res.ZL[1], 2 * Math.PI * 1e9 * 4e-9, 1e-12);
    const rows = tab.csv.call(stub).split('\n');
    check('tline-waves csv: 401 rows + header', rows.length, 402, 0);
    stub.shell = { tabs: [{ id: 'transmission-lines' }] };
    check('tline-waves fromTlTab: unvisited tab gives a reason', tab.fromTlTab.call(stub).err ? 1 : 0, 1, 0);
  }

  // ------------------------------------------------------------ 5m. Plane waves tab (app layer, no DOM)
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'plane-waves');
    const stub = Object.create(tab);
    stub.p = { ...tab.pDefaults, iface: true, m2: 'copper', e2: 1, u2: 1, s2: 5.8e7 }; stub.t = 0; stub.speed = 0.1; stub.resultsEl = null;
    const st = stub.getState();
    check('plane-waves state: interface flag as 1', st.pw_iface, 1, 0);
    tab.compute.call(stub);
    check('plane-waves compute: air→copper Γ ≈ −1', stub.res.inc.G[0], -1, 1e-4);
    const [z0, z1] = tab.zRange.call(stub);
    check('plane-waves zRange: medium 2 keeps at least 15 % of the width even when its skin depth is microns', z1 >= 0.15 * -z0 - 1e-12 ? 1 : 0, 1, 0);
    check('plane-waves zRange: medium 1 span is a few wavelengths', -z0 > 0.5 && -z0 < 1 ? 1 : 0, 1, 0);
    const rows = tab.csv.call(stub).split('\n');
    check('plane-waves csv: 401 rows + header', rows.length, 402, 0);
  }

  // ------------------------------------------------------------ 6. golden files (handout numbers)
  {
    const cases = {};
    const cap = (p) => { const s = diskCapacitor(p); s.solve(2e-8 * (p.V ?? 5), 2e6, 1); return 2 * s.energy() / (p.V ?? 5) ** 2; }; // the tab's tolerance; k = 1 matches the worker's per-sweep stop
    cases['lab3 run1 C (5V,4mm,6mm,5,5) coarse'] = cap({ V: 5, g: 4e-3, R: 6e-3, epsR: 5, epsR2: 5, cellsPerLayer: 2 });
    cases['lab3 run1 C (5V,4mm,6mm,5,5) normal'] = cap({ V: 5, g: 4e-3, R: 6e-3, epsR: 5, epsR2: 5, cellsPerLayer: 4 });
    cases['lab3 layered C (5V,4mm,6mm,2,8) normal'] = cap({ V: 5, g: 4e-3, R: 6e-3, epsR: 2, epsR2: 8, cellsPerLayer: 4 });
    const coil = solenoidWithObject({}); coil.solve(1e-7 * 1.25663706e-6 * 100 * 1 * 15e-3, 2e6, 1);
    cases['lab5 default L flux (uH)'] = 2 * coil.energyJA() * 1e6;
    { const { buildPlates } = await import('../core/dielectrics.js'); const dp = buildPlates({ mode: 'layered', res: 20, regions: [{ eps: 5, f: 0.5 }, { eps: 2, f: 0.5 }] }); dp.solve(2e-8, 2e6, 1); cases['dielectrics default C per metre (layered 5|2, 20 cells)'] = 2 * dp.energy(); }
    const empty = solenoidWithObject({ a: 0, muR: 1 }); empty.solve(1e-7 * 1.25663706e-6 * 100 * 1 * 15e-3, 2e6, 1);
    cases['lab5 empty coil L flux (uH)'] = 2 * empty.energyJA() * 1e6;
    cases['lab1 probe V (2C@0.2,0.3; -2C@0.3,0.2) at (0.25,0.25)'] = pointChargesField([{ q: 2, pos: [0.2, 0.3, 0] }, { q: -2, pos: [0.3, 0.2, 0] }], [0.25, 0.25, 0]).V;
    cases['lab4 probe |B| (2A@-15,15mm; -2A@-15,-15mm) at (0,0)'] = Math.hypot(...wiresField([{ I: 2, pos: [-0.015, 0.015] }, { I: -2, pos: [-0.015, -0.015] }], [0, 0]).B);
    const path = join(ROOT, 'bench', 'golden.json');
    if (process.argv.includes('--freeze')) {
      const { SEMESTER } = await import('../app/version.js');
      writeFileSync(path, JSON.stringify({ frozen: new Date().toISOString().slice(0, 10), semester: SEMESTER, cases }, null, 2) + '\n');
      console.log(`golden.json re-frozen with ${Object.keys(cases).length} cases`);
    }
    let golden = null;
    try { golden = JSON.parse(readFileSync(path, 'utf8')); } catch { /* none yet */ }
    if (!golden) check('golden: bench/golden.json exists (run with --freeze to create it)', 0, 1, 0);
    else for (const [name, value] of Object.entries(cases)) {
      if (golden.cases[name] === undefined) { check(`golden: ${name} (new case, freeze it)`, 0, 1, 0); continue; }
      check(`golden (${golden.semester ?? golden.frozen}): ${name}`, value, golden.cases[name], 5e-3);
    }
  }
}
