const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
const OWNER = { email: 'owner.test+e2e@stocktap.net', password: 'TestPass!2926' };
const errors = [];
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 402, height: 860 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const shot = (n) => p.screenshot({ path: `/tmp/e2e/${n}.png`, fullPage: true }).then(()=>log('  shot', n));
  p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERR: '+e.message));

  log('1. Sign in');
  await p.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
  await p.fill('#email', OWNER.email); await p.fill('#password', OWNER.password);
  await p.getByRole('button', { name: /^sign in$/i }).click();
  await p.waitForTimeout(3500); await shot('01-after-login');
  log('  url', p.url(), '| body', (await p.innerText('body')).replace(/\s+/g,' ').slice(0,160));

  if (await p.$('#venueName')) {
    log('2. Venue setup');
    await p.fill('#venueName', 'E2E Test Pub');
    await p.getByRole('button', { name: /complete setup/i }).click();
    await p.waitForTimeout(3500); await shot('02-after-venue');
    log('  url', p.url(), '| body', (await p.innerText('body')).replace(/\s+/g,' ').slice(0,160));
  }

  log('3. Team: add staff');
  await p.goto(`${BASE}/team`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await shot('03-team');
  try {
    await p.getByRole('button', { name: /add a team member/i }).click(); await p.waitForTimeout(400);
    await p.getByPlaceholder('Libby').fill('Dave');
    await p.getByPlaceholder('12.00').fill('12');
    await p.getByRole('button', { name: /add to the team/i }).click(); await p.waitForTimeout(1800);
    await shot('04-team-dave');
    // reveal codes
    const showCodes = await p.getByText(/show codes/i); if (await showCodes.count()) { await showCodes.first().click(); await p.waitForTimeout(600); await shot('05-team-codes'); }
    log('  team body', (await p.innerText('body')).replace(/\s+/g,' ').slice(0,220));
  } catch(e){ log('  TEAM ERR', e.message); await shot('04-team-err'); }

  log('4. Checks: starter sets + log temp + tick + refusal');
  await p.goto(`${BASE}/checks`, { waitUntil:'networkidle' }); await p.waitForTimeout(1200); await shot('06-checks-empty');
  try {
    const addTemps = p.getByRole('button', { name: /add the usual temperature/i });
    if (await addTemps.count()) { await addTemps.click(); await p.waitForTimeout(1500); }
    const addLists = p.getByRole('button', { name: /add the standard checklist/i });
    if (await addLists.count()) { await addLists.click(); await p.waitForTimeout(1500); }
    await shot('07-checks-setup');
    // log an out-of-range temp in first appliance input
    const nums = await p.locator('input[type="number"]');
    if (await nums.count()) {
      await nums.first().fill('9');
      await p.getByRole('button', { name: /^log$/i }).first().click(); await p.waitForTimeout(1500);
      await shot('08-checks-temp-flag');
    }
    // tick first checklist item (a button containing a checklist label)
    const openItem = p.getByText(/no signs of pests/i);
    if (await openItem.count()) { await openItem.first().click(); await p.waitForTimeout(1200); await shot('09-checks-ticked'); }
    // refusal
    const refBtn = p.getByRole('button', { name: /log a refusal/i });
    if (await refBtn.count()) { await refBtn.click(); await p.waitForTimeout(500); 
      const logIt = p.getByRole('button', { name: /log it/i });
      if (await logIt.count()) { await logIt.click(); await p.waitForTimeout(1200); await shot('10-checks-refusal'); }
    }
    log('  checks body', (await p.innerText('body')).replace(/\s+/g,' ').slice(0,240));
  } catch(e){ log('  CHECKS ERR', e.message); await shot('checks-err'); }

  log('5. Rota: add shift + copy week');
  await p.goto(`${BASE}/rota`, { waitUntil:'networkidle' }); await p.waitForTimeout(1200); await shot('11-rota');
  try {
    const addBar = p.getByRole('button', { name: /add to bar/i });
    if (await addBar.count()) {
      await addBar.first().click(); await p.waitForTimeout(500);
      const sel = p.locator('select'); if (await sel.count()) await sel.first().selectOption({ index: 0 });
      const uc = p.getByText(/until close/i); if (await uc.count()) await uc.first().click();
      await p.getByRole('button', { name: /add shift/i }).click(); await p.waitForTimeout(1500);
      await shot('12-rota-shift');
    }
    log('  rota body', (await p.innerText('body')).replace(/\s+/g,' ').slice(0,220));
  } catch(e){ log('  ROTA ERR', e.message); await shot('rota-err'); }

  log('ERRORS:', errors.length ? errors.slice(0,10) : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
