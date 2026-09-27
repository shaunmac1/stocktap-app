const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/'); await new Promise(r => setTimeout(r, 3500));
  const t = await p.evaluate(() => document.body.innerText);
  const checks = [
    ['no Lock-In banner', !/The Lock-In/.test(t)],
    ['no invented 2-5% average', !/2–5%/.test(t) && !/2-5%/.test(t)],
    ['no "venues report" claim', !/Venues using StockTap report/.test(t)],
    ['stocktaker price £125–£320', /£125–£320/.test(t)],
    ['catalogue copy updated', /2,400/.test(t) && !/140\+/.test(t)],
    ['no multi-venue / compliance / recipe claims', !/multi-venue|multi-site|compliance module|recipe costing/i.test(t)],
  ];
  for (const [n, ok] of checks) console.log(ok ? 'PASS' : 'FAIL', n);
  console.log('ERRORS', errs.length);
  await p.screenshot({ path: '/tmp/uitest/shots/40-landing.png', fullPage: true });
  await b.close();
})();
