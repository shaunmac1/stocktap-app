/**
 * Today's check: which lines are worth counting today, and why. The landlord taps once to
 * tick them, then adds or removes any by hand.
 *
 * Reasons, in order:
 *   1. "Running low"     – the forecast says out or under a week left: check before ordering.
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

  // 1. Running low, soonest out first.
  live
    .map(p => ({ p, f: forecasts.get(p.id) }))
    .filter(x => x.f && (x.f.status === "out" || x.f.status === "low"))
    .sort((a, b) => a.f!.daysLeft - b.f!.daysLeft)
    .forEach(({ p, f }) => add(p.id, "low", f!.status === "out" ? "Probably out: check before ordering" : `Running low: ${Math.floor(f!.daysLeft)} ${Math.floor(f!.daysLeft) === 1 ? "day" : "days"} left`));

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

  return out;
}

/**
 * Money sitting in the line now, at cost. cost_price is per single unit on lines counted each,
 * per case on "dozen" lines, and per container (bottle, keg, box) on everything else.
 */
export function stockValue(p: PickProduct, f: LineForecast | undefined): number {
  if (!f || !(f.pack.ml > 0)) return 0;
  const cost = p.cost_price ?? 0;
  const perCase = /^case of (\d+)$/.exec(f.pack.one);
  const pricedMl = perCase && p.counting_method !== "dozen" ? f.pack.ml / Number(perCase[1]) : f.pack.ml;
  return (f.nowMl / pricedMl) * cost;
}
