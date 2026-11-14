// Ampère's law checks: every closed-form source against its textbook field, the loop
// quadrature against μ0 I_enc for loops that do and do not respect the symmetry, the
// enclosed-current geometry (wires, strip length, J × area), and the sign conventions.
import { MU0, PI } from '../constants.js';
import { wireB } from '../analytic.js';
import { sourceB, sheetAlongZB, loopSegments, loopLength, pointInLoop, circulation, enclosedCurrent, radialIenc, textbookB, solenoidSectionWires, toroidSectionWires } from '../ampere.js';

export function ampereChecks(check) {
  const circ = (src, loop, n = 64, ccw = true) => circulation(src, loopSegments(loop, n), ccw).circ;

  // 1. One wire: centred circle (exact for the midpoint rule), off-centre circle, rectangle,
  //    loop that misses the wire, clockwise sign.
  {
    const src = { type: 'wires', wires: [{ I: 2, pos: [0, 0] }] };
    check('ampere wire: centred circle, ∮B·dl = μ0 I (1e-12)', circ(src, { shape: 'circle', cx: 0, cy: 0, R: 0.01 }), MU0 * 2, 1e-12);
    check('ampere wire: off-centre circle (wire inside), ∮B·dl = μ0 I (1e-9 at 256 segments)', circ(src, { shape: 'circle', cx: 0.005, cy: 0.003, R: 0.01 }, 256), MU0 * 2, 1e-9);
    check('ampere wire: rectangle, ∮B·dl = μ0 I (1e-4 at 256 segments)', circ(src, { shape: 'rect', cx: 0.002, cy: -0.004, w: 0.02, h: 0.015 }, 256), MU0 * 2, 1e-4);
    check('ampere wire: loop that misses the wire integrates to ~0 (1e-5 of μ0 I)', circ(src, { shape: 'rect', cx: 0.03, cy: 0, w: 0.02, h: 0.015 }, 256) / (MU0 * 2), 0, 1e-5);
    check('ampere wire: clockwise loop flips the sign', circ(src, { shape: 'circle', cx: 0, cy: 0, R: 0.01 }, 64, false), -MU0 * 2, 1e-12);
    const enc = enclosedCurrent(src, { shape: 'circle', cx: 0.005, cy: 0.003, R: 0.01 });
    check('ampere wire: enclosed current by geometry', enc.I, 2, 0);
    check('ampere wire: a wire outside is not counted', enclosedCurrent(src, { shape: 'circle', cx: 0.03, cy: 0, R: 0.01 }).I, 0, 0);
    check('ampere loop length: circle', loopLength({ shape: 'circle', R: 0.01 }), 2 * PI * 0.01, 1e-12);
    check('ampere loop length: rectangle', loopLength({ shape: 'rect', w: 0.02, h: 0.015 }), 0.07, 1e-12);
    check('ampere loop segments: rectangle dl sums to the perimeter', loopSegments({ shape: 'rect', cx: 0, cy: 0, w: 0.02, h: 0.015 }, 64).reduce((a, g) => a + g.dl, 0), 0.07, 1e-12);
    check('ampere pointInLoop: rectangle corner case', pointInLoop({ shape: 'rect', cx: 0, cy: 0, w: 0.02, h: 0.01 }, [0.0099, 0.0049]) ? 1 : 0, 1, 0);
  }

  // 2. Thick wire: B inside grows linearly, B outside is the wire's; a centred circle encloses
  //    I (r/a)^2; a rectangle inside encloses J w h; a rectangle half in matches ∮B·dl.
  {
    const src = { type: 'thick', I: 3, a: 0.01 };
    check('ampere thick: B at r = a/2 is μ0 I r / (2π a²)', Math.hypot(...sourceB(src, [0.005, 0])), (MU0 * 3 * 0.005) / (2 * PI * 0.01 * 0.01), 1e-12);
    check('ampere thick: B at r = 2a is μ0 I / (2π r)', Math.hypot(...sourceB(src, [0, 0.02])), (MU0 * 3) / (2 * PI * 0.02), 1e-12);
    check('ampere thick: B is azimuthal (B·r̂ = 0)', sourceB(src, [0.004, 0.003])[0] * 0.004 + sourceB(src, [0.004, 0.003])[1] * 0.003, 0, 1e-15);
    check('ampere thick: centred circle r = a/2 encloses I/4 (radial integral, 1e-6)', enclosedCurrent(src, { shape: 'circle', cx: 0, cy: 0, R: 0.005 }).I, 0.75, 1e-6);
    check('ampere thick: radialIenc inside', radialIenc(src, 0.005), 0.75, 1e-12);
    check('ampere thick: rectangle inside the conductor encloses J w h (exact)', enclosedCurrent(src, { shape: 'rect', cx: 0, cy: 0, w: 0.01, h: 0.006 }).I, (3 / (PI * 1e-4)) * 6e-5, 1e-12);
    const half = { shape: 'rect', cx: 0.006, cy: 0, w: 0.012, h: 0.01 };
    check('ampere thick: rectangle half in, ∮B·dl = μ0 × (J × area inside) (3e-4)', circ(src, half, 256), MU0 * enclosedCurrent(src, half).I, 3e-4);
    check('ampere thick: off-centre circle inside, ∮B·dl = μ0 × (J × area) (3e-4)', circ(src, { shape: 'circle', cx: 0.003, cy: 0.002, R: 0.004 }, 256), MU0 * (3 / (PI * 1e-4)) * PI * 0.004 * 0.004, 3e-4);
  }

  // 3. Coax: zero outside, the wire's field between, the shell's falling current; the
  //    enclosed-current geometry reads an exact zero for a loop around the whole cable.
  {
    const src = { type: 'coax', I: 3, a: 0.004, b: 0.01, c: 0.013 };
    check('ampere coax: B = 0 outside', Math.hypot(...sourceB(src, [0.02, 0.01])), 0, 1e-30);
    check('ampere coax: B between the conductors is μ0 I / (2π r)', Math.hypot(...sourceB(src, [0.007, 0])), (MU0 * 3) / (2 * PI * 0.007), 1e-12);
    check('ampere coax: enclosed current inside the shell falls with (r² − b²)/(c² − b²)', radialIenc(src, 0.0115), 3 * (1 - (0.0115 ** 2 - 0.01 ** 2) / (0.013 ** 2 - 0.01 ** 2)), 1e-12);
    check('ampere coax: loop around the whole cable encloses exactly zero', enclosedCurrent(src, { shape: 'circle', cx: 0.002, cy: 0.001, R: 0.02 }).I, 0, 1e-12);
    check('ampere coax: rectangle around the whole cable encloses exactly zero', Math.abs(enclosedCurrent(src, { shape: 'rect', cx: 0, cy: 0, w: 0.04, h: 0.03 }).I), 0, 1e-9);
    check('ampere coax: centred circle in the shell, ∮B·dl = μ0 I_enc(r) (1e-6)', circ(src, { shape: 'circle', cx: 0, cy: 0, R: 0.0115 }, 64), MU0 * radialIenc(src, 0.0115), 1e-6);
    check('ampere coax: enclosedCurrent agrees with radialIenc on a centred circle (1e-6)', enclosedCurrent(src, { shape: 'circle', cx: 0, cy: 0, R: 0.0115 }).I, radialIenc(src, 0.0115), 1e-6);
  }

  // 4. Sheet along z: the axis map against a brute-force wire sum, the infinite-sheet limit,
  //    and the straddling rectangle enclosing K × length.
  {
    const K = 100, w = 0.03, N = 4000, I = (K * w) / N; let bx = 0, by = 0;
    for (let k = 0; k < N; k++) { const b = wireB(I, [-w / 2 + ((k + 0.5) * w) / N, 0], [0.004, 0.003]); bx += b[0]; by += b[1]; }
    const B = sheetAlongZB(K, w, 0.004, 0.003);
    check('ampere sheet: Bx matches a 4000-wire sum (1e-8)', B[0], bx, 1e-8);
    check('ampere sheet: By matches a 4000-wire sum (1e-6)', B[1], by, 1e-6);
    const wide = sheetAlongZB(K, 100, 0, 0.001);
    check('ampere sheet: wide strip gives |B| = μ0 K / 2 (1e-4)', Math.abs(wide[0]), (MU0 * K) / 2, 1e-4);
    check('ampere sheet: B above a +z sheet points −x (right-hand rule)', wide[0] < 0 ? 1 : 0, 1, 0);
    const src = { type: 'sheet', K, w };
    const rect = { shape: 'rect', cx: 0, cy: 0, w: 0.02, h: 0.004 };
    check('ampere sheet: rectangle encloses K × 20 mm', enclosedCurrent(src, rect).I, 2, 1e-12);
    check('ampere sheet: ∮B·dl around the rectangle = μ0 K ℓ (1e-3 at 256 segments)', circ(src, rect, 256), MU0 * 2, 1e-3);
    check('ampere sheet: circle overlapping the strip end encloses the chord inside the strip', enclosedCurrent(src, { shape: 'circle', cx: 0.01, cy: 0, R: 0.01 }).I, K * 0.015, 1e-12);
    check('ampere sheet: loop above the strip encloses nothing', enclosedCurrent(src, { shape: 'circle', cx: 0, cy: 0.02, R: 0.01 }).I, 0, 0);
  }

  // 5. Solenoid cross-section: turns, field direction, Ampère rectangle through the winding
  //    (exact count), rectangle wholly inside (zero), the long-solenoid limit.
  {
    const wires = solenoidSectionWires(40, 1, 0.05, 0.01);
    check('ampere solenoid: 2N turns', wires.length, 80, 0);
    check('ampere solenoid: net current through the cross-section is zero', wires.reduce((a, w) => a + w.I, 0), 0, 1e-12);
    const src = { type: 'solenoid', N: 40, I: 1, L: 0.05, a: 0.01 };
    check('ampere solenoid: B at the centre points +x for I > 0', sourceB(src, [0, 0])[0] > 0 && Math.abs(sourceB(src, [0, 0])[1]) < 1e-18 ? 1 : 0, 1, 0);
    const through = { shape: 'rect', cx: 0, cy: 0.01, w: 0.02, h: 0.01 };
    check('ampere solenoid: rectangle through the top winding encloses 16 turns', enclosedCurrent(src, through).I, 16, 0);
    check('ampere solenoid: ∮B·dl = μ0 N_enc I (1e-3 at 256 segments)', circ(src, through, 256), MU0 * 16, 1e-3);
    check('ampere solenoid: rectangle wholly inside integrates to 0 (1e-9 of μ0 N I)', Math.abs(circ(src, { shape: 'rect', cx: 0, cy: 0, w: 0.02, h: 0.01 }, 256)) / (MU0 * 40), 0, 1e-9);
    const long = { type: 'solenoid', N: 400, I: 1, L: 1, a: 0.01 };
    // two finite sheets of current: B at the centre is μ0 n I (2/π) atan(L / 2a) (the N discrete turns add only ripple)
    check('ampere solenoid: B at the centre = μ0 n I (2/π) atan(L/2a) for N = 40 (1e-3)', sourceB(src, [0, 0])[0], textbookB(src, [0, 0]).B * (2 / PI) * Math.atan(0.05 / 0.02), 1e-3);
    check('ampere solenoid: long winding, B at the centre → μ0 n I (2e-2 at L/2a = 50)', sourceB(long, [0, 0])[0], textbookB(long, [0, 0]).B, 2e-2);
    check('ampere solenoid: short winding reads below μ0 n I', sourceB(src, [0, 0])[0] < textbookB(src, [0, 0]).B ? 1 : 0, 1, 0);
  }

  // 6. Toroid cross-section: B = μ0 N I / (2π r) between the windings (up to the ripple), zero
  //    inside the hole and outside, the centred circle enclosing N I.
  {
    const src = { type: 'toroid', N: 60, I: 1, R1: 0.02, R2: 0.03 };
    check('ampere toroid: 2N turns', toroidSectionWires(60, 1, 0.02, 0.03).length, 120, 0);
    check('ampere toroid: B at r = 25 mm is μ0 N I / (2π r) (1e-4: 60-turn ripple)', Math.hypot(...sourceB(src, [0.025, 0])), (MU0 * 60) / (2 * PI * 0.025), 1e-4);
    check('ampere toroid: B in the hole is ~0 (1e-6 of the winding field)', Math.hypot(...sourceB(src, [0.005, 0.003])) / ((MU0 * 60) / (2 * PI * 0.025)), 0, 1e-6);
    check('ampere toroid: B outside is ~0 (1e-4 of the winding field)', Math.hypot(...sourceB(src, [0.04, 0.01])) / ((MU0 * 60) / (2 * PI * 0.025)), 0, 1e-4);
    check('ampere toroid: centred circle between the windings, ∮B·dl = μ0 N I (1e-9)', circ(src, { shape: 'circle', cx: 0, cy: 0, R: 0.025 }, 256), MU0 * 60, 1e-9);
    check('ampere toroid: centred circle outside encloses zero', enclosedCurrent(src, { shape: 'circle', cx: 0, cy: 0, R: 0.035 }).I, 0, 0);
    check('ampere toroid: off-centre circle between the windings, same μ0 N_enc I (1e-3)', circ(src, { shape: 'circle', cx: 0.003, cy: -0.002, R: 0.025 }, 256), MU0 * enclosedCurrent(src, { shape: 'circle', cx: 0.003, cy: -0.002, R: 0.025 }).I, 1e-3);
  }
}
