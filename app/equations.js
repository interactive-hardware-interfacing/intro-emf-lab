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

  dielectrics: {
    governing: [
      { title: 'Gauss, no free charge in the dielectrics', tex: String.raw`\nabla \cdot (\varepsilon \nabla V) = 0` },
      { title: 'Boundary conditions at a charge-free interface', tex: String.raw`D_{1n} = D_{2n}, \qquad E_{1t} = E_{2t}` },
      { title: 'Layered: same D, capacitors in series', tex: String.raw`\frac{1}{C} = \sum_i \frac{d_i}{\varepsilon_0 \varepsilon_{ri}\, A}` },
      { title: 'Side by side: same E, capacitors in parallel', tex: String.raw`C = \sum_i \frac{\varepsilon_0 \varepsilon_{ri}\, A_i}{d}` },
      { title: 'Hold Q or hold V', tex: String.raw`V = \frac{Q}{C}, \qquad W = \tfrac{1}{2} C V^2 = \frac{Q^2}{2C}, \qquad F_x = \tfrac{1}{2} V^2 \frac{dC}{dx}` },
      { title: 'Ampere, nothing flows', tex: MAXWELL_STATIC.ampereNoJ, zero: true },
    ],
    layers: {
      V: { tex: String.raw`\nabla^2 V = 0 \text{ in each region}` },
      E: { tex: String.raw`\mathbf{E} = -\nabla V`, note: 'Tangential E is continuous across an interface.' },
      D: { tex: String.raw`\mathbf{D} = \varepsilon_0 \varepsilon_r \mathbf{E}`, note: 'Normal D is continuous across a charge-free interface.' },
      P: { tex: String.raw`\mathbf{P} = \mathbf{D} - \varepsilon_0 \mathbf{E} = \varepsilon_0(\varepsilon_r - 1)\mathbf{E}` },
      sigma: { tex: String.raw`\rho_s = \mathbf{D}\cdot\hat{\mathbf{n}} \text{ (plate)}, \qquad \rho_{sb} = \mathbf{P}\cdot\hat{\mathbf{n}} \text{ (dielectric face)}`, note: 'Against the + plate the bound charge is negative: the net at the plate is Q/εr for one dielectric.' },
    },
    solver: { tex: String.raw`V_{i,j} \leftarrow \frac{\varepsilon_E V_{i+1,j} + \varepsilon_W V_{i-1,j} + \varepsilon_N V_{i,j+1} + \varepsilon_S V_{i,j-1}}{\varepsilon_E+\varepsilon_W+\varepsilon_N+\varepsilon_S}`, note: 'Neighbour average at 1 V, repeated until max |dV| < 2e-8; the result is scaled to the held V or Q.' },
  },

  ampere: {
    governing: [
      { title: "Ampère's law (integral form)", tex: String.raw`\oint_C \mathbf{B}\cdot d\mathbf{l} = \mu_0 I_{enc} = \mu_0 \int_S \mathbf{J}\cdot d\mathbf{S}` },
      { title: 'Differential form', tex: String.raw`\nabla \times \mathbf{B} = \mu_0 \mathbf{J}` },
      { title: 'Infinite wire', tex: String.raw`B_\phi = \frac{\mu_0 I}{2\pi r}` },
      { title: 'Thick wire, uniform J', tex: String.raw`B_\phi = \frac{\mu_0 I r}{2\pi a^2}\ (r<a), \qquad \frac{\mu_0 I}{2\pi r}\ (r>a)` },
      { title: 'Sheet, solenoid, toroid', tex: String.raw`B = \frac{\mu_0 K}{2}, \qquad B = \mu_0 n I, \qquad B_\phi = \frac{\mu_0 N I}{2\pi r}` },
      { title: 'Gauss for B', tex: MAXWELL.gaussB, zero: true },
      { title: 'Faraday, static', tex: MAXWELL_STATIC.faraday, zero: true },
    ],
    layers: {
      B: { tex: String.raw`\mathbf{B} = \nabla\times\mathbf{A}` },
      A: { tex: String.raw`A_z = -\frac{\mu_0 I}{2\pi}\ln\frac{r}{r_{ref}}`, note: 'Contours of A_z are the B field lines.' },
      J: { tex: String.raw`J_z = \frac{I}{\pi a^2}`, note: 'Uniform over each conductor cross-section.' },
      Bt: { tex: String.raw`\oint \mathbf{B}\cdot d\mathbf{l} \approx \sum_k (\mathbf{B}_k\cdot\hat{\mathbf{t}}_k)\,\Delta l_k`, note: 'Midpoint rule on the loop segments; the bars are the summands.' },
    },
    solver: { tex: String.raw`I_{enc} = \sum_{\text{wires inside}} I_k + \int_{\text{inside}} J_z\, dA`, note: 'Closed-form fields; the enclosed current is found from the geometry, not from the field.' },
  },

  solenoids: {
    governing: [
      { title: 'Biot–Savart', tex: String.raw`\mathbf{B}(\mathbf{r}) = \frac{\mu_0 I}{4\pi}\oint \frac{d\mathbf{l}' \times (\mathbf{r}-\mathbf{r}')}{|\mathbf{r}-\mathbf{r}'|^3}` },
      { title: 'One loop, on the axis', tex: String.raw`B_z = \frac{\mu_0 I a^2}{2(a^2+z^2)^{3/2}}` },
      { title: 'Finite current sheet, on the axis', tex: String.raw`B_z = \frac{\mu_0 n I}{2}(\cos\theta_1 + \cos\theta_2)` },
      { title: 'Long solenoid', tex: String.raw`B = \mu_0 n I = \mu_0 \frac{N}{L} I` },
      { title: 'Helmholtz pair (d = a)', tex: String.raw`B_0 = \left(\tfrac{4}{5}\right)^{3/2}\frac{\mu_0 I}{a}, \qquad \frac{d^2B_z}{dz^2}\Big|_0 = 0` },
      { title: 'Gauss for B', tex: MAXWELL.gaussB, zero: true },
    ],
    layers: {
      B: { tex: String.raw`\mathbf{B} = \sum_{\text{turns}} \mathbf{B}_{loop}(\rho, z)`, note: 'Each turn is the exact loop field (complete elliptic integrals K, E).' },
      psi: { tex: String.raw`\psi = \rho A_\phi, \qquad B_\rho = -\frac{1}{\rho}\frac{\partial\psi}{\partial z},\quad B_z = \frac{1}{\rho}\frac{\partial\psi}{\partial\rho}`, note: 'ψ is constant along field lines, so its contours are the lines exactly.' },
    },
    solver: { tex: String.raw`B_z^{loop} = \frac{\mu_0 I}{2\pi\sqrt{(a+\rho)^2+z^2}}\left[K(k) + \frac{a^2-\rho^2-z^2}{(a-\rho)^2+z^2}E(k)\right], \quad k^2 = \frac{4a\rho}{(a+\rho)^2+z^2}`, note: 'Closed form; nothing is relaxed. Summed over N turns, or 400 filaments for the ideal sheet.' },
  },

  filters: {
    governing: [
      { title: 'The two elements', tex: String.raw`i = C\frac{dv}{dt}, \qquad v = L\frac{di}{dt}` },
      { title: 'Impedances', tex: String.raw`Z_R = R, \qquad Z_L = j\omega L, \qquad Z_C = \frac{1}{j\omega C}` },
      { title: 'First-order RC', tex: String.raw`H_{LP} = \frac{1}{1 + j\omega RC}, \qquad H_{HP} = \frac{j\omega RC}{1 + j\omega RC}, \qquad \omega_c = \frac{1}{RC}` },
      { title: 'Series RLC', tex: String.raw`\omega_0 = \frac{1}{\sqrt{LC}}, \qquad Q = \frac{\omega_0 L}{R} = \frac{1}{R}\sqrt{\frac{L}{C}}, \qquad B = \frac{\omega_0}{Q}` },
      { title: 'Four filters from one circuit', tex: String.raw`D(s) = s^2 + \frac{\omega_0}{Q}s + \omega_0^2: \quad H_{LP} = \frac{\omega_0^2}{D}, \; H_{BP} = \frac{(\omega_0/Q)s}{D}, \; H_{HP} = \frac{s^2}{D}, \; H_{BS} = \frac{s^2+\omega_0^2}{D}` },
      { title: 'Resonant magnification and the real part', tex: String.raw`|V_C| = Q|V_{in}|, \qquad f_{SR} = \frac{1}{2\pi\sqrt{ESL\cdot C}}` },
    ],
    layers: {},
    solver: { tex: String.raw`H(j\omega) = \frac{Z_{out}}{Z_R + Z_L + Z_C}`, note: 'Closed form: a voltage divider of impedances. The step response is the textbook second-order solution for each damping case.' },
  },

  faraday: {
    governing: [
      { title: "Faraday's law", tex: String.raw`\varepsilon = \oint \mathbf{E}\cdot d\mathbf{l} = -\frac{d\Phi}{dt}, \qquad \Phi = \int_S \mathbf{B}\cdot d\mathbf{S}` },
      { title: 'Differential form', tex: MAXWELL.faraday },
      { title: 'Motional EMF', tex: String.raw`\varepsilon = \oint (\mathbf{v}\times\mathbf{B})\cdot d\mathbf{l} = B l v` },
      { title: 'Transformer EMF', tex: String.raw`\varepsilon = -N A \frac{dB}{dt}` },
      { title: 'Generator', tex: String.raw`\Phi = N B A\cos\omega t, \qquad \varepsilon = N B A \omega \sin\omega t` },
      { title: 'Lenz and power', tex: String.raw`F = B I l = \frac{B^2 l^2 v}{R}, \qquad F v = \frac{\varepsilon^2}{R}` },
    ],
    layers: {},
    solver: { tex: String.raw`\varepsilon(t) = -\frac{d\Phi}{dt} \text{ in closed form}`, note: 'Each setting has Φ(t) in closed form and the EMF is its exact derivative; the bench checks it against a numerical one.' },
  },

  'charges-in-fields': {
    governing: [
      { title: 'Lorentz force', tex: String.raw`\mathbf{F} = q(\mathbf{E} + \mathbf{v}\times\mathbf{B})` },
      { title: 'Cyclotron motion', tex: String.raw`r = \frac{m v_\perp}{|q| B}, \qquad T = \frac{2\pi m}{|q| B}, \qquad \mathbf{v}_{E\times B} = \frac{\mathbf{E}\times\mathbf{B}}{B^2}` },
      { title: 'Velocity selector and spectrometer', tex: String.raw`v = \frac{E}{B}, \qquad r = \frac{m v}{|q| B'}` },
      { title: 'Hall effect', tex: String.raw`v_d = \frac{I}{n q w t}, \qquad V_H = \frac{I B}{n q t}` },
      { title: 'Force on a current, parallel wires', tex: String.raw`\mathbf{F} = I\,\mathbf{L}\times\mathbf{B}, \qquad \frac{F}{L} = \frac{\mu_0 I_1 I_2}{2\pi d}` },
      { title: 'Torque on a loop', tex: String.raw`\mathbf{m} = N I A\,\hat{\mathbf{n}}, \qquad \boldsymbol{\tau} = \mathbf{m}\times\mathbf{B}, \qquad U = -\mathbf{m}\cdot\mathbf{B}` },
    ],
    layers: {},
    solver: { tex: String.raw`\mathbf{v}^{-} = \mathbf{v} + \tfrac{q\Delta t}{2m}\mathbf{E},\quad \mathbf{v}^{+} = \text{rotate}(\mathbf{v}^{-}, \mathbf{B}),\quad \mathbf{v}' = \mathbf{v}^{+} + \tfrac{q\Delta t}{2m}\mathbf{E}`, note: 'The Boris pusher: half an electric kick, an exact rotation by B, half a kick. Energy is conserved exactly in a pure magnetic field; 400 steps per cyclotron period.' },
  },

  'tline-waves': {
    governing: [
      { title: 'Waves on the line', tex: String.raw`V(d) = V^{+}\left(e^{j\beta d} + \Gamma_L e^{-j\beta d}\right), \qquad I(d) = \frac{V^{+}}{Z_0}\left(e^{j\beta d} - \Gamma_L e^{-j\beta d}\right)` },
      { title: 'Reflection and standing-wave ratio', tex: String.raw`\Gamma_L = \frac{Z_L - Z_0}{Z_L + Z_0}, \qquad \text{VSWR} = \frac{1+|\Gamma_L|}{1-|\Gamma_L|} = \frac{V_{max}}{V_{min}}` },
      { title: 'Input impedance', tex: String.raw`Z_{in}(d) = Z_0\,\frac{Z_L + jZ_0\tan\beta d}{Z_0 + jZ_L\tan\beta d}, \qquad Z_{in}(\lambda/4) = \frac{Z_0^2}{Z_L}` },
      { title: 'Power', tex: String.raw`P_{L} = \frac{|V^{+}|^2}{2Z_0}\left(1 - |\Gamma_L|^2\right)` },
      { title: 'Step transient', tex: String.raw`V_1^{+} = \frac{V_s Z_0}{R_s + Z_0}, \qquad \Gamma_s = \frac{R_s - Z_0}{R_s + Z_0}, \qquad T = \frac{l}{v}` },
    ],
    layers: {},
    solver: { tex: String.raw`\beta = \frac{\omega}{v}, \qquad \lambda = \frac{v}{f}`, note: 'Lossless line, closed form. The transient sums the step waves of the bounce diagram.' },
  },

  'plane-waves': {
    governing: [
      { title: 'Wave equation and the plane wave', tex: String.raw`\nabla^2\mathbf{E} = \mu\varepsilon\frac{\partial^2\mathbf{E}}{\partial t^2}, \qquad E_x = E_0 e^{-\alpha z}\cos(\omega t - \beta z), \quad H_y = \frac{E_x}{\eta}` },
      { title: 'Propagation constant and impedance', tex: String.raw`\gamma = \alpha + j\beta = j\omega\sqrt{\mu\left(\varepsilon - j\tfrac{\sigma}{\omega}\right)}, \qquad \eta = \sqrt{\frac{\mu}{\varepsilon - j\sigma/\omega}}` },
      { title: 'Lossless and good-conductor limits', tex: String.raw`v = \frac{1}{\sqrt{\mu\varepsilon}},\ \eta = \sqrt{\frac{\mu}{\varepsilon}}; \qquad \alpha = \beta = \sqrt{\pi f \mu\sigma},\ \delta = \frac{1}{\alpha}` },
      { title: 'Normal incidence', tex: String.raw`\Gamma = \frac{\eta_2 - \eta_1}{\eta_2 + \eta_1}, \qquad \tau = 1 + \Gamma, \qquad \text{SWR} = \frac{1+|\Gamma|}{1-|\Gamma|}` },
      { title: 'Power', tex: String.raw`\langle\mathbf{S}\rangle = \tfrac{1}{2}\,\mathrm{Re}\,(\mathbf{E}\times\mathbf{H}^*) = \frac{|E_0|^2}{2}\,\mathrm{Re}\frac{1}{\eta}\,\hat{\mathbf{z}}` },
      { title: 'Maxwell, full', tex: MAXWELL.faraday },
    ],
    layers: {},
    solver: { tex: String.raw`E(z) = E_0\left(e^{-\gamma_1 z} + \Gamma e^{\gamma_1 z}\right)\ (z<0), \qquad E(z) = \tau E_0 e^{-\gamma_2 z}\ (z>0)`, note: 'Closed form; the Time-varying tab is the same problem by FDTD.' },
  },

  operators: {
    governing: [
      { title: 'Divergence as a limit', tex: String.raw`\nabla\cdot\mathbf{F} = \lim_{A\to 0}\frac{1}{A}\oint_{\partial A}\mathbf{F}\cdot\hat{\mathbf{n}}\,dl = \frac{\partial F_x}{\partial x} + \frac{\partial F_y}{\partial y}` },
      { title: 'Curl as a limit', tex: String.raw`(\nabla\times\mathbf{F})_z = \lim_{A\to 0}\frac{1}{A}\oint_{\partial A}\mathbf{F}\cdot\hat{\mathbf{t}}\,dl = \frac{\partial F_y}{\partial x} - \frac{\partial F_x}{\partial y}` },
      { title: 'Divergence theorem and Stokes', tex: String.raw`\oint_S \mathbf{F}\cdot d\mathbf{S} = \int_V \nabla\cdot\mathbf{F}\,dv, \qquad \oint_C \mathbf{F}\cdot d\mathbf{l} = \int_S (\nabla\times\mathbf{F})\cdot d\mathbf{S}` },
      { title: 'Where they come from', tex: String.raw`\nabla\cdot\mathbf{D} = \rho_v, \qquad \nabla\times\mathbf{H} = \mathbf{J}` },
    ],
    layers: {
      div: { tex: String.raw`\nabla\cdot\mathbf{F}`, note: 'Positive where the field spreads out (a source), negative where it converges (a sink).' },
      curl: { tex: String.raw`(\nabla\times\mathbf{F})_z`, note: 'Positive where a paddle wheel would turn counter-clockwise.' },
      F: { tex: String.raw`\mathbf{F}(x, y)` },
      box: { tex: String.raw`\frac{1}{s^2}\sum \mathbf{F}\cdot\hat{\mathbf{n}}\,\Delta l, \qquad \frac{1}{\pi (s/2)^2}\sum \mathbf{F}\cdot\hat{\mathbf{t}}\,\Delta l`, note: 'Midpoint sums on the box and the loop at the probe.' },
    },
    solver: { tex: String.raw`\text{closed forms for } \mathbf{F}, \nabla\cdot\mathbf{F}, \nabla\times\mathbf{F}`, note: 'Nothing is solved; the point is the definitions.' },
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
      { title: 'Thick-winding reference (filament sum)', tex: String.raw`L = \left(\tfrac{N}{n}\right)^2\Big[\sum_p L_\text{ring}(r_p, \rho) + \sum_{p \ne q} M(r_p, r_q, |z_p - z_q|)\Big], \quad M = \mu_0\sqrt{ab}\left[\left(\tfrac{2}{k}-k\right)K(k) - \tfrac{2}{k}E(k)\right]` },
      { title: 'Saturating core (optional)', tex: String.raw`B(H) = \mu_0 H + B_\text{sat}\tanh\!\left(\frac{\mu_0(\mu_{r0}-1)H}{B_\text{sat}}\right), \qquad \mu_r = \frac{B}{\mu_0 H}` },
    ],
    layers: {
      B: { tex: String.raw`B_r = -\frac{\partial A_\phi}{\partial z}, \qquad B_z = \frac{1}{r}\frac{\partial (r A_\phi)}{\partial r}` },
      mu: { tex: String.raw`\mu_r(|\mathbf{B}|) \text{ from the B–H curve; } \mu_r = \mu_{r0} \text{ when linear}` },
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
  'gauss-law': {
    governing: [
      { title: "Gauss's law (integral form)", tex: String.raw`\oint_S \mathbf{E}\cdot d\mathbf{A} = \frac{Q_\text{enc}}{\varepsilon_0}` },
      { title: 'Differential form', tex: String.raw`\nabla \cdot \mathbf{E} = \frac{\rho_v}{\varepsilon_0}` },
      { title: 'Coulomb field used for E', tex: String.raw`\mathbf{E}(\mathbf{r}) = \sum_k \frac{q_k}{4\pi\varepsilon_0}\frac{\mathbf{r}-\mathbf{r}_k}{|\mathbf{r}-\mathbf{r}_k|^3}` },
    ],
    layers: {
      En: { tex: String.raw`\Phi \approx \sum_\text{patches} (\mathbf{E}\cdot\hat{\mathbf{n}})\,\Delta A`, note: 'The colour on the surface is E·n; the flux is its sum over the patches.' },
      E: { tex: String.raw`\mathbf{E} = -\nabla V` },
    },
  },

  interface: {
    governing: [
      { title: 'Electric: tangential E, normal D', tex: String.raw`E_{1t} = E_{2t}, \qquad D_{2n} - D_{1n} = \rho_s` },
      { title: 'Refraction of E lines (ρs = 0)', tex: String.raw`\frac{\tan\theta_2}{\tan\theta_1} = \frac{\varepsilon_2}{\varepsilon_1}` },
      { title: 'Perfect conductor', tex: String.raw`\mathbf{E}_2 = 0, \qquad E_{1t} = 0, \qquad \rho_s = D_{2n} - D_{1n} = -D_{1n}\ (\hat{\mathbf{n}}\text{ into the conductor})` },
      { title: 'Magnetic: normal B, tangential H', tex: String.raw`B_{1n} = B_{2n}, \qquad \hat{\mathbf{n}}\times(\mathbf{H}_2-\mathbf{H}_1) = \mathbf{K}\ \Rightarrow\ H_{2t} = H_{1t} + K, \qquad \frac{\tan\theta_2}{\tan\theta_1} = \frac{\mu_2}{\mu_1}\ (K = 0)` },
      { title: 'Bound surface charge', tex: String.raw`\rho_{sb} = (\mathbf{P}_1 - \mathbf{P}_2)\cdot\hat{\mathbf{n}}, \qquad \mathbf{P} = (\varepsilon_r - 1)\varepsilon_0\mathbf{E}` },
    ],
    layers: {
      V: { tex: String.raw`V = -\int \mathbf{E}\cdot d\mathbf{l} \text{ (continuous across the interface)}` },
      E: { tex: String.raw`\mathbf{E} = -\nabla V` },
      D: { tex: String.raw`\mathbf{D} = \varepsilon \mathbf{E} = \varepsilon_0\mathbf{E} + \mathbf{P}` },
      P: { tex: String.raw`\mathbf{P} = (\varepsilon_r - 1)\varepsilon_0\mathbf{E}, \qquad \mathbf{M} = (\mu_r - 1)\mathbf{H}` },
    },
  },

  'transmission-lines': {
    governing: [
      { title: 'Per-unit-length parameters', tex: String.raw`C' = \frac{\lambda}{V}, \qquad L' = \frac{\Phi'}{I}, \qquad L'C' = \mu\varepsilon \ \text{(any TEM line)}` },
      { title: 'Characteristic impedance and velocity', tex: String.raw`Z_0 = \sqrt{\frac{L'}{C'}}, \qquad v = \frac{1}{\sqrt{L'C'}} = \frac{c}{\sqrt{\varepsilon_r}}` },
      { title: 'Coaxial line', tex: String.raw`C' = \frac{2\pi\varepsilon}{\ln(b/a)}, \qquad L' = \frac{\mu_0}{2\pi}\ln\frac{b}{a}, \qquad Z_0 = \frac{60\,\Omega}{\sqrt{\varepsilon_r}}\ln\frac{b}{a}` },
      { title: 'Twin-lead (two wires, exact)', tex: String.raw`C' = \frac{\pi\varepsilon}{\cosh^{-1}(d/2a)}, \qquad Z_0 = \frac{120\,\Omega}{\sqrt{\varepsilon_r}}\cosh^{-1}\frac{d}{2a}` },
      { title: 'Parallel plates (ideal)', tex: String.raw`C' \approx \frac{\varepsilon w}{d}, \qquad Z_0 \approx \frac{d}{w}\sqrt{\frac{\mu}{\varepsilon}}` },
    ],
    layers: {
      V: { tex: String.raw`\text{coax: } V(r) = V_0\frac{\ln(b/r)}{\ln(b/a)}, \qquad \text{two wires: } V = \frac{\lambda}{2\pi\varepsilon}\ln\frac{r_-}{r_+}` },
      E: { tex: String.raw`\mathbf{E} = -\nabla V, \qquad \text{coax: } E_r = \frac{V_0}{r\ln(b/a)}` },
      D: { tex: String.raw`\mathbf{D} = \varepsilon_0\varepsilon_r\mathbf{E}, \qquad \lambda = \oint \mathbf{D}\cdot\hat{\mathbf{n}}\, dl` },
    },
    solver: { tex: String.raw`V_{i,j} \leftarrow \tfrac{1}{4}\left(V_{i+1,j} + V_{i-1,j} + V_{i,j+1} + V_{i,j-1}\right), \qquad C' = \frac{1}{V}\oint \mathbf{D}\cdot\hat{\mathbf{n}}\, dl` },
  },

  eddy: {
    governing: [
      { title: 'Quasi-static Maxwell (no displacement current)', tex: String.raw`\nabla\times\mathbf{H} = \mathbf{J}_s + \mathbf{J}_e, \qquad \nabla\times\mathbf{E} = -\frac{\partial\mathbf{B}}{\partial t}, \qquad \mathbf{J}_e = \sigma\mathbf{E} = -\sigma\frac{\partial\mathbf{A}}{\partial t}` },
      { title: 'Magnetic diffusion for the phasor ψ = rA_φ', tex: String.raw`\frac{\partial}{\partial r}\!\left(\frac{1}{\mu r}\frac{\partial\psi}{\partial r}\right) + \frac{\partial}{\partial z}\!\left(\frac{1}{\mu r}\frac{\partial\psi}{\partial z}\right) = -\mu_0 J_s + \frac{j\omega\sigma}{r}\,\psi` },
      { title: 'Skin depth', tex: String.raw`\delta = \sqrt{\frac{2}{\omega\mu\sigma}}` },
      { title: 'Coil impedance from the complex flux linkage', tex: String.raw`\Lambda = \frac{1}{I}\int \mathbf{J}_s\cdot\mathbf{A}\,dv, \qquad Z = \frac{j\omega\Lambda}{I} = R_\text{eddy} + j\omega L` },
      { title: 'Long cylinder in a uniform axial field (reference)', tex: String.raw`\frac{B_z(r)}{B_0} = \frac{J_0(\alpha r)}{J_0(\alpha a)}, \qquad \alpha = \frac{1-j}{\delta}` },
    ],
    layers: {
      B: { tex: String.raw`\mathbf{B} = \nabla\times\mathbf{A}; \quad \text{shown: } |\mathbf{B}|, \ \arg B_z, \ \mathrm{Re}[\mathbf{B}e^{j\omega t}]` },
      Je: { tex: String.raw`\mathbf{J}_e = -j\omega\sigma\mathbf{A} = -\frac{j\omega\sigma}{r}\,\psi\,\hat{\boldsymbol{\phi}}` },
      P: { tex: String.raw`\langle p\rangle = \frac{|J_e|^2}{2\sigma}, \qquad P = \int\langle p\rangle\,dv = \tfrac{1}{2}R_\text{eddy}I^2` },
    },
    solver: { tex: String.raw`\psi_{i,j} = \frac{\sum_n c_n\psi_n + \mu_0 h^2 J_{i,j}}{\sum_n c_n + j\,\omega\sigma\mu_0 h^2/r_i}, \qquad c_n = \frac{1}{\mu_{r,\text{face}}\, r_\text{face}}`, note: 'The same neighbour average as the Inductors tab, with a complex diagonal: the real and imaginary parts of ψ are swept together.' },
  },

  fdtd: {
    governing: [
      { title: 'Faraday', tex: MAXWELL.faraday },
      { title: 'Ampère, with the displacement current on', tex: MAXWELL.ampere, note: 'Here J = σE only (no impressed current); the source is added to E_z directly.' },
      { title: 'TMz in two dimensions (E along z, H in the plane)', tex: String.raw`\frac{\partial H_x}{\partial t} = -\frac{1}{\mu_0}\frac{\partial E_z}{\partial y}, \qquad \frac{\partial H_y}{\partial t} = \frac{1}{\mu_0}\frac{\partial E_z}{\partial x}, \qquad \varepsilon\frac{\partial E_z}{\partial t} = \frac{\partial H_y}{\partial x} - \frac{\partial H_x}{\partial y} - \sigma E_z` },
      { title: 'Wave speed and impedance', tex: String.raw`v = \frac{1}{\sqrt{\mu_0\varepsilon}} = \frac{c}{\sqrt{\varepsilon_r}}, \qquad \eta = \sqrt{\mu_0/\varepsilon}` },
      { title: 'Reflection at a dielectric step (normal incidence)', tex: String.raw`\Gamma = \frac{\eta_2-\eta_1}{\eta_2+\eta_1} = \frac{1-n}{1+n}, \qquad \tau = 1 + \Gamma` },
      { title: 'Courant stability limit', tex: String.raw`c\,\Delta t \le \frac{h}{\sqrt{2}} \quad (\text{used: } c\,\Delta t = 0.99\,h/\sqrt{2})` },
    ],
    layers: {
      E: { tex: String.raw`{E_z}^{\,n+1}_{i,j} = c_a {E_z}^{\,n}_{i,j} + c_b\left[({H_y}^{\,n+\frac12}_{i+\frac12,j} - {H_y}^{\,n+\frac12}_{i-\frac12,j}) - ({H_x}^{\,n+\frac12}_{i,j+\frac12} - {H_x}^{\,n+\frac12}_{i,j-\frac12})\right]`, note: 'c_a = (1 − σΔt/2ε)/(1 + σΔt/2ε), c_b = (Δt/εh)/(1 + σΔt/2ε): the Yee update of E from the curl of H.' },
      H: { tex: String.raw`{H_x}^{\,n+\frac12}_{i,j+\frac12} = {H_x}^{\,n-\frac12}_{i,j+\frac12} - \frac{\Delta t}{\mu_0 h}\left({E_z}^{\,n}_{i,j+1} - {E_z}^{\,n}_{i,j}\right), \qquad {H_y}^{\,n+\frac12}_{i+\frac12,j} = {H_y}^{\,n-\frac12}_{i+\frac12,j} + \frac{\Delta t}{\mu_0 h}\left({E_z}^{\,n}_{i+1,j} - {E_z}^{\,n}_{i,j}\right)`, note: 'H sits half a cell and half a time step away from E: leap-frog.' },
      S: { tex: String.raw`\mathbf{S} = \mathbf{E}\times\mathbf{H}, \qquad |\mathbf{S}| = |E_z|\,|\mathbf{H}| \quad (\mathbf{E} \perp \mathbf{H})`, note: 'Instantaneous power flow per unit area.' },
    },
    solver: { tex: String.raw`\text{Mur: } E^{\,n+1}_{0} = E^{\,n}_{1} + \frac{c\Delta t - h}{c\Delta t + h}\left(E^{\,n+1}_{1} - E^{\,n}_{0}\right); \qquad \text{PML: } \frac{\partial}{\partial x} \to \frac{1}{1 + \sigma_x(x)/(j\omega\varepsilon_0)}\frac{\partial}{\partial x}, \quad \sigma_x = \sigma_{\max}\left(\tfrac{d}{L}\right)^3`, note: 'Open walls: either the one-cell Mur extrapolation or a 10-cell perfectly matched layer, a graded lossy medium whose impedance matches the interior at every angle of incidence.' },
  },
};

/** Convenience: the governing list plus the layer entries for the layers switched on. */
export const ALIASES = { 'point-charges-3d': 'point-charges', 'ring-charge': 'ring-line', 'line-charge': 'ring-line' };

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
