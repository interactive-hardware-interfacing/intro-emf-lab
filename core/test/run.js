// em-core test runner: `node test/run.js` (or `npm test` in the em-core repo).
import { makeRunner } from './harness.js';
import { coreChecks } from './core.js';
import { fdtdChecks } from './fdtd.js';
import { eddyChecks } from './eddy.js';
import { dielectricsChecks } from './dielectrics.js';
import { ampereChecks } from './ampere.js';
import { solenoidChecks } from './solenoid.js';
import { filterChecks } from './filters.js';
import { faradayChecks } from './faraday.js';
import { lorentzChecks } from './lorentz.js';
import { tlineChecks } from './tline.js';
import { planeWaveChecks } from './planewave.js';
import { operatorChecks } from './operators.js';
import { coupledChecks } from './coupled.js';
import { radiationChecks } from './radiation.js';

const { check, mark, report } = makeRunner();
await coreChecks(check, mark);
mark('fdtd'); fdtdChecks(check);
mark('eddy'); eddyChecks(check);
mark('dielectrics'); dielectricsChecks(check);
mark('ampere'); ampereChecks(check);
mark('solenoid'); solenoidChecks(check);
mark('filters'); filterChecks(check);
mark('faraday'); faradayChecks(check);
mark('lorentz'); lorentzChecks(check);
mark('tline-waves'); tlineChecks(check);
mark('planewave'); planeWaveChecks(check);
mark('operators'); operatorChecks(check);
mark('coupled'); coupledChecks(check);
mark('radiation'); radiationChecks(check);
if (report()) { console.error('\nem-core: checks failed'); process.exit(1); }
