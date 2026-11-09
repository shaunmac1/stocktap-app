import { productCapacityMl, type ProductCategory } from "./calculations";
import { guessCategoryFromName } from "./library-hygiene";

/**
 * Reads a supplier delivery email (Carlsberg Britvic "Today's delivery" and similar tables of
 * code · code · description · qty) that has been copied and pasted into StockTap, works out
 * what physically arrived, and matches each line to a product in the library.
 */

export interface DeliveryNoteLine {
  index: number;
  codes: string[];
  description: string;
  qty: number;
}

export interface DeliveryNote {
  supplier: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM, start of the delivery window */
  time: string | null;
  deliveryOrder: string | null;
  salesOrder: string | null;
  po: string | null;
  lines: DeliveryNoteLine[];
}

const KNOWN_SUPPLIERS = [
  "Carlsberg Britvic", "Carlsberg Marston's", "Matthew Clark", "Heineken", "Molson Coors",
  "Booker", "Bestway", "Brakes", "Diageo", "Coca-Cola", "Britvic", "Budweiser Brewing", "Kingsland",
];

const NUM = /^\d+(?:\.\d+)?$/;
const CODE = /^\d{1,9}$/;

function pad2(n: number) { return String(n).padStart(2, "0"); }

export function parseDeliveryNote(text: string): DeliveryNote {
  const clean = text.replace(/\r/g, "").replace(/ /g, " ");

  // Header details
  let date: string | null = null;
  const d = clean.match(/\bDate\s*[:\t ]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (d) {
    const y = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
    date = `${y}-${pad2(Number(d[2]))}-${pad2(Number(d[1]))}`;
  }
  const w = clean.match(/Delivery window\s*[:\t ]\s*(\d{1,2}):(\d{2})/i);
  const time = w ? `${pad2(Number(w[1]))}:${w[2]}` : null;
  const grab = (re: RegExp) => { const m = clean.match(re); return m ? m[1] : null; };
  const deliveryOrder = grab(/Delivery Order\s*(?:No\.?|number)?\s*[:#\t ]\s*(\d{4,})/i);
  const salesOrder = grab(/Sales Order\s*(?:No\.?|number)?\s*[:#\t ]\s*(\d{4,})/i);
  const po = grab(/\bPO\s*(?:No\.?|number)?\s*[:#\t ]\s*(\d{4,})/);
  let supplier: string | null = null;
  let firstAt = Infinity;
  for (const s of KNOWN_SUPPLIERS) {
    const at = clean.toLowerCase().indexOf(s.toLowerCase());
    if (at >= 0 && at < firstAt) { firstAt = at; supplier = s; }
  }

  // Lines: split into cells on newlines and tabs, then look for code · code · description · qty.
  const lines: DeliveryNoteLine[] = [];
  const rawLines = clean.split("\n");
  const cells: string[] = [];
  for (const raw of rawLines) {
    if (raw.includes("\t")) raw.split("\t").forEach(c => cells.push(c.trim()));
    else cells.push(raw.trim());
  }
  const push = (codes: string[], description: string, qty: number) => {
    if (!description || /^description$/i.test(description) || !(qty > 0)) return;
    lines.push({ index: lines.length, codes, description: description.replace(/\s+/g, " ").trim(), qty });
  };
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c) continue;
    // Whole row on one line, separated by spaces
    const one = c.match(/^(\d{1,9})\s+(\d{1,9})\s+(.*[A-Za-z].*?)\s+(\d+(?:\.\d+)?)$/);
    if (one) { push([one[1], one[2]], one[3], Number(one[4])); continue; }
    // Cells: code, code, description, qty (blank cells skipped)
    if (CODE.test(c)) {
      const next: string[] = [];
      let j = i + 1;
      while (j < cells.length && next.length < 3) { if (cells[j]) next.push(cells[j]); j++; }
      if (next.length === 3 && CODE.test(next[0]) && /[A-Za-z]/.test(next[1]) && NUM.test(next[2])) {
        push([c, next[0]], next[1], Number(next[2]));
        i = j - 1;
        continue;
      }
    }
  }
  return { supplier, date, time, deliveryOrder, salesOrder, po, lines };
}

// ─── What physically arrived ────────────────────────────────────────────────

export type PackKind = "keg" | "box" | "pack" | "bottle" | "unit";

export interface PackInfo {
  kind: PackKind;
  /** Items per line qty (e.g. 24 in "24x275ml") */
  perQty: number;
  /** ml of each item, when the description says */
  itemMl: number | null;
  /** What we read, e.g. "24 × 275ml", "50L keg", "case of 6 × 75cl" */
  label: string;
}

function toMl(n: number, unit: string): number | null {
  const u = unit.toLowerCase();
  if (u === "ml") return n;
  if (u === "cl") return n * 10;
  if (u === "l" || u === "ltr" || u === "litre") return n * 1000;
  return null;
}

export function readPack(description: string): PackInfo {
  const info = readPackLower(description.toLowerCase());
  return { ...info, label: info.label.replace(/(\d)l\b/g, "$1L").replace(/(\d)ltr\b/g, "$1L") };
}

function readPackLower(s: string): PackInfo {
  // Kegs and casks: "11g Keg", "50L Keg", "30L Keg", "9G Cask"
  if (/\b(keg|cask|firkin)\b/.test(s)) {
    const l = s.match(/(\d+(?:\.\d+)?)\s*l\b/);
    const g = s.match(/(\d+(?:\.\d+)?)\s*g(?:al)?\b/);
    let litres: number | null = null;
    if (l) litres = Number(l[1]);
    else if (g) { const gal = Number(g[1]); litres = gal === 11 ? 50 : gal === 22 ? 100 : Math.round(gal * 4.54609 * 10) / 10; }
    const noun = /\bcask|firkin\b/.test(s) ? "cask" : "keg";
    return { kind: "keg", perQty: 1, itemMl: litres ? litres * 1000 : null, label: litres ? `${litres}L ${noun}` : noun };
  }
  // Bag-in-box: "12L BIB", "BIB 1X12"
  if (/\bbib\b|bag.in.box/.test(s)) {
    const l = s.match(/(\d+(?:\.\d+)?)\s*l\b/) ?? s.match(/1\s*x\s*(\d+(?:\.\d+)?)/);
    const litres = l ? Number(l[1]) : null;
    return { kind: "box", perQty: 1, itemMl: litres ? litres * 1000 : null, label: litres ? `${litres}L box` : "box" };
  }
  // "6x4x330ml"
  let m = s.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(ml|cl|l|ltr|g)\b/);
  if (m) {
    const n = Number(m[1]) * Number(m[2]);
    const ml = toMl(Number(m[3]), m[4]);
    return { kind: "pack", perQty: n, itemMl: ml, label: `${n} × ${m[3]}${m[4]}` };
  }
  // "24x275ml", "12x1L", "36x45g"
  m = s.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(ml|cl|l|ltr|g)\b/);
  if (m) {
    const n = Number(m[1]);
    const ml = toMl(Number(m[2]), m[3]);
    return { kind: "pack", perQty: n, itemMl: ml, label: `${n} × ${m[2]}${m[3]}` };
  }
  // "KP Salted Peanuts x 18"
  m = s.match(/\bx\s*(\d+)\s*$/) ?? s.match(/\bx\s*(\d+)\b/);
  if (m) return { kind: "pack", perQty: Number(m[1]), itemMl: null, label: `pack of ${m[1]}` };
  // Single bottles: "70cl (C6)", "75cl (C6)", "250ml"
  m = s.match(/(\d+(?:\.\d+)?)\s*(ml|cl|ltr|l)\b/);
  if (m) {
    const ml = toMl(Number(m[1]), m[2]);
    const cs = s.match(/\(c(\d+)\)/);
    // Wine is ordered by the case; spirits by the bottle even when the case size is shown.
    if (cs && ml === 750) {
      const n = Number(cs[1]);
      return { kind: "pack", perQty: n, itemMl: ml, label: `case of ${n} × 75cl` };
    }
    return { kind: "bottle", perQty: 1, itemMl: ml, label: `${m[1]}${m[2]}` };
  }
  return { kind: "unit", perQty: 1, itemMl: null, label: "each" };
}

// ─── Matching to the library ────────────────────────────────────────────────

export interface MatchableProduct {
  id: string;
  name: string;
  category?: string | null;
  counting_method?: string | null;
  size_ml?: number | null;
  pack_size?: number | null;
  container_l?: number | null;
  sku?: string | null;
  cost_price?: number | null;
}

const SYNONYMS: Array<[RegExp, string]> = [
  [/\b1664\b/g, " kronenbourg "],
  [/\bbierre\b|\bbiere\b/g, " "],
  [/\bdr\b/g, " dry roasted "],
  [/\bcheddar and onion\b|\bcheddar & onion\b/g, " cheese onion "],
  [/\bapp\b/g, " apple "],
  [/\bbc\b|\bblk\b/g, " blackcurrant "],
  [/\brasp\b/g, " raspberry "],
  [/\bp\/fruit\b|\bpassion fruit\b/g, " passionfruit "],
  [/\blow cal\b|\blow calorie\b/g, " slim "],
  [/\bwhite peach\b/g, " peach "],
  [/\bf\/grill\b|\bflame grilled\b/g, " flame grilled "],
  [/\bthai sweet chicken\b/g, " thai chicken "],
  [/\bhot and spicy\b|\bhot 'n' spicy\b|\bhot n spicy\b/g, " hot spicy "],
  [/\bsalt and vinegar\b|\bsalt & vinegar\b/g, " salt vinegar "],
  [/\bpinot grigio rose\b|\bpinot blush\b/g, " pinot blush "],
  [/\bpinot grigio\b|\bpinot g\.?\b/g, " pinot grigio "],
  [/\bchard\b/g, " chardonnay "],
  [/\bbib\b|\bbag in box\b/g, " postmix "],
  [/\br white'?s\b/g, " "],
  [/\b0\.0%?|\b0%|<0\.3%|\bzero\b|\balkoholfrei\b|\balcohol free\b/g, " zero "],
  [/\bflavourwave\b|\bfw\b/g, " flavourwave "],
  [/\bmultiple?\b|\bmulti\b/g, " "],
  [/\borange connector\b/g, " "],
  [/\bspiced gold\b/g, " spiced "],
  [/\bberries\b/g, " berry "],
  [/\bbuzzballz\b|\bbuzz ballz\b/g, " buzz ball "],
  [/\bcoldbr\b/g, " cold brew "],
  [/ä/g, "a"],
  [/\bbulmers original\b/g, " bulmers apple "],
];

const NOISE = new Set([
  "keg", "kegs", "cask", "bot", "bottle", "can", "car", "nrb", "pet", "cmbc", "prod", "hy", "h", "yield",
  "and", "the", "x", "c6", "c12", "g", "gal", "l", "ml", "cl", "ltr", "robinsons", "schweppes", "mr", "cyl",
  "rented", "ct", "new", "abv", "delist", "oos", "case", "only", "each", "single", "serve",
  // category words that only appear on one side
  "ppl", "ppa", "ppc", "pps", "ppw", "soft", "mixer", "wine", "lager", "cider", "stout", "ale", "rum", "gin",
  "vodka", "whisky", "liqueur", "juice", "cordial", "water", "crisps", "nuts", "snacks", "spark", "sundry",
  "draught", "tequila", "brandy", "syrup", "puree",
]);

function stem(t: string): string {
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function nameTokens(name: string): string[] {
  let s = ` ${name.toLowerCase()} `;
  for (const [re, rep] of SYNONYMS) s = s.replace(re, rep);
  s = s.replace(/'/g, "").replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ");
  return s.split(" ")
    .filter(Boolean)
    .filter(t => !NOISE.has(t))
    .filter(t => !/^\d+(ml|cl|l|g|x\d+)?$/.test(t) && !/^\d+x\d+/.test(t))
    .map(stem);
}

export const VARIANTS = new Set([
  "rosso", "bianco", "extra",
  "apple", "orange", "cranberry", "lime", "lemon", "blackcurrant", "raspberry", "peach", "mango", "passionfruit",
  "pineapple", "berrie", "berry", "cherry", "cherrie", "kiwi", "strawberry", "watermelon", "tropical", "grapefruit",
  "dark", "light", "smooth", "max", "diet", "sugar", "red", "white", "rose", "blush", "spiced", "gold", "silver",
  "reposado", "pink", "sloe", "cheese", "onion", "vinegar", "steak", "chicken", "spicy", "roasted", "dry", "original",
  "still", "sparkling", "slim", "chardonnay", "shiraz", "merlot", "sauvignon", "grigio", "malbec", "rioja", "dragonberry",
  "glitterberry", "elderflower", "mild", "bitter", "ipa", "export",
]);

const DRAUGHT_METHODS = new Set(["keg_weight", "dipstick", "tenths_pints"]);
function isDraught(p: MatchableProduct) {
  return (p.category ?? "").startsWith("draught_") || DRAUGHT_METHODS.has(p.counting_method ?? "");
}

export interface LineMatch {
  product: MatchableProduct | null;
  score: number;
  bySku: boolean;
}

/** 0..1: how well a delivery line fits a product. */
export function scoreLine(line: DeliveryNoteLine, pack: PackInfo, p: MatchableProduct): number {
  const draught = isDraught(p);
  if (pack.kind === "keg" && !draught) return 0;
  if (pack.kind === "box" && !(p.category === "postmix" || draught)) return 0;
  if (pack.kind !== "keg" && pack.kind !== "box" && draught) return 0;
  if (pack.kind !== "box" && p.category === "postmix") return 0;

  const a = nameTokens(line.description);
  const b = nameTokens(p.name);
  if (!a.length || !b.length) return 0;
  const bs = new Set(b), as = new Set(a);
  const hitA = a.filter(t => bs.has(t)).length;
  const hitB = b.filter(t => as.has(t)).length;
  if (hitA === 0) return 0;
  let score = 0.55 * (hitA / a.length) + 0.45 * (hitB / b.length);

  // Size agreement for bottles and packs
  if (pack.itemMl && p.size_ml && pack.kind !== "keg" && pack.kind !== "box") {
    score += Math.abs(pack.itemMl - p.size_ml) < 1 ? 0.12 : -0.12;
  }
  // Different flavours or variants on each side (Cranberry vs Apple, Max vs Diet) are different products.
  const onlyA = a.filter(t => !bs.has(t) && VARIANTS.has(t));
  const onlyB = b.filter(t => !as.has(t) && VARIANTS.has(t));
  if (onlyA.length && onlyB.length) score -= 0.3;
  // "zero" must agree both ways (Guinness vs Guinness 0%)
  if (as.has("zero") !== bs.has("zero")) score -= 0.35;
  return Math.max(0, Math.min(1, score));
}

export function matchLine(line: DeliveryNoteLine, pack: PackInfo, products: MatchableProduct[]): LineMatch {
  const bySku = products.find(p => p.sku && line.codes.includes(p.sku.trim()));
  if (bySku) return { product: bySku, score: 1, bySku: true };
  let best: MatchableProduct | null = null;
  let bestScore = 0;
  for (const p of products) {
    const s = scoreLine(line, pack, p);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return bestScore >= 0.55 ? { product: best, score: bestScore, bySku: false } : { product: null, score: bestScore, bySku: false };
}

export type MatchStrength = "sure" | "check" | "none";
export function matchStrength(m: LineMatch): MatchStrength {
  if (!m.product) return "none";
  if (m.bySku || m.score >= 0.72) return "sure";
  return "check";
}

// ─── Turning a line into a delivery for a product ───────────────────────────

export interface LineAmount {
  /** In the product's purchase unit (kegs, units, packs, boxes, bottles) */
  purchaseQty: number;
  quantityMl: number;
  /** e.g. "4 kegs", "48 units", "1 pack of 12", "12 bottles" */
  label: string;
  /** set when the note and the product disagree on size */
  warning: string | null;
}

function plural(n: number, one: string, many = one + "s") { return `${Math.round(n * 100) / 100} ${Math.abs(n - 1) < 1e-9 ? one : many}`; }

export function lineAmount(line: DeliveryNoteLine, pack: PackInfo, p: MatchableProduct): LineAmount {
  const items = line.qty * pack.perQty;
  const totalMl = pack.itemMl != null ? items * pack.itemMl : null;
  const cap = productCapacityMl(p);
  const m = p.counting_method ?? "";
  let purchaseQty: number;
  let label: string;
  let warning: string | null = null;

  if (DRAUGHT_METHODS.has(m) || isDraught(p)) {
    const noun = (p.category === "draught_ale" && /cask/.test(pack.label)) ? "cask" : "keg";
    purchaseQty = totalMl != null && cap > 0 ? totalMl / cap : line.qty;
    label = plural(purchaseQty, noun);
    if (totalMl != null && p.container_l && Math.abs(pack.itemMl! - p.container_l * 1000) > 500) {
      warning = `Note says ${pack.label}, your product is set to ${p.container_l}L`;
    }
  } else if (p.category === "postmix") {
    // Postmix is counted in litres of drink; a delivered box is worth what it makes.
    purchaseQty = items;
    label = plural(items, "box", "boxes");
  } else if (m === "litre") {
    purchaseQty = totalMl != null && cap > 0 ? totalMl / cap : items;
    label = p.container_l ? plural(purchaseQty, `× ${p.container_l}L box`, `× ${p.container_l}L boxes`) : `${Math.round((totalMl ?? items * cap) / 10) / 100} L`;
  } else if (m === "dozen") {
    const packSize = p.pack_size ?? 12;
    purchaseQty = items / packSize;
    label = `${items} units (${plural(purchaseQty, "pack")} of ${packSize})`;
  } else if (m === "each" || m === "count") {
    purchaseQty = items;
    label = plural(items, "unit");
  } else {
    // Bottles counted by weight / tenths
    purchaseQty = totalMl != null && p.size_ml ? totalMl / p.size_ml : items;
    label = plural(purchaseQty, "bottle");
    if (pack.itemMl && p.size_ml && Math.abs(pack.itemMl - p.size_ml) > 1) warning = `Note says ${pack.label}, your product is ${p.size_ml}ml`;
  }
  purchaseQty = Math.round(purchaseQty * 1000) / 1000;
  return { purchaseQty, quantityMl: Math.round(purchaseQty * cap * 1000) / 1000, label, warning };
}

// ─── A new product for a line that isn't in the library ─────────────────────

export interface NewProductDraft {
  name: string;
  category: ProductCategory;
  counting_method: string;
  unit: "count" | "weigh";
  type: string;
  size_ml: number | null;
  container_l: number | null;
  container_type: "keg" | "cask" | "bag_in_box" | null;
  sku: string | null;
}

export function draftProductFromLine(line: DeliveryNoteLine, pack: PackInfo): NewProductDraft {
  const name = line.description
    .replace(/\s*\((c\d+)\)/i, "")
    .replace(/\s+(BOT|CAN|CAR|PET|NRB|CMBC Prod|Rented)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  let category = guessCategoryFromName(line.description) ?? null;
  if (pack.kind === "keg" && !(category ?? "").startsWith("draught_")) category = "draught_lager";
  if (pack.kind === "box") category = "postmix";
  if (!category) category = pack.kind === "bottle" && pack.itemMl === 700 ? "spirits" : pack.itemMl === 750 ? "wines" : "packaged";
  const draught = category.startsWith("draught_");
  const weighed = category === "spirits" || category === "wines";
  const counting_method = draught ? "keg_weight" : category === "postmix" ? "litre" : weighed ? "tenths" : "each";
  return {
    name,
    category: category as ProductCategory,
    counting_method,
    unit: weighed ? "weigh" : "count",
    type: category === "wines" ? "wine" : weighed ? "spirit" : "packaged",
    size_ml: draught || category === "postmix" ? null : pack.itemMl,
    container_l: draught || category === "postmix" ? (pack.itemMl ? pack.itemMl / 1000 : null) : null,
    container_type: draught ? (/cask/.test(pack.label) ? "cask" : "keg") : category === "postmix" ? "bag_in_box" : null,
    sku: line.codes[1] ?? line.codes[0] ?? null,
  };
}

// ─── A fixed reference per line, so pasting the same note twice adds nothing twice ──

function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function lineReference(venueId: string, note: DeliveryNote, line: DeliveryNoteLine): string {
  const key = [venueId, note.supplier ?? "", note.deliveryOrder ?? note.date ?? "", line.codes.join("-"), line.description, line.index].join("|");
  const parts = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x7f4a7c15].map(seed => fnv1a(key, seed).toString(16).padStart(8, "0")).join("");
  const hex = parts.split("");
  hex[12] = "5"; // version
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16); // variant
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function deliveredAtIso(note: DeliveryNote, fallback = new Date()): string {
  if (!note.date) return fallback.toISOString();
  return new Date(`${note.date}T${note.time ?? "09:00"}:00`).toISOString();
}

export function deliveryRefLabel(note: DeliveryNote): string | null {
  if (note.deliveryOrder) return `Delivery ${note.deliveryOrder}`;
  if (note.po) return `PO ${note.po}`;
  return null;
}
