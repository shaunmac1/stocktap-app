// Stocktake walk-through: tips, choose lines (search ignores apostrophes, only stocked categories), walk order with how-each-is-counted, remembered spot, Next, dip rod pints (no depth needed), ruler needs a depth, zero says so, review tap-to-fix and no-price, open-count progress and a warning before a second open count, close, closed view links to Reports, no stray readings.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots22'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const go = async (path, wait = 3000) => { await p.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' }); await sleep(wait); };
  const toast = async () => { await sleep(400); return (await p.locator('ol li').allInnerTexts()).join(' / ').replace(/\n/g, ' '); };
  const main = async () => (await p.locator('main').innerText()).replace(/\n+/g, ' | ');
  const db = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const post = (t, row) => fetch(`http://localhost:8899/rest/v1/${t}`, { method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) });
  const sheet = async () => (await p.locator('[data-testid=add-entry-sheet]').innerText().catch(() => '')).replace(/\n+/g, ' | ');
  const pad = async digits => { for (const d of digits) { await p.locator('[data-testid=add-entry-sheet] button').filter({ hasText: new RegExp('^' + (d === '.' ? '\\.' : d) + '$') }).first().click(); await sleep(60); } };
  const pick = async q => { await p.locator('[data-testid=input-stocktake-search]').fill(q); await sleep(250); const r = p.locator('[data-testid^=select-product-]'); const n = await r.count(); if (n) await r.first().click(); return n; };
  try {
    const V = (await db('venues'))[0].id;
    const loose0 = (await db('readings')).filter(r => !r.stocktake_id).length;
    await post('products', { id: 'cccccccc-0000-4000-8000-000000000001', venue_id: V, name: 'Ale Test Cask Bitter', type: 'packaged', unit: 'count', category: 'draught_ale', counting_method: 'dipstick', container_type: 'cask', container_l: 40.9, dip_full_mm: null, cost_price: 94.07, created_at: new Date().toISOString() });
    await go('/stocktake');
    await p.locator('[data-testid=button-stocktake-tips]').click(); await sleep(250);
    const tips = await p.locator('[data-testid=stocktake-tips]').innerText();
    check('Tips explain weigh v tenths and draught', /Weigh or tenths/.test(tips) && /dip rod/.test(tips) && /full sealed bottle/.test(tips));
    await p.locator('[data-testid=button-new-stocktake]').click(); await sleep(700);
    let t = await main();
    const cats = (await p.locator('[data-testid^=button-category-filter-]').allInnerTexts()).join(',');
    check('Only stocked categories, with counts', /Spirits \d+/.test(cats) && !/Wines\b(?! \d)/.test(cats), cats);
    check('Rows say how each is counted', /Weigh the open bottle|Tenths/.test(t));
    check('Search ignores apostrophes', (await pick('gordons')) >= 1);
    for (const q of ['Tanqueray', 'Carlsberg', 'Test Cask', 'Cordial Britvic Lime', 'Crisps McCoys', 'Postmix Pepsi Max']) await pick(q);
    await p.locator('[data-testid=input-stocktake-search]').fill('zzqq'); await sleep(200);
    check('No-results says what to do', /Add it in the Library/.test(await p.locator('[data-testid=select-no-results]').innerText()));
    await p.locator('[data-testid=input-stocktake-search]').fill(''); await sleep(200);
    check('Selected count shown', /7 selected/.test(await p.locator('[data-testid=text-selected-count]').innerText()));
    await p.locator('[data-testid=button-start-stocktake]').click(); await sleep(1400);
    t = await main();
    check('Count list in walk order with headings', t.indexOf('DRAUGHT') > -1 && t.indexOf('DRAUGHT') < t.indexOf('SPIRITS'), t.slice(0, 200));
    check('Cask without a depth says pints on the rod', /Pints on the dip rod/.test(t));
    await p.screenshot({ path: `${SHOT}/counting.png` });
    // First line: no spots set up yet, so straight to the pad
    await p.locator('[data-testid^=counting-product-]').first().click(); await sleep(500);
    check('Empty detail explains', /Not counted yet/.test(await p.locator('[data-testid=text-detail-empty]').innerText()));
    await p.locator('[data-testid=button-add-entry]').click(); await sleep(500);
    let sh = await sheet();
    check('No spots yet: straight to the pad', !/Where is it/i.test(sh) && /No specific spot/i.test(sh));
    check('Nothing typed: Save says none left', (await p.locator('[data-testid=button-save-entry]').innerText()) === 'Save: none left');
    // Add a spot "Cellar" from Change spot
    await p.locator('[data-testid=button-change-spot]').click(); await sleep(300);
    await p.locator('[data-testid=button-add-new-location]').click(); await p.locator('[data-testid=input-new-count-location-inline]').fill('Cellar'); await p.locator('[data-testid=button-save-new-location]').click(); await sleep(700);
    check('New spot picked', /CELLAR/i.test(await sheet()));
    const firstName = await p.locator('[data-testid=text-entry-product]').innerText();
    await pad('40'); await p.locator('[data-testid=button-save-entry]').click(); await sleep(800);
    check('First line saved (keg pints)', /5 gal 0 pt/.test(await main()), firstName);
    // Next -> goes straight into the next line's pad, same spot
    await p.locator('[data-testid=button-next-product]').click(); await sleep(600);
    sh = await sheet();
    check('Next opens the next line in the same spot', /CELLAR/i.test(sh) && !/Where is it/i.test(sh), (await p.locator('[data-testid=text-entry-product]').innerText()));
    // Walk: handle whatever comes next by method
    for (let i = 0; i < 8; i++) {
      const name = await p.locator('[data-testid=text-entry-product]').innerText().catch(() => '');
      if (!name) break;
      sh = await sheet();
      if (/Test Cask/.test(name)) {
        check('Cask: pints on the rod by default', /Pints left in the open cask/i.test(sh));
        await p.locator('[data-testid=button-dip-mode-mm]').click(); await sleep(250);
        check('Ruler needs a full depth, Save blocked', /how deep this cask is when it's full/.test(await sheet()) && await p.locator('[data-testid=button-save-entry]').isDisabled());
        await p.locator('[data-testid=button-dip-mode-pints]').click(); await sleep(250);
        await pad('30'); sh = await sheet();
        check('Rod pints turn into gallons and value', /3 gal 6 pt/.test(sh) && /£\d+\.\d\d stock value/.test(sh));
      } else if (/Gordon/.test(name)) {
        check('Unweighed bottle: set up with one full sealed bottle', await p.locator('[data-testid=full-bottle-setup]').count() === 1);
        await pad('1150'); await p.locator('[data-testid=button-save-full-weight]').click(); await sleep(1200);
        check('Then weigh the open one, with the pourer tip', await p.locator('[data-testid=tip-weigh]').count() === 1 && !(await p.locator('[data-testid=full-bottle-setup]').count()));
        await pad('800');
      } else if (/Tanqueray/.test(name)) {
        await p.locator('[data-testid=button-bottle-method-tenths]').click().catch(() => {}); await sleep(200);
        await p.locator('[data-testid=button-use-tenths]').click().catch(() => {}); await sleep(200);
        await p.locator('[data-testid=button-type-tenths]').click(); await sleep(200); await pad('4');
      } else if (/Cordial/.test(name)) {
        check('Cases tip', await p.locator('[data-testid=tip-dozen]').count() === 1); await pad('5');
      } else if (/Crisps/.test(name)) { await pad('24'); }
      else if (/Postmix/.test(name)) { await pad('20'); }
      await p.locator('[data-testid=button-save-entry]').click(); await sleep(800);
      const nx = p.locator('[data-testid=button-next-product]');
      if (await nx.count()) { await nx.click(); await sleep(600); } else break;
    }
    t = await main();
    check('Last line offers review', await p.locator('[data-testid=button-all-counted-review]').count() === 1);
    await p.locator('[data-testid=button-all-counted-review]').click(); await sleep(800);
    t = await main();
    check('Review flags lines with no price', /no cost price/.test(t) && /Crisps/.test(await p.locator('[data-testid=banner-no-price]').innerText()));
    check('Every line counted, none left over', !(await p.locator('[data-testid=banner-uncounted]').count()));
    await p.screenshot({ path: `${SHOT}/review.png` });
    await p.locator('[data-testid^=summary-line-]').first().click(); await sleep(500);
    check('Tap a line to fix it', await p.locator('[data-testid=button-add-entry]').count() === 1);
    // Leave and come back: progress on the open count, warning before a second
    await go('/stocktake', 2500);
    check('Open count shows progress', /In progress · 7 of 7 counted/.test(await main()));
    await p.locator('[data-testid=button-new-stocktake]').click(); await sleep(300);
    check('Warned before a second open count', await p.locator('[data-testid=card-confirm-new]').count() === 1);
    await p.locator('[data-testid=button-carry-on-open]').click(); await sleep(900);
    await p.locator('[data-testid=button-review-stocktake]').click(); await sleep(500);
    await p.locator('[data-testid=button-finish-stocktake]').click(); await sleep(2000);
    check('Closed with a value', /Stocktake complete/.test(await toast()));
    const rd = await db('readings');
    const st = (await db('stocktakes')).find(s => s.status === 'closed' && rd.some(r => r.stocktake_id === s.id));
    check('One reading per line, none outside the count', st && rd.filter(r => r.stocktake_id === st.id).length === 7 && rd.filter(r => !r.stocktake_id).length === loose0, `${rd.length} loose0 ${loose0}`);
    await p.locator('[data-testid^=button-open-stocktake-]').first().click(); await sleep(1200);
    check('Closed count links to Reports', await p.locator('[data-testid=link-see-what-moved]').count() === 1);
    check('No sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
