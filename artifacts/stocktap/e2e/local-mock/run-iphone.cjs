const { chromium, devices } = require('playwright');
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
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const tapT = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ timeout: 10000 }); await l.scrollIntoViewIfNeeded(); await l.tap(); await sleep(500); };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tapT('button-new-stocktake'); await tapT(`select-product-${P('a')}`); await tapT('button-start-stocktake'); await sleep(1000);
    await tapT('button-count-spot-loc-outside'); await tapT(`counting-product-${P('a')}`); await sleep(600);
    if (await p.locator('[data-testid="button-keg-mode-kegs"]:visible').count()) await tapT('button-keg-mode-kegs');
    await tapT('button-full-plus'); await tapT('button-full-plus');
    console.log('after 2 taps on +, full box shows', await p.locator('[data-testid="input-full-containers"]:visible').inputValue());
    await tapT('input-part-gallons'); await p.keyboard.type('2'); await sleep(400);
    console.log('gallons box shows', await p.locator('[data-testid="input-part-gallons"]:visible').inputValue());
    console.log('result', await p.locator('[data-testid="text-keg-result"]').innerText().catch(() => '-')); console.log('save button', await p.locator('[data-testid="button-save-entry"]').innerText()); console.log('touch-action on +', await p.locator('[data-testid="button-full-plus"]:visible').first().evaluate(e => getComputedStyle(e).touchAction));
    await p.screenshot({ path: `${SHOT}/ip1.png` });
    await tapT('button-save-entry'); await sleep(1200);
    const L = await (await fetch('http://localhost:8899/__log')).json();
    const ins = L.log.filter(x => x.insert === 'stocktake_line_entries').flatMap(x => x.items);
    console.log('saved', JSON.stringify(ins.map(i => ({ full: i.full_containers, part: i.part_value }))));
  } catch (e) { console.log('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/ipX.png` }); }
  console.log('errors', errors.slice(0, 3)); await b.close();
})();
