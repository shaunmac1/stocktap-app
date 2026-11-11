// As-user test: till sales from a PHOTO of the report, every line (draught, spirits, soft drinks),
// through the same matching and till-vs-counts screens as a till file. Needs mock12.cjs + static.cjs.
// The photo reader (an online service) is stood in for here; it returns the rows a report would give.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const ROWS = [
  { name: 'CARLSBERG PT', qty: 30, value: 144 }, { name: 'CARLSBERG HALF', qty: 4, value: 9.6 },
  { name: 'TANQUERAY GIN', qty: 12, value: 43.2 }, { name: 'TANGO APPLE CAN', qty: 6, value: 13.2 }, { name: 'POOL TABLE', qty: 9, value: 9 },
];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  let calls = 0;
  await ctx.route('**/functions/v1/read-till-photo', async route => { calls++; await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ rows: ROWS }) }); });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const txt = async sel => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\n+/g, ' | ');
  const db = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const line = n => `[data-testid="till-line-${n}"]`;
  const picked = async n => p.locator(`${line(n)} select`).first().evaluate(s => s.options[s.selectedIndex].text).catch(() => '');
  try {
    await p.goto('http://localhost:5173/till-import', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('photo option is on the page, for every line', /Every line is read/.test(await txt('[data-testid=card-till-photo-all]')), await txt('[data-testid=card-till-photo-all]'));
    await p.locator('[data-testid=input-till-photo]').setInputFiles('/tmp/uitest/report.jpg'); await sleep(2500);
    check('one photo sent to the reader', calls === 1, String(calls));
    check('says it read 1 photo', /Read 1 photo/.test(await txt('[data-testid=till-photo-read]')), await txt('[data-testid=till-photo-read]'));
    const pv = await txt('[data-testid=till-preview]');
    check('preview: 5 products, 61 sold, £219.00', /5 products found/.test(pv) && /61 sold/.test(pv) && /£219\.00/.test(pv), pv);
    check('no "which column is which" for a photo', (await p.locator('[data-testid=till-mapper]').count()) === 0);
    await p.screenshot({ path: `${SHOT}/t1-photo.png`, fullPage: true });
    await p.locator('[data-testid=button-till-next]').tap(); await sleep(700);
    check('Carlsberg pint matched to the draught line', /Lager Carlsberg/.test(await picked('CARLSBERG PT')), await picked('CARLSBERG PT'));
    check('Carlsberg half: 4 halves use 2 pints', /Uses 2 pt/.test(await txt(line('CARLSBERG HALF'))), await txt(line('CARLSBERG HALF')));
    check('Spirit matched: Tanqueray, 12 measures', /Tanqueray/.test(await picked('TANQUERAY GIN')) && /Uses 12 measures/.test(await txt(line('TANQUERAY GIN'))), (await picked('TANQUERAY GIN')) + ' / ' + (await txt(line('TANQUERAY GIN'))));
    check('Soft drink matched: Tango can', /Tango Apple/.test(await picked('TANGO APPLE CAN')), await picked('TANGO APPLE CAN'));
    check('Pool table is not guessed onto a product', !/Lager|Tanqueray|Tango|Vodka|Bombay/.test(await picked('POOL TABLE')) , await picked('POOL TABLE'));
    await p.locator(`${line('POOL TABLE')} button`).filter({ hasText: 'Not stock' }).tap(); await sleep(300);
    await p.screenshot({ path: `${SHOT}/t2-check.png`, fullPage: true });
    await p.locator('[data-testid=button-till-confirm]').tap(); await sleep(2500);
    const sales = await db('sales_records');
    check('4 stock lines saved from the photo', sales.length === 4, JSON.stringify(sales.map(s => [s.product_name_raw, s.quantity_sold])));
    const half = sales.find(s => /CARLSBERG HALF/.test(s.product_name_raw));
    check('halves saved as pints (4 halves = 2)', half && Number(half.quantity_sold) === 2, JSON.stringify(half && half.quantity_sold));
    check('till vs counts shows for all of them', /Unaccounted at cost/.test(await txt('[data-testid=till-variance]')), (await txt('[data-testid=till-variance]')).slice(0, 200));
    check('the gin has a till vs counts row', (await p.locator('[data-testid="till-var-aaaaaaaa-0000-4000-8000-000000000002"]').count()) === 1);
    await p.screenshot({ path: `${SHOT}/t3-result.png`, fullPage: true });
    check("the pub's saved till type is left alone", (await p.evaluate(() => localStorage.getItem('till-import:type'))) !== 'generic');
    const mem = await db('till_import_memory');
    check('matches remembered for next time', mem.length === 1 && Object.keys(mem[0].data.matches).length >= 4, JSON.stringify(mem).slice(0, 200));
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/tX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
