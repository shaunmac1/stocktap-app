/**
 * Order day: how many days of each line are left.
 * Rate = what actually went between two real counts (first count + deliveries in between − last count),
 * over the days between them. Looks back up to 14 days so a weekend is in the rate where it can be.
 */
export interface CountPoint { ml: number; at: string }
export interface DeliveryPoint { ml: number; at: string }
export type DaysLeftStatus = "ok" | "no-history" | "went-up" | "not-moving" | "no-count";
export interface DaysLeft {
  status: DaysLeftStatus;
  /** last count + deliveries since */
  stockMl: number;
  deliveredSinceMl: number;
  lastAt: string | null;
  perDayMl: number | null;
  days: number | null;
  /** the two counts the rate came from */
  fromAt: string | null;
  spanDays: number | null;
  usedMl: number | null;
}

const DAY = 86_400_000;
export const LOOKBACK_DAYS = 14;
const MIN_GAP_HOURS = 12;

export function daysLeft(counts: CountPoint[], deliveries: DeliveryPoint[]): DaysLeft {
  const sorted = [...counts].filter(c => Number.isFinite(c.ml) && c.at).sort((a, b) => (a.at < b.at ? 1 : -1));
  const last = sorted[0];
  if (!last) {
    const d = deliveries.reduce((a, x) => a + (x.ml || 0), 0);
    return { status: "no-count", stockMl: d, deliveredSinceMl: d, lastAt: null, perDayMl: null, days: null, fromAt: null, spanDays: null, usedMl: null };
  }
  const lastT = Date.parse(last.at);
  const deliveredSinceMl = deliveries.filter(d => d.at > last.at).reduce((a, d) => a + (d.ml || 0), 0);
  const stockMl = last.ml + deliveredSinceMl;
  const base = { stockMl, deliveredSinceMl, lastAt: last.at };
  // The oldest count inside the look-back window, at least half a day before the last one.
  const earlier = sorted.filter(c => { const t = Date.parse(c.at); return lastT - t >= MIN_GAP_HOURS * 3_600_000 && lastT - t <= LOOKBACK_DAYS * DAY; });
  const from = earlier[earlier.length - 1];
  if (!from) return { ...base, status: "no-history", perDayMl: null, days: null, fromAt: null, spanDays: null, usedMl: null };
  const between = deliveries.filter(d => d.at > from.at && d.at <= last.at).reduce((a, d) => a + (d.ml || 0), 0);
  const usedMl = from.ml + between - last.ml;
  const spanDays = (lastT - Date.parse(from.at)) / DAY;
  const common = { ...base, fromAt: from.at, spanDays, usedMl };
  if (usedMl < -284) return { ...common, status: "went-up", perDayMl: null, days: null }; // more than half a pint up with no delivery: a count is out
  if (usedMl <= 284) return { ...common, status: "not-moving", perDayMl: 0, days: null };
  const perDayMl = usedMl / spanDays;
  return { ...common, status: "ok", perDayMl, days: stockMl / perDayMl };
}

/** "about 7 days", "under a day", "3 weeks+" */
export function daysLeftLabel(days: number): string {
  if (days < 1) return "under a day";
  if (days < 10) return `about ${Math.round(days * 2) / 2} ${Math.round(days * 2) / 2 === 1 ? "day" : "days"}`;
  if (days < 21) return `about ${Math.round(days)} days`;
  return "3 weeks or more";
}

/** How many full containers to order so stock lasts `coverDays` at this rate. */
export function kegsToOrder(d: DaysLeft, containerMl: number, coverDays: number): number | null {
  if (d.status !== "ok" || !d.perDayMl || containerMl <= 0) return null;
  const need = d.perDayMl * coverDays - d.stockMl;
  return need <= 0 ? 0 : Math.ceil(need / containerMl);
}
