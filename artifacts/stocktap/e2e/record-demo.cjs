const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE='http://localhost:5173';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, recordVideo:{ dir:'/tmp/vid', size:{width:390,height:844} } });
  const p=await ctx.newPage();
  const cap=(t)=>p.evaluate((t)=>{let el=document.getElementById('__cap');if(!el){el=document.createElement('div');el.id='__cap';el.style.cssText='position:fixed;left:12px;right:12px;bottom:16px;z-index:99999;background:rgba(16,22,19,.93);color:#fff;font:600 15px/1.35 Inter,system-ui,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.3);text-align:center';document.body.appendChild(el);}el.textContent=t;},t);
  const clearCap=()=>p.evaluate(()=>{const el=document.getElementById('__cap');if(el)el.remove();});
  async function card(title,sub,ms){await p.evaluate(({title,sub})=>{let el=document.getElementById('__card');if(!el){el=document.createElement('div');el.id='__card';el.style.cssText='position:fixed;inset:0;z-index:100000;background:linear-gradient(160deg,#1f2a25,#2e7d46);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:Inter,system-ui,sans-serif;text-align:center;padding:32px';document.body.appendChild(el);}el.innerHTML='<div style="font-size:32px;font-weight:800">'+title+'</div><div style="font-size:16px;opacity:.92;max-width:300px">'+sub+'</div>';},{title,sub});await sleep(ms);}
  const hideCard=()=>p.evaluate(()=>{const el=document.getElementById('__card');if(el)el.remove();});
  async function go(path){ await p.evaluate((pt)=>{window.history.pushState({},'',pt);window.dispatchEvent(new PopStateEvent('popstate'));},path); await sleep(1500); await p.evaluate(()=>window.scrollTo(0,0)); await sleep(400); }
  async function scrollTo(px){ await p.evaluate(y=>window.scrollTo({top:y,behavior:'smooth'}),px); await sleep(1500); }

  await p.goto(`${BASE}/auth`,{waitUntil:'domcontentloaded'});
  await p.waitForSelector('#email'); await p.fill('#email','demo+tealfarm@stocktap.net'); await p.fill('#password','DemoPass!2926');
  await p.getByRole('button',{name:/^sign in$/i}).click();
  await p.waitForSelector('text=Reports',{timeout:20000}); await sleep(1200);

  await card('StockTap','Your whole pub, in one app',2600); await hideCard();

  await go('/daily-board'); await cap('Log the night’s takings in seconds'); await sleep(2600);
  await scrollTo(340); await cap('Compared instantly to last week and the last 4 same days'); await sleep(3000);
  await scrollTo(720); await cap('Spot the trend and whether the entertainment paid off'); await sleep(3000);

  await go('/team'); await clearCap(); await cap('Your wage bill builds live against the take'); await sleep(3000);
  await scrollTo(360); await cap('Staff clock in on their phones — they never see the money'); await sleep(3000);

  await go('/checks'); await clearCap(); await cap('Daily compliance checks — the record your EHO wants'); await sleep(2800);
  await scrollTo(300); await cap('Anything out of range is flagged on the spot'); await sleep(3000);
  await scrollTo(720); await cap('Opening, closing and cleaning, ticked as you go'); await sleep(2800);

  await go('/rota'); await clearCap(); await cap('Build the rota by day — bar and kitchen'); await sleep(2800);
  await cap('Or snap the paper rota and let AI read it in'); await sleep(2800);

  await go('/library'); await clearCap(); await cap('Weigh a bottle — every weigh sharpens the shared database'); await sleep(3000);

  await clearCap(); await card('StockTap','Takings · Team · Checks · Rota · Stock — one login',3200); await hideCard();
  await p.close(); await ctx.close(); await b.close(); console.log('done');
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
