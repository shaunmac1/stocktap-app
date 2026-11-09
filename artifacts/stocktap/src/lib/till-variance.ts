/**
 * Till variance between two counts: what the till says was sold against what the counts say
 * was used, per product, in stock units and in £ at cost and at sale price.
 *
 *   used by counts  = opening count + deliveries in between − closing count
 *   unexplained     = used by counts − recorded wastage − sold on the till
 *
 * Positive unexplained = more stock went than the till accounts for (over-pouring, freebies,
 * spillage, drinks not rung in, theft). Negative = the till sold more than went (wrong button,
 * a delivery not entered, a miscount). Same sign as calcVariance(soldByWeight, tillSold).
 *
 * Reuses the count maths the order list already uses (readingBase / deliveredBase), so a pint
 * here is the same pint as on the Orders screen.
 */
import { baseFor, readingBase, type CountDelivery, type CountProduct, type CountReading } from "./count-audits";
import { deliveredBase, formatBase } from "./stock-orders";
import type { AuditBase } from "./venners-audit";
import { calcVariance, ML_PER_PINT, postmixDrinkLitresPerBox, productCapacityMl } from "./calculations";
import { soldUnitMl } from "./till-matching";

export interface VarianceProduct extends CountProduct {
  type?: string | null;
  unit?: string | null;
  cost_price?: number | null;
  pour_price?: number | null;
  measure_ml?: number | null;
}

export interface VarianceSale { product_id: string | null; quantity_sold: number; revenue_pence: number | null }
export interface VarianceWastage { product_id: string; quantity_ml: number; moved_at: string; movement_type?: string }

export interface VarianceTolerance {
  /** Flag when the gap is more than this share of what was used (0.03 = 3%). */
  pct: number;
  /** ...and more than this many base units (pints / litres / items), whichever is bigger. */
  minPints: number;
  minLitres: number;
  minUnits: number;
  /** For bottles (spirits, wine), the floor is in measures / glasses. */
  minServes: number;
}

export const DEFAULT_TOLERANCE: VarianceTolerance = { pct: 0.03, minPints: 2, minLitres: 1, minUnits: 2, minServes: 2 };

export type VarianceStatus = "ok" | "loss" | "over" | "not_counted";

export interface VarianceRow {
  productId: string;
  name: string;
  base: AuditBase;
  opening: number | null;
  deliveries: number;
  closing: number | null;
  wastage: number;
  usedByCounts: number | null;
  soldOnTill: number;
  tillValue: number | null;
  /** used − wastage − till, in base units. Null when not counted at both ends. */
  unexplained: number | null;
  atCost: number | null;
  atSale: number | null;
  tolerance: number | null;
  status: VarianceStatus;
}

export interface VarianceInput {
  products: VarianceProduct[];
  opening: { id: string; closed_at: string };
  closing: { id: string; closed_at: string };
  readings: CountReading[];
  deliveries: CountDelivery[];
  wastage?: VarianceWastage[];
  sales: VarianceSale[];
  defaultMeasureMl: number;
  tolerance?: VarianceTolerance;
}

/** How much of the base unit one sold unit (pint / measure / glass / item) is. */
export function soldUnitInBase(p: VarianceProduct, defaultMeasureMl: number): number {
  const base = baseFor(p);
  const unitMl = soldUnitMl(p, defaultMeasureMl);
  if (unitMl == null) return 1;
  switch (base) {
    case "pints": return unitMl / ML_PER_PINT;
    case "litres": return unitMl / 1000;
    case "units": return p.size_ml ? unitMl / p.size_ml : 1;
    case "bottles": return p.size_ml ? unitMl / p.size_ml : 1;
    case "ml": return unitMl;
  }
}

/** Base units in one purchase unit (keg, box, case, bottle) — to turn cost price into cost per base unit. */
export function basePerPurchaseUnit(p: VarianceProduct): number | null {
  switch (baseFor(p)) {
    case "pints": return p.container_l ? (p.container_l * 1000) / ML_PER_PINT : null;
    case "litres": {
      if (p.category === "postmix") return postmixDrinkLitresPerBox(p);
      const ml = productCapacityMl(p);
      return ml > 0 ? ml / 1000 : null;
    }
    case "units": return p.counting_method === "dozen" ? (p.pack_size ?? 12) : 1;
    case "bottles": return 1;
    case "ml": return p.size_ml ?? null;
  }
}

export function costPerBase(p: VarianceProduct): number | null {
  const per = basePerPurchaseUnit(p);
  if (p.cost_price == null || !per) return null;
  return p.cost_price / per;
}

/** Wastage is stored as ml of purchase volume, like deliveries. */
function wastageBase(p: VarianceProduct, ml: number): number {
  switch (baseFor(p)) {
    case "pints": return ml / ML_PER_PINT;
    case "litres": return ml / 1000;
    case "ml": return ml;
    case "units": {
      const cap = productCapacityMl(p);
      if (p.counting_method === "dozen") return cap > 0 ? (ml / cap) * (p.pack_size ?? 12) : 0;
      return cap > 0 ? ml / cap : 0;
    }
    case "bottles": return p.size_ml ? ml / p.size_ml : 0;
  }
}

export function toleranceFor(p: VarianceProduct, used: number, tol: VarianceTolerance, defaultMeasureMl: number): number {
  const base = baseFor(p);
  const floor = base === "pints" ? tol.minPints
    : base === "litres" ? tol.minLitres
    : base === "units" ? tol.minUnits
    : tol.minServes * soldUnitInBase(p, defaultMeasureMl);
  return Math.max(Math.abs(used) * tol.pct, floor);
}

// 6 dp: a 25ml measure is 0.0357 of a bottle, so fewer places would blur spirits.
const r4 = (v: number) => Math.round(v * 1e6) / 1e6;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function buildTillVariance(input: VarianceInput): VarianceRow[] {
  const tol = input.tolerance ?? DEFAULT_TOLERANCE;
  const A = input.opening, B = input.closing;
  const byId = new Map(input.products.map(p => [p.id, p]));
  const open = new Map<string, number>(), close = new Map<string, number>();
  for (const r of input.readings) {
    const p = byId.get(r.product_id); if (!p) continue;
    const m = r.stocktake_id === A.id ? open : r.stocktake_id === B.id ? close : null;
    if (!m) continue;
    m.set(r.product_id, (m.get(r.product_id) ?? 0) + readingBase(p, r));
  }
  const sold = new Map<string, { units: number; pence: number; hasValue: boolean }>();
  for (const s of input.sales) {
    if (!s.product_id || !byId.has(s.product_id)) continue;
    const e = sold.get(s.product_id) ?? { units: 0, pence: 0, hasValue: false };
    e.units += Number(s.quantity_sold) || 0;
    if (s.revenue_pence != null) { e.pence += Number(s.revenue_pence) || 0; e.hasValue = true; }
    sold.set(s.product_id, e);
  }
  const ids = new Set<string>([...sold.keys(), ...[...open.keys()].filter(k => close.has(k))]);
  const rows: VarianceRow[] = [];
  for (const pid of ids) {
    const p = byId.get(pid)!;
    const base = baseFor(p);
    const del = input.deliveries
      .filter(d => d.product_id === pid && d.delivered_at > A.closed_at && d.delivered_at <= B.closed_at)
      .reduce((s, d) => s + deliveredBase(d as any, base, p), 0);
    const waste = (input.wastage ?? [])
      .filter(w => w.product_id === pid && (w.movement_type ?? "wastage") === "wastage" && w.moved_at > A.closed_at && w.moved_at <= B.closed_at)
      .reduce((s, w) => s + wastageBase(p, Number(w.quantity_ml) || 0), 0);
    const sale = sold.get(pid);
    const tillBase = sale ? sale.units * soldUnitInBase(p, input.defaultMeasureMl) : 0;
    const tillValue = sale?.hasValue ? sale.pence / 100 : null;
    const counted = open.has(pid) && close.has(pid);
    const opening = open.has(pid) ? open.get(pid)! : null;
    const closing = close.has(pid) ? close.get(pid)! : null;
    const used = counted ? opening! + del - closing! : null;
    const unexplained = used != null ? calcVariance(used - waste, tillBase) : null;
    const cpb = costPerBase(p);
    // Sale price: what the till actually charged per unit, else the library price.
    const spb = tillValue != null && tillBase > 0 ? tillValue / tillBase
      : p.pour_price != null ? p.pour_price / soldUnitInBase(p, input.defaultMeasureMl) : null;
    const tolerance = used != null ? toleranceFor(p, Math.max(used, tillBase), tol, input.defaultMeasureMl) : null;
    let status: VarianceStatus = "not_counted";
    if (unexplained != null && tolerance != null) status = Math.abs(unexplained) <= tolerance ? "ok" : unexplained > 0 ? "loss" : "over";
    rows.push({
      productId: pid, name: p.name, base,
      opening: opening != null ? r4(opening) : null, deliveries: r4(del), closing: closing != null ? r4(closing) : null,
      wastage: r4(waste), usedByCounts: used != null ? r4(used) : null, soldOnTill: r4(tillBase), tillValue,
      unexplained: unexplained != null ? r4(unexplained) : null,
      atCost: unexplained != null && cpb != null ? r2(unexplained * cpb) : null,
      atSale: unexplained != null && spb != null ? r2(unexplained * spb) : null,
      tolerance: tolerance != null ? r4(tolerance) : null,
      status,
    });
  }
  const rank = (r: VarianceRow) => (r.status === "not_counted" ? -1 : Math.abs(r.atSale ?? r.atCost ?? r.unexplained ?? 0));
  return rows.sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
}

export interface VarianceTotals { atCost: number; atSale: number; flagged: number; compared: number; notCounted: number }

export function varianceTotals(rows: VarianceRow[]): VarianceTotals {
  return rows.reduce<VarianceTotals>((t, r) => {
    if (r.status === "not_counted") { t.notCounted++; return t; }
    t.compared++;
    if (r.status !== "ok") t.flagged++;
    t.atCost = r2(t.atCost + (r.atCost ?? 0));
    t.atSale = r2(t.atSale + (r.atSale ?? 0));
    return t;
  }, { atCost: 0, atSale: 0, flagged: 0, compared: 0, notCounted: 0 });
}

/**
 * Show an amount the way the bar thinks about it: draught in pints, spirits in measures,
 * wine in glasses, everything else in items / litres.
 */
export function describeAmount(x: number, p: VarianceProduct, defaultMeasureMl: number, signed = false): string {
  const base = baseFor(p);
  if (base === "bottles") {
    const per = soldUnitInBase(p, defaultMeasureMl);
    if (per > 0 && per < 1) {
      const serves = x / per;
      const s = signed && serves > 0.05 ? "+" : serves < -0.05 ? "−" : "";
      const isWine = p.type === "wine" || p.type === "sparkling" || p.category === "wines";
      const n = Math.round(Math.abs(serves) * 10) / 10;
      return `${s}${n} ${isWine ? (n === 1 ? "glass" : "glasses") : n === 1 ? "measure" : "measures"}`;
    }
  }
  if (base === "pints" && Math.abs(x) < 100) {
    // "8 pints down" reads better than "1 gal 0 pt" for a till gap; gallons only for big amounts.
    const n = Math.round(Math.abs(x) * 10) / 10;
    const s = signed && x > 0.05 ? "+" : x < -0.05 ? "−" : "";
    return `${s}${n} pt`;
  }
  if (base === "units") {
    const n = Math.round(Math.abs(x) * 10) / 10;
    const s = signed && x > 0.05 ? "+" : x < -0.05 ? "−" : "";
    return `${s}${n}`;
  }
  return formatBase(x, base, signed);
}
