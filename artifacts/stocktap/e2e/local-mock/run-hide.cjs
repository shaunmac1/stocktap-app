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
  const A = P('a'), B = P('b');
  try {
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('Carlsberg in the library', await p.locator(`[data-testid="card-product-${A}"]`).count() > 0);
    await tap(`button-edit-${A}`); await sleep(500);
    await p.screenshot({ path: `${SHOT}/h1-sheet.png` });
    await tap('button-hide-product'); await sleep(1500);
    check('Carlsberg gone from the list after Hide', await p.locator(`[data-testid="card-product-${A}"]`).count() === 0);
    await tap('button-toggle-hidden-lines');
    check('Carlsberg under Hidden lines', await p.locator(`[data-testid="card-hidden-${A}"]`).isVisible());
    await p.screenshot({ path: `${SHOT}/h2-hidden-list.png`, fullPage: true });
    let lg = await (await fetch('http://localhost:8899/__log')).json();
    check('saved to the server', !!lg.products.find(x => x.id === A).hidden_at);
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap('button-new-stocktake');
    check('hidden line not offered in a new stocktake', await p.locator(`[data-testid="select-product-${A}"]`).count() === 0 && await p.locator(`[data-testid="select-product-${B}"]`).count() > 0);
    await p.goto('http://localhost:5173/spot-check', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    check('hidden line not offered in a spot check', await p.locator(`[data-testid="button-select-product-${A}"]`).count() === 0);
    // OFFLINE: hide Hobgoblin with no signal
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await ctx.setOffline(true);
    await tap(`button-edit-${B}`); await tap('button-hide-product'); await sleep(1500);
    const toastTxt = await p.locator('body').innerText();
    check('offline hide works and says it will sync', /Saved on this phone/.test(toastTxt) && await p.locator(`[data-testid="card-product-${B}"]`).count() === 0);
    lg = await (await fetch('http://localhost:8899/__log')).json();
    check('not on the server yet while offline', !lg.products.find(x => x.id === B).hidden_at);
    await ctx.setOffline(false); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500);
    lg = await (await fetch('http://localhost:8899/__log')).json();
    check('synced to the server once back online', !!lg.products.find(x => x.id === B).hidden_at);
    // Show again
    await tap('button-toggle-hidden-lines'); await tap(`button-show-again-${A}`); await sleep(1500);
    check('Show again puts Carlsberg back', await p.locator(`[data-testid="card-product-${A}"]`).count() > 0);
    lg = await (await fetch('http://localhost:8899/__log')).json();
    check('shown again on the server', !lg.products.find(x => x.id === A).hidden_at);
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/hX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
