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
  it touches the DOM, so every module runs under node in the bench.
- **app/shell.js** owns everything the tabs share: the tab bar, the control panel on the
  left, the stacked canvases in the middle (one per layer, plus an overlay), the stage-view
  tabs above them, the layer/colour/probe/export panel on the right, the status line, URL
  state, resizable panels and the assignment lock.
- **app/tabs/** holds one module per tab. A tab is a plain object that follows the contract
  below; `tabs/index.js` lists them in display order.
- **app/workers/relax-worker.js** runs the solvers off the main thread. It understands four
  kinds (`cartesian`, `axisym`, `axisym-mag`, `fdtd`) and a small command set (`init`, `run`,
  `step`, `pause`, `reset`, `probe`), posting frames every ~40 ms so the convergence is visible.
  `app/solverclient.js` wraps it in promises for the run-to-convergence tabs.

## The tab contract

```js
export default {
  id, title, summary,                 // id is the URL `tab=`; summary appears on the About page
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
   `run.js`, or a block in `app.js`), and add any new `core/` module to the parse list.
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
- `AxisymMag`: magnetostatics for ψ = rA_φ with coefficient 1/(μ r) on faces, `B()`,
  flux-linkage and energy inductance, and an optional saturating μ(B) updated between sweeps
  from the H side. Builder: `solenoidWithObject`.
- `FDTD2D` (core/fdtd2d.js): TMz Yee grid, per-cell ε_r/σ/PEC, soft point and line sources,
  CPML (default) or first-order Mur open walls, mirror or PEC top/bottom, Ez(t) trace.

## Tests

`bench/run.js` is a plain node script with one `check(name, got, want, tol)` helper; it
exits non-zero on any failure and `--freeze` rewrites `golden.json`. `bench/smoke.mjs`
serves the repo on 127.0.0.1 and drives headless Chromium through every tab, view, a
perturbed URL round trip, randomize-on-load, accessible names and a 900 px layout pass.
Both run in `.github/workflows/deploy.yml` before the Pages deploy.
