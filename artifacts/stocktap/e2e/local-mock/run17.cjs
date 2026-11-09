// Checks: staff log temps and ticks; the owner looks back over history and downloads it.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots17'; fs.mkdirSync(SHOT, { recursive: true });
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
  try {
    await go('/checks');
    // Owner logs a warm fridge today
    const card = n => p.locator('div.rounded-xl').filter({ hasText: n }).filter({ has: p.locator('input[placeholder="°C"]') }).last();
    await card('Kitchen fridge').locator('input').fill('9'); await card('Kitchen fridge').getByRole('button', { name: 'Log' }).click(); await sleep(1200);
    const t = await p.locator('main').innerText();
    check('Out-of-range reading is flagged on the day', /Kitchen fridge — too warm/i.test(t));
    check('Owner\'s own reading says "You"', /Too warm at \d{1,2}:\d{2} · You/.test(t), (t.match(/Last: 9°C[^\n]*/) || [''])[0]);
    await p.locator('[data-testid="checks-tab-history"]').click(); await sleep(1500);
    const days = await p.locator('[data-testid^="checks-day-"]').count();
    check('History lists 30 days', days === 30, `${days}`);
    check('History summary: 1 day out of range in the past, today flagged too', (await p.locator('[data-testid="text-out-of-range"]').innerText()).trim() === '2');
    check('History counts refusals', +(await p.locator('[data-testid="text-refusals"]').innerText()) >= 2);
    await p.locator('[data-testid="checks-range-365"]').click(); await sleep(1500);
    const yearDays = await p.locator('[data-testid^="checks-day-"]').count();
    check('A year back starts from the first day anything was logged', yearDays === 36, `${yearDays}`);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('[data-testid="button-download-checks"]').click()]);
    const csv = require('fs').readFileSync(await dl.path(), 'utf8').split('\n');
    check('Download: every entry, with who logged it', csv[0] === 'Date,Time,Type,What,Result,Status,Logged by,Note' && csv.length > 300 && csv.some(l => /Kitchen fridge,7.4°C,Too warm,Sam/.test(l)) && csv.some(l => /Refusal,No ID shown/.test(l)), `${csv.length} lines · ${dl.suggestedFilename()}`);
    await p.locator('[data-testid="checks-range-30"]').click(); await sleep(1200);
    const warm = p.locator('[data-testid^="checks-day-"]').filter({ hasText: '7.4°C' }).first();
    await warm.click(); await sleep(1500);
    const dayText = await p.locator('main').innerText();
    check('Tapping a day opens it, with who logged the warm reading', /Last: 7.4°C — Too warm at [\d:]+ · Sam/.test(dayText));
    await p.screenshot({ path: `${SHOT}/day.png` });
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
