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
    check('rota editor shows seven days', await owner.p.locator('[data-testid^="rota-day-"]:visible').count() === 7);
    const DEF = [['rum', 'liqueurs'], ['bottles'], ['minerals'], ['wine'], ['kegs'], ['gin', 'vodka', 'whisky'], []];
    for (const k of DEF[day]) if (k !== 'kegs') await o.tap(`rota-${day}-${k}`, 1200);   // clear today's defaults
    if (!DEF[day].includes('kegs')) await o.tap(`rota-${day}-kegs`, 1200);
    check('a day can hold more than one group', (await o.T(`rota-${day}-kegs`).getAttribute('aria-pressed')) === 'true');
    await o.tap('switch-staff-count', 1500);
    await o.T('input-weekly-target').scrollIntoViewIfNeeded(); await o.T('input-weekly-target').fill('50'); await o.T('input-weekly-target').blur(); await sleep(1500);
    const ven = (await get('venues'))[0];
    check('weekly target of 50 saved', ven.features?.weekly_line_target === 50, JSON.stringify(ven.features));
    check('rota and staff switch saved for the pub', JSON.stringify((ven.features?.count_rota ?? DEF)[day]) === '["kegs"]' && ven.features?.staff_count === true, JSON.stringify(ven.features));
    await owner.p.screenshot({ path: `${SHOT}/r1.png` });
    await owner.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check("Home: today's count is kegs and casks, 2 lines", /Kegs and casks/.test(await o.txt('text-count-group-kegs')) && /2 lines, about/.test(await o.txt('text-count-detail-kegs')), `${await o.txt('text-count-group-kegs')} / ${await o.txt('text-count-detail-kegs')}`);
    await o.T('card-count-kegs').scrollIntoViewIfNeeded(); await owner.p.screenshot({ path: `${SHOT}/r2.png` });

    // ── staff phone ──
    const staff = await mk(U2, 'sam@example.test'); const s = H(staff.p);
    await staff.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('staff see a Count button', /Count/.test(await staff.p.locator('nav').innerText()), await staff.p.locator('nav').innerText());
    await staff.p.locator('nav a[href$="/count"]').tap(); await sleep(2500);
    check("staff: today's count is kegs and casks", /Kegs and casks/.test(await s.txt('text-count-group-kegs')), await s.body());
    await staff.p.screenshot({ path: `${SHOT}/r3.png` });
    await staff.ctx.setOffline(true);                       // no signal in the cellar
    await s.tap('card-count-kegs', 2500);
    check('one tap and they are counting: 0 of 2', /0 of 2 counted/.test(await s.txt('text-count-progress')), (await s.body()).slice(0, 200));
    check('no Hide buttons for staff', await staff.p.locator('[data-testid^="button-quick-hide-"]').count() === 0);
    let canChangeSize = false;
    const countKeg = async (pid, full, gal) => {
      if (await s.has(`counting-product-${pid}`)) await s.tap(`counting-product-${pid}`); await sleep(600);
      if (!(await s.has('button-full-plus'))) { await s.tap('button-add-entry', 600); if (!(await s.has('button-location-loc-cellar')) && await s.has('button-change-spot')) await s.tap('button-change-spot'); await s.tap('button-location-loc-cellar', 600); }
      if (await s.has('button-keg-mode-kegs')) await s.tap('button-keg-mode-kegs');
      for (let i = 0; i < full; i++) await s.tap('button-full-plus', 150);
      if (gal != null) await s.tap(`button-part-gallons-${gal}`);
      const during = await s.body();
      if (await s.has('button-change-container-size')) canChangeSize = true;
      await s.tap('button-save-entry', 1500);
      if (await s.has('button-back-to-products')) await s.tap('button-back-to-products');
      return during;
    };
    const seen = [await countKeg(A, 2, 4)]; await sleep(6000); seen.push(await countKeg(B, 1, null));
    check('staff cannot change a keg size while counting', !canChangeSize);
    check('staff have no Review & Close, one Finish & send instead', !(await s.has('button-review-stocktake')) && await s.has('button-staff-finish'));
    await s.tap('button-staff-finish', 800); seen.push(await s.body());
    check('asks before sending, says how many counted', /Send this count in\? 2 of \d+ counted/.test(await s.txt('staff-send-ask')), await s.txt('staff-send-ask'));
    await s.tap('button-staff-keep-counting', 600);
    check('Keep counting goes back to the count, nothing sent', !(await s.has('staff-send-ask')) && await s.has('button-staff-finish'));
    await s.tap('button-staff-finish', 800);
    await staff.p.screenshot({ path: `${SHOT}/r4.png` });
    await s.tap('button-staff-send', 3000); seen.push(await s.body());
    check('finished: thanked, back on the staff count screen', await s.has('staff-count-done') && !/Past Stocktakes/.test(await s.body()), (await s.body()).slice(0, 200));
    check('staff never saw a £ sign or a GP figure', !seen.some(t => /£|GP \d|stock value|cost price/i.test(t)), seen.map(t => (t.match(/.{0,30}(£|GP \d|stock value|cost price).{0,30}/i) || [''])[0]).filter(Boolean).join(' ~ '));
    await staff.ctx.setOffline(false); await staff.p.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(10000);
    const sts = await get('stocktakes'), rds = (await get('readings')).filter(r => r.stocktake_id), ents = await get('stocktake_line_entries');
    check('uploaded once signal is back: one closed stocktake, 2 counts, 2 readings', sts.length === 1 && sts[0].status === 'closed' && ents.length === 2 && rds.length === 2, `st=${sts.length}/${sts[0]?.status} e=${ents.length} r=${rds.length}`);
    check('the readings are stamped with the staff member', rds.every(r => r.user_id === U2), JSON.stringify(rds.map(r => r.user_id)));
    // bottles: the sheet that shows "£ stock value" to the landlord
    await staff.p.goto('http://localhost:5173/count', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    check('today now shows as counted', await s.has('card-count-done-kegs'), (await s.body()).slice(0, 200));
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
    check('Home: today shows done', await o.has('card-count-done-kegs'));
    check('Home: 2 of 50 lines counted this week, 48 to go', /2 of 50 lines counted this week/.test(await o.txt('card-weekly-target')) && /48 to go/.test(await o.txt('card-weekly-target')), await o.txt('card-weekly-target'));
    await owner.p.screenshot({ path: `${SHOT}/r6.png` });
    await o.tap(`button-view-staff-count-${sts[0].id}`, 3000);
    check('landlord opens the count and does see the value', /Total Stock Value/.test(await o.body()) && /£/.test(await o.body()), (await o.body()).slice(0, 200));
    await owner.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await o.tap(`button-dismiss-staff-count-${sts[0].id}`, 600);
    check('"Got it" clears the notice', !(await o.has('staff-counts')));
    // someone has started a count and not sent it in: the landlord can see it without asking anyone
    const OPEN = '99999999-9999-4999-8999-999999999999'; const post = (t, row) => fetch(`http://localhost:8899/rest/v1/${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(row) });
    await post('stocktakes', { id: OPEN, venue_id: V, status: 'open', opened_at: new Date().toISOString(), created_at: new Date().toISOString(), product_ids: [A, B] });
    await post('stocktake_line_entries', { id: '99999999-9999-4999-8999-99999999999a', venue_id: V, stocktake_id: OPEN, spot_check_id: null, product_id: A, count_location_id: 'loc-cellar', method: 'keg_weight', full_containers: 2, part_value: null, ml_remaining: 100000, user_id: U2, entered_at: new Date().toISOString() });
    await owner.p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check('Home: "Sam is counting", 1 line so far, not sent in yet', /Sam is counting/.test(await o.txt(`staff-counting-${OPEN}`)) && /1 line so far/.test(await o.txt(`staff-counting-${OPEN}`)) && /Not sent in yet/.test(await o.txt(`staff-counting-${OPEN}`)), await o.txt('staff-counts'));
    await o.tap(`button-staff-counting-toggle-${OPEN}`, 600);
    check('one tap shows what has been counted so far', /Carlsberg/.test(await o.txt(`staff-counting-lines-${OPEN}`)) && /gal/.test(await o.txt(`staff-counting-lines-${OPEN}`)), await o.txt(`staff-counting-lines-${OPEN}`));
    await owner.p.screenshot({ path: `${SHOT}/r8.png` });
    await fetch(`http://localhost:8899/rest/v1/stocktakes?id=eq.${OPEN}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) });
    // the landlord sets what staff count: bottles only, so nobody is sent to the cellar
    await owner.p.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await owner.p.getByRole('tab', { name: 'Counting' }).tap(); await sleep(600);
    await o.tap('staff-group-bottles', 1500);
    check('Settings says what staff count', /Staff count: Bottles and cans/.test(await o.txt('text-staff-groups')), await o.txt('text-staff-groups'));
    await staff.p.goto('http://localhost:5173/count', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('staff now see only "Yours to count: Bottles and cans"', /Yours to count/i.test(await s.txt('card-count-bottles')) && !(await s.has('card-count-kegs')) && !(await s.has('card-count-done-kegs')) && !(await s.has('count-something-else')) && !(await s.has('card-count-overdue')), (await s.body()).slice(0, 260));
    await staff.p.screenshot({ path: `${SHOT}/r7.png` });
    await o.tap('staff-group-bottles', 1500);
    check('untick it and staff are back on the rota', /Staff follow the rota/.test(await o.txt('text-staff-groups')), await o.txt('text-staff-groups'));
    // switch it off again: the staff Count button goes
    await owner.p.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await owner.p.getByRole('tab', { name: 'Counting' }).tap(); await sleep(600); await o.tap('switch-staff-count', 1500);
    await staff.p.goto('http://localhost:5173/count', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    check('landlord switches staff counting off: Count button and screen are gone', !/Count/.test(await staff.p.locator('nav').innerText()) && !(await s.has('todays-count')), await staff.p.locator('nav').innerText());
    check('no page errors on the landlord phone', owner.p.errs.length === 0, owner.p.errs.slice(0, 2).join(' | '));
  } catch (err) { try { for (const c of b.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `${SHOT}/rX-${b.contexts().indexOf(c)}.png` }); } catch {} results.push('ERROR ' + err.message.split('\n').slice(0, 6).join(' ~ ').slice(0, 600)); }
  console.log(results.join('\n')); await b.close();
})();
