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
import interfaceTab from './interface.js';
import transmissionLines from './transmission-lines.js';
import fdtd from './fdtd.js';
import eddy from './eddy.js';

export const TABS = [
  about,
  pointCharges,
  pointCharges3d,
  makeRingLine('ring'),
  makeRingLine('rods'),
  capacitors,
  dielectrics,
  conduction,
  magneticFields,
  ampere,
  solenoids,
  inductors,
  sandbox,
  gaussLaw,
  interfaceTab,
  transmissionLines,
  eddy,
  fdtd,
];
