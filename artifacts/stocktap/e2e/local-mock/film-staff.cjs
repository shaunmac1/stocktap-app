// Phone-size film: what a member of staff sees. Today's count, counting, finish.
const { chromium } = require('playwright');
const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 86400;
const sess = (id, email) => { const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', exp, email })}.sig`;
  return { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }; };
const U = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-0000-4000-8000-00000000000a', B = 'aaaaaaaa-0000-4000-8000-00000000000b';
(async () => {
  const get = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const prods = await get('products'); const V = prods[0].venue_id; const now = new Date().toISOString();
  const rota = [null, null, null, null, null, null, null]; rota[new Date().getDay()] = 'kegs';
  const ven = (await get('venues'))[0];
  await fetch('http://localhost:8899/__set', { method: 'POST', body: JSON.stringify({
    venues: [{ ...ven, name: 'The Demo Arms', features: { staff_count: true, count_rota: rota, weekly_line_target: 50 } }],
    venue_members: [{ id: 'm1', venue_id: V, user_id: U, role: 'owner' }, { id: 'm2', venue_id: V, user_id: U2, role: 'staff' }],
    staff: [{ id: 's1', venue_id: V, name: 'Sam', user_id: U2, active: true, hourly_rate: 12, link_code: 'ABC123', created_at: now }] }) });
  fs.rmSync('/tmp/film-staff', { recursive: true, force: true });
  const b = await chromium.launch();
  const mk = async (id, email, rec) => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block', permissions: ['notifications'], ...(rec ? { recordVideo: { dir: rec, size: { width: 780, height: 1688 } } } : {}) });
    await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(sess(id, email)));
    await ctx.addInitScript(() => { try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); } catch {} });
    await ctx.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:99999;width:44px;height:44px;border-radius:50%;background:rgba(15,115,55,.35);border:2px solid #0f7337;pointer-events:none;opacity:0;transition:opacity .25s;transform:translate(-50%,-50%)'; document.body.appendChild(d); addEventListener('pointerdown', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; d.style.opacity = '1'; setTimeout(() => d.style.opacity = '0', 500); }, true); }); });
    return { ctx, p: await ctx.newPage() }; };
  const H = p => ({ T: tid => p.locator(`[data-testid="${tid}"]:visible`).first(),
    tap: async (tid, w = 900) => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ state: 'visible', timeout: 10000 }); await l.scrollIntoViewIfNeeded(); await sleep(350); await l.tap(); await sleep(w); },
    has: async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0 });
  const marks = []; const t0 = Date.now(); const mark = label => marks.push({ t: (Date.now() - t0) / 1000, label });
  const staff = await mk(U2, 'sam@example.test', '/tmp/film-staff/staff'); const s = H(staff.p);
  // clocking in and out, answered here so the film shows the real screen
  let since = null;
  await staff.ctx.route('**/rest/v1/rpc/my_shift_status', r => r.fulfill({ json: { linked: true, name: 'Sam', venue_name: 'The Demo Arms', on_shift: !!since, since } }));
  await staff.ctx.route('**/rest/v1/rpc/clock_in', r => { since = new Date().toISOString(); r.fulfill({ json: { on_shift: true, since } }); });
  await staff.ctx.route('**/rest/v1/rpc/clock_out', r => { since = null; r.fulfill({ json: { on_shift: false } }); });
  await staff.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
  mark('Start of shift: one tap to clock in');
  await sleep(2200);
  await staff.p.getByRole('button', { name: /Clock in/ }).tap(); await sleep(3200);
  mark('On shift. Now the Count button at the bottom');
  await sleep(1800);
  await staff.p.locator('nav a[href$="/count"]').tap(); await sleep(3000);
  mark("Today's count is waiting. Nothing to work out");
  await sleep(2500);
  await s.tap('card-count-kegs', 3000);
  mark('One tap and they are counting');
  await sleep(1500);
  const keg = async (pid, full, gal) => {
    if (await s.has(`counting-product-${pid}`)) await s.tap(`counting-product-${pid}`, 1200);
    if (!(await s.has('button-full-plus'))) { await s.tap('button-add-entry', 800); await s.tap('button-location-loc-cellar', 900); }
    if (await s.has('button-keg-mode-kegs')) await s.tap('button-keg-mode-kegs');
    for (let i = 0; i < full; i++) await s.tap('button-full-plus', 450);
    if (gal != null) await s.tap(`button-part-gallons-${gal}`, 1200);
    await s.tap('button-save-entry', 1800);
    if (await s.has('button-back-to-products')) await s.tap('button-back-to-products', 1000);
  };
  mark('Full kegs, then gallons on the gauge. No prices anywhere');
  await keg(A, 2, 4); await sleep(1500);
  // cut to the landlord's phone while the count is still going
  const pauseStart = (Date.now() - t0) / 1000;
  for (let i = 0; i < 30 && (await get('stocktake_line_entries')).length === 0; i++) await sleep(500);
  const mid = await mk(U, 'owner@example.test', '/tmp/film-staff/mid'); const om = H(mid.p); const tm = Date.now();
  await mid.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(4500);
  const midStart = (Date.now() - tm) / 1000;
  await mid.p.locator('[data-testid^="staff-counting-"]').first().scrollIntoViewIfNeeded(); await sleep(2500);
  await mid.p.locator('[data-testid^="button-staff-counting-toggle-"]').first().tap(); await sleep(4000);
  const midVid = await mid.p.video().path(); const midLen = (Date.now() - tm) / 1000; await mid.ctx.close();
  const pauseEnd = (Date.now() - t0) / 1000;
  mark('Back behind the bar: the next line');
  await keg(B, 1, null);
  mark('All counted. One button: Finish & send');
  await s.tap('button-staff-finish', 2600);
  await s.tap('button-staff-send', 3500);
  mark('Sent. The landlord has it straight away');
  await sleep(3200);
  await staff.p.locator('nav a').first().tap(); await sleep(2200);
  mark('End of shift: one tap to clock out');
  await sleep(1500);
  await staff.p.getByRole('button', { name: /Clock out/ }).tap(); await sleep(3200);
  const staffVid = await staff.p.video().path(); const staffLen = (Date.now() - t0) / 1000; await staff.ctx.close();
  await sleep(1500);
  const owner = await mk(U, 'owner@example.test', '/tmp/film-staff/owner'); const o = H(owner.p); const t1 = Date.now();
  await owner.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(4500);
  await o.T('staff-counts').scrollIntoViewIfNeeded(); await sleep(4500);
  const sts = await get('stocktakes');
  await o.tap(`button-view-staff-count-${sts[sts.length - 1].id}`, 4500);
  const ownerVid = await owner.p.video().path(); const ownerLen = (Date.now() - t1) / 1000; await owner.ctx.close(); await b.close();
  fs.writeFileSync('/tmp/film-staff/marks.json', JSON.stringify({ marks, staffVid, staffLen, ownerVid, ownerLen, pauseStart, pauseEnd, midVid, midStart, midLen }));
  console.log(JSON.stringify({ staffLen, ownerLen, n: marks.length }));
})();
