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
  const tap = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ timeout: 10000 }).catch(() => { throw new Error('not visible: ' + tid); }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(800); };
  const plus = async k => { for (let i = 0; i < k; i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click(); };
  const toCellar = async () => { if (!/Counting at:\s*\n?Cellar/.test(await p.locator('body').innerText())) { await tap('button-show-location-picker'); await tap('button-count-location-loc-cellar'); } };
  const total = async () => (await p.locator('[data-testid="text-running-total"]').innerText().catch(() => '')).trim();
  try {
    await p.goto('http://localhost:5173/spot-check', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap(`button-select-product-${P('a')}`); await tap('button-start-spot-check'); await sleep(1000);
    await toCellar(); await plus(9); await p.locator('[data-testid="input-part-gallons"]:visible').fill('6'); await sleep(300);
    await tap('button-save-location-entry');
    check('first Cellar entry saves straight away', await total() === '93 gal 7 pt' || /gal/.test(await total()), await total());
    const t1 = await total();
    await toCellar(); await p.locator('[data-testid="input-part-gallons"]:visible').fill('3'); await sleep(300);
    await tap('button-save-location-entry');
    check('second Cellar entry asks replace or add', await p.locator('[data-testid="sc-dup-ask"]').isVisible());
    await tap('button-sc-dup-add'); await sleep(800);
    check('Add to it: Cellar = before + 3 gal', await total() !== t1 && /gal/.test(await total()), `${t1} -> ${await total()}`);
    const t2 = await total();
    await toCellar(); await plus(8); await p.locator('[data-testid="input-part-gallons"]:visible').fill('2'); await sleep(300);
    await tap('button-save-location-entry'); await tap('button-sc-dup-replace'); await sleep(800);
    // 8 full (8*87.99=703.9) + 16 pints = 719.9 -> 90 gal 0 pt
    check('Replace it: Cellar is just the recount (90 gal 0 pt)', await total() === '90 gal 0 pt', `${t2} -> ${await total()}`);
    check('still one Cellar entry', await p.locator('[data-testid^="row-entry-"]').count() === 1);
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/scX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
