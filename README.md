# intro-EMF-lab

Browser-based field simulators for EGRE 309 (Intro to Electromagnetism). One static page,
fourteen tabs organized by physics process (plus an About page with every equation),
served from GitHub Pages. No build step, no dependencies beyond a vendored KaTeX.

Live site: https://interactive-hardware-interfacing.github.io/intro-EMF-lab/

## Layout

```
index.html              the single page
app/
  main.js               tab registry, boot, URL state wiring
  shell.js              shared UI: tab bar, controls, canvas stack, layers, probe, export
  state.js              URL query-string <-> app state
  equations.js          TeX strings per tab and per layer
  tabs/                 one module per tab; tabs/index.js is the registry
  about.js              site introduction, per-tab descriptions (About page)
  scene3d.js            orbit camera and 3D drawing shared by the 3D tabs
  workers/              relax-worker.js: the solver off the main thread
  cutplane.js           XY / XZ / YZ cut-plane control for closed-form 3D fields
  solverclient.js       promise wrapper around the worker for run-to-convergence tabs
core/                   em-core: the numerics, no DOM
  constants.js          eps0, mu0
  grid.js               Float64 grid with bilinear sampling and gradients
  analytic.js           closed forms: point/line/ring charges, wires, sheets, loops
  render.js             colormap, quiver, streamlines, contours, viewport transforms
  relax2d.js            plain neighbor-averaging Laplace/Poisson solver + Lab 2 presets
  axisym.js             (r,z) neighbor-averaging solvers: Axisym (eps or sigma) and AxisymMag (psi = r A_phi)
bench/
  run.js                closed-form benchmarks; `npm test`; gates every deploy
docs/                   build notes per batch of work; docs/matlab has relax2d.m, the MATLAB twin of the solver
```

## Running locally

Any static server works. ES modules need http, not file://.

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Tests

```
npm test
```

`bench/run.js` (the count is printed at the end of a run) covers every closed form against textbook results, both solvers
against problems with known answers, discrete identities, the worker protocol, URL state,
the Sandbox geometry encoding, mirroring, tab/equation/DOM contracts, a parse of every
module, and **golden files**: `bench/golden.json` freezes the numbers quoted in the
handouts (Lab 3 run 1, Lab 5 default, probe values) to 0.5%. If a solver change is meant
to move one of them, run `npm run freeze` and say so in the commit.

`npm run smoke` opens every tab and every view in headless Chromium and fails on any
console error (needs `npm install --no-save playwright && npx playwright install chromium`).
The GitHub Action runs both and refuses to deploy if either fails.

## Conventions

- Plain ES modules, `Float64Array` grids, SI units everywhere (m, C, A, V, T).
- The solver is the plain Gauss-Seidel neighbor average on purpose. Its iterations are
  shown on screen. No over-relaxation or multigrid in the default path.
- Every number a student can read must be reproducible from the URL.
- One release per semester (see below) so graded cohorts keep their numbers.

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
the lock.
