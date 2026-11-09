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
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const ids = async () => (await p.$$eval('[data-testid]', els => els.filter(e => e.offsetParent !== null).map(e => e.getAttribute('data-testid')))).join(' ');
  const tap = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(700); };
  await p.goto('http://localhost:5173/spot-check', { waitUntil: 'domcontentloaded' }); await sleep(3500);
  console.log('A', await ids()); await p.screenshot({ path: `${SHOT}/sc1.png` });
  await tap('button-select-product-'+P(1)); await tap('button-start-spot-check'); console.log('B', await ids()); await p.screenshot({ path: `${SHOT}/sc2.png` });
  if (await p.locator('[data-testid="button-confirm-spot-check"]:visible').count()) { await tap('button-confirm-spot-check'); console.log('B2', await ids()); }
  await p.screenshot({ path: `${SHOT}/sc3.png` });
  for (let i=0;i<9;i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click();
  await p.locator('[data-testid="input-part-gallons"]:visible').first().fill('6'); await sleep(500);
  await p.screenshot({ path: `${SHOT}/sc4.png`, fullPage: true }); console.log('C', await ids());
  await tap('button-save-location-entry'); console.log('D', await ids()); await p.screenshot({ path: `${SHOT}/sc5.png`, fullPage: true });
  console.log('TEXT', (await p.locator('body').innerText()).slice(0,900));
  console.log('errors', errors); await b.close();
})();
