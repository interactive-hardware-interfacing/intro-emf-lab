// Hertzian-dipole checks: the far field has E/H = η₀ and the textbook amplitude; the exact
// fields carry the same power through every sphere and that power is ½I₀²R_rad; the near
// field is the static dipole; the two R_rad forms agree; the pattern and directivity.
import { PI, EPS0 } from '../constants.js';
import { ETA0 } from '../planewave.js';
import { wavenumber, hertzFields, farFields, instantaneous, streamPsi, poyntingAvg, radiation, pattern, nearFarBoundary } from '../radiation.js';

export function radiationChecks(check) {
  const I0 = 1, dl = 0.01, f = 300e6, { k, lambda } = wavenumber(f);
  check('radiation λ at 300 MHz ≈ 1 m', lambda, 0.999308, 1e-5);
  check('radiation k = 2π/λ', k, (2 * PI) / lambda, 1e-12);
  check('radiation near/far boundary λ/2π', nearFarBoundary(f), lambda / (2 * PI), 1e-12);

  // far field: E/H → η₀, textbook amplitude, E_r negligible
  const far = hertzFields(I0, dl, f, 10 * lambda, PI / 2);
  check('radiation far field: |E_θ|/|H_φ| → η₀ within 0.05 % at 10λ (the 1/(kr)² term)', Math.hypot(...far.Eth) / Math.hypot(...far.Hph), ETA0, 5e-4);
  check('radiation far field: |E_θ| = ηkI₀dl/4πr within 0.02 %', Math.hypot(...far.Eth), (ETA0 * k * I0 * dl) / (4 * PI * 10 * lambda), 2e-4);
  check('radiation far field: E_r/E_θ small (~1/kr)', Math.hypot(...far.Er) / Math.hypot(...far.Eth) < 0.05 ? 1 : 0, 1, 0);
  const ff = farFields(I0, dl, f, 10 * lambda, PI / 2);
  check('radiation farFields: closed form agrees with exact at 10λ', Math.hypot(...ff.Eth), Math.hypot(...far.Eth), 2e-4);
  check('radiation farFields: E_r is exactly zero', ff.Er[0] === 0 && ff.Er[1] === 0 ? 1 : 0, 1, 0);

  // near field: E_r is the static dipole field of p = I0 dl / (jω)
  const r0 = lambda / 200, nf = hertzFields(I0, dl, f, r0, 0);
  const pStatic = (I0 * dl) / (2 * PI * f), Erstatic = (2 * pStatic) / (4 * PI * EPS0 * r0 ** 3);
  check('radiation near field: |E_r| on axis = static dipole 2p/4πε₀r³ within 0.1 % at r = λ/200', Math.hypot(...nf.Er), Erstatic, 1e-3);
  const nf45 = hertzFields(I0, dl, f, r0, PI / 4);
  check('radiation near field: E_r/E_θ = 2cosθ/sinθ at θ = 45°', Math.hypot(...nf45.Er) / Math.hypot(...nf45.Eth), 2, 1e-3);

  // power through spheres: the same at λ/10, λ and 10λ, and equal to ½I₀²R_rad
  const sphere = (r) => { const n = 2000; let P = 0; for (let i = 0; i < n; i++) { const th = ((i + 0.5) * PI) / n; P += poyntingAvg(I0, dl, f, r, th) * 2 * PI * r * r * Math.sin(th) * (PI / n); } return P; };
  const { Rrad, Rrad80, Prad, directivity } = radiation(I0, dl, f);
  const P1 = sphere(lambda / 10), P2 = sphere(lambda), P3 = sphere(10 * lambda);
  check('radiation power: sphere at λ/10 equals sphere at λ', P1, P2, 1e-6);
  check('radiation power: sphere at λ equals sphere at 10λ', P2, P3, 1e-6);
  check('radiation power: through a sphere = ½I₀²R_rad', P2, Prad, 1e-5);
  check('radiation R_rad = η(k dl)²/6π for dl = λ/100: ≈ 0.079 Ω', Rrad, (ETA0 * (k * dl) ** 2) / (6 * PI), 1e-12);
  check('radiation R_rad: 80π²(dl/λ)² agrees to 0.1 %', Rrad80, Rrad, 1e-3);
  check('radiation directivity 1.5', directivity, 1.5, 0);
  check('radiation P_rad scales as I₀²', radiation(2, dl, f).Prad, 4 * Prad, 1e-12);
  check('radiation P_rad scales as (dl)²', radiation(I0, 2 * dl, f).Prad, 4 * Prad, 1e-12);
  check('radiation P_rad scales as f²', radiation(I0, dl, 2 * f).Prad, 4 * Prad, 1e-9);

  // pattern and the Poynting vector's angular dependence
  check('radiation pattern: sin²θ at 90° is 1', pattern(PI / 2), 1, 1e-12);
  check('radiation pattern: zero on the axis', pattern(0) < 1e-30 ? 1 : 0, 1, 0);
  check('radiation pattern: half power at 45°', pattern(PI / 4), 0.5, 1e-12);
  check('radiation S_r far: ∝ sin²θ', poyntingAvg(I0, dl, f, 20 * lambda, PI / 6) / poyntingAvg(I0, dl, f, 20 * lambda, PI / 2), 0.25, 1e-3);
  check('radiation S_r far: ∝ 1/r²', poyntingAvg(I0, dl, f, 40 * lambda, PI / 2) / poyntingAvg(I0, dl, f, 20 * lambda, PI / 2), 0.25, 1e-4);
  check('radiation S_r far: = |E_θ|²/2η₀', poyntingAvg(I0, dl, f, 20 * lambda, PI / 2), Math.hypot(...hertzFields(I0, dl, f, 20 * lambda, PI / 2).Eth) ** 2 / (2 * ETA0), 1e-3);

  // instantaneous fields and the stream function
  const T = 1 / f, inst0 = instantaneous(I0, dl, f, 2 * lambda, PI / 2, 0), instT = instantaneous(I0, dl, f, 2 * lambda, PI / 2, T);
  check('radiation instantaneous: periodic in T', inst0.Eth, instT.Eth, 1e-9);
  const instHalf = instantaneous(I0, dl, f, 2 * lambda, PI / 2, T / 2);
  check('radiation instantaneous: flips sign after T/2', inst0.Eth, -instHalf.Eth, 1e-9);
  check('radiation instantaneous: far field E_θ/H_φ = η₀ at every instant', inst0.Eth / inst0.Hph, ETA0, 1e-3);
  check('radiation streamPsi: zero on the axis', Math.abs(streamPsi(I0, dl, f, lambda, 0, 0)) < 1e-30 ? 1 : 0, 1, 0);
  // the drawn lines are the lines of E itself: E(t) ∥ (∂ψ/∂θ / r², −∂ψ/∂r / r) at several points and times
  {
    let worst = 0;
    for (const t of [0, 0.3e-9, 1.1e-9]) for (const [r, th] of [[lambda / 20, 1], [lambda / 3, 0.7], [lambda, 1.2], [2.5 * lambda, 0.4]]) {
      const h = 1e-7, dpr = (streamPsi(I0, dl, f, r + h, th, t) - streamPsi(I0, dl, f, r - h, th, t)) / (2 * h), dpt = (streamPsi(I0, dl, f, r, th + h, t) - streamPsi(I0, dl, f, r, th - h, t)) / (2 * h);
      const vr = dpt / (r * r * Math.sin(th)), vth = -dpr / (r * Math.sin(th)), E = instantaneous(I0, dl, f, r, th, t);
      worst = Math.max(worst, Math.abs(E.Er * vth - E.Eth * vr) / (Math.hypot(E.Er, E.Eth) * Math.hypot(vr, vth)));
    }
    check('radiation streamPsi: the instantaneous E is tangent to its level curves (|sin ∠| < 1e-6 at 12 points and times)', worst < 1e-6 ? 1 : 0, 1, 0);
    // and the lines of r sinθ Re[H_φ e^{jωt}] would not be: they belong to ∂E/∂t
    const r = lambda / 3, th = 0.7, t = 0.3e-9, h = 1e-7, reP = (rr, tt) => { const F = hertzFields(I0, dl, f, rr, tt); return rr * Math.sin(tt) * (F.Hph[0] * Math.cos(2 * PI * f * t) - F.Hph[1] * Math.sin(2 * PI * f * t)); };
    const dpr = (reP(r + h, th) - reP(r - h, th)) / (2 * h), dpt = (reP(r, th + h) - reP(r, th - h)) / (2 * h), vr = dpt / (r * r * Math.sin(th)), vth = -dpr / (r * Math.sin(th)), E = instantaneous(I0, dl, f, r, th, t);
    check('radiation streamPsi: contours of Re[H_φ e^{jωt}] are NOT the E lines (angle well off)', Math.abs(E.Er * vth - E.Eth * vr) / (Math.hypot(E.Er, E.Eth) * Math.hypot(vr, vth)) > 0.1 ? 1 : 0, 1, 0);
  }
  // r sinθ H_φ ∝ cos(ωt − kr + …) far out, so ψ(r + λ/2) = −ψ(r) up to the 1/(kr) correction
  check('radiation streamPsi: far out ψ(r + λ/2) = −ψ(r) within 3 %', streamPsi(I0, dl, f, 20 * lambda, PI / 2, 0) / streamPsi(I0, dl, f, 20.5 * lambda, PI / 2, 0), -1, 0.03);
}
