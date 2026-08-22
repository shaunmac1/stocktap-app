const fs = require('fs');
let html = fs.readFileSync('landing.tpl.html', 'utf8');
const b64 = (p) => fs.readFileSync(p).toString('base64');
const shots = '/tmp/shots';
const assets = {
  '__HERO_VIDEO__': 'data:video/mp4;base64,' + b64('stocktap-demo-full.mp4'),
  '__IMG_BOARD__': 'data:image/png;base64,' + b64(shots + '/board.png'),
  '__IMG_REPORTS__': 'data:image/png;base64,' + b64(shots + '/reports.png'),
  '__IMG_TEAM__': 'data:image/png;base64,' + b64(shots + '/team.png'),
  '__IMG_CHECKS__': 'data:image/png;base64,' + b64(shots + '/checks.png'),
  '__IMG_ROTA__': 'data:image/png;base64,' + b64(shots + '/rota.png'),
  '__IMG_FINANCES__': 'data:image/png;base64,' + b64(shots + '/finances.png'),
};
for (const [k, v] of Object.entries(assets)) html = html.split(k).join(v);
const CHECK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const SEAL = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>';
html = html.split('__CHECK__').join(CHECK).split('__SEAL__').join(SEAL);
fs.writeFileSync('landing.html', html);
const kb = (fs.statSync('landing.html').size/1024).toFixed(0);
console.log('landing.html written:', kb, 'KB');
const leftovers = (html.match(/__[A-Z_]+__/g) || []);
console.log('unreplaced placeholders:', leftovers.length ? [...new Set(leftovers)] : 'none');
