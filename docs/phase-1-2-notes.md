# Phase 1 and 2 notes

## Phase 1: closed-form tabs and the cut-plane view

- `app/tabs/magnetic-fields.js`
  - Module 2 (Lab 4 Module 2): four wires along z, (x, y) in +-30 mm, I in +-5 A, numbered
    counter-clockwise from top left. Randomize hides the currents only (positions stay
    visible, per the handout); Reveal unlocks after the student types an answer. Hidden
    currents never enter the URL until revealed.
  - Module 1 (Lab 4 Module 1): N line currents evenly across 30 mm versus a 30 mm sheet
    carrying K, drawn in the x-z plane. The probe reports both cases at the same point.
    A "Discrete - sheet |B|" colour map shows where they differ.
  - Layers: |B| (log), A_z (Module 2), B arrows or lines, A_z contours (the field lines,
    for the bonus), J shown as wire markers (dot = out of page, cross = into page).
- `app/tabs/ring-line.js`
  - Ring mode (Lab 1 Module 1): N point charges of q versus a continuous λ on a ring of
    radius R, computed in 3D with the cut plane control (XY / XZ / YZ + offset). Layers
    include the discrete - continuous difference and the out-of-plane E component.
  - Rods mode (Lab 2 Module 0): two infinite line charges +-λ at (+-d, 0) with rod radius
    a; shows the rod surface potential and the analytic capacitance per unit length
    πε₀ / ln((2d - a)/a) so students can set their solver's plate potentials to match.
- `app/cutplane.js`: the 2D-cut / 3D control. Point charges got it too (XY at z = 0 is the
  COMSOL view; XZ / YZ cuts for Lab 1). No 3D renderer; the field is computed in 3D and
  only the plane is drawn.
- Shell additions: `setExtent(extent, axes)` for sub-mode switches, pointer hooks
  (`tab.onPointer(type, x, y, e)` returning true consumes the event), `redrawOverlay()`,
  `refreshLayers()`.

## Phase 2: the solver and the Sandbox

- `core/relax2d.js`: `Relax2D` with `sweep()`, `iterate(k, tol)`, `solve()`, `E()`,
  `gaussCharge(i0, j0, i1, j1)`, `energy()`, and `lab2Preset(name, params)` for the two
  rods, square rods, parallel plates and triangles. Face permittivity is the harmonic
  mean of the two cells. Box boundary: grounded (Dirichlet) or mirror (Neumann).
- `app/workers/relax-worker.js`: runs the solver off the main thread and posts a frame
  every k sweeps (chunked to ~40 ms so pause/step stay responsive).
- `app/tabs/sandbox.js`: Play / Step / Reset, sweeps per frame, tolerance, residual
  history plot, grid 65 / 129 / 257, grounded or mirror box, Poisson toggle (adds the ρ
  brush), presets with editable d, a, h, t, side, V₀, paint tools (conductor at V,
  dielectric εr, charge ρ, erase), Gauss-law path tool giving λ, C = λ/ΔV and C = 2W/ΔV²,
  with the ideal ε₀h/gap shown for the parallel-plate preset (Lab 3 bonus). A painted
  problem is run-length encoded into the URL when it fits (< 6000 characters).
- `docs/matlab/relax2d.m` + `lab2_two_rods_demo.m`: the same loop in MATLAB, with the
  analytic cutline comparison.
- Benchmarks added (51 total): second-order convergence on an exact harmonic solution,
  uniform field between plates, dielectric slab (E ratio and Gauss charge = exact
  discrete series value), coax line (V(r) within 2%, C within 2% of 2πε₀/ln(b/a),
  energy vs Gauss within 2%), Lab 2 plate preset C/C_ideal in (1, 1.3), and
  gaussCharge corner-order independence (this one caught a real bug).

## Behaviour worth knowing when teaching with it

- Plain Gauss-Seidel on 129² converges in ~2000 sweeps (about 2-3 s). On 257² expect
  ~8000 sweeps and a minute or so; that slowness is the point, but 129² is the right
  classroom default.
- A paint stroke restarts the solver warm from the current solution, so students see the
  field "heal" around the new conductor.
- The Lab 2 analytic two-rod solution assumes isolated rods in free space; the grounded
  box makes the numerical potential fall faster near the walls. Use the mirror boundary
  or a larger box to reduce that, and discuss it: it is exactly the boundary-condition
  conversation the handout asks for.

## Next: Phase 3

- `core/axisym.js`: (r, z) neighbour averaging with the 1/r face weights, electrostatic
  flavour (ε) and conduction flavour (σ). Capacitors tab (disk, 3-layer dielectric, C two
  ways, D/E/P axis cutline, parameter sweeps in the worker) and Conduction tab (J layer,
  current cut with I, R = V/I). Benchmarks: spherical capacitor, Kirchhoff disk formula,
  3-layer slab D continuity, I equal on any two cuts.
