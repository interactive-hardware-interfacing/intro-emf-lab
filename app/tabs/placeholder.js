// Placeholder tabs for phases not yet built. They register their planned layers (greyed
// out) and their equations so the shell shows what is coming and the equation panel works.

import { ui } from '../shell.js';

export function placeholderTab({ id, title, phase, summary, layers, axes = ['x', 'y'], extent = [0, 1, 0, 1], serves, plan }) {
  return {
    id, title, phase, summary, axes, extent, serves,
    available: false,
    layers: layers.map((L) => ({ ...L, available: false })),
    init(shell) {
      const box = shell.controlsEl;
      box.appendChild(ui.el('h1', '', title));
      box.appendChild(ui.el('p', 'lead', summary));
      const b = ui.el('span', 'badge badge-warn', `Phase ${phase}`);
      box.appendChild(b);
      const p = ui.el('div', 'placeholder');
      p.innerHTML = `<p><strong>Serves:</strong> ${serves}</p><p>${plan}</p>`;
      box.appendChild(p);
    },
  };
}

export const ringLine = placeholderTab({
  id: 'ring-line',
  title: 'Ring and line charge',
  phase: 1,
  summary: 'A ring of N point charges beside the same ring as a continuous line charge; and the two-rod cross-section used in Lab 2.',
  serves: 'Lab 1 Module 1; Lab 2 Module 0 reference picture.',
  plan: 'Closed form. Ring by 200-segment integration of Coulomb\'s law, infinite line charge E = λ/2πε₀r. Side-by-side discrete vs. continuous with a difference map.',
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', signed: true },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'diff', label: 'Discrete − continuous', kind: 'scalar', unit: 'V/m' },
  ],
});

export const capacitors = placeholderTab({
  id: 'capacitors',
  title: 'Capacitors',
  phase: 3,
  summary: 'Disk capacitor with a three-layer dielectric, solved in (r, z) with the plain neighbour-averaging solver. Capacitance from stored energy and from Gauss\'s law.',
  serves: 'Lab 3 Modules 0, 1 and bonus; Lab 2 Module 2 (2D plate).',
  plan: 'axisym.js electrostatic flavour. Controls: applied V, gap, plate radius, εr (centre), εr2 (outer). Outputs: C, ideal C, % difference, D vs ε₀E vs P cutline along the axis, parameter sweeps in a Web Worker.',
  axes: ['r', 'z'],
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'D', label: 'D field', kind: 'vector', styles: ['arrows'] },
    { id: 'P', label: 'P field', kind: 'vector', styles: ['arrows'] },
    { id: 'w', label: 'Energy density', kind: 'scalar', unit: 'J/m³' },
  ],
});

export const conduction = placeholderTab({
  id: 'conduction',
  title: 'Conduction (J)',
  phase: 3,
  summary: 'Steady current in a resistive region between two electrodes: the same solver as the capacitor with σ in place of ε. J = σE, total current through a cut, resistance.',
  serves: 'Lecture demo of Ohm\'s law at the field level; candidate new lab.',
  plan: 'relax2d.js or axisym.js with σ. Preset shapes (bar, constriction, L-bend) and painted regions. Current cut with I readout; R = V/I compared with ℓ/σA.',
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V' },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'J', label: 'J field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'Jmag', label: '|J|', kind: 'scalar', unit: 'A/m²' },
  ],
});

export const magneticFields = placeholderTab({
  id: 'magnetic-fields',
  title: 'Magnetic fields',
  phase: 1,
  summary: 'Up to four line currents (Lab 4 Module 2, with Randomize), and N wires across 30 mm beside a 30 mm sheet current (Lab 4 Module 1).',
  serves: 'Lab 4 Modules 1, 2 and bonus. First tab to ship in Phase 1.',
  plan: 'Closed form: B = μ₀I/2πr per wire, sheet by the closed-form strip integral. Layers: |B| colour, B arrows or lines, A_z contours (bonus), J as the source. Probe gives Bx, By (or Bx, Bz) and A_z.',
  extent: [-0.03, 0.03, -0.03, 0.03],
  layers: [
    { id: 'Bmag', label: '|B|', kind: 'scalar', unit: 'T' },
    { id: 'B', label: 'B field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'A', label: 'A_z contours', kind: 'contour' },
    { id: 'J', label: 'J (sources)', kind: 'info', note: 'line currents' },
  ],
});

export const inductors = placeholderTab({
  id: 'inductors',
  title: 'Inductors',
  phase: 4,
  summary: 'A finite solenoid with a permeable object at a variable axial position, solved in (r, z) for A_φ. Inductance two ways and a position sweep.',
  serves: 'Lab 5. Mode toggle: simple cylinder, or the ring-sensor prototype.',
  plan: 'axisym.js magnetostatic flavour. Controls: coil I, turns, radius, length; object μr, radius, length, position. L = NΦ/I and L = 2W/I²; L vs position with CSV export.',
  axes: ['r', 'z'],
  layers: [
    { id: 'Bmag', label: '|B|', kind: 'scalar', unit: 'T' },
    { id: 'B', label: 'B field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'H', label: 'H field', kind: 'vector', styles: ['arrows'] },
    { id: 'M', label: 'M field', kind: 'vector', styles: ['arrows'] },
    { id: 'J', label: 'J_φ', kind: 'scalar', unit: 'A/m²' },
  ],
});

export const sandbox = placeholderTab({
  id: 'sandbox',
  title: 'Sandbox',
  phase: 2,
  summary: 'Paint conductors at a chosen potential, dielectrics and (with the Poisson toggle) charge on a grid, then watch the neighbour-averaging solver relax to the answer.',
  serves: 'Lab 2, all modules: the live demo of the method students write in MATLAB.',
  plan: 'relax2d.js in a Web Worker posting a frame every k sweeps. Play / pause / step, residual plot, iteration counter, tolerance. Laplace by default; Poisson toggle adds the ρ brush. Presets for the two rods, square rods, parallel plate and the triangle bonus.',
  layers: [
    { id: 'V', label: 'Potential V', kind: 'scalar', unit: 'V', signed: true },
    { id: 'E', label: 'E field', kind: 'vector', styles: ['arrows', 'lines'] },
    { id: 'Veq', label: 'Equipotentials', kind: 'contour' },
    { id: 'res', label: 'Residual |ΔV|', kind: 'scalar', unit: 'V' },
  ],
});
