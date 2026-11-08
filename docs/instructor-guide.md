# Instructor guide

Which tab serves which lab, how to hand a student a fixed problem, and how the numbers stay
reproducible across semesters. Site: https://interactive-hardware-interfacing.github.io/intro-emf-lab/

## Labs and tabs

The site is organized by physics process, not by lab, so one lab can draw on several tabs
and one tab serves several labs. The COMSOL steps in the original handouts map as follows.

| Lab | COMSOL exercise | Tab(s) | Notes |
| --- | --- | --- | --- |
| 1 | Point charges: V and E of two charges, probe values | Point charges, 3D point charges | The Randomize mode hides charge values for a "find the charges from the field" exercise; Reveal shows them. The probe at (0.25, 0.25) for 2 C at (0.2, 0.3) and −2 C at (0.3, 0.2) reads V = 0 (golden). |
| 1 | Ring and line charges | Ring charge, Line charge | Ring: compare N discrete charges with the continuous ring; remove charges to break the cancellation at the centre. Line charge: exact two-rod image solution with C′. |
| 2 | Gauss–Seidel relaxation (students write the loop) | Sandbox, Line charge | Sandbox opens on the two-rod preset and shows every sweep; the Convergence view plots the residual. `docs/matlab/relax2d.m` is the same loop in MATLAB for comparison. |
| 3 | Disk capacitor, C from the field; layered dielectric | Capacitors | Run 1 (5 V, R = 6 mm, gap 4 mm, εr 5/5) gives C = 1.56 pF at normal resolution, 1.64 pF coarse; layered 2/8 gives 1.34 pF. Sweep view for C against gap or εr. |
| 3 | Boundary conditions at the dielectric interface | Interface | Closed form; shows E_t and D_n continuity, the bound surface charge and the refraction angles. |
| 4 mod 1 | Line currents versus a current sheet | Magnetic fields (module 1) | B of N wires approaches the sheet's B as N grows; the "difference" layer shows the remainder. |
| 4 mod 2 | Four wires, find the currents | Magnetic fields (module 2) | Randomize hides the currents, not the positions. Probe |B| at the origin for +2 A at (−15, 15) mm and −2 A at (−15, −15) mm is 26.7 µT (golden). |
| 5 | Solenoid with a permeable core; ring sensor | Inductors | Default rod gives L = 275 µH (flux linkage), empty coil 189 µH. The Sweep view moves the object through the coil. "Saturating core" adds μ(B). |
| — | (new) Gauss's law, transmission lines, time-varying fields | Gauss's law, Transmission lines, Time-varying | Not in the original labs; ready for new exercises. |

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
- The energy-based L under-counts near a thin winding on a coarse grid; quote the
  flux-linkage L.
- FDTD open walls: the PML absorbs to ~1e-4; the Mur option is there to show what a
  one-line absorbing condition leaves behind.
