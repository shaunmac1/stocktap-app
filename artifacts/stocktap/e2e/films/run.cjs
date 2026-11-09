// node run.cjs <name> [...]  — films the named how-to videos (each on a fresh mock)
const { execSync } = require('child_process');
const { film } = require('../local-mock/filmlib.cjs');
const S = require('./scripts.cjs');
(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(S);
  for (const n of names) {
    const s = S[n]; if (!s) { console.log('no script', n); continue; }
    execSync(`${s.env || ""} bash /home/claude/servers.sh ${s.mock || "mock12.cjs"}`, { stdio: 'ignore' });
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      if (attempt) execSync(`${s.env || ""} bash /home/claude/servers.sh ${s.mock || "mock12.cjs"}`, { stdio: 'ignore' });
      try { ok = await film(n, s.title, s.run, s.opts || {}); } catch (e) { console.log(`RETRY ${n}: ${e.message.split('\n')[0]}`); }
    }
  }
})();
