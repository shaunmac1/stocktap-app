const http = require('http');
const https = require('https');
const TARGET = 'nyqohgaxvqypdvdmpyix.supabase.co';
const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,range',
    'Access-Control-Expose-Headers': 'content-range,content-profile',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const headers = { ...req.headers, host: TARGET };
    delete headers['origin']; delete headers['referer'];
    const preq = https.request({ hostname: TARGET, port: 443, path: req.url, method: req.method, headers }, pres => {
      res.writeHead(pres.statusCode, { ...pres.headers, ...cors });
      pres.pipe(res);
    });
    preq.on('error', e => { res.writeHead(502, cors); res.end('proxy error: ' + e.message); });
    if (body.length) preq.write(body);
    preq.end();
  });
});
server.listen(8899, () => console.log('sbproxy on 8899 ->', TARGET));
