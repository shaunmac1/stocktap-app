// As-user test (HIDDEN=1 node mock-forecast.cjs): Orders leaves out hidden lines and never assumes a case of 12.
// Based on: "lasts X days · order Y" on every Library line, the To order filter, and the
// Orders page starting from newer real counts. Needs mock-forecast.cjs + static.cjs.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const B = n => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const txt = async tid => (await p.locator(`[data-testid="${tid}"]`).first().innerText().catch(() => '')).replace(/\n/g, ' | ');
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  try {
    await p.goto('http://localhost:5173/orders', { waitUntil: 'domcontentloaded' }); await sleep(5000);
    const body = await p.locator('body').innerText();
    check('set-up: Orders loaded with the audit', /Peroni/.test(body), body.slice(0, 300).replace(/\n/g, ' | '));
    check('a hidden line (Strongbow Dark Fruit) is nowhere on Orders', !/Strongbow/.test(body), (body.match(/Strongbow[\s\S]{0,160}/) || [''])[0].replace(/\n/g, ' | '));
    const w = (body.match(/WKD Blue[\s\S]{0,220}/) || [''])[0].replace(/\n+/g, ' | ');
    check('WKD Blue is on the list', /WKD Blue/.test(body), body.slice(0, 500).replace(/\n/g, ' | '));
    check('WKD Blue (audit says Dozen, no case size set) is ordered in single units, not "case of 12"', /Order \| \d+ units/.test(w) && !/case of 12/.test(w), w);
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(4500);
    const lib = await p.locator('body').innerText();
    const lw = (lib.match(/WKD Blue[\s\S]{0,260}/) || [''])[0].replace(/\n+/g, ' | ');
    check('the Library says the same about WKD Blue (no "case of 12")', /WKD Blue/.test(lib) && !/case of 12/.test(lw), lw);
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); }
  console.log(results.join('\n')); await b.close();
})();
