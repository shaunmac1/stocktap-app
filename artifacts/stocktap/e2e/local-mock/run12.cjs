// Order list built from StockTap stocktakes (no Venners), as the owner on a phone, against mock12.cjs.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots12'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); localStorage.removeItem('orders:tab'); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png` });
  const txt = async s => (await p.locator(s).first().innerText()).replace(/\s+/g, ' ');
  const row = name => p.locator('[data-testid^="order-row-"]', { hasText: name }).first();
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await p.locator('[data-testid="button-home-orders"]').click(); await sleep(3500);
    await shot('01-order');
    check('subtitle says it comes from your stocktakes', /From your stocktakes/.test(await txt('[data-testid="orders-subtitle"]')), await txt('[data-testid="orders-subtitle"]'));
    check('only Order and All stock tabs (no till data)', await p.locator('[data-testid="tab-updown"]').count() === 0 && await p.locator('[data-testid="tab-all"]').count() === 1);
    check('two periods on the chart', await p.locator('[data-testid^="period-"]').count() === 2);
    check('chart explains it is stock used', /stock used per day/.test(await p.locator('body').innerText()));
    check('basis says Last count', await p.locator('[data-testid="basis-latest"]').innerText() === 'Last count');
    check('stock now mentions the delivery since the count', /plus 1 delivered line/.test(await txt('[data-testid="text-stock-basis"]')), await txt('[data-testid="text-stock-basis"]'));
    const names = await p.locator('[data-testid^="order-row-"]').evaluateAll(els => els.map(e => e.innerText.split('\n')[0]));
    check('gin, Guinness, Pepsi Max and crisps are on the order', ['Gordon', 'Guinness', 'Pepsi Max', 'McCoys'].every(n => names.some(x => x.includes(n))), names.join(' | '));
    const gin = (await row("Gordon").innerText()).replace(/\s+/g, ' ');
    check('gin ordered in bottles', /\d+ bottles?/.test(gin), gin.slice(0, 160));
    const guin = (await row('Guinness').innerText()).replace(/\s+/g, ' ');
    check('Guinness ordered in kegs', /\d+ kegs?/.test(guin), guin.slice(0, 160));
    const max = (await row('Pepsi Max').innerText()).replace(/\s+/g, ' ');
    check('Pepsi Max ordered in boxes', /\d+ box(es)?/.test(max), max.slice(0, 160));
    const before = await txt('[data-testid="text-order-lines"]');
    await p.locator('[data-testid="busy-50"]').click(); await sleep(500);
    await p.locator('[data-testid="input-cover"]').fill('21'); await sleep(500);
    check('busier and longer asks for at least as much', Number(await txt('[data-testid="text-order-lines"]')) >= Number(before));
    await shot('02-busy');
    await p.locator('[data-testid="tab-all"]').click(); await sleep(800);
    check('All stock lists the counted lines', await p.locator('[data-testid="allstock-row"]').count() >= 6);
    await shot('03-all');
    check('no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } catch (e) { results.push('ERROR ' + e.message); await shot('zz-error'); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
