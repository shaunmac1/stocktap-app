// Film: spirits and wine — bottles, tenths and measures left. Needs mock-spirits.cjs + static.cjs.
const film = require('./filmkit.cjs');
const GIN = 'cccccccc-0000-4000-8000-000000000001', WINE = 'cccccccc-0000-4000-8000-000000000002';
film('spirits', 'Tenths for the stock sheet. Measures for you', async ({ p, has, shot, tap, key, go, show, sleep }) => {
  await go('/stocktake');
  await tap('button-new-stocktake', null, 0, 900);
  for (const id of [GIN, WINE]) await tap(`select-product-${id}`, null, 0, 200);
  await tap('button-start-stocktake', null, 0, 1500);
  await tap(`counting-product-${GIN}`, 'Gin on the back bar. Tap the line', 2.0, 900);
  if (!(await has('tenths-quick-5'))) { if (await has('button-add-entry')) await tap('button-add-entry'); }
  if (await has('button-location-loc-bar')) await tap('button-location-loc-bar');
  await tap('tenths-quick-5', 'How full is the open one? Slide it, or tap a quarter, half, three quarters', 3.0, 300);
  for (let i = 0; i < 4; i++) await tap('tenths-plus', null, 0, 150);
  await show('tenths-value'); await shot('7 tenths in the open bottle', 2.0);
  await key('2');
  await show('button-want-exact');
  await shot('2 full ones as well: 2.7 bottles. Tenths for the stock sheet, and 75 measures left to sell', 4.0);
  await shot('Tenths is by eye. Want it exact? Put the bottle on a scale', 2.8);
  await tap('button-save-entry', null, 0, 1800);
  await shot('Saved: 2 full + 7 tenths, 75 measures, and what it is worth', 3.0);
  for (const bk of ['button-back-to-products', 'button-back-to-list']) if (await has(bk)) { await tap(bk, null, 0, 800); break; }
  await tap(`counting-product-${WINE}`, null, 0, 900);
  if (!(await has('tenths-quick-7.5'))) { if (await has('button-add-entry')) await tap('button-add-entry'); }
  if (await has('button-location-loc-bar')) await tap('button-location-loc-bar');
  await tap('tenths-quick-7.5', null, 0, 300); await key('8');
  await show('button-want-exact');
  await shot('Wine counts in glasses: 8 full + three quarters = 37 glasses of 175ml', 3.6);
});
