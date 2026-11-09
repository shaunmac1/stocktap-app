/**
 * Every how-to video, and which screens it belongs to. Used by the "How to" button on each
 * screen and by the /videos page. Files live in public/media/help/<id>.mp4 and .jpg.
 */
export interface HelpVideo { id: string; title: string; blurb: string; group: string }

export const HELP_VIDEOS: HelpVideo[] = [
  { id: "first-count", group: "Getting started", title: "Your first count", blurb: "Pick your biggest sellers from the catalogue and start counting in minutes." },
  { id: "home-tour", group: "Getting started", title: "Your home screen", blurb: "Stock value and GP at a glance, and where everything starts." },
  { id: "library-add-from-catalogue", group: "Getting started", title: "Add lines from the catalogue", blurb: "Search the UK pub catalogue and add the lines you sell in one go." },
  { id: "library-add-product", group: "Getting started", title: "Add your own product", blurb: "Not in the catalogue? Type the name and the rest fills in." },
  { id: "library-weigh-bottle", group: "Getting started", title: "Weigh a full bottle once", blurb: "One full, sealed bottle on the scale. Every count after is to the gram." },
  { id: "library-prices-and-pars", group: "Getting started", title: "Prices and par levels", blurb: "Cost, sell price and par level for every line on one screen." },
  { id: "settings-locations", group: "Getting started", title: "Your counting areas", blurb: "Add the cellar, back bar or function room and count each one." },
  { id: "settings-counting", group: "Getting started", title: "Counting and defaults", blurb: "The areas you count, your measure, and how often you order." },

  { id: "stocktake-start", group: "Stocktakes", title: "Start a stocktake", blurb: "The tips, picking lines, then count and tap Next. In the order you walk it." },
  { id: "stocktake-weigh-setup", group: "Stocktakes", title: "Weigh a new bottle", blurb: "One full sealed bottle on the scale, once. Then weigh the open one to the ml." },
  { id: "stocktake-casks", group: "Stocktakes", title: "Cask ale on the dip rod", blurb: "Read the pints off your dip rod. Or set a full depth once and use a ruler." },
  { id: "stocktake-spots", group: "Stocktakes", title: "Bar and cellar", blurb: "Same drink in two spots? Count both and it adds them up. The spot sticks." },
  { id: "weighing-spot-check", group: "Stocktakes", title: "Weigh spirits, then spot check", blurb: "Weigh the open bottle to the gram. Next day, spot check it against the till." },
  { id: "spirits-tenths", group: "Stocktakes", title: "Spirits in tenths", blurb: "No scale to hand? Tap where the drink comes up to." },
  { id: "draught-gallons", group: "Stocktakes", title: "Draught in gallons", blurb: "Gallons and pints, like the stocktaker's sheet. It works out the kegs." },
  { id: "keg-box-sizes", group: "Stocktakes", title: "Keg and box sizes", blurb: "30L, 50L or 11 gallon kegs. Postmix boxes from 7 to 20 litres." },
  { id: "stocktake-postmix", group: "Stocktakes", title: "Count postmix", blurb: "Litres of drink like your stocktaker, or boxes. Both shown." },
  { id: "stocktake-count-units", group: "Stocktakes", title: "Cans and bottles", blurb: "Just count them. The value works itself out." },
  { id: "stocktake-review-close", group: "Stocktakes", title: "Review and close", blurb: "Grouped by category, missing prices flagged, tap a line to fix it, then close." },

  { id: "paste-delivery", group: "Deliveries and orders", title: "Paste a delivery", blurb: "Copy the supplier's delivery email and paste it in. Lines matched to your products." },
  { id: "order-list-explained", group: "Deliveries and orders", title: "What to order", blurb: "Out now, running low, and what you've already got enough of. Change the days and copy the order." },
  { id: "invoice-scan", group: "Deliveries and orders", title: "Scan a paper delivery note", blurb: "Photograph the note. Check each line, then approve it into stock and prices." },
  { id: "order-from-stocktakes", group: "Deliveries and orders", title: "Your order list", blurb: "What to order, from what sold between your stocktakes." },
  { id: "stock-and-orders", group: "Deliveries and orders", title: "Order list from a Venners audit", blurb: "Use Venners? Drop the audit in for the order, up and down and all stock." },
  { id: "ledger-wastage", group: "Deliveries and orders", title: "Breakages and transfers", blurb: "Log a dropped bottle so it doesn't show as a loss." },

  { id: "reports-tour", group: "Money and reports", title: "Reports", blurb: "Valuation, GP by line, by location, cost of sales and the order guide." },
  { id: "daily-board", group: "Money and reports", title: "The Daily Board", blurb: "One number a night, against last week, your average and the same night up to 3 years ago." },
  { id: "board-past-days", group: "Money and reports", title: "Fill in or fix a past night", blurb: "Go back a day or pick any date. Unsaved figures are kept, and it tells you." },
  { id: "board-weeks-months", group: "Money and reports", title: "Weeks and months", blurb: "Every week and month against last year, with wages as a % of takings. Tap a week for its days." },
  { id: "board-was-it-worth-it", group: "Money and reports", title: "Was the act worth it?", blurb: "Put in the fee and see if the band or match paid for itself, plus the wet and dry split." },
  { id: "board-import-takings", group: "Money and reports", title: "Bring in past takings", blurb: "Paste years of takings from your spreadsheet in one go." },
  { id: "finances-add", group: "Money and reports", title: "Finances", blurb: "Bills and takings, what's payable and the VAT." },
  { id: "settings-offers", group: "Money and reports", title: "Deals and offers", blurb: "Add a deal so spot checks value those pours at the deal price." },
  { id: "settings-plan", group: "Money and reports", title: "Your plan", blurb: "Premium at £39 a month, 14 days free. Cancel any time from Settings." },

  { id: "team-and-clock", group: "Team", title: "Team and wages", blurb: "Add the team, tap to clock in, wages live against the take." },
  { id: "rota", group: "Team", title: "The rota", blurb: "Bar and kitchen shifts, quick fill, copy last week." },
  { id: "checks-temperatures", group: "Team", title: "Daily checks", blurb: "Temperatures and opening and closing checklists on the staff phones." },
  { id: "checks-manage", group: "Team", title: "Add, change or remove a check", blurb: "Add a fridge, change a safe range, take one off. It asks before removing anything." },
  { id: "checks-past-day", group: "Team", title: "Fill in a missed check", blurb: "Go back to any day. Anything added later is marked as filled in later." },
  { id: "staff-phone", group: "Team", title: "Staff phone codes", blurb: "Give each person their own code to link their phone." },
  { id: "staff-phone-view", group: "Team", title: "On the staff phone", blurb: "Staff clock in, log temperatures, tick the checks and log refusals. No wages, no takings." },
  { id: "checks-history", group: "Team", title: "Checks history", blurb: "Every temperature, tick and refusal, who did it and when. Look back or download it." },
  { id: "suggestions", group: "Team", title: "Suggest a feature", blurb: "Tell us what to build next and vote on other ideas." },
];

/** Which videos belong on which screen (first one plays first). */
const BY_ROUTE: Array<[string, string[]]> = [
  ["/library", ["library-add-from-catalogue", "library-add-product", "library-weigh-bottle", "library-prices-and-pars"]],
  ["/stocktake", ["stocktake-start", "stocktake-weigh-setup", "spirits-tenths", "stocktake-casks", "draught-gallons", "stocktake-spots", "keg-box-sizes", "stocktake-postmix", "stocktake-count-units", "stocktake-review-close", "weighing-spot-check"]],
  ["/first-count", ["first-count", "weighing-spot-check", "spirits-tenths"]],
  ["/spot-check", ["weighing-spot-check"]],
  ["/delivery", ["paste-delivery", "invoice-scan"]],
  ["/invoice-scan", ["invoice-scan"]],
  ["/orders", ["order-list-explained", "order-from-stocktakes", "stock-and-orders"]],
  ["/ledger", ["ledger-wastage", "paste-delivery", "invoice-scan"]],
  ["/reports", ["reports-tour", "library-prices-and-pars"]],
  ["/daily-board", ["daily-board", "board-past-days", "board-weeks-months", "board-was-it-worth-it", "board-import-takings"]],
  ["/checks", ["checks-temperatures", "checks-manage", "checks-past-day", "checks-history", "staff-phone-view"]],
  ["/finances", ["finances-add", "board-import-takings"]],
  ["/team", ["team-and-clock", "staff-phone", "staff-phone-view"]],
  ["/suggestions", ["suggestions"]],
  ["/rota", ["rota"]],
  ["/settings", ["settings-locations", "settings-counting", "settings-offers", "settings-plan"]],
  ["/", ["home-tour", "first-count", "library-add-from-catalogue", "weighing-spot-check"]],
];

export function videosForRoute(path: string): HelpVideo[] {
  const hit = BY_ROUTE.find(([r]) => (r === "/" ? path === "/" : path === r || path.startsWith(r + "/") || path.startsWith(r + "?")));
  const ids = hit ? hit[1] : [];
  return ids.map(id => HELP_VIDEOS.find(v => v.id === id)!).filter(Boolean);
}

export const helpSrc = (id: string) => `/media/help/${id}.mp4`;
export const helpPoster = (id: string) => `/media/help/${id}.jpg`;
