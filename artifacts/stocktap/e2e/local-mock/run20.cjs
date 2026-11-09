// Reports > Upload sales with a till product report that has no date column (one date for the lot, totals row left out).
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots20'; fs.mkdirSync(SHOT, { recursive: true });
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
  try {
    const prods = await (await fetch('http://localhost:8899/rest/v1/products?select=*')).json();
    const a = prods[0].name, b = prods[1].name;
    require('fs').writeFileSync('/tmp/sales.csv', `Name,Qty,Sales Inc. Tax\n${a},12,54.00\n${b},3,"1,020.00"\nUnknown Crisps,5,5.00\nTotal,20,"1,079.00"\n`);
    await go('/reports');
    await p.getByRole('tab', { name: 'COGS' }).first().click(); await sleep(800);
    await p.locator('[data-testid="button-upload-sales"]').click(); await sleep(600);
    await p.locator('[data-testid="input-sales-csv-file"]').setInputFiles('/tmp/sales.csv'); await sleep(900);
    check('No date column: asks for one date for the lot', await p.locator('[data-testid="input-sales-file-date"]').count() === 1 && await p.locator('[data-testid="button-apply-sales-mapping"]').isEnabled());
    await p.locator('[data-testid="input-sales-file-date"]').fill('2026-09-28');
    await p.locator('[data-testid="button-apply-sales-mapping"]').click(); await sleep(600);
    const pv = await p.locator('table').last().innerText();
    check('Preview: 3 rows, totals row left out, dated 28 Sep', /3 rows parsed/.test(await p.locator('[role="dialog"]').innerText()) && !/\bTotal\b/.test(pv) && (pv.match(/2026-09-28/g) || []).length === 3, pv.replace(/\s+/g, ' ').slice(0, 200));
    await p.locator('[data-testid="button-confirm-sales-import"]').click(); await sleep(1200);
    const rows = await (await fetch('http://localhost:8899/rest/v1/sales_records?select=*')).json();
    check('Saved with matches and pence', rows.length === 3 && rows.filter(r => r.product_id).length === 2 && rows.some(r => r.revenue_pence === 102000), JSON.stringify(rows.map(r => [r.product_name_raw, r.quantity_sold, r.revenue_pence, !!r.product_id])));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
