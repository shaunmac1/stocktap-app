const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs'); try { fs.mkdirSync('/tmp/e2e', { recursive: true }); } catch {}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [], bad = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`); });

  const shot = n => p.screenshot({ path: `/tmp/e2e/fin-${n}.png` });
  const go = async path => { await p.evaluate(pt => { history.pushState({}, '', pt); dispatchEvent(new PopStateEvent('popstate')); }, path); await sleep(1500); };
  const tap = async (tid, t = 10000) => { const l = p.locator(`[data-testid="${tid}"]`); await l.first().waitFor({ state: 'visible', timeout: t }); await l.first().click({ force: true }); await sleep(500); };
  const fill = async (tid, v) => { await p.locator(`[data-testid="${tid}"]`).first().fill(v); await sleep(200); };
  const pick = async (tid, v) => { await p.locator(`[data-testid="${tid}"]`).first().selectOption(v); await sleep(200); };
  const txt = async (tid) => (await p.locator(`[data-testid="${tid}"]`).first().innerText()).trim();

  try {
    await p.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#email');
    await p.fill('#email', 'demo+tealfarm@stocktap.net');
    await p.fill('#password', 'DemoPass!2926');
    await p.getByRole('button', { name: /^sign in$/i }).click();
    await p.waitForSelector('text=Reports', { timeout: 20000 });
    await sleep(1000);

    await go('/finances');
    await p.waitForSelector('text=Finances', { timeout: 10000 });
    await shot('01-empty');

    // ---- add money IN (takings) £2000
    await tap('button-finance-add');
    await tap('button-edit-direction-in');
    await fill('input-entry-amount', '2000');
    await fill('input-entry-supplier', 'Saturday takings');
    await tap('button-entry-save');
    await sleep(1200);

    // ---- add money OUT rent £1200, still owed
    await tap('button-finance-add');
    await tap('button-edit-direction-out');
    await pick('select-entry-category', 'rent');
    await fill('input-entry-amount', '1200');
    await fill('input-entry-supplier', "Pubco rent");
    await tap('button-status-due');
    await tap('button-entry-save');
    await sleep(1200);
    await shot('02-after-manual');

    // ---- import a spending sheet (3 paid outgoings, this month)
    await tap('button-finance-import');
    const csv = 'Date,Supplier,Amount,Invoice No\n22/08/2026,Brewery,300.00,INV-100\n20/08/2026,Utilities Co,200.00,INV-101\n18/08/2026,Cleaning Ltd,100.00,INV-102';
    await p.locator('[data-testid="textarea-finance-paste"]').first().fill(csv);
    await sleep(300);
    await tap('button-finance-parse');
    await sleep(800);
    await shot('03-import-map');
    await tap('button-finance-import-save');
    await sleep(1500);
    await shot('04-after-import');

    // ---- read the summary cards
    const income = await txt('text-income');
    const outgoings = await txt('text-outgoings');
    const net = await txt('text-net');
    const payable = await txt('text-payable');
    console.log('SUMMARY', JSON.stringify({ income, outgoings, net, payable }));
  } catch (e) {
    await shot('ERROR');
    console.error('FATAL', e.message);
    console.error('ERRORS', JSON.stringify(errors, null, 2));
    console.error('BAD', JSON.stringify(bad, null, 2));
    await b.close(); process.exit(1);
  }

  console.log('CONSOLE_ERRORS', errors.length, JSON.stringify(errors.slice(0, 10)));
  console.log('BAD_REQUESTS', bad.length, JSON.stringify(bad.slice(0, 10)));
  await b.close();
  console.log('DONE');
})();
