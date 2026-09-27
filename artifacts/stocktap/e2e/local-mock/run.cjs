const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const P = id => `aaaaaaaa-0000-4000-8000-00000000000${id}`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage();
  const errors = [], bad = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  p.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png`, fullPage: false });
  const tap = async (tid, t = 10000) => { const l = p.locator(`[data-testid="${tid}"]`).first(); await l.waitFor({ state: 'visible', timeout: t }); await l.scrollIntoViewIfNeeded(); await l.click({ force: true }); await sleep(500); };
  const pad = async (str, scope) => { const s = scope ? p.locator(scope) : p.locator('[data-testid="add-entry-sheet"]'); for (const ch of str) { await s.getByRole('button', { name: ch, exact: true }).first().click(); await sleep(120); } };
  const text = async tid => (await p.locator(`[data-testid="${tid}"]`).first().innerText()).trim();
  const openEntry = async id => { await tap(`counting-product-${P(id)}`); await sleep(500); await tap('button-add-entry'); await tap('button-location-unspecified'); await sleep(600); };
  const results = [];
  const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' });
    await sleep(3500); await shot('01-stocktake');
    await tap('button-new-stocktake'); await sleep(800);
    for (const i of [1, 2, 3, 4]) await tap(`select-product-${P(i)}`);
    await tap('button-start-stocktake'); await sleep(1500); await shot('02-counting');

    // 1. Gordon's: weigh, no weights -> must ask for a full bottle
    await openEntry(1); await shot('03-gordons-needs-full-bottle');
    check('prompt shown for weigh line with no weights', await p.locator('[data-testid="full-bottle-setup"]').isVisible());
    check('save entry disabled until weighed', await p.locator('[data-testid="button-save-entry"]').isDisabled());
    await pad('1094', '[data-testid="full-bottle-setup"]');
    await tap('button-save-full-weight'); await sleep(2500); await shot('04-gordons-after-full-weight');
    const logA = await (await fetch('http://localhost:8899/__log')).json();
    const g = logA.products.find(x => x.id === P(1));
    check('full weight saved on product', g.full_weight_g === 1094, `full=${g.full_weight_g} empty=${g.empty_weight_g}`);
    check('empty weight derived from density', Math.abs(g.empty_weight_g - (1094 - 700 * 0.9517)) < 1, `expected ~${(1094 - 700 * 0.9517).toFixed(1)}`);
    check('weighing sent to shared database', logA.log.some(l => l.rpc === 'contribute_catalogue_calibration' && l.args.p_full_weight_g === 1094));
    check('weigh pad now shown, prompt gone', !(await p.locator('[data-testid="full-bottle-setup"]').isVisible()) && await p.getByText('Weight (grams)').first().isVisible());
    await pad('800'); await sleep(400); await shot('05-gordons-weighed-800');
    await tap('button-save-entry'); await sleep(1200);
    await tap('button-back-to-products'); await sleep(600);

    // 2. Tanqueray: tenths with its own bottle outline
    await openEntry(2); await shot('06-tanq-tenths');
    check('tenths input with bottle shown', await p.locator('[data-testid="tenths-input"]').isVisible() && await p.locator('[data-testid="bottle-gauge"]').first().isVisible());
    check('how-to help text shown', (await text('tenths-help')).includes('full is 10, half is 5'));
    await tap('tenths-quick-5'); check('half button sets 5.0', (await text('tenths-value')) === '5.0');
    await tap('tenths-plus'); check('plus adds half a tenth', (await text('tenths-value')) === '5.5');
    const box = await p.locator('[data-testid="bottle-gauge"]').first().boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85); await sleep(400);
    const low = parseFloat(await text('tenths-value'));
    check('tapping low on the bottle sets a low level', low <= 2, `got ${low}`);
    await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.40); await sleep(400);
    const hi = parseFloat(await text('tenths-value'));
    check('tapping high on the bottle sets a high level', hi >= 7, `got ${hi}`);
    await shot('07-tanq-tapped-high');
    await tap('tenths-quick-7.5'); await shot('08-tanq-three-quarters');
    await tap('button-save-entry'); await sleep(1200);
    await tap('button-back-to-products'); await sleep(600);

    // 3. House vodka: tenths, no outline -> generic bottle, slider by keyboard
    await openEntry(3);
    const sl = p.locator('[data-testid="tenths-slider"]').first(); await sl.focus();
    for (let i = 0; i < 6; i++) { await p.keyboard.press('ArrowRight'); await sleep(80); }
    check('slider moves in half tenths', (await text('tenths-value')) === '3.0', await text('tenths-value'));
    await tap('button-type-tenths'); await shot('09-vodka-generic-with-pad');
    check('number pad available for typing', await p.getByText('Tenths remaining (0–10)').first().isVisible());
    await tap('button-save-entry'); await sleep(1200);
    await tap('button-back-to-products'); await sleep(600);

    // 4. Bombay: weigh, no weights, no full bottle to hand -> count in tenths instead
    await openEntry(4);
    await tap('button-use-tenths'); await sleep(500); await shot('10-bombay-tenths-instead');
    check('tenths-instead switches to tenths input', await p.locator('[data-testid="tenths-input"]').isVisible() && await p.locator('[data-testid="tenths-instead-note"]').isVisible());
    await tap('tenths-quick-2.5');
    check('save enabled when counting in tenths instead', !(await p.locator('[data-testid="button-save-entry"]').isDisabled()));
    await tap('button-save-entry'); await sleep(1200);
    await tap('button-back-to-products'); await sleep(800); await shot('11-all-counted');


    // 5. House vodka again: counted in tenths, no weights -> offer to weigh a full bottle and switch to weight
    await openEntry(3);
    check('upgrade link offered on a tenths spirit with no weights', await p.locator('[data-testid="button-upgrade-to-weigh"]').isVisible());
    await tap('button-upgrade-to-weigh'); await shot('12-vodka-upgrade');
    await pad('1110', '[data-testid="full-bottle-setup"]'); await tap('button-save-full-weight'); await sleep(2500);
    const logC = await (await fetch('http://localhost:8899/__log')).json();
    const hv = logC.products.find(x => x.id === P(3));
    check('vodka switched to weighing with derived empty weight', hv.counting_method === 'weigh' && Math.abs(hv.empty_weight_g - (1110 - 700 * 0.9517)) < 1, `method=${hv.counting_method} empty=${hv.empty_weight_g}`);
    check('weigh pad shown after upgrade', await p.getByText('Weight (grams)').first().isVisible());
    await shot('13-vodka-now-weighing');
    const logB = await (await fetch('http://localhost:8899/__log')).json();
    const ents = logB.log.filter(l => l.insert === 'stocktake_line_entries').flatMap(l => l.items);
    const byP = id => ents.filter(e => e.product_id === P(id));
    check('4 lines saved', new Set(ents.map(e => e.product_id)).size === 4, `entries=${ents.length}`);
    const e1 = byP(1).at(-1), e2 = byP(2).at(-1), e3 = byP(3).at(-1), e4 = byP(4).at(-1);
    check("Gordon's saved by weight", e1?.method === 'weigh' && Math.abs(e1.ml_remaining - (800 - (1094 - 700 * 0.9517)) / 0.9517) < 2, JSON.stringify(e1 && { m: e1.method, ml: e1.ml_remaining }));
    check('Tanqueray 7.5 tenths = 525ml', e2?.method === 'tenths' && Math.abs(e2.ml_remaining - 525) < 0.5, JSON.stringify(e2 && { m: e2.method, ml: e2.ml_remaining }));
    check('Vodka 3 tenths = 210ml', e3?.method === 'tenths' && Math.abs(e3.ml_remaining - 210) < 0.5, JSON.stringify(e3 && { m: e3.method, ml: e3.ml_remaining }));
    check('Bombay 2.5 tenths = 175ml', e4?.method === 'tenths' && Math.abs(e4.ml_remaining - 175) < 0.5, JSON.stringify(e4 && { m: e4.method, ml: e4.ml_remaining }));
  } catch (e) { await shot('ERROR'); results.push('FATAL ' + e.message.split('\n')[0]); }
  console.log(results.join('\n'));
  console.log('CONSOLE_ERRORS', errors.length, JSON.stringify(errors.slice(0, 8)));
  console.log('BAD', bad.length, JSON.stringify([...new Set(bad)].slice(0, 12)));
  await b.close();
})();
