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
  const A = P('a');
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap('button-new-stocktake'); await tap(`select-product-${A}`); await tap('button-start-stocktake'); await sleep(1200);
    await tap('button-count-spot-loc-cellar'); await tap(`counting-product-${A}`); await sleep(500);
    if (await p.locator('[data-testid="button-keg-mode-kegs"]:visible').count()) await tap('button-keg-mode-kegs');
    for (let i = 0; i < 9; i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click();
    await p.locator('[data-testid="input-part-gallons"]:visible').fill('10'); await sleep(300); await tap('button-save-entry'); await sleep(900);
    const editBtn = p.locator('[data-testid^="button-edit-entry-"]:visible').first();
    check('saved count has an Edit button', await editBtn.count() > 0);
    await editBtn.click(); await sleep(800);
    const full = await p.locator('[data-testid="input-full-containers"]:visible').inputValue();
    const gal = await p.locator('[data-testid="input-part-gallons"]:visible').inputValue();
    check('Edit opens with the saved numbers (9 full, 10 gal)', full === '9' && gal === '10', `full=${full} gal=${gal}`);
    // fix a typo: it was 8 full + 6 gal 2 pt
    await p.locator('[data-testid="button-full-minus"]:visible').first().click(); await sleep(200);
    await p.locator('[data-testid="input-part-gallons"]:visible').fill('6'); await tap('button-part-pints-2'); await sleep(300);
    check('button says Save changes', /Save changes/.test(await p.locator('[data-testid="button-save-entry"]').innerText()));
    await tap('button-save-entry'); await sleep(1000);
    check('no replace/add question when editing', await p.locator('[data-testid="dup-spot-ask"]').count() === 0);
    const body = await p.locator('body').innerText();
    // 8 x 87.99 + 50 = 753.9 pints = 94 gal 2 pt
    check('one Cellar count, now 94 gal 2 pt', (body.match(/TOTAL ACROSS ALL SPOTS\s*\n([^\n]+)/) || [])[1] === '94 gal 2 pt', (body.match(/TOTAL ACROSS ALL SPOTS\s*\n([^\n]+)/) || [])[1]);
    check('still just one entry', await p.locator('[data-testid^="button-delete-entry-"]:visible').count() === 1);
    await p.screenshot({ path: `${SHOT}/e-edited.png` });
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/eX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
