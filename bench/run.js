// Benchmark and test runner for intro-EMF-lab. The numerics (core/) carry their own checks
// in core/test (they are the em-core package's tests); this runner adds the app layer:
// worker protocol, URL state, tab contracts, golden files, the browser-module parse.
// Usage: node bench/run.js [--freeze]   (--freeze rewrites bench/golden.json)

import { makeRunner } from '../core/test/harness.js';
import { coreChecks } from '../core/test/core.js';
import { fdtdChecks } from '../core/test/fdtd.js';
import { eddyChecks } from '../core/test/eddy.js';
import { dielectricsChecks } from '../core/test/dielectrics.js';
import { ampereChecks } from '../core/test/ampere.js';
import { solenoidChecks } from '../core/test/solenoid.js';
import { filterChecks } from '../core/test/filters.js';
import { faradayChecks } from '../core/test/faraday.js';
import { lorentzChecks } from '../core/test/lorentz.js';
import { tlineChecks } from '../core/test/tline.js';
import { planeWaveChecks } from '../core/test/planewave.js';
import { operatorChecks } from '../core/test/operators.js';
import { coupledChecks } from '../core/test/coupled.js';

const { check, mark, report } = makeRunner();

mark('core');
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

// ---------------------------------------------------------------- syntax of every browser module
// The tabs and shell never run under node, so at least parse them: a dropped comma must fail CI.
{
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(join(root, 'app')); walk(join(root, 'core'));
  const { spawnSync } = await import('node:child_process');
  let bad = 0;
  for (const f of files) { const r = spawnSync(process.execPath, ['--check', f]); if (r.status !== 0) { bad++; console.error(r.stderr.toString()); } }
  check(`syntax: all ${files.length} browser modules parse`, bad, 0, 0);
}

// ---------------------------------------------------------------- app layer (worker, state, contracts, golden files)
mark('app layer');
await (await import('./fdtd.js')).fdtdAppChecks(check);
await (await import('./app.js')).run(check);
await (await import('./tline.js')).tlineChecks(check); // transmission lines: closed forms and the Gauss-Seidel cross-section

// ---------------------------------------------------------------- report
if (report()) { console.error('\nbenchmark(s) failed; refusing to deploy.'); process.exit(1); }
