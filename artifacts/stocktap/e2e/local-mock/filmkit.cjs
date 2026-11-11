// Shared helpers for phone-size how-to films (frames + manifest for compose.py). Demo data only.
const { chromium } = require('playwright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111'; const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
module.exports = async function film(name, intro, run) {
  const DIR = `/tmp/film/${name}`;
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
  await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const man = []; let n = 0;
  const L = tid => p.locator(`[data-testid="${tid}"]:visible`).first();
  const has = async tid => (await p.locator(`[data-testid="${tid}"]:visible`).count()) > 0;
  const shot = async (cap, d = 2.4, tapAt = null) => { const f = `${DIR}/${String(n++).padStart(2, '0')}.png`; await p.screenshot({ path: f }); man.push({ f, cap, d, ...(tapAt ? { tap: tapAt } : {}) }); };
  const pt = async loc => { await loc.scrollIntoViewIfNeeded(); await sleep(200); const r = await loc.boundingBox(); return [Math.round((r.x + r.width / 2) * 2), Math.round((r.y + r.height / 2) * 2)]; };
  const tap = async (tid, cap = null, d = 1.8, wait = 700) => { const l = L(tid); await l.waitFor({ state: 'visible', timeout: 10000 }); if (cap) await shot(cap, d, await pt(l)); else await l.scrollIntoViewIfNeeded(); await l.tap(); await sleep(wait); };
  const key = async ch => { await p.locator(`button:visible:text-is("${ch}")`).last().tap(); await sleep(150); };
  const show = async tid => { await L(tid).scrollIntoViewIfNeeded(); await sleep(300); };
  const go = async path => { await p.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' }); await sleep(4000); };
  try { await run({ p, L, has, shot, tap, key, show, go, sleep }); }
  catch (e) { console.log('ERROR', e.message.split('\n')[0]); await p.screenshot({ path: `${DIR}/zz-error.png` }); }
  if (man[0]) man[0].intro = intro;
  fs.writeFileSync(`${DIR}/manifest.json`, JSON.stringify(man, null, 1));
  console.log(`${name}: frames ${man.length}${errs.length ? ' errors: ' + errs.join(' | ') : ''}`);
  await b.close();
};
