// Count-screen fixes, driven as a user on a phone-sized screen against mock5.cjs.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots8'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const P = id => `aaaaaaaa-0000-4000-8000-00000000000${id}`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', ignoreHTTPSErrors: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  await ctx.route('https://cdnjs.cloudflare.com/**', route => {
    const f = route.request().url().split('/').pop();
    route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync('/home/claude/pdfjs/node_modules/pdfjs-dist/build/' + f) });
  });
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
  const U = '/mnt/user-data/uploads/Downloads/';
  const PDFS = ['WM7620260116-WM76.PDF','WM7620260225-WM76.PDF','WM7620260514-WM76.PDF','WM7620260619-WM76.PDF','WM7620260721-WM76.PDF','wet audit 26:09:26.PDF'].map(f => U + f);
  const log = async () => (await (await fetch('http://localhost:8899/__log')).json()).log;
  const txt = async sel => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('button-home-orders'); await sleep(1200);
    check('Home → Stock & Orders shows the empty state', await p.locator('[data-testid="orders-empty"]').isVisible());
    await shot('00-empty');
    await p.locator('[data-testid="input-audit-file"]').setInputFiles(PDFS);
    // wait for all six to be saved
    let saved = 0; for (let i = 0; i < 90 && saved < 6; i++) { await sleep(1000); saved = (await log()).filter(l => l.insert === 'stock_audits').length; }
    await sleep(1500);
    check('six audit PDFs read and saved from the page', saved === 6, `saved ${saved}`);
    const L = await log(); const rows = L.filter(l => l.insert === 'stock_audits').map(l => l.items[0]);
    const sep = rows.find(r => r.period_end === '2026-09-25');
    check('September audit saved with 351 lines and the right result', sep && sep.lines.length === 351 && sep.summary.result === 1474.83 && sep.days === 66, sep && `${sep.lines.length} ${sep.summary.result}`);
    check('every audit adds up line by line', rows.every(r => r.lines.length > 300));
    check('subtitle names the last audit', /21 Jul – 25 Sep · 6 audits/.test(await txt('[data-testid="orders-subtitle"]')), await txt('[data-testid="orders-subtitle"]'));
    await shot('01-order');
    // Postmix: count boxes suggested
    const postmixQty = async () => { const cards = p.locator('[data-testid^="order-row-postmix"]'); const n = await cards.count(); let boxes = 0; const names = []; for (let i = 0; i < n; i++) { const t = await cards.nth(i).locator('[data-testid^="qty-postmix"]').innerText(); names.push(t); boxes += parseInt(t) || 0; } return { boxes, names }; };
    const pm = await postmixQty();
    check('postmix order is a few boxes, not 11', pm.boxes <= 3 && pm.names.every(t => /box/.test(t)), JSON.stringify(pm));
    const lines0 = parseInt(await txt('[data-testid="text-order-lines"]'));
    check('stock-now note mentions deliveries since the count', /plus 5 delivered lines added since/.test(await txt('[data-testid="text-stock-basis"]')), await txt('[data-testid="text-stock-basis"]'));
    // Every selling Pinot is somewhere: on the order, or under "Enough in"
    for (const c of ['3', '7', '10', '21']) {
      await p.locator('[data-testid="input-cover"]').fill(c); await sleep(500);
      const where = async n => (await p.locator(`[data-testid^="order-row-"]:has-text("${n}")`).count()) ? 'order' : (await p.locator(`[data-testid="order-covered"] li:has-text("${n}")`).count()) ? 'enough' : 'MISSING';
      const bl = await where('Wine Pinot Blush Arietta'), co = await where('Wine Pinot G. Colverde');
      check(`cover ${c}: Pinot rosé (${bl}) and white (${co}) both shown`, bl !== 'MISSING' && co !== 'MISSING');
    }
    await p.locator('[data-testid="input-cover"]').fill('3'); await sleep(500);
    await p.locator('[data-testid="order-covered"] summary').click(); await sleep(300);
    await shot('01b-enough-in');
    await p.locator('[data-testid="input-cover"]').fill('10'); await sleep(500);
    // Cover 21 days
    await p.locator('[data-testid="input-cover"]').fill('21'); await sleep(600);
    const lines21 = parseInt(await txt('[data-testid="text-order-lines"]'));
    check('longer cover asks for more lines', lines21 > lines0, `${lines0} → ${lines21}`);
    // Busy +25%
    await tap('busy-25'); await sleep(400);
    const lines25 = parseInt(await txt('[data-testid="text-order-lines"]'));
    check('busier asks for at least as much', lines25 >= lines21, `${lines21} → ${lines25}`);
    await shot('02-busy');
    // Christmas period
    await tap('period-' + rows.find(r => r.period_end === '2026-01-16').id); await sleep(500);
    check('Christmas period can be picked from the chart', await p.locator('[data-testid="period-' + rows.find(r => r.period_end === '2026-01-16').id + '"][aria-pressed="true"]').count() === 1);
    await shot('03-christmas');
    await tap('basis-latest'); await tap('busy-0'); await p.locator('[data-testid="input-cover"]').fill('10'); await sleep(500);
    // Adjust a quantity
    const first = p.locator('[data-testid^="order-row-"]').first();
    const key = (await first.getAttribute('data-testid')).replace('order-row-', '');
    const before = await txt(`[data-testid="qty-${key}"]`);
    await tap(`qty-plus-${key}`); await tap(`qty-plus-${key}`);
    const after = await txt(`[data-testid="qty-${key}"]`);
    check('+ adds to the order amount', parseInt(after) === parseInt(before) + 2, `${before} → ${after}`);
    check('changed lines show the suggested amount', /Suggested/.test(await first.innerText()));
    await shot('04-adjusted');
    await tap('button-copy-order'); await sleep(400);
    const closeToasts = async () => { for (const b of await p.locator('[toast-close]').all()) { try { await b.click({ force: true }); } catch {} } await sleep(500); };
    p.closeToasts = closeToasts;
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    check('Copy puts the order on the clipboard, with the change', clip.startsWith('Order for 10 days') && clip.includes(after), clip.slice(0, 120));
    // Up & down
    await p.closeToasts(); await tap('tab-updown'); await sleep(600); await shot('05-updown');
    check('Up & down shows the result', (await txt('[data-testid="text-result"]')) === '+£1,474.83');
    { const ins = (await p.locator('[data-testid="insight-offset"]').allInnerTexts()).join(' | '); check('each up line used in one insight only', (ins.match(/Pepsi Diet up/g) || []).length <= 1 && !/^Pepsi down/m.test(ins), ins.slice(0, 300)); check('spots the lemonade / Max pattern', /Lemonade down.*Max/.test(ins), ins.slice(0, 400)); }
    check('category bars include Postmix', /Postmix −£303.96/.test(await txt('[data-testid="updown-categories"]')));
    // Pick Christmas audit
    await p.locator('[data-testid="select-audit"]').selectOption({ index: 5 }); await sleep(400);
    check('can switch to an older audit', /\+£|−£/.test(await txt('[data-testid="text-result"]')));
    await shot('06-updown-xmas');
    // All stock
    await tap('tab-all'); await sleep(500);
    await p.locator('[data-testid="select-audit"]').selectOption({ index: 0 }); await sleep(300);
    await p.locator('[data-testid="input-allstock-search"]').fill('Pepsi'); await sleep(300);
    const at = await txt('[data-testid="allstock-table"]');
    check('page does not scroll sideways on All stock', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
    check('All stock finds Pepsi lines with counted and up/down', /Postmix Pepsi Max/.test(at) && /92\.4 L/.test(at) && /\+165\.1 L/.test(at), at.slice(0, 200));
    await shot('07-allstock');
    // Audits tab + re-import updates, not duplicates
    await tap('tab-audits'); await sleep(400);
    check('Audits tab lists six, Christmas named', await p.locator('[data-testid^="audit-20"]').count() === 6 && /Christmas/.test(await txt('[data-testid="audit-2026-01-16"]')));
    await p.locator('[data-testid="input-audit-file"]').setInputFiles([PDFS[5]]); await sleep(8000);
    check('adding the same audit again updates it', await p.locator('[data-testid^="audit-20"]').count() === 6);
    await shot('08-audits');
  } catch (e) { results.push('ERROR ' + e.message); await shot('zz-error'); }
  console.log(results.join('\n'));
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
  await b.close();
})();
