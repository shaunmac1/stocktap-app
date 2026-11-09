// Count-screen fixes, driven as a user on a phone-sized screen against mock5.cjs.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs'); const SHOT = '/tmp/uitest/shots5'; fs.mkdirSync(SHOT, { recursive: true });
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
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const shot = n => p.screenshot({ path: `${SHOT}/${n}.png` });
  const tap = async (tid, t = 10000) => { const l = p.locator(`[data-testid="${tid}"]`).first(); await l.waitFor({ state: 'visible', timeout: t }); await l.evaluate(e => e.scrollIntoView({ block: "center" })); await sleep(150); await l.click({ force: true }); await sleep(450); };
  // Keys of the NumberPad under a given label
  const padFor = label => p.locator('[data-testid="add-entry-sheet"] div.w-full.flex.flex-col.gap-4', { has: p.getByText(label, { exact: true }) }).first();
  const typeOn = async (label, str) => { const s = padFor(label); await s.getByRole('button', { name: 'C', exact: true }).click(); for (const ch of str) { await s.getByRole('button', { name: ch, exact: true }).first().click(); await sleep(90); } };
  const sheetText = async () => (await p.locator('[data-testid="add-entry-sheet"]').innerText()).replace(/\s+/g, ' ');
  const openEntry = async id => { await tap(`counting-product-${P(id)}`); await sleep(400); await tap('button-add-entry'); await tap('button-location-unspecified'); await sleep(500); };
  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  try {
    await p.goto('http://localhost:5173/library', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await tap('button-add-product-fab'); await sleep(800);
    await p.locator('#p-name').fill('Soft Test Cola Can 330ml');
    await p.locator('[data-testid="select-category"]').click(); await p.getByRole('option', { name: 'Minerals' }).click(); await sleep(400);
    await p.locator('button[type=submit]', { hasText: 'Add Product' }).click(); await sleep(2500);
    const log2 = await (await fetch('http://localhost:8899/__log')).json();
    check('inserts', true, String(log2.log.filter(l => l.insert === 'products').length));
    await shot('dbg1');
    await tap('button-add-product-fab'); await sleep(1200); await shot('dbg2');
  } catch (e) { results.push('ERROR ' + e.message); await shot('zz-error'); }
  console.log(results.join('\n'));
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
  await b.close();
})();
