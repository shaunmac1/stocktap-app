/**
 * "This looks wrong": a line counted higher than its last count plus anything delivered
 * since. Stock can't grow on its own, so it's either a miscount or a delivery nobody logged.
 * Never blocks closing; pubs can turn it off.
 */
import { formatGauge } from "./draught-gauge";

const ML_PER_PINT = 568.261;
export interface LooksWrongInput {
  productId: string; name: string; draught: boolean; sizeMl?: number | null;
  countedMl: number; lastMl: number | null; lastAt: string | null; deliveredMl: number;
}
export interface LooksWrongFlag { productId: string; name: string; upMl: number; message: string }

export function findLooksWrong(lines: LooksWrongInput[]): LooksWrongFlag[] {
  const out: LooksWrongFlag[] = [];
  for (const l of lines) {
    if (l.lastMl == null) continue; // first count of this line: nothing to compare with
    const up = l.countedMl - (l.lastMl + Math.max(0, l.deliveredMl));
    // Allowance for gauge/eye error: a gallon on draught, half a bottle on bottles, 50ml otherwise.
    const allow = l.draught ? 8 * ML_PER_PINT : l.sizeMl ? l.sizeMl * 0.5 : 50;
    if (up <= allow) continue;
    const amount = l.draught ? formatGauge(up / ML_PER_PINT) : l.sizeMl ? `${(up / l.sizeMl).toFixed(1)} bottles` : `${Math.round(up)}ml`;
    const when = l.lastAt ? new Date(l.lastAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "the last count";
    const del = l.deliveredMl > 0 ? "more than was delivered" : "with no delivery logged";
    out.push({ productId: l.productId, name: l.name, upMl: up, message: `Up ${amount} since ${when}, ${del}. Check the count, or add the delivery.` });
  }
  return out.sort((a, b) => b.upMl - a.upMl);
}
