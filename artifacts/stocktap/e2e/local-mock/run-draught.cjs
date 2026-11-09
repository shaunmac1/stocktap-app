const { chromium } = require('playwright');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const P = id => `aaaaaaaa-0000-4000-8000-00000000000${id}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png` });
  const tap = async (tid, t = 10000) => { const l = p.locator(`[data-testid="${tid}"]`).first(); await l.waitFor({ state: 'visible', timeout: t }); await l.scrollIntoViewIfNeeded(); await l.click({ force: true }); await sleep(400); };
  const text = async tid => (await p.locator(`[data-testid="${tid}"]`).first().innerText()).trim();
  const openEntry = async id => { await tap(`counting-product-${P(id)}`); await sleep(500); await tap('button-add-entry'); if (await p.locator('[data-testid="button-location-unspecified"]').count()) await tap('button-location-unspecified'); await sleep(600); };
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await tap('button-new-stocktake'); await sleep(800);
    for (const i of [1, 2]) await tap(`select-product-${P(i)}`);
    await tap('button-start-stocktake'); await sleep(1500);
    // Carlsberg: 9 full kegs + 10 gal
    await openEntry(1);
    if (await p.locator('[data-testid="button-keg-mode-kegs"]').count()) await tap('button-keg-mode-kegs');
    check('gauge entry shown for keg', await p.locator('[data-testid="draught-gauge-entry"]').isVisible());
    for (let i = 0; i < 9; i++) await p.locator('[data-testid="button-full-plus"]').click();
    await p.fill('[data-testid="input-part-gallons"]', '10'); await sleep(400);
    await p.locator('[data-testid="draught-gauge-entry"]').scrollIntoViewIfNeeded(); await shot('d1-carlsberg-entry');
    const r1 = await text('text-keg-result'); check('Carlsberg 9 full + 10 gal = 109 gal 0 pt', r1.includes('109 gal 0 pt'), r1);
    await p.locator('[data-testid="text-keg-result"]').scrollIntoViewIfNeeded(); await shot('d2-carlsberg-result');
    // over-capacity warning
    await p.fill('[data-testid="input-part-gallons"]', '13'); await sleep(300);
    check('warns when part is more than a full keg', await p.locator('[data-testid="warn-part-over"]').isVisible());
    await p.fill('[data-testid="input-part-gallons"]', '10'); await sleep(300);
    await tap('button-save-entry'); await sleep(1200); await shot('d3-carlsberg-saved');
    const body1 = await p.locator('body').innerText(); check('saved line says 9 full + 10 gal 0 pt', body1.includes('9 full + 10 gal 0 pt'));
    await tap('button-back-to-products'); await sleep(600);
    // Hobgoblin Gold cask: 2 full + 4 gal 5 pt
    await openEntry(2);
    if (await p.locator('[data-testid="button-dip-mode-pints"]').count()) await tap('button-dip-mode-pints');
    check('gauge entry shown for cask', await p.locator('[data-testid="draught-gauge-entry"]').isVisible());
    check('cask wording', /full casks/i.test(await text('draught-gauge-entry')));
    await p.locator('[data-testid="button-full-plus"]').click(); await p.locator('[data-testid="button-full-plus"]').click();
    await p.fill('[data-testid="input-part-gallons"]', '4'); await tap('button-part-pints-5'); await sleep(300);
    await p.locator('[data-testid="draught-gauge-entry"]').scrollIntoViewIfNeeded(); await shot('d4-hobgoblin-entry');
    const r2 = await text('text-keg-result'); check('Hobgoblin 2 x 9G + 4 gal 5 pt = 22 gal 5 pt', r2.includes('22 gal 5 pt'), r2);
    await tap('button-save-entry'); await sleep(1200); await shot('d5-hobgoblin-saved');
    const lg = await (await fetch('http://localhost:8899/__log')).json();
    check('no page errors', errors.filter(e => !/favicon|manifest|404|Failed to load resource/i.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); await shot('dX-error'); }
  console.log(results.join('\n')); await b.close();
})();
