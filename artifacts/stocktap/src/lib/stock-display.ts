import { packagedBreakdown } from "./packaged";
import { draughtBreakdown } from "./draught-gauge";
import {
  ML_PER_PINT,
  calcTenths,
  formatGallonsPints,
  litreContainerMl,
} from "./calculations";

/**
 * One place that decides how a counted quantity reads on screen, so a can of
 * Tango never shows up as "420 tenths" and a keg always shows gallons and pints.
 */

export interface DisplayProduct {
  name?: string | null;
  counting_method?: string | null;
  category?: string | null;
  size_ml?: number | null;
  pack_size?: number | null;
  container_l?: number | null;
  container_type?: string | null;
  cost_price?: number | null;
  /** Keg size before an edit — only used to re-work dipstick counts. */
  old_container_l?: number | null;
}

export interface DisplayEntry {
  method: string;
  full_containers: number | null;
  part_value: number | null;
  ml_remaining: number;
}

export type QuantityKind = "draught" | "units" | "litres" | "bottles";

export interface QuantityDisplay {
  kind: QuantityKind;
  /** Big number, e.g. "18 gal 0 pt", "42", "14.6", "13.0" */
  main: string;
  /** Unit after the big number ("" when main already carries it) */
  unit: string;
  /** Short one-line version for list rows, e.g. "42 units" */
  short: string;
  /** Secondary line, e.g. "144 pints · 81.8L" or "330ml each" */
  detail: string;
  /** £ value at cost, or null when there is no cost price */
  value: number | null;
}

const DRAUGHT_METHODS = new Set(["keg_weight", "dipstick", "tenths_pints"]);

export function quantityKind(method: string | null | undefined, category?: string | null): QuantityKind {
  if (method && DRAUGHT_METHODS.has(method)) return "draught";
  if (method === "each" || method === "dozen" || method === "count") return "units";
  if (method === "litre") return "litres";
  if (!method && category && category.startsWith("draught_")) return "draught";
  if (!method && (category === "minerals" || category === "packaged")) return "units";
  if (!method && category === "postmix") return "litres";
  return "bottles";
}

/** Units in one entry: each/count = the number typed; dozen = packs × pack size + loose. */
export function entryUnits(entry: DisplayEntry, product: DisplayProduct): number {
  if (entry.method === "dozen") {
    return (entry.full_containers ?? 0) * (product.pack_size ?? 12) + (entry.part_value ?? 0);
  }
  if (entry.method === "each" || entry.method === "count") return entry.part_value ?? 0;
  // Fallback for a unit-type product counted another way: derive from ml.
  return entry.ml_remaining / (product.size_ml || 1);
}

function trim(n: number, dp = 2): string {
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return Number.isInteger(r) ? String(r) : String(r);
}

/**
 * Describe the quantity held in a set of entries (one entry, or every entry for a
 * product). The method comes from the saved entries, falling back to the product.
 */
export function describeQuantity(product: DisplayProduct, entries: DisplayEntry[]): QuantityDisplay {
  const method = entries[0]?.method ?? product.counting_method ?? null;
  const kind = quantityKind(method, product.category);
  const totalMl = entries.reduce((s, e) => s + (e.ml_remaining ?? 0), 0);
  const cost = product.cost_price ?? null;

  if (kind === "draught") {
    const pints = totalMl / ML_PER_PINT;
    const capMl = (product.container_l ?? 0) * 1000;
    const kegs = capMl > 0 ? totalMl / capMl : null;
    const gp = formatGallonsPints(pints);
    return {
      kind,
      main: gp,
      unit: "",
      short: gp,
      // "872 pints · 109 gal 0 pt · 9.9 kegs": every way a landlord counts it, side by side.
      detail: draughtBreakdown(pints, product.container_l ?? null, product.container_type === "cask" ? "cask" : "keg"),
      value: cost != null && capMl > 0 ? (totalMl / capMl) * cost : null,
    };
  }

  if (kind === "units") {
    const units = entries.reduce((s, e) => s + entryUnits(e, product), 0);
    const u = trim(units, 2);
    const isDozen = method === "dozen";
    const pack = product.pack_size ?? 12;
    const value = cost == null ? null : isDozen ? (units / (pack || 12)) * cost : units * cost;
    return {
      kind,
      main: u,
      unit: units === 1 ? "unit" : "units",
      short: `${u} ${units === 1 ? "unit" : "units"}`,
      // Counted each: "79 bottles · 6 doz 7 · 3 cases + 7", like the draught lines.
      detail: !isDozen && (method === "each" || method === "count")
        ? packagedBreakdown(units, product)
        : product.size_ml ? `${product.size_ml}ml each` : "",
      value,
    };
  }

  if (kind === "litres") {
    const litres = totalMl / 1000;
    const capMl = litreContainerMl(product);
    const isPostmix = product.category === "postmix";
    const boxes = isPostmix ? totalMl / capMl : product.container_l && product.container_l > 0 ? totalMl / (product.container_l * 1000) : null;
    const l = trim(litres, 2);
    return {
      kind,
      main: l,
      unit: "L",
      short: `${l} L`,
      detail: boxes == null ? "" : isPostmix
        ? `= ${trim(boxes, 2)} ${trim(boxes, 2) === "1" ? "box" : "boxes"} (${trim(capMl / 1000, 1)}L of drink a box)`
        : `= ${trim(boxes, 2)} ${trim(boxes, 2) === "1" ? "box" : "boxes"} of ${trim(product.container_l!, 1)}L`,
      value: cost != null ? (totalMl / capMl) * cost : null,
    };
  }

  // Bottles counted by tenths / weight / photo. Shown as bottles to one decimal place —
  // 1.3 btl is "1 and 3 tenths", and 33 bottles reads as 33.0 btl, not "330 tenths".
  const size = product.size_ml ?? 700;
  const tenths = calcTenths(totalMl, size);
  const bottles = (tenths / 10).toFixed(1);
  return {
    kind,
    main: bottles,
    unit: bottles === "1.0" ? "bottle" : "bottles",
    short: `${bottles} btl`,
    detail: `${tenths.toFixed(1)} tenths · ${Math.round(totalMl)}ml`,
    value: cost != null && size > 0 ? (totalMl / size) * cost : null,
  };
}

/**
 * Re-work the ml for an entry from what was typed, using the product's current size.
 * Used when a size is corrected after counting (e.g. a can that was saved as 700ml).
 * Returns null when the method stores something that doesn't depend on unit size.
 */
export function recomputeEntryMl(entry: DisplayEntry, product: DisplayProduct): number | null {
  if (entry.method === "each" || entry.method === "count") {
    return (entry.part_value ?? 0) * (product.size_ml || 1);
  }
  if (entry.method === "dozen") {
    return entryUnits(entry, product) * (product.size_ml || 1);
  }
  // Draught typed as full kegs + the part keg: the full kegs follow the keg size.
  // Draught typed as a total in gallons + pints is saved with full_containers = null,
  // so it doesn't change when the keg size does.
  const capMl = (product.container_l ?? 0) * 1000;
  if (entry.method === "keg_weight") {
    if (entry.full_containers == null || capMl <= 0) return null;
    return entry.full_containers * capMl + (entry.part_value ?? 0) * ML_PER_PINT;
  }
  if (entry.method === "tenths_pints") {
    if (capMl <= 0) return null;
    return (entry.full_containers ?? 0) * capMl + ((entry.part_value ?? 0) / 10) * capMl;
  }
  if (entry.method === "dipstick") {
    // The part keg is a dip reading, a share of the full depth; the ratio holds.
    const fullOld = entry.full_containers ?? 0;
    const oldCapMl = (product.old_container_l ?? 0) * 1000;
    if (capMl <= 0 || oldCapMl <= 0) return null;
    const partOld = entry.ml_remaining - fullOld * oldCapMl;
    return fullOld * capMl + (partOld / oldCapMl) * capMl;
  }
  return null;
}

/** A delivered or moved amount in the product's own terms: "4 kegs · 88 gal 0 pt", "48 units", "24 L", "12.0 btl". */
export function describeMovedMl(product: DisplayProduct, ml: number): string {
  const kind = quantityKind(product.counting_method ?? null, product.category);
  if (kind === "draught") {
    const cap = (product.container_l ?? 0) * 1000;
    const gp = formatGallonsPints(ml / ML_PER_PINT);
    if (cap > 0) {
      const kegs = Math.round((ml / cap) * 100) / 100;
      return `${kegs} ${product.container_type === "cask" ? (kegs === 1 ? "cask" : "casks") : kegs === 1 ? "keg" : "kegs"} · ${gp}`;
    }
    return gp;
  }
  if (kind === "units") {
    const u = Math.round((ml / (product.size_ml || 1)) * 100) / 100;
    return `${u} ${u === 1 ? "unit" : "units"}`;
  }
  if (kind === "litres") {
    // Small bottles or cartridges counted by the litre read better as a count: "1 × 250ml"
    if (!product.container_l && product.size_ml && product.size_ml < 1000) {
      const n = Math.round((ml / product.size_ml) * 100) / 100;
      return `${n} × ${product.size_ml}ml`;
    }
    const l = Math.round(ml / 10) / 100;
    if (product.category === "postmix") {
      const b = Math.round((ml / litreContainerMl(product)) * 100) / 100;
      return `${b} ${b === 1 ? "box" : "boxes"} · ${l} L of drink`;
    }
    const box = product.container_l && product.container_l > 0 ? ` · ${Math.round((ml / (product.container_l * 1000)) * 100) / 100} × ${product.container_l}L box` : "";
    return `${l} L${box}`;
  }
  const size = product.size_ml || 700;
  return `${(ml / size).toFixed(1)} btl`;
}
