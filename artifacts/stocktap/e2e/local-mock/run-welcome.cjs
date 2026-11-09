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
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', recordVideo: process.env.FILM ? { dir: '/tmp/uitest/welcome', size: { width: 390, height: 844 } } : undefined });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const tap = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ timeout: 10000 }).catch(() => { throw new Error('not visible: ' + tid); }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(800); };
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await p.screenshot({ path: `${SHOT}/w1-new-pub-home.png`, fullPage: true });
    check('new pub sees the welcome screen', await p.locator('[data-testid="new-pub-welcome"]').isVisible());
    const body = await p.locator('body').innerText();
    check('no fake GP% shown to a new pub', !/Overall GP%/.test(body));
    check('step 1 counts the draught lines', /2 draught lines are loaded/.test(body));
    check('guide video link points at the hosted file', (await p.locator('[data-testid="link-welcome-guide"]').getAttribute('href')) === '/videos/stocktap-barrels-guide.mp4');
    await p.mouse.wheel(0, 400); await sleep(1500); await p.mouse.wheel(0, -400); await sleep(800); await tap('button-count-my-draught'); await sleep(2200);
    await p.screenshot({ path: `${SHOT}/w2-draught-preselected.png` });
    const sel = await p.locator('[data-testid="text-selected-count"]').innerText().catch(() => '');
    check('Count my draught opens a count with the 2 draught lines ticked', /^2 selected/.test(sel), sel);
    await tap('button-start-stocktake'); await sleep(1500);
    check('count starts', await p.locator(`[data-testid="counting-product-${P('a')}"]`).isVisible());
    // with a count open, Home goes back to the normal view with the resume banner
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    check('once a count is open, Home shows the resume banner instead', await p.locator('[data-testid="banner-open-stocktake"]').isVisible() && !(await p.locator('[data-testid="new-pub-welcome"]').count()));
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); await sleep(1500); await ctx.close(); await b.close();
})();
