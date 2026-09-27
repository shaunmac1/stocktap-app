const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const SHOT='/tmp/uitest/shots';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const session = { access_token: `${b64({alg:'HS256'})}.${b64({ sub: U, role: 'authenticated', exp })}.sig`, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(s => localStorage.setItem('sb-localhost-auth-token', s), JSON.stringify(session));
  const p = await ctx.newPage(); const R=[];
  const tap = async (tid) => { const l = p.locator(`[data-testid="${tid}"]`).first(); await l.waitFor({ state: 'visible', timeout: 10000 }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(700); };
  try {
    await p.goto('http://localhost:5173/spot-check'); await sleep(3500);
    await p.screenshot({ path: `${SHOT}/30.png` });
    console.log('URL', p.url(), (await p.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g,' | '));
    await tap('button-select-product-aaaaaaaa-0000-4000-8000-000000000003');
    await tap('button-start-spot-check'); await sleep(1200);
    const loc = p.locator('[data-testid^="button-count-location-"]'); if (await loc.count()) { await loc.first().click(); await sleep(800); }
    await p.screenshot({ path: `${SHOT}/31.png` });
    R.push(`${await p.locator('[data-testid="tenths-input"]').isVisible() ? 'PASS' : 'FAIL'} spot check (no weights) shows the tenths bottle`);
  } catch (e) { R.push('FATAL ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/ERR3.png` }); }
  console.log(R.join('\n')); await b.close();
})();
