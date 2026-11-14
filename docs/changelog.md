# Changelog

Notes per patch, oldest first, from the review of the first release onward. Earlier
construction notes are in `phase-0-notes.md` … `phase-4-notes.md`.

## Review fixes (patch 6a)
1. Layered dielectrics in `diskCapacitor` were one cell thin on the centre layer because
   eps lived on nodes. `Axisym` now carries explicit face arrays (`faceR`, `faceZ`) set by
   `setFacesFrom(epsAt)`; the layered 1-D check gives C/C_ideal = 1.00000. `cellsPerLayer`
   is forced even so the gap is centred.
2. CSV on mirrored tabs (Capacitors, Inductors) now writes the solver's own half-plane.
3. Zoomed colour maps honour the viewport (`opts.extent` through `drawScalarField`).
4. The two-rod reference uses the exact image solution (b = sqrt(d^2 - a^2)), so the rod
   surface is an equipotential to 0.03%.

Tests added: `bench/app.js` (worker protocol under node, URL-state round trip, Sandbox
RLE, mirroring, CSV alignment, tab/equation/DOM contract lint), golden files for the
handout numbers (`bench/golden.json`, `npm run freeze`), and `bench/smoke.mjs`, a headless
Chromium pass over every tab and view that fails CI on any console error.

## About page (patch 6b)
`app/about.js` holds the site introduction, a what/shows/look-for block per tab
(`TAB_INFO`) and every equation set; `app/tabs/about.js` renders it as a page view. The
equation panel left the side bar (it never had room next to the layer list), so each tab's
lead line links to its About section instead.

## Nonlinear mu(B) (patch 6c)
`AxisymMag.setSaturation({mask, muI, Bsat})` gives the masked cells the curve

    B(H) = mu0 H + Bsat tanh( mu0 (mu_i - 1) H / Bsat )

Between relaxation chunks `updateMu()` re-evaluates mu_r in each masked cell by
successive substitution from the H side: H = |B| / (mu0 mu_current), mu_new = B(H)/(mu0 H),
with 50% damping. Iterating mu(|B|) directly oscillated near the knee (the B-side map has
gain > 1 there); the H-side map is a contraction because B(H) is concave. Convergence
requires both the field residual and the mu change to be small. The worker returns `eps`
and the mean mu_r with every frame so the tab can draw the mu_r map and compute H and M
with the material it actually solved with. Bench: 1-D saturating rod against the exact
transcendental flux balance (0.15%); mean mu_r within 3%. On the Inductors tab the option
is "Saturating core" with B_sat; at I = 100 A the default rod's centre field drops from
2.07 T to 1.62 T.

## Gauss's law tab (patch 6d)
`app/scene3d.js` factors the orbit camera, painted cut planes, box outline, charge
spheres and 3D field-line tracing out of the 3D point-charges tab. The Gaussian surface
(sphere or cube) is tiled into patches with exact areas; E.n on each patch is painted via
the colour map and summed (midpoint rule). Q_enc is counted geometrically. The cube reports
flux per face. Bench: centred charge exact to 1e-15; off-centre charge in a cube 0.01%;
charge outside gives ~zero net flux.

## Interface tab (patch 6d)
Plane interface at x = 0, uniform field in medium 1 at angle theta1 from the normal,
medium 2 from the boundary conditions (closed form). Cases: dielectric-dielectric
(E_t, D_n + rho_s), dielectric-perfect conductor (E2 = 0, rho_s = D1.n), magnetic-magnetic
(B_n, H_t + K). V (or A_z) is continuous across the interface. Reports theta2, the bound
surface charge (P1 - P2).n or the magnetisation surface current, and draws the rays and
angle arcs. Bench: refraction ratios, continuity, jumps by rho_s and K, conductor case.

## Transmission lines tab (branch tline)
Closed-form C', L' = mu eps / C', Z0 and v for coax, twin-lead (exact image solution,
d > 2a) and parallel plates (ideal interior field, fringing noted). The "Numeric check"
view solves the same cross-section with Relax2D and reads lambda from a Gauss box:
coax -1.5% at 161^2 (staircased circles), twin-lead -2.4% with walls held at the exact
far-field potential, plates +5% because the Neumann walls admit fringing. Bench: 17 checks
(b/a = e -> 60 ohm, RG-58 -> 47.45 ohm and v = 0.667c, L'C' = mu eps for every geometry,
thin-wire limit of the exact twin-lead C').

## Time-varying (FDTD) tab (branch fdtd)
`core/fdtd2d.js`: 2-D TMz Yee grid (Ez, Hx, Hy), dt = 0.99 h / (c sqrt 2), per-cell
eps_r, PEC mask, soft point or line sources (Gaussian pulse or CW), first-order Mur
absorbing walls (top/bottom optionally mirror or PEC). Worker kind 'fdtd' runs k steps a
frame and keeps the probe trace Ez(t). Presets: free-space pulse, dielectric slab, slit
in a conducting wall, dielectric cylinder lens, parallel-plate waveguide; paint tools for
PEC and dielectric. Bench: pulse speed c (0.1%), Mur energy bounded, Gamma = -1/3 at a
dielectric step (0.5%), tau = 2/3, PEC Gamma = -1, Courant number.

## Audit fixes (patch 6g)
Second independent audit after the four new tabs. Fixed: the Capacitors energy-based C
was rebuilt from node eps without the explicit layer faces (layered stacks read 5-12%
high; now identical to the solver's own energy and within 1e-6 of the Gauss value); the
magnetic Interface case had H2t = H1t - K and (M1 - M2)xn with the wrong sign (n x (H2 - H1)
= K with n from 1 to 2 gives H2t = H1t + K); Randomize puzzles loaded from a link showed the
default charges as the hidden answer (fresh draw when the values are absent); the probe log
is per tab and its CSV writes a header before every run of rows with a new shape; PNG
snapshot exports the active plot/3D view, not the hidden field canvases; the FDTD Mur walls
use the local wave speed c/sqrt(eps_r) of the adjacent cell (a slab painted up to the wall
reflected 33%, now < 2%); log colour scales ignore non-positive bounds and never collapse to
1e-300; the Ez(t) trace survives a paint stroke and is capped. Drift: README check count,
Transmission lines phase tag, Line charge re-clamps a when d is lowered.
Tests: 17 new bench checks (174) and three smoke passes (URL round trip with one control
perturbed per tab, randomize-on-load, 900 px layout without horizontal overflow).
Deferred to the polish batch: Interface units in magnetic mode, Gauss's-law default probe
on a charge, accessibility labels on the charge-table inputs and 3D sliders.

## Polish (patch 6h)
Interface layer names and units follow the case (E/D/P/V or B/H/M/A_z) via applyMode();
normal incidence gets its own status line. Gauss's-law default charge 1 moved off the
probe/surface centre. Every input and slider has an accessible name (aria-label on the
charge-table inputs, orbit/tilt/density, cut-plane and surface sliders) and the smoke test
now fails on any control without one. README no longer lists build phases; the footer
phase label is gone.

## Instructor tools and PML (patch 6i)
- Assignment links: `lock=1` hides the tab bar, the control panel and Reset; `note=` shows
  a banner. Layers, probe, views and export stay. "Open full controls" lifts the lock.
  Instructors make one from the Export section (note field + copy button).
- Semester tag: `app/version.js` SEMESTER, shown in the footer and on About, in every
  exported file name, and recorded in bench/golden.json by `npm run freeze`. README has the
  per-term steps and the git tag command.
- FDTD open walls: CPML (10 cells, m = 3, sigma_max = 0.8(m+1)/(eta0 h), alpha = 0) is the
  default, Mur the alternative, as a toggle so the two can be compared. The Mur wall stays
  behind the PML so the curl-free DC remainder of a soft Gaussian source drains out instead
  of ringing (a PML cannot absorb a static field). A CPML alpha of 0.05 S/m, a textbook
  value for mm cells at tens of GHz, reflected 12% at 1 GHz because alpha/eps0 was not small
  against omega; it is zero here. Bench: normal incidence Mur 5.7e-4 / PML 5.4e-5; grazing
  2-D case Mur 52% / PML 2% of the direct peak; PML in a dielectric < 2%.

## Third audit (patch 6k)
Fixed: the assignment banner was visible on every page (`.assign-banner { display:flex }`
beat `[hidden]`); the locked layout collapsed the right panel below 1100 px; the FDTD line
source sat inside the PML on the 101^2 grid (now clamped to npml + 3 cells); the PNG
snapshot carried no semester tag; the live-site URL in the docs was mixed case (GitHub
Pages serves only `intro-emf-lab`); a paint stroke re-created the FDTD solver and so wiped
the PML's memory arrays (materials now change in place through a `materials` worker
command; fields, clock, trace and PML memory continue); the Ez(t) trace went NaN after a
paint with the probe off-grid; docs inaccuracies (tab count, Lab 3 R/gap, Lab 4 geometry,
parse list, `summary` fallback).

Inductor winding: `solenoidWithObject` snapped the winding onto whole cells, so a 0.5 mm
change in wire thickness moved L by 3% and the Nagaoka comparison passed by luck (the ring
landed at +5% in R^2). The winding is now deposited cloud-in-cell, which fixes the
current-weighted mean radius at Rc on any grid. Against Nagaoka's thin-sheet formula the
empty default coil now reads -7.5% at nr = 81, -4.2% at 161, -3.8% at 241 (converged to
1e-13): the 1 mm winding is thinner than a cell and the grid smears it over about two, so L
is low and converges slowly but monotonically. Golden numbers moved and were re-frozen:
Lab 5 default L 276.42 -> 275.12 uH, empty coil 191.81 -> 188.57 uH. Tests: 9 new bench
checks (188) and two smoke passes (lock behaviour at 900 px, semester tag on every download).

## Patch 6l: thick-winding reference, eddy-current tab, About notes
- `thickCoilL` (core/analytic.js): filament sum of Maxwell mutual inductances over the
  winding cross-section with an exact rectangle-GMD self term; 0.4% from Nagaoka in the thin
  limit, 0.8% from Wheeler's multilayer formula at 10 mm thickness. Inductors tab:
  "Reference L" select (Nagaoka / thick / thick at the grid's effective thickness max(tw, 2h)).
- `AxisymEddy` (core/eddy.js): frequency-domain magnetic diffusion for complex psi; same
  Gauss-Seidel with a complex diagonal; `Bc`, `Je`, `power`, `impedance`. Verified against
  the long-cylinder Bessel solution (1% at a/delta = 1.5, 6% deep inside at a/delta = 4.8
  where the field is 5% of the surface value) and by the power identity P = R I^2 / 2 (0.5%).
  Worker kind 'axisym-eddy'. Tab: materials, log-frequency slider, amplitude/phase/snapshot
  layers, animated cycle, radial profile view, frequency sweep of L(f) and R(f). Box factor 4
  (not 8) for a finer grid around the object; the empty-coil L is solved on the same grid.
- A ferromagnetic conductor does not go "diamagnetic" until mu_r delta is small against its
  size: for a 5 mm steel rod that is beyond the frequencies this grid resolves, so the About
  text describes the rise in L shrinking with frequency rather than a crossover.

## Deep audit, pass A (patch 7a)
Four independent reviewers re-derived the math and tested numerically. Fixed:
- Interface, perfect conductor: rho_s = D2n - D1n = -D1n (n into the conductor); the sign
  was flipped and the bench test enshrined it.
- thickCoilL: cells are now kept square (count derived from the thinner dimension, 900
  filament budget); long thin windings had 125:1 slivers and read 17% above Nagaoka's
  upper bound. Now -0.14% at tw = 0.05 mm, below Nagaoka for every tw, converging to it.
- Eddy tab: the empty-coil reference is solved on the object's grid (the box follows the
  largest dimension, so a and Lo must be passed); a long object gave a spurious -0.8% dL.
- Transmission lines: the coax Gauss box kept its corners inside the outer conductor
  (b/a = 1.5 read -28%; now -3%, the staircase error). Bench covers b/a = 3.3 and 1.5.
- FDTD: prepare() no longer reallocates the PML psi arrays or the Mur history (a paint
  stroke mid-run injected ~1.4% of the pulse peak); waveguide plates sit outside the gap so
  the spacing is 0.64 m on every grid (f_c = 0.234 GHz).
- Capacitors: tolerance 2e-8 V (100x tighter): the Gauss-box C lagged the energy C by 0.17%
  at the old tolerance and read like a method difference; now 1.7e-5. Golden re-frozen
  (values move in the 5th digit). Normal-resolution solve takes ~4.5 s.
- Worker: convergence tested after every sweep, so the stopping sweep and every digit are
  machine-independent (chunking used to move the 5th digit between reloads).
- Probe-log CSV: header fields with commas are quoted (RFC 4180); Inductors' log was misaligned.
- Kirchhoff row: thin-plate formula only (the thickness term could not be verified against
  the literature); labelled "thin plates".
- Stated numbers: box walls lower L by 0.2% (not 1-2%); steel's skin depth is ~4x thinner
  than copper's (not 10x); PML reflection ~1e-4 to 45 degrees, ~1e-2 near grazing.
- Tests: the 1-D sheet+rod reference uses the control-volume radius a + h/2 (three mu_r at
  1e-3); face-based energy identity (energyFaces = energyJA to 1e-8); shipped-vs-100x-tighter
  tolerance consistency for every panel quantity; live probe CSV on every tab; eddy grid
  match; deterministic worker stop; CW phase velocity vs the Yee dispersion relation (1e-4);
  lossy-medium attenuation; prepare() no-op; both Mur and PML in the energy test; eddy
  power identity at 1e-6; thick-coil thin limit, upper bound and cell-count independence;
  exact coax energy = Gauss identity; eddy in the smoke round trip. 239 checks.

## Deep audit, pass B (patch 7b)
- Status flag race: a solve() superseded by a newer one (parameter changed mid-solve) cleared
  the running flag when its cancelled await resumed, so the status read "not converged"
  through the whole new solve. Each solve carries a token; a stale continuation returns.
- Energy row on Inductors relabelled "from node-averaged B (reads low)" with the honest
  explanation (O(h) smoothing everywhere, ~4% at normal resolution), since the face-based
  energy equals the flux-linkage value identically. About and the instructor guide updated.

## Dielectrics tab (patch 7c)
- New tab between Capacitors and Conduction: a Cartesian parallel-plate capacitor with two to
  four dielectric regions, layered (same D, series), side by side (same E, parallel) or split
  by a tilted interface (no closed form; Wiener bounds). Built on `Relax2D` through the new
  `core/dielectrics.js` (em-core), which also does the bookkeeping: free charge on the plates
  from D·n, bound charge on every dielectric face from P·n (both sides added at a
  dielectric–dielectric face), Gauss box, per-region table, ideal formulas, slab force.
- The solve runs at 1 V and is scaled, so "hold V" and "hold Q" (V = Q/C) and the depth need
  no re-solve; changing a permittivity at fixed Q shows V, E and W falling by εr.
- Region fractions snap to the grid. With node-centred ε and harmonic-mean faces the
  effective interface is half a cell beyond a region's last node and a conductor surface is
  its node row, so a layer against a plate is (k + ½) cells and an interior layer m cells;
  the status line and the ideal formulas use the snapped values. The harmonic-mean face is
  half a cell of each material, so its voltage drop is attributed 1/ε₁ : 1/ε₂ (not half and
  half; the first draft did that and read D 10 % discontinuous). A 5 % air gap needs the fine
  resolution (1.5 cells of 30) and then takes exactly the handout's 20.8 % of V.
- Box: plates plus 1.5 gaps of clear space; w/d = 5 by default (fringing ~10–25 % on C,
  visible and discussed, while the per-region ratios are exact). Plain Gauss–Seidel at
  321×189 took 77 s, so the box is kept small: 10/20/30 cells across the gap are 0.2 / 3 /
  11 s, helped ~25 % by starting from the 1-D stack. Grids over 361 cells wide coarsen.
- Slab force: two extra solves with the first interface moved ±1 column give dC/dx; the
  result equals (ε₁ − ε₂)ε₀ℓV²/(2d) to four digits, because the fringe at the plate ends
  does not move. The About text says so rather than claiming a fringing correction.
- Tests: `core/test/dielectrics.js` (57 checks: snapping, identities at a tight solve and
  at the shipped tolerance, series shares to 1e-4 for two layers and 2e-3 for four (a little
  flux spreads sideways through an εr = 8 layer), the air gap, side-by-side shares, zero
  bound charge on a side-by-side interface, the slab-force slope, Wiener bounds and
  refraction direction for the tilted case, a slab that fills only the gap raising C by less
  than εr); bench app checks for URL state, CSV, `scale()`; a golden case for the default C;
  the smoke round trip. 305 checks, smoke on 16 tabs.

## Ampère's law tab (patch 7d)
- New tab after Magnetic fields: closed-form current distributions along z (up to four line
  currents, a thick wire with uniform J, a coax, a finite sheet, a solenoid winding in
  cross-section as two rows of turns, a toroid as two rings) and an Amperian loop (circle or
  rectangle) dragged on the canvas or set by sliders. B·t̂ is drawn as a bar on each segment
  and summed by the midpoint rule; I_enc comes from geometry (turns inside, strip length
  inside, J × area inside). Nine presets walk the textbook argument; an "Along the loop" view
  plots B·t̂ against distance with the running integral.
- `core/ampere.js` (em-core). The enclosed current for round conductors is a radial integral
  of J r θ_in(r), with θ_in analytic for a circular loop and sampled on 1440 angles for a
  rectangle; a first draft summed J on a 400² grid over the bounding box and read −0.004 A
  for the coax "loop outside" preset, which is exactly the residue the preset is meant to
  show is zero. A rectangle wholly inside the inner conductor is exact (J w h).
- The "solenoid" here is a winding very wide in z (two sheets of turns), so the Ampère
  rectangle is the textbook one but the centre field is μ₀nI·(2/π)atan(L/2a), not the round
  solenoid's; the About text and panel say so and the round solenoid is the next tab.
- Sign conventions: I > 0 along +z (out of the page), loop counter-clockwise; the
  "Clockwise" option flips both sides. The sheet along z maps analytic.sheetB through the
  right-handed (X, Y, Z) = (−x, z, y), checked against a 4000-wire sum.
- Tests: `core/test/ampere.js` (50 checks), bench app checks for state and CSV, smoke
  round trip. 361 checks, smoke on 17 tabs.

## Solenoids tab (patch 7e)
- New tab between Ampère's law and Inductors: a solenoid built from its turns, each the exact
  circular-loop field by complete elliptic integrals (`core/solenoid.js`, em-core), shown in
  the plane through the axis with the field lines as contours of ψ = ρA_φ (exact). Kinds: N
  turns, the ideal current sheet (400 filaments carrying NI), a single loop, and a pair
  (Helmholtz when d = a, anti-Helmholtz with the second reversed). Presets include the
  Inductors default coil without its rod, so the two tabs share a reference (Nagaoka's L).
- Readouts: B at the centre against μ₀nI and the (cos θ₁ + cos θ₂)/2 sheet formula, B at
  the end (→ half), B halfway to the wall, the axis length within 1 % of the centre, Nagaoka
  and long-solenoid L; for the loop the μ₀I/2a and dipole checks; for the pair the Helmholtz
  flatness at z = a/10 or the gradient against 48μ₀I/(25√5a²). Plots along the axis
  (turns, sheet formula, μ₀nI) and across the coil at the centre and at the end.
- Compute cost: 161×121 grid with the x ≥ 0 half mirrored; 200 turns ~0.35 s, the 400-
  filament sheet ~0.75 s.
- Tests: `core/test/solenoid.js` (36 checks: loop field vs brute-force Biot–Savart to 1e-8
  at four points, ψ derivatives, 400 turns vs the sheet formula to 2e-5, Helmholtz values to
  1e-12 and 1e-5), bench app checks, smoke round trip. 402 checks, smoke on 18 tabs.

## Filters tab (patch 7f)
- New field-less tab before Time-varying (handout §6): RC or series RLC with the output across
  one element, as an impedance divider. Views: Bode magnitude and phase (f_c / f₀, f₁, f₂,
  −3 dB, drive marked), waveforms at the drive frequency with ½Cv_C² and ½Li² exchanging,
  step response (closed form for all three damping cases, with ringing frequency, overshoot
  and decay), and the real capacitor's |Z| (ESR, ESL, f_SR). Presets reproduce Examples
  6.1–6.3 to the printed digits; the About entry lists them.
- Cross-tab components: "C from Capacitors / Dielectrics" and "L from Inductors /
  Solenoids" read the other tab's last `results` through `shell.tabs` (the tab objects
  persist for the session), and the pulled gap sets V_max = E_bd·d for the breakdown row,
  which compares Q·V_in at resonance against it. An unsolved tab gives a reason, not a value.
- `core/filters.js` (em-core): `transfer`, `characteristics`, `steadyState`, `stepResponse`,
  `realCapacitorZ`, `selfResonance`, `rlcLimits`.
- Found while wiring: a field-less tab re-initialised on a second visit kept its previous
  `results` while its parameters were re-read from the (now default) URL, and the panel
  tried to render RLC rows from RC results. `init()` now clears `results`; Solenoids got the
  same guard in `build()`.
- Tests: `core/test/filters.js` (62 checks), bench app checks for state, cross-tab pulls,
  compute and CSV, smoke round trip. 471 checks, smoke on 19 tabs.

## Tab bar grouped by topic; changelog (patch 7g)
- The registry (`app/tabs/index.js`) is now a list of groups (Electrostatics, Currents &
  circuits, Magnetostatics, Induction, Waves, Tools, with About alone at the front); each tab
  carries its group label and the shell renders the bar as labelled clusters that wrap as
  units. The bench checks every tab is in exactly one group. Tab ids and URLs are unchanged.
- `docs/phase-6-notes.md` was the running log for everything after the first release; it is
  now `docs/changelog.md`.

## Faraday's law tab (patch 7h)
- New field-less tab heading the Induction group: four settings (sliding bar, driven or
  coasting; loop through a field region; stationary loop in B(t); generator), each with Φ(t)
  in closed form and ε as its exact derivative (`core/faraday.js`, em-core). The scene
  draws the induced current's direction (Lenz) and the velocity and opposing force; the
  plots show Φ, ε and I with a marker at the current time; the table carries the identities
  (ε = Blv, F = BIl, F·v = ε²/R, τ = mR/B²l², Q = ΔΦ/R, N B₀ A ω, peak and rms EMF, τω = ε²/R).
- Animation: play / pause / scrub with a log speed slider, looping over one pass or two
  periods; `destroy()` cancels the frame loop.
- Tests: `core/test/faraday.js` (37 checks), bench app checks, smoke round trip. 516 checks,
  smoke on 20 tabs.

## Charges in fields tab (patch 7i)
- New field-less tab in the Magnetostatics group: a particle tracer (up to three particles,
  one or two field regions with E in the plane and B along z, a plate with a slit and a
  detector at x = 0 in two-region mode), the Hall effect in a strip, the force between
  parallel wires and the torque on a loop. `core/lorentz.js` (em-core) holds the Boris
  pusher and the closed forms.
- The tracer uses the leapfrog-staggered Boris scheme with the velocity kicked back by half
  a Boris step at the start and synchronised forward by half a step for output; the first
  draft reported the staggered velocity and read the cyclotron centre 0.8 % off and the
  parabola 1 % off (one step's worth of drift). With the exact half-rotation the kinetic
  energy in a pure B is conserved to 1e-15 and the orbit closes to 1e-4 of r.
- Tests: `core/test/lorentz.js` (28 checks), bench app checks (state, traces, detector,
  m/q, CSV, Hall), smoke round trip. 551 checks, smoke on 21 tabs.
