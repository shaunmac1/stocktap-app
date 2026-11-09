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
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const R = []; const note = (n, d) => R.push(`${n}: ${d}`);
  const tap = async tid => { const l = p.locator(`[data-testid="${tid}"]:visible`).first(); await l.waitFor({ timeout: 8000 }).catch(() => { throw new Error('not visible: ' + tid); }); await l.scrollIntoViewIfNeeded(); await l.click(); await sleep(600); };
  const plus = async k => { for (let i = 0; i < k; i++) await p.locator('[data-testid="button-full-plus"]:visible').first().click(); };
  const gal = async v => { const l = p.locator('[data-testid="input-part-gallons"]:visible').first(); await l.fill(''); await l.pressSequentially(String(v), { delay: 80 }); await sleep(300); };
  const res = async () => (await p.locator('[data-testid="text-keg-result"]').innerText().catch(() => '—')).trim();
  const spot = async loc => { await tap('button-add-entry'); if (!(await p.locator(`[data-testid="button-location-${loc}"]:visible`).count())) await tap('button-change-spot'); await tap(`button-location-${loc}`); if (await p.locator('[data-testid="button-keg-mode-kegs"]:visible').count()) await tap('button-keg-mode-kegs'); };
  try {
    await p.goto('http://localhost:5173/stocktake', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap('button-new-stocktake'); await tap(`select-product-${P('a')}`); await tap('button-start-stocktake'); await sleep(1000);
    await tap(`counting-product-${P('a')}`);
    // B: decimal gallons
    await spot('loc-cellar'); await gal('10.5'); note('B decimal 10.5 gal typed', `input shows "${await p.locator('[data-testid="input-part-gallons"]').inputValue()}", result ${await res()}`);
    // C: silly full count
    await p.locator('[data-testid="input-full-containers"]:visible').fill('250'); await sleep(300); note('C 250 full kegs', `warning shown: ${await p.locator('[data-testid="warn-full-high"]').isVisible()}`);
    await p.locator('[data-testid="input-full-containers"]:visible').fill('9'); await gal('10'); await tap('button-save-entry'); await sleep(800);
    // A: same spot counted twice by mistake
    await spot('loc-cellar'); await plus(9); await gal('10');
    await tap('button-save-entry'); await sleep(600);
    note('A second Cellar entry asks replace or add', `${await p.locator('[data-testid="dup-spot-ask"]').isVisible()}`);
    await tap('button-dup-replace'); await sleep(1000);
    const body = await p.locator('body').innerText();
    note('A total after recount + Replace (should be 109 gal 0 pt)', (body.match(/TOTAL ACROSS ALL SPOTS\s*\n([^\n]+)/) || [])[1] || '?');
    // A2: genuinely two open kegs: Add as another
    await spot('loc-cellar'); await gal('3'); await tap('button-save-entry'); await sleep(600); await tap('button-dup-add'); await sleep(1000);
    const b2 = await p.locator('body').innerText();
    note('A2 Add as another (109 + 3 gal = 112 gal 0 pt)', (b2.match(/TOTAL ACROSS ALL SPOTS\s*\n([^\n]+)/) || [])[1] || '?');
    // D: edit a saved entry?
    note('D edit button on saved entry', `${await p.locator('[data-testid^="button-edit-entry"]').count()} edit, ${await p.locator('button:has(svg.lucide-trash-2), [data-testid^="button-delete-entry"]').count()} delete`);
    await p.screenshot({ path: `${SHOT}/b1-double.png`, fullPage: true });
  } catch (e) { R.push('ERROR ' + e.message.split('\n')[0]); }
  console.log(R.join('\n')); console.log('errors', errors.slice(0, 3)); await b.close();
})();
