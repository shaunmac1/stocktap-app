// Count-screen fixes, driven as a user on a phone-sized screen against mock5.cjs.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/explore'; fs.mkdirSync(SHOT, { recursive: true });
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
  const out = {};
  for (const r of ['/', '/library', '/stocktake', '/spot-check', '/reports', '/settings', '/ledger', '/daily-board', '/checks', '/finances', '/team', '/rota', '/suggestions', '/invoice-scan', '/first-count', '/delivery', '/orders', '/help']) {
    await p.goto('http://localhost:5173' + r, { waitUntil: 'domcontentloaded' }); await sleep(2500);
    const name = r === '/' ? 'home' : r.slice(1);
    await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true });
    out[r] = await p.evaluate(() => ({ h: document.querySelector('h1')?.innerText, ids: [...new Set([...document.querySelectorAll('[data-testid]')].map(e => e.dataset.testid.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '<id>')))].slice(0, 60), tabs: [...document.querySelectorAll('[role=tab]')].map(e => e.innerText) }));
  }
  fs.writeFileSync(`${SHOT}/explore.json`, JSON.stringify(out, null, 1));
  console.log('errors', errs.join(' | ') || 'none'); await b.close();
})();
