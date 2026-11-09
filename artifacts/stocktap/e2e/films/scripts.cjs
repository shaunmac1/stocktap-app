// How-to video scripts. Each runs on a fresh mock (Demo Bar). Captions: short, plain, true.
const P = id => `aaaaaaaa-0000-4000-8000-00000000000${id}`;
const B = k => `bbbbbbbb-0000-4000-8000-0000000000${k}`;
const role = (f, name) => f.p.getByRole('button', { name }).first();
const txt = (f, t) => f.p.getByText(t, { exact: false }).first();

module.exports = {
  'library-add-from-catalogue': {
    title: 'Library', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/library');
      await f.tap('[data-testid="button-open-catalogue"]', 'Add your lines from the UK pub catalogue', 2.2, 1200);
      await f.fill('[data-testid="input-global-catalogue-search"]', 'gin'); await f.sleep(1500);
      await f.shot('Search by name', 1.8);
      const items = f.p.locator('[data-testid^="catalogue-item-"]');
      await f.tap(items.nth(0), 'Tap every line you sell', 1.4);
      await f.tap(items.nth(1), 'Tap every line you sell', 1.2);
      await f.tap('[data-testid="button-add-catalogue-products"]', 'Add them in one go', 1.8, 2200);
      await f.noToast();
      await f.fill('[data-testid="input-library-search"]', "Hendrick"); await f.sleep(900);
      await f.shot('In your library, with size and bottle weights', 2.8);
    },
  },

  'library-add-product': {
    title: 'Library', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/library');
      await f.tap('[data-testid="button-add-product-fab"]', 'Not in the catalogue? Add it yourself', 2.0, 1200);
      await f.fill('[data-testid="input-product-name"]', 'Fever-Tree Tonic 200ml'); await f.sleep(900);
      await f.shot('Type the name: size and type fill in', 2.4);
      await f.scrollTo(role(f, /^Add Product$/));
      await f.shot('Check the category and how you count it', 2.2);
      await f.tap(role(f, /^Add Product$/), 'Add Product', 1.6, 1500);
      await f.noToast();
      await f.fill('[data-testid="input-library-search"]', 'Fever'); await f.sleep(800);
      await f.shot('Ready to count', 2.2);
    },
  },

  'library-weigh-bottle': {
    title: 'Library', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/library');
      await f.shot('Needs Weighing? It has no bottle weights yet', 2.2);
      await f.tap(`[data-testid="button-weigh-${P(1)}"]`, 'Tap Weigh', 1.6, 1000);
      await f.p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('weigh a full bottle to set up tracking'))?.click()); await f.sleep(900);
      await f.shot('Put it on the kitchen scale', 1.8);
      await f.keys('1094', '[role="dialog"]'); await f.sleep(400);
      await f.tap(role(f, /Save as Full Weight/), 'Type the grams and save', 2.0, 1500);
      await f.noToast();
      await f.shot('Weighed. Every count after is to the gram', 2.8);
    },
  },

  'library-prices-and-pars': {
    title: 'Library', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/library');
      await f.tap('[data-testid="button-bulk-price-editor"]', 'Prices and par levels, all on one screen', 2.2, 1200);
      await f.fill(`[data-testid="input-cost-${P(3)}"]`, '11.50');
      await f.shot('Cost price, ex VAT', 1.8);
      await f.fill(`[data-testid="input-sell-${P(3)}"]`, '3.40');
      await f.shot('Sell price per measure', 1.8);
      await f.fill(`[data-testid="input-par-${P(3)}"]`, '3');
      await f.fill(`[data-testid="input-par-${P(1)}"]`, '4');
      await f.shot('Par level: how many you want on the shelf', 2.4);
      await f.tap('[data-testid="button-save-prices"]', 'Save them all', 1.8, 1500);
      await f.go('/reports?tab=order', 3000);
      await f.shot('Below par? It shows in the order guide', 2.8);
    },
  },

  'stocktake-start': {
    title: 'Stocktake', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/stocktake');
      await f.tap('[data-testid="button-stocktake-tips"]', 'New to it? Tap here first', 1.6, 600);
      await f.shot('How a count works, and weigh or tenths', 3.2);
      await f.tap('[data-testid="button-new-stocktake"]', 'Start a stocktake', 1.6, 900);
      await f.shot('Every line says how it gets counted', 2.6);
      await f.fill('[data-testid="input-stocktake-search"]', 'gordons');
      await f.shot('Search finds Gordon\'s with or without the apostrophe', 2.4);
      await f.fill('[data-testid="input-stocktake-search"]', '');
      for (const id of [P(5), P(2), B('07'), B('04')]) await f.click(`[data-testid="select-product-${id}"]`, 250);
      await f.shot('Tonight: just the lines you pick', 2.0);
      await f.tap('[data-testid="button-start-stocktake"]', 'Start counting', 1.6, 1500);
      await f.shot('In the order you walk it: draught first', 2.4);
      await f.tap(`[data-testid="counting-product-${P(5)}"]`, 'Tap a line', 1.4, 700);
      await f.tap('[data-testid="button-add-entry"]', 'Count it', 1.4, 800);
      await f.keys('38', '[data-testid="add-entry-sheet"]'); await f.sleep(300);
      await f.shot('38 pints left in the open keg', 2.2);
      await f.sheetScroll(); await f.shot('Full kegs underneath, value as you go', 2.2); await f.sheetScroll(undefined, 'top');
      await f.tap('[data-testid="button-save-entry"]', 'Save', 1.2, 1000);
      await f.tap('[data-testid="button-next-product"]', 'Next line, one tap', 1.8, 900);
      await f.shot('Straight into the next one', 2.2);
    },
  },

  'stocktake-count-units': {
    title: 'Stocktake', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/stocktake');
      await f.click('[data-testid="button-new-stocktake"]', 800);
      for (const id of [B('04'), B('05')]) await f.click(`[data-testid="select-product-${id}"]`, 250);
      await f.click('[data-testid="button-start-stocktake"]', 1500);
      await f.tap(`[data-testid="counting-product-${B('04')}"]`, 'Cans and bottles: just count them', 2.0, 700);
      await f.click('[data-testid="button-add-entry"]', 800);
      if (await f.exists('[data-testid="button-location-unspecified"]')) await f.click('[data-testid="button-location-unspecified"]', 800);
      await f.shot('Type how many', 1.6);
      await f.keys('24', '[data-testid="add-entry-sheet"]'); await f.sleep(400);
      await f.shot('24 cans, and what they are worth', 2.4);
      await f.tap('[data-testid="button-save-entry"]', 'Save', 1.4, 1000);
      await f.tap('[data-testid="button-next-product"]', 'Next line', 1.6, 900);
      await f.keys('31', '[data-testid="add-entry-sheet"]'); await f.sleep(300);
      await f.shot('31 Fruit Shoots', 2.0);
      await f.tap('[data-testid="button-save-entry"]', 'Save', 1.4, 1000);
      await f.shot('Last one? Review and close from here', 2.4);
    },
  },

  'stocktake-review-close': {
    title: 'Stocktake', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/stocktake');
      await f.click('[data-testid="button-new-stocktake"]', 800);
      for (const id of [B('04'), B('05'), B('0a')]) await f.click(`[data-testid="select-product-${id}"]`, 250);
      await f.click('[data-testid="button-start-stocktake"]', 1500);
      await f.click(`[data-testid="counting-product-${B('04')}"]`, 600);
      await f.click('[data-testid="button-add-entry"]', 700);
      for (const n of ['24', '31', '40']) {
        await f.keys(n, '[data-testid="add-entry-sheet"]'); await f.click('[data-testid="button-save-entry"]', 900);
        if (await f.exists('[data-testid="button-next-product"]')) await f.click('[data-testid="button-next-product"]', 700);
      }
      await f.tap('[data-testid="button-all-counted-review"]', 'All counted. Review it', 1.8, 1200);
      await f.shot('Grouped by category, with the value of each', 2.6);
      await f.shot('No cost price on a line? It tells you, so the total isn\'t short by surprise', 3.0);
      await f.tap(`[data-testid="summary-line-${B('04')}"]`, 'Something wrong? Tap the line to fix it', 2.0, 800);
      await f.click('[data-testid="button-back-to-products"]', 600);
      await f.click('[data-testid="button-review-stocktake"]', 900);
      await f.tap('[data-testid="button-finish-stocktake"]', 'Close the stocktake', 1.8, 2000);
      await f.noToast();
      await f.shot('Saved. Count again next week to see what moved', 2.6);
    },
  },

  'stocktake-casks': {
    title: 'Stocktake', mock: 'mockfilm.cjs', run: async f => {
      const V = (await (await fetch('http://localhost:8899/rest/v1/venues?select=*')).json())[0].id;
      const CASK = 'cccccccc-0000-4000-8000-000000000001';
      await fetch('http://localhost:8899/rest/v1/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: CASK, venue_id: V, name: 'Ale Doom Bar', type: 'packaged', unit: 'count', category: 'draught_ale', counting_method: 'dipstick', container_type: 'cask', container_l: 40.9, cost_price: 94.07, created_at: new Date().toISOString() }) });
      await f.go('/stocktake');
      await f.click('[data-testid="button-new-stocktake"]', 800);
      await f.click(`[data-testid="select-product-${CASK}"]`, 250);
      await f.click('[data-testid="button-start-stocktake"]', 1500);
      await f.shot('Cask ale: pints on the dip rod', 2.2);
      await f.tap(`[data-testid="counting-product-${CASK}"]`, 'Tap the cask', 1.4, 700);
      await f.click('[data-testid="button-add-entry"]', 800);
      await f.shot('Dip it, read the pints off the rod', 2.4);
      await f.keys('30', '[data-testid="add-entry-sheet"]'); await f.sleep(300);
      await f.sheetScroll(); await f.shot('30 pints = 3 gallons 6 pints, and the value', 2.6);
      await f.sheetScroll(undefined, 'top');
      await f.tap('[data-testid="button-dip-mode-mm"]', 'Use a ruler in mm instead?', 1.8, 600);
      await f.shot('Dip a full cask once and type the depth. Then mm works too', 3.0);
      await f.tap('[data-testid="button-dip-mode-pints"]', 'Back to pints', 1.2, 500);
      await f.keys('30', '[data-testid="add-entry-sheet"]'); await f.sleep(300);
      await f.tap('[data-testid="button-save-entry"]', 'Save', 1.4, 1000);
      await f.shot('Counted, in gallons and pints', 2.2);
    },
  },

  'stocktake-weigh-setup': {
    title: 'Stocktake', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/stocktake');
      await f.click('[data-testid="button-new-stocktake"]', 800);
      await f.click(`[data-testid="select-product-${P(1)}"]`, 250);
      await f.click('[data-testid="button-start-stocktake"]', 1500);
      await f.tap(`[data-testid="counting-product-${P(1)}"]`, 'A bottle you\'ve never weighed', 1.8, 700);
      await f.click('[data-testid="button-add-entry"]', 800);
      await f.shot('Put one full sealed bottle on the scale, once', 2.6);
      await f.keys('1150', '[data-testid="full-bottle-setup"]'); await f.sleep(300);
      await f.tap('[data-testid="button-save-full-weight"]', 'Save it', 1.4, 1300);
      await f.noToast();
      await f.shot('Now weigh the open one. Pourer off if you can', 2.6);
      await f.keys('800', '[data-testid="add-entry-sheet"]'); await f.sleep(300);
      await f.sheetScroll(); await f.shot('To the ml: what\'s left, measures and value', 2.6); await f.sheetScroll(undefined, 'top');
      await f.tap('[data-testid="button-save-entry"]', 'Save', 1.4, 1000);
      await f.shot('Next time it\'s straight to the scale', 2.2);
    },
  },

  'stocktake-spots': {
    title: 'Stocktake', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/stocktake');
      await f.click('[data-testid="button-new-stocktake"]', 800);
      for (const id of [B('04'), B('05')]) await f.click(`[data-testid="select-product-${id}"]`, 250);
      await f.click('[data-testid="button-start-stocktake"]', 1500);
      await f.click(`[data-testid="counting-product-${B('04')}"]`, 700);
      await f.click('[data-testid="button-add-entry"]', 800);
      await f.tap('[data-testid="button-change-spot"]', 'Counting in more than one spot?', 1.8, 600);
      await f.tap('[data-testid="button-add-new-location"]', 'Add one', 1.2, 400);
      await f.fill('[data-testid="input-new-count-location-inline"]', 'Bar');
      await f.tap('[data-testid="button-save-new-location"]', 'Bar', 1.2, 800);
      await f.keys('12', '[data-testid="add-entry-sheet"]'); await f.sleep(300);
      await f.tap('[data-testid="button-save-entry"]', '12 behind the bar', 1.6, 1000);
      await f.tap('[data-testid="button-add-entry"]', 'Some in the cellar too', 1.6, 700);
      await f.tap('[data-testid="button-change-spot"]', 'Change spot', 1.2, 500);
      await f.click('[data-testid="button-add-new-location"]', 300);
      await f.fill('[data-testid="input-new-count-location-inline"]', 'Cellar');
      await f.click('[data-testid="button-save-new-location"]', 800);
      await f.keys('24', '[data-testid="add-entry-sheet"]'); await f.sleep(300);
      await f.tap('[data-testid="button-save-entry"]', '24 in the cellar', 1.6, 1000);
      await f.shot('Added up for you: 36', 2.6);
      await f.tap('[data-testid="button-next-product"]', 'Next line stays in the cellar', 2.0, 900);
      await f.shot('No picking the spot every time', 2.2);
    },
  },

  'daily-board': {
    title: 'Daily Board', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/daily-board');
      await f.shot('The Daily Board: one number a night', 2.2);
      await f.fill('[data-testid="input-daily-total"]', '2140');
      await f.shot('Type what you took tonight', 1.8);
      await f.shot('Against last Wednesday, and the average of the last 4', 2.6);
      await f.scrollTo(f.p.getByText(/Same Wednesday 3 years ago|3 years ago/).first());
      await f.shot('The same night 1, 2 and 3 years ago', 2.6);
      await f.scrollTo('[data-testid="button-save-day"]');
      await f.tap('[data-testid="button-save-day"]', 'Save the day', 1.4, 1500);
      await f.noToast();
      await f.scrollTo(f.p.getByText('Last 14 days'));
      await f.shot('The last 14 nights at a glance', 2.2);
      const bars = f.p.locator('[data-testid^="trend-bar-"]');
      await f.tap(bars.nth(7), 'Tap a bar to open that night', 1.6, 700, true);
      await f.top();
      await f.shot('Any night, with its own comparisons', 2.4);
    },
  },

  'checks-temperatures': {
    title: 'Checks', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/checks');
      await f.shot('Daily checks, on the staff phones', 2.2);
      await f.tap(role(f, /Add the usual temperature points/), 'Add the usual temperature points', 1.8, 1500);
      await f.noToast();
      await f.shot('Fridges, freezers, hot holding, the cellar, with safe ranges', 2.4);
      await f.tap(role(f, /Add the standard checklists/), 'Add the standard checklists', 1.8, 1500);
      await f.noToast();
      await f.scrollTo(f.p.getByText(/Opening checks/i).first(), 'start');
      await f.shot('Opening, closing and cleaning, ready to tick', 2.4);
      await f.top();
      const inp = f.p.locator('input[placeholder="°C"]').first();
      await f.fill(inp, '4');
      await f.tap(role(f, /^Log$/), 'Type the reading and log it', 1.8, 1200);
      await f.p.locator('input[placeholder="°C"]').first().blur();
      await f.shot('In range, with the time and who logged it', 2.4);
    },
  },

  'checks-manage': {
    title: 'Checks', mock: 'mockfilm.cjs', env: 'CHECKS=1', run: async f => {
      await f.go('/checks');
      await f.scrollTo('[data-testid="button-add-appliance"]');
      await f.tap('[data-testid="button-add-appliance"]', 'Got another fridge? Add it', 1.6, 600);
      await f.fill('[data-testid="input-appliance-name"]', 'Wine fridge');
      await f.fill('[data-testid="input-appliance-min"]', '12');
      await f.fill('[data-testid="input-appliance-max"]', '5');
      await f.p.locator('[data-testid="input-appliance-max"]').blur();
      await f.shot('Range the wrong way round? It tells you', 2.4);
      await f.fill('[data-testid="input-appliance-min"]', '5');
      await f.fill('[data-testid="input-appliance-max"]', '12');
      await f.p.locator('[data-testid="input-appliance-max"]').blur();
      await f.tap('[data-testid="button-save-appliance"]', 'Add it', 1.4, 1200);
      await f.top();
      const edit = f.p.locator('[data-testid^="edit-appliance-"]').nth(1);
      await f.tap(edit, 'Change a safe range any time', 1.6, 600);
      await f.fill('[data-testid="input-appliance-max"]', '8');
      await f.p.locator('[data-testid="input-appliance-max"]').blur();
      await f.shot('Past readings keep the result they were logged with', 2.4);
      await f.tap('[data-testid="button-save-appliance"]', 'Save', 1.2, 1200);
      await f.top();
      const rm = f.p.locator('[data-testid^="remove-appliance-"]').nth(2);
      await f.tap(rm, 'Taking one off?', 1.4, 400);
      await f.shot('It asks first. Tap again to remove', 2.2);
      await f.tap(f.p.locator('[data-testid^="remove-appliance-"]').nth(2), 'Removed. Its history is kept', 1.8, 1200);
      await f.noToast();
      await f.scrollTo('[data-testid="button-add-missing-appliances"]');
      await f.shot('Want the usual one back? One tap', 2.2);
    },
  },

  'checks-past-day': {
    title: 'Checks', mock: 'mockfilm.cjs', env: 'CHECKS=1', run: async f => {
      await f.go('/checks');
      await f.tap('button[aria-label="Previous day"]', 'Missed one yesterday?', 1.6, 1200, true);
      await f.shot('Go back a day, or tap the date for any day', 2.4);
      const card = f.p.locator('div.rounded-xl').filter({ hasText: 'Bottle fridge' }).filter({ has: f.p.locator('input[placeholder="°C"]') }).last();
      await f.fill(card.locator('input'), '3');
      await f.tap(card.getByRole('button', { name: 'Log' }), 'Log it', 1.2, 1200);
      await card.locator('input').blur();
      await f.scrollTo(card);
      await f.shot('Marked as filled in later, so your records stay honest', 3.0);
      await f.top();
      await f.tap('[data-testid="button-checks-today"]', 'Back to today', 1.4, 900);
    },
  },

  'reports-tour': {
    title: 'Reports', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/reports', 3200);
      await f.shot('Valuation: what your stock is worth', 2.4);
      for (const [t, cap] of [['GP Analysis', 'GP per line, from your prices'], ['By Location', 'Stock by location'], ['COGS', 'Cost of what you sold'], ['Insights', 'Things worth a look'], ['Inventory', 'Every line, every count']]) {
        const tab = f.p.getByRole('tab', { name: t }).first();
        if (await tab.count()) { await f.tap(tab, cap, 2.2, 1400, true); }
      }
      await f.tap(f.p.getByRole('tab', { name: 'Order' }).first(), 'Order guide from your par levels', 2.0, 1400, true);
      await f.shot('Order guide from your par levels', 2.4);
    },
  },

  'finances-add': {
    title: 'Finances', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/finances');
      await f.shot('Finances: what came in, what went out', 2.2);
      await f.tap('[data-testid="button-finance-add"]', 'Add a bill or takings', 1.6, 900);
      await f.fill('[data-testid="input-entry-description"]', 'Carlsberg Britvic delivery');
      await f.fill('[data-testid="input-entry-amount"]', '1284.50');
      await f.shot('What it is and how much', 2.2);
      await f.tap('[data-testid="button-entry-save"]', 'Save', 1.4, 1200);
      await f.noToast();
      await f.shot('Payable, VAT and net, all in one place', 2.6);
    },
  },

  'settings-locations': {
    title: 'Settings', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/settings');
      await f.shot('Your counting areas', 2.0);
      await f.fill('[data-testid="input-new-location"]', 'Cellar');
      await f.tap('[data-testid="button-add-location"]', 'Add the cellar, back bar, function room', 2.2, 3000);
      await f.noToast();
      await f.shot('Count each area on its own', 2.2);
    },
  },
};
Object.assign(module.exports, {
  'team-and-clock': {
    title: 'Team & wages', mock: 'mockfilm.cjs', run: async f => {
      const role = (n) => f.p.getByRole('button', { name: n }).first();
      await f.go('/team');
      await f.shot('Your team, and tonight’s wages', 2.2);
      await f.scrollTo(role(/Add a team member/));
      await f.tap(role(/Add a team member/), 'Add someone once', 1.6, 700);
      await f.fill('input[placeholder="Libby"]', 'Casey');
      await f.fill('input[placeholder="12.00"]', '12.21');
      await f.shot('Name and hourly rate', 2.0);
      await f.tap(role(/Add to the team/), 'Add to the team', 1.4, 1500);
      await f.noToast(); await f.top();
      await f.shot('Tap a name to clock them in', 2.2);
      const alex = f.p.getByRole('button', { name: /Alex/ }).first();
      await f.tap(alex, 'Alex clocks in', 1.6, 1500);
      await f.noToast(); await f.top();
      await f.shot('Wages build up live against the take', 2.6);
    },
  },
  'rota': {
    title: 'Rota', mock: 'mockfilm.cjs', run: async f => {
      const role = (n) => f.p.getByRole('button', { name: n }).first();
      await f.go('/rota');
      await f.shot('The rota: bar and kitchen, day by day', 2.2);
      await f.tap(role(/Add to bar/), 'Add a shift to the bar', 1.6, 800);
      await f.shot('Who, where and when', 2.0);
      const preset = f.p.locator('button', { hasText: /Evening|Night|Close/ }).first();
      if (await preset.count()) await f.tap(preset, 'Quick fill the usual times', 1.8, 500);
      await f.tap(role(/^Add shift$/), 'Add shift', 1.4, 1500);
      await f.noToast();
      await f.shot('Copy last week onto this week in one tap', 2.6);
    },
  },
});
Object.assign(module.exports, {
  'ledger-wastage': {
    title: 'Stock movements', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/ledger');
      await f.shot('Stock movements: breakages, spills, transfers', 2.2);
      await f.tap('[data-testid="button-add-movement"]', 'Record one', 1.4, 900);
      const combos = f.p.getByRole('combobox');
      await f.tap(f.p.getByRole('button', { name: /Wastage/ }).last(), 'Wastage', 1.4, 600, true);
      await f.tap(combos.nth(0), 'Which line', 1.4, 600, true);
      await f.tap(f.p.getByRole('option', { name: /Captain Morgan/ }), 'Captain Morgan', 1.2, 600, true);
      await f.fill('input[placeholder="e.g. 700"]', '700');
      await f.shot('A dropped bottle: 700ml', 1.8);
      const loss = f.p.getByRole('combobox').last();
      await f.tap(loss, 'Why', 1.2, 600, true);
      await f.tap(f.p.getByRole('option', { name: 'Breakage' }), 'Breakage', 1.2, 600, true);
      await f.tap(f.p.getByRole('button', { name: 'Record Movement' }).last(), 'Record it', 1.6, 1500);
      await f.noToast();
      await f.shot('Logged, so it doesn’t show as a loss at the stocktake', 2.8);
    },
  },
  'home-tour': {
    title: 'Home', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/');
      await f.shot('Home: your stock value and GP at a glance', 2.6);
      await f.scrollTo('[data-testid="button-home-stocktake"]');
      await f.shot('Start a stocktake, spot check or delivery from here', 2.6);
      await f.scrollTo('[data-testid="button-home-orders"]');
      await f.shot('Stock & Orders: what to order', 2.2);
      await f.p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await f.sleep(500);
      await f.shot('Your latest counts, newest first', 2.4);
    },
  },
});
Object.assign(module.exports, {
  'stocktake-postmix': {
    title: 'Stocktake', mock: 'mockfilm.cjs', run: async f => {
      const PM = 'bbbbbbbb-0000-4000-8000-000000000009';
      await f.go('/stocktake');
      await f.click('[data-testid="button-new-stocktake"]', 800);
      await f.click(`[data-testid="select-product-${PM}"]`, 250);
      await f.click('[data-testid="button-start-stocktake"]', 1500);
      await f.tap(`[data-testid="counting-product-${PM}"]`, 'Postmix', 1.4, 700);
      await f.click('[data-testid="button-add-entry"]', 800);
      if (await f.exists('[data-testid="button-location-unspecified"]')) await f.click('[data-testid="button-location-unspecified"]', 800);
      await f.shot('Count it in litres of drink, like your stocktaker', 2.4);
      await f.keys('100', '[data-testid="add-entry-sheet"]'); await f.sleep(500);
      await f.sheetScroll(); await f.shot('100 litres of drink = 1.19 boxes, and the value', 2.6); await f.sheetScroll(undefined, 'top');
      if (await f.exists('[data-testid="button-postmix-mode-boxes"]')) {
        await f.tap('[data-testid="button-postmix-mode-boxes"]', 'Or count boxes instead', 1.8, 600);
        await f.keys('C', '[data-testid="add-entry-sheet"]'); await f.keys('1.5', '[data-testid="add-entry-sheet"]'); await f.sleep(400);
        await f.sheetScroll(); await f.shot('1.5 boxes = 126 litres of drink', 2.6);
      }
      await f.tap('[data-testid="button-save-entry"]', 'Save', 1.4, 1000);
      await f.shot('Set each box size and yield once in the Library', 2.6);
    },
  },
});

// ── Batch 2: every remaining screen ─────────────────────────────────────────
const byText = (f, t) => f.p.getByText(t, { exact: false }).first();
const tab = (f, name) => f.p.getByRole('tab', { name }).first();
Object.assign(module.exports, {
  'order-list-explained': {
    title: 'Stock & Orders', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/orders', 3500); await f.noToast();
      await f.shot('What to order, worked out from your counts', 2.6);
      await f.scrollTo('[data-testid="order-group-out"], [data-testid="order-group-low"]', 'start');
      await f.shot('Out now and running low come first', 2.4);
      await f.scrollTo('[data-testid^="order-row-"]', 'start');
      await f.shot('Stock now, what it sells a week, how long it lasts', 2.8);
      const plus = f.p.locator('[data-testid^="qty-plus-"]').first();
      await f.tap(plus, 'Tap + or − to change the amount', 1.8, 500);
      await f.top(); await f.scrollTo('[data-testid="input-cover"]');
      await f.p.locator('[data-testid="input-cover"]').fill('14'); await f.sleep(600);
      await f.shot('Order for more days: the list grows', 2.4);
      await f.tap('[data-testid="busy-25"]', 'Busy weekend coming? Add 25%', 1.8, 600);
      await f.p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await f.sleep(400);
      if (await f.exists('[data-testid="order-covered"]')) {
        await f.tap('[data-testid="order-covered"] summary', 'Enough in already? It says so. Nothing goes missing', 2.2, 500, true);
        await f.scrollTo('[data-testid="order-covered"]', 'start');
        await f.shot('Every line that sells is listed somewhere', 2.6);
      }
      await f.scrollTo('[data-testid="button-copy-order"]');
      await f.tap('[data-testid="button-copy-order"]', 'Copy or share the order for your rep', 2.4, 900);
    },
  },

  'invoice-scan': {
    title: 'Scan a delivery note', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/delivery');
      await f.scrollTo('a[href="/invoice-scan"]');
      await f.tap('a[href="/invoice-scan"]', 'Got a paper delivery note? Scan it', 2.0, 2500);
      await f.shot('Take a photo of the note', 2.2, await (async () => { const r = await f.p.locator('[data-testid="button-upload-invoice"]').boundingBox(); return [Math.round((r.x + r.width / 2) * 2), Math.round((r.y + r.height / 2) * 2)]; })());
      await f.scrollTo('[data-testid^="invoice-line-"]', 'start');
      await f.shot('It reads every line and matches your products', 2.8);
      for (let i = 0; i < 3; i++) {
        const acc = f.p.locator('[data-testid^="invoice-line-"]').nth(i).getByRole('button', { name: /Accept/ });
        await f.tap(acc, i === 0 ? 'Check each line and accept it' : 'Accept', i === 0 ? 1.8 : 1.0, 900);
      }
      const ign = f.p.locator('[data-testid="invoice-line-dl4"]').getByRole('button', { name: /Ignore/ });
      await f.tap(ign, 'Not stock? Ignore it', 1.6, 900);
      await f.scrollTo('[data-testid="button-commit-invoice"]');
      await f.tap('[data-testid="button-commit-invoice"]', 'Nothing goes in until you approve it', 2.2, 800);
      await f.tap(f.p.getByRole('button', { name: /Commit approved rows/ }), 'Stock and cost prices update', 2.4, 2000);
      await f.noToast(); await f.top();
      await f.shot('Done. Saved against the supplier and invoice', 2.4);
    },
  },

  'settings-offers': {
    title: 'Deals and offers', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/settings');
      await f.tap(tab(f, 'Offers'), 'Running a deal? Add it here', 1.8, 800, true);
      await f.fill('[data-testid="input-offer-name"]', 'Gin & tonic £5');
      await f.fill('[data-testid="input-offer-price"]', '5');
      await f.shot('Name the deal and the price', 2.2);
      const g = f.p.locator('[data-testid^="button-offer-product-"]').filter({ hasText: /Gordon/ });
      await f.tap(g, 'Pick the lines it covers', 1.8, 400);
      await f.scrollTo('[data-testid="button-create-offer"]');
      await f.tap('[data-testid="button-create-offer"]', 'Save deal', 1.4, 1200);
      await f.noToast();
      await f.p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await f.sleep(300);
      await f.shot('Spot checks value those pours at the deal price', 2.8);
    },
  },

  'settings-counting': {
    title: 'Settings', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/settings');
      await f.tap(tab(f, 'Counting'), 'Counting: the areas you count', 1.8, 800, true);
      await f.fill('[data-testid="input-new-count-location"]', 'Cellar');
      await f.tap('[data-testid="button-add-count-location"]', 'Add Cellar, Bar, Garden…', 1.6, 1200);
      await f.noToast();
      await f.shot('Pick the area as you count each line', 2.2);
      await f.tap(tab(f, 'Defaults'), 'Defaults', 1.4, 800, true);
      await f.shot('Your measure: 25ml or 35ml, and how you order', 2.8);
    },
  },

  'staff-phone': {
    title: 'Staff phones', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/team');
      await f.p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await f.sleep(400);
      await f.tap(byText(f, 'Show codes'), 'Staff phone access', 1.8, 600);
      await f.scrollTo(byText(f, 'K7Q2MX'));
      await f.shot('Everyone gets their own code', 2.4);
      await f.tap(f.p.getByRole('button', { name: /Share/ }).first(), 'Send it to them', 1.8, 800);
      await f.noToast();
      await f.shot('They sign up and enter it once. Linked', 2.4);
    },
  },

  'staff-phone-view': {
    title: 'On the staff phone', mock: 'mockfilm.cjs', env: 'ROLE=staff CHECKS=1', run: async f => {
      await f.go('/');
      await f.shot('What your staff see: their own shift, nothing else', 2.6);
      await f.tap(f.p.getByRole('button', { name: /Clock in/ }), 'Tap to clock in', 1.8, 1500);
      await f.noToast();
      await f.shot('On shift. No wages, no takings, no stock', 2.4);
      await f.tap('a[href="/checks"]', "Today's checks are one tap away", 1.8, 1800);
      await f.shot('Temperatures and checklists your manager set up', 2.4);
      const temp = n => f.p.locator('div.rounded-xl, [class*="card"]').filter({ hasText: n }).locator('input[placeholder="°C"]').first();
      const logBtn = n => f.p.locator('div.rounded-xl, [class*="card"]').filter({ hasText: n }).getByRole('button', { name: 'Log' }).first();
      await f.fill(temp('Cellar fridge'), '3.2');
      await f.tap(logBtn('Cellar fridge'), 'Type the temperature, tap Log', 1.8, 1200);
      await f.fill(temp('Kitchen fridge'), '8');
      await f.tap(logBtn('Kitchen fridge'), 'Too warm?', 1.2, 1200);
      await f.scrollTo(f.p.getByText('Too warm').first());
      await f.shot('Flagged straight away, with the time and who logged it', 2.8);
      const item = t => f.p.getByRole('button', { name: new RegExp(t) }).first();
      await f.tap(item('No signs of pests'), 'Tick the opening checks as they go', 1.6, 900);
      await f.tap(item('Hand-wash sink stocked'), 'Tick the opening checks as they go', 1.0, 900);
      await f.p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await f.sleep(500);
      await f.tap(f.p.getByRole('button', { name: /Log a refusal/ }), 'Refused someone? Log it', 1.6, 700);
      await f.tap(f.p.getByRole('button', { name: 'No ID shown' }), 'Pick the reason', 1.2, 400);
      await f.tap(f.p.getByRole('button', { name: 'Log it' }), 'Logged, with the time', 1.8, 1200);
      await f.noToast();
      await f.p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await f.sleep(400);
      await f.shot('All saved for the owner to see', 2.4);
    },
  },

  'checks-history': {
    title: 'Checks history', mock: 'mockfilm.cjs', env: 'CHECKS=1', run: async f => {
      await f.go('/checks');
      await f.shot("Every check your team logs is kept", 2.2);
      await f.tap('[data-testid="checks-tab-history"]', 'History & download', 1.6, 1500, true);
      await f.shot('The last 30 days at a glance', 2.6);
      const flagged = f.p.locator('[data-testid^="checks-day-"]').filter({ hasText: '°C' }).first();
      await f.scrollTo(flagged);
      await f.shot('A fridge ran warm that night. It shows', 2.4);
      await f.tap(flagged, 'Tap the day', 1.4, 1500);
      await f.scrollTo(f.p.getByText('Too warm').first());
      await f.shot('Exactly what was logged, when, and who by', 2.8);
      await f.top();
      await f.tap('[data-testid="checks-tab-history"]', 'Back to history', 1.0, 1200, true);
      await f.tap('[data-testid="checks-range-90"]', 'Go back as far as you need', 1.6, 1500);
      await f.tap('[data-testid="button-download-checks"]', 'Download it as a spreadsheet for your records', 2.6, 800);
    },
  },

  'first-count': {
    title: 'Your first count', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/first-count');
      await f.shot('Start small: your 20 biggest sellers', 2.4);
      const hit = () => f.p.locator('[data-testid^="first-count-catalogue-"], [data-testid^="first-count-library-"]').first();
      for (const [q, cap, d] of [['gordon', 'Type a brand, tap to add', 1.8], ['tanqueray', 'Your library and the UK catalogue, one search', 1.8], ['bombay', 'Keep going', 1.0], ['vodka', 'Keep going', 1.0]]) {
        await f.fill('[data-testid="input-first-count-search"]', q); await f.sleep(1300);
        if (await hit().count()) await f.tap(hit(), cap, d, 900);
      }
      await f.shot('Your list, ready to count', 2.2);
      await f.tap('[data-testid="button-first-count-start"]', 'Start counting', 1.8, 2500);
      await f.shot('Straight into the count', 2.4);
    },
  },

  'suggestions': {
    title: 'Suggestions', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/suggestions');
      await f.shot('Something missing? Tell us', 2.2);
      await f.tap('[data-testid="button-toggle-suggestion-form"]', 'New suggestion', 1.4, 600);
      await f.fill('[data-testid="input-suggestion-title"]', 'Show wine by the glass');
      await f.fill('[data-testid="textarea-suggestion-detail"]', '125ml and 175ml pours on the spot check');
      await f.tap('[data-testid="button-submit-suggestion"]', 'Send it', 2.2, 1500);
      await f.noToast();
      await f.shot('It shows up for everyone to vote on', 2.4);
    },
  },

  'settings-plan': {
    title: 'Your plan', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/settings');
      await f.tap(tab(f, 'Plan'), 'Plan', 1.4, 1000, true);
      await f.shot('Pro and Premium, 14 days free', 2.6);
      await f.p.evaluate(() => document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; })); await f.sleep(400);
      await f.shot('Paid through Stripe. Cancel any time from Settings', 2.6);
      await f.tap(tab(f, 'Referral'), 'Referral', 1.4, 800, true);
      await f.shot('Refer another pub', 2.4);
    },
  },
});

// ── Batch 3: Daily Board with history ───────────────────────────────────────
Object.assign(module.exports, {
  'board-weeks-months': {
    title: 'Daily Board', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/daily-board');
      await f.tap('[data-testid="board-view-weeks"]', 'Weeks: every week at a glance', 1.8, 900, true);
      await f.shot('This week so far, against the same days last year', 2.8);
      await f.shot('Your average week, and wages as a % of takings', 2.4);
      await f.p.evaluate(() => window.scrollBy(0, 330)); await f.sleep(400);
      await f.shot('Every week against the same week last year', 2.6);
      const wk = f.p.locator('[data-testid^="week-toggle-"]').nth(1);
      await f.tap(wk, 'Tap a week to see its days', 1.6, 600, true);
      await f.scrollTo(f.p.locator('[data-testid^="week-days-"]').first());
      await f.shot('Every day against the same day last year', 2.6);
      await f.top();
      await f.tap('[data-testid="board-view-months"]', 'Months', 1.4, 900, true);
      await f.shot('The last 12 months against the year before', 2.8);
      await f.p.evaluate(() => window.scrollBy(0, 300)); await f.sleep(400);
      await f.shot('Grey is last year. See the busy months coming', 2.6);
    },
  },

  'board-was-it-worth-it': {
    title: 'Was it worth putting on?', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/daily-board');
      await f.fill('[data-testid="input-daily-total"]', '3480');
      await f.shot('A night with a band on', 2.0);
      await f.scrollTo('[data-testid="button-board-extras"]');
      await f.tap('[data-testid="button-board-extras"]', 'Add what was on', 1.4, 600);
      await f.fill('[data-testid="input-board-what-on"]', 'Live band');
      await f.fill('[data-testid="input-board-act"]', 'The Demo Band');
      await f.fill('[data-testid="input-board-fee"]', '250');
      await f.scrollTo('[data-testid="input-board-what-on"]', 'start');
      await f.shot('What was on, who, and what they cost', 2.4);
      await f.scrollTo('[data-testid="board-worth-it"]');
      await f.shot('Against a normal Wednesday: did the act pay for itself?', 3.2);
      await f.scrollTo('[data-testid="input-board-wet"]');
      await f.fill('[data-testid="input-board-wet"]', '2900');
      await f.fill('[data-testid="input-board-dry"]', '480');
      await f.shot('Wet and dry split. It tells you if they don\'t add up', 2.8);
      await f.fill('[data-testid="input-board-dry"]', '580');
      await f.scrollTo('[data-testid="button-save-day"]');
      await f.tap('[data-testid="button-save-day"]', 'Save the night', 1.6, 1200);
      await f.noToast();
    },
  },

  'board-past-days': {
    title: 'Daily Board', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/daily-board');
      await f.shot('Forgot to log a night?', 1.8);
      await f.tap('button[aria-label="Previous day"]', 'Go back a day with the arrow', 1.6, 700, true);
      await f.shot('Yesterday, as it was saved', 2.0);
      const d = new Date(Date.now() - 12 * 864e5).toISOString().slice(0, 10);
      await f.shot('Or tap the date to pick any day', 1.8, await (async () => { const r = await f.p.locator('[data-testid="board-date-label"]').boundingBox(); return [Math.round((r.x + r.width / 2) * 2), Math.round((r.y + r.height / 2) * 2)]; })());
      await f.p.locator('[data-testid="input-board-date"]').fill(d); await f.sleep(700);
      await f.shot('That day, ready to fill in or fix', 2.2);
      await f.fill('[data-testid="input-daily-total"]', '1984.60');
      await f.tap('button[aria-label="Next day"]', 'Moved on before saving?', 1.6, 700, true);
      await f.shot('It keeps what you typed, and tells you', 2.8);
      await f.tap(f.p.getByRole('button', { name: /^Go back to/ }), 'Go back and save it', 1.6, 700, true);
      await f.tap('[data-testid="button-save-day"]', 'Save the day', 1.4, 1400);
      await f.noToast();
      await f.tap('[data-testid="button-board-today"]', 'Back to today', 1.6, 700, true);
      await f.shot('Back on tonight', 1.8);
    },
  },

  'board-import-takings': {
    title: 'Bring in past takings', mock: 'mockfilm.cjs', run: async f => {
      await f.go('/daily-board');
      await f.scrollTo('[data-testid="button-open-takings-import"]');
      await f.tap('[data-testid="button-open-takings-import"]', 'Got years of takings in a spreadsheet?', 2.0, 900);
      await f.p.locator('[data-testid="input-takings-paste"]').fill('Date\tTakings\n04/01/2020\t2,431.80\n05/01/2020\t1,187.25\n06/01/2020\t1,402.60\n07/01/2020\t1,318.90\n08/01/2020\t1,655.15\n09/01/2020\t3,512.40\n10/01/2020\t3,977.05');
      await f.sleep(600);
      await f.shot('Copy the date and takings columns, paste them in', 2.6);
      await f.shot('It checks them first: how many days, the dates, the total, the biggest day', 2.8);
      await f.tap('[data-testid="button-takings-import"]', 'Bring them in', 1.6, 1500);
      await f.noToast();
      await f.tap('[data-testid="board-view-weeks"]', 'Weeks, months and last year fill straight in', 1.6, 900, true);
      await f.shot('Weeks, months and last year fill straight in', 2.6);
    },
  },
});
