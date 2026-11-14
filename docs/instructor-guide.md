# Instructor guide

Which tab serves which lab, how to hand a student a fixed problem, and how the numbers stay
reproducible across semesters. Site: https://interactive-hardware-interfacing.github.io/intro-emf-lab/

## Labs and tabs

The site is organized by physics process, not by lab, so one lab can draw on several tabs
and one tab serves several labs. The COMSOL steps in the original handouts map as follows.

| Lab | COMSOL exercise | Tab(s) | Notes |
| --- | --- | --- | --- |
| 0 | (new) Vector calculus: divergence and curl | Div and curl | For the first weeks: the radial, rotation, shear and saddle presets give exact div and curl at any box size; the line source and vortex show the delta function (2π through any box or loop around the origin, 0 otherwise), which is Gauss and Ampère in miniature; the swirl shows curl changing sign where the field still swirls the same way. Click to move the probe, shrink the box with the slider. |
| 1 | Point charges: V and E of two charges, probe values | Point charges, 3D point charges | The Randomize mode hides charge values for a "find the charges from the field" exercise; Reveal shows them. The probe at (0.25, 0.25) for 2 C at (0.2, 0.3) and −2 C at (0.3, 0.2) reads V = 0 (golden). |
| 1 | Ring and line charges | Ring charge, Line charge | Ring: compare N discrete charges with the continuous ring; remove charges to break the cancellation at the centre. Line charge: exact two-rod image solution with C′. |
| 2 | Gauss–Seidel relaxation (students write the loop) | Sandbox, Line charge | Sandbox opens on the two-rod preset and shows every sweep; the Convergence view plots the residual. `docs/matlab/relax2d.m` is the same loop in MATLAB for comparison. |
| 3 | Disk capacitor, C from the field; layered dielectric | Capacitors | Run 1 (5 V, R = 6 mm, gap 4 mm, εr 5/5) gives C = 1.56 pF at normal resolution, 1.64 pF coarse; layered 2/8 gives 1.34 pF. Sweep view for C against gap or εr. |
| 3 | Capacitors handout §3 and Examples 3–4: two dielectrics between the plates, series vs parallel, the air gap, inserting a slab at fixed Q or fixed V, the slab force | Dielectrics | Cartesian cross-section, w/d = 5 by default so fringing is visible (roughly 10–25 % on C) while the per-region ratios stay exact. Region fractions snap to the grid: the "Air-gap preset" uses the fine resolution so a 5 % gap is exactly 1.5 cells and takes 20.8 % of V as in the handout. "Handout Example 3" loads the 1 mm εr 2 / 2 mm εr 6 stack. Hold Q and change a permittivity to see V fall; the free/bound table shows the net Q/εr at the plate. Compute slab force runs two extra solves and matches (ε₁ − ε₂)ε₀ℓV²/(2d). |
| 3 | Boundary conditions at the dielectric interface | Interface | Closed form; shows E_t and D_n continuity, the bound surface charge and the refraction angles; the conductor case reports ρs = −D1·n̂ with n̂ into the conductor. |
| 4 | (new) Ampère's law | Ampère's law | Presets walk the standard argument: centred and off-centre loops around one wire (same ∮B·dl), a loop enclosing nothing, a thick wire with the loop inside (I·(r/a)²), coax outside (zero), the sheet rectangle (B = μ₀K/2 for the long sides), the solenoid rectangle through the winding (μ₀N_enc I exactly while B = μ₀nI only approximately; the solenoid here is a winding very wide in z, B_centre = μ₀nI·(2/π)atan(L/2a)), the toroid circle (μ₀NI/2πr). Students can drag the loop; the "Along the loop" view plots B·t̂ against distance with the running integral. |
| 4 mod 1 | Line currents versus a current sheet | Magnetic fields (module 1) | B of N wires approaches the sheet's B as N grows; the "difference" layer shows the remainder. |
| 4 mod 2 | Four wires, find the currents | Magnetic fields (module 2) | Randomize hides the currents, not the positions. Probe |B| at the origin for +2 A at (−15, 15) mm and −2 A at (−15, −15) mm is 26.7 µT (golden). |
| 5 | (new) Solenoid field from Biot–Savart, air core | Solenoids | The "Lab 5 coil, air core" preset is the Inductors default coil without its rod (N = 100, L = 30 mm, a = 15 mm): B at the centre is 70.7 % of μ₀nI and the Nagaoka L shown is the same reference Inductors uses for its empty coil. Long solenoid (L = 10a) shows B → μ₀nI inside and half at the ends; Short coil shows the formula failing. "Ideal sheet, same coil" replaces the turns by 400 filaments so students see what the discreteness does. Helmholtz and anti-Helmholtz presets give the textbook (4/5)^{3/2}μ₀I/a and 48μ₀I/(25√5a²). |
| 5 | Solenoid with a permeable core; ring sensor | Inductors | Default rod gives L = 275 µH (flux linkage), empty coil 189 µH. The Sweep view moves the object through the coil. "Saturating core" adds μ(B). |
| 3 | Capacitors handout §6: RC and RLC filters, Examples 6.1–6.3 | Filters | Presets reproduce the three examples to the printed digits (f_c = 1.80 MHz and −20 dB a decade up; f₀ = 1.59 MHz, Q = 10, B = 159 kHz, 100 V on the capacitor, 5 µJ vs 3.14 µJ per cycle; f_SR = 15.9 MHz). "C from Dielectrics" or "C from Capacitors" and "L from Inductors" or "L from Solenoids" pull the last solved values of those tabs, and the pulled gap feeds the breakdown row (Q·V_in vs E_bd·d). Views: Bode, waveforms with ½Cv² and ½Li² exchanging, step response with ringing, real-capacitor |Z|. |
| 5 | (new) Faraday's law | Faraday's law | Four settings with a shared play/scrub time. The loop-through-a-region setting is the one to use for "ε is the slope of Φ, not its size"; the coasting bar for Lenz and magnetic braking (τ = mR/B²l²); the generator for peak/rms EMF and τω = ε²/R. Downloads give Φ, ε, I against time. |
| 4 | (new) Forces on charges and currents | Charges in fields | Presets: proton and electron circles, the E×B cycloid, the parabola, a three-speed velocity selector with a slit, and a mass spectrometer (H⁺, D⁺, He²⁺: He²⁺ lands with D⁺ because m/q matters). Hall mode has copper, aluminium, n- and p-type silicon; wires mode has the ampere; loop mode has τ(θ) and U(θ). The tracer is a Boris pusher, so the kinetic-energy plot is flat in B alone. |
| — | (new) Waves on a terminated line | Line waves | Presets: matched, open, short, 100 Ω on 50 Ω (VSWR 2), the quarter-wave transformer (100 Ω → 25 Ω), an inductive load, and two step problems (R_s = 25, R_L = 150: overshoot to 1.0 V then 0.857 V; a step into an open line). The Standing wave view animates the forward, reflected and total waves; the Bounce diagram labels every wave and the running V at each end. "Z₀, v from the Transmission lines tab" uses that tab's current cross-section. |
| — | (new) Uniform plane waves | Plane waves | Presets: free space, glass, seawater at 1 MHz (good conductor, δ = 25 cm, η at 45°), copper at 1 GHz (δ = 2 µm), air → glass (Γ = −0.2, SWR 1.5), air → seawater, air → copper (mirror), circular and elliptical polarization. The Time-varying tab's slab reflections are the FDTD version of the same Γ. |
| — | (new) Gauss's law, transmission lines, eddy currents, time-varying fields | Gauss's law, Transmission lines, Eddy currents, Time-varying | Not in the original labs; ready for new exercises. Eddy currents is the natural extension of Lab 5: the same coil and object with an AC current, skin depth, and the coil's R + jωL — the metal-detector principle. |

Every tab's About entry (About page, or the "about" link under each tab's title) says what
it shows, how it computes, and what to look for, with the equations.

## Assignment links

Set a tab up exactly as you want the student to see it (geometry, layers, colour scale,
view, probe), then open **Export → Assignment link (instructors)** in the right-hand panel,
type an optional note and copy. The link carries `lock=1` and `note=…`:

- the tab bar, the control panel and Reset are hidden; the banner shows your note;
- the student can still switch layers and views, probe, log probe rows, export CSV/PNG;
- "open full controls" in the banner lifts the lock (it is a convenience, not a lockout).

Because the controls are hidden, put the parameters that matter in the note ("gap = 4 mm,
εr = 5; report C and the field at the edge of the plate"). A locked link is just a URL: it
can go in a handout, an LMS page or an email, and it opens the same on any device.

Puzzle modes (Point charges, Magnetic fields): `mode=random` draws fresh hidden values on
every load, so a shared puzzle link is not a fixed answer. For a fixed puzzle, set the
values yourself and lock the link; the student sees the field but not the control panel.

## Reproducible numbers

- Every view is reproducible from its URL ("Share link"). Ask students to paste the link
  next to any number they report.
- Exported files are named with the semester tag (`capacitors-field.fall-2026.csv`), and
  the tag is in the page footer. The tag points at a git tag of the same name.
- `bench/golden.json` freezes the handout numbers (table above). The test suite fails if a
  code change moves one of them by more than 0.5%, so a graded number cannot drift silently.

At the start of a term: set `SEMESTER` in `app/version.js`, run `npm run freeze`, commit,
tag (`git tag -a spring-2027 -m "Spring 2027" && git push --tags`). The README has the same
three steps.

## Limits worth telling students

- The relaxation solvers are deliberately plain Gauss–Seidel. Fine grids take seconds; the
  status line shows sweeps and the residual, and the Sandbox shows the convergence curve.
- Capacitor grids are staircased: curved features carry a 1–3% error that shrinks with
  resolution. The inductor winding is thinner than a grid cell, so the grid smears it over
  about two cells and L reads low against Nagaoka's thin-sheet formula: −7% at the default
  grid, −4% at the fine one, converging slowly. Comparisons between runs on the same grid
  are good to far better than that; absolute values should be quoted with the grid.
- The energy-based L (node-averaged B) reads a few percent low at any grid; quote the
  flux-linkage L, which is the discrete solution's own energy exactly. The Inductors tab offers three reference values for the empty coil
  (Nagaoka, thick-winding filament sum, filament sum at the grid's effective thickness).
- Eddy currents: the skin depth must span at least two cells; the side panel says how many
  it spans. Mild steel (μr = 100, σ = 1e7 S/m) has a skin depth about four times thinner than
  copper's (δ ∝ 1/√(μσ)) and is resolved only at low frequency.
- FDTD open walls: the PML absorbs to ~1e-4; the Mur option is there to show what a
  one-line absorbing condition leaves behind.
