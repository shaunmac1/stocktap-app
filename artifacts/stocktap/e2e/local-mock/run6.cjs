// Count-screen fixes, driven as a user on a phone-sized screen against mock5.cjs.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots6'; fs.mkdirSync(SHOT, { recursive: true });
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
    for (const i of [5, 6]) await tap(`select-product-${P(i)}`);
    await tap('button-start-stocktake'); await sleep(1500);

    // Keg: one count typed as kegs, one as gallons
    await openEntry(5);
    const sz0 = await p.locator('[data-testid="text-container-size"]').innerText();
    check('count screen shows keg size', sz0.trim() === '50L keg', sz0);
    await tap('button-keg-mode-kegs');
    await typeOn('Pints left in the open keg', '20'); await typeOn('Full kegs (not tapped)', '1');
    await tap('button-save-entry'); await sleep(1000);
    await tap('button-add-entry'); if (await p.locator('[data-testid="button-location-unspecified"]').count()) await tap('button-location-unspecified'); await sleep(500);
    await tap('button-keg-mode-gallons');
    await tap('gallons-pad-field-gal'); for (const k of ['1', '1']) await tap(`gallons-pad-key-${k}`);
    await tap('gallons-pad-field-pt'); await tap('gallons-pad-key-2');
    await tap('button-save-entry'); await sleep(1200);
    let log = await (await fetch('http://localhost:8899/__log')).json();
    const ins = log.log.filter(l => l.insert === 'stocktake_line_entries').map(l => l.items[0]);
    const gal = ins.find(e => e.full_containers == null);
    check('gallons count saved as a total', !!gal && Math.abs(gal.part_value - 90) < 0.001, JSON.stringify(ins.map(e => ({ f: e.full_containers, p: e.part_value }))));

    // Change the keg size on the count screen
    await tap('button-add-entry'); if (await p.locator('[data-testid="button-location-unspecified"]').count()) await tap('button-location-unspecified'); await sleep(500);
    await shot('20-size-row');
    await tap('button-change-container-size'); await sleep(300); await shot('21-size-picker');
    await tap('preset-count-30'); await sleep(2500); await shot('22-size-30');
    const sz1 = await p.locator('[data-testid="text-container-size"]').innerText();
    check('keg size now 30L', sz1.trim() === '30L keg', sz1);
    log = await (await fetch('http://localhost:8899/__log')).json();
    const pu = log.log.filter(l => l.update === 'products').pop();
    check('product saved as 30L', pu && pu.patch.container_l === 30, JSON.stringify(pu && pu.patch));
    const eu = log.log.filter(l => l.update === 'stocktake_line_entries');
    check('kegs count re-worked to 30L + 20 pt', eu.length === 1 && Math.abs(eu[0].patch.ml_remaining - (30000 + 20 * 568.26125)) < 0.5, JSON.stringify(eu.map(u => u.patch)));
    const body = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    check('toast says one count updated', /Updated 1 count/.test(body));
    await p.locator('[data-testid="button-close-entry-sheet"]').click(); await sleep(600);
    const tot = await p.locator('[data-testid="text-product-total"]').innerText();
    // 30L + 20pt = 72.79 pt, plus 90 pt = 162.79 pt = 20 gal 2.8 pt
    check('total uses the new size', tot.includes('20 gal 2.8 pt'), tot);
    await shot('23-total');
    await tap('button-back-to-products');

    // Postmix: change box size by typing
    await openEntry(6);
    const b0 = await p.locator('[data-testid="text-container-size"]').innerText();
    check('postmix shows box size', b0.trim() === '12L box', b0);
    await tap('button-change-container-size');
    check('postmix offers 7/10/12/20L', await p.locator('[data-testid="preset-count-7"]').count() === 1 && await p.locator('[data-testid="preset-count-20"]').count() === 1);
    await p.locator('[data-testid="input-count-size"]').fill('10'); await sleep(200);
    await tap('button-save-container-size'); await sleep(2000); await shot('24-postmix-10');
    const b1 = await p.locator('[data-testid="text-container-size"]').innerText();
    check('postmix box now 10L', b1.trim() === '10L box', b1);
    await typeOn('Litres of drink', '60'); await sleep(200);
    const pm = (await p.locator('[data-testid="add-entry-sheet"]').innerText()).replace(/\s+/g, ' ');
    check('60L of drink at a 10L box = 1 box', /= 1 box \(60L of drink a box\)/.test(pm), pm.slice(pm.indexOf('= '), pm.indexOf('= ') + 80));
    await p.locator('[data-testid="button-close-entry-sheet"]').click(); await sleep(300);

    // Library: add a keg and a postmix line
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap('button-add-product-fab'); await sleep(800);
    await p.locator('#p-name').fill("Cider Test Orchard 30L Keg"); await sleep(600);
    await p.locator('[data-testid="preset-keg-30"]').evaluate(e => e.scrollIntoView({ block: 'center' })); await shot('25-add-keg');
    check('keg size 30L picked from the name', await p.locator('[data-testid="preset-keg-30"]').getAttribute('aria-pressed') === 'true');
    await tap('preset-keg-100');
    check('keg size can be changed to 100L', await p.locator('[data-testid="preset-keg-100"]').getAttribute('aria-pressed') === 'true');
    await tap('preset-keg-30');
    await p.locator('button[type=submit]', { hasText: 'Add Product' }).click(); await sleep(1500);
    log = await (await fetch('http://localhost:8899/__log')).json();
    const kp = log.log.filter(l => l.insert === 'products').pop();
    check('keg saved as 30L', kp && kp.items[0].container_l === 30 && kp.items[0].category === 'draught_cider', JSON.stringify(kp && { c: kp.items[0].container_l, cat: kp.items[0].category }));
    await sleep(800);
    await tap('button-add-product-fab'); await sleep(800);
    await p.locator('#p-name').fill("Postmix Test Cola"); await sleep(600);
    check('postmix box defaults to 12L', await p.locator('[data-testid="preset-box-12"]').getAttribute('aria-pressed') === 'true');
    await tap('preset-box-7'); await shot('26-add-postmix');
    await p.locator('button[type=submit]', { hasText: 'Add Product' }).click(); await sleep(1500);
    log = await (await fetch('http://localhost:8899/__log')).json();
    const pp = log.log.filter(l => l.insert === 'products').pop();
    check('postmix saved as 7L box', pp && pp.items[0].container_l === 7 && pp.items[0].category === 'postmix', JSON.stringify(pp && { c: pp.items[0].container_l, cat: pp.items[0].category }));

    // Edit: keg size change from the Library
    await p.locator('input[placeholder^="Search products"]').fill('Carlsberg'); await sleep(600);
    await tap(`button-edit-${P(5)}`); await sleep(600);
    await tap('preset-container-50'); await shot('27-edit-keg');
    await tap('button-save-edit-product'); await sleep(2500);
    log = await (await fetch('http://localhost:8899/__log')).json();
    const eu2 = log.log.filter(l => l.update === 'stocktake_line_entries').pop();
    check('edit back to 50L re-works the kegs count', eu2 && Math.abs(eu2.patch.ml_remaining - (50000 + 20 * 568.26125)) < 0.5, JSON.stringify(eu2 && eu2.patch));
  } catch (e) { results.push('ERROR ' + e.message); await shot('zz-error'); }
  console.log(results.join('\n'));
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
  await b.close();
})();
