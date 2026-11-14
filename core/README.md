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
| `dielectrics.js` | Parallel plates with up to four dielectric regions on `Relax2D`: builder with grid-snapped fractions, plate and bound charges face by face, per-region table, series/parallel/Wiener references, slab force |
| `ampere.js` | Ampère's law: closed-form current distributions (wires, thick wire, coax, sheet, solenoid and toroid cross-sections), Amperian loop segments, ∮B·dl by midpoint sum, enclosed current by geometry |
| `solenoid.js` | Exact circular-loop field and A_φ (elliptic integrals), a solenoid as N turns or an ideal sheet, the finite-sheet axis formula, Helmholtz pairs, Nagaoka's L, the axis profile |
| `filters.js` | RC and series-RLC filters: transfer functions, resonance numbers, steady state with element energies, step response in closed form, real-capacitor impedance |
| `faraday.js` | Faraday's law settings as functions of time: sliding bar (driven or coasting), loop through a field region, loop in B(t), rotating-loop generator; Φ, ε, I, force/torque, powers |
| `lorentz.js` | Boris pusher and tracer for charged particles in E and B; cyclotron, E×B drift, velocity selector, spectrometer radius, Hall effect, force between wires, loop torque |
| `tline.js` | Waves on a lossless transmission line: Γ, VSWR, Z_in(d), the sinusoidal steady state with envelopes and instantaneous forward/reflected parts, the step bounce diagram and V(z, t) |
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
against the Bessel solution for a long cylinder and the power identity P = ½RI²; `test/dielectrics.js`
checks the parallel-plate builder: same D in a layered stack and same E side by side, drops adding
to V and charges to Q, energy = Gauss = plate charge, free + bound = Q/εr at the plate, the 5 % air
gap taking 20.8 % of V, dC/dx against the slab-force formula, and the Wiener bounds for a tilted
interface; `test/ampere.js` checks every current distribution against its textbook field and
∮B·dl against μ₀ I_enc for loops on and off the symmetry, including the enclosed-current geometry;
`test/solenoid.js` checks the loop field against brute-force Biot–Savart, ψ as a stream function, the
turn sum against the finite-sheet formula, and the Helmholtz values; `test/filters.js` checks the
handout's Examples 6.1–6.3, the sum rule H_LP + H_BP + H_HP = 1, and the step-response identities;
`test/faraday.js` checks ε against a numerical −dΦ/dt in every setting, Lenz, the power balance and the
exponential braking of the coasting bar; `test/lorentz.js` checks the Boris pusher against cyclotron motion
(closure, exact energy), the cycloid's E×B mean velocity, the parabola, the selector and the closed forms;
`test/tline.js` checks Γ, VSWR and Z_in for the textbook loads, the envelopes, the quarter-wave transformer,
power bookkeeping and the bounce-diagram sums.

## In intro-EMF-lab

The site vendors this package as a `git subtree` at `core/`, so it works offline and with no
build step. See that repository's `docs/em-core.md` for the sync commands.

MIT licence.
