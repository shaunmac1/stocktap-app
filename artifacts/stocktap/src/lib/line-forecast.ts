/**
 * Days left and what to order, for every line.
 *
 * Stock now starts from the NEWEST real count of the line (not the last audit), adds what's been
 * delivered since, and takes off what will have sold since at the line's sales speed.
 *
 * Sales speed, best first:
 *   1. "counts"  – the pub's own counts: earlier count + deliveries in between − later count,
 *                  over at least 7 days.
 *   2. "audit"   – the Venners (or other) stock audits, same settings as the Orders page.
 *   3. "counts"  – own counts over 3–6 days (better than nothing).
 * No speed → "unknown": we never guess.
 *
 * Everything is worked in ml (single units for unit lines with no size), the same storage
 * unit counts and deliveries already use.
 */
import { draughtCapacityMl, litreContainerMl } from "./calculations";
import { isDraughtProduct } from "./draught-gauge";
import { caseSizeOf, unitNoun } from "./packaged";
import { ML_PER_PINT, stockNow as runDown, type LinePattern, type Basis, basisRate } from "./stock-orders";
import type { AuditBase } from "./venners-audit";

export interface ForecastProduct {
  id: string;
  name: string;
  category?: string | null;
  counting_method?: string | null;
  unit?: string | null;
  size_ml?: number | null;
  pack_size?: number | null;
  container_l?: number | null;
  container_type?: string | null;
}
export interface ForecastReading { product_id: string; ml_remaining: number; reading_at: string }
export interface ForecastDelivery { product_id: string; delivered_at: string; quantity_ml: number | null }

export type RateSource = "counts" | "audit";
export type ForecastStatus = "out" | "low" | "order" | "ok" | "unknown";

export interface Pack { ml: number; one: string; many: string }

export interface LineForecast {
  productId: string;
  status: ForecastStatus;
  source: RateSource | null;
  /** sales speed in ml (or units) a day */
  rate: number;
  /** estimated stock now in ml */
  nowMl: number;
  daysLeft: number;
  orderQty: number;
  pack: Pack;
  /** "Lasts 9 days · order 2 cases of 24" */
  label: string;
  /** "Sells about 31 bottles a week (from your counts)" */
  detail: string;
}

const DAY = 864e5;
const MIN_GOOD_SPAN = 7;
const MIN_ANY_SPAN = 3;

function isUnitLine(p: ForecastProduct): boolean {
  return ["each", "count", "dozen"].includes(p.counting_method ?? "") || (!p.counting_method && p.unit === "count");
}
function isLitreLine(p: ForecastProduct): boolean {
  return p.counting_method === "litre" || p.category === "postmix";
}
/** ml of one single unit (a bottle, can or bag). Unit lines with no size store 1 per unit. */
export function unitMl(p: ForecastProduct): number {
  return p.size_ml && p.size_ml > 0 ? p.size_ml : 1;
}

/** What the line is ordered in. */
export function orderPack(p: ForecastProduct): Pack {
  if (isDraughtProduct(p as any)) {
    const cask = p.container_type === "cask" || p.counting_method === "dipstick";
    return { ml: draughtCapacityMl(p.container_l), one: cask ? "cask" : "keg", many: cask ? "casks" : "kegs" };
  }
  if (isLitreLine(p)) {
    if (p.category === "postmix" || p.container_l) return { ml: litreContainerMl(p as any), one: "box", many: "boxes" };
    return { ml: unitMl(p) > 1 ? unitMl(p) : 1000, one: "bottle", many: "bottles" };
  }
  if (isUnitLine(p)) {
    const cs = p.counting_method === "dozen" ? (p.pack_size && p.pack_size > 1 ? p.pack_size : 12) : caseSizeOf(p);
    if (cs) return { ml: cs * unitMl(p), one: `case of ${cs}`, many: `cases of ${cs}` };
    return { ml: unitMl(p), one: unitNoun(p, 1), many: unitNoun(p, 2) };
  }
  return { ml: p.size_ml && p.size_ml > 0 ? p.size_ml : 700, one: "bottle", many: "bottles" };
}

/** An audit line's sales a day (in its own base unit) → ml a day for this product. */
export function auditRateToMl(ratePerDay: number, base: AuditBase, p: ForecastProduct): number {
  switch (base) {
    case "pints": return ratePerDay * ML_PER_PINT;
    case "units": return ratePerDay * unitMl(p);
    case "bottles": return ratePerDay * (p.size_ml && p.size_ml > 0 ? p.size_ml : 700);
    case "litres": return ratePerDay * 1000;
    case "ml": return ratePerDay;
  }
}

/** ml (as counts and deliveries store it) → an audit line's base unit for this product. */
export function mlToAuditBase(ml: number, base: AuditBase, p: ForecastProduct): number {
  return ml / auditRateToMl(1, base, p);
}

/**
 * Sales speed from the pub's own counts: the newest count and the most recent earlier count at
 * least `minDays` before it. Returns null when there's no such pair or the sum doesn't make sense.
 */
export function countRate(
  history: ForecastReading[],
  deliveries: ForecastDelivery[],
  minDays: number,
): { rate: number; days: number } | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => b.reading_at.localeCompare(a.reading_at));
  const latest = sorted[0];
  const lt = Date.parse(latest.reading_at);
  const prev = sorted.find(r => (lt - Date.parse(r.reading_at)) / DAY >= minDays);
  if (!prev) return null;
  const pt = Date.parse(prev.reading_at);
  const delivered = deliveries
    .filter(d => { const t = Date.parse(d.delivered_at); return t > pt && t <= lt; })
    .reduce((s, d) => s + (Number(d.quantity_ml) || 0), 0);
  const used = Number(prev.ml_remaining) + delivered - Number(latest.ml_remaining);
  const days = (lt - pt) / DAY;
  if (!(days > 0) || used < 0) return null;
  return { rate: used / days, days };
}

function plural(n: number, one: string, many: string) { return `${n} ${n === 1 ? one : many}`; }

/** "31 bottles", "220 pints", "1.4 bottles", "12 L" — a week's sales in words. */
export function weekAmount(p: ForecastProduct, ratePerDay: number): string {
  const wk = ratePerDay * 7;
  if (isDraughtProduct(p as any)) return `${Math.round(wk / ML_PER_PINT)} pints`;
  if (isLitreLine(p)) return `${Math.round(wk / 100) / 10} L`;
  if (isUnitLine(p)) { const n = Math.round(wk / unitMl(p)); return `${n} ${unitNoun(p, n)}`; }
  const b = Math.round((wk / (p.size_ml && p.size_ml > 0 ? p.size_ml : 700)) * 10) / 10;
  return `${b} ${b === 1 ? "bottle" : "bottles"}`;
}

export interface ForecastInput {
  product: ForecastProduct;
  /** this line's counts, any order (closed stocktakes, spot checks, line checks) */
  history: ForecastReading[];
  /** this line's deliveries */
  deliveries: ForecastDelivery[];
  /** sales a day from the audits, already in ml, or null */
  auditRateMl: number | null;
  coverDays: number;
  now?: number;
}

export function forecastLine(input: ForecastInput): LineForecast {
  const { product: p, history, deliveries, auditRateMl, coverDays } = input;
  const now = input.now ?? Date.now();
  const pack = orderPack(p);
  const good = countRate(history, deliveries, MIN_GOOD_SPAN);
  const any = good ?? countRate(history, deliveries, MIN_ANY_SPAN);
  let rate = 0; let source: RateSource | null = null;
  if (good && good.rate > 0) { rate = good.rate; source = "counts"; }
  else if (auditRateMl != null && auditRateMl > 0) { rate = auditRateMl; source = "audit"; }
  else if (any && any.rate > 0) { rate = any.rate; source = "counts"; }

  const latest = [...history].sort((a, b) => b.reading_at.localeCompare(a.reading_at))[0];
  const base: LineForecast = { productId: p.id, status: "unknown", source, rate, nowMl: 0, daysLeft: Infinity, orderQty: 0, pack, label: "", detail: "" };

  if (!latest) {
    base.label = "Not counted yet";
    base.detail = rate > 0 ? `Sells about ${weekAmount(p, rate)} a week` : "";
    return base;
  }
  const lt = Date.parse(latest.reading_at);
  const sinceDays = Math.max(0, (now - lt) / DAY);
  const after = deliveries
    .filter(d => Date.parse(d.delivered_at) > lt)
    .map(d => ({ day: (Date.parse(d.delivered_at) - lt) / DAY, qty: Number(d.quantity_ml) || 0 }));
  const nowMl = Math.max(0, runDown(Number(latest.ml_remaining), rate, sinceDays, after));
  base.nowMl = nowMl;

  if (!(rate > 0)) {
    base.label = "No sales speed yet";
    base.detail = "Count it again in a week, or add a stock audit";
    return base;
  }
  const daysLeft = nowMl / rate;
  const need = rate * coverDays - nowMl;
  const orderQty = need > 0 && pack.ml > 0 ? Math.ceil(need / pack.ml - 1e-9) : 0;
  const status: ForecastStatus = nowMl <= 0.5 ? "out" : daysLeft < Math.min(7, coverDays) ? "low" : orderQty > 0 ? "order" : "ok";
  const lasts = status === "out" ? "Probably out now"
    : daysLeft < 1 ? "Lasts under a day"
    : daysLeft >= 60 ? "Lasts 60+ days"
    : `Lasts ${Math.floor(daysLeft)} ${Math.floor(daysLeft) === 1 ? "day" : "days"}`;
  const label = orderQty > 0 ? `${lasts} · order ${plural(orderQty, pack.one, pack.many)}` : `${lasts} · no order needed`;
  return {
    ...base, status, daysLeft, orderQty, label,
    detail: `Sells about ${weekAmount(p, rate)} a week (${source === "counts" ? "from your counts" : "from your stock audits"})`,
  };
}

/** Audit sales a day per product id, in ml, using the same settings as the Orders page. */
export function auditRatesByProduct(
  patterns: Map<string, LinePattern>,
  order: Parameters<typeof basisRate>[1],
  basis: Basis,
  busyPct: number,
  productForKey: (key: string) => ForecastProduct | null,
): Map<string, number> {
  const out = new Map<string, number>();
  patterns.forEach((pat, key) => {
    const p = productForKey(key);
    if (!p) return;
    const r = basisRate(pat, order, basis) * (1 + busyPct / 100);
    if (r > 0) out.set(p.id, (out.get(p.id) ?? 0) + auditRateToMl(r, pat.base, p));
  });
  return out;
}
