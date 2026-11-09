// Consistency checks a careful user would spot: same numbers on every screen, nothing covered up.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots15'; fs.mkdirSync(SHOT, { recursive: true });
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
  const go = async (path, wait = 2600) => { await p.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' }); await sleep(wait); };
  const money = s => Number((s.match(/£([\d,]+\.\d\d)/) || [])[1]?.replace(/,/g, '') ?? NaN);
  const overlaps = async (a, bSel) => p.evaluate(([a, b]) => {
    const x = document.querySelector(a)?.getBoundingClientRect(); const ys = [...document.querySelectorAll(b)].map(e => e.getBoundingClientRect());
    return !!x && ys.some(y => y.width && !(x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top));
  }, [a, bSel]);
  try {
    await go('/');
    const home = money(await p.locator('[data-testid="text-stock-value"]').innerText());
    await go('/reports');
    const rep = money(await p.locator('text=Total Stock Value').locator('..').innerText());
    check('Home and Reports show the same stock value', Math.abs(home - rep) < 0.005, `home £${home} reports £${rep}`);

    // How to button never covers a fixed action bar
    await go('/first-count');
    await p.locator('[data-testid="input-first-count-search"]').fill('gordon'); await sleep(1300);
    await p.locator('[data-testid^="first-count-library-"], [data-testid^="first-count-catalogue-"]').first().click(); await sleep(1200);
    check('first count: How to sits above the Start bar', !(await overlaps('[data-testid="button-help-videos"]', '[data-testid="button-first-count-start"]')) && !(await overlaps('[data-testid="button-help-videos"]', 'div.fixed.bottom-16')));
    await p.screenshot({ path: `${SHOT}/first-count.png` });

    // Settings copy promises only what exists
    await go('/settings');
    await p.getByRole('tab', { name: 'Team' }).click(); await sleep(500);
    const team = await p.locator('main').innerText();
    check('Settings Team tab points to the Team page, no role promise', /Team page/.test(team) && !/assign their role/.test(team));
    await p.getByRole('tab', { name: 'Plan' }).click(); await sleep(800);
    const plan = await p.locator('main').innerText();
    check('Plan: no "Best value"/dev text, Pro recommended', !/Best value|until annual prices are added|Stripe\./.test(plan.replace('Securely handled by Stripe.', '')) && /Recommended/.test(plan), plan.slice(0, 120).replace(/\n/g, ' '));

    // Free-plan text, help page count
    await go('/help');
    const help = await p.locator('body').innerText();
    check('Help counts the real number of videos', /Watch how it works \(\d+ short videos\)/.test(help) && !/\(28 short videos\)/.test(help), (help.match(/Watch how it works \([^)]*\)/) || [''])[0]);
    check('Help: no "any date range" CSV claim', !/any date range/.test(help));

    // Invoice lines use plain words
    await go('/invoice-scan', 3000);
    const inv = await p.locator('main').innerText();
    check('Invoice lines say "To check", not "unmatched"', /To check/.test(inv) && !/\bunmatched\b/.test(inv));

    // Every page: no raw ids, NaN or undefined on screen
    const bad = [];
    for (const r of ['/', '/library', '/stocktake', '/spot-check', '/reports', '/daily-board', '/checks', '/finances', '/team', '/rota', '/ledger', '/settings', '/orders', '/delivery', '/first-count', '/suggestions', '/invoice-scan', '/help']) {
      await go(r, 2200);
      const t = await p.locator('body').innerText();
      if (/\bNaN\b|\bundefined\b|\bnull\b|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(t)) bad.push(r + ': ' + (t.match(/.{0,30}(\bNaN\b|\bundefined\b|\bnull\b|[0-9a-f]{8}-[0-9a-f]{4}).{0,30}/) || [''])[0]);
      const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (wide) bad.push(r + ': scrolls sideways');
    }
    check('no NaN/undefined/raw ids or sideways scroll on 18 screens', bad.length === 0, bad.join(' | '));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(results.join('\n')); console.log('page errors:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
