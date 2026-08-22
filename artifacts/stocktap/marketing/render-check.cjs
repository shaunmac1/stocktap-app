const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const path = 'file://' + process.cwd() + '/landing.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // desktop light
  let ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1 });
  let p = await ctx.newPage();
  const errs = []; p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto(path, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/land-desktop-hero.png' });
  await p.evaluate(() => document.getElementById('how').scrollIntoView()); await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/land-desktop-how.png' });
  await p.evaluate(() => document.getElementById('pricing').scrollIntoView()); await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/land-desktop-pricing.png' });
  await ctx.close();
  // mobile dark
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  p = await ctx.newPage();
  await p.goto(path, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.screenshot({ path: '/tmp/land-mobile-dark-hero.png' });
  await p.evaluate(() => document.getElementById('how').scrollIntoView()); await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/land-mobile-dark-how.png' });
  await ctx.close();
  await b.close();
  console.log('console errors:', errs.length, errs.slice(0,5));
  console.log('RENDER DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
