// Cut-plane control for closed-form 3D fields: choose XY / XZ / YZ and the offset of the
// plane along the third axis. Maps the 2D canvas coordinates (u, v) to a 3D point and a
// 3D vector back to its in-plane components. This is the "2D cut / 3D view" toggle of the
// build plan: the field is always computed in 3D; the plane is only what is drawn.

import { ui } from './shell.js';

export const PLANES = {
  xy: { axes: ['x', 'y'], normal: 'z', toXYZ: (u, v, w) => [u, v, w], inPlane: (f) => [f[0], f[1]], normalComp: (f) => f[2] },
  xz: { axes: ['x', 'z'], normal: 'y', toXYZ: (u, v, w) => [u, w, v], inPlane: (f) => [f[0], f[2]], normalComp: (f) => f[1] },
  yz: { axes: ['y', 'z'], normal: 'x', toXYZ: (u, v, w) => [w, u, v], inPlane: (f) => [f[1], f[2]], normalComp: (f) => f[0] },
};

export class CutPlane {
  /**
   * @param {object} opts { plane: 'xy', offset: 0, range: [min, max] of the offset,
   *   extents: { xy: [...], xz: [...], yz: [...] } physical extents per plane }
   */
  constructor({ plane = 'xy', offset = 0, range = [-0.5, 0.5], extents }) {
    this.plane = PLANES[plane] ? plane : 'xy';
    this.offset = offset;
    this.range = range;
    this.extents = extents;
  }
  get def() { return PLANES[this.plane]; }
  get axes() { return this.def.axes; }
  get extent() { return this.extents[this.plane]; }
  /** canvas (u, v) -> 3D point */
  point(u, v) { return this.def.toXYZ(u, v, this.offset); }
  /** 3D vector -> [in-plane u, in-plane v] */
  inPlane(f) { return this.def.inPlane(f); }
  normalComp(f) { return this.def.normalComp(f); }

  /** Build the control row. onChange() is called after plane or offset changes. */
  controls(onChange) {
    const box = ui.el('div', 'row');
    const sel = ui.select([['xy', 'XY plane'], ['xz', 'XZ plane'], ['yz', 'YZ plane']], this.plane, (v) => { this.plane = v; onChange('plane'); });
    box.appendChild(ui.field('Cut plane', sel));
    const off = ui.number(this.offset, { min: this.range[0], max: this.range[1], onChange: (v) => { this.offset = v; if (this.slider) this.slider.value = String(v); onChange('offset'); } });
    this.offsetInput = off;
    this.offsetLabel = ui.field(`${this.def.normal} offset (m)`, off);
    box.appendChild(this.offsetLabel);
    const slider = ui.range(this.offset, { min: this.range[0], max: this.range[1], step: (this.range[1] - this.range[0]) / 100, ariaLabel: 'cut-plane offset (m)', onInput: (v) => { this.offset = v; off.value = String(Number(v.toPrecision(4))); onChange('offset'); } });
    this.slider = slider;
    const wrap = ui.el('div', '');
    wrap.style.flexBasis = '100%';
    wrap.appendChild(slider);
    box.appendChild(wrap);
    return box;
  }

  /** Keep the label in sync after the plane changes. */
  refreshLabel() {
    if (this.offsetLabel) this.offsetLabel.firstChild.textContent = `${this.def.normal} offset (m)`;
  }

  state() { return { plane: this.plane, off: this.offset }; }
}
