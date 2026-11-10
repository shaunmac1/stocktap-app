const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const A = 'aaaaaaaa-0000-4000-8000-00000000000a', B = 'aaaaaaaa-0000-4000-8000-00000000000b';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const T = tid => p.locator(`[data-testid="${tid}"]:visible`).first();
  const tap = async (tid, w = 500) => { await T(tid).waitFor({ state: 'visible', timeout: 10000 }); await T(tid).scrollIntoViewIfNeeded(); await T(tid).tap(); await sleep(w); };
  const txt = async tid => (await T(tid).innerText().catch(() => '')).replace(/\n/g, ' | ');
  const entries = async () => (await (await fetch('http://localhost:8899/rest/v1/stocktake_line_entries?select=*')).json());
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('button-new-stocktake', 800); await tap(`select-product-${A}`); await tap('button-start-stocktake', 1500);
    if (await p.locator(`[data-testid="counting-product-${A}"]:visible`).count()) await tap(`counting-product-${A}`);
    await tap('button-add-entry', 600); if (!(await p.locator('[data-testid="button-location-loc-cellar"]:visible').count())) await tap('button-change-spot'); await tap('button-location-loc-cellar', 600);
    if (await p.locator('[data-testid="button-keg-mode-kegs"]:visible').count()) await tap('button-keg-mode-kegs');
    check('gallon buttons 0-10 for an 11 gallon keg', await p.locator('[data-testid^="button-part-gallons-"]:visible').count() === 11, String(await p.locator('[data-testid^="button-part-gallons-"]:visible').count()));
    await tap('button-full-plus'); await tap('button-full-plus');
    await tap('button-part-gallons-4');
    check('tap 4 gallons: Save says 2 full + 4 gal 0 pt = 26 gal', /2 full \+ 4 gal 0 pt = 26 gal 0 pt/.test(await txt('button-save-entry')), await txt('button-save-entry'));
    await p.screenshot({ path: `${SHOT}/g1.png` });
    await tap('button-save-entry', 2000);
    let e = (await entries()).find(x => x.product_id === A && x.count_location_id === 'loc-cellar');
    check('saved as 32 pints in the part keg, not 4', e && Number(e.part_value) === 32 && e.full_containers === 2, JSON.stringify(e && [e.full_containers, e.part_value]));
    // the old mistake: tapping the pints row for a gallons reading
    await tap('button-add-entry', 600); if (await p.locator('[data-testid="button-change-spot"]:visible').count() && !(await p.locator('[data-testid="button-location-loc-outside"]:visible').count())) await tap('button-change-spot'); await tap('button-location-loc-outside', 600);
    if (await p.locator('[data-testid="button-keg-mode-kegs"]:visible').count()) await tap('button-keg-mode-kegs');
    await tap('button-part-pints-3');
    check('pints only: asks "Only 3 pints left?"', /Only 3 pints left in the open keg/.test(await txt('warn-pints-only')), await txt('warn-pints-only'));
    await p.screenshot({ path: `${SHOT}/g2.png` });
    await tap('button-pints-to-gallons');
    check('one tap turns it into 3 gallons', /3 gal 0 pt/.test(await txt('button-save-entry')) && await p.locator('[data-testid="warn-pints-only"]:visible').count() === 0, await txt('button-save-entry'));
    await tap('button-part-pints-5');
    check('gallons and odd pints together: 3 gal 5 pt', /3 gal 5 pt/.test(await txt('button-save-entry')), await txt('button-save-entry'));
    await tap('button-save-entry', 2000);
    e = (await entries()).find(x => x.product_id === A && x.count_location_id === 'loc-outside');
    check('saved 29 pints (3 gal 5 pt)', e && Number(e.part_value) === 29, JSON.stringify(e && e.part_value));
    // typing still works, with a half gallon
    await p.goto('http://localhost:5173/line-check', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap(`pt-${B}-4`);
    check('line check: same question for pints only', /Only 4 pints left/.test(await txt(`warn-pints-only-${B}`)), await txt(`warn-pints-only-${B}`));
    await tap(`button-pints-to-gallons-${B}`);
    check('line check: becomes 4 gallons', (await T(`gal-${B}`).inputValue()) === '4' && /4 gal 0 pt \(32 pints\)/.test(await txt(`result-${B}`)), await txt(`result-${B}`));
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/gX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
