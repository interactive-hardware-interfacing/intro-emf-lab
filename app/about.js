// The About page: what the site is, how it computes, and one section per tab with what the
// tab shows, what to look for, and its equations (rendered from app/equations.js, so the
// equations live in exactly one place). The tab side panels keep a one-line lead and link here.

import { EQUATIONS, ALIASES } from './equations.js';

import { SEMESTER } from './version.js';

export const SITE = {
  title: 'Intro EMF Lab',
  semester: SEMESTER,
  intro: [
    'Browser-based field simulators for an introductory electromagnetics course. Every tab is a small experiment: set the geometry and sources on the left, read fields and derived quantities on the right, and look at the pictures in the middle.',
    'Nothing here is a black box. The closed-form tabs sum textbook formulas. The solver tabs use the plainest possible numerical method, the Gauss–Seidel neighbour average: replace each grid point by the average of its neighbours, sweep the grid, and repeat until nothing changes. That is the same loop you write yourself in the numerical-methods lab, and the Sandbox tab lets you watch it converge.',
  ],
  howTo: [
    ['Layers', 'One colour map at a time (V, |E|, |B|, …) plus any number of overlays (arrows, field lines, equipotentials). The colour scale can be fixed with Min/Max.'],
    ['Probe', 'Click anywhere on a plot, or type coordinates, to read every field quantity at that point. "Add to log" collects readings; "Download log CSV" exports them.'],
    ['Views', 'Some tabs offer more than one view of the centre window: a 3D rendering, full-size plots along the axis, a sweep curve, the convergence history.'],
    ['Share link', 'Every setting, including the probe and the view, is encoded in the page URL. Paste the link into a report and anyone can reproduce exactly what you saw.'],
    ['Reset tab', 'Returns the current tab to its defaults.'],
    ['Export', 'PNG snapshot of the plot and CSV of the whole field grid, from the Export section.'],
  ],
  numerics: [
    ['Units', 'SI throughout: metres, coulombs, amperes, volts, teslas. Lengths in the side panels are in millimetres where the handouts use millimetres.'],
    ['Grids', 'The solvers work on uniform square grids. Finer grids are more accurate and slower: with plain neighbour averaging the time grows roughly as (grid side)⁴. Each solver tab has a resolution setting; refine once to see how much an answer moves.'],
    ['Boxes', 'A numerical solution needs a finite box. Capacitors use insulating walls (no stray capacitance); inductors use ψ = 0 walls far away (about 0.2% low on L at 8× the coil size, 1.7% at the 4× box of the Eddy currents tab). The status line under the plot reports grid size, sweep count and residual.'],
    ['Checks', 'Every closed form and both solvers are tested against problems with known answers before the site deploys; the numbers quoted in the handouts are frozen as golden files.'],
  ],
};

export const TAB_INFO = {
  'point-charges': {
    what: 'Up to four point charges in a 0.5 m square, with exact Coulomb superposition. The colour map is sampled on a display grid; the probe and the field lines use the exact formulas.',
    shows: ['Potential V and |E| colour maps; E as arrows or field lines; equipotentials.', 'A cut-plane control: the charges sit in z = 0, and XZ or YZ cuts show the field above and below that plane.', 'Randomize mode hides the charges; use the probe to infer them, type your answer, then Reveal.'],
    lookFor: ['Field lines leave positive charges and end on negative ones or at infinity.', 'Equipotentials are everywhere perpendicular to E.', 'The exact V and the grid-interpolated V differ most near a charge: that is discretisation error, and it shrinks with a finer grid.'],
  },
  'point-charges-3d': {
    what: 'The same charges in true 3D: anywhere in a 0.5 × 0.5 × 0.5 m box, with three movable cut planes, field lines traced through space, and a view you can orbit by dragging.',
    shows: ['V or |E| on the XY, XZ and YZ planes with one shared colour scale.', 'Field lines in 3D (density slider), shaded by depth.', 'The probe reads values on the XY plane at the x, y you enter.'],
    lookFor: ['A 2D cut can hide a charge: move the planes to find where the field actually goes.', 'Lines never cross; where they bunch, |E| is large.'],
  },
  'ring-charge': {
    what: 'A ring of radius R in the z = 0 plane carrying either N point charges of q each or a continuous line charge λ, computed in 3D with cut planes.',
    shows: ['Click a point charge to remove it without moving the others; the “Per-charge E at the probe” layer draws each charge’s contribution at the probe as an arrow with the net in white, and the side panel reports Σ|Eₖ| against |ΣEₖ|.', 'V, |E|, E arrows or lines, equipotentials.', 'A "discrete − continuous" map: where N points stop looking like a ring.', 'The out-of-plane E component on a cut.'],
    lookFor: ['At the centre of a full ring the contributions cancel to zero; take one charge out and the net field there is exactly minus that charge’s own field.', 'Equal total charge means λ = Nq / 2πR; as N grows the discrete field converges to the continuous one, fastest far from the ring.', 'On the axis E is purely axial and zero at the centre by symmetry.'],
  },
  'line-charge': {
    what: 'Two infinitely long conducting rods of radius a at x = ±d in cross-section. The exact solution outside the rods is that of two image line charges at x = ±√(d² − a²), so the rod surfaces are exact equipotentials.',
    shows: ['V, |E|, E lines, equipotentials; the rod surface potential and the capacitance per unit length, πε₀ / acosh(d/a).', 'The thin-wire approximation πε₀ / ln(2d/a) for comparison.'],
    lookFor: ['This is the reference your own solver should reproduce: set the rod potentials to ±V shown here and compare V and E along the x-axis.', 'The field is strongest in the gap between the rods and on their inner faces.'],
  },
  capacitors: {
    what: 'Two circular plates with three dielectric layers between them, each one third of the gap, solved in the (r, z) half-plane and mirrored for display. Capacitance from stored energy and from Gauss\'s law around the top plate.',
    shows: ['V, |E|, energy density; E, D and P arrows; equipotentials.', 'A 3D view with vertical and horizontal cuts; D, ε₀E and P along the axis; parameter sweeps.', 'Device C beside the ideal series formula, the ratio, and Kirchhoff\'s edge correction.'],
    lookFor: ['Fringing: field lines bow outward at the plate edge, and C exceeds the ideal value; the ratio grows as the gap grows relative to the radius.', 'Across a dielectric interface D (normal) is continuous while E and P step by the permittivity ratio.', 'Energy and Gauss give the same C: for this discrete solution that is an identity.'],
  },
  conduction: {
    what: 'What a resistor looks like from the inside. A sheet of resistive material between a 0 V electrode and V₀; the solver finds V, then E = −∇V and J = σE at every point. Same equation as electrostatics with σ in place of ε.',
    shows: ['V, |J|; E and J as arrows or lines; equipotentials.', 'The current through a cut you can drag, a second fixed cut for comparison, and R = V/I.', 'Presets (bar, constriction, L-bend, plate with holes) and paint tools for insulator and conductor.'],
    lookFor: ['Ohm\'s law V = IR is the circuit summary of this field problem; for the uniform bar R = ℓ/(σA) comes out exactly.', 'The current through every cut is the same, ∇·J = 0: Kirchhoff\'s current law at the field level.', 'Current lines never cross an insulator and meet equipotentials at right angles; constrictions crowd the current and raise R, and |J|² is where the heat goes.'],
  },
  'magnetic-fields': {
    what: 'Infinite straight currents, B = μ₀I/2πr each, summed; and a 30 mm sheet of surface current beside the same width populated by N line currents.',
    shows: ['|B| colour, B arrows or lines, A_z and its contours (which are the field lines), J as the source markers.', 'For the sheet: the field of N wires and of the continuous sheet at the same probe point, and their difference.', 'Randomize hides the currents (positions stay visible); infer them from the probe, then Reveal.'],
    lookFor: ['B circles each wire (right-hand rule: dot = out of the page, cross = in).', 'Near a wide sheet B → μ₀K/2 and is parallel to the sheet; far away the sheet looks like a single wire carrying K·w.', 'Contours of A_z are exactly the B field lines: B = ∇×A.'],
  },
  inductors: {
    what: 'A coil of N turns carrying I with a permeable cylinder at a variable position, solved in (r, z) for ψ = r·A_φ and mirrored for display. Inductance from flux linkage and from stored energy. Mode toggle: solenoid with the object inside, or a short ring sensor the object passes through. Optional saturating core: μr(B) follows a tanh B–H curve and the solver iterates until field and material agree.',
    shows: ['|B|, B_z, |H|, |M|, J_φ and μr colour maps; B, H, M arrows; flux lines (contours of ψ).', 'A 3D view; B, H, M along the axis; the inductance versus object position (sweep).', 'L beside μ₀N²A/ℓ and its Nagaoka correction for the empty coil.'],
    lookFor: ['Flux funnels into the permeable object: B rises inside it while H barely changes, and L goes up.', 'L is largest with the object centred and falls off as it leaves: the sensor curve.', 'Quote the flux-linkage L; the energy value under-counts near a thin winding on a coarse grid.', 'The reference L (Nagaoka, or the thick-winding filament sum you can select) is for the ideal winding; the grid smears a 1 mm winding over about two cells, so the solved L reads a few percent low (about −7% at the default grid, −4% at the fine one) and converges slowly as the grid is refined. Comparisons between runs on the same grid are far better than that.', 'With a saturating core, raise I: L falls as μr collapses where |B| nears B_sat, and the μr map shows the saturated region spreading from the ends.'],
  },
  sandbox: {
    what: 'Draw a problem and watch the solver converge. Each free cell is replaced by the average of its four neighbours, over and over, until nothing changes. That is the whole solver.',
    shows: ['V, |E|, the last change per cell; E arrows or lines; equipotentials; the residual versus sweep count (Convergence view).', 'Presets: two round rods, two square rods, parallel plates, two triangles. Paint conductors at a chosen V, dielectric εr, charge ρ (Poisson toggle), or erase.', 'A Gauss-law box: drag it around a conductor to read the enclosed charge per unit length and the capacitance.'],
    lookFor: ['The residual falls geometrically; the number of sweeps grows with the square of the grid side.', 'A paint stroke restarts the solver from the current solution: the field "heals" around the new conductor.', 'Capacitance from Gauss and from energy agree, and for parallel plates sit above ε₀h/gap by the fringing.'],
  },
  'gauss-law': {
    what: "Up to four point charges and a closed Gaussian surface (sphere or cube) you can move and resize, in 3D. The surface is tiled into patches; E·n on each patch is painted and summed to give the flux, which is compared with Q_enc/ε₀ from the charges that are geometrically inside.",
    shows: ['E·n or |E| as colour on the surface; 3D field lines; the surface mesh; an orbitable view.', 'Q_enc, Q_enc/ε₀, the numeric flux and their difference; for the cube, the flux through each face.', 'Enclosed charges are ringed in yellow.'],
    lookFor: ['Slide the surface so it swallows a charge: Φ jumps by q/ε₀ even though E on the surface changes smoothly.', 'A charge outside contributes zero net flux: the colour map shows inward flux on one side cancelling outward flux on the other.', 'The numeric sum is a midpoint rule; it drifts from Q_enc/ε₀ when a charge sits close to the surface, and recovers with finer patches.'],
  },
  interface: {
    what: 'A uniform field meets a plane interface between two media. Medium 2 follows from the boundary conditions, so everything is closed form: E_t and D_n continuity for dielectrics, E = 0 inside a perfect conductor, B_n and H_t continuity for magnetic media.',
    shows: ['V (or A_z), |E| (or |B|), the normal and tangential components; E/B, D/H and P/M arrows; field lines bending at the interface; equipotentials.', 'θ1 and θ2 drawn at the interface, with the refraction ratio in the status line.', 'The bound surface charge (P1 − P2)·n or the magnetisation surface current, and the free ρs or K you add.'],
    lookFor: ['Lines bend away from the normal entering the higher-ε (or higher-μ) medium: tan θ2 / tan θ1 = ε2/ε1.', 'Only E_t is continuous; E_n jumps by the ratio ε1/ε2, which is what the bound charge at the interface does.', 'At a conductor the field must be normal: a tangential component would drive current until the surface charge rearranged to cancel it.'],
  },
  'transmission-lines': {
    what: 'The cross-section of a TEM transmission line: coaxial, twin-lead (two round wires) or parallel plates, with a dielectric εr. The static field between the conductors gives the capacitance per unit length C′, and because L′C′ = με for any TEM line that fixes L′, the characteristic impedance Z₀ = √(L′/C′) and the phase velocity v = 1/√(L′C′) = c/√εr as well.',
    shows: ['V, |E| and |D| colour maps; E arrows or field lines; equipotentials, all from the closed forms (the coax logarithm, the exact two-wire image solution, the ideal parallel-plate field).', 'A table of C′ (pF/m), L′ (nH/m), Z₀ (Ω) and v/c for the current dimensions; for the twin-lead the thin-wire approximation beside the exact value.', 'A Numeric check view: the same cross-section solved by Gauss–Seidel, C′ read from a Gauss box around the inner conductor, with the % difference and the convergence history.'],
    lookFor: ['RG-58 defaults (a = 0.45 mm, b = 1.475 mm, εr = 2.25) give about 50 Ω; doubling b/a adds the same Z₀ increment each time, because Z₀ ∝ ln(b/a).', 'The dielectric raises C′ and lowers Z₀ and v by √εr, but leaves L′ alone: the magnetic field does not see εr.', 'For the plates the numeric C′ sits above εw/d by the fringing field, by more as the plates get narrower; for the coax and twin-lead the numeric value lands within a percent or two of the exact one, closer on a finer grid.'],
  },
  eddy: {
    what: 'The Inductors geometry with a conducting object and an AC coil current, solved in the frequency domain for the complex ψ = rA_φ: the magnetostatic equation with one extra term, jωσψ/r, for the induced (eddy) currents. Displacement current is dropped, so this is the quasi-static regime: ∂B/∂t matters, waves do not.',
    shows: ['|B| amplitude, the phase of B_z relative to the coil current, |J_eddy|, the time-average power density; snapshots of B_z, J_eddy, B arrows and flux lines at a chosen phase of the cycle, or animated.', 'Skin depth δ, the coil impedance R_eddy + jωL and its change from the empty coil, Q, and the eddy power computed two independent ways as a check.', 'A radial profile through the object (|B|, |J|, phase against r, with the skin depth shaded) and a frequency sweep of L(f) and R(f).'],
    lookFor: ['Raise the frequency: the field is pushed out of the conductor to a layer of thickness δ = √(2/ωμσ), the induced current crowds into that skin, and the flux lines bend around the object as if it were diamagnetic.', 'Inside the conductor the field lags the coil current; animate the cycle and watch the flux lines sweep inward. The phase layer shows the lag growing with depth.', 'The metal-detector principle: a non-magnetic conductor lowers L and raises R_eddy; mild steel raises L (μr) and the rise shrinks with frequency as the flux is confined to an ever thinner skin (σ). A ferromagnetic conductor only looks diamagnetic once μr·δ is small against its size, which for a 5 mm steel rod is well above the frequencies this grid resolves.', 'R_eddy and the eddy power are two routes to the same loss; they agree to well under 1% when the skin depth spans a few cells. If they do not, the grid is too coarse for the frequency.'],
  },
  fdtd: {
    what: 'The one tab where ∂D/∂t is not zero. Faraday and Ampère are stepped in time on a 2 m × 2 m Yee grid (FDTD, TMz polarisation: E along z, H in the plane) in a Web Worker, with absorbing walls so the box looks open (a perfectly matched layer by default, the one-cell Mur condition as an alternative). A Gaussian pulse or a continuous wave is launched from a point or as a plane wave from a line.',
    shows: ['E_z (signed), |H| and the Poynting magnitude |S| as colour maps; H arrows; materials and the source as an overlay.', 'Presets: a pulse in free space, a dielectric slab, a slit in a conducting wall, a dielectric lens, a parallel-plate waveguide; paint conductors and dielectrics on any of them.', 'E_z(t) recorded at the probe point (the "Ez at the probe" view); the stored energy versus time; the time step and Courant number in the status line.'],
    lookFor: ['The pulse travels at c: read two arrival times off the probe trace and divide the distance by their difference.', 'At the slab, the reflected pulse is inverted and one third the height (Γ = (1−n)/(1+n) with n = 2); inside, it moves at c/2 and its wavelength halves.', 'Behind the slit the wave spreads: diffraction grows as the slit shrinks relative to λ. In the waveguide, lower the frequency below cut-off and the wave stops propagating. The guide also keeps ringing long after the pulse: modes just above cut-off have a group velocity near zero, so the box seems not to go quiet. That is physics, not a leak; the open-box presets fall silent within a few box crossings.', 'Energy rises while the source is on and leaks out through the open walls; a conductor stores none, a dielectric holds more E energy for the same field.', 'Switch the open walls from PML to Mur and run the free-space pulse: the Mur walls send back a visible ghost, worst where the pulse meets a wall at a grazing angle; the matched layer swallows it.'],
  },
};

/** The equation list for a tab: governing equations, then one per layer that has one. */
export function tabEquations(tabId) {
  const set = EQUATIONS[ALIASES[tabId] ?? tabId];
  if (!set) return [];
  const out = set.governing.map((e) => ({ ...e }));
  for (const [L, e] of Object.entries(set.layers ?? {})) out.push({ ...e, title: `Layer ${L}` });
  if (set.solver) out.push({ ...set.solver, title: 'Solver update rule' });
  return out;
}
