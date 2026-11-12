// StockTap reports its own faults: with a signal, with none (kept on the phone, sent later),
// no-signal noise ignored, nothing typed by the user sent, and normal use reports nothing.
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const sent = async () => (await (await fetch('http://localhost:8899/rest/v1/client_faults')).json());
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage();
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const kept = () => p.evaluate(() => JSON.parse(localStorage.getItem('stocktap:faults') || '[]'));
  try {
    await p.goto('http://localhost:5173/stocktake?view=abc&name=Gordons', { waitUntil: 'domcontentloaded' }); await sleep(8000);
    check('normal use reports nothing', (await sent()).length === 0 && (await kept()).length === 0, JSON.stringify((await kept()).map(f => f.message)).slice(0, 200));

    await p.evaluate(() => { setTimeout(() => { throw new Error('test fault one'); }, 0); }); await sleep(4000);
    let s = await sent();
    check('a fault with a signal reaches us', s.length === 1 && s[0].message.includes('test fault one'), JSON.stringify(s).slice(0, 200));
    check('it says which screen, which version and that there was a signal', s[0] && s[0].route === '/stocktake' && s[0].build && s[0].build !== '?' && s[0].online === true && s[0].kind === 'error', JSON.stringify(s[0] || {}).slice(0, 260));
    check('nothing from the address bar or the pub is sent', s[0] && !JSON.stringify(s[0]).includes('Gordons') && !('price' in s[0]));
    check('sent faults are cleared off the phone', (await kept()).length === 0);

    await p.evaluate(() => { Promise.reject(new TypeError('Failed to fetch')); }); await sleep(2500);
    check('no signal on its own is not reported as a fault', (await sent()).length === 1 && (await kept()).length === 0);

    await ctx.setOffline(true); await sleep(500);
    await p.evaluate(() => { Promise.reject(new Error('cellar fault two')); });
    await p.evaluate(() => { Promise.reject(new Error('cellar fault two')); }); await sleep(3500);
    const k = await kept();
    check('with no signal the fault is kept on the phone, once', k.length === 1 && k[0].message === 'cellar fault two' && k[0].online === false && k[0].kind === 'promise', JSON.stringify(k).slice(0, 200));
    check('and nothing was sent while offline', (await sent()).length === 1);
    await ctx.setOffline(false); await sleep(4500);
    s = await sent();
    check('when the signal comes back it is sent', s.length === 2 && s[1].message === 'cellar fault two' && s[1].online === false, JSON.stringify(s.map(x => x.message)));
    check('and cleared off the phone', (await kept()).length === 0);
    check('the app is still on screen and usable', await p.locator('#root > *').count() > 0 && await p.locator('[data-testid="crash-screen"]').count() === 0);
  } catch (e) { check('run completed', false, e.message); }
  console.log(results.join('\n')); console.log(`${results.filter(r => r.startsWith('PASS')).length} pass, ${results.filter(r => r.startsWith('FAIL')).length} fail`);
  await b.close();
})();
