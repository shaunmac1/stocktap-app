/**
 * The draught lines of a stocktake laid out like a Venners sheet:
 * Product · Unit "Gallon 8 Pint" · Whole (gallons) · Part (pints 0–7),
 * with each spot (Cellar, Outside store) alongside so it can be checked against the auditor's.
 */
import { pintsToGauge } from "./draught-gauge";

const ML_PER_PINT = 568.261;
const ORDER = ["draught_ale", "draught_cider", "draught_lager", "draught_stout"];
const LABEL: Record<string, string> = { draught_ale: "Draught Ale", draught_cider: "Draught Cider", draught_lager: "Draught Lager", draught_stout: "Draught Stout" };

export interface SheetEntry { ml_remaining: number; count_location_name?: string | null; full_containers?: number | null }
export interface SheetProduct { id: string; name: string; category?: string | null; counting_method?: string | null; container_l?: number | null }
export interface DraughtSheetRow {
  category: string; name: string; unit: "Gallon 8 Pint";
  whole: number; part: number; pints: number;
  spots: { name: string; whole: number; part: number }[];
}

export const isDraughtLine = (p: SheetProduct) =>
  (p.category ?? "").startsWith("draught_") || ["keg_weight", "dipstick", "tenths_pints"].includes(p.counting_method ?? "");

export function buildDraughtSheet(lines: { prod: SheetProduct; entries: SheetEntry[] }[]): DraughtSheetRow[] {
  const rows = lines.filter(l => isDraughtLine(l.prod) && l.entries.length > 0).map(l => {
    const totalPints = l.entries.reduce((a, e) => a + (e.ml_remaining ?? 0), 0) / ML_PER_PINT;
    const t = pintsToGauge(totalPints);
    const bySpot = new Map<string, number>();
    for (const e of l.entries) {
      const n = !e.count_location_name || e.count_location_name === "Unspecified" ? "No specific spot" : e.count_location_name;
      bySpot.set(n, (bySpot.get(n) ?? 0) + (e.ml_remaining ?? 0) / ML_PER_PINT);
    }
    return {
      category: LABEL[l.prod.category ?? ""] ?? "Draught",
      name: l.prod.name, unit: "Gallon 8 Pint" as const,
      whole: t.gallons, part: t.pints, pints: Math.round(totalPints),
      spots: [...bySpot.entries()].map(([name, p]) => { const g = pintsToGauge(p); return { name, whole: g.gallons, part: g.pints }; }),
    };
  });
  const rank = (c: string) => { const i = ORDER.findIndex(k => LABEL[k] === c); return i < 0 ? 99 : i; };
  return rows.sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
}

const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function draughtSheetCsv(rows: DraughtSheetRow[], venue: string, date: string): string {
  const spotNames = [...new Set(rows.flatMap(r => r.spots.map(s => s.name)))];
  const head = ["Category", "Product", "Unit", "Whole", "Part", "Pints", ...spotNames.flatMap(n => [`${n} whole`, `${n} part`])];
  const body = rows.map(r => [r.category, r.name, r.unit, r.whole, r.part, r.pints, ...spotNames.flatMap(n => { const s = r.spots.find(x => x.name === n); return s ? [s.whole, s.part] : [0, 0]; })]);
  return [[`${venue} draught count`, date].map(esc).join(","), head.map(esc).join(","), ...body.map(r => r.map(esc).join(","))].join("\n") + "\n";
}
