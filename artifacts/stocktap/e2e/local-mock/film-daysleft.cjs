// Film: days left, what to order, and today's check. Needs mock-forecast.cjs + static.cjs.
const film = require('./filmkit.cjs'); const B = n => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
film('daysleft', 'Never run out. Never over-order', async ({ p, shot, tap, go, show, sleep }) => {
  await go('/library');
  await show(`line-forecast-${B(2)}`);
  await shot('Every line tells you how long it lasts and what to order', 3.2);
  await show(`line-forecast-${B(1)}`);
  await shot('Worked out from your own counts and deliveries. Never a guess', 3.0);
  await show(`line-forecast-${B(3)}`);
  await shot('And it tells you what NOT to buy: none sold, don\'t reorder', 3.4);
  await show('filter-chip-to-order');
  await tap('filter-chip-to-order', 'One tap: just what needs ordering', 2.2, 900);
  await shot('Soonest to run out first, in cases', 2.8);
  await go('/orders');
  await shot('The order list agrees, line for line', 2.6);
  await go('/spot-check');
  await tap('button-todays-check', 'Today\'s check: the lines worth two minutes today, and why', 3.0, 700);
  await shot('Tick them in one tap. Add or drop any by hand', 2.8);
});
