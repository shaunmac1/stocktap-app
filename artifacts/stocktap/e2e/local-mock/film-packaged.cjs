// Phone-size how-to video: bottles and cans counted as full cases + loose (Demo Bar, made-up data).
// Needs mock-packaged.cjs on :8899 and static.cjs on :5173. Writes frames + manifest to /tmp/film/packaged.
const { chromium } = require('playwright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const J2O = 'bbbbbbbb-0000-4000-8000-000000000001', PER = 'bbbbbbbb-0000-4000-8000-000000000002', CRISP = 'bbbbbbbb-0000-4000-8000-000000000003';
const DIR = '/tmp/film/packaged';
(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const man = []; let n = 0;
  const L = tid => p.locator(`[data-testid="${tid}"]:visible`).first();
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  const shot = async (cap, d = 2.4, tapAt = null) => { const f = `${DIR}/${String(n++).padStart(2, '0')}.png`; await p.screenshot({ path: f }); man.push({ f, cap, d, ...(tapAt ? { tap: tapAt } : {}) }); };
  const pt = async loc => { await loc.scrollIntoViewIfNeeded(); await sleep(150); const r = await loc.boundingBox(); return [Math.round((r.x + r.width / 2) * 2), Math.round((r.y + r.height / 2) * 2)]; };
  const tap = async (tid, cap = null, d = 1.8, wait = 700) => { const l = L(tid); await l.waitFor({ state: 'visible', timeout: 10000 }); if (cap) await shot(cap, d, await pt(l)); await l.tap(); await sleep(wait); };
  const key = async ch => { await p.locator(`button:visible:text-is("${ch}")`).last().tap(); await sleep(150); };
  const toSpot = async name => {
    if (!(await has('button-change-spot')) && !(await has(`button-location-loc-${name}`))) await tap('button-add-entry');
    const label = (await L('button-change-spot').locator('xpath=../..').innerText().catch(() => '')).toUpperCase();
    if (!(await has(`button-location-loc-${name}`)) && !label.includes(name.toUpperCase())) await tap('button-change-spot');
    if (await has(`button-location-loc-${name}`)) await tap(`button-location-loc-${name}`);
  };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('button-new-stocktake', null, 0, 900);
    for (const id of [J2O, PER, CRISP]) await tap(`select-product-${id}`, null, 0, 200);
    await tap('button-start-stocktake', null, 0, 1500);
    await shot('Bottles and cans you sell whole: J2O, Peroni, crisps', 2.6);
    await tap(`counting-product-${J2O}`, 'Tap the line', 1.6, 900);
    await toSpot('cellar');
    await shot('First time only, it asks how they come in', 2.8);
    await tap('button-case-suggested-24', 'J2O comes in cases of 24. One tap, never asked again', 2.6, 900);
    for (let i = 0; i < 3; i++) await tap('button-cases-plus', i === 0 ? 'In the cellar: tap + for each full case' : null, 2.2, 350);
    await shot('3 full cases', 1.8);
    for (const ch of '7') await key(ch);
    await p.locator('[data-testid="text-units-breakdown"]:visible').scrollIntoViewIfNeeded(); await sleep(300);
    await shot('Then the loose ones: 7. It does the maths: 79 bottles, 6 doz 7, 3 cases + 7', 3.4);
    await tap('button-save-entry', 'Save', 1.4, 1800);
    await toSpot('bar');
    for (const ch of '11') await key(ch);
    await p.locator('[data-testid="text-units-breakdown"]:visible').scrollIntoViewIfNeeded(); await sleep(300);
    await shot('On the bar: just the loose ones in the fridge. 11', 2.6);
    await tap('button-save-entry', null, 0, 1800);
    await shot('Cellar and bar added up: 90 bottles, 7 doz 6, the way the stocktaker writes it, with the value', 3.6);
    // A different size
    for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, null, 0, 800); break; }
    await tap(`counting-product-${PER}`, null, 0, 900);
    await toSpot('cellar');
    await tap('button-case-12', 'Your Peroni comes in 12s? Pick the size', 2.4, 900);
    for (let i = 0; i < 2; i++) await tap('button-cases-plus', null, 0, 300);
    for (const ch of '5') await key(ch);
    await p.locator('[data-testid="text-units-breakdown"]:visible').scrollIntoViewIfNeeded(); await sleep(300);
    await shot('2 cases of 12 + 5 = 29 bottles', 2.6);
    await tap('button-save-entry', null, 0, 1800);
    // Singles
    for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, null, 0, 800); break; }
    await tap(`counting-product-${CRISP}`, null, 0, 900);
    await toSpot('bar');
    await tap('button-case-singles', 'Crisps? Count them one by one', 2.4, 900);
    for (const ch of '31') await key(ch);
    await p.locator('[data-testid="text-units-breakdown"]:visible').scrollIntoViewIfNeeded(); await sleep(300);
    await shot('31 bags', 2.0);
    await tap('button-save-entry', null, 0, 1800);
    await shot('Works with no signal in the cellar too. It all sends when you are back online', 3.2);
  } catch (e) { console.log('ERROR', e.message.split('\n')[0]); await p.screenshot({ path: `${DIR}/zz-error.png` }); }
  man[0].intro = 'Cases + loose, added up for you';
  fs.writeFileSync(`${DIR}/manifest.json`, JSON.stringify(man, null, 1));
  console.log(`frames ${man.length}${errs.length ? ' errors: ' + errs.join(' | ') : ''}`);
  await b.close();
})();
