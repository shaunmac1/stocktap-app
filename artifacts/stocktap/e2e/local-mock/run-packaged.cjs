// As-user test: bottles and cans sold whole, counted as full cases + loose (iPhone size).
const { chromium, devices } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const J2O = 'bbbbbbbb-0000-4000-8000-000000000001', PER = 'bbbbbbbb-0000-4000-8000-000000000002',
  CRISP = 'bbbbbbbb-0000-4000-8000-000000000003', HOOCH = 'bbbbbbbb-0000-4000-8000-000000000004', MOUT = 'bbbbbbbb-0000-4000-8000-000000000005';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${ok ? '' : d}`);
  const T = tid => p.locator(`[data-testid="${tid}"]:visible`).first();
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  const tap = async (tid, w = 500) => { await T(tid).waitFor({ state: 'visible', timeout: 10000 }); await T(tid).scrollIntoViewIfNeeded(); await T(tid).tap(); await sleep(w); };
  const txt = async tid => (await T(tid).innerText().catch(() => '')).replace(/\n/g, ' | ');
  const pad = async digits => { for (const d of String(digits)) { await p.locator(`button:visible:text-is("${d}")`).last().tap(); await sleep(120); } };
  const entries = async () => (await (await fetch('http://localhost:8899/rest/v1/stocktake_line_entries?select=*')).json());
  const product = async id => (await (await fetch(`http://localhost:8899/rest/v1/products?id=eq.${id}`)).json())[0];
  const openLine = async id => { for (const b of ['button-back-to-products', 'button-back-to-list']) if (await has(b)) { await tap(b, 700); break; } await tap(`counting-product-${id}`, 800); };
  const addAt = async loc => {
    // An uncounted line opens straight on the pad in the last spot used.
    if (!(await has('button-change-spot')) && !(await has(`button-location-${loc}`))) await tap('button-add-entry', 600);
    const spot = (await p.locator('[data-testid="button-change-spot"]:visible').locator('xpath=../..').innerText().catch(() => '')).toUpperCase();
    if (!(await has(`button-location-${loc}`)) && (await has('button-change-spot')) && !spot.includes(loc === 'loc-bar' ? 'BAR' : 'CELLAR')) await tap('button-change-spot');
    if (await has(`button-location-${loc}`)) await tap(`button-location-${loc}`, 600);
  };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('button-new-stocktake', 800);
    for (const id of [J2O, PER, CRISP, HOOCH, MOUT]) if (await has(`select-product-${id}`)) await tap(`select-product-${id}`, 200);
    await tap('button-start-stocktake', 1500);
    await p.screenshot({ path: `${SHOT}/p0-list.png` });

    // 1. J2O in the cellar: first time, it asks how they come, suggests 24.
    await openLine(J2O); await addAt('loc-cellar');
    check('first count asks how J2O comes in', await has('case-size-question'));
    check('suggests cases of 24 for a 275ml bottle', await has('button-case-suggested-24'));
    await p.screenshot({ path: `${SHOT}/p1-question.png` });
    await tap('button-case-suggested-24', 900);
    check('then shows FULL CASES (24) with + and −', /FULL CASES \(24\)/i.test(await txt('label-full-cases')), await txt('label-full-cases'));
    for (let i = 0; i < 3; i++) await tap('button-cases-plus', 200);
    await pad(7);
    check('3 cases + 7 = 79 units', (await txt('text-units-result')).startsWith('79'), await txt('text-units-result'));
    check('breakdown: 79 bottles · 6 doz 7 · 3 cases + 7', (await txt('text-units-breakdown')) === '79 bottles · 6 doz 7 · 3 cases + 7', await txt('text-units-breakdown'));
    await p.screenshot({ path: `${SHOT}/p2-cases.png` });
    await tap('button-save-entry', 1800);
    let e = (await entries()).find(x => x.product_id === J2O && x.count_location_id === 'loc-cellar');
    check('saved as 79 single units (3 cases kept for reference)', e && Number(e.part_value) === 79 && e.full_containers === 3 && Math.round(e.ml_remaining) === 79 * 275, JSON.stringify(e && [e.full_containers, e.part_value, e.ml_remaining]));
    check('case size 24 saved on the product', (await product(J2O)).pack_size === 24, String((await product(J2O)).pack_size));

    // 2. J2O on the bar: no question this time, loose only.
    await addAt('loc-bar');
    check('second spot does not ask again', !(await has('case-size-question')) && (await has('input-full-cases')));
    await pad(11);
    check('11 loose on the bar', (await txt('text-units-breakdown')) === '11 bottles · 0 doz 11 · 0 cases + 11', await txt('text-units-breakdown'));
    await tap('button-save-entry', 1800);
    const total = await txt('text-product-total');
    check('total across spots: 90 bottles · 7 doz 6 · 3 cases + 18 · £55.80', /^90/.test(total) && /90 bottles · 7 doz 6 · 3 cases \+ 18/.test(await p.locator('[data-testid="text-product-total"]:visible').locator('xpath=..').innerText()) && /£55\.80/.test(await p.locator('[data-testid="text-product-total"]:visible').locator('xpath=..').innerText()), (await p.locator('[data-testid="text-product-total"]:visible').locator('xpath=..').innerText()).replace(/\n/g, ' | '));
    await p.screenshot({ path: `${SHOT}/p3-total.png` });

    // 3. Peroni comes in 12s at this pub: pick a different size.
    await openLine(PER); await addAt('loc-cellar');
    await tap('button-case-12', 900);
    for (let i = 0; i < 2; i++) await tap('button-cases-plus', 200);
    await pad(5);
    check('Peroni 2 cases of 12 + 5 = 29', (await txt('text-units-breakdown')) === '29 bottles · 2 doz 5 · 2 cases + 5', await txt('text-units-breakdown'));
    await tap('button-save-entry', 1800);
    e = (await entries()).find(x => x.product_id === PER);
    check('Peroni saved as 29 units', e && Number(e.part_value) === 29, JSON.stringify(e && e.part_value));
    // change mind: it's actually 24s. The saved count stays 29 bottles (that's what was there).
    await addAt('loc-bar');
    await tap('button-change-case-size', 500);
    check('can change the case size from the count screen', await has('case-size-question'));
    await tap('button-case-suggested-24', 900);
    check('now FULL CASES (24)', /FULL CASES \(24\)/i.test(await txt('label-full-cases')));
    await pad(4);
    await tap('button-save-entry', 1800);

    // 4. Crisps: no guess, counted one by one.
    await openLine(CRISP); await addAt('loc-bar');
    check('crisps: no suggested size', !(await has('button-case-suggested-24')) && !(await has('button-case-suggested-12')));
    await tap('button-case-singles', 900);
    check('singles only: no cases stepper', !(await has('input-full-cases')));
    await pad(31);
    check('31 bags', (await txt('text-units-breakdown')) === '31 bags', await txt('text-units-breakdown'));
    await tap('button-save-entry', 1800);
    check('crisps saved as 31 and set to singles only', Number((await entries()).find(x => x.product_id === CRISP)?.part_value) === 31 && (await product(CRISP)).pack_size === 1);

    // 5. Old Mout already set to 12: straight to cases, no question.
    await openLine(MOUT); await addAt('loc-cellar');
    check('already-set line goes straight to FULL CASES (12)', /FULL CASES \(12\)/i.test(await txt('label-full-cases')) && !(await has('case-size-question')));
    await tap('button-cases-plus', 200); await pad(0);
    check('1 case + 0 = 12', (await txt('text-units-breakdown')) === '12 bottles · 1 doz 0 · 1 case + 0', await txt('text-units-breakdown'));
    await tap('button-save-entry', 1800);

    // 6. No signal in the cellar: Hooch case size + count still work, and sync later.
    await openLine(HOOCH);
    await ctx.setOffline(true);
    await addAt('loc-cellar');
    await tap('button-case-suggested-24', 900);
    check('offline: case size still takes', /FULL CASES \(24\)/i.test(await txt('label-full-cases')), await txt('label-full-cases'));
    await tap('button-cases-plus', 200); await pad(2);
    check('offline: 1 case + 2 = 26 cans', (await txt('text-units-breakdown')) === '26 cans · 2 doz 2 · 1 case + 2', await txt('text-units-breakdown'));
    await tap('button-save-entry', 1800);
    await p.screenshot({ path: `${SHOT}/p4-offline.png` });
    check('offline: not on the server yet', (await product(HOOCH)).pack_size == null);
    await ctx.setOffline(false);
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(4000);
    check('back online: case size 24 reached the server', (await product(HOOCH)).pack_size === 24, String((await product(HOOCH)).pack_size));
    let hoochE; for (let i = 0; i < 10 && !hoochE; i++) { hoochE = (await entries()).find(x => x.product_id === HOOCH); if (!hoochE) await sleep(1000); }
    check('back online: the 26 cans count reached the server', hoochE && Number(hoochE.part_value) === 26, JSON.stringify(hoochE && hoochE.part_value));

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) { results.push('ERROR ' + err.message.split('\n')[0]); await p.screenshot({ path: `${SHOT}/pX.png` }); }
  console.log(results.join('\n')); await b.close();
})();
