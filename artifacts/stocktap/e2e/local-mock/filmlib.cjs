// Film a how-to video by driving the real app at phone size against a local mock (Demo Bar).
// Each step captures a frame (with the tap point, if any) and a caption; finish() renders
// a 1080x1920 MP4 with compose.py and a web copy + poster for the site and in-app help.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const fs = require('fs');
const { execFileSync } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const U = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U, role: 'authenticated', aud: 'authenticated', exp, email: 'owner@example.test' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: U, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const OUT = '/mnt/user-data/outputs/stocktap-help-videos';
const WEB = '/home/claude/web/media/help';

async function film(name, title, fn, { signedIn = true, base = 'http://localhost:5173' } = {}) {
  const dir = `/tmp/film/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WEB, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server', '--lang=en-GB'], env: { ...process.env, LANG: 'en_GB.UTF-8', LANGUAGE: 'en_GB' } });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write', 'notifications'] });
  if (signedIn) await ctx.addInitScript(s => { try { localStorage.setItem('sb-localhost-auth-token', s); } catch {} }, JSON.stringify(session));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const man = []; let n = 0;
  const L = sel => (typeof sel === 'string' ? p.locator(sel).first() : sel);
  const pt = async sel => { const l = L(sel); await l.scrollIntoViewIfNeeded(); await sleep(150); const r = await l.boundingBox(); return [Math.round((r.x + r.width / 2) * 2), Math.round((r.y + r.height / 2) * 2)]; };
  const f = {
    p, sleep, base,
    go: async (path, wait = 2800) => { await p.goto(base + path, { waitUntil: 'domcontentloaded' }); await sleep(wait); },
    shot: async (cap, d = 2.2, tap = null, blur = null) => { const file = `${dir}/${String(n++).padStart(2, '0')}.png`; await p.screenshot({ path: file }); man.push({ f: file, cap, d, ...(tap ? { tap } : {}), ...(blur ? { blur } : {}) }); },
    // frame showing the tap, then the tap itself
    tap: async (sel, cap, d = 1.8, wait = 700, real = false) => { const q = await pt(sel); await f.shot(cap, d, q); if (real) await L(sel).click({ force: true }); else await L(sel).evaluate(e => e.click()); await sleep(wait); },
    click: async (sel, wait = 500) => { await L(sel).scrollIntoViewIfNeeded(); await L(sel).evaluate(e => e.click()); await sleep(wait); },
    keys: async (str, scope = 'body') => { const s = p.locator(scope).first(); for (const ch of str) { await s.getByRole('button', { name: ch, exact: true }).first().click(); await sleep(110); } },
    fill: async (sel, text) => { await L(sel).scrollIntoViewIfNeeded(); await L(sel).click(); await L(sel).fill(''); await L(sel).pressSequentially(text, { delay: 25 }); await sleep(300); },
    scrollTo: async (sel, block = 'center') => { await L(sel).evaluate((e, b) => e.scrollIntoView({ block: b }), block); await sleep(350); },
    top: async () => { await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); }); await sleep(300); },
    noToast: async () => { for (const x of await p.locator('[toast-close]').all()) { try { await x.evaluate(e => e.click()); } catch {} } await sleep(350); },
    sheetScroll: async (sel = '[data-testid="add-entry-sheet"]', where = 'bottom') => { await p.evaluate(([s, w]) => { const r = document.querySelector(s); if (!r) return; [r, ...r.querySelectorAll('*')].forEach(e => { if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = w === 'bottom' ? e.scrollHeight : 0; }); }, [sel, where]); await sleep(350); },
    exists: async sel => (await p.locator(sel).count()) > 0,
    text: async sel => (await L(sel).innerText()).replace(/\s+/g, ' '),
  };
  let ok = true;
  try { await fn(f); } catch (e) { ok = false; console.log(`ERROR [${name}]`, e.message.split('\n')[0]); await p.screenshot({ path: `${dir}/zz-error.png` }); }
  await b.close();
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(man, null, 1));
  if (!ok || man.length < 2) { console.log(`SKIPPED ${name}: ${man.length} frames`); return false; }
  const mp4 = `${OUT}/${name}.mp4`;
  execFileSync('python3', ['/home/claude/vid/compose.py', `${dir}/manifest.json`, mp4, title], { stdio: 'pipe' });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vf', 'scale=720:1280', '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', `${WEB}/${name}.mp4`]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.min(4, man.reduce((s, x) => s + x.d, 0) / 3)), '-i', `${WEB}/${name}.mp4`, '-frames:v', '1', '-q:v', '4', `${WEB}/${name}.jpg`]);
  const secs = man.reduce((s, x) => s + x.d, 0) + 3.4;
  console.log(`OK ${name}: ${man.length} frames, ~${Math.round(secs)}s${errs.length ? ' page errors: ' + errs.join(' | ') : ''}`);
  return true;
}

module.exports = { film, sleep };
