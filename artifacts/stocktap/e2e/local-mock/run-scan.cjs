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
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const A = P('a'), B = P('b');
  const t = async tid => (await p.locator(`[data-testid="${tid}"]`).first().innerText().catch(() => '')).replace(/\n/g, ' | ').trim();
  const body = async () => (await p.locator('body').innerText()).replace(/\n/g, ' | ');
  const fill = async (tid, v) => { const l = p.locator(`[data-testid="${tid}"]`); await l.scrollIntoViewIfNeeded(); await l.fill(String(v)); await sleep(150); };
  const log = async () => (await (await fetch('http://localhost:8899/__log')).json()).log;
  const rowsOf = async tbl => (await (await fetch(`http://localhost:8899/rest/v1/${tbl}?select=*`)).json());
  // three different "photos" (big, like a phone camera) made by screenshotting coloured pages
  const pics = [];
  { const pg = await ctx.newPage(); await pg.setViewportSize({ width: 1600, height: 2400 });
    for (const c of ['#fff', '#ffe', '#eef']) { await pg.setContent(`<body style="background:${c};font:60px sans-serif">DELIVERY NOTE ${c}<br>3 x CARLSBERG 50L</body>`); const f = `/tmp/uitest/pic${pics.length}.png`; await pg.screenshot({ path: f }); pics.push(f); }
    await pg.close(); }
  try {
    // ── Till figures from a photo ──
    await p.goto('http://localhost:5173/line-check', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('till photo card is on the Morning line check', /Till sales from a photo/.test(await t('card-till-photo')));
    await p.locator('[data-testid="input-till-library"]').setInputFiles(pics[0]); await sleep(3000);
    const sent = (await log()).find(l => l.fn === 'read-till-photo');
    check('photo sent as a JPEG', !!sent && sent.media === 'image/jpeg' && sent.bytes > 1000, JSON.stringify(sent));
    check('summary: 2 lines filled in from 1 photo', /2 lines filled in from 1 photo/.test(await t('till-photo-summary')), await t('till-photo-summary'));
    check('Carlsberg: 150 pints + 20 halves = 160 pints', /Till photo: 160 pints sold/.test(await t(`till-photo-${A}`)), await t(`till-photo-${A}`));
    check('working shown (which till rows)', /CARLSBERG PT × 150, CARLSBERG HALF × 20/.test(await t(`till-photo-${A}`)));
    check('Hobgoblin: 39 pints', /Till photo: 39 pints sold/.test(await t(`till-photo-${B}`)), await t(`till-photo-${B}`));
    check('unknown draught row flagged, not guessed', /MADRI PINT × 12/.test(await t('till-photo-unmatched')), await t('till-photo-unmatched'));
    check('spirits and food left alone', /2 other rows/.test(await t('till-photo-summary')));
    await p.screenshot({ path: `${SHOT}/s1.png` });
    await fill(`full-${A}`, 5); await fill(`gal-${A}`, 4);
    check('count it: till box already 160, missing 8 pints', (await p.locator(`[data-testid="till-${A}"]`).inputValue()) === '160' && /Missing \| 8 pints/.test(await t(`result-${A}`)), await t(`result-${A}`));
    await p.locator(`[data-testid="line-${A}"]`).scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOT}/s2.png` });
    await p.locator('[data-testid="input-till-library"]').setInputFiles(pics[0]); await sleep(3000);
    check('same roll photographed twice is not double counted', (await p.locator(`[data-testid="till-${A}"]`).inputValue()) === '160', await p.locator(`[data-testid="till-${A}"]`).inputValue());
    await fetch('http://localhost:8899/__set', { method: 'POST', body: JSON.stringify({ __tillFail: true }) });
    await p.locator('[data-testid="input-till-library"]').setInputFiles(pics[1]); await sleep(2500);
    check('unreadable photo: plain message, figures kept', /Couldn't read the till photo/.test(await body()) && (await p.locator(`[data-testid="till-${A}"]`).inputValue()) === '160');
    await fetch('http://localhost:8899/__set', { method: 'POST', body: JSON.stringify({ __tillFail: false }) });
    await ctx.setOffline(true);
    await p.locator('[data-testid="input-till-library"]').setInputFiles(pics[1]); await sleep(1500);
    check('offline: says no signal, can still type', /No signal/.test(await body()));
    await ctx.setOffline(false);
    await p.locator('[data-testid="button-save-line-check"]').click(); await sleep(2500);
    const te = await rowsOf('till_entries');
    check('saved: till entry of 160 pints on the server', te.some(x => x.product_id === A && Number(x.measures_sold) === 160), JSON.stringify(te).slice(0, 200));
    check('result shows 1 line short', /1 line short/.test(await t('line-check-result')), (await t('line-check-result')).slice(0, 120));
    await p.goto('http://localhost:5173/line-check', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await p.locator('[data-testid="input-till-library"]').setInputFiles(pics[0]); await sleep(3000);
    await p.locator('[data-testid="button-till-clear"]').click(); await sleep(300);
    check('clear removes the photo figures', await p.locator('[data-testid="till-photo-summary"]').count() === 0 && await p.locator(`[data-testid="till-photo-${A}"]`).count() === 0);

    // ── Delivery note from a photo ──
    const before = (await rowsOf('deliveries')).length;
    await p.goto('http://localhost:5173/delivery', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await p.locator('[data-testid="button-delivery-photo"]').click(); await sleep(2000);
    check('photo is the main way in', /Scan a delivery/.test(await body()));
    await p.locator('[data-testid="input-scan-library"]').setInputFiles(pics[0]); await sleep(4500);
    const lg = await log();
    check('photo uploaded as JPEG', lg.some(l => l.rpc === 'create_delivery_document' && l.mime === 'image/jpeg'), JSON.stringify(lg.filter(l => l.rpc).slice(-3)));
    const lines = await rowsOf('delivery_document_lines');
    const lc = lines.find(l => /CARLSBERG/.test(l.raw_description)), lh = lines.find(l => /HOBGOBLIN/.test(l.raw_description)), lm = lines.find(l => /MYSTERY/.test(l.raw_description));
    check('Carlsberg: 3 × 50L · 11 gal keg = 33 gal', /Carlsberg Pilsner 3\.4%/.test(await t(`invoice-line-${lc.id}`)) && /3 × 50L · 11 gal keg = 33 gal 0 pt/.test(await t(`invoice-line-qty-${lc.id}`)), await t(`invoice-line-${lc.id}`));
    check('Hobgoblin casks in gallons too', /2 × .* = 18 gal 0 pt/.test(await t(`invoice-line-qty-${lh.id}`)), await t(`invoice-line-qty-${lh.id}`));
    check('clear matches arrive already accepted', /Accepted/.test(await t(`invoice-line-${lc.id}`)) && /2 accepted · 1 to pick/.test(await t('text-scan-progress')), await t('text-scan-progress'));
    check('one button: Add 2 lines to stock', /Add 2 lines to stock/.test(await t('button-commit-invoice')), await t('button-commit-invoice'));
    check('unsure line waits, says it will be left off', /1 line not matched yet/.test(await t('text-scan-unresolved')) && /Pick product/.test(await t(`invoice-line-${lm.id}`)));
    await p.screenshot({ path: `${SHOT}/s3.png` });
    await p.locator(`[data-testid="button-skip-line-${lm.id}"]`).click(); await sleep(1200);
    check('skip the unknown line', /2 accepted · 1 skipped/.test(await t('text-scan-progress')), await t('text-scan-progress'));
    await p.locator(`[data-testid="button-edit-line-${lc.id}"]`).click(); await sleep(400);
    await fill(`input-line-cost-${lc.id}`, 125); await fill(`input-line-sell-${lc.id}`, 4.5);
    await p.screenshot({ path: `${SHOT}/s4.png` });
    await p.locator(`[data-testid="button-accept-line-${lc.id}"]`).click(); await sleep(1500);
    check('cost shows on the line', /£125\.00 each/.test(await t(`invoice-line-qty-${lc.id}`)), await t(`invoice-line-qty-${lc.id}`));
    check('sell price saved on the product', Number((await rowsOf('products')).find(x => x.id === A).pour_price) === 4.5);
    await p.locator('[data-testid="button-commit-invoice"]').click(); await sleep(2500);
    check('one tap: on stock', /This delivery is on your stock/.test(await t('scan-committed')), (await body()).slice(0, 200));
    const dl = await rowsOf('deliveries');
    check('2 deliveries on the server, 3 kegs = 150L', dl.length === before + 2 && dl.some(d => d.product_id === A && Number(d.quantity_ml) === 150000), `n=${dl.length}`);
    check('cost price updated to £125', Number((await rowsOf('products')).find(x => x.id === A).cost_price) === 125);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${SHOT}/s5.png` });
    await p.locator('[data-testid="input-scan-library"]').setInputFiles(pics[0]); await sleep(3000);
    check('same note scanned twice adds nothing', (await rowsOf('deliveries')).length === before + 2 && /already on your stock/.test(await body()));
    await p.goto('http://localhost:5173/line-check', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    check('delivery shows straight away on the line check', /incl\. 33 gal 0 pt delivered/.test(await t(`line-${A}`)), (await t(`line-${A}`)).slice(0, 140));
    // landlord's choice: straight onto stock
    await p.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await p.getByRole('tab', { name: 'Counting' }).click(); await sleep(500);
    await p.locator('[data-testid="switch-auto-add-deliveries"]').click(); await sleep(1200);
    await fetch('http://localhost:8899/__set', { method: 'POST', body: JSON.stringify({ __allStrong: true }) });
    await p.goto('http://localhost:5173/invoice-scan', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await p.locator('[data-testid="input-scan-library"]').setInputFiles(pics[2]); await sleep(5000);
    check('switch on: clear note goes onto stock with no tap', (await rowsOf('deliveries')).length === before + 4 && /added to stock/.test(await body()), `n=${(await rowsOf('deliveries')).length}`);
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/sX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
