const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ABSOLUT = '8c6323e8-9f18-475a-907d-26c46bb1bf3a';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    recordVideo: { dir: '/tmp/vid2', size: { width: 390, height: 844 } },
  });
  const p = await ctx.newPage();

  const cap = (t) => p.evaluate((t) => {
    let el = document.getElementById('__cap');
    if (!el) { el = document.createElement('div'); el.id = '__cap';
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:99999;background:rgba(16,22,19,.93);color:#fff;font:600 15px/1.35 Inter,system-ui,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.3);text-align:center';
      document.body.appendChild(el); }
    el.textContent = t;
  }, t);
  const clearCap = () => p.evaluate(() => { const el = document.getElementById('__cap'); if (el) el.remove(); });
  const card = async (title, sub, ms) => { await p.evaluate(({ title, sub }) => {
    let el = document.getElementById('__card');
    if (!el) { el = document.createElement('div'); el.id = '__card';
      el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:linear-gradient(160deg,#1f2a25,#2e7d46);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:Inter,system-ui,sans-serif;text-align:center;padding:32px';
      document.body.appendChild(el); }
    el.innerHTML = '<div style="font-size:32px;font-weight:800">' + title + '</div><div style="font-size:16px;opacity:.92;max-width:300px">' + sub + '</div>';
  }, { title, sub }); await sleep(ms); };
  const hideCard = () => p.evaluate(() => { const el = document.getElementById('__card'); if (el) el.remove(); });
  const go = async (path) => { await p.evaluate((pt) => { window.history.pushState({}, '', pt); window.dispatchEvent(new PopStateEvent('popstate')); }, path); await sleep(1500); await p.evaluate(() => window.scrollTo(0, 0)); await sleep(400); };
  const scrollTo = async (px) => { await p.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), px); await sleep(1500); };
  const tap = async (tid, t = 10000) => { const l = p.locator(`[data-testid="${tid}"]`); await l.first().waitFor({ state: 'visible', timeout: t }); await l.first().click({ force: true }); await sleep(600); };
  const padKey = async (ch) => { await p.locator('[data-testid="add-entry-sheet"]').getByRole('button', { name: ch, exact: true }).first().click(); await sleep(450); };

  // ---- login
  await p.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#email');
  await p.fill('#email', 'demo+tealfarm@stocktap.net');
  await p.fill('#password', 'DemoPass!2926');
  await p.getByRole('button', { name: /^sign in$/i }).click();
  await p.waitForSelector('text=Reports', { timeout: 20000 });
  await sleep(1200);

  await card('StockTap', 'Your whole pub — in one app', 2600); await hideCard();

  // ---- takings
  await go('/daily-board'); await cap('Log the night’s takings in seconds'); await sleep(2600);
  await scrollTo(340); await cap('Compared instantly to last week and the last 4 same days'); await sleep(3000);
  await scrollTo(720); await cap('See the trend — and whether the entertainment paid off'); await sleep(2800);

  // ---- team
  await go('/team'); await clearCap(); await cap('Your wage bill builds live against the take'); await sleep(3000);
  await scrollTo(360); await cap('Staff clock in on their own phones — they never see the money'); await sleep(3000);

  // ---- checks
  await go('/checks'); await clearCap(); await cap('Daily compliance checks — the record your EHO wants'); await sleep(2800);
  await scrollTo(320); await cap('Anything out of range is flagged on the spot'); await sleep(2800);

  // ---- rota
  await go('/rota'); await clearCap(); await cap('Build the rota by day — bar and kitchen'); await sleep(2600);
  await cap('Or snap the paper rota and let AI read it in'); await sleep(2600);

  // ---- stock: the weigh moment
  await card('Stocktake night', 'Weigh a bottle. StockTap does the maths.', 2600); await hideCard();
  await go('/stocktake');
  await tap('button-new-stocktake');
  await tap(`select-product-${ABSOLUT}`);
  await cap('Pick your bottles and start counting'); await sleep(1400);
  await tap('button-start-stocktake');
  await sleep(1200);
  await tap(`counting-product-${ABSOLUT}`);
  await tap('button-add-entry');
  await tap('button-location-unspecified');
  await clearCap(); await cap('Pop the bottle on the scale — type the grams'); await sleep(1200);
  await padKey('9'); await padKey('0'); await padKey('0');
  await sleep(1600);
  await cap('900 g of Absolut'); await sleep(1800);
  await tap('button-save-entry');
  await sleep(1500);

  // ---- reports payoff (real valuation)
  await go('/reports');
  await clearCap(); await cap('Grams become millilitres — and pounds on your shelf'); await sleep(2800);
  await scrollTo(300); await cap('Every bottle valued to the penny — export to CSV in a tap'); await sleep(3200);

  // ---- moat
  await go('/library'); await clearCap(); await cap('Every weigh sharpens a shared bottle database — the more pubs weigh, the smarter it gets'); await sleep(3400);

  await clearCap(); await card('StockTap', 'Takings · Team · Checks · Rota · Stock — one login', 3200); await hideCard();
  await p.close(); await ctx.close(); await b.close();
  console.log('done');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
