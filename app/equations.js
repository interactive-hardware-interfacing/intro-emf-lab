// TeX strings for the equation panel. Each tab has:
//   governing: [{ title, tex, note?, zero?: true }]   always shown
//   layers:    { V: { tex, note? }, E: ..., ... }     shown when that layer is on
//   solver?:   { tex, note }                          shown while a solver is running
// Maxwell's equations are shown in full on every tab with the vanishing terms marked,
// so students see the same four equations everywhere and which terms are "off".

const MAXWELL = {
  gaussE: String.raw`\nabla \cdot \mathbf{D} = \rho_v`,
  gaussB: String.raw`\nabla \cdot \mathbf{B} = 0`,
  faraday: String.raw`\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}`,
  ampere: String.raw`\nabla \times \mathbf{H} = \mathbf{J} + \frac{\partial \mathbf{D}}{\partial t}`,
};

// Static versions with the time-derivative term greyed via \color
const g = (s) => String.raw`{\color{#999}{${s}}}`;
const MAXWELL_STATIC = {
  faraday: String.raw`\nabla \times \mathbf{E} = ${g(String.raw`-\frac{\partial \mathbf{B}}{\partial t} = 0`)}`,
  ampere: String.raw`\nabla \times \mathbf{H} = \mathbf{J} + ${g(String.raw`\frac{\partial \mathbf{D}}{\partial t}`)}`,
  ampereNoJ: String.raw`\nabla \times \mathbf{H} = ${g(String.raw`\mathbf{J} + \frac{\partial \mathbf{D}}{\partial t} = 0`)}`,
};

export const EQUATIONS = {
  'point-charges': {
    governing: [
      { title: 'Gauss', tex: MAXWELL.gaussE },
      { title: 'Static: curl E = 0, so E = -grad V', tex: MAXWELL_STATIC.faraday, zero: true },
      { title: 'Coulomb field of a point charge', tex: String.raw`\mathbf{E} = \frac{q}{4\pi\varepsilon_0 r^2}\,\hat{\mathbf{r}}` },
      { title: 'Superposition', tex: String.raw`\mathbf{E}(\mathbf{r}) = \sum_k \frac{q_k}{4\pi\varepsilon_0}\frac{\mathbf{r}-\mathbf{r}_k}{|\mathbf{r}-\mathbf{r}_k|^3}` },
    ],
    layers: {
      V: { tex: String.raw`V(\mathbf{r}) = \sum_k \frac{q_k}{4\pi\varepsilon_0\,|\mathbf{r}-\mathbf{r}_k|}`, note: 'Zero at infinity.' },
      E: { tex: String.raw`\mathbf{E} = -\nabla V`, note: 'Arrows show direction; colour layer shows |E| when selected.' },
      D: { tex: String.raw`\mathbf{D} = \varepsilon_0 \mathbf{E}`, note: 'Free space: D and E differ by the constant eps0.' },
      J: { tex: String.raw`\mathbf{J} = 0`, note: 'No conductor, no current. In Ampere\'s law both J and dD/dt vanish here.', zero: true },
    },
  },

  'ring-line': {
    governing: [
      { title: 'Gauss', tex: MAXWELL.gaussE },
      { title: 'Infinite line charge (Gauss\'s law on a cylinder)', tex: String.raw`E_r = \frac{\lambda}{2\pi\varepsilon_0 r}` },
      { title: 'Ring of charge, on axis', tex: String.raw`E_z = \frac{\lambda R\, z}{2\varepsilon_0 (R^2+z^2)^{3/2}}` },
      { title: 'Discrete to continuous', tex: String.raw`\lambda = \frac{N q}{2\pi R}, \qquad \sum_k q_k \to \int \lambda\, dl` },
    ],
    layers: {
      V: { tex: String.raw`V = -\frac{\lambda}{2\pi\varepsilon_0}\ln\frac{r}{r_0}`, note: 'Line charge potential, zero at r0.' },
      E: { tex: String.raw`\mathbf{E} = -\nabla V` },
    },
  },

  capacitors: {
    governing: [
      { title: 'Gauss, no free charge in the dielectric', tex: String.raw`\nabla \cdot (\varepsilon \nabla V) = 0` },
      { title: 'Capacitance', tex: String.raw`C = \frac{Q}{V} = \frac{2W}{V^2}, \qquad W = \tfrac{1}{2}\int \varepsilon |\mathbf{E}|^2\, dv` },
      { title: 'Ideal parallel plate (no fringing)', tex: String.raw`C_{\text{ideal}} = \frac{\varepsilon_0 \pi R^2}{\dfrac{h}{3}\left(\dfrac{2}{\varepsilon_{r2}} + \dfrac{1}{\varepsilon_r}\right)}` },
      { title: 'Ampere, nothing flows', tex: MAXWELL_STATIC.ampereNoJ, zero: true },
    ],
    layers: {
      V: { tex: String.raw`\nabla^2 V = 0 \text{ in each layer}` },
      E: { tex: String.raw`\mathbf{E} = -\nabla V`, note: 'Tangential E is continuous across layers.' },
      D: { tex: String.raw`\mathbf{D} = \varepsilon_0 \varepsilon_r \mathbf{E}`, note: 'Normal D is continuous across layers.' },
      P: { tex: String.raw`\mathbf{P} = \mathbf{D} - \varepsilon_0 \mathbf{E} = \varepsilon_0(\varepsilon_r - 1)\mathbf{E}` },
      J: { tex: String.raw`\mathbf{J} = 0, \quad \frac{\partial \mathbf{D}}{\partial t} = 0`, zero: true },
    },
    solver: { tex: String.raw`V_{i,j} \leftarrow \frac{\varepsilon_E V_{i+1,j} + \varepsilon_W V_{i-1,j} + \varepsilon_N V_{i,j+1} + \varepsilon_S V_{i,j-1}}{\varepsilon_E+\varepsilon_W+\varepsilon_N+\varepsilon_S}`, note: 'Neighbour average, repeated until max |dV| < tolerance.' },
  },

  conduction: {
    governing: [
      { title: 'Steady current: charge conservation', tex: String.raw`\nabla \cdot \mathbf{J} = 0 \;\Rightarrow\; \nabla \cdot (\sigma \nabla V) = 0` },
      { title: 'Ohm\'s law at a point', tex: String.raw`\mathbf{J} = \sigma \mathbf{E}` },
      { title: 'Ampere (static)', tex: MAXWELL_STATIC.ampere },
    ],
    layers: {
      V: { tex: String.raw`\nabla \cdot (\sigma \nabla V) = 0` },
      E: { tex: String.raw`\mathbf{E} = -\nabla V` },
      J: { tex: String.raw`\mathbf{J} = \sigma \mathbf{E}, \qquad I = \int_S \mathbf{J}\cdot d\mathbf{S}, \qquad R = \frac{V}{I}` },
    },
    solver: { tex: String.raw`V_{i,j} \leftarrow \frac{\sigma_E V_{i+1,j} + \sigma_W V_{i-1,j} + \sigma_N V_{i,j+1} + \sigma_S V_{i,j-1}}{\sigma_E+\sigma_W+\sigma_N+\sigma_S}` },
  },

  'magnetic-fields': {
    governing: [
      { title: 'Ampere (static)', tex: MAXWELL_STATIC.ampere },
      { title: 'No monopoles', tex: MAXWELL.gaussB },
      { title: 'Infinite straight wire', tex: String.raw`\mathbf{B} = \frac{\mu_0 I}{2\pi r}\,\hat{\boldsymbol{\phi}}` },
      { title: 'Infinite sheet current', tex: String.raw`\mathbf{B} = \frac{\mu_0 K}{2}\,\hat{\mathbf{n}} \times \hat{\mathbf{K}}` },
    ],
    layers: {
      B: { tex: String.raw`\mathbf{B}(\mathbf{r}) = \sum_k \frac{\mu_0 I_k}{2\pi}\frac{\hat{\mathbf{z}} \times (\mathbf{r}-\mathbf{r}_k)}{|\mathbf{r}-\mathbf{r}_k|^2}` },
      A: { tex: String.raw`A_z = -\sum_k \frac{\mu_0 I_k}{2\pi}\ln\frac{|\mathbf{r}-\mathbf{r}_k|}{r_0}, \qquad \mathbf{B} = \nabla \times \mathbf{A}`, note: 'Contours of A_z are the field lines of B.' },
      J: { tex: String.raw`\mathbf{J} = I\,\delta(\mathbf{r}-\mathbf{r}_k)\,\hat{\mathbf{z}}`, note: 'J is the source here: a line current along z.' },
    },
  },

  inductors: {
    governing: [
      { title: 'Ampere (static)', tex: MAXWELL_STATIC.ampere },
      { title: 'Vector potential, axisymmetric', tex: String.raw`\nabla \times \left(\frac{1}{\mu}\nabla \times A_\phi \hat{\boldsymbol{\phi}}\right) = J_\phi` },
      { title: 'Inductance two ways', tex: String.raw`L = \frac{N\Phi}{I} = \frac{2W}{I^2}, \qquad W = \tfrac{1}{2}\int \mathbf{B}\cdot\mathbf{H}\, dv` },
      { title: 'Long solenoid', tex: String.raw`L \approx \frac{\mu_0 N^2 A}{\ell}` },
    ],
    layers: {
      B: { tex: String.raw`B_r = -\frac{\partial A_\phi}{\partial z}, \qquad B_z = \frac{1}{r}\frac{\partial (r A_\phi)}{\partial r}` },
      H: { tex: String.raw`\mathbf{H} = \mathbf{B}/\mu` },
      M: { tex: String.raw`\mathbf{M} = \mathbf{B}/\mu_0 - \mathbf{H} = (\mu_r - 1)\mathbf{H}` },
      J: { tex: String.raw`J_\phi = \frac{N I}{\ell\, t}\text{ in the winding}, \qquad \nabla \times \mathbf{H} \text{ recovered from the solution}` },
    },
    solver: { tex: String.raw`\psi = r A_\phi, \qquad \psi_{i,j} \leftarrow \text{weighted average of neighbours} + \mu r J_\phi h^2` },
  },

  sandbox: {
    governing: [
      { title: 'Laplace (default)', tex: String.raw`\nabla^2 V = 0` },
      { title: 'Poisson (with painted charge)', tex: String.raw`\nabla \cdot (\varepsilon \nabla V) = -\rho_v` },
    ],
    layers: {
      V: { tex: String.raw`V_{i,j} \leftarrow \tfrac{1}{4}\left(V_{i+1,j} + V_{i-1,j} + V_{i,j+1} + V_{i,j-1}\right) + \frac{\rho_{i,j} h^2}{4\varepsilon}`, note: 'The whole solver, one line.' },
      E: { tex: String.raw`E_x \approx -\frac{V_{i+1,j}-V_{i-1,j}}{2h}, \qquad E_y \approx -\frac{V_{i,j+1}-V_{i,j-1}}{2h}` },
      J: { tex: String.raw`\mathbf{J} = \sigma \mathbf{E}` },
    },
    solver: { tex: String.raw`\text{stop when } \max_{i,j} |V^{\,new}_{i,j} - V^{\,old}_{i,j}| < \text{tol}` },
  },
};

/** Convenience: the governing list plus the layer entries for the layers switched on. */
const ALIASES = { 'point-charges-3d': 'point-charges', 'ring-charge': 'ring-line', 'line-charge': 'ring-line' };

export function equationsFor(tabId, layersOn, solverRunning = false) {
  const set = EQUATIONS[ALIASES[tabId] ?? tabId];
  if (!set) return [];
  const out = set.governing.map((e) => ({ ...e, kind: 'governing' }));
  for (const L of layersOn) {
    const e = set.layers?.[L];
    if (e) out.push({ ...e, title: `Layer ${L}`, kind: 'layer' });
  }
  if (solverRunning && set.solver) out.push({ ...set.solver, title: 'Update rule', kind: 'solver' });
  return out;
}
