// Daily Board, every control as the owner at phone size: validation, drafts per day, date picker, comparisons, worth-it, wet/dry, trend taps, weeks, months, import.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots18'; fs.mkdirSync(SHOT, { recursive: true });
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
  const money = s => Number((String(s).match(/£([\d,]+\.\d\d)/) || [])[1]?.replace(/,/g, '') ?? NaN);
  const toast = async () => { await sleep(300); return (await p.locator('ol li').allInnerTexts()).join(' / ').replace(/\n/g, ' '); };
  const T = '[data-testid="input-daily-total"]';
  const iso = d => d.toISOString().slice(0, 10);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const dayISO = n => iso(new Date(today.getTime() + n * 864e5));
  try {
    const rows0 = await (await fetch('http://localhost:8899/rest/v1/cash_ups?select=*')).json();
    const byDate = new Map(rows0.map(c => [c.business_date, c]));
    await go('/daily-board');
    const main = async () => (await p.locator('main').innerText()).replace(/\n+/g, ' | ');
    let t = await main();
    const wd = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
    check('Labels name the weekday', t.includes(`Last ${wd}`) && t.includes(`Average of the last 4 ${wd}s`) && t.includes(`Same ${wd} 1 year ago`), t.slice(0, 300));
    check('Next day is off on today', await p.locator('button[aria-label="Next day"]').isDisabled());
    const H = '[data-testid="button-help-videos"]';
    check('How to shows full at the top', (await p.locator(H).innerText()).includes('How to'));
    await p.locator(T).focus(); await sleep(250);
    check('How to steps aside while typing', await p.locator(H).count() === 0);
    await p.locator(T).blur(); await sleep(250);
    await p.mouse.wheel(0, 600); await sleep(500);
    check('How to shrinks to an icon once scrolled', (await p.locator(H).count()) === 1 && !(await p.locator(H).innerText()).includes('How to'));
    await p.evaluate(() => scrollTo(0, 0)); await sleep(300);
    check('How to comes back in full at the top', (await p.locator(H).innerText()).includes('How to'));

    await p.locator('[data-testid="button-save-day"]').click();
    check('Save with nothing typed asks for the total', /Pop in what you took/.test(await toast()));
    await p.locator(T).fill('-50'); await sleep(200);
    check('Negative total flagged on screen', await p.locator('[data-testid="text-total-invalid"]').count() === 1);
    await p.locator('[data-testid="button-save-day"]').click();
    check('Negative total not saved', /Check the numbers/.test(await toast()) && !(await (await fetch('http://localhost:8899/rest/v1/cash_ups?select=*')).json()).some(c => c.total_taken < 0));

    await p.locator(T).fill('1500'); await sleep(200);
    t = await main();
    const last = byDate.get(dayISO(-7))?.total_taken;
    check('Deltas carry a + or − sign', /[+−]£[\d,]+\.\d\d/.test(t), `last week £${last}`);

    // Drafts survive switching days
    await p.locator('button[aria-label="Previous day"]').click(); await sleep(500);
    check('Unsaved day is flagged when you move away', /typed figures for Today but not saved it/.test(await main()));
    const yVal = byDate.get(dayISO(-1))?.total_taken;
    check('Yesterday shows its saved figure', Number(await p.locator(T).inputValue()) === yVal, `${await p.locator(T).inputValue()} vs ${yVal}`);
    check('Saved day shows Saved, button off', (await p.locator('[data-testid="button-save-day"]').innerText()) === 'Saved' && await p.locator('[data-testid="button-save-day"]').isDisabled());
    check('Saved figure shows with pence', /^\d+\.\d\d$/.test(await p.locator(T).inputValue()));
    await p.locator(T).fill(String(yVal)); await sleep(200);
    check('Retyping the same figure is not a change', (await p.locator('[data-testid="button-save-day"]').innerText()) === 'Saved');
    await p.locator('[data-testid="button-board-today"]').click(); await sleep(500);
    check('Back to today keeps what you typed', (await p.locator(T).inputValue()) === '1500');

    // Extras: worth-it and wet/dry
    await p.locator('[data-testid="button-board-extras"]').click(); await sleep(200);
    await p.locator('[data-testid="input-board-what-on"]').fill('Live act');
    await p.locator('[data-testid="input-board-act"]').fill('The Demo Band');
    await p.locator('[data-testid="input-board-fee"]').fill('200');
    await p.locator('[data-testid="input-board-wet"]').fill('1200');
    await p.locator('[data-testid="input-board-dry"]').fill('250'); await sleep(300);
    const w = await p.locator('[data-testid="board-worth-it"]').innerText();
    const four = [-7, -14, -21, -28].map(n => byDate.get(dayISO(n))?.total_taken).filter(v => v != null);
    const base = four.reduce((a, b) => a + b, 0) / four.length; const net = 1500 - base - 200;
    check('Worth it: states the take, a normal night and the verdict to the penny', w.includes('£1,500.00') && Math.abs(money(w.split('normal')[1]) - base) < 0.006 && (net >= 0 ? w.includes('paid for itself') : w.includes('it cost you')), w.replace(/\n/g, ' '));
    check('Wet + dry short of total is pointed out', /Wet and dry add up to £1,450.00, which is £50.00 less/.test(await p.locator('[data-testid="text-split-gap"]').innerText()));
    await p.locator('[data-testid="input-board-dry"]').fill('300'); await sleep(200);
    check('Gap note goes when they add up', await p.locator('[data-testid="text-split-gap"]').count() === 0);
    await p.screenshot({ path: `${SHOT}/extras.png` });
    await p.locator('[data-testid="button-save-day"]').click(); await sleep(900);
    const saved = (await (await fetch('http://localhost:8899/rest/v1/cash_ups?select=*')).json()).find(c => c.business_date === dayISO(0));
    check('Save writes every field', saved && saved.total_taken === 1500 && saved.wet_sales === 1200 && saved.dry_sales === 300 && saved.fee === 200 && saved.act_or_match === 'The Demo Band' && saved.what_was_on === 'Live act', JSON.stringify(saved && { t: saved.total_taken, w: saved.wet_sales, d: saved.dry_sales, f: saved.fee }));
    check('Unsaved warning cleared after saving', await p.locator('[data-testid="board-unsaved-days"]').count() === 0);

    // Extras follow the day
    await p.locator('button[aria-label="Previous day"]').click(); await sleep(400);
    const yHas = !!(byDate.get(dayISO(-1))?.fee || byDate.get(dayISO(-1))?.act_or_match || byDate.get(dayISO(-1))?.wet_sales);
    check('Extras panel follows the day', (await p.locator('[data-testid="input-board-act"]').count() > 0) === yHas);

    // Trend bars open a day
    await p.locator(`[data-testid="trend-bar-${dayISO(-5)}"]`).click(); await sleep(400);
    const lbl5 = new Date(today.getTime() - 5 * 864e5).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    check('Tapping a bar opens that day', (await p.locator('[data-testid="board-date-label"]').innerText()).includes(lbl5), lbl5);

    // Date picker jumps a year back
    const yr = dayISO(-365);
    await p.locator('[data-testid="input-board-date"]').fill(yr); await sleep(500);
    const want = byDate.get(yr)?.total_taken;
    check('Date picker opens any past day', Number(await p.locator(T).inputValue()) === want, `${yr} ${want}`);
    await p.locator('[data-testid="input-board-date"]').fill(dayISO(3)); await sleep(300);
    check('Future dates refused', Number(await p.locator(T).inputValue()) === want);
    check('No sideways scroll on Day', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${SHOT}/day.png` });

    // Weeks: tap a week to see its days, tap a day to open it
    await p.locator('[data-testid="board-view-weeks"]').click(); await sleep(600);
    const wk = (await p.locator('[data-testid^="week-toggle-"]').nth(1).getAttribute('data-testid')).replace('week-toggle-', '');
    await p.locator(`[data-testid="week-toggle-${wk}"]`).click(); await sleep(300);
    const dayRows = await p.locator(`[data-testid="week-days-${wk}"] [data-testid^="week-day-"]`).count();
    let sum = 0; const all2 = await (await fetch('http://localhost:8899/rest/v1/cash_ups?select=*')).json(); const m2 = new Map(all2.map(c => [c.business_date, c.total_taken]));
    for (let i = 0; i < 7; i++) sum += m2.get(iso(new Date(new Date(wk + 'T00:00:00Z').getTime() + i * 864e5))) ?? 0;
    const wkTotal = money(await p.locator(`[data-testid="week-row-${wk}"] .font-bold`).first().innerText());
    check('Week opens to 7 days that add up to the week', dayRows === 7 && Math.abs(sum - wkTotal) < 0.01, `${dayRows} days, £${sum.toFixed(2)} vs £${wkTotal}`);
    await p.screenshot({ path: `${SHOT}/week-open.png` });
    const d3 = iso(new Date(new Date(wk + 'T00:00:00Z').getTime() + 3 * 864e5));
    await p.locator(`[data-testid="week-day-${d3}"]`).click(); await sleep(500);
    check('Tapping a day in a week opens it on Day', await p.locator('[data-testid="board-view-day"][aria-selected="true"]').count() === 1 && Number(await p.locator(T).inputValue()) === m2.get(d3), `${d3}`);
    await p.locator('[data-testid="board-view-weeks"]').click(); await sleep(400); check('No sideways scroll on Weeks (with a week open)', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await p.locator('[data-testid="board-view-day"]').click(); await sleep(300);

    // Import: comma CSV with thousands, single-day wording
    await p.locator('[data-testid="button-open-takings-import"]').click(); await sleep(600);
    await p.locator('[data-testid="input-takings-paste"]').fill('Date,Takings\n01/01/2019,"£1,234.56"'); await sleep(300);
    const pv = await p.locator('[data-testid="takings-import-preview"]').innerText();
    check('Import: quoted thousands read, "1 day" wording', /^1 day · £1,234\.56/.test(pv) && /1 Jan 2019\n/.test(pv + '\n') && !/ to /.test(pv), pv.replace(/\n/g, ' | '));
    check('Import button says 1 day', (await p.locator('[data-testid="button-takings-import"]').innerText()) === 'Bring in 1 day');
    // Till report with days across the top and several rows: picks Total collected, can be changed
    await p.locator('[data-testid="input-takings-paste"]').fill('Sales Summary,02 Jan 2019,03 Jan 2019,04 Jan 2019\nGross Sales,£800.00,£700.00,£900.00\nTax,£160.00,£140.00,£180.00\nTotal Collected,£960.00,£840.00,"£1,080.00"'); await sleep(400);
    const picker = await p.locator('[data-testid="takings-column-picker"]').innerText();
    check('Till report: offers each row, Total Collected picked', /Which row is what you took/.test(picker) && (await p.locator('[data-testid="takings-col-2"]').getAttribute('aria-pressed')) === 'true' && /3 days · £2,880\.00/.test(await p.locator('[data-testid="takings-import-preview"]').innerText()), picker.replace(/\n/g, ' | '));
    await p.locator('[data-testid="takings-col-0"]').click(); await sleep(300);
    check('Picking another row changes the total', /3 days · £2,400\.00/.test(await p.locator('[data-testid="takings-import-preview"]').innerText()));
    await p.locator('[data-testid="takings-col-2"]').click(); await sleep(200);
    await p.locator('[data-testid="button-takings-import"]').click(); await sleep(1500);
    const got = (await (await fetch('http://localhost:8899/rest/v1/cash_ups?select=*')).json()).filter(c => /^2019-01-0[234]$/.test(c.business_date)).map(c => c.total_taken).sort((a, b) => a - b);
    check('Till report saved with the picked row', JSON.stringify(got) === '[840,960,1080]', JSON.stringify(got));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
