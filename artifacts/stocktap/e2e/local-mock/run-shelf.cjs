// Count in shelf order: a saved order puts lines in the order you walk the fridges.
const { chromium, devices } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
(async () => {
  const get = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const prods = (await get('products')).filter(p => p.category === 'packaged');
  const V = prods[0].venue_id;
  const b = await chromium.launch(); const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const order = async () => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
    const p = await ctx.newPage();
    await p.goto('http://localhost:5173/stocktake?group=bottles', { waitUntil: 'domcontentloaded' }); await sleep(5000);
    const ids = await p.locator('[data-testid^="counting-product-"]:visible').evaluateAll(els => els.map(e => e.getAttribute('data-testid').replace('counting-product-', '')));
    await ctx.close(); return ids;
  };
  try {
    check('set-up: at least two bottle lines', prods.length >= 2, String(prods.length));
    const az = [...prods].sort((a, b) => a.name.localeCompare(b.name)).map(p => p.id);
    const before = await order();
    check('no saved order: A to Z', JSON.stringify(before) === JSON.stringify(az), JSON.stringify(before));
    const shelf = [...az].reverse();
    await fetch(`http://localhost:8899/rest/v1/venues?id=eq.${V}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: { count_order: [shelf[0]] } }) });
    const after = await order();
    check('saved shelf order: that line comes first, the rest follow A to Z', after[0] === shelf[0] && JSON.stringify(after.slice(1)) === JSON.stringify(az.filter(i => i !== shelf[0])), JSON.stringify(after));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); await b.close();
})();
