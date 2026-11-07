# Phase 0 notes

What is in this commit and what the next phases build on.

## Done

- Single-page shell (`index.html`, `app/shell.js`): tab bar, controls column, layered canvas
  stage (one `<canvas>` per field layer plus an overlay), colour-map radio group, overlay
  checkboxes with per-layer style (arrows / lines), colour scale min/max/auto, probe (click or
  type, Update, Copy row, Add to log, Download log CSV), equation panel (KaTeX, vendored),
  PNG snapshot, Field CSV, Share link. All state round-trips through the URL (`app/state.js`).
- `core/analytic.js`: point charges (3D), infinite line charge, ring of charge (integrated),
  ring as N point charges, infinite wire B and A_z, N wires, finite-width sheet current
  (closed form) and its N-wire approximation, loop on-axis B, long solenoid L, Nagaoka
  factor via complete elliptic integrals (AGM).
- `core/grid.js`: Float64 grid with bilinear sampling, central-difference gradient, CSV.
- `core/render.js`: viridis / cool-warm colour maps, scalar field painter (linear or log),
  quiver, RK2 streamlines with arrowheads, marching-squares contours, markers, probe X.
- `bench/run.js`: 37 closed-form checks. `node bench/run.js` exits non-zero on failure.
- `.github/workflows/deploy.yml`: bench job, then Pages deploy. Enable Pages with
  source "GitHub Actions" in the repo settings once.
- Point charges tab wired end to end as the shell smoke test (Lab 1 Module 2 ranges,
  Randomize with Reveal after the student types an answer). Hidden values stay out of the
  URL until revealed.
- Placeholder tabs for the other six, each already carrying its planned layers (greyed)
  and its governing equations.

## Conventions the next phases should keep

- A tab is a plain object (see the interface comment at the top of `app/shell.js`).
  It never touches the DOM outside `shell.controlsEl`.
- Scalar layers are mutually exclusive (one colour map); vector/contour layers stack.
  A layer's `eq` field maps a display layer (e.g. `Emag`) to the physical symbol used
  in `app/equations.js` (`E`).
- Solver tabs should set `shell.solverRunning = true` while iterating so the update rule
  appears in the equation panel, and call `shell.redraw()` every k sweeps from the Worker
  message handler.
- Units are SI in code; the UI may show mm or uH, but convert at the edge.
- Every number shown must be reproducible from the URL. Hidden-source modes are the only
  exception, by design.

## Next: Phase 1

1. `app/tabs/magnetic-fields.js`: four wires in +-30 mm, I in +-5 A, Randomize + Reveal;
   Module 1 sub-mode with N wires vs. sheet K across 30 mm in the x-z plane. Layers:
   |B| (log), B arrows/lines, A_z contours, J sources. Probe: Bx, By, |B|, A_z.
   Closed forms are already in `core/analytic.js` (`wiresField`, `sheetB`, `sheetAsWiresB`).
2. `app/tabs/ring-line.js`: ring of N point charges vs. line charge, side by side or as a
   difference map; two-rod cross-section for Lab 2 Module 0.
3. 2D-cut / 3D view toggle on closed-form tabs (cut-plane position slider; optional
   Three.js isometric view).
4. Benchmarks for anything new go in `bench/run.js` first.
