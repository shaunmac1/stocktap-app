// As-user test: a device holding old counts still sees the counts done on another device.
// (Real case: a laptop with two stale counts never showed five finished on the phone, so
// "Import till sales" said "you need two finished counts first".) Needs mock12.cjs + static.cjs.
const { chromium, devices } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const syncErrors = []; p.on('console', m => { if (/\[Sync\] error/.test(m.text())) syncErrors.push(m.text()); });
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const server = await (await fetch('http://localhost:8899/rest/v1/stocktakes?select=*')).json();
  const V = server[0].venue_id;
  // A pub with a delivery on the books: this used to make the whole download fail on every device.
  const prods = await (await fetch('http://localhost:8899/rest/v1/products?select=*')).json();
  await fetch('http://localhost:8899/rest/v1/stock_movements', { method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id: '99999999-9999-4999-8999-999999999999', venue_id: V, product_id: prods[0].id, movement_type: 'delivery', quantity_ml: 50000, moved_at: new Date().toISOString(), created_at: new Date().toISOString() }) });
  const mv = await (await fetch('http://localhost:8899/rest/v1/stock_movements?select=*')).json();
  const localIds = () => p.evaluate(() => new Promise(ok => { const r = indexedDB.open('stocktap_v1'); r.onsuccess = () => { const q = r.result.transaction('stocktakes').objectStore('stocktakes').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.map(x => x.id).sort()); }; }; }));
  try {
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    // Make this "device" hold only old counts the server no longer has, plus one started offline here.
    await p.evaluate(V => new Promise(ok => { const r = indexedDB.open('stocktap_v1'); r.onsuccess = () => { const tx = r.result.transaction('stocktakes', 'readwrite'); const st = tx.objectStore('stocktakes'); st.clear();
      st.put({ id: 'stale-closed', venue_id: V, status: 'closed', opened_at: '2026-09-09T10:00:00Z', closed_at: '2026-09-09T11:00:00Z', _temp: 0 });
      st.put({ id: 'stale-open', venue_id: V, status: 'open', opened_at: '2026-09-28T10:00:00Z', closed_at: null, _temp: 0 });
      st.put({ id: 'made-here-offline', venue_id: V, status: 'open', opened_at: '2026-11-11T10:00:00Z', closed_at: null, _temp: 1 });
      tx.oncomplete = () => { r.result.close(); ok(); }; }; }), V);
    check('set-up: the server has 2 or more finished counts', server.filter(s => s.status === 'closed').length >= 2, String(server.length));
    await p.goto('http://localhost:5173/till-import', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check('Import till sales opens (no "you need two finished counts first")', (await p.locator('[data-testid="till-need-counts"]').count()) === 0);
    const opts = await p.locator('[data-testid="till-open-count"] option').count();
    check('the counts from the other device are offered', opts >= 2, String(opts));
    const ids = await localIds();
    check('old counts the server no longer has are gone from this device', !ids.includes('stale-closed') && !ids.includes('stale-open'), ids.join(','));
    check('a count started here with no signal is kept', ids.includes('made-here-offline'), ids.join(','));
    check("this device now holds the server's counts", server.every(s => ids.includes(s.id)), ids.join(','));
    check('set-up: the server has a delivery', mv.length >= 1, String(mv.length));
    check('the background download finishes with a delivery on the books (no sync error)', syncErrors.length === 0, syncErrors[0] || '');
    const localMv = await p.evaluate(() => new Promise(ok => { const r = indexedDB.open('stocktap_v1'); r.onsuccess = () => { const q = r.result.transaction('movements').objectStore('movements').count(); q.onsuccess = () => { r.result.close(); ok(q.result); }; }; }));
    check('the delivery reaches this device', localMv >= 1, String(localMv));
    // No signal: the phone's own copy still works
    await ctx.setOffline(true);
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await ctx.setOffline(false);
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); }
  console.log(results.join('\n')); await b.close();
})();
