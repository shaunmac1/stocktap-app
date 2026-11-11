// Homepage hero, tour and problem pages, driven as a visitor at phone and desktop size.
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOT = '/tmp/uitest/shots10';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required'] });
  const results = []; const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`);
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await p.screenshot({ path: `${SHOT}/${label}-01-hero.png` });
    const hero = p.locator('[data-testid="video-hero"]');
    check(`${label}: hero video present`, await hero.count() === 1);
    const attrs = await hero.evaluate(v => ({ auto: v.autoplay, muted: v.muted, loop: v.loop, inline: v.playsInline, src: v.getAttribute('src') }));
    const hs = await p.evaluate(async s => (await fetch(s, { method: 'HEAD' })).status, attrs.src);
    check(`${label}: hero video set to autoplay muted, loop, inline, file loads`, attrs.auto && attrs.muted && attrs.loop && attrs.inline && hs === 200, JSON.stringify({ ...attrs, hs }));
    check(`${label}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.locator('[data-testid="button-hero-tour"]').click(); await sleep(1500);
    check(`${label}: tour opens with its video`, await p.locator('[data-testid="video-tour"]').evaluate(v => v.autoplay && v.controls && !!v.getAttribute('src')));
    await p.screenshot({ path: `${SHOT}/${label}-02-tour.png` });
    await p.locator('[data-testid="button-tour-close"]').click(); await sleep(400);
    check(`${label}: tour closes`, await p.locator('[data-testid="tour-modal"]').count() === 0);
    const grid = p.locator('[data-testid="problem-grid"]'); await grid.scrollIntoViewIfNeeded(); await sleep(400);
    await p.screenshot({ path: `${SHOT}/${label}-03-grid.png` });
    const hrefs = await p.locator('[data-testid^="problem-"] ').evaluateAll(as => as.map(a => a.getAttribute('href')).filter(Boolean));
    check(`${label}: six problem tiles`, hrefs.length === 6, hrefs.join(','));
    await p.locator('[data-testid="button-hero-start"]').click(); await sleep(1200);
    check(`${label}: Start free goes to sign up`, p.url().includes('/auth'), p.url());
    // problem pages
    for (const h of hrefs) {
      await p.goto('http://localhost:5173' + h + '.html', { waitUntil: 'load' }); await sleep(600);
      const ok = await p.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, v: (() => { const v = document.querySelector('.phone video'); return v ? v.getAttribute('src') : null; })(), sw: document.documentElement.scrollWidth <= innerWidth + 1, more: document.querySelectorAll('.more a').length }));
      const vsrc = ok.v ? ok.v.split('#')[0] : '';
      const vres = vsrc ? await p.evaluate(async s => (await fetch(s, { method: 'HEAD' })).status, vsrc) : 0;
      check(`${label}: ${h} renders with a working video`, !!ok.h1 && vres === 200 && ok.sw && ok.more === 5, JSON.stringify({ ...ok, vres }));
      if (h.endsWith('what-to-order') || h.endsWith('checking-deliveries')) await p.screenshot({ path: `${SHOT}/${label}-p-${h.split('/').pop()}.png`, fullPage: label === 'phone' });
    }
    await p.goto('about:blank'); await p.goto('http://localhost:5173/#tour', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    check(`${label}: /#tour opens the tour`, await p.locator('[data-testid="tour-modal"]').count() === 1);
    await p.goto('http://localhost:5173/videos/index.html', { waitUntil: 'load' }); await sleep(500);
    const vids = await p.evaluate(() => [...document.querySelectorAll('video')].map(v => v.getAttribute('src')));
    const missing = [];
    for (const s of vids) { const st = await p.evaluate(async s => (await fetch(s, { method: 'HEAD' })).status, s); if (st !== 200) missing.push(s); }
    check(`${label}: videos page has 48 videos and the new ones load`, vids.length === 48 && missing.length === 0, missing.join(','));
    check(`${label}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  console.log(results.join('\n')); await b.close();
})();
