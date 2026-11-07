// Browser smoke test: serve the repo, open every tab, wait for solver tabs to converge,
// click through every stage view, and fail on any page error or console error.
// Run locally with:  npm install --no-save playwright && npx playwright install chromium && node bench/smoke.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.m': 'text/plain', '.md': 'text/plain' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const file = path === '/' ? 'index.html' : path;
    const data = await readFile(join(ROOT, file));
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(base, { waitUntil: 'networkidle' });
const tabs = await page.$$eval('#tabs .tab', (els) => els.map((e) => e.dataset.id));
let visited = 0;
for (const id of tabs) {
  await page.goto(`${base}?tab=${id}`, { waitUntil: 'networkidle' });
  for (let t = 0; t < 120; t++) { // up to 60 s for a solver tab
    await page.waitForTimeout(500);
    const st = (await page.textContent('#status')) ?? '';
    if (!/solving|running/.test(st)) break;
  }
  const views = await page.$$eval('#stage-tabs .stab', (els) => els.map((e) => e.dataset.id));
  for (const v of views) { await page.click(`#stage-tabs .stab[data-id="${v}"]`); await page.waitForTimeout(400); }
  visited++;
  console.log(`ok  ${id} (${views.length || 1} view${views.length > 1 ? 's' : ''})`);
}
await browser.close();
server.close();
if (errors.length) { console.error(errors.join('\n')); console.error(`\nsmoke: ${errors.length} error(s) across ${visited} tabs`); process.exit(1); }
console.log(`smoke: ${visited} tabs, no errors`);
