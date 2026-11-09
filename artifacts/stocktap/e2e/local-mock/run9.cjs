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
  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  const errs = errors;
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check('Home shows Stock & Orders', await p.locator('[data-testid="button-home-orders"]').count() === 1);
    check('no update banner when up to date', await p.locator('[data-testid="banner-update-ready"]').count() === 0);
    const fs = require('fs'); const f = '/tmp/ui-dist/index.html'; const orig = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, orig.replace(/assets\/index-[^"]+\.js/, 'assets/index-NEWVERSION.js'));
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(1500);
    check('update banner appears when a new version is live', await p.locator('[data-testid="banner-update-ready"]').count() === 1);
    await p.screenshot({ path: '/tmp/uitest/update-banner.png' });
    fs.writeFileSync(f, orig);
  } catch (e) { results.push('ERROR ' + e.message); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
