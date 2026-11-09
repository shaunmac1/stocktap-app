/**
 * Turn StockTap's own stocktakes into the same shape as a Venners audit, so the order list works
 * for pubs that don't use Venners.
 *
 * Between two closed stocktakes, for each product counted in both:
 *   sold = stock at the first count + deliveries in between − stock at the second count
 * That gives a real sales rate per line, and the order list, busy-week and past-period
 * options work exactly as they do with Venners audits. There is no till data here, so there is
 * no up and down (variance is always 0).
 */
import type { AuditBase, AuditLine, AuditSummary } from "@/lib/venners-audit";
import { deliveredBase, ML_PER_PINT, type OrderProductLike, type StoredAudit } from "@/lib/stock-orders";

export interface CountStocktake { id: string; status: string; closed_at: string | null }
export interface CountReading { stocktake_id: string | null; product_id: string; ml_remaining: number | null; count: number | null }
export interface CountProduct extends OrderProductLike { unit?: string | null; cost_price?: number | null; is_active?: boolean | null }
export interface CountDelivery { product_id: string; delivered_at: string; quantity: number; quantity_ml: number | null }

const CATEGORY_LABELS: Record<string, string> = {
  draught_lager: "Draught lager", draught_ale: "Draught ale", draught_cider: "Draught cider", draught_stout: "Draught stout",
  spirits: "Spirits", wine: "Wines", wines: "Wines", minerals: "Minerals", packaged: "Packaged", postmix: "Postmix",
  sundry: "Sundry", sundries: "Sundry", soft_drinks: "Minerals", bottled_beer: "Packaged",
};

export function categoryLabel(c: string | null | undefined): string {
  if (!c) return "Other";
  return CATEGORY_LABELS[c] ?? c.replace(/_/g, " ").replace(/^\w/, m => m.toUpperCase());
}

const DRAUGHT = new Set(["keg_weight", "dipstick", "tenths_pints"]);

/** The unit a line is counted and ordered in. */
export function baseFor(p: CountProduct): AuditBase {
  if (DRAUGHT.has(p.counting_method ?? "") || (p.category ?? "").startsWith("draught_")) return "pints";
  if (p.counting_method === "litre" || p.category === "postmix") return "litres";
  if (p.counting_method === "dozen" || p.counting_method === "each" || p.counting_method === "count") return "units";
  if (p.unit === "count" && !p.size_ml) return "units";
  return "bottles";
}

/** How much of a product one reading holds, in its base unit. */
export function readingBase(p: CountProduct, r: CountReading): number {
  const ml = Number(r.ml_remaining ?? 0);
  switch (baseFor(p)) {
    case "pints": return ml / ML_PER_PINT;
    case "litres": return ml / 1000;
    case "units":
      if (p.counting_method === "dozen" || p.counting_method === "each" || p.counting_method === "count" || !p.size_ml) return Number(r.count ?? 0);
      return ml / p.size_ml;
    default: return p.size_ml ? ml / p.size_ml : Number(r.count ?? 0);
  }
}

const day = (iso: string) => iso.slice(0, 10);

export function buildCountAudits(
  stocktakes: CountStocktake[],
  readings: CountReading[],
  deliveries: CountDelivery[],
  products: CountProduct[],
): StoredAudit[] {
  const closed = stocktakes.filter(s => s.status === "closed" && s.closed_at).sort((a, b) => a.closed_at!.localeCompare(b.closed_at!));
  if (closed.length < 2) return [];
  const byId = new Map(products.map(p => [p.id, p]));
  // stock per stocktake per product
  const stock = new Map<string, Map<string, number>>();
  for (const r of readings) {
    if (!r.stocktake_id) continue;
    const p = byId.get(r.product_id); if (!p) continue;
    let m = stock.get(r.stocktake_id); if (!m) { m = new Map(); stock.set(r.stocktake_id, m); }
    m.set(r.product_id, (m.get(r.product_id) ?? 0) + readingBase(p, r));
  }
  const out: StoredAudit[] = [];
  for (let i = 1; i < closed.length; i++) {
    const A = closed[i - 1], B = closed[i];
    const a = stock.get(A.id), b = stock.get(B.id);
    if (!a || !b) continue;
    const days = Math.max(1, (Date.parse(B.closed_at!) - Date.parse(A.closed_at!)) / 864e5);
    const lines: AuditLine[] = [];
    let usedValue = 0;
    for (const [pid, counted] of b) {
      if (!a.has(pid)) continue;
      const p = byId.get(pid)!;
      if (p.is_active === false) continue;
      const base = baseFor(p);
      const open = a.get(pid)!;
      const del = deliveries
        .filter(d => d.product_id === pid && d.delivered_at > A.closed_at! && d.delivered_at <= B.closed_at!)
        .reduce((s, d) => s + deliveredBase(d as any, base, p), 0);
      const sold = Math.max(0, open + del - counted);
      lines.push({
        name: p.name, category: categoryLabel(p.category), unit: p.counting_method === "dozen" ? "Dozen" : "", base,
        open, del, ret: 0, tin: 0, tout: 0, adj: 0, waste: 0, sold, expected: counted, counted, variance: 0, retail: 0, delist: false,
      });
      if (p.cost_price && sold > 0) usedValue += sold * unitCost(p, base);
    }
    if (!lines.length) continue;
    const summary: AuditSummary = {
      periodStart: day(A.closed_at!), periodEnd: day(B.closed_at!), days: Math.round(days),
      openingStock: null, closingStock: null, revenue: null, purchases: null, result: null, resultPct: null,
      gp: null, optimumGp: null, wastage: null, categories: [], adjustments: [],
    } as unknown as AuditSummary;
    (summary as any).source = "counts";
    (summary as any).usedValue = Math.round(usedValue * 100) / 100;
    out.push({ id: `count-${B.id}`, period_start: day(A.closed_at!), period_end: day(B.closed_at!), days, summary, lines });
  }
  return out;
}

/** Cost of one base unit, for the "stock used per day" chart. */
function unitCost(p: CountProduct, base: AuditBase): number {
  const cost = p.cost_price ?? 0;
  if (base === "pints") return p.container_l ? cost / ((p.container_l * 1000) / ML_PER_PINT) : 0;
  if (base === "litres") return p.category === "postmix" ? cost / ((p.pack_size ?? (p.container_l ?? 12) * 6)) : p.container_l ? cost / p.container_l : cost;
  if (base === "units") return p.counting_method === "dozen" ? cost / (p.pack_size ?? 12) : cost;
  return cost;
}
