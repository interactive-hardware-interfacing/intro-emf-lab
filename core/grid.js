// Grid2D: a uniform rectangular grid of Float64 values over a physical extent.
// Used for scalar fields (V, |B|, A_z) and, as a pair, for vector fields.
// Index convention: data[j * nx + i], i along x, j along y. Row j = 0 is y = ymin.

export class Grid2D {
  /**
   * @param {number} nx  number of samples along x
   * @param {number} ny  number of samples along y
   * @param {[number, number, number, number]} extent  [xmin, xmax, ymin, ymax] in metres
   * @param {Float64Array=} data  optional existing buffer of length nx*ny
   */
  constructor(nx, ny, extent, data) {
    this.nx = nx;
    this.ny = ny;
    this.extent = extent;
    this.data = data ?? new Float64Array(nx * ny);
    this.dx = (extent[1] - extent[0]) / (nx - 1);
    this.dy = (extent[3] - extent[2]) / (ny - 1);
  }

  /** Physical x coordinate of column i. */
  x(i) { return this.extent[0] + i * this.dx; }
  /** Physical y coordinate of row j. */
  y(j) { return this.extent[2] + j * this.dy; }

  get(i, j) { return this.data[j * this.nx + i]; }
  set(i, j, v) { this.data[j * this.nx + i] = v; }

  /** Fill the grid by evaluating f(x, y) at every node. */
  fill(f) {
    const { nx, ny, data } = this;
    for (let j = 0; j < ny; j++) {
      const y = this.y(j);
      for (let i = 0; i < nx; i++) data[j * nx + i] = f(this.x(i), y);
    }
    return this;
  }

  static fromFunction(nx, ny, extent, f) {
    return new Grid2D(nx, ny, extent).fill(f);
  }

  /** Bilinear interpolation at physical (x, y). Clamps to the grid edge. */
  sample(x, y) {
    const { nx, ny, extent, dx, dy, data } = this;
    let fx = (x - extent[0]) / dx;
    let fy = (y - extent[2]) / dy;
    fx = Math.min(Math.max(fx, 0), nx - 1);
    fy = Math.min(Math.max(fy, 0), ny - 1);
    const i0 = Math.min(Math.floor(fx), nx - 2);
    const j0 = Math.min(Math.floor(fy), ny - 2);
    const tx = fx - i0;
    const ty = fy - j0;
    const a = data[j0 * nx + i0];
    const b = data[j0 * nx + i0 + 1];
    const c = data[(j0 + 1) * nx + i0];
    const d = data[(j0 + 1) * nx + i0 + 1];
    return (1 - ty) * ((1 - tx) * a + tx * b) + ty * ((1 - tx) * c + tx * d);
  }

  /**
   * Central-difference gradient at node (i, j); one-sided at the edges.
   * Returns [dV/dx, dV/dy].
   */
  gradientAt(i, j) {
    const { nx, ny, dx, dy } = this;
    const gx = i === 0 ? (this.get(1, j) - this.get(0, j)) / dx
      : i === nx - 1 ? (this.get(nx - 1, j) - this.get(nx - 2, j)) / dx
      : (this.get(i + 1, j) - this.get(i - 1, j)) / (2 * dx);
    const gy = j === 0 ? (this.get(i, 1) - this.get(i, 0)) / dy
      : j === ny - 1 ? (this.get(i, ny - 1) - this.get(i, ny - 2)) / dy
      : (this.get(i, j + 1) - this.get(i, j - 1)) / (2 * dy);
    return [gx, gy];
  }

  /** Two new grids holding -dV/dx and -dV/dy, i.e. E = -grad V. */
  negGradient() {
    const ex = new Grid2D(this.nx, this.ny, this.extent);
    const ey = new Grid2D(this.nx, this.ny, this.extent);
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const [gx, gy] = this.gradientAt(i, j);
        ex.set(i, j, -gx);
        ey.set(i, j, -gy);
      }
    }
    return [ex, ey];
  }

  /** Min and max over the grid, ignoring non-finite values. */
  range() {
    let lo = Infinity, hi = -Infinity;
    for (const v of this.data) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }

  /** Comma-separated rows (y down the rows, x across), with a header. */
  toCSV(name = 'value') {
    const lines = ['x_m,y_m,' + name];
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        lines.push(`${this.x(i)},${this.y(j)},${this.get(i, j)}`);
      }
    }
    return lines.join('\n');
  }
}

/** Magnitude grid sqrt(a^2 + b^2) from two component grids. */
export function magnitude(a, b) {
  const out = new Grid2D(a.nx, a.ny, a.extent);
  for (let k = 0; k < a.data.length; k++) out.data[k] = Math.hypot(a.data[k], b.data[k]);
  return out;
}
