// How-to button on every screen: placement, sheet, videos load.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots14'; fs.mkdirSync(SHOT, { recursive: true });
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
  try {
    for (const r of ['/', '/library', '/stocktake', '/spot-check', '/reports', '/daily-board', '/checks', '/finances', '/team', '/rota', '/ledger', '/settings', '/orders', '/delivery']) {
      await p.goto('http://localhost:5173' + r, { waitUntil: 'domcontentloaded' }); await sleep(2200);
      const has = await p.locator('[data-testid="button-help-videos"]').count();
      check(`How to button on ${r}`, has === 1);
      await p.screenshot({ path: `${SHOT}/${r === '/' ? 'home' : r.slice(1)}.png` });
    }
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(2200);
    await p.locator('[data-testid="button-help-videos"]').click(); await sleep(800);
    check('sheet opens with a player', await p.locator('[data-testid="help-video-player"]').count() === 1);
    const srcs = await p.evaluate(() => [document.querySelector('[data-testid="help-video-player"]').getAttribute('src'), ...[...document.querySelectorAll('[data-testid^="help-video-"] img')].map(i => i.getAttribute('src'))]);
    const bad = [];
    for (const s of srcs) { const st = await p.evaluate(async u => (await fetch(u, { method: 'HEAD' })).status, s); if (st !== 200) bad.push(s); }
    check('video and posters load', bad.length === 0 && srcs.length === 4, bad.join(','));
    await p.screenshot({ path: `${SHOT}/sheet.png` });
    await p.locator('[data-testid="help-video-library-weigh-bottle"]').click(); await sleep(400);
    check('picking another plays it', (await p.locator('[data-testid="help-video-player"]').getAttribute('src')).includes('library-weigh-bottle'));
    await p.keyboard.press('Escape'); await sleep(400);
    await p.locator('[data-testid="button-add-product-fab"]').click(); await sleep(800);
    check('button hides while another sheet is open', await p.locator('[data-testid="button-help-videos"]').count() === 0);
  } catch (e) { results.push('ERROR ' + e.message); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
