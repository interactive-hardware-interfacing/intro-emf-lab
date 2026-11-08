// FDTD checks that need the app layer (the tab's presets). The solver's own checks live in
// core/test/fdtd.js.
import { FDTD2D } from '../core/fdtd2d.js';

export async function fdtdAppChecks(check) {
  // 6. Every preset on every grid size: no source inside the absorbing layer, and the box is
  //    quiet long after the pulse has left (a soft source inside the PML leaves a permanent
  //    uniform Ez; this happened at 101^2 where 0.15 m was 8 cells and the layer 10).
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'fdtd');
    let worstSrc = Infinity, worstQuiet = 0;
    for (const n of [101, 201, 301]) for (const preset of ['free', 'slab', 'slit', 'lens', 'guide', 'empty']) {
      tab.n = n; tab.preset = preset; tab.wave = 'pulse'; tab.f = 1e9; tab.yWall = 'mur'; tab.abc = 'pml';
      tab.loadPreset();
      const s = new FDTD2D(n, n, { h: tab.h, epsR: tab.epsR, pec: tab.pec, abc: 'pml' });
      for (const src of tab.sources) { s.addSource(src); const i = src.i, j = src.j ?? Math.floor(n / 2); worstSrc = Math.min(worstSrc, i - s.npml, n - 1 - s.npml - i, j - s.npml, n - 1 - s.npml - j); }
      let peak = 0; for (let k = 0; k < 2500; k++) { s.step(1); if (k % 25 === 0) peak = Math.max(peak, s.energy()); }
      let mx = 0; for (let k = 0; k < s.Ez.length; k++) mx = Math.max(mx, Math.abs(s.Ez[k]));
      if (preset !== 'guide') worstQuiet = Math.max(worstQuiet, s.energy() / peak); // the guide keeps slow near-cutoff modes for a long time: physics, not a leak
      if (preset === 'slab' && n === 101) check('fdtd preset slab at 101^2: no residual uniform Ez (|Ez|max < 1e-3 V/m after 2500 steps)', mx < 1e-3 ? 1 : 0, 1, 0);
    }
    check('fdtd presets: every source sits at least 2 cells outside the PML on 101/201/301 grids', worstSrc >= 2 ? 1 : 0, 1, 0);
    check('fdtd presets: energy after 2500 steps < 1e-4 of the peak on every open-box preset and grid', worstQuiet < 1e-4 ? 1 : 0, 1, 0);
  }
}
