// Library with a real 329-line pub list (REAL=... mock): tools labelled, weighing counts agree, weigh a full one (no fake stock), search, catalogue, scrambled names, edit location/category/method, grouping, banners.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots21'; fs.mkdirSync(SHOT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  const go = async (path, wait = 3000) => { await p.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' }); await sleep(wait); };
  const toast = async () => { await sleep(400); return (await p.locator('ol li').allInnerTexts()).join(' / ').replace(/\n/g, ' '); };
  const main = async () => (await p.locator('main').innerText()).replace(/\n+/g, ' | ');
  const db = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  const S = '[data-testid="input-library-search"]';
  try {
    const all = await db('products');
    const unweighed = all.filter(p => ['spirits', 'wines'].includes(p.category) && (p.full_weight_g == null || p.empty_weight_g == null));
    await go('/library', 3500);
    let t = await main();
    check('Tools have words, not just icons', ['Log delivery', 'Edit all', 'Catalogue', 'Cost prices', 'Import CSV'].every(w => t.includes(w)));
    check('Mostly unassigned: grouped by category', /\| SPIRITS \|/.test(t) && !/UNASSIGNED/.test(t));
    const chip = (await p.locator('[data-testid="filter-chip-needs-weighing"]').innerText()).match(/\((\d+)\)/)?.[1];
    const banner = (await p.locator('[data-testid="banner-match-known-bottles"]').innerText()).match(/(\d+) spirit/)?.[1];
    check('Needs weighing chip and banner agree', chip && chip === banner && +chip === unweighed.length, `chip ${chip} banner ${banner} real ${unweighed.length}`);
    // scrambled names
    const garbled = all.filter(p => /Ã/.test(p.name));
    check('Scrambled names flagged', garbled.length > 0 && await p.locator('[data-testid="banner-fix-names"]').count() === 1, `${garbled.length}`);
    await p.locator('[data-testid="banner-fix-names"]').click(); await sleep(1200);
    const fixed = (await db('products')).filter(p => garbled.some(g => g.id === p.id)).map(p => p.name);
    check('Names repaired', fixed.some(n => n.includes('Jägermeister')) && !fixed.some(n => /Ã/.test(n)), fixed.join(', '));
    // search
    await p.locator(S).fill('hendricks'); await sleep(500);
    check('Search ignores the apostrophe', /Gin Hendrick's/.test(await main()));
    await p.locator(S).fill('zzqq'); await sleep(500);
    t = await main();
    check('No results says so, not "library is empty"', /Nothing in your library matches/.test(t) && !/Your library is empty/.test(t));
    await p.locator(S).fill('smirnoff red'); await sleep(500);
    await p.locator('[data-testid="suggestion-search-catalogue"]').click(); await sleep(1200);
    const dlg = (await p.locator('[role="dialog"]').last().innerText()).replace(/\n+/g, ' | ');
    check('Catalogue opens already searched', /Smirnoff Red Vodka 70cl/.test(dlg), dlg.slice(0, 200));
    await p.keyboard.press('Escape'); await sleep(500);
    await p.locator(S).fill(''); await sleep(500);
    // weigh a full one on a tenths gin with no weights
    const gg = all.find(p => p.name === 'Gin Bombay Sapphire');
    await p.locator(S).fill('gin bombay sapphire'); await sleep(500);
    check('Unweighed bottle has "Weigh a full one"', await p.locator(`[data-testid="button-weigh-setup-${gg.id}"]`).count() === 1);
    await p.locator(`[data-testid="button-weigh-setup-${gg.id}"]`).click(); await sleep(700);
    const sheet = await p.locator('[role="dialog"]').last().innerText();
    check('Opens straight on weighing a full bottle', /Weigh a full, unopened bottle/.test(sheet) && /Save as Full Weight/.test(sheet));
    for (const ch of '1094') { await p.locator('[role="dialog"]').last().getByRole('button', { name: ch, exact: true }).first().click(); await sleep(80); }
    const readsBefore = (await db('readings')).length;
    await p.getByRole('button', { name: 'Save as Full Weight' }).click(); await sleep(1200);
    const g2 = (await db('products')).find(p => p.id === gg.id);
    check('Weights saved', g2.full_weight_g === 1094 && g2.empty_weight_g > 300 && g2.empty_weight_g < 700, `${g2.full_weight_g}/${g2.empty_weight_g}`);
    check('No pretend stock reading logged', (await db('readings')).length === readsBefore);
    t = await main();
    check('Row now says weighed, counted in tenths', /Gin Bombay Sapphire \| Spirits \| 700ml \| £[\d.]+ \| est\. price \| Weighed · counted in tenths/.test(t), t.slice(0, 300));
    await p.locator(S).fill(''); await sleep(400);
    // match known bottles
    await p.locator('[data-testid="banner-match-known-bottles"]').click();
    const mt = await toast();
    check('Match copies weights and names what matched', /given known weights/.test(mt) && /Hardy's Main Rd|Waipara|Berard/.test(mt), mt);
    // edit: location, category, method
    const w = all.find(p => p.name === 'Wine Merlot CYT');
    await p.locator(S).fill('merlot cyt'); await sleep(500);
    await p.locator(`[data-testid="button-edit-${w.id}"]`).click(); await sleep(700);
    await p.locator('[data-testid="select-edit-location"]').click(); await p.getByRole('option', { name: 'Main Bar' }).click(); await sleep(200);
    await p.locator('[data-testid="button-edit-method-weigh"]').click();
    await p.locator('[data-testid="button-save-edit-product"]').click(); await sleep(1000);
    const w2 = (await db('products')).find(p => p.id === w.id);
    check('Edit saves location and counting method', w2.location_id === 'l1' && w2.counting_method === 'weigh', `${w2.location_id} ${w2.counting_method}`);
    await p.locator(S).fill(''); await sleep(400);
    await p.locator('[data-testid="button-group-by-location"]').click(); await sleep(400);
    check('Group by location shows Main Bar', /MAIN BAR/.test(await main()));
    check('No sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${SHOT}/top.png` });
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
