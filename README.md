# intro-EMF-lab

Browser-based field simulators for EGRE 309 (Intro to Electromagnetism). One static page,
seven tabs organized by physics process, served from GitHub Pages. No build step, no
dependencies beyond KaTeX (equations) loaded from a CDN.

Live site: https://interactive-hardware-interfacing.github.io/intro-EMF-lab/

## Layout

```
index.html              the single page
app/
  main.js               tab registry, boot, URL state wiring
  shell.js              shared UI: tab bar, controls, canvas stack, layers, probe, equations
  state.js              URL query-string <-> app state
  equations.js          TeX strings per tab and per layer
  tabs/                 one module per tab (point-charges.js, magnetic-fields.js, ring-line.js, sandbox.js)
  workers/              relax-worker.js: the solver off the main thread
  cutplane.js           XY / XZ / YZ cut-plane control for closed-form 3D fields
core/                   em-core: the numerics, no DOM
  constants.js          eps0, mu0
  grid.js               Float64 grid with bilinear sampling and gradients
  analytic.js           closed forms: point/line/ring charges, wires, sheets, loops
  render.js             colormap, quiver, streamlines, contours, viewport transforms
  relax2d.js            plain neighbor-averaging Laplace/Poisson solver + Lab 2 presets
  axisym.js             (Phase 3/4) (r,z) solver for capacitors, conduction, inductors
  extract.js            (Phase 3/4) C, L, R, J, probes
bench/
  run.js                closed-form benchmarks; `npm test`; gates every deploy
docs/                   phase notes; docs/matlab has relax2d.m, the MATLAB twin of the solver
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

`bench/run.js` checks every closed form in `core/analytic.js` against textbook results and,
in later phases, every solver against a problem with a known answer. The GitHub Action
refuses to deploy if any check fails.

## Conventions

- Plain ES modules, `Float64Array` grids, SI units everywhere (m, C, A, V, T).
- The solver is the plain Gauss-Seidel neighbor average on purpose. Its iterations are
  shown on screen. No over-relaxation or multigrid in the default path.
- Every number a student can read must be reproducible from the URL.
- Tag a release per semester (`fall-2026`) so graded cohorts keep their numbers.

## Phases

0. Scaffold, shell, analytic core, bench, deploy — done
1. Closed-form tabs: Point charges, Magnetic fields, Ring and line charge; cut-plane view — done
2. `relax2d.js` + Sandbox tab (Lab 2 demo), MATLAB twin — done
3. `axisym.js` (E, sigma) + Capacitors and Conduction tabs
4. `axisym.js` (B) + Inductors tab
5. Instructor tools, semester tag, handout edits
