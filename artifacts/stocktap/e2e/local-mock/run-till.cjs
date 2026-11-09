// Till sales import against the local mock (mock12.cjs): Casio file → matches → save → till vs counts,
// re-import remembers and replaces (no doubling), Other CSV mapper remembered, Reports link. Synthetic data only.
const PW = process.env.PW || '/Users/shaunmcmanus/Downloads/stocktap-play/node_modules/playwright';
const { chromium } = require(PW);
const fs = require('fs'); const path = require('path');
const SHOT = process.env.SHOT || '/tmp/uitest/shots-till'; fs.mkdirSync(SHOT, { recursive: true });
const FIX = path.join(__dirname, '..', 'fixtures', 'till-casio-mock-Z004.CSV');
const GEN = path.join(__dirname, '..', '..', 'src', 'lib', '__fixtures__', 'till', 'generic-any-till.csv');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const go = async (u, wait = 3000) => { await p.goto('http://localhost:5173' + u, { waitUntil: 'domcontentloaded' }); await sleep(wait); };
  const db = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const txt = async sel => (await p.locator(sel).innerText().catch(() => '')).replace(/\n+/g, ' | ');
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png`, fullPage: true });
  try {
    await go('/till-import');
    let t = await txt('main');
    check('Page opens with plain heading', /Import till sales/.test(t), t.slice(0, 200));
    check('Three till choices', (await p.locator('[data-testid^=till-type-]').count()) === 3);
    const openSel = await p.locator('[data-testid=till-open-count]').inputValue(), closeSel = await p.locator('[data-testid=till-close-count]').inputValue();
    check('Defaults to the last two counts', openSel === 'st-b' && closeSel === 'st-c', `${openSel} ${closeSel}`);
    await p.locator('[data-testid=till-type-casio]').click();
    check('Casio help says where the file is', /Z004/.test(await txt('main')));
    await p.locator('[data-testid=input-till-file]').setInputFiles(FIX); await sleep(500);
    t = await txt('[data-testid=till-preview]');
    check('Preview counts products, items and money', /8 products found/.test(t) && /553 sold/.test(t) && /£1,717\.00/.test(t), t);
    check('Report date inside the period: no date warning', !/isn't between the two counts/.test(t), t);
    await shot('1-pick');
    await p.locator('[data-testid=button-till-next]').click(); await sleep(500);
    const sum = await txt('[data-testid=till-summary]');
    check('Summary: matched / to check / not matched', /Matched/.test(sum) && /To check/.test(sum) && /Not matched/.test(sum), sum);
    check('Pool table not matched', (await p.locator('[data-testid=till-count-none]').innerText()) === '1');
    const half = await txt('[data-testid="till-line-0002"]');
    check('Carlsberg half: best guess with half serve and pints used', /Lager Carlsberg/.test(await p.locator('[data-testid="till-line-0002"] select').first().evaluate(s => s.options[s.selectedIndex].text)) && /Uses 2 pt/.test(half), half);
    const dbl = await txt('[data-testid="till-line-0005"]');
    check('Gin double uses 6 measures', /Uses 6 measures/.test(dbl), dbl);
    const pm = await txt('[data-testid="till-line-0006"]');
    check('Pepsi Max halves → litres of postmix', /Uses 69\.9 L of Postmix Pepsi Max/.test(pm), pm);
    await p.locator('[data-testid="till-line-0008"] button').filter({ hasText: 'Not stock' }).click(); await sleep(200);
    check('Not stock moves pool out of not-matched', (await p.locator('[data-testid=till-count-none]').innerText()) === '0');
    await shot('2-check');
    await p.locator('[data-testid=button-till-confirm]').click(); await sleep(2500);
    let sales = await db('sales_records');
    check('7 till lines saved, marked [till], dated the closing count', sales.length === 7 && sales.every(s => / \[till\]$/.test(s.product_name_raw)), JSON.stringify(sales.map(s => s.product_name_raw)));
    const carlHalf = sales.find(s => /CARLSBERG HALF/.test(s.product_name_raw));
    check('Halves stored as pints sold (4 halves = 2)', carlHalf && Number(carlHalf.quantity_sold) === 2 && carlHalf.revenue_pence === 960, JSON.stringify(carlHalf));
    const gdbl = sales.find(s => /GORDONS GIN DBL/.test(s.product_name_raw));
    check('Doubles stored as measures (3 doubles = 6)', gdbl && Number(gdbl.quantity_sold) === 6);
    const mem = await db('till_import_memory');
    check('Matches remembered per pub on the server', mem.length === 1 && Object.keys(mem[0].data.matches).length === 8, JSON.stringify(mem).slice(0, 300));
    t = await txt('[data-testid=till-variance]');
    check('Till vs counts shows', /Unaccounted at cost/.test(t) && /At till prices/.test(t), t.slice(0, 300));
    const st = async id => p.locator(`[data-testid="till-var-${id}"]`).getAttribute('data-status');
    check('Carlsberg flagged: 8 pints more used than sold', (await st('aaaaaaaa-0000-4000-8000-000000000005')) === 'loss' && /\+8 pt/.test(await txt('[data-testid="till-var-aaaaaaaa-0000-4000-8000-000000000005"]')), await txt('[data-testid="till-var-aaaaaaaa-0000-4000-8000-000000000005"]'));
    check('Till and counts shown in pints', /Till sold 32 pt · counts say 40 pt used/.test(await txt('[data-testid="till-var-aaaaaaaa-0000-4000-8000-000000000005"]')));
    check('Guinness within tolerance', (await st('bbbbbbbb-0000-4000-8000-000000000001')) === 'ok');
    check('Gin 4 measures short flagged', (await st('aaaaaaaa-0000-4000-8000-000000000001')) === 'loss' && /\+4 measures/.test(await txt('[data-testid="till-var-aaaaaaaa-0000-4000-8000-000000000001"]')), await txt('[data-testid="till-var-aaaaaaaa-0000-4000-8000-000000000001"]'));
    check('Crisps: till sold more than used', (await st('bbbbbbbb-0000-4000-8000-00000000000a')) === 'over', await txt('[data-testid="till-var-bbbbbbbb-0000-4000-8000-00000000000a"]'));
    check('Pepsi Max within tolerance', (await st('bbbbbbbb-0000-4000-8000-000000000009')) === 'ok', await txt('[data-testid="till-var-bbbbbbbb-0000-4000-8000-000000000009"]'));
    check('£ at cost and at sale shown per line', /at cost/.test(t) && /at sale price/.test(t));
    await shot('3-result');
    // Tolerance change re-flags
    await p.locator('[data-testid=till-tolerance]').selectOption('5'); await sleep(300);
    check('5% tolerance clears the gin flag, Carlsberg still flagged', (await st('aaaaaaaa-0000-4000-8000-000000000001')) === 'ok' && (await st('aaaaaaaa-0000-4000-8000-000000000005')) === 'loss');
    await p.locator('[data-testid=till-tolerance]').selectOption('3'); await sleep(200);

    // Second import of the same file: remembered, and replaces rather than doubles
    await p.locator('[data-testid=button-till-another]').click(); await sleep(400);
    await p.locator('[data-testid=input-till-file]').setInputFiles(FIX); await sleep(500);
    await p.locator('[data-testid=button-till-next]').click(); await sleep(500);
    t = await txt('main');
    check('Second time: lines say remembered, pool stays left out', (t.match(/remembered/g) || []).length === 7 && /Undo: this is stock/.test(t), t.slice(0, 400));
    check('Offers to replace what is already saved', /Replace the 7 till lines/.test(await txt('[data-testid=till-replace]')));
    check('Nothing left to check', (await p.locator('[data-testid=till-count-check]').innerText()) === '0');
    await p.locator('[data-testid=button-till-confirm]').click(); await sleep(2500);
    sales = await db('sales_records');
    check('Re-import replaced, not doubled', sales.length === 7, String(sales.length));

    // Other CSV: mapper guesses columns and is remembered
    await p.locator('[data-testid=button-till-another]').click(); await sleep(400);
    await p.locator('[data-testid=till-type-generic]').click();
    await p.locator('[data-testid=input-till-file]').setInputFiles(GEN); await sleep(600);
    check('Mapper guesses the columns', (await p.locator('[data-testid=till-map-name]').inputValue()) === 'Item Description' && (await p.locator('[data-testid=till-map-qty]').inputValue()) === 'Qty Sold' && (await p.locator('[data-testid=till-map-value]').inputValue()) === 'Gross £');
    t = await txt('[data-testid=till-preview]');
    check('Other CSV preview reads lines and leaves out the grand total', /6 products found/.test(t) && /Grand Total/.test(t), t);
    await shot('4-generic');
    await p.locator('[data-testid=till-map-value]').selectOption('Net £'); await sleep(200);
    await p.locator('[data-testid=button-till-next]').click(); await sleep(500);
    await p.locator('[data-testid=button-till-confirm]').click(); await sleep(2500);
    const mem2 = await db('till_import_memory');
    const maps = Object.values(mem2[0].data.mappings);
    check('Column choice remembered (Net £ kept)', maps.length === 1 && maps[0].value === 'Net £', JSON.stringify(maps));
    await p.locator('[data-testid=button-till-another]').click(); await sleep(400);
    await p.locator('[data-testid=till-type-generic]').click();
    await p.locator('[data-testid=input-till-file]').setInputFiles(GEN); await sleep(600);
    check('Next time the remembered columns come back', (await p.locator('[data-testid=till-map-value]').inputValue()) === 'Net £');

    // Reports → COGS has the way in
    await go('/reports');
    await p.locator('[data-testid=tab-cogs]').click(); await sleep(500);
    check('Reports COGS tab links to till import', await p.locator('[data-testid=link-till-import]').isVisible());
    await p.locator('[data-testid=link-till-import]').click(); await sleep(800);
    check('Link opens the till import screen', /\/till-import$/.test(p.url()));
    const wide = await p.evaluate(() => document.documentElement.scrollWidth);
    check('No sideways scroll at phone width', wide <= 390, String(wide));
  } catch (e) { results.push('FAIL exception ' + e.message); }
  check('No page errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
  await b.close();
})();
