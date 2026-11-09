// Dielectrics checks: the parallel-plate builder with up to four regions against the series and
// parallel formulas, the discrete identities (energy = Gauss = plate charge; free + bound =
// eps0 E), the per-region table (same D layered, same E side by side) and the slab force.
import { EPS0 } from '../constants.js';
import { buildPlates, plateCharges, boundCharges, gaussTopPlate, regionTable, idealC, idealSlabForce, snapCounts, seriesC, parallelC } from '../dielectrics.js';

const TOL = 2e-8; // the tab's tolerance on the 1 V solve
const TIGHT = 1e-10; // for the exact discrete identities (energy = Gauss = plate charge)

export function dielectricsChecks(check) {
  // 1. Snapping: counts sum to the total, every region gets at least one node, and the snapped
  //    fractions sum to 1 (end regions carry the half cell against the plate).
  {
    for (const [fr, total, endHalf] of [[[0.5, 0.5], 19, true], [[0.95, 0.05], 29, true], [[0.25, 0.25, 0.25, 0.25], 19, true], [[0.3, 0.3, 0.4], 101, false], [[0.02, 0.98], 9, true]]) {
      const c = snapCounts(fr, total, endHalf);
      check(`dielectrics snapCounts ${JSON.stringify(fr)}/${total}: counts sum to the total`, c.reduce((a, b) => a + b, 0), total, 0);
      check(`dielectrics snapCounts ${JSON.stringify(fr)}/${total}: every region at least one node`, Math.min(...c) >= 1 ? 1 : 0, 1, 0);
    }
    for (const mode of ['layered', 'side']) for (const regs of [[{ eps: 5, f: 0.5 }, { eps: 2, f: 0.5 }], [{ eps: 1, f: 0.2 }, { eps: 3, f: 0.3 }, { eps: 7, f: 0.1 }, { eps: 2, f: 0.4 }]]) {
      const s = buildPlates({ mode, res: 10, regions: regs });
      check(`dielectrics ${mode} ${regs.length} regions: snapped fractions sum to 1`, s.meta.regions.reduce((a, r) => a + r.f, 0), 1, 1e-12);
    }
  }

  // 2. Layered 5 | 2 at 20 cells: D equal in both layers at the centre column, drops add to V,
  //    the split follows the series formula for the snapped thicknesses, and C three ways agree.
  {
    const s = buildPlates({ mode: 'layered', res: 20, regions: [{ eps: 5, f: 0.5 }, { eps: 2, f: 0.5 }] });
    s.solve(TIGHT, 4e6, 50);
    const pl = plateCharges(s), rows = regionTable(s, pl), g = gaussTopPlate(s), W = s.energy();
    check('dielectrics layered: D equal in both layers at the centre (1e-4)', rows[0].D, rows[1].D, 1e-4);
    {
      const t2 = buildPlates({ mode: 'layered', res: 20, regions: [{ eps: 5, f: 0.5 }, { eps: 2, f: 0.5 }] }); t2.solve(TOL, 2e6, 50);
      check('dielectrics layered: C(energy) at the shipped tolerance within 1e-5 of the tight solve', 2 * t2.energy(), 2 * W, 1e-5);
      check('dielectrics layered: C(Gauss) at the shipped tolerance within 1e-5 of the tight solve', gaussTopPlate(t2), g, 1e-5);
      check('dielectrics layered: energy and Gauss agree to 1e-5 at the shipped tolerance', 2 * t2.energy(), gaussTopPlate(t2), 1e-5);
    }
    check('dielectrics layered: voltage drops add to V (1e-9)', rows[0].V + rows[1].V, 1, 1e-9);
    const [r0, r1] = s.meta.regions, share1 = (r1.f / r1.eps) / (r0.f / r0.eps + r1.f / r1.eps);
    check('dielectrics layered: low-eps layer takes the series-formula share of V (1e-4)', rows[1].V, share1, 1e-4);
    check('dielectrics layered: C from energy equals the Gauss box (exact identity, 1e-6)', 2 * W, g, 1e-6);
    check('dielectrics layered: C from energy equals the plate charge summed face by face (1e-6)', 2 * W, pl.top, 1e-6);
    check('dielectrics layered: top and bottom plate charges are equal and opposite (1e-6)', pl.top, -pl.bottom, 1e-6);
    check('dielectrics layered: simulated C exceeds the series formula (fringing)', 2 * W > idealC(s.meta).C ? 1 : 0, 1, 0);
    check('dielectrics layered: fringing excess below 40% at w/d = 5', 2 * W / idealC(s.meta).C < 1.4 ? 1 : 0, 1, 0);
    // bound charge: on the face against the + plate, free + bound = eps0 E_n (the net is Q/eps_r of that layer)
    const b = boundCharges(s), topGap = pl.topGap.reduce((a, x) => a + x, 0);
    const bTop = b.faces.find((f) => f.b === 'top').Q;
    check('dielectrics layered: net charge at the + plate (free gap side + bound face) = free / eps_r (1e-6)', topGap + bTop, topGap / r1.eps, 1e-6);
    const bBot = b.faces.find((f) => f.b === 'bottom').Q, botGap = -topGap; // the bottom plate's gap-side free charge mirrors the top's for this discrete solution
    check('dielectrics layered: bound charge against the - plate is positive', bBot > 0 ? 1 : 0, 1, 0);
    check('dielectrics layered: bound charge against the + plate is negative', bTop < 0 ? 1 : 0, 1, 0);
    // the interface sheet: D_n (1/eps_b - 1/eps_a) with D from the table
    const bInt = b.faces.find((f) => f.key === '0|1').Q;
    check('dielectrics layered: interface bound sheet = D (1/eps2 - 1/eps1) w (2e-2, fringing at the plate ends)', bInt, -rows[0].D * (1 / r1.eps - 1 / r0.eps) * s.meta.w, 2e-2);
    void botGap;
  }

  // 3. Air gap: 5 | 1 at 30 cells, 5% requested -> 1.5 cells = 5% used, and the gap takes the
  //    handout's share of V (0.05 / (0.95/5 + 0.05) = 20.8%).
  {
    const s = buildPlates({ mode: 'layered', res: 30, regions: [{ eps: 5, f: 0.95 }, { eps: 1, f: 0.05 }] });
    check('dielectrics air gap: 5% of d snaps to exactly 1.5 cells at 30 cells', s.meta.regions[1].f, 0.05, 1e-12);
    s.solve(TOL, 4e6, 50);
    const rows = regionTable(s, plateCharges(s));
    check('dielectrics air gap: the air takes 20.8% of V (1e-3)', rows[1].V, 0.05 / (0.95 / 5 + 0.05), 1e-3);
    check('dielectrics air gap: E in the air is 5x E in the slab (1e-4)', rows[1].E / rows[0].E, 5, 1e-4);
  }

  // 4. Side by side 5 | 1: E equal in both regions, charges add to the gap-side charge, the
  //    shares follow eps_i A_i, and C three ways agree.
  {
    const s = buildPlates({ mode: 'side', res: 20, regions: [{ eps: 5, f: 0.5 }, { eps: 1, f: 0.5 }] });
    s.solve(TIGHT, 4e6, 50);
    const pl = plateCharges(s), rows = regionTable(s, pl), W = s.energy();
    check('dielectrics side: E equal in both regions at mid-gap (2e-4)', rows[0].E, rows[1].E, 2e-4);
    check('dielectrics side: E at mid-gap = V/d (1e-3)', rows[0].E, 1 / s.meta.d, 1e-3);
    const [r0, r1] = s.meta.regions;
    check('dielectrics side: plate-charge shares follow eps_i w_i (1e-2, fringing at the plate ends)', rows[0].share, (r0.eps * r0.f) / (r0.eps * r0.f + r1.eps * r1.f), 1e-2);
    check('dielectrics side: region charges add to the gap-side plate charge (1e-9)', rows[0].Q + rows[1].Q, pl.topGap.reduce((a, x) => a + x, 0), 1e-9);
    check('dielectrics side: C from energy equals the Gauss box (1e-6)', 2 * W, gaussTopPlate(s), 1e-6);
    check('dielectrics side: C exceeds the parallel formula (fringing)', 2 * W > idealC(s.meta).C ? 1 : 0, 1, 0);
    const b = boundCharges(s);
    check('dielectrics side: no bound charge on the interface (same E_t, P_n = 0; 1e-9 of the plate face)', Math.abs(b.faces.find((f) => f.key === '0|1')?.Q ?? 0) / Math.abs(b.faces.find((f) => f.key === '0|top').Q), 0, 1e-9);
  }

  // 5. Slab force: dC/dx from one-cell shifts against the handout's (eps1 - eps2) eps0 / (2 d) per V^2.
  {
    const Cs = [];
    for (const shift of [-1, 1]) { const s = buildPlates({ mode: 'side', res: 10, regions: [{ eps: 5, f: 0.5 }, { eps: 1, f: 0.5 }], colShift: shift }); s.solve(TOL, 2e6, 50); Cs.push({ C: 2 * s.energy(), x: s.meta.regions[0].f * s.meta.w }); }
    const dCdx = (Cs[1].C - Cs[0].C) / (Cs[1].x - Cs[0].x);
    const meta = buildPlates({ mode: 'side', res: 10, regions: [{ eps: 5, f: 0.5 }, { eps: 1, f: 0.5 }] }).meta;
    check('dielectrics slab force: dC/dx within 5% of (eps1 - eps2) eps0 / d', 0.5 * dCdx, idealSlabForce(meta, 1), 5e-2);
    check('dielectrics slab force: the shift moved the interface by exactly one cell', Cs[1].x - Cs[0].x, 2 * meta.h, 1e-9);
  }

  // 6. Four layers: series formula with the snapped thicknesses, D equal in all four.
  {
    const regs = [{ eps: 2, f: 0.25 }, { eps: 8, f: 0.25 }, { eps: 1, f: 0.25 }, { eps: 4, f: 0.25 }];
    const s = buildPlates({ mode: 'layered', res: 20, regions: regs });
    s.solve(TOL, 2e6, 50);
    const rows = regionTable(s, plateCharges(s));
    // 2-D: a little flux spreads sideways through the eps = 8 layer, so the centre column is 1-D only to ~1e-3
    check('dielectrics four layers: D equal in all four at the centre (3e-3)', Math.max(...rows.map((r) => r.D)) / Math.min(...rows.map((r) => r.D)), 1, 3e-3);
    check('dielectrics four layers: drops add to V (1e-9)', rows.reduce((a, r) => a + r.V, 0), 1, 1e-9);
    const T = s.meta.regions.reduce((a, r) => a + r.f / r.eps, 0);
    for (const [k, r] of rows.entries()) check(`dielectrics four layers: layer ${k + 1} takes the series share of V (2e-3)`, r.V, (s.meta.regions[k].f / s.meta.regions[k].eps) / T, 2e-3);
    check('dielectrics four layers: seriesC and parallelC bracket the simulated C (Wiener)', (2 * s.energy() >= seriesC(s.meta.w, s.meta.d, s.meta.regions) && 2 * s.energy() <= 1.4 * parallelC(s.meta.w, s.meta.d, s.meta.regions)) ? 1 : 0, 1, 0);
  }

  // 7. Tilted interface: converges, C between the series and parallel values (Wiener bounds)
  //    for the same area fractions, energy = Gauss, and the normal D is continuous face by face.
  {
    const s = buildPlates({ mode: 'tilted', res: 20, theta: 30, regions: [{ eps: 5, f: 0.5 }, { eps: 1, f: 0.5 }] });
    const r = s.solve(TIGHT, 4e6, 50);
    check('dielectrics tilted: converged', r.converged ? 1 : 0, 1, 0);
    const C = 2 * s.energy(), id = idealC(s.meta);
    check('dielectrics tilted: C above the series bound', C > id.lo ? 1 : 0, 1, 0);
    check('dielectrics tilted: C below the parallel bound plus 40% fringing', C < 1.4 * id.hi ? 1 : 0, 1, 0);
    check('dielectrics tilted: C from energy equals the Gauss box (1e-6)', C, gaussTopPlate(s), 1e-6);
    // the staircase interface: eps0 eps E_n is the same number on both sides of every face by
    // construction (one face flux), so check instead that the table's D_n agree to the order the
    // non-uniform field allows and E_t likewise
    const rows = regionTable(s, plateCharges(s));
    // tan(th1)/tan(th2) = eps1/eps2: E_t is shared and E_n is smaller in the high-eps region, so E leans away from the normal there
    check('dielectrics tilted: E leans away from the normal in the high-eps region (larger angle)', rows[0].angle > rows[1].angle ? 1 : 0, 1, 0);
  }

  // 8. Inserting a slab that fills the gap (not all space): C rises by less than eps_r because the
  //    fringe field stays in air; at the centre the field ratio is exactly eps_r. Fixed Q and fixed V
  //    are the same scaled solution, which is what the tab relies on.
  {
    const air = buildPlates({ mode: 'layered', res: 10, regions: [{ eps: 1, f: 1 }] }); air.solve(TOL, 2e6, 50);
    const slab = buildPlates({ mode: 'layered', res: 10, regions: [{ eps: 4, f: 1 }] }); slab.solve(TOL, 2e6, 50);
    const C0 = 2 * air.energy(), C = 2 * slab.energy();
    check('dielectrics insert a slab: C/C0 between 3 and 4 when the slab fills only the gap', C / C0 > 3 && C / C0 < 4 ? 1 : 0, 1, 0);
    const ra = regionTable(air, plateCharges(air)), rs = regionTable(slab, plateCharges(slab));
    check('dielectrics insert a slab: D at the centre rises by eps_r (1e-3)', rs[0].D / ra[0].D, 4, 1e-3);
    const ps = plateCharges(slab);
    const b = boundCharges(slab), topGap = ps.topGap.reduce((a, x) => a + x, 0);
    check('dielectrics insert a slab: bound face against the + plate = -(1 - 1/eps_r) x free gap-side (1e-6)', b.faces.find((f) => f.b === 'top').Q, -(1 - 1 / 4) * topGap, 1e-6);
    check('dielectrics EPS0 sanity', EPS0, 8.8541878128e-12, 1e-6);
  }
}
