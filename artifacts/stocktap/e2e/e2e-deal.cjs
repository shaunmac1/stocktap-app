const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE='http://localhost:5173'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}); const p=await ctx.newPage();
  const bad=[]; p.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url())});
  await p.goto(`${BASE}/auth`,{waitUntil:'domcontentloaded'});await p.waitForSelector('#email');
  await p.fill('#email','demo+tealfarm@stocktap.net');await p.fill('#password','DemoPass!2926');
  await p.getByRole('button',{name:/^sign in$/i}).click();await p.waitForSelector('text=Reports',{timeout:20000});await sleep(800);
  await p.evaluate(()=>{history.pushState({},'','/settings?tab=offers');dispatchEvent(new PopStateEvent('popstate'))});await sleep(1800);
  // click Offers tab if present
  try{ await p.getByRole('tab',{name:/offers/i}).click({timeout:3000}); await sleep(600);}catch(e){}
  await p.locator('[data-testid="input-offer-name"]').first().fill('Double up for £2'); await sleep(300);
  await p.locator('[data-testid="button-create-offer"]').first().click({force:true}); await sleep(1500);
  const bodyHas = await p.evaluate(()=>document.body.innerText.includes('Double up for £2') && document.body.innerText.includes('Always on'));
  await p.screenshot({path:'/tmp/shots/deal.png'});
  console.log("BADURLS", JSON.stringify(bad));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
