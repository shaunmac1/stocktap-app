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
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png` });
  const tap = async (tid, t = 10000) => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); try { await l.waitFor({ state: 'visible', timeout: t }); } catch (e) { throw new Error('not visible: ' + tid); } await l.scrollIntoViewIfNeeded(); await l.click({ force: true }); await sleep(400); };
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const count = async (loc, full, gal, pt) => {
    await tap('button-add-entry'); await sleep(400); if (!(await p.locator(`[data-testid="button-location-${loc}"]:visible`).count())) await tap('button-change-spot'); await tap(`button-location-${loc}`); await sleep(500);
    if (await p.locator('[data-testid="button-keg-mode-kegs"]').count()) await tap('button-keg-mode-kegs');
    for (let i = 0; i < full; i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click();
    if (gal) await p.locator('[data-testid="input-part-gallons"]:visible').first().fill(String(gal));
    if (pt) await tap(`button-part-pints-${pt}`);
    await sleep(300); await tap('button-save-entry'); await sleep(1200);
  };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('button-new-stocktake'); await sleep(800);
    await tap(`select-product-${P('a')}`); await tap('button-start-stocktake'); await sleep(1500);
    await tap(`counting-product-${P('a')}`); await sleep(500);
    await count('loc-cellar', 9, 10, 0);
    await count('loc-outside', 4, 0, 0);
    await shot('e1-two-stores');
    const body = await p.locator('body').innerText();
    check('Cellar line: 9 full + 10 gal 0 pt', /Cellar[\s\S]{0,80}9 full \+ 10 gal 0 pt/.test(body));
    check('Outside line: 4 full kegs = 44 gal 0 pt', /Outside store[\s\S]{0,40}44 gal 0 pt/.test(body));
    const tot = (await p.locator('text=Total across all spots').locator('..').innerText());
    check('Total across both stores = 153 gal 0 pt (Venners)', tot.includes('153 gal 0 pt'), tot.replace(/\n/g, ' '));
    // survives a reload (saved on the phone before syncing)
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500);
    await p.getByRole('button', { name: 'Resume' }).first().click(); await sleep(1500);
    await tap(`counting-product-${P('a')}`); await sleep(800);
    const b2 = await p.locator('body').innerText();
    check('after reload + Resume, both stores still add to 153 gal 0 pt', b2.includes('153 gal 0 pt'));
    await shot('e2-after-reload');
    const lg = await (await fetch('http://localhost:8899/__log')).json();
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await shot('eX-error'); }
  console.log(results.join('\n')); await b.close();
})();
