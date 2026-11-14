// The tab registry: the order here is the order in the tab bar. main.js boots from it and
// the bench lints it, so a new tab is added in exactly one place.
import about from './about.js';
import pointCharges from './point-charges.js';
import pointCharges3d from './point-charges-3d.js';
import { makeTab as makeRingLine } from './ring-line.js';
import capacitors from './capacitors.js';
import dielectrics from './dielectrics.js';
import conduction from './conduction.js';
import magneticFields from './magnetic-fields.js';
import inductors from './inductors.js';
import sandbox from './sandbox.js';
import gaussLaw from './gauss-law.js';
import ampere from './ampere.js';
import solenoids from './solenoids.js';
import filters from './filters.js';
import interfaceTab from './interface.js';
import transmissionLines from './transmission-lines.js';
import fdtd from './fdtd.js';
import eddy from './eddy.js';

/** Topic groups, in tab-bar order. A tab belongs to exactly one group; the bench checks that. */
export const GROUPS = [
  { label: '', tabs: [about] },
  { label: 'Electrostatics', tabs: [pointCharges, pointCharges3d, makeRingLine('ring'), makeRingLine('rods'), gaussLaw, interfaceTab, capacitors, dielectrics] },
  { label: 'Currents & circuits', tabs: [conduction, filters] },
  { label: 'Magnetostatics', tabs: [magneticFields, ampere, solenoids, inductors] },
  { label: 'Induction', tabs: [eddy] },
  { label: 'Waves', tabs: [transmissionLines, fdtd] },
  { label: 'Tools', tabs: [sandbox] },
];

export const TABS = GROUPS.flatMap((g) => g.tabs.map((tab) => { tab.group = g.label; return tab; }));
