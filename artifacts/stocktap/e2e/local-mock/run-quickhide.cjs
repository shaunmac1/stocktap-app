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
  const A = P('a'), B = P('b');
  const log = async () => (await fetch('http://localhost:8899/__log')).json();
  try {
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await p.locator(`[data-testid="button-quick-hide-${A}"]`).click(); await sleep(1200);
    check('Library: one tap Hide removes Carlsberg', await p.locator(`[data-testid="card-product-${A}"]`).count() === 0);
    check('saved to the server', !!(await log()).products.find(x => x.id === A).hidden_at);
    await p.screenshot({ path: `${SHOT}/qh1.png` });
    await p.locator('[data-testid="button-undo-hide"]').click(); await sleep(1500);
    check('Undo brings it back', await p.locator(`[data-testid="card-product-${A}"]`).count() > 0 && !(await log()).products.find(x => x.id === A).hidden_at);
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await p.locator('[data-testid="button-new-stocktake"]').click(); await sleep(800);
    await p.locator(`[data-testid="select-product-${B}"]`).click(); await sleep(300);
    await p.locator(`[data-testid="button-quick-hide-${B}"]`).click(); await sleep(1200);
    check('Count picker: one tap Hide removes Hobgoblin Gold', await p.locator(`[data-testid="select-product-${B}"]`).count() === 0);
    check('category count drops to 0 ale, button says 1 line', !(await p.locator('[data-testid="button-category-filter-draught_ale"]').count()) && /Tick all draught \(1 line\)/.test(await p.locator('[data-testid="button-select-all-draught"]').innerText())); check('and unticks it (0 selected)', /^0 selected/.test(await p.locator('[data-testid="text-selected-count"]').innerText()));
    await p.screenshot({ path: `${SHOT}/qh2.png` });
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/qhX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
