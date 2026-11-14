// em-core test runner: `node test/run.js` (or `npm test` in the em-core repo).
import { makeRunner } from './harness.js';
import { coreChecks } from './core.js';
import { fdtdChecks } from './fdtd.js';
import { eddyChecks } from './eddy.js';
import { dielectricsChecks } from './dielectrics.js';
import { ampereChecks } from './ampere.js';
import { solenoidChecks } from './solenoid.js';

const { check, mark, report } = makeRunner();
await coreChecks(check, mark);
mark('fdtd'); fdtdChecks(check);
mark('eddy'); eddyChecks(check);
mark('dielectrics'); dielectricsChecks(check);
mark('ampere'); ampereChecks(check);
mark('solenoid'); solenoidChecks(check);
if (report()) { console.error('\nem-core: checks failed'); process.exit(1); }
