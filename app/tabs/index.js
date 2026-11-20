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
import faraday from './faraday.js';
import chargesInFields from './charges-in-fields.js';
import tlineWaves from './tline-waves.js';
import planeWaves from './plane-waves.js';
import radiation from './radiation.js';
import oblique from './oblique.js';
import smith from './smith.js';
import antennas from './antennas.js';
import chargedBodies from './charged-bodies.js';
import images from './images.js';
import dipole from './dipole.js';
import lossyLines from './lossy-lines.js';
import waveguides from './waveguides.js';
import energyFlow from './energy-flow.js';
import magneticCircuits from './magnetic-circuits.js';
import vectorCalculus from './vector-calculus.js';
import operators from './operators.js';
import coupledCoils from './coupled-coils.js';
import interfaceTab from './interface.js';
import transmissionLines from './transmission-lines.js';
import fdtd from './fdtd.js';
import eddy from './eddy.js';

/** Topic groups, in tab-bar order. A tab belongs to exactly one group; the bench checks that. */
export const GROUPS = [
  { label: 'Electrostatics', tabs: [pointCharges, pointCharges3d, dipole, makeRingLine('ring'), makeRingLine('rods'), gaussLaw, chargedBodies, images, interfaceTab, capacitors, dielectrics] },
  { label: 'Currents & circuits', tabs: [conduction, energyFlow, filters] },
  { label: 'Magnetostatics', tabs: [magneticFields, ampere, solenoids, chargesInFields, inductors, magneticCircuits] },
  { label: 'Induction', tabs: [faraday, coupledCoils, eddy] },
  { label: 'Waves', tabs: [transmissionLines, tlineWaves, lossyLines, smith, planeWaves, oblique, waveguides, radiation, antennas, fdtd] },
  { label: 'Tools', tabs: [vectorCalculus, operators, sandbox, about] },
];

export const TABS = GROUPS.flatMap((g) => g.tabs.map((tab) => { tab.group = g.label; return tab; }));
