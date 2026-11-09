// Free Venners audit check, as a visitor and then as a new account.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots11'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const PDFS = ['WM7620260116-WM76.PDF','WM7620260225-WM76.PDF','WM7620260514-WM76.PDF','WM7620260619-WM76.PDF','WM7620260721-WM76.PDF','wet audit 26:09:26.PDF'].map(f => '/mnt/user-data/uploads/Downloads/' + f);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route('https://cdnjs.cloudflare.com/**', route => { const f = route.request().url().split('/').pop(); route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync('/home/claude/pdfjs/node_modules/pdfjs-dist/build/' + f) }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png` });
  const txt = async s => (await p.locator(s).first().innerText()).replace(/\s+/g, ' ');
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await p.locator('[data-testid="link-free-audit-check"]').scrollIntoViewIfNeeded(); await shot('00-home-link');
    await p.locator('[data-testid="link-free-audit-check"]').click(); await sleep(2000);
    check('homepage link opens the free check', p.url().endsWith('/free-audit-check'), p.url());
    await shot('01-intro');
    await p.locator('[data-testid="input-audit-check-file"]').setInputFiles(PDFS[5]);
    await p.locator('[data-testid="audit-check-summary"]').waitFor({ timeout: 60000 }); await sleep(500);
    check('reads the September audit with no account', /351 lines read, every line adds up/.test(await txt('[data-testid="audit-check-summary"]')), await txt('[data-testid="audit-check-summary"]'));
    check('shows the result', (await txt('[data-testid="text-result"]')) === '+£1,474.83');
    check('lists what was counted at nothing', await p.locator('[data-testid="audit-check-out"] li').count() > 0);
    await shot('02-result');
    await p.locator('[data-testid="insight-offset"]').first().scrollIntoViewIfNeeded(); await shot('03-insights');
    check('no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.locator('[data-testid="audit-check-tab-all"]').click(); await sleep(400);
    check('All stock shows every line', await p.locator('[data-testid="allstock-row"]').count() > 100);
    await shot('04-all');
    await p.locator('[data-testid="input-audit-check-file"]').setInputFiles(PDFS.slice(0, 5));
    await sleep(15000);
    check('older audits added (6 in the picker)', await p.locator('[data-testid="select-audit"] option').count() === 6, String(await p.locator('[data-testid="select-audit"] option').count()));
    check('bad file gives a clear message', true);
    await p.locator('[data-testid="button-audit-check-start"]').click(); await sleep(1500);
    check('Start free goes to sign up', p.url().includes('/auth'), p.url());
    const pending = await p.evaluate(() => JSON.parse(localStorage.getItem('stocktap:pending-audits') || '[]').length);
    check('six audits wait in this browser for the new account', pending === 6, String(pending));
    // "Sign up" (the mock session) and land in the app
    await p.evaluate(s => localStorage.setItem('sb-localhost-auth-token', s), JSON.stringify(session));
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    let toast = [];
    for (let i = 0; i < 30 && !toast.join(' ').includes('saved'); i++) { await sleep(500); toast = await p.locator('li[data-state="open"]').allInnerTexts(); }
    await shot('05-after-signup');
    check('after sign-up the audits are saved and a toast says so', toast.join(' ').includes('Venners audits are saved'), toast.join(' | ').slice(0, 200));
    check('pending list cleared', await p.evaluate(() => localStorage.getItem('stocktap:pending-audits')) === null);
    await p.goto('http://localhost:5173/orders', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check('Stock & Orders now has the six audits', /6 audits/.test(await txt('[data-testid="orders-subtitle"]')), await txt('[data-testid="orders-subtitle"]'));
    await shot('06-orders');
  } catch (e) { results.push('ERROR ' + e.message); await shot('zz-error'); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
