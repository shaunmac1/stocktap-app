// A count a day + staff counting: landlord sets the rota, staff count with no prices, landlord is told.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 86400;
const sess = (id, email) => { const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', exp, email })}.sig`;
  return { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }; };
const U = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-0000-4000-8000-00000000000a', B = 'aaaaaaaa-0000-4000-8000-00000000000b', PK = 'aaaaaaaa-0000-4000-8000-0000000000c1';
(async () => {
  const get = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const set = o => fetch('http://localhost:8899/__set', { method: 'POST', body: JSON.stringify(o) });
  const prods = await get('products'); const V = prods[0].venue_id; const now = new Date().toISOString();
  await set({
    products: [...prods, { ...prods[0], id: PK, name: 'PPL Budweiser 330ml', category: 'packaged', counting_method: 'each', unit: 'count', container_l: null, container_type: null, size_ml: 330, pack_size: 24, cost_price: 1.1, pour_price: 4.2, type: 'packaged' }],
    venue_members: [{ id: 'm1', venue_id: V, user_id: U, role: 'owner' }, { id: 'm2', venue_id: V, user_id: U2, role: 'staff' }],
    staff: [{ id: 's1', venue_id: V, name: 'Sam', user_id: U2, active: true, hourly_rate: 12, link_code: 'ABC123', created_at: now }],
  });
  const b = await chromium.launch();
  const mk = async (id, email) => { const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(sess(id, email))); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return { ctx, p }; };
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const H = p => ({
    T: tid => p.locator(`[data-testid="${tid}"]:visible`).first(),
    tap: async (tid, w = 500) => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ state: 'visible', timeout: 10000 }); await l.scrollIntoViewIfNeeded(); await l.tap(); await sleep(w); },
    txt: async tid => (await p.locator(`[data-testid="${tid}"]:visible`).first().innerText().catch(() => '')).replace(/\n/g, ' | '),
    has: async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0,
    body: async () => (await p.locator('body').innerText()).replace(/\n/g, ' | '),
  });
  const day = new Date().getDay();
  try {
    // ── landlord: set the rota, switch staff counting on ──
    const owner = await mk(U, 'owner@example.test'); const o = H(owner.p);
    await owner.p.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await owner.p.getByRole('tab', { name: 'Counting' }).tap(); await sleep(600);
    check('rota editor shows seven days', await owner.p.locator('[data-testid^="select-rota-"]:visible').count() === 7);
    await o.T(`select-rota-${day}`).scrollIntoViewIfNeeded(); await o.T(`select-rota-${day}`).selectOption('kegs'); await sleep(1500);
    await o.tap('switch-staff-count', 1500);
    await o.T('input-weekly-target').scrollIntoViewIfNeeded(); await o.T('input-weekly-target').fill('50'); await o.T('input-weekly-target').blur(); await sleep(1500);
    const ven = (await get('venues'))[0];
    check('weekly target of 50 saved', ven.features?.weekly_line_target === 50, JSON.stringify(ven.features));
    check('rota and staff switch saved for the pub', ven.features?.count_rota?.[day] === 'kegs' && ven.features?.staff_count === true, JSON.stringify(ven.features));
    await owner.p.screenshot({ path: `${SHOT}/r1.png` });
    await owner.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check("Home: today's count is kegs and casks, 2 lines", /Kegs and casks/.test(await o.txt('text-todays-group')) && /2 lines, about/.test(await o.txt('text-todays-detail')), `${await o.txt('text-todays-group')} / ${await o.txt('text-todays-detail')}`);
    await o.T('card-todays-count').scrollIntoViewIfNeeded(); await owner.p.screenshot({ path: `${SHOT}/r2.png` });

    // ── staff phone ──
    const staff = await mk(U2, 'sam@example.test'); const s = H(staff.p);
    await staff.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('staff see a Count button', /Count/.test(await staff.p.locator('nav').innerText()), await staff.p.locator('nav').innerText());
    await staff.p.locator('nav a[href$="/count"]').tap(); await sleep(2500);
    check("staff: today's count is kegs and casks", /Kegs and casks/.test(await s.txt('text-todays-group')), await s.body());
    await staff.p.screenshot({ path: `${SHOT}/r3.png` });
    await staff.ctx.setOffline(true);                       // no signal in the cellar
    await s.tap('card-todays-count', 2500);
    check('one tap and they are counting: 0 of 2', /0 of 2 counted/.test(await s.txt('text-count-progress')), (await s.body()).slice(0, 200));
    check('no Hide buttons for staff', await staff.p.locator('[data-testid^="button-quick-hide-"]').count() === 0);
    const countKeg = async (pid, full, gal) => {
      if (await s.has(`counting-product-${pid}`)) await s.tap(`counting-product-${pid}`); await sleep(600);
      if (!(await s.has('button-full-plus'))) { await s.tap('button-add-entry', 600); if (!(await s.has('button-location-loc-cellar')) && await s.has('button-change-spot')) await s.tap('button-change-spot'); await s.tap('button-location-loc-cellar', 600); }
      if (await s.has('button-keg-mode-kegs')) await s.tap('button-keg-mode-kegs');
      for (let i = 0; i < full; i++) await s.tap('button-full-plus', 150);
      if (gal != null) await s.tap(`button-part-gallons-${gal}`);
      const during = await s.body();
      await s.tap('button-save-entry', 1500);
      if (await s.has('button-back-to-products')) await s.tap('button-back-to-products');
      return during;
    };
    const seen = [await countKeg(A, 2, 4)]; await sleep(6000); seen.push(await countKeg(B, 1, null));
    await s.tap('button-review-stocktake', 1500); seen.push(await s.body());
    check('review shows lines counted, not a value', /Lines counted \| 2/.test(await s.txt('card-staff-summary')), await s.txt('card-staff-summary'));
    await staff.p.screenshot({ path: `${SHOT}/r4.png` });
    await s.tap('button-finish-stocktake', 3000); seen.push(await s.body());
    check('finished: thanked, back on the staff count screen', await s.has('staff-count-done') && !/Past Stocktakes/.test(await s.body()), (await s.body()).slice(0, 200));
    check('staff never saw a £ sign or a GP figure', !seen.some(t => /£|GP \d|stock value|cost price/i.test(t)), seen.map(t => (t.match(/.{0,30}(£|GP \d|stock value|cost price).{0,30}/i) || [''])[0]).filter(Boolean).join(' ~ '));
    await staff.ctx.setOffline(false); await staff.p.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(10000);
    const sts = await get('stocktakes'), rds = (await get('readings')).filter(r => r.stocktake_id), ents = await get('stocktake_line_entries');
    check('uploaded once signal is back: one closed stocktake, 2 counts, 2 readings', sts.length === 1 && sts[0].status === 'closed' && ents.length === 2 && rds.length === 2, `st=${sts.length}/${sts[0]?.status} e=${ents.length} r=${rds.length}`);
    check('the readings are stamped with the staff member', rds.every(r => r.user_id === U2), JSON.stringify(rds.map(r => r.user_id)));
    // bottles: the sheet that shows "£ stock value" to the landlord
    await staff.p.goto('http://localhost:5173/count', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    check('today now shows as counted', await s.has('card-todays-count-done'), (await s.body()).slice(0, 200));
    await staff.p.locator('[data-testid="count-something-else"] summary').tap(); await sleep(400);
    await s.tap('button-group-bottles', 3000);
    if (await s.has(`counting-product-${PK}`)) await s.tap(`counting-product-${PK}`); await sleep(800);
    if (await s.has('button-add-entry')) { await s.tap('button-add-entry', 600); if (await s.has('button-location-loc-cellar')) await s.tap('button-location-loc-cellar', 600); }
    const sheet = await s.body();
    check('bottle sheet for staff: cases question or count, no £', /How do these come in|Full cases|bottles/i.test(sheet) && !/£|stock value/i.test(sheet), (sheet.match(/.{0,40}(£|stock value).{0,40}/i) || [sheet.slice(0, 200)])[0]);
    await staff.p.screenshot({ path: `${SHOT}/r5.png` });
    for (const path of ['/library', '/reports', '/stocktake', '/settings', '/orders', '/days-left']) {
      await staff.p.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' }); await sleep(1800);
      const t = await s.body();
      if (/£|Total Stock Value|Past Stocktakes|cost price/i.test(t)) { check(`staff typing ${path} into the address bar see no stock money`, false, t.slice(0, 160)); }
    }
    check('staff cannot reach Library, Reports, Stocktake list, Settings, Orders or Days left', !results.some(r => r.startsWith('FAIL staff typing')));
    const lg = (await (await fetch('http://localhost:8899/__log')).json()).log;
    const push = lg.find(l => l.fn === 'send-push');
    check('landlord pinged the moment it finished', !!push && push.notify_venue === V && /Kegs and casks counted/.test(push.title) && /2 lines/.test(push.body) && /view=/.test(push.url), JSON.stringify(push));
    check('no page errors on the staff phone', staff.p.errs.length === 0, staff.p.errs.slice(0, 2).join(' | '));

    // ── landlord again ──
    await owner.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check('Home: "Counted by Sam", 2 lines', /Counted by Sam/.test(await o.txt('staff-counts')) && /2 lines/.test(await o.txt('staff-counts')), await o.txt('staff-counts'));
    check('Home: today shows done', await o.has('card-todays-count-done'));
    check('Home: 2 of 50 lines counted this week, 48 to go', /2 of 50 lines counted this week/.test(await o.txt('card-weekly-target')) && /48 to go/.test(await o.txt('card-weekly-target')), await o.txt('card-weekly-target'));
    await owner.p.screenshot({ path: `${SHOT}/r6.png` });
    await o.tap(`button-view-staff-count-${sts[0].id}`, 3000);
    check('landlord opens the count and does see the value', /Total Stock Value/.test(await o.body()) && /£/.test(await o.body()), (await o.body()).slice(0, 200));
    await owner.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await o.tap(`button-dismiss-staff-count-${sts[0].id}`, 600);
    check('"Got it" clears the notice', !(await o.has('staff-counts')));
    // switch it off again: the staff Count button goes
    await owner.p.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await owner.p.getByRole('tab', { name: 'Counting' }).tap(); await sleep(600); await o.tap('switch-staff-count', 1500);
    await staff.p.goto('http://localhost:5173/count', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('landlord switches staff counting off: Count button and screen are gone', !/Count/.test(await staff.p.locator('nav').innerText()) && !(await s.has('todays-count')), await staff.p.locator('nav').innerText());
    check('no page errors on the landlord phone', owner.p.errs.length === 0, owner.p.errs.slice(0, 2).join(' | '));
  } catch (err) { try { for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `${SHOT}/rX-${b.contexts().indexOf(c)}.png` }); } catch {} results.push('ERROR ' + err.message.split('\n').slice(0, 6).join(' ~ ').slice(0, 600)); }
  console.log(results.join('\n')); await b.close();
})();
