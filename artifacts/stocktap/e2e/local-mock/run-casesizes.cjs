// As-user test: set every case size on one screen from the Library (iPhone size), with no signal.
// Needs mock-packaged.cjs + static.cjs.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const B = n => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const txt = async tid => (await p.locator(`[data-testid="${tid}"]`).first().innerText().catch(() => '')).replace(/\n/g, ' | ');
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  const pack = async n => (await (await fetch(`http://localhost:8899/rest/v1/products?id=eq.${B(n)}`)).json())[0].pack_size;
  const pressed = async (n, size) => (await p.locator(`[data-testid="case-chip-${B(n)}-${size}"]`).getAttribute('aria-pressed')) === 'true';
  try {
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(4500);
    check('banner: 4 bottle and can lines have no case size', /4 bottle and can lines have no case size/.test(await txt('banner-set-case-sizes')), await txt('banner-set-case-sizes'));
    await p.locator('[data-testid="banner-set-case-sizes"]').tap(); await sleep(700);
    check('one screen lists the 4 lines (not the one already set)', (await p.locator('[data-testid^="case-row-"]').count()) === 4 && !(await has(`case-row-${B(5)}`)));
    check('usual sizes are picked: J2O 24, Peroni 24, Hooch 24, crisps left for later', (await pressed(1, 24)) && (await pressed(2, 24)) && (await pressed(4, 24)) && (await pressed(3, 0)));
    check('button counts what will be set: Set 3 lines', (await txt('button-save-case-sizes')) === 'Set 3 lines', await txt('button-save-case-sizes'));
    await p.screenshot({ path: `${SHOT}/c1-dialog.png` });
    await p.locator(`[data-testid="case-chip-${B(2)}-12"]`).tap(); await sleep(200);
    await p.locator(`[data-testid="case-chip-${B(3)}-1"]`).tap(); await sleep(200);
    check('changed: Peroni to 12, crisps one by one → Set 4 lines', (await pressed(2, 12)) && !(await pressed(2, 24)) && (await pressed(3, 1)) && (await txt('button-save-case-sizes')) === 'Set 4 lines', await txt('button-save-case-sizes'));
    check('nothing saved before the button', (await pack(1)) == null && (await pack(2)) == null);
    await ctx.setOffline(true);
    await p.locator('[data-testid="button-save-case-sizes"]').tap(); await sleep(1500);
    check('no signal: saves on the phone, banner gone', !(await has('dialog-case-sizes')) && !(await has('banner-set-case-sizes')));
    check('no signal: not on the server yet', (await pack(1)) == null);
    await ctx.setOffline(false);
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(4500);
    check('back online: J2O 24, Peroni 12, crisps 1, Hooch 24 on the server', (await pack(1)) === 24 && (await pack(2)) === 12 && (await pack(3)) === 1 && (await pack(4)) === 24, [await pack(1), await pack(2), await pack(3), await pack(4)].join(','));
    check('Old Mout (already 12) untouched', (await pack(5)) === 12);
    check('banner stays gone', !(await has('banner-set-case-sizes')));
    // the count screen now goes straight to cases
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await p.locator('[data-testid="button-new-stocktake"]:visible').tap(); await sleep(800);
    if (await has(`select-product-${B(2)}`)) { await p.locator(`[data-testid="select-product-${B(2)}"]`).tap(); await sleep(200); }
    await p.locator('[data-testid="button-start-stocktake"]:visible').tap(); await sleep(1500);
    await p.locator(`[data-testid="counting-product-${B(2)}"]:visible`).tap(); await sleep(900);
    if (await has('button-add-entry')) { await p.locator('[data-testid="button-add-entry"]:visible').tap(); await sleep(700); }
    if (await has('button-location-loc-cellar')) { await p.locator('[data-testid="button-location-loc-cellar"]:visible').tap(); await sleep(600); }
    await p.screenshot({ path: `${SHOT}/c2-count.png` });
    check('count screen goes straight to FULL CASES (12) for Peroni, no question', /FULL CASES \(12\)/i.test(await txt('label-full-cases')) && !(await has('case-size-question')), await txt('label-full-cases'));
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/cX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
