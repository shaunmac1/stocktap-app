// As-user test: a brand-new pub gets its first number in a couple of minutes. Tap 5 bottles,
// say how full each is by eye (no scale), see what they're worth on the shelf and over the bar.
// Needs mock-newpub.cjs + static.cjs. iPhone size.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const T = tid => p.locator(`[data-testid="${tid}"]:visible`).first();
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  const tap = async (tid, w = 500) => { await T(tid).waitFor({ state: 'visible', timeout: 10000 }); await T(tid).scrollIntoViewIfNeeded(); await T(tid).tap(); await sleep(w); };
  const txt = async tid => (await T(tid).innerText().catch(() => '')).replace(/\n+/g, ' | ');
  const products = async () => (await (await fetch('http://localhost:8899/rest/v1/products?select=*')).json());
  let taps = 0; const t0 = Date.now();
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check('a new pub is offered a number in 2 minutes, first thing', /Want a number in 2 minutes\?/.test(await txt('button-quick-five')), await txt('button-quick-five'));
    await p.screenshot({ path: `${SHOT}/q0-home.png` });
    await tap('button-quick-five', 2500); taps++;
    const head = (await p.locator('h1').first().innerText());
    check('heading: Your first number, in 2 minutes', head === 'Your first number, in 2 minutes', head);
    check('12 one-tap bottles, no typing', (await p.locator('[data-testid^="quick-pick-"]').count()) === 12, String(await p.locator('[data-testid^="quick-pick-"]').count()));
    check('the standard 70cl is offered, not the litre', (await has('quick-pick-q2')) && !(await has('quick-pick-q1')));
    check('nothing in the library yet', (await products()).length === 0);
    await p.screenshot({ path: `${SHOT}/q1-picks.png` });
    for (const id of ['q2', 'q3', 'q4', 'q5', 'q8']) { await tap(`quick-pick-${id}`, 700); taps++; }
    check('5 of 5 picked', /5 of 5 picked/.test(await p.locator('body').innerText()));
    check('picked ones show as on', (await T('quick-pick-q3').getAttribute('aria-pressed')) === 'true');
    await tap('quick-pick-q3', 400); check('tap again takes it off: 4 of 5', /4 of 5 picked/.test(await p.locator('body').innerText()));
    await tap('quick-pick-q3', 400); check('and back on without adding it twice', /5 of 5 picked/.test(await p.locator('body').innerText()) && (await products()).length === 5, String((await products()).length));
    await p.screenshot({ path: `${SHOT}/q2-picked.png` });
    await tap('button-first-count-start', 2500); taps++;
    const prods = await products();
    let first = true;
    for (const pr of prods) {
      for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, 600); break; }
      await tap(`counting-product-${pr.id}`, 800); taps++;
      if (!(await has('tenths-quick-5')) && (await has('button-add-entry'))) { await tap('button-add-entry', 600); taps++; }
      if (await has('button-location-loc-bar')) { await tap('button-location-loc-bar', 600); taps++; }
      if (first) {
        check('straight to "how full is it?" by eye, though bottle weights are on file', await has('tenths-quick-5'));
        check('no "weigh a full bottle" wall', !(await has('full-bottle-setup')) && !/Weigh one full/i.test(await p.locator('body').innerText()));
        await p.screenshot({ path: `${SHOT}/q3-tenths.png` });
      }
      await tap('tenths-quick-5', 250); taps++;
      if (first) {
        check('half a bottle: 0.5 bottles, 14 measures of 25ml', (await txt('text-bottles-result')).startsWith('0.5') && (await txt('text-measures-result')) === '14 measures of 25ml', (await txt('text-bottles-result')) + ' / ' + (await txt('text-measures-result')));
        first = false;
      }
      await tap('button-save-entry', 1500); taps++;
    }
    for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, 600); break; }
    await tap('button-review-stocktake', 1200); taps++;
    const body = (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
    check('review: £40.00 on the shelf (5 half bottles at £16)', /Total Stock Value \| £40\.00/.test(body), body.slice(0, 200));
    check('and what it takes over the bar: £280.00 (70 measures at £4)', /£280\.00/.test(await txt('text-bar-value')), await txt('text-bar-value'));
    check('says the prices are estimates, not fact', /some are estimates/.test(await txt('text-bar-value')), await txt('text-bar-value'));
    await p.screenshot({ path: `${SHOT}/q4-result.png` });
    await tap('button-finish-stocktake', 2500); taps++;
    check('quick mode is switched off after the count', (await p.evaluate(() => localStorage.getItem('stocktap:quick-count'))) === null);
    const st = await (await fetch('http://localhost:8899/rest/v1/stocktakes?select=*')).json();
    check('the count is closed with its value', st.length === 1 && st[0].status === 'closed' && Math.round(Number(st[0].total_value)) === 40, JSON.stringify(st.map(s => [s.status, s.total_value])));
    check(`whole journey in ${taps} taps`, taps <= 30, String(taps));
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/qX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
