// As-the-user test of the guided first count: fresh landlord signs in, sets up
// a venue, lands on onboarding, picks three lines from the catalogue, counts
// one, sees "1 of 3 done" on Home, resumes into the same three (not the whole
// library), closes the count, and is offered the second count.
//
// Run per e2e/README.md (proxy on :8899, build to /tmp/e2e-dist, static.cjs on :5173).
const { chromium } = require(process.env.PW_PATH || '/root/.claude/skills/gstack/node_modules/playwright/index.js');
const fs = require('fs');
const BASE = 'http://localhost:5173';
const SHOT = '/tmp/e2e';
try { fs.mkdirSync(SHOT, { recursive: true }); } catch {}
const [EMAIL, PASSWORD] = process.argv.slice(2);
if (!EMAIL || !PASSWORD) { console.error('usage: node e2e-first-count.cjs <email> <password>'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1234/chrome-linux64/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [], badReq = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/auth\/v1\/token/.test(r.url())) badReq.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  const shot = n => p.screenshot({ path: `${SHOT}/fc-${n}.png`, fullPage: false });

  try {
    // 1. sign in
    await p.goto(`${BASE}/auth`); await sleep(1500);
    await p.fill('#email', EMAIL); await p.fill('#password', PASSWORD);
    await p.getByRole('button', { name: /^sign in$/i }).click();
    await sleep(3000); await shot('01-after-signin');

    // 2. venue setup (fresh account lands here)
    const venueField = p.locator('#venueName');
    if (await venueField.count()) {
      await venueField.fill('First Count Test Pub');
      await p.getByRole('button', { name: /complete setup/i }).click();
      await sleep(3500);
    }
    await shot('02-after-venue');

    // 3. onboarding should now offer the guided first count
    const fcBtn = p.getByTestId('button-onboarding-first-count');
    const freshAccount = await venueField.count() > 0;
    if (freshAccount) check('onboarding offers "Pick my 20 biggest sellers"', await fcBtn.count() > 0);
    if (await fcBtn.count()) { await fcBtn.click(); await sleep(2000); }
    else { await p.goto(`${BASE}/first-count`); await sleep(2000); }
    await shot('03-first-count-empty');
    check('first-count page renders', await p.getByTestId('input-first-count-search').count() > 0);
    check('suggested brands shown before typing', await p.getByTestId('first-count-suggest-smirnoff').count() > 0);

    // 4. pick three lines from the catalogue
    const pickOne = async (term) => {
      await p.getByTestId('input-first-count-search').fill(term);
      await sleep(2500);
      const rows = p.locator('[data-testid^="first-count-catalogue-"], [data-testid^="first-count-library-"]');
      const n = await rows.count();
      if (n === 0) { check(`catalogue result for ${term}`, false, 'no results'); return; }
      const first = await rows.first().innerText();
      await rows.first().click();
      await sleep(2500);
      check(`added from catalogue: ${term}`, true, first.split('\n')[0]);
    };
    await pickOne('Smirnoff');
    await pickOne('Gordons');
    await pickOne('Coke');
    await shot('04-three-picked');
    const pickedRows = await p.locator('[data-testid^="first-count-picked-"]').count();
    check('three lines listed as picked', pickedRows === 3, `${pickedRows} picked`);
    check('progress text says 3 of 20', (await p.locator('text=/3 of 20 picked/').count()) > 0);

    // 5. start the count -> lands straight in counting with only those lines
    await p.getByTestId('button-first-count-start').click();
    await p.locator('[data-testid^="counting-product-"]').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(1000); await shot('05-counting');
    const countingRows = await p.locator('[data-testid^="counting-product-"]').count();
    check('count screen opened directly (no list step)', await p.locator('text=/Counting/').count() > 0);
    check('count screen shows exactly the 3 picked lines', countingRows === 3, `${countingRows} rows`);
    check('Left (3) filter present', (await p.locator('text=/Left \\(3\\)/').count()) > 0);

    // 6. count one line: open the Smirnoff (a bottle), add a location entry, switch to tenths, save 6
    const smirnoffRow = p.locator('[data-testid^="counting-product-"]', { hasText: /smirnoff/i });
    await smirnoffRow.first().click(); await sleep(1500);
    await p.getByTestId('button-add-entry').click(); await sleep(1000);
    // fresh venue: no count locations yet -> make one
    if (await p.getByTestId('button-add-new-location').count()) {
      await p.getByTestId('button-add-new-location').click(); await sleep(400);
      await p.getByTestId('input-new-count-location-inline').fill('Bar');
      await p.getByTestId('button-save-new-location').click(); await sleep(2000);
    } else {
      const anyLoc = p.locator('[data-testid^="button-location-"]');
      await anyLoc.first().click(); await sleep(800);
    }
    await shot('06-entry-form');
    const tenthsBtn = p.getByTestId('button-bottle-method-tenths');
    check('Weigh/Tenths switch shown on a bottle', await tenthsBtn.count() > 0);
    if (await tenthsBtn.count()) { await tenthsBtn.click(); await sleep(500); }
    const key6 = p.getByRole('button', { name: /^6$/ });
    if (await key6.count()) { await key6.first().click(); await sleep(300); }
    await p.getByTestId('button-save-entry').click(); await sleep(3000);
    await shot('07-after-one-entry');

    // 7. Home shows "1 of 3 done"
    await p.goto(`${BASE}/`); await sleep(3500); await shot('08-home-progress');
    const bannerText = (await p.getByTestId('banner-open-stocktake').count()) ? await p.getByTestId('banner-open-stocktake').innerText() : '';
    check('Home banner says 1 of 3 done', /1 of 3 done/.test(bannerText), bannerText.replace(/\n/g, ' | '));
    check('Home does NOT show "Do your first count" while one is open', (await p.getByTestId('banner-first-count').count()) === 0);

    // 8. resume from Home lands in the same 3 lines, not the whole library
    await p.getByTestId('banner-open-stocktake').click(); await sleep(4000); await shot('09-resumed');
    const resumedRows = await p.locator('[data-testid^="counting-product-"]').count();
    check('Resume shows the same 3 lines', resumedRows === 3, `${resumedRows} rows`);

    // 9. review & close -> second-count prompt
    await p.getByTestId('button-review-stocktake').click(); await sleep(2500); await shot('10-review');
    check('Review warns 2 of 3 not counted', (await p.getByTestId('banner-uncounted').count()) > 0);
    const closeBtn = p.getByTestId('button-finish-stocktake');
    check('Finish button enabled with one line counted', await closeBtn.isEnabled());
    if (await closeBtn.count()) { await closeBtn.first().click(); await sleep(1200); }
    const confirm = p.getByRole('button', { name: /^(close|confirm|yes)/i });
    if (await confirm.count()) { await confirm.first().click(); await sleep(4000); }
    await shot('11-after-close');
    check('second-count prompt appears after first close', (await p.getByTestId('card-second-count-prompt').count()) > 0);
    if (await p.getByTestId('button-book-second-count').count()) {
      await p.getByTestId('button-book-second-count').click(); await sleep(3000); await shot('12-booked');
      check('booking the second count did not error', (await p.getByTestId('card-second-count-prompt').count()) === 0);
    }
  } catch (e) {
    check('script completed', false, e.message);
    await shot('99-error');
  }

  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  if (errors.length) console.log('console errors:', errors.slice(0, 8));
  if (badReq.length) console.log('bad requests:', badReq.slice(0, 8));
  await b.close();
  process.exit(fails ? 1 : 0);
})();
