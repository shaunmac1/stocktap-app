/**
 * Today's check: which lines are worth counting today, and why. The landlord taps once to
 * tick them, then adds or removes any by hand.
 *
 * Reasons, in order:
 *   1. "Running low"     – was in stock at the last count and should be low or gone by now.
 *                          Biggest sellers (by money) first: those are the ones that hurt.
 *                          A line already counted at NOTHING isn't here — counting none again
 *                          tells you nothing; it belongs on the order list.
 *   2. "Dearest lines"   – the most stock money sits in it, and it hasn't been checked for a week.
 *   3. "Never checked"   – stocked, priced, never counted.
 * Capped (default 10) so a check stays a few minutes, not a stocktake.
 */
import type { LineForecast } from "./line-forecast";

export interface PickProduct {
  id: string;
  name: string;
  cost_price?: number | null;
  counting_method?: string | null;
  hidden_at?: string | null;
}

export type PickReason = "low" | "value" | "never";
export interface CheckPick { id: string; reason: PickReason; label: string }

const DAY = 864e5;

export function suggestChecks(
  products: PickProduct[],
  forecasts: Map<string, LineForecast>,
  lastCountAt: Map<string, string>,
  opts: { now?: number; max?: number; staleDays?: number } = {},
): CheckPick[] {
  const now = opts.now ?? Date.now();
  const max = opts.max ?? 10;
  const staleDays = opts.staleDays ?? 7;
  const live = products.filter(p => !p.hidden_at);
  const out: CheckPick[] = [];
  const taken = new Set<string>();
  const add = (id: string, reason: PickReason, label: string) => { if (!taken.has(id) && out.length < max) { taken.add(id); out.push({ id, reason, label }); } };

  // 1. Should be low or gone by now — biggest weekly sales (at cost) first. Room is kept for
  //    the other two reasons so the list is never ten of one kind.
  const lowMax = Math.max(1, Math.ceil(max * 0.6));
  const low = live
    .map(p => ({ p, f: forecasts.get(p.id) }))
    .filter(x => x.f && (x.f.status === "due" || x.f.status === "low"))
    .map(x => ({ ...x, weekly: x.f!.rate * 7 * costPerMl(x.p, x.f!) }))
    .sort((a, b) => b.weekly - a.weekly || a.f!.daysLeft - b.f!.daysLeft);
  const lowLabel = (f: LineForecast) => f.status === "due" ? "Should be nearly out: check before you order"
    : f.daysLeft < 1 ? "Running low: under a day left"
    : `Running low: ${Math.floor(f.daysLeft)} ${Math.floor(f.daysLeft) === 1 ? "day" : "days"} left`;
  low.slice(0, lowMax).forEach(({ p, f }) => add(p.id, "low", lowLabel(f!)));

  // 2. Where the money is: highest stock value at cost, not checked for a week.
  const daysSince = (id: string) => { const t = lastCountAt.get(id); return t ? (now - Date.parse(t)) / DAY : Infinity; };
  live
    .map(p => ({ p, value: stockValue(p, forecasts.get(p.id)), since: daysSince(p.id) }))
    .filter(x => x.value > 0 && x.since >= staleDays && x.since !== Infinity)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .forEach(({ p, since }) => add(p.id, "value", `Dearest lines: not checked for ${Math.floor(since)} days`));

  // 3. Stocked and priced but never counted.
  live
    .filter(p => (p.cost_price ?? 0) > 0 && !lastCountAt.has(p.id))
    .sort((a, b) => (b.cost_price ?? 0) - (a.cost_price ?? 0))
    .forEach(p => add(p.id, "never", "Never checked"));

  // Any room left goes back to the running-low lines.
  low.slice(lowMax).forEach(({ p, f }) => add(p.id, "low", lowLabel(f!)));
  return out;
}

/** Cost of one ml of the line (one unit for sizeless unit lines). */
export function costPerMl(p: PickProduct, f: LineForecast): number {
  if (!(f.pack.ml > 0)) return 0;
  const perCase = /^case of (\d+)$/.exec(f.pack.one);
  const pricedMl = perCase && p.counting_method !== "dozen" ? f.pack.ml / Number(perCase[1]) : f.pack.ml;
  return (p.cost_price ?? 0) / pricedMl;
}

/**
 * Money sitting in the line now, at cost. cost_price is per single unit on lines counted each,
 * per case on "dozen" lines, and per container (bottle, keg, box) on everything else.
 */
export function stockValue(p: PickProduct, f: LineForecast | undefined): number {
  return f ? f.nowMl * costPerMl(p, f) : 0;
}
