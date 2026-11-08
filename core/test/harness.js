// Tiny test harness shared by em-core's own runner and by the sites that embed it.
export function makeRunner() {
  const results = [];
  const T0 = Date.now();
  const mark = (n) => process.env.BENCH_TIMING && console.error(`${((Date.now() - T0) / 1000).toFixed(1)}s  ${n}`);
  function check(name, got, want, relTol) {
    const err = want === 0 ? Math.abs(got) : Math.abs((got - want) / want);
    const pass = Number.isFinite(got) && err <= relTol;
    results.push({ name, got, want, err, relTol, pass });
  }
  const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3 ? v.toExponential(4) : v.toPrecision(8)) : String(v));
  function report() {
    const failed = results.filter((r) => !r.pass);
    for (const r of results) console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(52)} got ${fmt(r.got)}  want ${fmt(r.want)}  rel err ${r.err.toExponential(2)} (tol ${r.relTol})`);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    return failed.length;
  }
  return { check, mark, report, results };
}
