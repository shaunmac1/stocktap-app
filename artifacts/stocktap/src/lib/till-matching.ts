/**
 * Matching till lines (PLU + name) to StockTap products, and working out how much stock one
 * till item uses ("Carling Half" = half a pint, "Gin Double" = two measures).
 *
 * The landlord confirms each match once; the choice is remembered per pub, keyed by till type
 * and PLU (or the till's name for the line when there is no PLU).
 */
import { nameTokens, VARIANTS } from "./delivery-note";
import { ML_PER_PINT, isDraughtCategory } from "./calculations";
import { isDiscreteCountProduct, isDozenProduct, isLitreProduct, isVolumeCountingMethod, type ReportProductLike } from "./inventory-reporting";
import type { TillLine, TillType, GenericMapping } from "./till-import";

export interface MatchProduct extends ReportProductLike {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  external_id?: string | null;
}

// ─── Serves ─────────────────────────────────────────────────────────────────

export type ServeKind =
  | "unit"       // one of whatever the product is sold by (pint, measure, glass, item)
  | "pint" | "half" | "third" | "two_thirds"
  | "single" | "double"
  | "glass125" | "glass175" | "glass250"
  | "bottle"     // a whole bottle (wine sold by the bottle)
  | "each"
  | "custom";

export const SERVE_LABELS: Record<ServeKind, string> = {
  unit: "1 serve",
  pint: "Pint",
  half: "Half",
  third: "Third",
  two_thirds: "Two-thirds",
  single: "Single",
  double: "Double",
  glass125: "Small glass 125ml",
  glass175: "Glass 175ml",
  glass250: "Large glass 250ml",
  bottle: "Whole bottle",
  each: "Each (1 item)",
  custom: "Other amount",
};

/** Guess the serve from the till's wording. Returns null when the name doesn't say. */
export function detectServe(name: string): ServeKind | null {
  const s = ` ${name.toLowerCase().replace(/[^a-z0-9/½⅓⅔.]+/g, " ")} `;
  if (/ (half|hlf|hf|½|1\/2|1\/2pt|1\/2 pt) /.test(s) || /\b1\/2\b/.test(s)) return "half";
  if (/ (2\/3|⅔|two thirds|schooner) /.test(s)) return "two_thirds";
  if (/ (third|1\/3|⅓) /.test(s)) return "third";
  if (/ (dbl|double|dble|x2) /.test(s)) return "double";
  if (/ (sgl|single) /.test(s)) return "single";
  if (/ (lge|large|lg) (gls|glass|wine) /.test(s) || / 250 ?(ml)? /.test(s)) return "glass250";
  if (/ (sml|small|sm) (gls|glass|wine) /.test(s) || / 125 ?(ml)? /.test(s)) return "glass125";
  if (/ (med|medium|std|standard) (gls|glass) /.test(s) || / 175 ?(ml)? /.test(s)) return "glass175";
  if (/ (btl|bottle|bot) /.test(s) && !/ (bottled|btld) /.test(s)) return "bottle";
  if (/ (pint|pt|pnt) /.test(s)) return "pint";
  return null;
}

/** The size of one "sold unit" in ml, matching costPerSoldUnit in inventory-reporting. Null for items. */
export function soldUnitMl(p: ReportProductLike, defaultMeasureMl: number): number | null {
  if (isDozenProduct(p) || isDiscreteCountProduct(p) || p.counting_method === "each") return null;
  if (p.type === "packaged" && !isVolumeCountingMethod(p.counting_method) && !isLitreProduct(p)) return null;
  const isWine = p.type === "wine" || p.type === "sparkling" || p.category === "wines";
  const size = p.size_ml ?? 0;
  if (isWine && size > 0 && size <= 250 && p.measure_ml == null) return size; // single-serve bottle
  if (p.measure_ml) return p.measure_ml;
  if (isVolumeCountingMethod(p.counting_method) || isDraughtCategory(p.category) || isLitreProduct(p)) return ML_PER_PINT;
  if (isWine) return 175;
  return defaultMeasureMl > 0 ? defaultMeasureMl : 25;
}

/** Sensible serve when the till's name doesn't say. */
export function defaultServe(p: ReportProductLike): ServeKind {
  if (soldUnitMl(p, 25) == null) return "each";
  return "unit";
}

/** Which serves make sense for a product (for the picker). */
export function servesFor(p: ReportProductLike): ServeKind[] {
  if (soldUnitMl(p, 25) == null) return ["each", "custom"];
  const draughtLike = isVolumeCountingMethod(p.counting_method) || isDraughtCategory(p.category) || isLitreProduct(p) || p.category === "postmix";
  if (draughtLike) return ["pint", "half", "two_thirds", "third", "custom"];
  const isWine = p.type === "wine" || p.type === "sparkling" || p.category === "wines";
  if (isWine) return ["glass175", "glass125", "glass250", "bottle", "custom"];
  return ["single", "double", "bottle", "custom"];
}

/**
 * How many sold units one till item is. 1 "Carling Half" on a keg line = 0.5 (pints);
 * 1 "Gordons Double" = 2 (measures); 1 "Large Merlot" = 250/175 glasses.
 */
export function perTillItem(p: ReportProductLike, serve: ServeKind, defaultMeasureMl: number, custom?: number | null): number {
  if (serve === "custom") return custom != null && isFinite(custom) && custom > 0 ? custom : 1;
  const unit = soldUnitMl(p, defaultMeasureMl);
  if (unit == null) return 1;
  const measure = p.measure_ml ?? (defaultMeasureMl > 0 ? defaultMeasureMl : 25);
  const ml: Record<Exclude<ServeKind, "custom">, number> = {
    unit,
    pint: ML_PER_PINT,
    half: ML_PER_PINT / 2,
    third: ML_PER_PINT / 3,
    two_thirds: (ML_PER_PINT * 2) / 3,
    single: measure,
    double: measure * 2,
    glass125: 125,
    glass175: 175,
    glass250: 250,
    bottle: p.size_ml ?? 750,
    each: unit,
  };
  return Math.round((ml[serve] / unit) * 10000) / 10000;
}

// ─── Name similarity ───────────────────────────────────────────────────────

/** Till buttons are short and shouty: "CARL PT", "GORD GIN", "SAV BLANC LGE". */
const TILL_ABBREV: Array<[RegExp, string]> = [
  [/\bcarl\b/g, "carling"], [/\bguin\b|\bguiness\b/g, "guinness"], [/\bgord\b|\bgordons?\b/g, "gordon"],
  [/\bstella\b/g, "stella artois"], [/\bfosters?\b/g, "foster"], [/\bjd\b/g, "jack daniel"],
  [/\bsmirn\b/g, "smirnoff"], [/\bbacardi\b/g, "bacardi"], [/\bcapt\b|\bcapn\b/g, "captain"],
  [/\bsav\b|\bsauv\b/g, "sauvignon"], [/\bpg\b|\bpinot g\b/g, "pinot grigio"], [/\bmerl\b/g, "merlot"],
  [/\bchard\b/g, "chardonnay"], [/\bpros\b|\bprosec\b/g, "prosecco"], [/\bcoke\b/g, "coca cola"],
  [/\blemnd\b|\blemo\b/g, "lemonade"], [/\bj2o\b/g, "j2o"], [/\bbulmer\b/g, "bulmers"],
  [/\bmagners?\b/g, "magners"], [/\bpeps\b/g, "pepsi"],
  [/\bc\s?&\s?o\b|\bch\s?&\s?on\b/g, "cheese onion"], [/\bs\s?&\s?v\b/g, "salt vinegar"], [/\br\/?s\b|\bready salt\b/g, "ready salted"],
];

/** Words that describe the serve, not the product. */
const SERVE_WORDS = /\b(pint|pt|pnt|half|hlf|hf|1\/2|third|1\/3|2\/3|schooner|dbl|double|dble|sgl|single|x2|lge|large|lg|sml|small|sm|med|medium|std|standard|gls|glass|btl|bottle|bot|125|175|250|ml|dash|shot)\b/g;

export function tillNameTokens(name: string): string[] {
  let s = ` ${name.toLowerCase()} `;
  for (const [re, rep] of TILL_ABBREV) s = s.replace(re, rep);
  s = s.replace(/½|⅓|⅔/g, " ").replace(SERVE_WORDS, " ");
  return nameTokens(s);
}

function tokenHit(t: string, set: Set<string>): boolean {
  if (set.has(t)) return true;
  if (t.length >= 3) for (const x of set) {
    if (x.length >= 3 && (x.startsWith(t) || t.startsWith(x))) return true;
    if (x.length >= 5 && t.length >= 5 && x.slice(0, 5) === t.slice(0, 5)) return true;
  }
  return false;
}

/** 0..1 — how much a till line name sounds like a product name. */
export function nameSimilarity(tillName: string, productName: string): number {
  const a = tillNameTokens(tillName), b = nameTokens(productName);
  if (!a.length || !b.length) return 0;
  const as = new Set(a), bs = new Set(b);
  const hitA = a.filter(t => tokenHit(t, bs)).length;
  const hitB = b.filter(t => tokenHit(t, as)).length;
  if (!hitA) return 0;
  // Till names are short: weight "all the till's words are in the product" more heavily.
  let score = 0.65 * (hitA / a.length) + 0.35 * (hitB / b.length);
  const onlyA = a.filter(t => !bs.has(t) && VARIANTS.has(t)), onlyB = b.filter(t => !as.has(t) && VARIANTS.has(t));
  if (onlyA.length && onlyB.length) score -= 0.3;
  if (as.has("zero") !== bs.has("zero")) score -= 0.4;
  return Math.max(0, Math.min(1, score));
}

export interface MatchSuggestion { productId: string; name: string; score: number }

/** The few products a till line most likely is, best first. Exact PLU/SKU/barcode hits score 1. */
export function suggestProducts(line: TillLine, products: MatchProduct[], limit = 3): MatchSuggestion[] {
  const plu = line.plu?.replace(/^0+(?=\d)/, "").toLowerCase();
  const out: MatchSuggestion[] = [];
  for (const p of products) {
    let score = 0;
    if (plu && [p.sku, p.barcode, p.external_id].some(c => c && String(c).replace(/^0+(?=\d)/, "").toLowerCase() === plu)) score = 1;
    else score = nameSimilarity(line.name, p.name);
    // A serve word that only fits draught ("half", "pint") nudges towards draught lines.
    const serve = detectServe(line.name);
    const draught = isVolumeCountingMethod(p.counting_method) || isDraughtCategory(p.category) || p.category === "postmix";
    if (score > 0 && score < 1 && (serve === "half" || serve === "pint" || serve === "third" || serve === "two_thirds")) score += draught ? 0.05 : -0.15;
    if (score > 0 && score < 1 && (serve === "single" || serve === "double")) score += p.category === "spirits" || p.unit === "weigh" ? 0.05 : -0.15;
    if (score > 0.25) out.push({ productId: p.id, name: p.name, score: Math.round(Math.min(1, score) * 100) / 100 });
  }
  return out.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name)).slice(0, limit);
}

/** Score at or above which we pre-pick a product (the landlord still confirms it). */
export const AUTO_SUGGEST_SCORE = 0.6;

// ─── Remembering choices per pub ───────────────────────────────────────────

export interface RememberedMatch {
  /** null = "not a stock line, ignore" (food, room hire, raffle). */
  productId: string | null;
  serve: ServeKind;
  custom?: number | null;
}

export interface TillMemory {
  version: 1;
  matches: Record<string, RememberedMatch>;
  /** Column choices for "Other CSV", keyed by a fingerprint of the header row. */
  mappings: Record<string, GenericMapping>;
}

export const emptyTillMemory = (): TillMemory => ({ version: 1, matches: {}, mappings: {} });

export function memoryKey(type: TillType, line: Pick<TillLine, "plu" | "name">): string {
  const plu = line.plu?.trim().replace(/^0+(?=\d)/, "");
  if (plu) return `${type}:plu:${plu.toLowerCase()}|${line.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
  return `${type}:name:${line.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

/** PLU numbers get reused for new buttons; only trust a remembered PLU when the name still agrees. */
export function recall(memory: TillMemory, type: TillType, line: Pick<TillLine, "plu" | "name">): RememberedMatch | null {
  return memory.matches[memoryKey(type, line)] ?? null;
}

export function remember(memory: TillMemory, type: TillType, line: Pick<TillLine, "plu" | "name">, match: RememberedMatch): TillMemory {
  return { ...memory, matches: { ...memory.matches, [memoryKey(type, line)]: match } };
}

export function headerFingerprint(headers: string[]): string {
  return headers.map(h => h.trim().toLowerCase()).filter(Boolean).join("|");
}

export function rememberMapping(memory: TillMemory, headers: string[], mapping: GenericMapping): TillMemory {
  return { ...memory, mappings: { ...memory.mappings, [headerFingerprint(headers)]: mapping } };
}

export function recallMapping(memory: TillMemory, headers: string[]): GenericMapping | null {
  return memory.mappings[headerFingerprint(headers)] ?? null;
}

/** Tolerant read of whatever was saved (old versions, half-written JSON). */
export function readTillMemory(raw: unknown): TillMemory {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return emptyTillMemory();
    const o = v as Partial<TillMemory>;
    return { version: 1, matches: { ...(o.matches ?? {}) }, mappings: { ...(o.mappings ?? {}) } };
  } catch {
    return emptyTillMemory();
  }
}

// ─── The plan shown on screen ──────────────────────────────────────────────

export type MatchStatus = "remembered" | "suggested" | "unmatched" | "ignored";

export interface PlannedLine {
  line: TillLine;
  key: string;
  productId: string | null;
  serve: ServeKind;
  custom: number | null;
  status: MatchStatus;
  suggestions: MatchSuggestion[];
}

export function planMatches(type: TillType, lines: TillLine[], products: MatchProduct[], memory: TillMemory): PlannedLine[] {
  const byId = new Map(products.map(p => [p.id, p]));
  return lines.map(line => {
    const key = memoryKey(type, line);
    const suggestions = suggestProducts(line, products);
    const mem = memory.matches[key];
    if (mem && (mem.productId === null || byId.has(mem.productId))) {
      return { line, key, productId: mem.productId, serve: mem.serve, custom: mem.custom ?? null, status: mem.productId ? "remembered" : "ignored", suggestions };
    }
    const top = suggestions[0];
    if (top && top.score >= AUTO_SUGGEST_SCORE) {
      const p = byId.get(top.productId)!;
      return { line, key, productId: p.id, serve: detectServe(line.name) ?? defaultServe(p), custom: null, status: "suggested", suggestions };
    }
    return { line, key, productId: null, serve: "unit", custom: null, status: "unmatched", suggestions };
  });
}

/** Sold units for one planned line (what goes in sales_records.quantity_sold). */
export function soldUnitsFor(pl: PlannedLine, product: ReportProductLike, defaultMeasureMl: number): number {
  const serve = pl.serve === "unit" && soldUnitMl(product, defaultMeasureMl) == null ? "each" : pl.serve;
  return Math.round(pl.line.qty * perTillItem(product, serve, defaultMeasureMl, pl.custom) * 10000) / 10000;
}
