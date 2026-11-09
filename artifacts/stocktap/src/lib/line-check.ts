/**
 * Daily line check: what went since the last count, against what the till says.
 *   last count + delivered since − today's count = gone
 *   gone − till sold = missing (positive) or over-rung (negative)
 * Draught reads in pints and gallons; everything else in its own measure.
 */
import { formatGauge } from "./draught-gauge";

const ML_PER_PINT = 568.261;
export interface LineCheckInput {
  lastMl: number; deliveredMl: number; nowMl: number;
  tillUnits: number | null; unitMl: number; draught: boolean; pricePerUnit?: number | null;
  /** Pints poured away on purpose (line cleaning, a bad barrel): not missing. */
  wasteMl?: number;
}
export interface LineCheckResult {
  goneMl: number; goneUnits: number; missingUnits: number | null; missingMl: number | null; missingValue: number | null;
  label: (ml: number) => string;
}

export function lineCheck(i: LineCheckInput): LineCheckResult {
  const goneMl = i.lastMl + Math.max(0, i.deliveredMl) - i.nowMl;
  const goneUnits = i.unitMl > 0 ? goneMl / i.unitMl : 0;
  const wasteUnits = i.unitMl > 0 ? Math.max(0, i.wasteMl ?? 0) / i.unitMl : 0;
  const missingUnits = i.tillUnits == null ? null : goneUnits - wasteUnits - i.tillUnits;
  const missingMl = missingUnits == null ? null : missingUnits * i.unitMl;
  const missingValue = missingUnits != null && i.pricePerUnit ? missingUnits * i.pricePerUnit : null;
  const label = (ml: number) => {
    if (i.draught) { const p = Math.round(ml / ML_PER_PINT); return `${p} ${Math.abs(p) === 1 ? "pint" : "pints"} · ${formatGauge(Math.abs(ml) / ML_PER_PINT)}`; }
    return `${(ml / i.unitMl).toFixed(1)} measures`;
  };
  return { goneMl, goneUnits, missingUnits, missingMl, missingValue, label };
}

/** How often a line has come up short lately: "short 3 of the last 4 checks". */
export function shortPattern(history: { missing_ml: number | null; unit_ml: number }[]): string | null {
  const done = history.filter(h => h.missing_ml != null).slice(0, 5);
  if (done.length < 3) return null;
  const short = done.filter(h => (h.missing_ml as number) / h.unit_ml > 0.5).length;
  return short >= 3 ? `short ${short} of the last ${done.length} checks` : null;
}
