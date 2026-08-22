const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOT = '/tmp/e2e';
const fs = require('fs');
try { fs.mkdirSync(SHOT, { recursive: true }); } catch {}

const PRODUCTS = [
  { id: '8c6323e8-9f18-475a-907d-26c46bb1bf3a', name: 'Absolut',          value: '900',  kind: 'weigh' },
  { id: 'c063f274-5845-4891-8b8f-fd416cd47b0f', name: 'Absolut Vanilia',  value: '800',  kind: 'weigh' },
  { id: '352f3a9a-7aae-49fb-80b5-c3d285ec25f4', name: 'Advocaat',         value: '1000', kind: 'weigh' },
  { id: 'bf99a988-dd57-44a1-bdc7-dab71f7c1b52', name: 'Fever-Tree Tonic 200ml', value: '24', kind: 'count' },
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  const badReq = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('response', r => { if (r.status() >= 400) badReq.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  const clearToasts = () => Promise.resolve(); // force-clicks handle toast overlap; don't touch React's DOM

  const shot = n => p.screenshot({ path: `${SHOT}/st-${n}.png` });
  const go = async path => {
    await p.evaluate(pt => { window.history.pushState({}, '', pt); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
    await sleep(1500); await p.evaluate(() => window.scrollTo(0, 0)); await sleep(400);
  };
  const tap = async (tid, t = 8000) => { await clearToasts(); const l = p.locator(`[data-testid="${tid}"]`); await l.first().waitFor({ state: 'visible', timeout: t }); await l.first().click({ force: true }); await sleep(500); };
  const typePad = async (str) => {
    const sheet = p.locator('[data-testid="add-entry-sheet"]');
    for (const ch of str) {
      await sheet.getByRole('button', { name: ch, exact: true }).first().click();
      await sleep(150);
    }
  };

  try {
    // ---- login
    await p.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#email');
    await p.fill('#email', 'demo+tealfarm@stocktap.net');
    await p.fill('#password', 'DemoPass!2926');
    await p.getByRole('button', { name: /^sign in$/i }).click();
    await p.waitForSelector('text=Reports', { timeout: 20000 });
    await sleep(1200);

    // ---- start a stocktake
    await go('/stocktake');
    await shot('01-list');
    await tap('button-new-stocktake');
    await sleep(800);
    await shot('02-select');

    // select all four products
    for (const pr of PRODUCTS) {
      await tap(`select-product-${pr.id}`, 12000);
    }
    await shot('03-selected');
    await tap('button-start-stocktake', 12000);
    await sleep(1500);
    await shot('04-counting');

    // ---- enter a reading for each product
    for (const pr of PRODUCTS) {
      await tap(`counting-product-${pr.id}`, 12000);
      await sleep(600);
      await tap('button-add-entry', 10000);
      await sleep(500);
      await tap('button-location-unspecified', 8000);
      await sleep(700);
      await typePad(pr.value);
      await sleep(400);
      await shot(`05-entry-${pr.name.replace(/\W+/g, '')}`);
      await tap('button-save-entry', 10000);
      await sleep(1200);
      await tap('button-back-to-products', 8000);
      await sleep(700);
    }
    await shot('06-all-entered');

    // ---- review + close
    await tap('button-review-stocktake', 10000);
    await sleep(1200);
    await shot('07-summary');
    await tap('button-finish-stocktake', 15000);
    await sleep(3000);
    await shot('08-finished');

    // ---- reports valuation
    await go('/reports');
    await sleep(2500);
    await shot('09-reports-top');
    await p.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
    await sleep(1200);
    await shot('10-reports-mid');
    await p.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
    await sleep(1200);
    await shot('11-reports-lower');

    const bodyText = await p.evaluate(() => document.body.innerText);
    fs.writeFileSync(`${SHOT}/reports-text.txt`, bodyText);
    console.log('REPORTS_TEXT_START');
    console.log(bodyText.slice(0, 4000));
    console.log('REPORTS_TEXT_END');
  } catch (e) {
    await shot('ERROR');
    console.error('FATAL', e.message);
    console.error('CONSOLE ERRORS:', JSON.stringify(errors, null, 2));
    console.error('BAD REQUESTS:', JSON.stringify(badReq, null, 2));
    await p.close(); await ctx.close(); await b.close();
    process.exit(1);
  }

  console.log('CONSOLE_ERRORS_COUNT', errors.length);
  if (errors.length) console.log('CONSOLE_ERRORS', JSON.stringify(errors.slice(0, 20), null, 2));
  console.log('BAD_REQUESTS_COUNT', badReq.length);
  if (badReq.length) console.log('BAD_REQUESTS', JSON.stringify(badReq.slice(0, 30), null, 2));
  await p.close(); await ctx.close(); await b.close();
  console.log('DONE');
})();
