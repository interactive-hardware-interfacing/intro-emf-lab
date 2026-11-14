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
  'line-charge': 'd=0.5&a=0.2', 'capacitors': 'half=1', 'dielectrics': 'dm=side&dq=Q&de=3,7&df=0.25,0.75&d_Q=2&d_w=20&res=10', 'ampere': 'src=toroid&ls=rect&lx=0.004&ly=-0.003&lw=0.03&lh=0.02&cw=1&ns=16&N=30&I=2&R1=0.015&R2=0.025', 'solenoids': 'kind=pair&s_I=2&s_a=40&s_d=32&s_sign=-1', 'tline-waves': 'tw_load=RC&tw_RL=30&tw_Cload=3&tw_len=0.6&tw_Rs=75&t=2e-10', 'charges-in-fields': 'cm=loop&loop_N=5&loop_I=3&loop_theta=120', 'faraday': 'fm=generator&generator_B=0.5&generator_rpm=1500&generator_N=20&t=0.01', 'filters': 'f_circuit=rlc&f_output=LC&f_R=22&f_L=4.7&f_C=2.2&f_V=3&f_f=1200000&f_esr=15&f_esl=0.8&f_ebd=20&f_gap=0.5', 'conduction': '', 'magnetic-fields': 'm=1&nl=7&K=50',
  'inductors': 'mode=ring&sat=1&bsat=1.2&obj=0', 'sandbox': '', 'gauss-law': 'sk=box&sa=0.12&n=3&res=48',
  'interface': 'mode=magnetic&e2=300&th=-25&rs=3', 'eddy': 'mat=custom&sig=22000000&emu=3&f=3300&ph=123&half=1&nr=61', 'transmission-lines': 'geom=twin&a=1&d=6&er=3', 'fdtd': 'preset=guide&side=mirror&src=cw&f=2000000000',
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

// ---- Assignment lock: banner hidden when unlocked; the right panel survives a narrow locked window
{
  await page.goto(`${base}?tab=capacitors`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  const disp = await page.evaluate(() => getComputedStyle(document.getElementById('assign-banner')).display);
  if (disp !== 'none') errors.push(`assignment banner visible on an unlocked page (display ${disp})`);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(`${base}?tab=capacitors&lock=1&note=test`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({
    banner: getComputedStyle(document.getElementById('assign-banner')).display,
    right: document.querySelector('.panel-right').getBoundingClientRect().width,
    controls: getComputedStyle(document.getElementById('controls')).display,
    tabs: getComputedStyle(document.getElementById('tabs')).display,
    resizer: getComputedStyle(document.getElementById('resize-right')).display,
  }));
  if (st.banner === 'none') errors.push('locked page: banner not shown');
  if (st.right < 200) errors.push(`locked page at 900px: right panel only ${st.right}px wide`);
  if (st.controls !== 'none' || st.tabs !== 'none' || st.resizer !== 'none') errors.push(`locked page leaks controls/tabs/resizer: ${JSON.stringify(st)}`);
  await page.setViewportSize({ width: 1400, height: 900 });
  console.log('ok  assignment lock');
}

// ---- Every download carries the semester tag exactly once and keeps its extension
{
  const { SEMESTER } = await import('../app/version.js');
  const names = [];
  page.on('download', (d) => { names.push(d.suggestedFilename()); d.cancel().catch(() => {}); });
  const buttons = [['capacitors', ['#export-png', '#export-csv']], ['inductors', ['#export-png', '#export-csv']], ['fdtd', ['#export-csv']], ['gauss-law', ['#export-png', '#export-csv']]];
  for (const [id, sels] of buttons) {
    await page.goto(`${base}?tab=${id}`, { waitUntil: 'networkidle' }); await waitIdle();
    for (const sel of sels) { await page.click(sel); await page.waitForTimeout(600); }
  }
  // probe log on one tab
  await page.goto(`${base}?tab=point-charges`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await page.click('#probe-log'); await page.click('#probe-csv'); await page.waitForTimeout(600);
  const re = new RegExp(`^[^.]+\\.${SEMESTER.replace(/[-]/g, '\\$&')}\\.(png|csv)$`);
  const bad = names.filter((n) => !re.test(n));
  if (names.length < 8) errors.push(`download test: only ${names.length} downloads captured`);
  if (bad.length) errors.push(`downloads without a single semester tag: ${bad.join(', ')}`);
  console.log(`ok  download names (${names.length})`);
}

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
