// Daily Board with years of takings: day comparisons back 3 years, weeks, months, wages %, and Finances money in.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots16'; fs.mkdirSync(SHOT, { recursive: true });
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
  try {
    const all = await (await fetch('http://localhost:8899/rest/v1/cash_ups?select=*')).json();
    const byDate = new Map(all.map(c => [c.business_date, c.total_taken]));
    const iso = d => d.toISOString().slice(0, 10);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const yest = new Date(today.getTime() - 864e5);

    await go('/daily-board');
    await p.locator('button[aria-label="Previous day"]').click(); await sleep(800);
    const day = await p.locator('main').innerText();
    const ago3 = byDate.get(iso(new Date(yest.getTime() - 364 * 3 * 864e5)));
    check('Day: 3 years ago filled (needs more than 1,000 nights read)', ago3 != null && day.includes(ago3.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), `3y ago £${ago3}`);
    await p.screenshot({ path: `${SHOT}/day.png` });

    await p.locator('[data-testid="board-view-weeks"]').click(); await sleep(800);
    const sun = new Date(today.getTime() - today.getUTCDay() * 864e5);
    let exp = 0; for (let i = 0; i < 7; i++) { const v = byDate.get(iso(new Date(sun.getTime() + i * 864e5))); if (v != null) exp += v; }
    const shown = money(await p.locator('[data-testid="text-week-total"]').innerText());
    check('Weeks: this week total adds up the nights logged', Math.abs(shown - exp) < 0.01, `shown £${shown} expected £${exp.toFixed(2)}`);
    check('Weeks: compared with the same days last year', await p.locator('[data-testid="text-week-vs-last-year"]').count() === 1);
    check('Weeks: wage % from the weekly staffing', /%$/.test((await p.locator('[data-testid="text-week-wage-pct"]').innerText()).trim()));
    const n1 = await p.locator('[data-testid^="week-row-"]').count();
    await p.locator('[data-testid="button-more-weeks"]').click(); await sleep(500);
    const n2 = await p.locator('[data-testid^="week-row-"]').count();
    check('Weeks: shows 12, then earlier weeks on tap', n1 === 12 && n2 === 24, `${n1} → ${n2}`);
    check('Weeks: no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${SHOT}/weeks.png` });

    await p.locator('[data-testid="board-view-months"]').click(); await sleep(800);
    const mo = await p.locator('main').innerText();
    check('Months: last 12 full months vs the year before', await p.locator('[data-testid="text-months-total"]').count() === 1);
    check('Months: this month marked "so far", not compared', /so far/.test(mo));
    await p.screenshot({ path: `${SHOT}/months.png` });

    // Bring in past takings by pasting
    await go('/daily-board');
    await p.locator('[data-testid="button-open-takings-import"]').click(); await sleep(700);
    const y1 = iso(yest).split('-').reverse().join('/');
    await p.locator('[data-testid="input-takings-paste"]').fill(`Date\tTakings\n01/01/2020\t£1,234.56\n02/01/2020\t987.65\n${y1}\t2222.22\nTotal\t4444.43`); await sleep(500);
    const pv = await p.locator('[data-testid="takings-import-preview"]').innerText();
    check('Import: preview counts 3 days, flags 1 already logged, lists skipped rows', /3 days/.test(pv) && /1 of these days already/.test(pv) && /Left out 1 row/.test(pv), pv.replace(/\n/g, ' | '));
    await p.screenshot({ path: `${SHOT}/import.png` });
    await p.locator('[data-testid="button-takings-import"]').click(); await sleep(1500);
    const after = await (await fetch('http://localhost:8899/rest/v1/cash_ups?select=*')).json();
    const got = d => after.find(c => c.business_date === d)?.total_taken;
    check('Import: saved and updated exactly', got('2020-01-01') === 1234.56 && got('2020-01-02') === 987.65 && got(iso(yest)) === 2222.22 && after.length === all.length + 2, `${got('2020-01-01')} ${got('2020-01-02')} ${got(iso(yest))} rows ${all.length}→${after.length}`);

    await go('/finances');
    await p.locator('[data-testid="button-period-month"]').click().catch(() => {}); await sleep(600);
    const inc = await p.locator('[data-testid="text-income-board"]').count();
    check('Finances: Daily Board takings counted as money in', inc === 1 && money(await p.locator('[data-testid="text-income"]').innerText()) > 0);
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
