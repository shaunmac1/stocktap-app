const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
const STAFF = { email: 'staff.test+e2e@stocktap.net', password: 'TestPass!2926' };
const CODE = 'E8F82B';
const errors = [];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 402, height: 860 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const shot = (n) => p.screenshot({ path: `/tmp/e2e/${n}.png`, fullPage: true }).then(()=>console.log('  shot', n));
  p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERR: '+e.message));

  console.log('1. Staff sign in');
  await p.goto(`${BASE}/auth`, { waitUntil:'networkidle' });
  await p.fill('#email', STAFF.email); await p.fill('#password', STAFF.password);
  await p.getByRole('button', { name: /^sign in$/i }).click();
  await p.waitForTimeout(3500); await shot('20-staff-after-login');
  console.log('  body', (await p.innerText('body')).replace(/\s+/g,' ').slice(0,180));

  // Join a team with code
  const joinLink = p.getByText(/joining a team/i);
  if (await joinLink.count()) {
    console.log('2. Redeem code');
    await joinLink.first().click(); await p.waitForTimeout(500);
    await p.fill('#staffCode', CODE);
    await p.getByRole('button', { name: /link my phone/i }).click();
    await p.waitForTimeout(4000); await shot('21-staff-clock');
  } else {
    console.log('  (no join link — maybe already linked)'); await shot('21-staff-clock');
  }
  const clockBody = (await p.innerText('body')).replace(/\s+/g,' ');
  console.log('  clock body:', clockBody.slice(0, 300));

  // MONEY CHECK
  const moneyHits = [];
  ['Tonight\'s wages','wage','Total Stock Value','of the take','£'].forEach(t => { if (clockBody.includes(t)) moneyHits.push(t); });
  console.log('  MONEY VISIBLE ON CLOCK?', moneyHits.length ? moneyHits : 'none');

  // Clock in
  const clockInBtn = p.getByText(/^Clock in$/);
  if (await clockInBtn.count()) {
    console.log('3. Clock in');
    await clockInBtn.first().click(); await p.waitForTimeout(2500); await shot('22-staff-clocked-in');
    console.log('  after clock-in:', (await p.innerText('body')).replace(/\s+/g,' ').slice(0,160));
  } else { console.log('  no Clock in button found'); }

  // Checks tab
  console.log('4. Staff checks tab');
  const checksTab = p.getByText(/^Checks$/);
  if (await checksTab.count()) { await checksTab.first().click(); await p.waitForTimeout(2000); await shot('23-staff-checks'); }
  else { await p.goto(`${BASE}/checks`, {waitUntil:'networkidle'}); await p.waitForTimeout(2000); await shot('23-staff-checks'); }
  const checksBody = (await p.innerText('body')).replace(/\s+/g,' ');
  console.log('  staff checks body:', checksBody.slice(0, 260));
  console.log('  staff sees config (Add a temperature point)?', checksBody.includes('Add a temperature point'));

  // Deep-link attempt to money page
  console.log('5. Deep-link /daily-board as staff');
  await p.goto(`${BASE}/daily-board`, { waitUntil:'networkidle' }); await p.waitForTimeout(2000); await shot('24-staff-deeplink-board');
  const dlBody = (await p.innerText('body')).replace(/\s+/g,' ');
  console.log('  deeplink body:', dlBody.slice(0,160));
  console.log('  board money leaked?', dlBody.includes("Tonight's take") || dlBody.includes('Cash up') || dlBody.includes('Total taken'));

  console.log('ERRORS:', errors.length ? errors.slice(0,8) : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
