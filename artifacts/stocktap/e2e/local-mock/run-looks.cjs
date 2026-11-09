const { chromium } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const P = id => `aaaaaaaa-0000-4000-8000-00000000000${id}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const tap = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ timeout: 10000 }).catch(() => { throw new Error('not visible: ' + tid); }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(700); };
  const plus = async k => { for (let i = 0; i < k; i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click(); };
  const count = async (id, full, gal, pt) => { await tap(`counting-product-${id}`); await sleep(400); if (!(await p.locator('[data-testid="draught-gauge-entry"]:visible').count())) await tap('button-add-entry'); if (await p.locator('[data-testid="button-keg-mode-kegs"]:visible').count()) await tap('button-keg-mode-kegs'); if (await p.locator('[data-testid="button-dip-mode-pints"]:visible').count()) await tap('button-dip-mode-pints'); await plus(full); if (gal) await p.locator('[data-testid="input-part-gallons"]:visible').fill(String(gal)); if (pt) await tap(`button-part-pints-${pt}`); await sleep(300); await tap('button-save-entry'); await sleep(900); await tap('button-back-to-products'); };
  const A = P('a'), B = P('b');
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap('button-new-stocktake'); await tap(`select-product-${A}`); await tap(`select-product-${B}`); await tap('button-start-stocktake'); await sleep(1200);
    await tap('button-count-spot-loc-cellar');
    await count(A, 9, 10, 0);   // 109 gal, last count 80 gal, no delivery -> flagged (+29 gal)
    await count(B, 2, 4, 5);    // 22 gal 5 pt, last 10 gal + 2 casks (18 gal) delivered -> fine
    await tap('button-review-stocktake'); await sleep(1500);
    check('looks-wrong banner on review', await p.locator('[data-testid="banner-looks-wrong"]').isVisible());
    const t = await p.locator('[data-testid="banner-looks-wrong"]').innerText().catch(() => '');
    check('Carlsberg flagged: up 29 gal with no delivery', /Carlsberg[\s\S]*Up 29 gal 0 pt since .*, with no delivery logged/.test(t), t.replace(/\n/g, ' | '));
    check('Hobgoblin Gold NOT flagged (delivery covers it)', !/Hobgoblin/.test(t));
    await p.locator('[data-testid="banner-looks-wrong"]').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/lw1.png` });
    await tap(`looks-wrong-${A}`); await sleep(800);
    check('tapping the flag opens that line to recount', /Carlsberg/.test(await p.locator('body').innerText()) && await p.locator('[data-testid^="button-edit-entry-"]:visible').count() > 0);
    // Switch it off in Settings, then the flag is gone from review
    await p.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await p.getByRole('tab', { name: 'Counting' }).click(); await sleep(600);
    check('Settings shows the switch, on by default', (await p.locator('[data-testid="switch-looks-wrong"]').getAttribute('data-state')) === 'checked');
    await tap('switch-looks-wrong'); await sleep(1200);
    let lg = await (await fetch('http://localhost:8899/__log')).json();
    check('switch saved as off', (await p.locator('[data-testid="switch-looks-wrong"]').getAttribute('data-state')) === 'unchecked');
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await p.locator('[data-testid^="button-open-stocktake-"]').first().click(); await sleep(1500);
    await tap('button-review-stocktake'); await sleep(1500);
    check('flag gone from review when switched off', await p.locator('[data-testid="banner-looks-wrong"]').count() === 0);
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/lwX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
