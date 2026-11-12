// A phone holding counts for a stocktake the server never got (the 12 Nov state): the update must upload them.
const { chromium, devices } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ORPHAN = '814c40ec-6cbd-4b8a-a90d-2743cd31fdc1';
(async () => {
  const get = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const V = (await get('products'))[0].venue_id;
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  try {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    const now = new Date().toISOString();
    const put = await p.evaluate(async ({ DBNAME, entry }) => new Promise((res, rej) => {
      const rq = indexedDB.open(DBNAME);
      rq.onerror = () => rej(String(rq.error));
      rq.onsuccess = () => { const d = rq.result; const tx = d.transaction('line_entries', 'readwrite'); tx.objectStore('line_entries').put(entry); tx.oncomplete = () => { d.close(); res('ok'); }; tx.onerror = () => rej(String(tx.error)); };
    }), { DBNAME: process.env.DBNAME, entry: { id: 'eeeeeeee-0000-4000-8000-000000000001', venue_id: V, stocktake_id: ORPHAN, product_id: A, count_location_id: 'loc-cellar', count_location_name: 'Cellar', method: 'keg_weight', full_containers: 2, part_value: 24, ml_remaining: 2 * 50000 + 24 * 568.261, sync_status: 'pending', entered_at: now, user_id: U, created_at: now, updated_at: now } });
    check('phone holds a count for a stocktake the server never got', put === 'ok' && !(await get('stocktakes')).some(s => s.id === ORPHAN));
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(9000);
    const sts = await get('stocktakes'), ents = await get('stocktake_line_entries');
    check('the stocktake is put up under the same id, open', sts.some(s => s.id === ORPHAN && s.status === 'open'), JSON.stringify(sts.map(s => [s.id.slice(0, 4), s.status])));
    check('the count is on the server: 2 full + 3 gal', ents.some(e => e.id === 'eeeeeeee-0000-4000-8000-000000000001' && e.stocktake_id === ORPHAN && e.full_containers === 2 && Number(e.part_value) === 24), `n=${ents.length}`);
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    const body = (await p.locator('body').innerText()).replace(/\n/g, ' | ');
    check('it shows as an open count to carry on', /open|Resume|Carry on|In progress/i.test(body), body.slice(0, 300));
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n').slice(0, 4).join(' ~ ').slice(0, 500)); }
  console.log(results.join('\n')); await b.close();
})();
