const http=require('http'), https=require('https'), fs=require('fs'), path=require('path');
const ROOT='/tmp/e2e-dist', TARGET='nyqohgaxvqypdvdmpyix.supabase.co';
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
const PROXY=/^\/(auth|rest|rpc|functions|storage|realtime)\//;
http.createServer((req,res)=>{
  if(PROXY.test(req.url)){
    const chunks=[]; req.on('data',c=>chunks.push(c)); req.on('end',()=>{
      const body=Buffer.concat(chunks); const headers={...req.headers,host:TARGET}; delete headers['origin']; delete headers['referer'];
      const pr=https.request({hostname:TARGET,port:443,path:req.url,method:req.method,headers},pp=>{res.writeHead(pp.statusCode,pp.headers);pp.pipe(res);});
      pr.on('error',e=>{res.writeHead(502);res.end('proxy '+e.message);}); if(body.length)pr.write(body); pr.end();
    }); return;
  }
  let u=decodeURIComponent(req.url.split('?')[0]); let fp=path.join(ROOT,u);
  if(u==='/'||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()) fp=path.join(ROOT,'index.html');
  try{res.writeHead(200,{'Content-Type':TYPES[path.extname(fp)]||'application/octet-stream'});res.end(fs.readFileSync(fp));}catch(e){res.writeHead(404);res.end('nf');}
}).listen(5173,()=>console.log('combined on 5173'));
