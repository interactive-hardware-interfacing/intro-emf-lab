// Transmission-line checks: the closed forms against textbook numbers, the TEM identity
// L'C' = mu eps for every geometry, the twin-lead against its thin-wire limit, and the
// Gauss-Seidel cross-section solve against the exact coax capacitance.

import { EPS0, MU0 } from '../core/constants.js';
import { Relax2D } from '../core/relax2d.js';
import { lineParams, twinThinWireC } from '../app/tabs/transmission-lines.js';

export async function tlineChecks(check) {
  const c0 = 1 / Math.sqrt(MU0 * EPS0);

  // Coax with b/a = e in vacuum: Z0 = 60 ln(b/a) = 60 ohm exactly (with mu0 = 4 pi e-7).
  {
    const r = lineParams({ geom: 'coax', a: 1e-3, b: Math.E * 1e-3, epsR: 1 });
    check('tline coax b/a = e, vacuum: Z0 = 60 ohm (0.1%)', r.Z0, 60, 1e-3);
    check('tline coax vacuum: v = c', r.v, c0, 1e-12);
  }
  // RG-58: a = 0.45 mm, b = 1.475 mm, polyethylene 2.25 -> ~47.5 ohm, v = 0.667 c
  {
    const r = lineParams({ geom: 'coax', a: 0.45e-3, b: 1.475e-3, epsR: 2.25 });
    check('tline RG-58-like coax: Z0 in 47..50 ohm (got nominal)', r.Z0 > 47 && r.Z0 < 50 ? 1 : 0, 1, 0);
    check('tline RG-58-like coax: v/c = 1/sqrt(2.25)', r.v / c0, 1 / 1.5, 1e-12);
    check('tline RG-58-like coax: C\' ~ 105 pF/m (5%)', r.C, 105e-12, 5e-2);
  }
  // L'C' = mu0 eps0 epsR for every geometry
  for (const p of [
    { geom: 'coax', a: 0.5e-3, b: 3e-3, epsR: 4 },
    { geom: 'twin', a: 0.5e-3, d: 4e-3, epsR: 1.7 },
    { geom: 'plates', w: 10e-3, d: 1e-3, epsR: 9 },
  ]) {
    const r = lineParams(p);
    check(`tline ${p.geom}: L'C' = mu0 eps0 epsR`, r.L * r.C, MU0 * EPS0 * p.epsR, 1e-12);
    check(`tline ${p.geom}: Z0 = sqrt(L'/C')`, r.Z0, Math.sqrt(r.L / r.C), 1e-12);
  }
  // Twin-lead: the exact acosh form tends to the thin-wire ln form for d >> a
  {
    const near = { geom: 'twin', a: 0.5e-3, d: 3e-3, epsR: 1 }, far = { geom: 'twin', a: 0.5e-3, d: 200e-3, epsR: 1 };
    check('tline twin-lead d/a = 6: exact and thin-wire C\' differ by a few %', lineParams(near).C / twinThinWireC(near), 1, 0.05);
    check('tline twin-lead d/a = 400: exact -> thin-wire (0.01%)', lineParams(far).C / twinThinWireC(far), 1, 1e-4);
    // Z0 for air-spaced 300-ohm-ish ladder line: a = 0.5 mm, d = 7.5 mm -> 120 acosh(7.5) ~ 324 ohm
    check('tline twin-lead a = 0.5 mm, d = 7.5 mm, air: Z0 = 120 acosh(d/2a)', lineParams({ geom: 'twin', a: 0.5e-3, d: 7.5e-3, epsR: 1 }).Z0, 120 * Math.acosh(7.5), 2e-3);
  }
  // Parallel plates: C' = eps w / d
  check('tline plates: C\' = eps w / d', lineParams({ geom: 'plates', w: 20e-3, d: 2e-3, epsR: 3 }).C, 3 * EPS0 * 10, 1e-12);

  // Gauss-Seidel coax through the tab's own buildSolver (the outer conductor is the boundary,
  // so the only error is discretisation of the circles). Two radius ratios: RG-58 (b/a = 3.3)
  // and a tight one (b/a = 1.5) whose Gauss box must stay inside the outer conductor — the
  // old square of half-side (a+b)/2 had corners in the outer conductor for b/a < 2.41 and
  // read 28% low there. The energy route is an exact identity for a grounded outer conductor.
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'transmission-lines');
    const shell = { view: { extent: null }, setExtent(e) { this.view.extent = e; } };
    tab.shell = shell; tab.n = 161; tab.geom = 'coax';
    for (const [a, b, epsR, tol] of [[0.45e-3, 1.475e-3, 2.25, 2.5e-2], [1e-3, 1.5e-3, 1, 4e-2]]) {
      tab.a = a; tab.b = b; tab.epsR = epsR; tab.validate(); tab.applyExtent();
      const s = tab.buildSolver(); s.solve(1e-9, 600000, 100);
      const C = s.gaussCharge(...tab.gaussBox), exact = lineParams({ geom: 'coax', a, b, epsR }).C;
      check(`tline coax Gauss-Seidel 161^2, b/a = ${(b / a).toFixed(2)}: C' within ${tol * 100}% of 2 pi eps / ln(b/a)`, C, exact, tol);
      check(`tline coax b/a = ${(b / a).toFixed(2)}: C' from energy equals the Gauss box (exact identity, 1e-6)`, 2 * s.energy(), C, 1e-6);
    }
    tab.shell = null;
  }

  // Twin-lead and parallel plates through the tab's own buildSolver (a stub shell carries the
  // extent), so the bench exercises exactly what "Run numeric check" runs.
  {
    const { TABS } = await import('../app/tabs/index.js');
    const tab = TABS.find((t) => t.id === 'transmission-lines');
    const shell = { view: { extent: null }, setExtent(e) { this.view.extent = e; } };
    tab.shell = shell; tab.n = 161; tab.epsR = 2.25;
    tab.geom = 'twin'; tab.a = 1e-3; tab.d = 6e-3; tab.validate(); tab.applyExtent();
    let s = tab.buildSolver(); s.solve(1e-8, 400000, 100);
    let C = s.gaussCharge(...tab.gaussBox);
    check('tline twin-lead Gauss-Seidel 161^2: C\' within 3% of the image solution', C, lineParams(tab.params()).C, 3e-2);
    tab.geom = 'plates'; tab.w = 20e-3; tab.d = 2e-3; tab.validate(); tab.applyExtent();
    s = tab.buildSolver(); s.solve(1e-8, 400000, 100);
    C = s.gaussCharge(...tab.gaussBox);
    const ideal = lineParams(tab.params()).C;
    check('tline plates Gauss-Seidel 161^2: C\' above the ideal (fringing) by less than 8%', C / ideal > 1 && C / ideal < 1.08 ? 1 : 0, 1, 0);
    tab.shell = null;
  }
}
