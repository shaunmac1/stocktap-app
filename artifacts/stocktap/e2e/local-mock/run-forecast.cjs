// As-user test: "lasts X days · order Y" on every Library line, the To order filter, and the
// Orders page starting from newer real counts. Needs mock-forecast.cjs + static.cjs.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const B = n => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const txt = async tid => (await p.locator(`[data-testid="${tid}"]`).first().innerText().catch(() => '')).replace(/\n/g, ' | ');
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  try {
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(4500);
    // close any first-visit sheet
    await p.keyboard.press('Escape'); await sleep(300);
    check('J2O (own counts, delivery in between): Lasts 9 days · order 1 case of 24', (await txt(`line-forecast-label-${B(1)}`)) === 'Lasts 9 days · order 1 case of 24', await txt(`line-forecast-label-${B(1)}`));
    check('J2O says where the speed comes from', (await txt(`line-forecast-detail-${B(1)}`)) === 'Sells about 44 bottles a week (from your counts)', await txt(`line-forecast-detail-${B(1)}`));
    check('Peroni (newer count + audit speed): Lasts 2 days · order 2 cases of 24', (await txt(`line-forecast-label-${B(2)}`)) === 'Lasts 2 days · order 2 cases of 24', await txt(`line-forecast-label-${B(2)}`));
    check('Peroni from your stock audits', /42 bottles a week \(from your stock audits\)/.test(await txt(`line-forecast-detail-${B(2)}`)), await txt(`line-forecast-detail-${B(2)}`));
    check('Crisps: no guess', (await txt(`line-forecast-label-${B(3)}`)) === 'No sales speed yet', await txt(`line-forecast-label-${B(3)}`));
    check('Hooch: not counted yet', (await txt(`line-forecast-label-${B(4)}`)) === 'Not counted yet', await txt(`line-forecast-label-${B(4)}`));
    check('Old Mout: plenty', (await txt(`line-forecast-label-${B(5)}`)) === 'Lasts 60+ days · no order needed', await txt(`line-forecast-label-${B(5)}`));
    check('In stock starts from the same count (60 this morning), on a fresh phone', /^In stock: 60 units$/.test(await txt(`text-stock-now-${B(1)}`)), await txt(`text-stock-now-${B(1)}`));
    check('Peroni In stock shows its count (29)', /^In stock: 29 units$/.test(await txt(`text-stock-now-${B(2)}`)), await txt(`text-stock-now-${B(2)}`));
    check('old "d cover" badge is gone', !/\dd cover/.test(await p.locator('body').innerText()));
    await p.locator(`[data-testid="card-product-${B(1)}"]`).scrollIntoViewIfNeeded(); await sleep(300);
    await p.screenshot({ path: `${SHOT}/f1-library.png` });
    check('To order chip shows 2', /To order \(2\)/.test(await txt('filter-chip-to-order')), await txt('filter-chip-to-order'));
    await p.locator('[data-testid="filter-chip-to-order"]').tap(); await sleep(800);
    const shown = await p.locator('[data-testid^="card-product-"]:visible').count();
    const first = await p.locator('[data-testid^="card-product-"]:visible').first().getAttribute('data-testid');
    check('To order shows just the 2, soonest out first (Peroni)', shown === 2 && first === `card-product-${B(2)}`, `${shown} ${first}`);
    await p.screenshot({ path: `${SHOT}/f2-to-order.png` });
    await p.locator('[data-testid="filter-chip-to-order"]').tap(); await sleep(600);
    check('tap again shows everything', (await p.locator('[data-testid^="card-product-"]:visible').count()) === 5);
    // Orders page agrees and says it used newer counts
    await p.goto('http://localhost:5173/orders', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    const rc = await txt('text-recounted-lines');
    check('Orders: 3 lines start from your newer StockTap count', /3 lines start from your newer StockTap count/.test(rc), rc);
    const body = await p.locator('body').innerText();
    check('Orders: Peroni on the list as 2 cases', /Peroni[\s\S]{0,200}2 cases/.test(body), body.slice(0, 600).replace(/\n/g, ' | '));
    await p.screenshot({ path: `${SHOT}/f3-orders.png`, fullPage: false });
    // Today's check on Spot Check
    await p.goto('http://localhost:5173/spot-check', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check("Today's check offers 2 lines", /tick 2 lines/.test(await txt('button-todays-check')), await txt('button-todays-check'));
    const order = await p.locator('[data-testid^="button-select-product-"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
    check('suggested lines sit at the top: Peroni then Hooch', order[0] === `button-select-product-${B(2)}` && order[1] === `button-select-product-${B(4)}`, order.slice(0, 3).join(','));
    check('Peroni says why: Running low: 2 days left', (await txt(`pick-reason-${B(2)}`)) === 'Running low: 2 days left', await txt(`pick-reason-${B(2)}`));
    check('Hooch says why: Never checked', (await txt(`pick-reason-${B(4)}`)) === 'Never checked', await txt(`pick-reason-${B(4)}`));
    await p.screenshot({ path: `${SHOT}/f4-todays-check.png` });
    await p.locator('[data-testid="button-todays-check"]').tap(); await sleep(500);
    check('one tap ticks them: Start Check (2 selected)', /2 selected/.test(await txt('button-start-spot-check')), await txt('button-start-spot-check'));
    await p.locator(`[data-testid="button-select-product-${B(5)}"]`).tap(); await sleep(300);
    check('add another by hand: 3 selected', /3 selected/.test(await txt('button-start-spot-check')), await txt('button-start-spot-check'));
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/fX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
