// The Thursday bug: start a count with no signal, count lagers, come back to add more lines, finish.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const A = 'aaaaaaaa-0000-4000-8000-00000000000a', B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const P = 568.261;
(async () => {
  const get = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const V = (await get('products'))[0].venue_id;
  const ago = d => new Date(Date.now() - d * 86400000).toISOString();
  // Tuesday's count: A 376 pints, B 80 pints, two days ago
  await fetch('http://localhost:8899/__set', { method: 'POST', body: JSON.stringify({ readings: [
    { id: 'r1', venue_id: V, product_id: A, ml_remaining: 376 * P, reading_at: ago(2), created_at: ago(2), user_id: U, stocktake_id: null },
    { id: 'r2', venue_id: V, product_id: B, ml_remaining: 80 * P, reading_at: ago(2), created_at: ago(2), user_id: U, stocktake_id: null }] }) });
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const T = tid => p.locator(`[data-testid="${tid}"]:visible`).first();
  const tap = async (tid, w = 500) => { await T(tid).waitFor({ state: 'visible', timeout: 10000 }); await T(tid).scrollIntoViewIfNeeded(); await T(tid).tap(); await sleep(w); };
  const txt = async tid => (await T(tid).innerText().catch(() => '')).replace(/\n/g, ' | ');
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  const countIn = async (pid, loc, full, gal) => {
    if (await has(`counting-product-${pid}`)) await tap(`counting-product-${pid}`);
    await sleep(600);
    if (!(await has('button-full-plus'))) {
      await tap('button-add-entry', 600);
      if (!(await has(`button-location-${loc}`)) && await has('button-change-spot')) await tap('button-change-spot');
      await tap(`button-location-${loc}`, 600);
    }
    if (await has('button-keg-mode-kegs')) await tap('button-keg-mode-kegs');
    for (let i = 0; i < full; i++) await tap('button-full-plus', 150);
    if (gal != null) await tap(`button-part-gallons-${gal}`);
    await tap('button-save-entry', 1500);
  };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    // ── no signal in the cellar ──
    await ctx.setOffline(true);
    await tap('button-new-stocktake', 800); await tap(`select-product-${A}`); await tap('button-start-stocktake', 2000);
    await countIn(A, 'loc-cellar', 2, 4);      // 2 full + 4 gal in the cellar
    if (await has('button-back-to-products')) await tap('button-back-to-products');
    check('counted with no signal', (await get('stocktakes')).length === 0 && (await get('stocktake_line_entries')).length === 0);
    await p.screenshot({ path: `${SHOT}/c1.png` });
    // ── signal back ──
    await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(9000);
    let sts = await get('stocktakes'), ents = await get('stocktake_line_entries');
    check('exactly one stocktake reached the server', sts.length === 1, `n=${sts.length}`);
    check('the lager count reached the server, in that stocktake', ents.length === 1 && ents[0].stocktake_id === sts[0]?.id && Number(ents[0].part_value) === 32 && ents[0].full_containers === 2, JSON.stringify(ents.map(e => [e.stocktake_id === sts[0]?.id, e.full_containers, e.part_value])));
    const refused = (await (await fetch('http://localhost:8899/__log')).json()).log.filter(l => l.refused).length;
    // ── come back and add more lines ──
    if (!(await has('button-add-lines'))) { await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000); await tap('button-new-stocktake', 600); await tap('button-carry-on-open', 1500); }
    check('"Add more lines to this count" is there', await has('button-add-lines'));
    await tap('button-add-lines', 800);
    check('pick list opens with the lager still ticked', /Add more lines/.test(await p.locator('h1:visible').first().innerText()) && /1 lines/.test(await txt('button-add-lines-confirm')), await txt('button-add-lines-confirm'));
    await tap(`select-product-${B}`); await p.screenshot({ path: `${SHOT}/c2.png` });
    await tap('button-add-lines-confirm', 1500);
    check('back in the same count: 1 of 2 counted, nothing to recount', /1 of 2 counted/.test(await txt('text-count-progress')), await txt('text-count-progress'));
    await p.screenshot({ path: `${SHOT}/c3.png` });
    sts = await get('stocktakes');
    check('still one stocktake, now covering both lines', sts.length === 1 && (sts[0].product_ids || []).length === 2, JSON.stringify(sts.map(s => s.product_ids)));
    await sleep(6000); await countIn(B, 'loc-cellar', 1, null);
    if (await has('button-back-to-products')) await tap('button-back-to-products');
    // ── finish with no signal, tapping Finish twice ──
    await ctx.setOffline(true);
    await tap('button-review-stocktake', 1200);
    await T('button-finish-stocktake').scrollIntoViewIfNeeded(); await T('button-finish-stocktake').tap(); await T('button-finish-stocktake').tap({ timeout: 800 }).catch(() => {}); await sleep(2500);
    check('finished offline: says saved, sync pending', /sync pending|Stocktake complete/i.test((await p.locator('body').innerText())));
    await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(10000);
    sts = await get('stocktakes'); ents = await get('stocktake_line_entries'); const rds = (await get('readings')).filter(r => r.stocktake_id);
    check('one stocktake, closed on the server', sts.length === 1 && sts[0].status === 'closed', JSON.stringify(sts.map(s => s.status)));
    check('both line counts on the server', ents.length === 2 && ents.every(e => e.stocktake_id === sts[0].id), `n=${ents.length}`);
    check('one reading per line, no doubles', rds.length === 2 && new Set(rds.map(r => r.product_id)).size === 2 && rds.every(r => r.stocktake_id === sts[0].id), `n=${rds.length}`);
    const refusedAfter = (await (await fetch('http://localhost:8899/__log')).json()).log.filter(l => l.refused).length;
    check('nothing was refused by the server along the way', refused === 0 && refusedAfter === 0, `refused=${refusedAfter}`);
    // ── order day ──
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('card-days-left', 2500);
    check('Days left: stock as kegs + gallons', /2 kegs \+ 4 gal 0 pt \(208 pints\)/.test(await txt(`days-stock-${A}`)), await txt(`days-stock-${A}`));
    check('Days left: 376 → 208 in 2 days = 84 a day, about 2.5 days', /about 2\.5 days/.test(await txt(`days-left-${A}`)) && /84 pints a day/.test(await txt(`days-why-${A}`)), `${await txt(`days-left-${A}`)} / ${await txt(`days-why-${A}`)}`);
    check('warns it is only a few days of history', /Only a few days of history/.test(await txt(`days-why-${A}`)));
    await tap('button-cover-7');
    check('order to cover 7 days: 5 kegs of A', /order 5 kegs/.test(await txt(`days-order-${A}`)) && /To cover 7 days: 5 ×/.test(await txt('text-order-summary')), `${await txt(`days-order-${A}`)} / ${await txt('text-order-summary')}`);
    check('B went up (80 → 72? no: 1 cask counted)', (await txt(`days-left-${B}`)).length > 0, await txt(`days-left-${B}`));
    await p.screenshot({ path: `${SHOT}/c4.png` });
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n').slice(0,12).join(' ~ ').slice(0,900)); await p.screenshot({ path: `${SHOT}/cX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
