const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs'); try { fs.mkdirSync('/tmp/shots', { recursive: true }); } catch {}

const PAGES = [
  { path: '/daily-board', name: 'board', scroll: 0 },
  { path: '/team', name: 'team', scroll: 0 },
  { path: '/checks', name: 'checks', scroll: 0 },
  { path: '/rota', name: 'rota', scroll: 0 },
  { path: '/reports', name: 'reports', scroll: 0 },
  { path: '/finances', name: 'finances', scroll: 0 },
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#email');
  await p.fill('#email', 'demo+tealfarm@stocktap.net');
  await p.fill('#password', 'DemoPass!2926');
  await p.getByRole('button', { name: /^sign in$/i }).click();
  await p.waitForSelector('text=Reports', { timeout: 20000 });
  await sleep(1200);

  for (const pg of PAGES) {
    await p.evaluate(pt => { history.pushState({}, '', pt); dispatchEvent(new PopStateEvent('popstate')); }, pg.path);
    await sleep(2200);
    await p.evaluate(y => window.scrollTo(0, y), pg.scroll);
    await sleep(800);
    await p.screenshot({ path: `/tmp/shots/${pg.name}.png` });
    console.log('shot', pg.name);
  }
  await b.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
