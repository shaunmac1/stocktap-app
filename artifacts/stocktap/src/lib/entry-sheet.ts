/**
 * Every counted line of a stocktake laid out the way a stocktaker's sheet (and the pub company's
 * stock system built on the same product list) sets it out: categories A to Z, products A to Z
 * inside each, and a Whole and a Part figure in that line's own unit:
 *   draught  "Gallon 8 Pint"   whole = gallons, part = pints
 *   bottles  "10 70cl"         whole = full bottles, part = tenths
 *   packaged "Dozen 12 Each"   whole = dozens, part = singles
 *   snacks   "Each"            whole = how many
 *   postmix  "Litre"           whole = litres
 * So a count taken on the phone can be typed straight in, top to bottom, without hunting.
 */
import { pintsToGauge } from "./draught-gauge";
import { bottleBreakdown, entryUnits, quantityKind, type DisplayEntry, type DisplayProduct } from "./stock-display";

const ML_PER_PINT = 568.261;

export const SHEET_CATEGORY: Record<string, string> = {
  draught_ale: "Draught Ale", draught_cider: "Draught Cider", draught_lager: "Draught Lager", draught_stout: "Draught Stout",
  minerals: "Minerals", packaged: "Packaged", postmix: "Postmix", spirits: "Spirits", sundry: "Sundry", wines: "Wines",
};

export interface EntrySheetProduct extends DisplayProduct { id: string; name: string }
export interface EntrySheetRow {
  id: string; category: string; name: string;
  /** The sheet's unit column, e.g. "Gallon 8 Pint", "10 70cl", "Dozen 12 Each", "Each", "Litre" */
  unit: string;
  whole: string;
  /** null when the unit has no part figure (Each, Litre) */
  part: string | null;
  wholeLabel: string; partLabel: string | null;
  /** "2 bottles 7 tenths": the same figures said out loud, for the copy and email text */
  spoken: string;
}

/** 700 -> "70cl", 1000 -> "1L", 187 -> "187ml", 1500 -> "1.5L" */
export function sizeLabel(ml: number | null | undefined): string {
  const s = ml && ml > 0 ? ml : 700;
  if (s >= 1000) return `${Math.round(s / 100) / 10}L`;
  return s % 10 === 0 && s >= 200 ? `${s / 10}cl` : `${s}ml`;
}

// Crisps, nuts and scratchings are counted one by one on the sheet, not by the dozen.
const SNACK = /^(crisps|nuts|snacks?|kp\b|pork|scratchings)/i;
const num = (n: number, dp = 2) => { const r = Math.round(n * 10 ** dp) / 10 ** dp; return String(r); };
const plural = (n: number | string, one: string, many: string) => `${n} ${String(n) === "1" ? one : many}`;

export function buildEntrySheet(lines: { prod: EntrySheetProduct; entries: (DisplayEntry & { count_location_name?: string | null })[] }[], venueMeasureMl?: number | null): EntrySheetRow[] {
  const rows: EntrySheetRow[] = [];
  for (const { prod, entries } of lines) {
    if (!entries.length) continue;
    const method = entries[0]?.method ?? prod.counting_method ?? null;
    const kind = quantityKind(method, prod.category);
    const totalMl = entries.reduce((s, e) => s + (e.ml_remaining ?? 0), 0);
    const base = { id: prod.id, name: prod.name, category: SHEET_CATEGORY[prod.category ?? ""] ?? "Other" };
    if (kind === "draught") {
      const g = pintsToGauge(totalMl / ML_PER_PINT);
      rows.push({ ...base, unit: "Gallon 8 Pint", whole: String(g.gallons), part: String(g.pints), wholeLabel: "gal", partLabel: "pt", spoken: `${g.gallons} gal ${g.pints} pt` });
    } else if (kind === "units") {
      const units = Math.round(entries.reduce((s, e) => s + entryUnits(e, prod), 0));
      if (SNACK.test(prod.name) || prod.category === "sundry") {
        rows.push({ ...base, unit: "Each", whole: String(units), part: null, wholeLabel: "each", partLabel: null, spoken: `${units} each` });
      } else {
        const doz = Math.floor(units / 12), odd = units - doz * 12;
        rows.push({ ...base, unit: "Dozen 12 Each", whole: String(doz), part: String(odd), wholeLabel: "doz", partLabel: "singles", spoken: `${doz} doz ${odd} (${plural(units, "single", "singles")})` });
      }
    } else if (kind === "litres") {
      const l = num(totalMl / 1000);
      rows.push({ ...base, unit: "Litre", whole: l, part: null, wholeLabel: "litres", partLabel: null, spoken: plural(l, "litre", "litres") });
    } else {
      const b = bottleBreakdown(totalMl, prod, venueMeasureMl);
      const tenths = Number.isInteger(b.tenths) ? String(b.tenths) : `${Math.floor(b.tenths) || ""}½`;
      rows.push({ ...base, unit: `10 ${sizeLabel(prod.size_ml)}`, whole: String(b.whole), part: tenths, wholeLabel: "full", partLabel: "tenths", spoken: `${plural(b.whole, "bottle", "bottles")} ${plural(tenths, "tenth", "tenths")}` });
    }
  }
  const rank = (c: string) => (c === "Other" ? "~" : c);
  return rows.sort((a, b) => rank(a.category).localeCompare(rank(b.category)) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** Plain text for an email or a note: a heading per category, one line per product. */
export function entrySheetText(rows: EntrySheetRow[], venue: string, date: string): string {
  const out = [`${venue} stock count, ${date}`, "Stocktake sheet order. Whole and part for each line.", ""];
  let cat = "";
  for (const r of rows) {
    if (r.category !== cat) { if (cat) out.push(""); cat = r.category; out.push(cat.toUpperCase()); }
    out.push(`${r.name}: ${r.spoken}`);
  }
  return out.join("\n") + "\n";
}

/** Tab-separated, so it pastes into a spreadsheet as proper columns. */
export function entrySheetTsv(rows: EntrySheetRow[]): string {
  return [["Category", "Product", "Unit", "Whole", "Part"], ...rows.map(r => [r.category, r.name, r.unit, r.whole, r.part ?? ""])].map(r => r.join("\t")).join("\n") + "\n";
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function entrySheetCsv(rows: EntrySheetRow[], venue: string, date: string): string {
  return [[`${venue} stock count`, date], ["Category", "Product", "Unit", "Whole", "Part"], ...rows.map(r => [r.category, r.name, r.unit, r.whole, r.part ?? ""])].map(r => r.map(esc).join(",")).join("\n") + "\n";
}

const KEY = (stocktakeId: string) => `stocktap.entered.${stocktakeId}`;
/** Which lines have been ticked as typed in, kept on the phone per stocktake. */
export function readEntered(stocktakeId: string | null | undefined): string[] {
  if (!stocktakeId) return [];
  try { const v = JSON.parse(localStorage.getItem(KEY(stocktakeId)) ?? "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string") : []; } catch { return []; }
}
export function writeEntered(stocktakeId: string | null | undefined, ids: string[]) {
  if (!stocktakeId) return;
  try { localStorage.setItem(KEY(stocktakeId), JSON.stringify(ids)); } catch { /* storage full or blocked: ticks just don't persist */ }
}
