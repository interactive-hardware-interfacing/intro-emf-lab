// Control-extremes fuzz: every numeric control on every tab is set to its minimum and then its
// maximum (one at a time, from the tab's defaults), and page errors or NaN/Infinity/undefined
// in the status and probe text are reported. Slow (~10 min: solver tabs re-solve each time),
// so it is not part of the deploy gate; run it by hand after adding a tab or a control:
//   CHROME_PATH=... node bench/fuzz.mjs [tab-id ...]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html')));
  try { res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream'); res.end(await readFile(p)); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(base, { waitUntil: 'networkidle' });
const all = await page.$$eval('#tabs .tab', (els) => els.map((e) => e.dataset.id));
const ids = process.argv.length > 2 ? process.argv.slice(2) : all.filter((id) => id !== 'about');
const waitIdle = async () => { for (let t = 0; t < 60; t++) { await page.waitForTimeout(200); if (!/solving|running/.test((await page.textContent('#status')) ?? '')) break; } };
const report = [];
let trials = 0;
for (const id of ids) {
  await page.goto(`${base}?tab=${id}`); await page.waitForTimeout(600);
  const n = await page.$$eval('#controls input[inputmode=decimal]', (els) => els.length);
  for (let k = 0; k < n; k++) for (const which of ['min', 'max']) {
    await page.goto(`${base}?tab=${id}`); await page.waitForTimeout(300);
    const info = await page.evaluate(([k, which]) => {
      const el = document.querySelectorAll('#controls input[inputmode=decimal]')[k]; if (!el) return null;
      const v = el.dataset[which]; if (v === undefined) return null;
      el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
      return { label: el.getAttribute('aria-label') || `#${k}`, v };
    }, [k, which]);
    if (!info) continue;
    trials++;
    const before = errors.length;
    await page.waitForTimeout(400); await waitIdle();
    const txt = await page.evaluate(() => (document.getElementById('status')?.textContent || '') + ' | ' + (document.querySelector('.probe-table')?.textContent || ''));
    const bad = txt.match(/.{0,40}\b(NaN|Infinity|undefined)\b.{0,40}/);
    if (errors.length > before || bad) report.push(`${id} · ${info.label} = ${info.v}: ${errors.slice(before).join(' | ')}${bad ? ' text: ' + bad[0] : ''}`);
  }
  console.log(`${report.some((r) => r.startsWith(id + ' ·')) ? 'BAD' : 'ok '} ${id} (${n} controls)`);
}
await browser.close(); server.close();
if (report.length) { console.error('\n' + report.join('\n')); console.error(`\nfuzz: ${report.length} problem(s) in ${trials} trials`); process.exit(1); }
console.log(`fuzz: ${trials} trials on ${ids.length} tabs, no problems`);
