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
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', recordVideo: { dir: '/tmp/uitest/guide', size: { width: 390, height: 844 } } });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  let n = 0; const shot = async name => p.screenshot({ path: `${SHOT}/g${String(++n).padStart(2,'0')}-${name}.png` });
  const cap = async (txt, ms = 2600) => {
    await p.evaluate(t => { let d = document.getElementById('__cap'); if (!d) { d = document.createElement('div'); d.id = '__cap'; d.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;z-index:2147483647;background:rgba(18,28,24,.92);color:#fff;font:600 17px/1.3 system-ui,-apple-system,sans-serif;padding:12px 14px;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none;border-left:5px solid #E0A343'; document.body.appendChild(d); } d.innerHTML = t; d.style.display = t ? 'block' : 'none'; }, txt);
    await sleep(ms);
  };
  const tap = async (tid, wait = 700) => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw new Error('not visible: ' + tid); }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(wait); };
  const plus = async k => { for (let i = 0; i < k; i++) { await p.locator('[data-testid="button-full-plus"]:visible').first().click(); await sleep(220); } };
  const gal = async v => { const l = p.locator('[data-testid="input-part-gallons"]:visible').first(); await l.scrollIntoViewIfNeeded(); await l.click(); await l.pressSequentially(String(v), { delay: 220 }); await sleep(500); };
  const results = []; const check = (nm, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${nm} ${d}`);
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await cap('<b>PART 1: Barrel stocktake</b><br>Tap Stocktake at the bottom, then Start New Stocktake', 3200); await shot('start');
    await tap('button-new-stocktake', 900);
    await cap('Tick the draught lines you want to count', 1800);
    await tap(`select-product-${P('a')}`, 400); await tap(`select-product-${P('b')}`, 400); await shot('picked');
    await tap('button-start-stocktake', 1300);
    await cap('Tap a line to count it. Start with Carlsberg', 2000);
    await tap(`counting-product-${P('a')}`, 700); await tap('button-add-entry', 700);
    if (await p.locator('[data-testid="button-location-loc-cellar"]:visible').count()) { await cap('Pick where you are: <b>Cellar</b>', 1800); await tap('button-location-loc-cellar', 800); }
    if (await p.locator('[data-testid="button-keg-mode-kegs"]:visible').count()) await tap('button-keg-mode-kegs', 400);
    await cap('Check the keg size is right (tap Change if not), then count the <b>full kegs</b> with +', 2600);
    await plus(9);
    await cap('Read the open keg off your gauge. Type the <b>gallons</b>, tap the <b>pints</b>', 2200);
    await gal(10); await p.locator('[data-testid="text-keg-result"]').scrollIntoViewIfNeeded();
    await cap('9 full + 10 gal = <b>109 gal 0 pt</b>, the Venners figure. Underneath: <b>872 pints · 109 gal · 9.9 kegs</b>. Tap Save', 3800); await shot('cellar');
    await tap('button-save-entry', 1400);
    await cap('Now the <b>Outside store</b>. Tap <b>Some in another spot too</b>', 2600);
    await tap('button-add-entry', 600);
    if (!(await p.locator('[data-testid="button-location-loc-outside"]:visible').count())) await tap('button-change-spot', 600);
    await tap('button-location-loc-outside', 800);
    await plus(4); await cap('4 full kegs outside, no open one. Save', 2200); await tap('button-save-entry', 1400);
    await p.locator('text=Total across all spots').scrollIntoViewIfNeeded().catch(() => {});
    await cap('Both stores added up for you: <b>153 gal 0 pt</b>', 3200); await shot('total');
    const body = await p.locator('body').innerText(); check('stocktake total 153 gal 0 pt', body.includes('153 gal 0 pt')); check('breakdown shows pints, gallons and kegs', body.includes('1224 pints · 153 gal 0 pt · 13.9 kegs'));
    await tap('button-back-to-products', 800);
    await cap('Casks work the same. Hobgoblin Gold in the cellar', 2000);
    await tap(`counting-product-${P('b')}`, 700); await tap('button-add-entry', 700);
    if (!(await p.locator('[data-testid="draught-gauge-entry"]:visible').count())) { if (await p.locator('[data-testid="button-change-spot"]:visible').count()) {} }
    if (await p.locator('[data-testid="button-location-loc-cellar"]:visible').count()) await tap('button-location-loc-cellar', 800);
    else if ((await p.locator('body').innerText()).includes('OUTSIDE STORE')) { await tap('button-change-spot', 500); await tap('button-location-loc-cellar', 800); }
    if (await p.locator('[data-testid="button-dip-mode-pints"]:visible').count()) await tap('button-dip-mode-pints', 400);
    await plus(2); await gal(4); await tap('button-part-pints-5', 500);
    await p.locator('[data-testid="text-keg-result"]').scrollIntoViewIfNeeded();
    await cap('2 full casks + 4 gal 5 pt = <b>22 gal 5 pt</b>. Save', 2800); await shot('cask');
    await tap('button-save-entry', 1400); await tap('button-back-to-products', 800);
    await cap('All counted? Tap <b>Review</b>, then <b>Finish</b>', 2200);
    if (await p.locator('[data-testid="button-all-counted-review"]:visible').count()) await tap('button-all-counted-review', 1200); else await tap('button-review-stocktake', 1200);
    await shot('review');
    await tap('button-finish-stocktake', 2200); await shot('finished');
    await cap('<b>Where it\'s saved:</b> Stocktake tab → Past stocktakes, and the <b>Reports</b> tab', 3000);
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(2200);
    await cap('<b>Where it\'s saved:</b> every count is listed here under Past stocktakes', 3000); await shot('past');
    await p.goto('http://localhost:5173/reports', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await cap('…and in <b>Reports</b>: stock value, by location, and a Venners-style audit', 3200); await shot('reports');
    // PART 2: spot check
    await p.goto('http://localhost:5173/spot-check', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await cap('<b>PART 2: Spot check</b><br>A quick check of a few lines between stocktakes', 3000);
    await cap('Tick Carlsberg, then Start Check', 1800);
    await tap(`button-select-product-${P('a')}`, 500); await tap('button-start-spot-check', 1300);
    await cap('Same gauge screen. Make sure it says <b>Counting at: Cellar</b>', 2400); await shot('sc-start');
    await plus(9); await gal(6);
    await cap('Count today: 9 full + 6 gal. Tap Save Cellar entry', 2400);
    await tap('button-save-location-entry', 1400);
    await cap('Outside store: tap <b>Counting at</b> to switch if it hasn\'t already', 2200);
    if ((await p.locator('body').innerText()).includes('Counting at:\nCellar')) { await tap('button-show-location-picker', 500); await tap('button-count-location-loc-outside', 700); }
    await plus(4); await tap('button-save-location-entry', 1400);
    await p.locator('[data-testid="text-running-total"]').scrollIntoViewIfNeeded();
    await cap('Running total for both stores: <b>149 gal 0 pt</b>', 2800); await shot('sc-total');
    const sc = await p.locator('body').innerText(); check('spot check total 149 gal 0 pt', sc.includes('149 gal 0 pt'), '');
    check('spot check shows pints, gallons and kegs', sc.includes('1192 pints · 149 gal 0 pt · 13.5 kegs'));
    await cap('First check of a line? Tap <b>Save count, log till later</b>. Next time it compares with the till', 3200);
    await tap('button-save-weight-only', 2000); await shot('sc-saved');
    await cap('Next spot check, enter the <b>pints sold on the till</b> and it shows any pints missing', 3400);
    await cap('', 300);
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await shot('error'); }
  console.log(results.join('\n')); await sleep(800); await ctx.close(); await b.close();
})();
