// As-user test: spirits and wine show bottles, full + tenths, and measures (or glasses) left.
// Needs mock-spirits.cjs + static.cjs. iPhone size.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const GIN = 'cccccccc-0000-4000-8000-000000000001', WINE = 'cccccccc-0000-4000-8000-000000000002';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const T = tid => p.locator(`[data-testid="${tid}"]:visible`).first();
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  const tap = async (tid, w = 500) => { await T(tid).waitFor({ state: 'visible', timeout: 10000 }); await T(tid).scrollIntoViewIfNeeded(); await T(tid).tap(); await sleep(w); };
  const txt = async tid => (await T(tid).innerText().catch(() => '')).replace(/\n/g, ' | ');
  const entries = async () => (await (await fetch('http://localhost:8899/rest/v1/stocktake_line_entries?select=*')).json());
  const openAndCount = async (id, loc) => {
    for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, 700); break; }
    await tap(`counting-product-${id}`, 800);
    if (!(await has('button-change-spot')) && !(await has(`button-location-${loc}`))) await tap('button-add-entry', 600);
    if (await has(`button-location-${loc}`)) await tap(`button-location-${loc}`, 600);
  };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('button-new-stocktake', 800);
    for (const id of [GIN, WINE]) if (await has(`select-product-${id}`)) await tap(`select-product-${id}`, 200);
    await tap('button-start-stocktake', 1500);

    // Gin: 2 full sealed + 7 tenths in the open one
    await openAndCount(GIN, 'loc-bar');
    await tap('tenths-quick-5', 200); for (let i = 0; i < 4; i++) await tap('tenths-plus', 120);
    check('open bottle set to 7 tenths', (await txt('tenths-value')) === '7.0', await txt('tenths-value'));
    await p.locator('button:visible:text-is("2")').last().tap(); await sleep(300);
    check('result: 2.7 bottles', (await txt('text-bottles-result')).startsWith('2.7'), await txt('text-bottles-result'));
    check('tenths for the stock sheet: 2 full + 7 tenths', (await txt('text-tenths-result')) === '2 full + 7 tenths', await txt('text-tenths-result'));
    check('measures left: 75 measures of 25ml', (await txt('text-measures-result')) === '75 measures of 25ml', await txt('text-measures-result'));
    await T('text-measures-result').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/s1-gin.png` });
    await tap('button-save-entry', 1800);
    let e = (await entries()).find(x => x.product_id === GIN);
    check('saved as 1890ml (2.7 × 700)', e && Math.round(e.ml_remaining) === 1890, JSON.stringify(e && e.ml_remaining));
    const tot = (await p.locator('[data-testid="text-product-total"]:visible').locator('xpath=..').innerText()).replace(/\n/g, ' | ');
    check('total shows all three: 2.7 bottles · 2 full + 7 tenths · 75 measures of 25ml · £37.80', /^.*2\.7/.test(tot) && /2 full \+ 7 tenths · 75 measures of 25ml · £37\.80/.test(tot), tot);
    await p.screenshot({ path: `${SHOT}/s2-gin-total.png` });

    // Wine: 8 full + three-quarters → glasses, never 25ml measures
    await openAndCount(WINE, 'loc-bar');
    await tap('tenths-quick-7.5', 200);
    await p.locator('button:visible:text-is("8")').last().tap(); await sleep(300);
    check('wine: 8.75 bottles, 8 full + 7½ tenths', (await txt('text-bottles-result')).startsWith('8.75') && (await txt('text-tenths-result')) === '8 full + 7½ tenths', (await txt('text-bottles-result')) + ' / ' + (await txt('text-tenths-result')));
    check('wine: 37 glasses of 175ml (not 25ml measures)', (await txt('text-measures-result')) === '37 glasses of 175ml', await txt('text-measures-result'));
    check('prompt offered: Want it exact? Weigh the bottle', /Want it exact\? Weigh the bottle/.test(await txt('button-want-exact')), await txt('button-want-exact'));
    await tap('button-save-entry', 1800);
    e = (await entries()).find(x => x.product_id === WINE);
    check('wine saved as 6562ml (8.75 × 750)', e && Math.round(e.ml_remaining) === 6563 || e && Math.round(e.ml_remaining) === 6562, JSON.stringify(e && e.ml_remaining));

    for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, 700); break; }
    await tap('button-review-stocktake', 1200);
    await tap('button-toggle-entry-sheet', 500);
    const sheetTxt = (await T('entry-sheet').innerText());
    const rowOf = async id => (await T(`entry-row-${id}`).innerText()).replace(/\s+/g, ' ');
    check('entry sheet: spirits before wines', /SPIRITS[\s\S]*WINES/.test(sheetTxt), sheetTxt.replace(/\n/g,' | ').slice(0,200));
    check('entry sheet: gin 2 full 7 tenths in a 70cl', /10 70cl 2 full 7 tenths/.test(await rowOf(GIN)), await rowOf(GIN));
    check('entry sheet: wine 8 full 7½ tenths in a 75cl', /10 75cl 8 full 7½ tenths/.test(await rowOf(WINE)), await rowOf(WINE));
    await T('entry-sheet').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/entry-bottles.png` });
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/eX2.png` }); }
  console.log(results.filter(r => /entry sheet|ERROR|no page errors/.test(r)).join('\n')); await b.close();
})();
