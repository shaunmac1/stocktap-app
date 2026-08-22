const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright/index.js');
const BASE = 'http://localhost:5173';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport:{width:402,height:860} })).newPage();
  const errors=[]; p.on('pageerror',e=>errors.push(e.message));
  const shot=(n)=>p.screenshot({path:`/tmp/e2e/${n}.png`,fullPage:true}).then(()=>console.log('shot',n));

  // Mock the vision function: return 3 shifts, one name (Zizzy) unmatched.
  await p.route('**/functions/v1/parse-rota', route => route.fulfill({
    status:200, contentType:'application/json',
    body: JSON.stringify({ shifts: [
      { name:'Dave', area:'bar', day:'fri', start:'11:30', end:'17:00', until_close:false },
      { name:'Libby', area:'bar', day:'fri', start:'17:00', end:null, until_close:true },
      { name:'Zizzy', area:'kitchen', day:'fri', start:'11:30', end:'20:00', until_close:false },
    ]})
  }));

  await p.goto(`${BASE}/auth`,{waitUntil:'networkidle'});
  await p.fill('#email','owner.test+e2e@stocktap.net'); await p.fill('#password','TestPass!2926');
  await p.getByRole('button',{name:/^sign in$/i}).click(); await p.waitForTimeout(3500);
  if (await p.$('#venueName')) { await p.fill('#venueName','E2E Test Pub'); await p.getByRole('button',{name:/complete setup/i}).click(); await p.waitForTimeout(3500); }

  // add two staff
  await p.goto(`${BASE}/team`,{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  for (const [nm,rate] of [['Dave','12'],['Libby','11']]) {
    await p.getByRole('button',{name:/add a team member/i}).click(); await p.waitForTimeout(300);
    await p.getByPlaceholder('Libby').fill(nm); await p.getByPlaceholder('12.00').fill(rate);
    await p.getByRole('button',{name:/add to the team/i}).click(); await p.waitForTimeout(1400);
  }

  await p.goto(`${BASE}/rota`,{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  await p.getByText(/upload a photo of the paper rota/i).click(); await p.waitForTimeout(300);
  await p.setInputFiles('input[type=file]', '/tmp/tiny.png');
  await p.waitForTimeout(3000); await shot('40-rota-review');
  const rev = (await p.innerText('body')).replace(/\s+/g,' ');
  console.log('review has Save these shifts:', /save these shifts/i.test(rev));
  console.log('review shows pick a name (unmatched Zizzy):', /pick a name/i.test(rev));

  // Save
  await p.getByRole('button',{name:/save these shifts/i}).click(); await p.waitForTimeout(2500);
  await shot('41-after-save');
  // Jump to Friday to see saved shifts
  const fri = p.getByText(/^Fri$/);
  if (await fri.count()) { await fri.first().click(); await p.waitForTimeout(1500); }
  await shot('42-rota-friday');
  const day = (await p.innerText('body')).replace(/\s+/g,' ');
  console.log('friday shows Dave:', /Dave/.test(day), '| Libby:', /Libby/.test(day));
  console.log('friday body:', day.slice(day.indexOf('BAR')>0?day.indexOf('BAR'):0, (day.indexOf('BAR')>0?day.indexOf('BAR'):0)+180));
  console.log('PAGEERRORS:', errors.length?errors.slice(0,5):'none');
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
