// Count-screen fixes, driven as a user on a phone-sized screen against mock5.cjs.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots7'; fs.mkdirSync(SHOT, { recursive: true });
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
const NOTE = [
  "From: Cockpit <noreply@example.test>",
  "Subject: Today's Carlsberg Britvic Delivery",
  "Carlsberg Britvic",
  "Today's delivery",
  "Site\tSample Inn - MP&Bs",
  "Date\t28/09/2026",
  "Delivery window\t07:00 - 11:00",
  "Delivery Order 0400000001",
  "Sales Order 900000002",
  "PO 4500000003",
  "PA",
  "Custom",
  "Mat No\tMat No\tDescription\tQty",
  "43431\t113993\tKP DR Peanuts x 18\t1",
  "43434\t113994\tKP Salted Peanuts x 18\t1",
  "89267\t114831\tMcCoys Cheddar and Onion 36x45g\t1",
  "91001\t119465\tMcCoys Hot and Spicy 36x45g\t1",
  "ZKE",
  "Custom",
  "Mat No\tMat No\tDescription\tQty",
  "318\t27763\tStrongbow Cider 11g Keg CMBC Prod\t2",
  "148\t56615\tGuinness 11g Keg\t2",
  "90350\t27139\tPoretti 11g Keg\t1",
  "69353\t33193\tEstrella Damm 50L Keg\t4",
  "90601\t33808\t1664 Biere 50L Keg\t2",
  "91113\t37863\tOld Mout Flavourwave Multi 30L Keg\t2",
  "CT",
  "35428\t28093\tRobinsons FruitShoot App&BC 24x275ml BOT\t2",
  "3898\t56725\tJ2O Orange &Passion Fruit 24x275ml BOT\t2",
  "90791\t57994\tSunpride Cranberry 12x1L\t1",
  "90296\t56728\tBritvic Lime Cordial 12x1L PET\t1",
  "57804\t16607\tBritvic Low Cal Tonic Water 24x200ml BOT\t1",
  "90602\t34927\tStella Artois 0.0 6x4x330ml BOT\t1",
  "90676\t35130\tLovelli Prosecco 24x200ml BOT\t2",
  "91222\t39161\tRed Bull White Peach 12x250ml CAN\t1",
  "BO",
  "780\t61743\tCaptain Morgans Spiced Gold 70cl (C6)\t1",
  "90448\t34389\tHardys 202 MR Chard 75cl (C6)\t2",
  "90700\t35125\tArietta Pinot Grigio Rose 75cl (C6)\t2",
  "91110\t37862\tOld Mout Flavourwave Kiwi & Lime 250ml\t1",
  "PCE",
  "2142\t102845\tCO2 Cyl Med C-T Rented\t3",
  "BG",
  "47383\t38362\tPepsi Max BIB 1X12 H Yield\t2",
  "43876\t38356\tR White's Lemonade 12L BIB HY\t2",
  "43878\t38365\tPepsi 12L BIB Orange Connector\t1",
  "Carlsberg Britvic, Marston's House, Brewery Road, Wolverhampton",
].join("\n");
  const log = async () => (await (await fetch('http://localhost:8899/__log')).json()).log;
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await shot('00-home');
    await tap('button-home-scan-delivery'); await sleep(900);
    check('home Add Delivery opens paste screen', await p.locator('[data-testid="input-delivery-text"]').isVisible());
    await shot('01-paste-empty');
    await p.locator('[data-testid="input-delivery-text"]').fill(NOTE); await sleep(300);
    await shot('02-pasted');
    await tap('button-read-delivery'); await sleep(1500);
    await shot('03-read');
    const sum = (await p.locator('[data-testid="delivery-summary"]').innerText()).replace(/\s+/g,' ');
    const lines = await p.locator('[data-testid^="delivery-line-"][data-testid$="-product"]').count();
    check('all 26 lines shown', await p.locator('[data-testid^="delivery-line-"]:not([data-testid$="-product"])').count() === 26, sum);
    const prodOf = async desc => { const card = p.locator('[data-testid^="delivery-line-"]', { hasText: desc }).first(); const pr = card.locator('[data-testid$="-product"]'); return (await pr.count()) ? (await pr.innerText()).trim() : null; };
    const qtyOf = async desc => { const card = p.locator('[data-testid^="delivery-line-"]', { hasText: desc }).first(); const q = card.locator('input[type=number]'); return (await q.count()) ? await q.inputValue() : null; };
    check('Guinness keg → draught Guinness, not the 0% can', (await prodOf('Guinness 11g Keg')) === 'Stout Guinness');
    check('Estrella 4 × 50L → 4 kegs', (await prodOf('Estrella Damm 50L Keg')) === 'Lager Estrella Damm' && (await qtyOf('Estrella Damm 50L Keg')) === '4');
    check('Old Mout 30L keg → 2 kegs', (await qtyOf('Old Mout Flavourwave Multi')) === '2');
    check('FruitShoot 2 × 24 → 48 units', (await prodOf('FruitShoot App&BC')) === 'Soft FruitShoot LS App/Blk 275ml' && (await qtyOf('FruitShoot App&BC')) === '48');
    check('Hardys 2 cases → 12 bottles', (await qtyOf('Hardys 202 MR Chard')) === '12');
    check('Captain Morgan Spiced → 1 bottle', (await prodOf('Captain Morgans')) === 'Rum Captain Morgan Spiced' && (await qtyOf('Captain Morgans')) === '1');
    check('Lemonade BIB → Postmix Lemonade 2 boxes', (await prodOf("R White's Lemonade")) === 'Postmix Lemonade' && (await qtyOf("R White's Lemonade")) === '2');
    check('Prosecco 24x200ml → single serve, 48', (await prodOf('Lovelli Prosecco')) === 'Lovelli Prosecco (single serve)' && (await qtyOf('Lovelli Prosecco')) === '48');
    check('Cheddar & Onion crisps → 36', (await prodOf('McCoys Cheddar')) === 'Crisps McCoys Cheese & Onion 45g' && (await qtyOf('McCoys Cheddar')) === '36');
    check('KP Dry Roasted not matched', (await prodOf('KP DR Peanuts')) === null);
    check('CO2 not matched', (await prodOf('CO2 Cyl')) === null);

    // Add KP Dry Roasted to the library from here
    const kpIdx = (await p.locator('[data-testid^="delivery-line-"]', { hasText: 'KP DR Peanuts' }).first().getAttribute('data-testid')).replace('delivery-line-','');
    await tap(`button-add-to-library-${kpIdx}`); await sleep(1500); await shot('04-added-to-library');
    check('KP added to library and matched with 18 units', (await prodOf('KP DR Peanuts')) === 'KP DR Peanuts x 18' && (await qtyOf('KP DR Peanuts')) === '18');
    let L = await log(); const newP = L.filter(l => l.insert === 'products').pop();
    check('new product saved as each, packaged, with supplier code', newP && newP.items[0].counting_method === 'each' && newP.items[0].category === 'packaged' && newP.items[0].sku === '113993', JSON.stringify(newP && newP.items[0]));

    // Pick a product by hand for a line that didn't match (Pepsi Max BIB should have matched; use Strongbow instead: not in mock library)
    const sbIdx = (await p.locator('[data-testid^="delivery-line-"]', { hasText: 'Strongbow Cider' }).first().getAttribute('data-testid')).replace('delivery-line-','');
    await tap(`button-pick-${sbIdx}`); await p.locator(`[data-testid="input-pick-product-${sbIdx}"]`).fill('carlsberg'); await sleep(400);
    await shot('05-pick');
    await p.locator('[data-testid^="pick-result-"]', { hasText: 'Lager Carlsberg' }).first().click(); await sleep(300);
    check('picked product applied with 2 kegs', (await prodOf('Strongbow Cider')) === 'Lager Carlsberg' && (await qtyOf('Strongbow Cider')) === '2');
    // Then skip it again (wrong product on purpose)
    await tap(`button-skip-${sbIdx}`);
    // Edit a quantity
    const esIdx = (await p.locator('[data-testid^="delivery-line-"]', { hasText: 'Estrella Damm 50L' }).first().getAttribute('data-testid')).replace('delivery-line-','');
    await p.locator(`[data-testid="input-line-qty-${esIdx}"]`).fill('3'); await sleep(200);
    const btn = (await p.locator('[data-testid="button-save-delivery"]').innerText()).trim();
    await shot('06-ready');
    await tap('button-save-delivery'); await sleep(4000);
    await shot('07-done');
    const doneTxt = (await p.locator('[data-testid="text-delivery-added"]').innerText()).trim();
    L = await log();
    const rpcs = L.filter(l => l.rpc === 'record_manual_delivery').map(l => l.args);
    const n = parseInt(btn.match(/(\d+) line/)[1]);
    check('saved the number of lines on the button', rpcs.length === n && doneTxt.startsWith(String(n)), `${btn} | ${doneTxt} | rpc ${rpcs.length}`);
    const es = rpcs.find(a => a.p_product_id.endsWith('0000000000' + '02'));
    check('edited Estrella saved as 3 kegs = 150L at £165', es && es.p_purchase_quantity === 3 && es.p_quantity_ml === 150000 && es.p_unit_cost_pence === 16500, JSON.stringify(es));
    check('reference, supplier, date and notes on every line', rpcs.every(a => a.p_invoice_ref === 'Delivery 0400000001' && a.p_supplier === 'Carlsberg Britvic' && a.p_delivered_at === new Date('2026-09-28T07:00:00').toISOString() && /PO 4500000003/.test(a.p_notes)));
    check('skipped line not saved', !rpcs.some(a => a.p_product_id === 'aaaaaaaa-0000-4000-8000-000000000005'));
    const skuUpd = L.filter(l => l.update === 'products' && l.patch.sku).length;
    check('supplier codes remembered on matched products', skuUpd >= n - 1, `sku updates ${skuUpd}`);

    // Paste the same email again: nothing added twice
    await tap('button-paste-another'); await sleep(500);
    await p.locator('[data-testid="input-delivery-text"]').fill(NOTE); await tap('button-read-delivery'); await sleep(1500);
    await shot('08-again');
    const already = await p.locator('span', { hasText: /^Already added$/ }).count();
    check('second paste shows lines as already added', already === n, `already ${already}`);
    const btn2 = (await p.locator('[data-testid="button-save-delivery"]').innerText()).trim();
    check('only the lines not added before are offered', /· (\d+) line/.test(btn2), btn2);

    // Ledger shows it in readable terms
    await p.goto('http://localhost:5173/ledger', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await shot('09-ledger');
    const lt = (await p.locator('body').innerText()).replace(/\s+/g,' ');
    check('ledger shows 3 kegs, units and boxes', lt.includes('3 kegs · 33 gal 0 pt') && lt.includes('48 units') && /2 boxes · 1\d\d L of drink/.test(lt), lt.slice(0, 300));
  } catch (e) { results.push('ERROR ' + e.message); await shot('zz-error'); }
  console.log(results.join('\n'));
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
  await b.close();
})();
