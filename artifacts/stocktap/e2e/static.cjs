const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/tmp/e2e-dist';
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json' };
http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(ROOT, url);
  if (url === '/' || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    // static asset that exists?
    if (url !== '/' && fs.existsSync(fp) && fs.statSync(fp).isFile()) {}
    else fp = path.join(ROOT, 'index.html'); // SPA fallback
  }
  try {
    const data = fs.readFileSync(fp);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
}).listen(5173, () => console.log('static on 5173 ->', ROOT));
