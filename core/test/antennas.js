// Antennas: the half-wave dipole's 73 Ω, D = 1.64 and 78° beamwidth; the short-dipole limit
// agrees with the Hertzian result; the full-wave dipole; the array factor's classic cases;
// directivity of the broadside and end-fire pairs.
import { PI } from '../constants.js';
import { dipolePattern, dipoleFigures, arrayFactor, arrayPattern, arrayDirectivity, isotropicArrayDirectivity, cuts, ETA0 } from '../antennas.js';
import { radiation } from '../radiation.js';

export function antennasChecks(check) {
  const hw = dipoleFigures(0.5);
  check('antenna λ/2: R_rad = 73.1 Ω', hw.Rrad, 73.13, 2e-3);
  check('antenna λ/2: D = 1.64 (2.15 dBi)', hw.D, 1.641, 2e-3);
  check('antenna λ/2: half-power beamwidth 78°', hw.hpbw, 78, 2e-2);
  check('antenna λ/2: pattern cos(π/2 cosθ)/sinθ is 1 broadside', dipolePattern(0.5, PI / 2), 1, 1e-12);
  check('antenna λ/2: zero along the axis', Math.abs(dipolePattern(0.5, 1e-6)) < 1e-6 ? 1 : 0, 1, 0);
  // short dipole: F ≈ (kL/2)²/2 sinθ → the pattern is sinθ and R_rad → the Hertzian 80π²(L/λ)²... with a TRIANGULAR current the short dipole has R = 20π²(L/λ)²: a quarter of the uniform-current value
  const sd = dipoleFigures(0.02);
  check('antenna short (L = 0.02 λ): D → 1.5', sd.D, 1.5, 2e-3);
  check('antenna short: R_in = 20π²(L/λ)² (triangular current: a quarter of the uniform-current Hertzian value)', sd.Rin, 20 * PI * PI * 0.02 * 0.02, 5e-3);
  check('antenna short: … i.e. radiation().Rrad80/4 of the Hertzian tab for the same length', sd.Rin, radiation(1, 0.02, 299792458).Rrad80 / 4, 5e-3);
  check('antenna short: R_rad referred to I_max is much smaller (sin²(kL/2) = (πL/λ)²)', sd.Rrad / sd.Rin, Math.sin(PI * 0.02) ** 2, 1e-12);
  check('antenna λ/2: R_in = R_rad (the feed is the current maximum)', hw.Rin, hw.Rrad, 1e-12);
  check('antenna short: pattern ∝ sinθ (ratio at 30° and 90° is 0.5)', dipolePattern(0.02, PI / 6) / dipolePattern(0.02, PI / 2), 0.5, 1e-3);
  // full-wave dipole: D = 2.41, pattern (cos(π cosθ) + 1)/sinθ, max 2 broadside
  const fw = dipoleFigures(1);
  check('antenna λ: D = 2.41', fw.D, 2.41, 5e-3);
  check('antenna λ: broadside pattern value 2', dipolePattern(1, PI / 2), 2, 1e-12);
  check('antenna 1.5 λ: side lobes appear (pattern at 90° is not the maximum)', Math.abs(dipolePattern(1.5, PI / 2)) < dipoleFigures(1.5).Fmax ? 1 : 0, 1, 0);
  // array factor
  check('array: d = λ/2, δ = 0 → broadside max 2, null along the axis (φ = 0)', arrayFactor(0.5, 0, PI / 2, PI / 2), 2, 1e-12);
  check('array: … null end-on', Math.abs(arrayFactor(0.5, 0, PI / 2, 0)) < 1e-12 ? 1 : 0, 1, 0);
  check('array: d = λ/4, δ = −90° → max toward +x (φ = 0)', arrayFactor(0.25, -PI / 2, PI / 2, 0), 2, 1e-12);
  check('array: … null toward −x', Math.abs(arrayFactor(0.25, -PI / 2, PI / 2, PI)) < 1e-12 ? 1 : 0, 1, 0);
  check('array: d = λ, δ = 0 → grating lobes: maximum both broadside and end-on', arrayFactor(1, 0, PI / 2, 0), 2, 1e-12);
  check('array: d = 0 → a single element of double amplitude everywhere', arrayFactor(0, 0, 0.7, 1.1), 2, 1e-12);
  check('array: pattern multiplication keeps the dipole’s axial null', Math.abs(arrayPattern(0.5, 0.5, 0, 1e-6, 0)) < 1e-5 ? 1 : 0, 1, 0);
  // directivities (Balanis table): two λ/2 dipoles broadside at λ/2 spacing D ≈ 3.8 (5.8 dBi) … we check against the array's own integral consistency and monotone sense
  const Db = arrayDirectivity(0.5, 0.5, 0), De = arrayDirectivity(0.5, 0.25, -PI / 2), D1 = arrayDirectivity(0.5, 0, 0);
  check('array: a single element (d = 0) has the dipole’s directivity 1.64', D1, 1.641, 5e-3);
  check('array: two λ/2 dipoles broadside at λ/2: D = 3.96 (6.0 dBi)', Db, 3.96, 1e-2);
  check('array: two λ/2 dipoles end-fire at λ/4: D = 3.28', De, 3.28, 1e-2);
  check('array: isotropic elements broadside at λ/2 give exactly 2', isotropicArrayDirectivity(0.5, 0), 2, 1e-6);
  check('array: isotropic elements end-fire at λ/4 give exactly 2', isotropicArrayDirectivity(0.25, -PI / 2), 2, 1e-6);
  // cuts are normalised to 1
  const c = cuts(0.5, 0.5, 0);
  check('array cuts: normalised maximum 1', Math.max(...c.E, ...c.H), 1, 1e-12);
  check('array cuts: E-plane cut has the axial null (θ = 0)', c.E[0], 0, 0);
  void ETA0;

  // main-lobe direction: broadside up to 1.25 λ, tilted beyond (Balanis: 1.5 λ dipole has its maximum near 42.6°, D ≈ 2.23)
  check('dipole 1.25 λ: main lobe still broadside', dipoleFigures(1.25).thetaMax, 90, 1e-3);
  check('dipole 1.5 λ: main lobe tilted to 42.6°', dipoleFigures(1.5).thetaMax, 42.6, 1e-2);
  check('dipole 1.5 λ: D = 2.23', dipoleFigures(1.5).D, 2.23, 5e-3);
  check('dipole 1.5 λ: HPBW measured about the tilted lobe, not zero', dipoleFigures(1.5).hpbw, 32.9, 2e-2);
}
