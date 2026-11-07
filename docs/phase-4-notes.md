# Phase 4 notes

## core/axisym.js: AxisymMag
Magnetostatics with rotational symmetry, unknown psi = r A_phi:

    d/dr[(1/(mu r)) dpsi/dr] + d/dz[(1/(mu r)) dpsi/dz] = -J_phi

Same neighbour average as the other two solvers. Face coefficient 1/(mu_face r_face) with
mu_face the arithmetic mean of the two cells (the harmonic mean of the coefficient 1/mu),
source mu0 J_phi h^2, psi = 0 on the axis and on the box walls (all flux stays inside).
B_r = -(1/r) dpsi/dz, B_z = (1/r) dpsi/dr, and on the axis B_z = 2 psi(h)/h^2.
Inductance two ways: `energyJA()` = 1/2 int J.A dv (flux linkage, N Phi / I) and
`energy()` = 1/2 int B.H dv on the nodes. The J.A form is the discrete identity and the
one to quote; the node-based B.H under-counts near a one-cell-thick winding by 5-10% on
coarse grids. `solenoidWithObject({...})` builds the Lab 5 sensor; the coil current is
renormalised so the grid carries exactly N I.

Box: psi = 0 walls at 8x the largest dimension lower L by about 1-2% (3x lowered it by
8%). Convergence is quick (a few thousand sweeps) because psi is pinned on every wall.

Benchmarks (7 new, 75 total): an exact 1-D case (current sheet with a permeable rod inside,
mirror ends) for the mu handling; finite coil l = d against Nagaoka (1.4%); B at the
centre against the finite-solenoid formula; a single loop against Biot-Savart on axis;
B.H vs J.A. The whole bench now runs in ~30 s (two Phase 3 grids were trimmed).

## Inductors tab
Lab 5 controls: I, N, coil radius, length, winding thickness; object radius, length,
mu_r, and the position of its bottom end relative to the sensor centre (slider, re-solve
on release); object in/out; resolution; view zoom (coil region or whole box). Mode toggle:
solenoid with the cylinder inside (Lab 5) or a short ring sensor the object passes
through. Results: L by flux linkage and by energy, mu0 N^2 A / l and Nagaoka for the empty
coil, B at the centre. Layers: |B|, B_z, |H|, |M|, J_phi, B arrows/lines, H, M, flux lines
(psi contours). Axis cutline of B, H, M with CSV. Position sweep (the COMSOL "Height
Sweep" window) with warm starts, plot, table and CSV.

Default (100 turns, 15 mm radius, 30 mm long, 1 A; 5 mm x 20 mm object, mu_r = 100):
empty coil 204 uH (Nagaoka 204 uH), object centred 276 uH.

## Still open for the course
- Object permeability: the handout points at a table of common materials. Steel (mu_r in
  the hundreds to thousands) converges more slowly and is limited by the 3-5 cells across
  the object at normal resolution; use fine resolution for mu_r > 300.
- No nonlinear mu(B) yet; the plan's note about re-evaluating mu every few sweeps still
  applies if a saturating core is ever wanted.

## Feedback patch (after Phase 4)
- Ring charge and Line charge are separate tabs (`makeTab('ring' | 'rods')` in ring-line.js).
- "Reset tab" button in the top bar returns any tab to its defaults (re-runs init with an
  empty URL state; tabs keep constant defaults for this).
- Every numeric field shows its allowed range under the label and in a tooltip.
- Lab/module references removed from tab text; they belong in the handouts.
- Capacitors and Inductors default to the full cross-section (mirrored across the axis,
  device in the middle); the r-z half-plane is still selectable. The stage now follows the
  physical aspect ratio (the capacitor view is 2:1). `app/mirror.js` does the mirroring.
- Capacitor limits widened (gap 0.1-200 mm, radius 0.5-200 mm, thickness 0.05-20 mm);
  `diskCapacitor` caps the grid at 300 cells a side and flags `coarsened` in the status.
- Side panels are resizable by dragging the divider; widths persist in localStorage.
- Bench parses every browser module with `node --check` (76 checks): a dropped comma
  in a tab file now fails CI instead of blanking the page.

## Stage views (centre-window tabs)
A tab may offer views of the centre window: `tab.views = [{ id, label, footer?, mount(el, shell) }]`,
shown as a tab row above the plot; "Field" (the layered canvases) is always first and the
choice is kept in the URL (`sv=`). `app/views.js` provides `plotView(id, label, draw)` for
full-size plots and `iso3dView(id, label, source, shell)`: an isometric rendering of an
axisymmetric solution built from the vertical cut through the axis and a horizontal cut at an
adjustable height, both painted with the current colour layer, with the device drawn as
cylinders. Pure canvas 2D (an isometric projection is affine, so the field images are drawn
with setTransform and clipped to the cut shapes); no 3D library.
- Capacitors: Field, 3D, Axis plots (D, eps0 E, P with axes, ticks, plate bands), Sweep.
- Inductors: Field, 3D, Axis plots (B, H, M), Sweep (L vs position).
- Sandbox: Field, Convergence (residual vs sweep, log scale, tolerance line).
Also: the cut-plane slider and text box are now two-way synced (Ring charge, Point charges).
