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
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const tap = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ timeout: 10000 }).catch(() => { throw new Error('not visible: ' + tid); }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(800); };
  const plus = async k => { for (let i = 0; i < k; i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click(); };
  const log = async () => (await fetch('http://localhost:8899/__log')).json();
  try {
    await p.goto('http://localhost:5173/spot-check', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    // rapid double tap on Start used to open several spot checks
    await p.locator(`[data-testid="button-select-product-${P('a')}"]`).first().click(); await sleep(300);
    await p.locator('[data-testid="button-start-spot-check"]').click(); await sleep(1000);
    await plus(9); await p.locator('[data-testid="input-part-gallons"]:visible').fill('6'); await sleep(200);
    const save = p.locator('[data-testid="button-save-location-entry"]:visible').first();
    await Promise.all([save.click(), save.click({ force: true }).catch(() => {})]); await sleep(1500);
    let L = await log();
    const sessions = L.log.filter(x => x.insert === 'spot_check_sessions');
    check('one spot check opened, even with a double tap', sessions.length === 1, `${sessions.length} opened`);
    const sid = sessions[0]?.items?.[0]?.id;
    // offline: count the outside store
    await ctx.setOffline(true);
    if (await p.locator('[data-testid="sc-dup-ask"]:visible').count()) await tap('button-sc-dup-replace');
    await plus(4); await p.locator('[data-testid="button-save-location-entry"]:visible').first().click(); await sleep(1200);
    // meanwhile the spot check gets closed on the server (as happened at 10:48)
    await fetch(`http://localhost:8899/rest/v1/spot_check_sessions?id=eq.${sid}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) });
    await ctx.setOffline(false); await sleep(800);
    await p.getByRole('button', { name: 'Sync now' }).click().catch(() => {}); await sleep(4000);
    const body = await p.locator('body').innerText();
    check('sync clears: no "pending sync" left', !/pending sync/.test(body), (body.match(/\d+ changes? pending sync/) || [''])[0]);
    L = await log();
    const outside = L.log.filter(x => x.insert === 'stocktake_line_entries').flatMap(x => x.items).filter(i => i.count_location_id === 'loc-outside');
    check('the outside count reached the server, moved to a fresh open spot check', outside.length > 0 && outside[outside.length - 1].spot_check_id !== sid, `entries=${outside.length}`);
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/syncX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
