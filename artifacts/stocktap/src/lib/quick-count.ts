/**
 * The two-minute first count: tap 5 bottles you can see, say how full each is by eye, and get a
 * number. No product list to build, no scale, no prices to type first.
 */
import { soldUnitMl } from "./till-matching";
import type { ReportProductLike } from "./inventory-reporting";

export const QUICK_TARGET = 5;

/** What's on most UK back bars. One tap each; the top catalogue match for each is offered. */
export const QUICK_PICK_NAMES = [
  "Smirnoff", "Gordons", "Jack Daniels", "Bacardi", "Captain Morgan", "Bells",
  "Baileys", "Jagermeister", "Jameson", "Absolut", "Malibu", "Tanqueray",
] as const;

const FLAG = "stocktap:quick-count";
/** A quick count has bottles in tenths by default (no scale needed). The Weigh switch is still there. */
export function setQuickCount(on: boolean) { try { on ? localStorage.setItem(FLAG, "1") : localStorage.removeItem(FLAG); } catch { /* storage blocked */ } }
export function isQuickCount(): boolean { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } }

export interface BarLine { prod: ReportProductLike & { pour_price?: number | null; unit?: string | null }; mlRemaining: number; count?: number | null }

/**
 * What the counted stock would take over the bar at the pub's own sell prices:
 * measures (or pints, glasses, bottles) left × the price of one. Lines with no sell price are
 * left out and counted, so the figure is never padded.
 */
export function overTheBar(lines: BarLine[], venueMeasureMl: number | null | undefined): { value: number; priced: number; unpriced: number } {
  let value = 0, priced = 0, unpriced = 0;
  for (const l of lines) {
    const price = Number(l.prod.pour_price) || 0;
    if (!(price > 0)) { unpriced++; continue; }
    const unit = soldUnitMl(l.prod, venueMeasureMl && venueMeasureMl > 0 ? venueMeasureMl : 25);
    // Sold whole (a bottle of J2O, a bag of crisps): one item per unit counted.
    const sold = unit == null
      ? (l.count != null ? l.count : (l.prod.size_ml && l.prod.size_ml > 0 ? l.mlRemaining / l.prod.size_ml : l.mlRemaining))
      : Math.floor(l.mlRemaining / unit + 1e-6);
    value += Math.max(0, sold) * price;
    priced++;
  }
  return { value, priced, unpriced };
}
