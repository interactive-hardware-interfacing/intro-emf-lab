// Mirror an (r, z) grid across the axis so an axisymmetric solution can be shown as the
// full cross-section (x = -r ... +r) rather than the half-plane. Scalars are even in r;
// the r-component of a vector is odd (flip = true).

import { Grid2D } from '../core/grid.js';

export function mirrorGrid(g, flip = false) {
  const nr = g.nx, nz = g.ny;
  const out = new Grid2D(2 * nr - 1, nz, [-g.extent[1], g.extent[1], g.extent[2], g.extent[3]]);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nr; i++) {
      const v = g.get(i, j);
      out.set(nr - 1 + i, j, v);
      out.set(nr - 1 - i, j, flip ? -v : v);
    }
  }
  return out;
}
