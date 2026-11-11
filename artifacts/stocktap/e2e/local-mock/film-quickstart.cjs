// Film: a brand-new pub's first number in two minutes. Needs mock-newpub.cjs + static.cjs.
const film = require('./filmkit.cjs');
film('quickstart', 'No scale. No setting up', async ({ p, has, shot, tap, go, show, sleep }) => {
  await go('/');
  await tap('button-quick-five', 'Brand new to StockTap? Start here', 2.6, 2500);
  await shot('Tap the bottles you can see on your back bar', 2.6);
  let first = true;
  for (const id of ['q2', 'q3', 'q4', 'q5', 'q8']) { await tap(`quick-pick-${id}`, first ? 'No typing. Just tap' : null, 1.8, 700); first = false; }
  await show('quick-pick-q2'); await shot('Five picked. That is all the setting up there is', 2.6);
  await tap('button-first-count-start', 'Start counting', 1.8, 2500);
  const prods = await (await fetch('http://localhost:8899/rest/v1/products?select=*')).json();
  let n = 0;
  for (const pr of prods) {
    for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, null, 0, 600); break; }
    await tap(`counting-product-${pr.id}`, n === 0 ? 'Tap a bottle' : null, 1.6, 800);
    if (!(await has('tenths-quick-5')) && (await has('button-add-entry'))) await tap('button-add-entry', null, 0, 600);
    if (await has('button-location-loc-bar')) await tap('button-location-loc-bar', null, 0, 600);
    await tap('tenths-quick-5', n === 0 ? 'How full is it? By eye. No scale needed' : null, 2.8, 300);
    if (n === 0) { await show('button-want-exact'); await shot('Half a bottle: 14 measures left to sell', 2.8); }
    await tap('button-save-entry', n === 0 ? 'Save, next bottle' : null, 1.6, 1500);
    n++;
  }
  for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, null, 0, 600); break; }
  await tap('button-review-stocktake', 'Five bottles done. Review', 1.8, 1200);
  await shot('Your first number: what is on the shelf, and what it takes over the bar', 4.2);
});
