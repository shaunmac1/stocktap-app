const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs');

const MODULES = [
  { name: 'board', path: '/daily-board', wait: 'Daily Board',
    card: ['Daily Board', 'Know if tonight beat last week — before you lock up'],
    caps: [[0, 'Log the night’s takings in seconds'], [340, 'Compared instantly to last week & your last 4 same-days'], [720, 'See if the act or the match actually paid for itself']] },
  { name: 'stock', path: '/reports', wait: 'Reports',
    card: ['Stock', 'Weigh it on your phone — no scales to buy'],
    caps: [[0, 'Count by weight, dipstick, tenths or tap'], [0, 'Every bottle valued to the penny'], [300, 'Eight reports — GP, variance, what to order']] },
  { name: 'team', path: '/team', wait: 'Team',
    card: ['Team', 'Your wage bill, live against the take'],
    caps: [[0, 'Wage cost climbs live against tonight’s takings'], [360, 'Staff clock in on their own phones — they never see the money'], [360, 'Forgotten clock-outs flagged and capped']] },
  { name: 'checks', path: '/checks', wait: 'Checks',
    card: ['Checks', 'The EHO record, done on the phone as you go'],
    caps: [[0, 'Fridge & cellar temps, cleaning, refusals'], [300, 'Anything out of range is flagged on the spot'], [640, 'Staff fill it in — you review and sign off']] },
  { name: 'rota', path: '/rota', wait: 'Rota',
    card: ['Rota', 'Next week’s rota in a couple of minutes'],
    caps: [[0, 'Build the bar & kitchen day by day'], [0, 'Copy last week forward in one tap'], [0, 'Or snap the paper rota — AI reads it in']] },
  { name: 'finances', path: '/finances', wait: 'Finances',
    card: ['Finances', 'Money in, money out, and what’s still owed'],
    caps: [[0, 'Income, outgoings, net & still-payable at a glance'], [0, 'Add entries by hand…'], [0, '…or import the sheets you already keep']] },
];

async function makeHelpers(p) {
  const cap = (t) => p.evaluate((t) => {
    let el = document.getElementById('__cap');
    if (!el) { el = document.createElement('div'); el.id = '__cap';
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:99999;background:rgba(16,22,19,.94);color:#fff;font:600 15px/1.35 Inter,system-ui,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.3);text-align:center';
      document.body.appendChild(el); }
    el.textContent = t;
  }, t);
  const card = async (title, sub, ms) => { await p.evaluate(({ title, sub }) => {
    let el = document.getElementById('__card');
    if (!el) { el = document.createElement('div'); el.id = '__card';
      el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:linear-gradient(160deg,#12271b,#2e7d46);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Inter,system-ui,sans-serif;text-align:center;padding:32px';
      document.body.appendChild(el); }
    el.innerHTML = '<div style="font-family:monospace;letter-spacing:.18em;font-size:12px;text-transform:uppercase;color:#e8c98a">StockTap</div><div style="font-size:34px;font-weight:800">' + title + '</div><div style="font-size:17px;opacity:.92;max-width:300px">' + sub + '</div>';
  }, { title, sub }); await sleep(ms); };
  const hideCard = () => p.evaluate(() => { const el = document.getElementById('__card'); if (el) el.remove(); });
  return { cap, card, hideCard };
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // login once, persist session
  const loginCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const lp = await loginCtx.newPage();
  await lp.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await lp.waitForSelector('#email');
  await lp.fill('#email', 'demo+tealfarm@stocktap.net');
  await lp.fill('#password', 'DemoPass!2926');
  await lp.getByRole('button', { name: /^sign in$/i }).click();
  await lp.waitForSelector('text=Reports', { timeout: 20000 });
  await sleep(800);
  await loginCtx.storageState({ path: '/tmp/state.json' });
  await loginCtx.close();

  for (const m of MODULES) {
    const dir = `/tmp/vidmod/${m.name}`;
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await b.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      storageState: '/tmp/state.json',
      recordVideo: { dir, size: { width: 390, height: 844 } },
    });
    const p = await ctx.newPage();
    const { cap, card, hideCard } = await makeHelpers(p);
    try {
      await p.goto(`${BASE}${m.path}`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector(`text=${m.wait}`, { timeout: 20000 });
      await sleep(700);
      await card(m.card[0], m.card[1], 2400); await hideCard();
      for (const [scroll, text] of m.caps) {
        if (scroll) { await p.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), scroll); await sleep(1000); }
        await cap(text); await sleep(2800);
      }
      await sleep(500);
      console.log('recorded', m.name);
    } catch (e) {
      console.error('ERR', m.name, e.message);
    }
    await p.close(); await ctx.close();
  }
  await b.close();
  console.log('ALL DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
