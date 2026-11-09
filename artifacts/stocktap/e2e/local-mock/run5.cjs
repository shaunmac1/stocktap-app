// Count-screen fixes, driven as a user on a phone-sized screen against mock5.cjs.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots5'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const P = id => `aaaaaaaa-0000-4000-8000-00000000000${id}`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png` });
  const tap = async (tid, t = 10000) => { const l = p.locator(`[data-testid="${tid}"]`).first(); await l.waitFor({ state: 'visible', timeout: t }); await l.evaluate(e => e.scrollIntoView({ block: "center" })); await sleep(150); await l.click({ force: true }); await sleep(450); };
  // Keys of the NumberPad under a given label
  const padFor = label => p.locator('[data-testid="add-entry-sheet"] div.w-full.flex.flex-col.gap-4', { has: p.getByText(label, { exact: true }) }).first();
  const typeOn = async (label, str) => { const s = padFor(label); await s.getByRole('button', { name: 'C', exact: true }).click(); for (const ch of str) { await s.getByRole('button', { name: ch, exact: true }).first().click(); await sleep(90); } };
  const sheetText = async () => (await p.locator('[data-testid="add-entry-sheet"]').innerText()).replace(/\s+/g, ' ');
  const openEntry = async id => { await tap(`counting-product-${P(id)}`); await sleep(400); await tap('button-add-entry'); if (await p.locator('[data-testid="button-location-unspecified"]').count()) await tap('button-location-unspecified'); await sleep(500); };
  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    await tap('button-new-stocktake'); await sleep(800);
    const chips = await p.locator('button', { hasText: 'Main Bar' }).count();
    check('duplicate / empty location chips hidden', chips === 0, `chips=${chips}`);
    for (const i of [5, 6, 7, 8, 9, 'a']) await tap(`select-product-${P(i)}`);
    await tap('button-start-stocktake'); await sleep(1500);

    // Keg by gallons
    await openEntry(5); await shot('01-keg-modes');
    check('keg mode switch shown', await p.locator('[data-testid="button-keg-mode-gallons"]').isVisible());
    await tap('button-keg-mode-gallons');
    await tap('gallons-pad-field-gal'); for (const k of ['1', '4', '4']) await tap(`gallons-pad-key-${k}`);
    await tap('gallons-pad-field-pt'); await tap('gallons-pad-key-0');
    await sleep(300); await shot('02-keg-gallons-144');
    const kr = await p.locator('[data-testid="text-keg-result"]').innerText();
    check('144 gallons reads as 144 gal 0 pt', kr.trim() === '144 gal 0 pt', kr);
    const st = await sheetText();
    check('shows pints and kegs split', /1152\.0 pints/.test(st) && /13 full kegs/.test(st), st.slice(st.indexOf('pints') - 10, st.indexOf('pints') + 60));
    await tap('button-save-entry'); await sleep(1200); await shot('03-keg-saved');
    const tot = await p.locator('[data-testid="text-product-total"]').innerText();
    check('product total in gallons', tot.includes('144 gal 0 pt'), tot);
    await tap('button-back-to-products');

    // Kegs + pints mode still works
    await openEntry(5); await tap('button-keg-mode-kegs');
    await typeOn('Pints left in the open keg', '56'); await typeOn('Full kegs (not tapped)', '1');
    const kr2 = await p.locator('[data-testid="text-keg-result"]').innerText();
    check('1 keg + 56 pt = 18 gal 0 pt', kr2.trim() === '18 gal 0 pt', kr2);
    await p.locator('[data-testid="button-close-entry-sheet"]').click(); await sleep(300);
    await tap('button-back-to-products');

    // Postmix in litres, 12L box
    await openEntry(6); await shot('04-postmix-litres');
    check('postmix shows litres pad', /litres/i.test(await sheetText()));
    await typeOn('Litres of drink', '100.8'); await sleep(300); await shot('05-postmix-100-8');
    const pm = await sheetText();
    check('postmix 100.8 L of drink = 1.4 boxes', /100\.8\s*L/.test(pm) && pm.includes('= 1.4 boxes (72L of drink a box)'), pm.slice(pm.indexOf('100.8'), pm.indexOf('100.8') + 80));
    check('postmix valued per box (1.4 × £60 = £84)', pm.includes('£84.00'));
    await tap('button-save-entry'); await sleep(1000);
    check('postmix total in litres', (await p.locator('[data-testid="text-product-total"]').innerText()).includes('100.8'));
    await tap('button-back-to-products');

    // Juice by the litre, no size -> litres pad, per litre value
    await openEntry(9);
    check('juice by the litre keeps litres pad (not units)', /litres/i.test(await sheetText()) && !/units/i.test(await sheetText()));
    await typeOn('Litres', '13.6'); await sleep(200);
    const ju = await sheetText();
    check('13.6 L valued at 13.6 × £3.60', ju.includes('£48.96'), ju.slice(ju.indexOf('13.6'), ju.indexOf('13.6') + 60));
    await tap('button-save-entry'); await sleep(900); await tap('button-back-to-products');

    // Can counted each
    await openEntry(7); await typeOn('Units', '21'); await tap('button-save-entry'); await sleep(900);
    const can = await p.locator('[data-testid="text-product-total"]').innerText();
    check('can total in units not tenths', /21\s*units/.test(can), can);
    await shot('06-can-units');
    // delete + undo
    const card = p.locator('[data-testid^="entry-card-"]').first();
    const eid = (await card.getAttribute('data-testid')).replace('entry-card-', '');
    await tap(`button-delete-entry-${eid}`); await sleep(600); await shot('07-deleted-undo');
    check('entry gone after delete', await p.locator('[data-testid^="entry-card-"]').count() === 0);
    await p.getByRole('button', { name: 'Undo' }).click(); await sleep(1200); await shot('08-undone');
    check('undo puts it back', await p.locator('[data-testid^="entry-card-"]').count() === 1);
    await tap('button-back-to-products');

    // Dozen
    await openEntry(8); await typeOn('Loose ones (not in a full case)', '2.6'); await typeOn('Full cases', '1'); await sleep(200);
    const dz = await sheetText();
    check('dozen shows 14.6 units, not tenths', /14\.6\s*units/.test(dz) && !/tenths/.test(dz), dz.slice(dz.indexOf('14.6'), dz.indexOf('14.6') + 40));
    await tap('button-save-entry'); await sleep(900); await tap('button-back-to-products');

    // Water saved at the wrong size, then corrected in the Library
    await openEntry('a'); await typeOn('Units', '23'); await tap('button-save-entry'); await sleep(900); await tap('button-back-to-products');
    await sleep(800); await shot('09-list');
    const list = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    check('list rows use units / gal / L', list.includes('144 gal 0 pt') && list.includes('100.8 L') && list.includes('21 units') && list.includes('14.6 units'));
    await tap('button-review-stocktake'); await sleep(900); await shot('10-review');
    const rv = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    check('review grouped by category with subtotals', await p.locator('[data-testid="summary-group-draught_lager"]').count() === 1 && await p.locator('[data-testid="summary-group-minerals"]').count() === 1);
    check('review uses the right units', rv.includes('144 gal 0 pt') && rv.includes('21 units') && rv.includes('100.8 L') && !rv.includes('420.0 tenths'));

    // Library: edit size of the water -> open count entry recomputed
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await p.locator('input[placeholder^="Search products"]').fill('Water'); await sleep(600);
    check('banners hidden while searching', await p.getByText('have no bottle weights').count() === 0);
    await shot('10b-search');
    await tap(`button-edit-${P('a')}`); await sleep(600); await shot('11-edit-size');
    await p.locator('[data-testid="input-edit-size"]').fill('330');
    await tap('button-save-edit-product'); await sleep(2500);
    const log = await (await fetch('http://localhost:8899/__log')).json();
    const upd = log.log.filter(l => l.update === 'stocktake_line_entries');
    check('open count entry re-worked to 23 × 330ml', upd.some(u => Math.abs(u.patch.ml_remaining - 7590) < 0.01), JSON.stringify(upd.map(u => u.patch)));

    // Add product: size from the name, no 700 leak for cans, postmix box
    await tap('button-add-product-fab'); await sleep(800);
    await p.locator('#p-name').fill('Soft Test Cola Can 330ml');
    await p.locator('[data-testid="select-category"]').click(); await p.getByRole('option', { name: 'Minerals' }).click(); await sleep(400);
    await shot('12-add-can');
    check('can size taken from the name', (await p.locator('[data-testid="input-unit-size"]').inputValue()) === '330');
    await p.locator('button[type=submit]', { hasText: 'Add Product' }).click(); await sleep(1500);
    const log2 = await (await fetch('http://localhost:8899/__log')).json();
    const ins = log2.log.filter(l => l.insert === 'products').pop();
    check('can saved as 330ml counted each', ins && ins.items[0].size_ml === 330 && ins.items[0].unit === 'count', JSON.stringify(ins && ins.items[0] && { s: ins.items[0].size_ml, u: ins.items[0].unit, m: ins.items[0].counting_method }));
    await sleep(800);
    await tap('button-add-product-fab'); await sleep(800);
    await p.locator('#p-name').fill('Soft Test Crisps');
    await p.locator('[data-testid="select-category"]').click(); await p.getByRole('option', { name: 'Packaged' }).click(); await sleep(400);
    check('no made-up size for crisps', (await p.locator('[data-testid="input-unit-size"]').inputValue()) === '');
    await p.locator('#p-name').fill('Gin Test Falls Orange 70cl');
    await p.locator('[data-testid="select-category"]').click(); await p.getByRole('option', { name: 'Spirits' }).click(); await sleep(400);
    const dupWarn = await p.getByText('You already have').count();
    check('no false duplicate warning for a different gin', dupWarn === 0);
    await p.locator('#p-name').fill("Gordon's Gin");
    await sleep(300);
    check('real duplicate still warned', await p.getByText('You already have').count() > 0);
    await shot('13-dup');
  } catch (e) { results.push('ERROR ' + e.message); await shot('zz-error'); }
  console.log(results.join('\n'));
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
  await b.close();
})();
