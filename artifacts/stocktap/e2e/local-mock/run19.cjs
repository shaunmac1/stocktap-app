// Checks, every control as a new owner at phone size, then the staff phone, then wide screen: starters, manual add with range checks, edit, two-tap remove, sanity on readings, out-of-range flag, ticks, weekly, refusals, past days marked, top-up of missing starters, How-to inside the column.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots19'; fs.mkdirSync(SHOT, { recursive: true });
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
  const toast = async () => { await sleep(300); return (await p.locator('ol li').allInnerTexts()).join(' / ').replace(/\n/g, ' '); };
  const main = async () => (await p.locator('main').innerText()).replace(/\n+/g, ' | ');
  const db = async t => (await (await fetch(`http://localhost:8899/rest/v1/${t}?select=*`)).json());
  try {
    await go('/checks');
    check('New owner sees both starters', await p.getByRole('button', { name: 'Add the usual temperature points' }).count() === 1 && await p.getByRole('button', { name: 'Add the standard checklists' }).count() === 1);
    // Manual point: range and name checks
    await p.getByRole('button', { name: 'Add one manually' }).first().click(); await sleep(300);
    await p.locator('[data-testid="input-appliance-name"]').fill('Cellar fridge');
    await p.locator('[data-testid="input-appliance-min"]').fill('8'); await p.locator('[data-testid="input-appliance-max"]').fill('2'); await sleep(200);
    check('Lowest above highest is stopped', /Swap them round/.test(await p.locator('[data-testid="text-appliance-error"]').innerText()) && await p.locator('[data-testid="button-save-appliance"]').isDisabled());
    await p.locator('[data-testid="input-appliance-min"]').fill('0'); await p.locator('[data-testid="input-appliance-max"]').fill('5'); await sleep(200);
    await p.locator('[data-testid="button-save-appliance"]').click(); await sleep(900);
    check('Manual point added', (await db('check_appliances')).filter(a => a.active !== false).length === 1);
    // The usual ones can still be added afterwards, without doubling up
    await p.locator('[data-testid="button-add-missing-appliances"]').click(); await sleep(1000);
    const apps = (await db('check_appliances')).filter(a => a.active !== false);
    check('Usual points topped up without a second Cellar fridge', apps.length === 6 && apps.filter(a => a.name === 'Cellar fridge').length === 1, apps.map(a => a.name).join(', '));
    await p.getByRole('button', { name: 'Add the standard checklists' }).click(); await sleep(1000);
    const items0 = (await db('check_items')).length;
    check('Standard checklists added', items0 >= 15, `${items0}`);
    // Duplicate name
    await p.locator('[data-testid="button-add-appliance"]').click(); await sleep(300);
    await p.locator('[data-testid="input-appliance-name"]').fill('freezer'); await sleep(200);
    check('Same name twice is stopped', /already got one called/.test(await p.locator('[data-testid="text-appliance-error"]').innerText()));
    await p.getByRole('button', { name: 'Cancel' }).first().click(); await sleep(300);
    // Readings
    const card = n => p.locator('div.rounded-xl').filter({ hasText: n }).filter({ has: p.locator('input[placeholder="°C"]') }).last();
    await card('Kitchen fridge').locator('input').fill('300'); await card('Kitchen fridge').getByRole('button', { name: 'Log' }).click();
    check('A daft reading (300°C) is refused', /doesn't look right/.test(await toast()) && (await db('temp_readings')).length === 0);
    await card('Kitchen fridge').locator('input').fill('8'); await card('Kitchen fridge').getByRole('button', { name: 'Log' }).click(); await sleep(900);
    let t = await main();
    check('Warm fridge flagged with the safe range', /Kitchen fridge — too warm \| Last 8°C at [\d:]+\. Safe range 0 to 5°C/.test(t));
    await card('Freezer').locator('input').fill('-19'); await card('Freezer').getByRole('button', { name: 'Log' }).click(); await sleep(900);
    check('Good reading shows In range and You', /Last: -19°C — In range at [\d:]+ · You/.test(await main()));
    // Edit a range
    const kf = apps.find(a => a.name === 'Kitchen fridge');
    await p.locator(`[data-testid="edit-appliance-${kf.id}"]`).click(); await sleep(300);
    check('Edit opens with the point filled in', (await p.locator('[data-testid="input-appliance-name"]').inputValue()) === 'Kitchen fridge' && (await p.locator('[data-testid="input-appliance-max"]').inputValue()) === '5');
    await p.locator('[data-testid="input-appliance-max"]').fill('8'); await p.locator('[data-testid="button-save-appliance"]').click(); await sleep(900);
    check('Range change saved', (await db('check_appliances')).find(a => a.id === kf.id).max_c === 8);
    // Two-tap remove
    const bf = apps.find(a => a.name === 'Bottle fridge');
    await p.locator(`[data-testid="remove-appliance-${bf.id}"]`).click(); await sleep(300);
    check('One tap on the bin only asks', (await p.locator(`[data-testid="remove-appliance-${bf.id}"]`).innerText()).includes('Tap again') && (await db('check_appliances')).find(a => a.id === bf.id).active !== false);
    await p.locator(`[data-testid="remove-appliance-${bf.id}"]`).click(); await sleep(900);
    check('Second tap removes it, history kept', (await db('check_appliances')).find(a => a.id === bf.id).active === false && /removed/.test(await toast()));
    // Ticks
    const items = await db('check_items'); const pests = items.find(i => /pests/.test(i.label));
    await p.locator(`[data-testid="check-item-${pests.id}"]`).click(); await sleep(800);
    check('Tick saves', (await db('check_completions')).some(c => c.item_id === pests.id) && (await p.locator(`[data-testid="check-item-${pests.id}"]`).getAttribute('aria-pressed')) === 'true');
    await p.locator(`[data-testid="check-item-${pests.id}"]`).click(); await sleep(800);
    check('Tap again unticks', !(await db('check_completions')).some(c => c.item_id === pests.id));
    const lines = items.find(i => /Beer lines/.test(i.label));
    check('Weekly check shows never done', lines && /Beer lines cleaned \| Weekly · never done/.test(await main()));
    await p.locator(`[data-testid="remove-item-${pests.id}"]`).click(); await sleep(300);
    check('Checklist bin asks first too', (await db('check_items')).find(i => i.id === pests.id).active !== false);
    await p.locator(`[data-testid="remove-item-${pests.id}"]`).click(); await sleep(800);
    check('Top-up offers the standard check back', /Add the 1 standard check you haven't got/.test(await main()));
    await p.locator('[data-testid="button-add-missing-checks"]').click(); await sleep(900);
    check('Check restored once', (await db('check_items')).filter(i => /pests/.test(i.label) && i.active !== false).length === 1);
    // Refusal
    await p.getByRole('button', { name: 'Log a refusal' }).click(); await sleep(300);
    await p.getByRole('button', { name: 'ID looked fake' }).click();
    await p.locator('input[placeholder^="Two lads"]').fill('Blue car, left fine');
    await p.getByRole('button', { name: 'Log it' }).click(); await sleep(900);
    t = await main();
    check('Refusal logged with reason and note', /Refusals register · 1/i.test(t) && /ID looked fake/.test(t) && /Blue car, left fine/.test(t));
    // Past day
    await p.locator('[aria-label="Previous day"]').click(); await sleep(900);
    check('Past day says entries are marked as later', await p.locator('[data-testid="checks-past-day"]').count() === 1);
    await card('Cellar fridge').locator('input').fill('3'); await card('Cellar fridge').getByRole('button', { name: 'Log' }).click(); await sleep(900);
    check('Reading on a past day shows filled in later', /filled in later on/.test(await main()));
    await p.locator('[data-testid="button-checks-today"]').click(); await sleep(600);
    check('Today button returns', await p.locator('[data-testid="checks-past-day"]').count() === 0);
    await p.locator('[data-testid="input-checks-date"]').fill(new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10)); await sleep(700);
    check('Date picker jumps to any day', await p.locator('[data-testid="checks-past-day"]').count() === 1);
    await p.locator('[data-testid="button-checks-today"]').click(); await sleep(600);
    // History CSV marks the late one
    await p.locator('[data-testid="checks-tab-history"]').click(); await sleep(1500);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('[data-testid="button-download-checks"]').click()]);
    const csv = require('fs').readFileSync(await dl.path(), 'utf8');
    check('Download marks the late reading', /Cellar fridge,3°C,In range,You,Filled in later on \d\d\/\d\d\/\d{4}/.test(csv), csv.split('\n').filter(l => /Cellar fridge/.test(l)).join(' || '));
    check('No sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // Wide screen: How to sits in the app column
    await p.setViewportSize({ width: 1280, height: 844 }); await go('/checks', 2000);
    const hb = await p.locator('[data-testid="button-help-videos"]').boundingBox(), mb = await p.locator('main').boundingBox();
    check('Wide screen: How to inside the app column', hb && mb && hb.x >= mb.x && hb.x + hb.width <= mb.x + mb.width, `${hb && hb.x} vs main ${mb && mb.x}`);
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
