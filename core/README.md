# em-core

Teaching-grade electromagnetics numerics for the browser, written for
[intro-EMF-lab](https://github.com/interactive-hardware-interfacing/intro-EMF-lab) and
usable on their own. Plain ES modules, SI units, `Float64Array` grids, no dependencies, no
build step. The solvers never touch the DOM, so everything runs under node as well.

| Module | What it holds |
| --- | --- |
| `constants.js` | ε₀, μ₀, π, Coulomb's constant |
| `grid.js` | `Grid2D`: a Float64 grid with bilinear sampling, gradients, `fromFunction`, `magnitude` |
| `analytic.js` | Closed forms: point, line and ring charges, wires, current sheets, loops, Nagaoka, Maxwell's filament mutual inductance, the thick-coil filament sum |
| `relax2d.js` | `Relax2D`: Cartesian Gauss–Seidel for ∇·(ε∇V) = −ρ, Gauss-box charge, energy, Lab 2 presets |
| `axisym.js` | `Axisym` (electrostatics/conduction in (r, z) with explicit face permittivities) and `AxisymMag` (magnetostatics for ψ = rA_φ, optional saturating μ(B)); disk-capacitor and solenoid builders |
| `eddy.js` | `AxisymEddy`: frequency-domain eddy currents (complex ψ), skin depth, J_eddy, power, coil impedance; the long-cylinder Bessel reference |
| `fdtd2d.js` | `FDTD2D`: 2-D TMz Yee FDTD with per-cell ε_r/σ/PEC, point and line sources, CPML or Mur open walls |
| `render.js` | Canvas drawing: colour maps, scalar fields, quiver, streamlines, marching-squares contours, colour bar, `Viewport` |

The solvers are the plainest possible methods on purpose: the Gauss–Seidel neighbour
average is the loop a student writes in a numerical-methods lab, and the `iterate()`
generators expose every sweep so a page can show convergence happening. There is no
over-relaxation or multigrid in the default path.

## Use

```js
import { Relax2D } from './em-core/relax2d.js';
const s = new Relax2D(129, 129, [0, 1, 0, 1]);
s.fixWhere((x, y) => Math.hypot(x - 0.5, y - 0.5) < 0.1, 1);   // a disc at 1 V
s.solve(1e-8);                                                  // or step through s.iterate(k)
```

Each module's header comment states the equations it discretises and the conventions.

## Tests

```
npm test          # node test/run.js
```

`test/core.js` checks every closed form against textbook values and each solver against a
problem with a known answer (spherical and coaxial capacitors, the exact layered disk
capacitor, a saturating rod against the exact flux balance, Nagaoka at two resolutions, the
thick-winding filament sum against Wheeler); `test/fdtd.js` checks pulse speed, reflection
coefficients and wall absorption (Mur and PML); `test/eddy.js` checks the eddy solver
against the Bessel solution for a long cylinder and the power identity P = ½RI².

## In intro-EMF-lab

The site vendors this package as a `git subtree` at `core/`, so it works offline and with no
build step. See that repository's `docs/em-core.md` for the sync commands.

MIT licence.
