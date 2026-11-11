// Film: set every case size on one screen. Needs mock-packaged.cjs + static.cjs.
const film = require('./filmkit.cjs'); const B = n => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
film('casesizes', 'One screen, every line', async ({ shot, tap, go, show }) => {
  await go('/library');
  await show('banner-set-case-sizes');
  await tap('banner-set-case-sizes', 'Bottles and cans with no case size? One banner in your Library', 2.8, 900);
  await shot('Every line on one screen, with the usual size already picked', 3.0);
  await tap(`case-chip-${B(2)}-12`, 'Yours come in 12s? Tap it', 2.2, 400);
  await tap(`case-chip-${B(3)}-1`, 'Crisps? Count them one by one', 2.2, 400);
  await tap('button-save-case-sizes', 'One button sets the lot', 2.2, 1500);
  await shot('Done. Now you count full cases + loose, and orders read in cases', 3.2);
});
