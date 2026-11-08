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
  // dispatch the click directly: a long solver chunk on the main thread can stall Playwright's actionability wait
  for (const v of views) { await page.$eval(`#stage-tabs .stab[data-id="${v}"]`, (b) => b.click()); await page.waitForTimeout(400); }
  visited++;
  console.log(`ok  ${id} (${views.length || 1} view${views.length > 1 ? 's' : ''})`);
}

// ---- URL round trip with one control perturbed per tab: the share link must reproduce it
const perturb = {
  'point-charges': 'n=3&q1=2.5&x1=0.1', 'point-charges-3d': 'n=2&cz=0.1&az=1.2', 'ring-charge': 'N=7&rm=1,4&plane=xz&off=0.1',
  'line-charge': 'd=0.5&a=0.2', 'capacitors': 'half=1', 'conduction': '', 'magnetic-fields': 'm=1&nl=7&K=50',
  'inductors': 'mode=ring&sat=1&bsat=1.2&obj=0', 'sandbox': '', 'gauss-law': 'sk=box&sa=0.12&n=3&res=48',
  'interface': 'mode=magnetic&e2=300&th=-25&rs=3', 'transmission-lines': 'geom=twin&a=1&d=6&er=3', 'fdtd': 'preset=guide&side=mirror&src=cw&f=2000000000',
};
const waitIdle = async () => { for (let t = 0; t < 120; t++) { await page.waitForTimeout(300); if (!/solving|running/.test((await page.textContent('#status')) ?? '')) break; } };
const query = (u) => Object.fromEntries(new URL(u).searchParams);
for (const id of tabs) {
  if (perturb[id] === undefined) continue;
  await page.goto(`${base}?tab=${id}&${perturb[id]}`, { waitUntil: 'networkidle' }); await waitIdle();
  await page.evaluate(() => window.emf.syncUrl());
  const u1 = page.url(), q1 = query(u1);
  const lost = Object.entries(query(`${base}?${perturb[id]}`)).filter(([k, v]) => q1[k] !== v).map(([k]) => k);
  await page.goto(u1, { waitUntil: 'networkidle' }); await waitIdle();
  await page.evaluate(() => window.emf.syncUrl());
  const q2 = query(page.url());
  const unstable = [...new Set([...Object.keys(q1), ...Object.keys(q2)])].filter((k) => q1[k] !== q2[k]);
  if (lost.length || unstable.length) errors.push(`round-trip ${id}: lost ${JSON.stringify(lost)} unstable ${JSON.stringify(unstable)}`);
}
console.log('ok  URL round trips');

// ---- Randomize mode must not fall back to the defaults when the hidden values are absent from the URL
for (const [id, read, defaults] of [
  ['point-charges', () => window.emf.tab.charges.slice(0, 4).map((c) => [c.q, c.x, c.y]).flat(), [2, 0.2, 0.3, -2, 0.3, 0.2, 1, 0.15, 0.15, -1, 0.35, 0.35]],
  ['magnetic-fields', () => window.emf.tab.wires.map((w) => w.I), [2, -2, 1, -1]],
]) {
  await page.goto(`${base}?tab=${id}&mode=random`, { waitUntil: 'networkidle' });
  const got = await page.evaluate(read);
  if (JSON.stringify(got) === JSON.stringify(defaults)) errors.push(`${id}: mode=random without values shows the default answer`);
}
console.log('ok  randomize on load');

// ---- Every form control has an accessible name (label, aria-label or label[for])
for (const id of tabs) {
  await page.goto(`${base}?tab=${id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  const bare = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter((i) => i.type !== 'hidden' && !i.closest('label') && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !(i.id && document.querySelector(`label[for="${i.id}"]`))).map((i) => `${i.tagName.toLowerCase()}[type=${i.type}]`));
  if (bare.length) errors.push(`${id}: ${bare.length} control(s) without an accessible name: ${bare.join(', ')}`);
}
console.log('ok  accessible names');

// ---- Narrow layout: nothing should overflow horizontally at 900 px
await page.setViewportSize({ width: 900, height: 800 });
for (const id of ['capacitors', 'fdtd', 'gauss-law', 'about']) {
  await page.goto(`${base}?tab=${id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) errors.push(`${id}: horizontal overflow of ${over}px at 900px`);
}
console.log('ok  900px layout');

await browser.close();
server.close();
if (errors.length) { console.error(errors.join('\n')); console.error(`\nsmoke: ${errors.length} error(s) across ${visited} tabs`); process.exit(1); }
console.log(`smoke: ${visited} tabs, no errors`);
