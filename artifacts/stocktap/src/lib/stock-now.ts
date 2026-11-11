/**
 * Stock on hand right now = the last count + everything delivered since.
 * A delivery is stock the moment it's accepted, so it shows without waiting for the next count.
 */
import { draughtAmount, isDraughtProduct } from "./draught-gauge";

export interface StockNow { ml: number; deliveredMl: number; label: string; deliveredLabel: string | null }

export function stockNow(
  product: { id: string; category?: string | null; counting_method?: string | null; size_ml?: number | null; unit?: string | null; container_l?: number | null },
  last: { ml_remaining: number; reading_at: string } | null | undefined,
  deliveries: { product_id: string; delivered_at: string; quantity_ml: number | null }[],
): StockNow | null {
  const since = last?.reading_at ?? null;
  const deliveredMl = deliveries
    .filter(d => d.product_id === product.id && (!since || d.delivered_at > since))
    .reduce((a, d) => a + (Number(d.quantity_ml) || 0), 0);
  if (!last && deliveredMl <= 0) return null;
  const ml = (last ? Number(last.ml_remaining) : 0) + deliveredMl;
  const fmt = (v: number) => {
    if (isDraughtProduct(product)) return draughtAmount(v);
    if (product.counting_method === "litre") return `${(v / 1000).toFixed(1)}L`;
    if (product.size_ml) { const n = v / product.size_ml; return `${Number.isInteger(Math.round(n * 10) / 10) ? Math.round(n) : n.toFixed(1)} ${product.unit === "count" || product.counting_method === "each" || product.counting_method === "dozen" ? "units" : "btl"}`; }
    // Unit lines with no size (crisps, nuts) are stored one per unit: "19 units", never "19ml".
    if (product.unit === "count" || product.counting_method === "each" || product.counting_method === "dozen") return `${Math.round(v)} units`;
    return `${Math.round(v)}ml`;
  };
  return { ml, deliveredMl, label: fmt(ml), deliveredLabel: deliveredMl > 0 ? fmt(deliveredMl) : null };
}

/** "counted today" / "counted yesterday" / "counted 6 days ago" — so a figure is never read as fresher than it is. */
export function countedAgo(readingAt: string | null | undefined, now = Date.now()): string | null {
  if (!readingAt) return null;
  const d = new Date(readingAt), n = new Date(now);
  const days = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return days <= 0 ? "counted today" : days === 1 ? "counted yesterday" : `counted ${days} days ago`;
}
