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
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const tap = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ timeout: 10000 }).catch(() => { throw new Error('not visible: ' + tid); }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(700); };
  const txt = async tid => (await p.locator(`[data-testid="${tid}"]`).first().innerText().catch(() => '')).trim();
  try {
    await p.goto('http://localhost:5173/spot-check', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap(`button-select-product-${P('b')}`); await tap('button-start-spot-check'); await sleep(1000);
    if (!/Counting at:\s*\n?Cellar/.test(await p.locator('body').innerText())) { await tap('button-show-location-picker'); await tap('button-count-location-loc-cellar'); }
    for (let i = 0; i < 2; i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click();
    await p.locator('[data-testid="input-part-gallons"]:visible').fill('4'); await tap('button-part-pints-5');
    await tap('button-save-location-entry'); await sleep(800);
    await tap('button-enter-till'); await sleep(800);
    check('line check card shows', await p.locator('[data-testid="line-check-card"]').isVisible());
    check('delivery since last count is included (2 casks = 144 pints)', /144 pints · 18 gal 0 pt/.test(await txt('line-check-delivered')), await txt('line-check-delivered'));
    check('gone = 10 gal + 18 gal delivered − 22 gal 5 pt = 43 pints · 5 gal 3 pt', /43 pints · 5 gal 3 pt/.test(await txt('line-check-gone')), await txt('line-check-gone'));
    await p.locator('[data-testid="line-check-card"]').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/lc1.png` });
    // till sold 40 pints
    for (const ch of '40') { await p.getByRole('button', { name: ch, exact: true }).first().click(); await sleep(120); } await sleep(400);
    check('missing = 3 pints · 0 gal 3 pt with £', /Missing[\s\S]*3 pints · 0 gal 3 pt · £/.test(await txt('line-check-missing')), await txt('line-check-missing'));
    check('variance box talks in pints, not measures', /pints unaccounted for/.test(await txt('variance-display')), (await txt('variance-display')).split('\n')[0]);
    await p.locator('[data-testid="line-check-card"]').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/lc2.png` });
    const top = await p.locator('body').innerText(); check('summary agrees: 181 pints remaining, gone 43 pints', /181 pints remaining/.test(top) && /Gone since last check: 43 pints/.test(top));
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/lcX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
