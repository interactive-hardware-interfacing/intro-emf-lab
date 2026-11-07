# Phase 3 notes

## core/axisym.js
`Axisym(nr, nz, { h, z0, boundary: { rmax, zmin, zmax }, boxV })` is the (r, z) twin of
`Relax2D`: the same Gauss-Seidel neighbour average, with the radial neighbours weighted by
the face radius r +- h/2 and the axis treated as a mirror (V0 = (4 VE + VN + VS) / 6).
Flavours: eps for electrostatics, sigma for conduction (put sigma in `eps`).
Derived: `E()`, `energy()`, `gaussCharge(i0, j0, i1, j1)` (surface of revolution),
`currentThroughZ(j)`, `annulus(i)` (control-volume ring areas that sum exactly to pi r^2).
Builders: `diskCapacitor({...})`, `idealLayeredC`, `kirchhoffC`.

Two discretisation details that matter and are now guarded by benchmarks:
- Energy is summed on faces with the solver's own conductances, so 2W = QV holds to
  solver tolerance for the discrete solution in an insulating box. Node-based energy
  was ~9% off on coarse grids.
- The face between a conductor cell and a dielectric cell uses the dielectric's eps
  (a conductor cell has no eps of its own). Taking the harmonic mean with the
  conductor's default eps = 1 under-counted the two plate faces and put the Lab 3
  default case 3% *below* ideal instead of 25% above. `faceEps()` in both solvers.
- The capacitor box is insulating (mirror) by default so no stray capacitance to a
  grounded enclosure inflates C; "Grounded enclosure" is a selectable option.

## Capacitors tab
Lab 3 geometry and controls (V, gap, radius, plate thickness, eps_r, eps_r2),
resolution 2/4/6 cells per dielectric layer, C from energy and from Gauss around the top
plate, the handout's ideal series formula, ratio and % difference, Kirchhoff (labelled as
assuming the dielectric fills all space), D / eps0 E / P along the axis with CSV, and a
parameter sweep (gap, radius, eps_r, eps_r2, V) with CSV.

Lab 3 run 1 (5 V, 4 mm, 6 mm, 5, 5): ideal 1.2517e-12 F, simulated about 1.57e-12 F
(+25%, g/R = 2/3 so fringing is large). The handout's COMSOL value 1.523e-11 F is ~10x
this, consistent with a unit-scaling problem in that model.

Timing: plain neighbour averaging on an N x N grid needs ~N^2 sweeps, so the time grows
like N^4. Normal resolution for the default case is a 58 x 59 grid and solves in about a
second; a 1 mm gap at normal resolution is ~190^2 and takes tens of seconds. The UI says
so and suggests coarse for the Module 0 table.

## Conduction (J) tab
`Relax2D` with sigma; insulator cells sigma = 0 (hm returns 0, isolated cells are skipped).
Presets: uniform bar, constriction, L-bend, plate with holes; paint insulator / conductor;
movable current cut reporting I per unit depth, a second fixed cut for the conservation
check, R = V/I, and l/(sigma w) for the bar. Layers: V, |J| (log), E, J (arrows scaled by
log magnitude, or lines), equipotentials. Bar: R = 1.9997 vs 2.0000 Ohm m.

## Shell / infrastructure
- `app/workers/relax-worker.js` accepts `kind: 'axisym'`.
- `app/solverclient.js`: promise-based run-to-convergence wrapper used by both new tabs.
- Benchmarks: 68 total (17 new: sphere, coax, thin disk vs Kirchhoff, Gauss = energy
  identity, layered D continuity and E ratio, Lab 3 run 1 above ideal, conduction R and
  current conservation in both solvers).

## Next: Phase 4
`Axisym` magnetostatic flavour: solve psi = r A_phi with mu at faces and the coil J_phi as
source; B_r = -dA/dz, B_z = (1/r) d(rA)/dr; L from energy and from flux linkage;
Inductors tab with the cylinder / ring-sensor mode toggle and the position sweep.
Benchmarks: long solenoid B and L, Nagaoka at finite l/d, loop on-axis B, permeable
cylinder in uniform field.
