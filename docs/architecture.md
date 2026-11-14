# Architecture

How the page is put together, how a tab plugs into the shell, and how to add one. For the
numerics behind each solver see the build notes (`phase-*-notes.md`); for classroom use see
`instructor-guide.md`.

## The parts

```
index.html ─ app/main.js ─ Shell (app/shell.js) ─┬─ tab modules (app/tabs/*.js)
                                                 ├─ layer canvases + overlay (core/render.js)
                                                 ├─ stage views (app/views.js): plots, 3D
                                                 ├─ URL state (app/state.js)
                                                 └─ worker (app/workers/relax-worker.js)
                                                      └─ core/relax2d.js · axisym.js · fdtd2d.js
```

- **core/** is pure numerics: grids, closed forms, solvers, drawing primitives. Nothing in
  it touches the DOM, so every module runs under node in the bench. It is the em-core
  package, vendored here as a git subtree (`docs/em-core.md`); its own tests are in
  `core/test/` and the site's bench imports them.
- **app/shell.js** owns everything the tabs share: the tab bar, the control panel on the
  left, the stacked canvases in the middle (one per layer, plus an overlay), the stage-view
  tabs above them, the layer/colour/probe/export panel on the right, the status line, URL
  state, resizable panels and the assignment lock.
- **app/tabs/** holds one module per tab. A tab is a plain object that follows the contract
  below; `tabs/index.js` lists them in display order.
- **app/workers/relax-worker.js** runs the solvers off the main thread. It understands five
  kinds (`cartesian`, `axisym`, `axisym-mag`, `axisym-eddy`, `fdtd`) and a small command set (`init`, `run`,
  `step`, `pause`, `reset`, `probe`), posting frames every ~40 ms so the convergence is visible.
  `app/solverclient.js` wraps it in promises for the run-to-convergence tabs.

## The tab contract

```js
export default {
  id, title, summary,                 // id is the URL `tab=`; summary is the About-page fallback when TAB_INFO has no entry
  extent: [xmin, xmax, ymin, ymax],   // metres; the canvas aspect follows it
  axes: ['x', 'y'],                   // probe labels, e.g. ['r', 'z']
  hideField: false,                   // true for tabs that only have stage views (3D tabs)
  layers: [{ id, label, kind: 'scalar'|'vector'|'contour'|'info',
             unit, signed, log, default, styles: ['arrows','lines'], eq, available, note }],
  views: [plotView(...), iso3dView(...)],   // optional extra views of the centre window

  init(shell)                 // read shell.state, build controls into shell.controlsEl
  compute()                   // recompute whatever render() needs
  render(layerId, ctx, view, opts)   // draw one layer; scalar layers return the colour range
  drawOverlay(ctx, view)      // geometry, sources, labels; always on top
  probe(x, y)                 // -> [{ label, value, unit, note }]
  statusText()                // one line under the canvas
  getState()                  // tab-specific URL params (numbers, strings, arrays)
  csv()                       // text for "Field CSV"
  onPointer(type, x, y, e)    // optional; return true to consume (painting, picking)
  destroy()                   // optional; stop workers and timers
};
```

The shell calls `init` once when the tab is selected, then `compute` + `render` for every
layer whenever `shell.recompute()` runs (controls call it after a change) and `drawOverlay`
on every redraw. `opts` passed to `render` carries the colour map, manual min/max and the
current viewport extent (zoomed tabs must pass `extent: opts.extent` to `drawScalarField`).

Useful shell methods from inside a tab: `recompute()`, `redraw()`, `redrawOverlay()`,
`refreshLayers()` (after changing `layers[].available` or labels), `setExtent(extent, axes)`,
`setStageView(id)`, `updateStageView()`, `refreshStatus()`, `syncUrl()`, `openAbout(id)`,
`probePt`, `layerOn` (Map), `colorLayer`, `view` (the Viewport).

`ui` (exported from shell.js) builds controls: `ui.field(label, input)`, `ui.number`,
`ui.range`, `ui.select`, `ui.button`, `ui.el`, `ui.lead(shell, text)`. Give every input an
accessible name: a `ui.field` label does it; bare inputs in a grid row need `ariaLabel`.

## Adding a tab

1. Create `app/tabs/<id>.js` following the contract; start from the closest existing tab
   (closed form: `interface.js`; worker-driven: `conduction.js`; 3D: `gauss-law.js`).
2. Register it in `app/tabs/index.js`.
3. Add `TAB_INFO.<id>` in `app/about.js` (what / shows / lookFor) and `EQUATIONS.<id>` in
   `app/equations.js`. Every scalar/vector/contour layer with an `eq` key must resolve to an
   entry there; `bench/app.js` lints this and renders every TeX string in KaTeX.
4. Put the physics checks in `bench/` (a new file exporting `xChecks(check)` called from
   `run.js`, or a block in `app.js`). New modules under `app/` and `core/` are parsed
   automatically.
5. `npm test` and `npm run smoke` must pass. The smoke test also round-trips the tab's URL
   state and checks every control for an accessible name.

## URL state

`shell.syncUrl()` writes the shell's own keys (`tab`, `color`, `ov`, `cmap`, `cmin`, `cmax`,
`px`, `py`, `sv`, `lock`, `note`, `st_<layer>`) plus whatever `getState()` returns. Empty
strings are dropped; `'none'` is the sentinel for "no colour layer" / "no overlays". A tab
reads its keys back in `init` with `getNum(state, key, fallback)` / `getList`. Rule: every
control that changes the picture must be in `getState()`, so the share link reproduces it.

## Solvers in one paragraph each

- `Relax2D` (core/relax2d.js): Cartesian Gauss–Seidel for ∇·(ε∇V) = −ρ with face-averaged ε,
  fixed-potential masks, Dirichlet or Neumann walls, a `iterate(k, tol)` generator, Gauss-box
  charge and face-based energy.
- `Axisym` (core/axisym.js): the (r, z) twin with 1/r face weights and the axis stencil;
  explicit face permittivities (`setFacesFrom`) so layer interfaces fall exactly on faces.
  Builders: `diskCapacitor`, `kirchhoffC`, `idealLayeredC`.
- `core/dielectrics.js`: builds the parallel-plate Dielectrics problem on `Relax2D` (up to four
  regions, layered / side by side / tilted, fractions snapped to half-cell interfaces, 1-D initial
  guess) and does its bookkeeping: `plateCharges` (D·n on the plates), `boundCharges` (P·n on
  every dielectric face), `gaussTopPlate`, `regionTable` (same D layered, same E side by side),
  `seriesC` / `parallelC` / `idealC` (Wiener bounds for tilted), `idealSlabForce`.
- `core/ampere.js`: closed-form 2-D current distributions (`sourceB`, `sourceAz`, `currentDensity`:
  wires, thick wire, coax, sheet along z, solenoid and toroid cross-sections as rows/rings of
  turns), `loopSegments` for a circle or rectangle, `circulation` (midpoint ∮B·dl) and
  `enclosedCurrent` by geometry (point-in-loop for turns, strip length for the sheet, a radial
  integral of J r θ_in(r) for round conductors so a loop around a whole conductor reads exactly).
- `core/solenoid.js`: `loopB` and `loopAphi` (the exact circular-loop field and vector potential by
  complete elliptic integrals), `solenoidTurns` / `pairTurns`, `turnsB` / `turnsPsi` (ψ = ρA_φ, whose
  contours are the field lines), `sheetAxisBz` (the (cos θ₁ + cos θ₂) formula), `nagaokaL`, `axisProfile`.
- `core/filters.js`: RC and series-RLC circuits as impedance dividers: `transfer`, `characteristics`
  (τ, f_c; ω₀, Q, B, f₁, f₂, ζ), `steadyState` (phasors, waveforms, ½Cv² and ½Li²), `stepResponse`
  (closed form for all three damping cases), `realCapacitorZ` / `selfResonance`. The Filters tab is
  field-less (`hideField`, no layers) and reads C and L from the other tabs' last results via `shell.tabs`.
- `core/faraday.js`: `barState`, `loopState`, `fieldState`, `generatorState` give Φ, ε = −dΦ/dt (analytic),
  I, force or torque and the two powers as functions of time; `numericEmf` is the check. The Faraday tab
  is field-less and animates with requestAnimationFrame, calling `shell.updateStageView()` each frame.
- `core/lorentz.js`: `borisStep` / `trace` (leapfrog-staggered, with exact half-step synchronisation so the
  reported v and KE sit at the same time as x), `cyclotron`, `exbDrift`, `selectorSpeed`, `spectrometerRadius`,
  `hall`, `wireForcePerLength`, `loopTorque`. The Charges in fields tab adds a plate with a slit at x = 0 in
  two-region mode and stops a particle at the plate or, coming back from region 2, at the detector.
- `core/tline.js`: `gamma`, `vswr`, `zin`, `steadyState` (V+, Γ_L, Z_in, V(d), I(d), powers), `instantaneous`
  (forward / reflected / total at d, t), `extrema`, and the step transient (`stepSetup`, `bounces`, `stepV`, `stepI`).
  The Line waves tab imports `lineParams` from the Transmission lines tab to pull Z₀ and v.
- `core/planewave.js`: `medium` (γ = α + jβ and η from f, εr, μr, σ, with λ, v_p, δ, loss tangent and the
  good-conductor α), `normalIncidence` (Γ, τ, R, T, SWR), `phasors` / `instantaneous` (two-media fields),
  `poynting`, `polarization` (type, IEEE handedness, axial ratio, tilt) and `polarizationTrace`.
- `core/operators.js`: `FIELDS` (F, div, curl in closed form), `boxFlux`, `loopCirculation`, `numericDivCurl`.
  The Div and curl tab recomputes the box and loop at every probe move (`probe()` calls `updateProbe`).
- `AxisymMag`: magnetostatics for ψ = rA_φ with coefficient 1/(μ r) on faces, `B()`,
  flux-linkage and energy inductance, and an optional saturating μ(B) updated between sweeps
  from the H side. Builder: `solenoidWithObject`.
- `AxisymEddy` (core/eddy.js): `AxisymMag` with complex ψ (`V` + j`Vi`) and a conductivity
  array; the eddy term jωσ/r sits on the diagonal of the same neighbour average. `Bc()`,
  `Je()`, `power()`, `impedance(I)`; `cylinderFieldRatio` is the Bessel reference.
- `FDTD2D` (core/fdtd2d.js): TMz Yee grid, per-cell ε_r/σ/PEC, soft point and line sources,
  CPML (default) or first-order Mur open walls, mirror or PEC top/bottom, Ez(t) trace.

## Tests

`bench/run.js` is a plain node script with one `check(name, got, want, tol)` helper (`tol`
is relative, absolute when `want` is 0); it
exits non-zero on any failure and `--freeze` rewrites `golden.json`. `bench/smoke.mjs`
serves the repo on 127.0.0.1 and drives headless Chromium through every tab, view, a
perturbed URL round trip, randomize-on-load, accessible names, the assignment lock, the
semester tag on downloads and a 900 px layout pass.
Both run in `.github/workflows/deploy.yml` before the Pages deploy.
