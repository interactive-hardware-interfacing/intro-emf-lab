# Phase 6 notes (review fixes, About page, mu(B), four new tabs)

## Review fixes (patch 6a)
1. Layered dielectrics in `diskCapacitor` were one cell thin on the centre layer because
   eps lived on nodes. `Axisym` now carries explicit face arrays (`faceR`, `faceZ`) set by
   `setFacesFrom(epsAt)`; the layered 1-D check gives C/C_ideal = 1.00000. `cellsPerLayer`
   is forced even so the gap is centred.
2. CSV on mirrored tabs (Capacitors, Inductors) now writes the solver's own half-plane.
3. Zoomed colour maps honour the viewport (`opts.extent` through `drawScalarField`).
4. The two-rod reference uses the exact image solution (b = sqrt(d^2 - a^2)), so the rod
   surface is an equipotential to 0.03%.

Tests added: `bench/app.js` (worker protocol under node, URL-state round trip, Sandbox
RLE, mirroring, CSV alignment, tab/equation/DOM contract lint), golden files for the
handout numbers (`bench/golden.json`, `npm run freeze`), and `bench/smoke.mjs`, a headless
Chromium pass over every tab and view that fails CI on any console error.

## About page (patch 6b)
`app/about.js` holds the site introduction, a what/shows/look-for block per tab
(`TAB_INFO`) and every equation set; `app/tabs/about.js` renders it as a page view. The
equation panel left the side bar (it never had room next to the layer list), so each tab's
lead line links to its About section instead.

## Nonlinear mu(B) (patch 6c)
`AxisymMag.setSaturation({mask, muI, Bsat})` gives the masked cells the curve

    B(H) = mu0 H + Bsat tanh( mu0 (mu_i - 1) H / Bsat )

Between relaxation chunks `updateMu()` re-evaluates mu_r in each masked cell by
successive substitution from the H side: H = |B| / (mu0 mu_current), mu_new = B(H)/(mu0 H),
with 50% damping. Iterating mu(|B|) directly oscillated near the knee (the B-side map has
gain > 1 there); the H-side map is a contraction because B(H) is concave. Convergence
requires both the field residual and the mu change to be small. The worker returns `eps`
and the mean mu_r with every frame so the tab can draw the mu_r map and compute H and M
with the material it actually solved with. Bench: 1-D saturating rod against the exact
transcendental flux balance (0.15%); mean mu_r within 3%. On the Inductors tab the option
is "Saturating core" with B_sat; at I = 100 A the default rod's centre field drops from
2.07 T to 1.62 T.

## Gauss's law tab (patch 6d)
`app/scene3d.js` factors the orbit camera, painted cut planes, box outline, charge
spheres and 3D field-line tracing out of the 3D point-charges tab. The Gaussian surface
(sphere or cube) is tiled into patches with exact areas; E.n on each patch is painted via
the colour map and summed (midpoint rule). Q_enc is counted geometrically. The cube reports
flux per face. Bench: centred charge exact to 1e-15; off-centre charge in a cube 0.01%;
charge outside gives ~zero net flux.

## Interface tab (patch 6d)
Plane interface at x = 0, uniform field in medium 1 at angle theta1 from the normal,
medium 2 from the boundary conditions (closed form). Cases: dielectric-dielectric
(E_t, D_n + rho_s), dielectric-perfect conductor (E2 = 0, rho_s = D1.n), magnetic-magnetic
(B_n, H_t + K). V (or A_z) is continuous across the interface. Reports theta2, the bound
surface charge (P1 - P2).n or the magnetisation surface current, and draws the rays and
angle arcs. Bench: refraction ratios, continuity, jumps by rho_s and K, conductor case.

## Transmission lines tab (branch tline)
Closed-form C', L' = mu eps / C', Z0 and v for coax, twin-lead (exact image solution,
d > 2a) and parallel plates (ideal interior field, fringing noted). The "Numeric check"
view solves the same cross-section with Relax2D and reads lambda from a Gauss box:
coax -1.5% at 161^2 (staircased circles), twin-lead -2.4% with walls held at the exact
far-field potential, plates +5% because the Neumann walls admit fringing. Bench: 17 checks
(b/a = e -> 60 ohm, RG-58 -> 47.45 ohm and v = 0.667c, L'C' = mu eps for every geometry,
thin-wire limit of the exact twin-lead C').

## Time-varying (FDTD) tab (branch fdtd)
`core/fdtd2d.js`: 2-D TMz Yee grid (Ez, Hx, Hy), dt = 0.99 h / (c sqrt 2), per-cell
eps_r, PEC mask, soft point or line sources (Gaussian pulse or CW), first-order Mur
absorbing walls (top/bottom optionally mirror or PEC). Worker kind 'fdtd' runs k steps a
frame and keeps the probe trace Ez(t). Presets: free-space pulse, dielectric slab, slit
in a conducting wall, dielectric cylinder lens, parallel-plate waveguide; paint tools for
PEC and dielectric. Bench: pulse speed c (0.1%), Mur energy bounded, Gamma = -1/3 at a
dielectric step (0.5%), tau = 2/3, PEC Gamma = -1, Courant number.
