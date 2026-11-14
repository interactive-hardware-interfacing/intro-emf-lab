# intro-EMF-lab

Browser-based field simulators for EGRE 309 (Intro to Electromagnetism) at VCU. One static
page, seventeen tabs organized by physics process, plus an About page that explains each tab
and lists every equation. Served from GitHub Pages; plain ES modules, no build step, no
dependency beyond a vendored KaTeX.

Live site: https://interactive-hardware-interfacing.github.io/intro-emf-lab/

## Tabs

| Tab | What it shows | Method |
| --- | --- | --- |
| Point charges | V, E, field lines of up to four charges; a Randomize puzzle mode | Coulomb superposition |
| 3D point charges | The same charges in a box: cut planes, 3D field lines, orbit | Coulomb superposition |
| Ring charge | A ring of N point charges against the continuous ring; remove charges one at a time; per-charge contributions at the probe | Closed form + quadrature |
| Line charge | Two charged rods in cross-section, exact image solution, C′ | Closed form |
| Gauss's law | A movable sphere or cube tiled into patches; E·n painted and summed against Q_enc/ε₀ | Coulomb + midpoint sum |
| Interface | Plane boundary: dielectric–dielectric, dielectric–conductor, magnetic–magnetic; refraction, bound charge | Boundary conditions, closed form |
| Capacitors | Disk capacitor, three-layer dielectric, C from Gauss and from energy, sweeps, axis plots | Gauss–Seidel in (r, z) |
| Dielectrics | Parallel plates with up to four dielectrics, layered (same D, series) or side by side (same E, parallel) or tilted; free and bound charge face by face; hold V or hold Q; slab force from dC/dx | Gauss–Seidel in (x, y) |
| Conduction (J) | Steady current between electrodes, J = σE, current through a cut, R | Gauss–Seidel in (r, z) |
| Transmission lines | C′, L′, Z₀, v of coax, twin-lead, parallel plates, with a numeric check | Closed form + Gauss–Seidel |
| Magnetic fields | Line currents and a sheet current; a Randomize puzzle mode | Biot–Savart closed forms |
| Ampère's law | A draggable Amperian loop with B·t̂ painted segment by segment and summed against μ₀ I_enc; wires, thick wire, coax, sheet, solenoid and toroid cross-sections | Closed forms + midpoint sum |
| Solenoids | A solenoid built from its turns: B along the axis vs μ₀nI and the finite-sheet formula, the ends, discrete turns vs the ideal sheet, a single loop, Helmholtz and anti-Helmholtz pairs; exact field lines | Biot–Savart loop field (elliptic integrals) |
| Inductors | Solenoid or ring sensor with a permeable object; optional saturating core μ(B); L from flux linkage and energy | Gauss–Seidel for ψ = rA_φ |
| Sandbox | Paint conductors, dielectrics and charge; watch the neighbour average converge; Gauss paths | Gauss–Seidel (Laplace / Poisson) |
| Eddy currents | A conductor in an AC coil: skin depth, induced currents, field phase, coil R + jωL vs frequency, animated cycle | Complex Gauss–Seidel for ψ = rA_φ (quasi-static) |
| Time-varying | 2-D FDTD with ∂D/∂t on: pulse, slab, slit, lens, waveguide; paint; Ez(t) at the probe; PML or Mur walls | Yee FDTD (TMz) |
| About | Per-tab descriptions, how the numbers are computed, every equation | — |

Every number a student can read is reproducible from the page URL ("Share link").

## Layout

```
index.html              the single page
app/
  main.js               boot: builds the Shell from the tab registry
  shell.js              shared UI: tab bar, controls, canvas stack, layers, probe, export, assignment lock
  state.js              URL query string <-> app state; CSV/PNG download helpers
  version.js            the semester tag
  equations.js          TeX per tab and per layer (rendered on the About page)
  about.js              site introduction and per-tab what/shows/look-for text
  views.js              plot views and the isometric 3D cut-plane view
  scene3d.js            orbit camera, painted planes, field lines shared by the 3D tabs
  cutplane.js           XY / XZ / YZ cut-plane control for closed-form 3D fields
  mirror.js             mirror a half-plane (r, z) grid into a full cross-section
  solverclient.js       promise wrapper around the worker for run-to-convergence tabs
  workers/relax-worker.js   the solvers off the main thread (cartesian, axisym, axisym-mag, fdtd)
  tabs/                 one module per tab; tabs/index.js is the registry
core/                   em-core: the numerics, no DOM; a git subtree of github.com/interactive-hardware-interfacing/em-core (docs/em-core.md)
  constants.js          eps0, mu0
  grid.js               Float64 grid with bilinear sampling and gradients
  analytic.js           closed forms: point/line/ring charges, wires, sheets, loops, Nagaoka
  render.js             colormap, scalar fields, quiver, streamlines, contours, viewport
  relax2d.js            plain neighbour-averaging Laplace/Poisson solver + Lab 2 presets
  dielectrics.js        parallel plates with up to four dielectric regions on Relax2D; plate/bound charges, region table, slab force
  ampere.js             closed-form current distributions, the Amperian loop, ∮B·dl by midpoint sum, I_enc by geometry
  solenoid.js           exact loop field and A_phi (elliptic integrals), solenoid as N turns, finite-sheet axis formula, Helmholtz pair, Nagaoka L
  axisym.js             (r, z) solvers: Axisym (eps or sigma, explicit faces) and AxisymMag (psi = r A_phi, mu(B))
  eddy.js               AxisymEddy: complex psi for AC coils and conductors (quasi-static eddy currents)
  fdtd2d.js             2-D TMz Yee FDTD with CPML / Mur walls
  test/                 em-core's own checks (core, fdtd, eddy, dielectrics, ampere, solenoid) and runner; bench/run.js imports them
bench/
  run.js                the test runner (`npm test`): core/test checks + the app layer + parse of every module
  app.js                app-layer tests: worker protocol, URL state, contracts, KaTeX, golden files
  tline.js, fdtd.js     app-side tests for transmission lines and the FDTD presets
  golden.json           frozen handout numbers (see Semester releases)
  smoke.mjs             headless-Chromium pass over every tab and view (`npm run smoke`)
docs/                   architecture, instructor guide, build notes; docs/matlab has relax2d.m
.github/workflows/deploy.yml   bench + smoke, then deploy to Pages
```

`docs/architecture.md` explains how a tab plugs into the shell and how to add one.
`docs/instructor-guide.md` covers assignment links, semester releases and which tab serves
which lab.

## Running locally

Any static server works. ES modules need http, not file://.

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Tests

```
npm test          # bench/run.js: the count is printed at the end
npm run smoke     # headless Chromium; needs: npm install --no-save playwright && npx playwright install chromium
```

The bench covers every closed form against textbook results, each solver against problems
with known answers (including the exact layered capacitor, the saturating rod, Nagaoka at two
resolutions, the thick-winding filament sum, FDTD reflection coefficients and wall
absorption, the eddy-current Bessel solution, the two-dielectric series and parallel shares and
the slab-force slope, every Ampère source against its textbook field and ∮B·dl against μ₀I_enc
for loops off the symmetry, the loop field against brute-force Biot–Savart and the solenoid
against the finite-sheet formula), discrete identities, the worker protocol, URL
state, the Sandbox geometry encoding, mirroring, CSV alignment, tab/equation/DOM contracts,
a KaTeX render of every equation, a parse of every module, and golden files:
`bench/golden.json` freezes the numbers quoted in the handouts to 0.5%. If a solver change
is meant to move one of them, run `npm run freeze` and say so in the commit.

The smoke test opens every tab and view, round-trips a perturbed URL on every tab, checks
randomize-on-load, requires an accessible name on every control, checks the assignment lock
and the semester tag on every download, and checks the 900 px layout for overflow; it fails
on any console error. The GitHub Action runs both and refuses
to deploy if either fails.

## Conventions

- Plain ES modules, `Float64Array` grids, SI units everywhere (m, C, A, V, T).
- The solver is the plain Gauss–Seidel neighbour average on purpose. Its iterations are
  shown on screen. No over-relaxation or multigrid in the default path.
- Every number a student can read must be reproducible from the URL.
- One release per semester so graded cohorts keep their numbers.

## Semester releases

`app/version.js` holds the semester tag (`fall-2026`). It is shown in the page footer and
on the About page, and every exported file carries it in its name
(`capacitors-field.fall-2026.csv`). At the start of a term:

1. Set `SEMESTER` in `app/version.js`.
2. Re-freeze the handout numbers: `npm run freeze` (writes `bench/golden.json` with the tag).
3. Commit, then tag and push: `git tag -a fall-2026 -m "Fall 2026" && git push --tags`.

A student's number can then be reproduced by checking out the tag named in their file.

## Assignment links

In the Export section of any tab, **Assignment link (instructors)** copies a link to the
current view with `lock=1`: the tab bar and the control panel are hidden, so the student
sees the problem exactly as set and can only probe, switch layers and export. An optional
note (`note=`) is shown in a banner at the top. "Open full controls" in the banner lifts
the lock. See `docs/instructor-guide.md`.
