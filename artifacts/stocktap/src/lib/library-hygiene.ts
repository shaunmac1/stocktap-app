// Library hygiene: pure helpers that tidy a venue's product library after a
// CSV import or catalogue add. No React / Supabase imports so it can be
// unit-tested in isolation.
//
// Shipped live on 9 Sept 2026 directly to the compiled bundle; re-ported to
// source on 21 Sept 2026 from index-BzdxvhYI.js (no source map existed).
//
// Covers:
//   - size inference from product names ("70cl", "12 x 330ml", "Magnum")
//   - stocktaker-style "litre" on packaged bottles -> "each"
//   - method-mismatch detection (same brand+category+size bucket counted two
//     different ways, e.g. weigh vs each), prefix-aware so "Gordons" and
//     "Gordons Pink" don't collide
//   - duplicate detection across naming conventions (import preview unticks them)
//   - UK trade price estimates by category, flagged "est." in the UI
//   - matching an unweighed bottle to a known catalogue bottle so it inherits
//     full/empty weights

import type { Database } from "./database.types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ProductCategory = NonNullable<ProductRow["category"]>;
export type CountingMethod = NonNullable<ProductRow["counting_method"]>;

/** The subset of a product these helpers need. */
export type HygieneProduct = Pick<ProductRow, "id" | "name" | "category" | "counting_method" | "size_ml">;

// Words that carry no brand meaning (categories, units, container words).
const NOISE_WORDS = new Set([
  "gin", "vodka", "rum", "whisky", "whiskey", "brandy", "cognac", "tequila", "liqueur", "liq",
  "wine", "wines", "spark", "sparkling", "lager", "ale", "cider", "stout", "bitter",
  "keg", "cask", "draught", "ppl", "ppa", "ppc", "pps", "ppw", "pp", "btl", "bottle", "can", "cans",
  "mixer", "mixers", "soft", "softs", "minerals", "mineral", "snack", "snacks", "crisps", "nuts",
  "generic", "test", "the",
]);

// Grape / style / mixer words normalised to one spelling. These are kept as
// "style" tokens (not brand tokens) so "House Sauv Blanc" and "House SB" match.
const STYLE_ALIASES: Record<string, string> = {
  chard: "chardonnay", chardonnay: "chardonnay",
  sauv: "sauvignon", sauvignon: "sauvignon", sb: "sauvignon",
  chen: "chenin", chenin: "chenin",
  pin: "pinot", pinot: "pinot",
  pg: "grigio", grigio: "grigio", gris: "grigio",
  cab: "cabernet", cabernet: "cabernet", cs: "cabernet",
  merlot: "merlot", malbec: "malbec", rioja: "rioja",
  shiraz: "shiraz", syrah: "shiraz",
  zin: "zinfandel", zinfandel: "zinfandel",
  blanc: "blanc", noir: "noir",
  rose: "rose", "rosé": "rose", rosado: "rose", rosato: "rose",
  red: "red", white: "white",
  prosecco: "prosecco", champagne: "champagne", cava: "cava",
  cremant: "cremant", "crémant": "cremant",
  tonic: "tonic", water: "water", soda: "soda", lemonade: "lemonade", cola: "cola",
  cordial: "cordial", cordials: "cordial", juice: "juice", juices: "juice",
  puree: "puree", "purée": "puree", syrup: "syrup", postmix: "postmix",
};

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(ml|cl|l|ltr|litre|litres|liter|pint|pints|oz)\b/i;
const PACK_RE = /(\d{1,2})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|l|ltr)\b/i;
// A bare 150–1999 number in a minerals name is almost always a ml size (e.g. "Coke 330").
const BARE_ML_RE = /\b(1[5-9]\d|[2-9]\d{2}|1\d{3})\b/;

function toMl(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "ml") return value;
  if (u === "cl") return value * 10;
  if (u === "oz") return value * 28.4;
  if (u.startsWith("pint")) return value * 568;
  return value * 1000; // l / ltr / litre(s) / liter
}

/** "12 x 330ml" -> { sizeMl: 330, packSize: 12 }; "70cl" -> { sizeMl: 700, packSize: null }. */
export function sizeMlFromName(name: string): { sizeMl: number; packSize: number | null } | null {
  const pack = name.match(PACK_RE);
  if (pack) {
    return {
      sizeMl: Math.round(toMl(parseFloat(pack[2].replace(",", ".")), pack[3])),
      packSize: parseInt(pack[1], 10),
    };
  }
  const single = name.match(SIZE_RE);
  if (single) {
    return {
      sizeMl: Math.round(toMl(parseFloat(single[1].replace(",", ".")), single[2])),
      packSize: null,
    };
  }
  return null;
}

const CATEGORY_DEFAULT_ML: Partial<Record<ProductCategory, number>> = {
  spirits: 700,
  wines: 750,
};

/**
 * Best guess at a bottle size when the import didn't give one. Names win;
 * then category defaults (spirits 700, wines 750, single-serve 200, magnum 1500).
 */
export function inferSizeMl(
  name: string,
  category: ProductCategory | null | undefined,
  countingMethod: CountingMethod | null | undefined,
): number | null {
  const fromName = sizeMlFromName(name);
  if (fromName) return fromName.sizeMl;
  const lower = name.toLowerCase();
  if (category === "wines" || category === "spirits") {
    if (/\b(single serve|piccolo|mini)\b/.test(lower)) return 200;
    if (/\b(magnum)\b/.test(lower)) return 1500;
    return CATEGORY_DEFAULT_ML[category] ?? null;
  }
  if (category === "minerals") {
    if (/\b(cordial|squash|syrup)\b/.test(lower)) return 1000;
    const bare = lower.match(BARE_ML_RE);
    if (bare) return parseInt(bare[1], 10);
    if (countingMethod === "weigh" || countingMethod === "tenths") return 700;
  }
  return null;
}

const BULK_WORDS_RE = /\b(cordial|squash|syrup|puree|purée|postmix|bib|bag.in.box|carton|1l|1 l|1\.5l|2l|5l)\b/;

/**
 * Stocktakers' sheets say "litre" for anything bottled. For a packaged or
 * small-minerals line that isn't a genuine bulk container, that means "each".
 */
export function inferCountingMethod(
  category: ProductCategory | null | undefined,
  requested: CountingMethod | null | undefined,
  name: string,
  sizeMl: number | null | undefined,
  fallback: CountingMethod | null | undefined,
): CountingMethod | null | undefined {
  const method = requested ?? fallback;
  const lower = name.toLowerCase();
  if (method === "litre" && (category === "packaged" || category === "minerals")) {
    const looksBulk = BULK_WORDS_RE.test(lower);
    if ((category === "packaged" && !looksBulk) || (category === "minerals" && !looksBulk && sizeMl != null && sizeMl <= 1000)) {
      return "each";
    }
  }
  return method;
}

/** Name -> normalised meaningful tokens (sizes, units, noise words stripped; ABV kept as a token). */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(PACK_RE, " ")
    .replace(SIZE_RE, " ")
    .replace(/\b(\d+(?:[.,]\d+)?)\s*%/g, (_m, n: string) => ` abv${String(parseFloat(n.replace(",", "."))).replace(".", "p")} `)
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !/^\d+$/.test(t))
    .filter((t) => !NOISE_WORDS.has(t))
    .map((t) => STYLE_ALIASES[t] ?? t);
}

const isStyleToken = (t: string): boolean => t in STYLE_ALIASES;

/** First brand-ish token of a name (3+ chars, not a grape/style word), or null. */
export function brandKey(name: string): string | null {
  return nameTokens(name).filter((t) => !isStyleToken(t)).find((t) => t.length >= 3) ?? null;
}

export type MethodFamily = "bottle" | "count" | "bulk" | "draught" | "none";

/** Groups counting methods into families that should never be mixed on one product line. */
export function methodFamily(method: CountingMethod | null | undefined): MethodFamily {
  switch (method) {
    case "weigh":
    case "tenths":
    case "photo_tap":
      return "bottle";
    case "each":
    case "dozen":
      return "count";
    case "litre":
      return "bulk";
    case "keg_weight":
    case "dipstick":
    case "tenths_pints":
      return "draught";
    default:
      return "none";
  }
}

function sizeBucket(sizeMl: number | null): string {
  if (sizeMl == null) return "?";
  if (sizeMl <= 250) return "s";
  if (sizeMl <= 600) return "m";
  if (sizeMl <= 1000) return "l";
  return "xl";
}

/**
 * Product ids whose (category, brand, size-bucket) group is counted in more
 * than one method family — e.g. one "Gordons 70cl" weighed and another counted
 * "each". Draught and unset methods are ignored.
 */
export function findMethodMismatches(products: HygieneProduct[]): Set<string> {
  const groups = new Map<string, HygieneProduct[]>();
  for (const p of products) {
    const family = methodFamily(p.counting_method);
    if (family === "draught" || family === "none") continue;
    const brand = brandKey(p.name);
    if (!brand) continue;
    const sizeMl = p.size_ml ?? sizeMlFromName(p.name)?.sizeMl ?? null;
    const key = `${p.category ?? "?"}|${brand}|${sizeBucket(sizeMl)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const flagged = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const families = new Set(group.map((p) => methodFamily(p.counting_method)));
    if (families.size > 1) group.forEach((p) => flagged.add(p.id));
  }
  return flagged;
}

/** True when a packaged/minerals line has been left on "litre" but is really a bottle counted "each". */
export function isLitreOnBottles(product: HygieneProduct): boolean {
  if (product.counting_method !== "litre") return false;
  if (product.category !== "packaged" && product.category !== "minerals") return false;
  const sizeMl = product.size_ml ?? sizeMlFromName(product.name)?.sizeMl ?? null;
  const lower = product.name.toLowerCase();
  if (/\b(cordial|squash|syrup|puree|purée|postmix|bib|bag.in.box|carton)\b/.test(lower)) return false;
  if (product.category === "packaged") return true;
  return sizeMl != null && sizeMl <= 1000;
}

/**
 * Finds an existing product that is the same thing under a different naming
 * convention ("Gordons Gin 70cl" vs "GIN - Gordon's 700ml"). Same category (when
 * both set), identical token set, sizes within 30ml when both known.
 */
export function findLikelyDuplicate(
  candidate: Pick<HygieneProduct, "name" | "category" | "size_ml">,
  existing: HygieneProduct[],
): { product: HygieneProduct; score: number } | null {
  const tokens = nameTokens(candidate.name).sort();
  if (tokens.length === 0) return null;
  const key = tokens.join(" ");
  for (const other of existing) {
    if (candidate.category && other.category && candidate.category !== other.category) continue;
    const otherTokens = nameTokens(other.name).sort();
    if (otherTokens.length === 0) continue;
    if (otherTokens.join(" ") !== key) continue;
    if (candidate.size_ml != null && other.size_ml != null && Math.abs(candidate.size_ml - other.size_ml) > 30) continue;
    return { product: other, score: 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Price estimates (UK trade, ex-VAT, Sept 2026). Rough on purpose: they get the
// GP report off zero so a landlord sees the shape of the numbers, and every
// estimated price is flagged in the UI until they correct it.
// ---------------------------------------------------------------------------

const round2 = (n: number): number => Math.round(n * 100) / 100;

const PREMIUM_SPIRIT_RE =
  /\b(hendrick|tanqueray (ten|10|royale)|grey goose|belvedere|patr[oó]n|don julio|courvoisier|remy|r[ée]my|martell|hennessy|glenfiddich|glenmorangie|macallan|laphroaig|talisker|jameson black|chambord|cointreau|grand marnier|disaronno|baileys|kraken|diplomatico|malfy|warner|whitley neill|aber falls|bombay sapphire|monkey 47|sipsmith|roku|haig club|woodford|makers mark|buffalo trace|jack daniel)/i;
const HOUSE_SPIRIT_RE =
  /\b(house|generic|bells|bell's|famous grouse|grouse|smirnoff|gordons|gordon's|glens|glen's|russian standard|bacardi|captain morgan|jd\b|high commissioner|whyte|corkys|corky's|sourz|archers|teichenne|antica|apple sourz)/i;

export interface PriceEstimateInput {
  name: string;
  category: ProductCategory | null | undefined;
  countingMethod?: CountingMethod | null;
  sizeMl?: number | null;
  containerL?: number | null;
  packSize?: number | null;
}

export interface PriceEstimate {
  /** Cost of the whole unit bought (bottle / keg / case), ex-VAT. */
  cost: number | null;
  /** Price of one serve sold (measure / glass / pint / bottle), ex-VAT. */
  pour: number | null;
  /** One line explaining the basis, shown next to the "est." flag. */
  basis: string;
}

export function estimateDefaultPrices(input: PriceEstimateInput): PriceEstimate {
  const category = input.category;
  const method = input.countingMethod ?? null;
  const sizeMl = input.sizeMl ?? null;
  const lower = input.name.toLowerCase();

  if (!category) return { cost: null, pour: null, basis: "No category" };

  if (category === "spirits") {
    const per700 = PREMIUM_SPIRIT_RE.test(input.name) ? 26 : HOUSE_SPIRIT_RE.test(input.name) ? 14.5 : 17;
    const ml = sizeMl ?? 700;
    const cost = round2(per700 * (ml / 700));
    const pour = PREMIUM_SPIRIT_RE.test(input.name) ? 3.9 : 3.3;
    return { cost, pour, basis: `Typical ${ml}ml trade cost; single measure ex-VAT` };
  }

  if (category === "wines") {
    const sparkling = /\b(prosecco|champagne|cava|cremant|crémant|spark|sparkling|fizz|brut)\b/.test(lower);
    const ml = sizeMl ?? 750;
    if (ml <= 250) {
      return {
        cost: sparkling ? 2.4 : 1.9,
        pour: sparkling ? 6.25 : 5.4,
        basis: "Single-serve bottle, sold whole",
      };
    }
    return {
      cost: round2((sparkling ? 8 : 6.5) * (ml / 750)),
      pour: sparkling ? 6.9 : 5.6,
      basis: `Typical ${ml}ml trade cost; 175ml glass ex-VAT`,
    };
  }

  if (category.startsWith("draught_")) {
    const perLitre =
      category === "draught_lager" ? 3.3
      : category === "draught_stout" ? 3.8
      : category === "draught_cider" ? 3
      : method === "dipstick" || method === "tenths_pints" ? 2.3
      : 3;
    const pint =
      category === "draught_lager" ? 3.95
      : category === "draught_stout" ? 4.15
      : category === "draught_cider" ? 3.95
      : 3.6;
    const litres = input.containerL ?? null;
    if (litres == null || litres <= 0) {
      return { cost: null, pour: pint, basis: "Set the container size to estimate keg or cask cost" };
    }
    return { cost: round2(perLitre * litres), pour: pint, basis: `£${perLitre.toFixed(2)} a litre × ${litres}L; pint ex-VAT` };
  }

  if (category === "postmix") {
    return { cost: 52, pour: 2.4, basis: "Bag-in-box; pint ex-VAT" };
  }

  if (category === "packaged") {
    if (sizeMl == null && /\b(crisps|nuts|snack|pork|scratch|bear|kp\b|walkers|mccoy|pringles|peanut|cashew)/.test(lower)) {
      return { cost: 0.55, pour: 1.1, basis: "Snack bag" };
    }
    const rtd = /\b(pps|hooch|buzz|vk\b|wkd|smirnoff ice|rita|seltzer|hard)\b/.test(lower);
    const ml = sizeMl ?? 330;
    let cost: number;
    let pour: number;
    if (rtd) { cost = 1.5; pour = 3.6; }
    else if (ml >= 500) { cost = 1.65; pour = 3.9; }
    else if (ml >= 400) { cost = 1.25; pour = 3.5; }
    else { cost = 1.1; pour = 3.6; }
    if (/\b(0%|0\.0|alcohol.free|zero|low tide|nanny|lucky saint)\b/.test(lower)) {
      cost = round2(cost * 0.9);
      pour = round2(pour * 0.9);
    }
    return {
      cost: method === "dozen" ? round2(cost * (input.packSize ?? 12)) : cost,
      pour,
      basis: method === "dozen" ? `${input.packSize ?? 12}-pack; per bottle ex-VAT` : "Per bottle or can, ex-VAT",
    };
  }

  if (category === "minerals") {
    if (/\b(cordial|squash|syrup|puree|purée)\b/.test(lower) || (method === "litre" && (sizeMl == null || sizeMl >= 1000))) {
      const perLitre = /\b(monin|syrup|puree|purée)\b/.test(lower) ? 6.5 : 3.6;
      return {
        cost: method === "dozen" ? round2(perLitre * (input.packSize ?? 12)) : perLitre,
        pour: null,
        basis: method === "dozen" ? `${input.packSize ?? 12}-pack of litres; sold as a dash` : "Per litre; sold as a dash",
      };
    }
    const juice = /\b(juice|j2o|fruit shoot|fruitshoot|appletiser|smoothie)\b/.test(lower);
    const premiumMixer = /\b(fever|franklin|fentiman|london essence|double dutch)\b/.test(lower);
    const ml = sizeMl ?? 200;
    let cost: number;
    let pour: number;
    if (juice) { cost = ml >= 250 ? 0.8 : 0.6; pour = ml >= 250 ? 2.3 : 1.9; }
    else if (premiumMixer) { cost = 0.7; pour = 1.9; }
    else if (ml >= 300) { cost = 0.75; pour = 2.1; }
    else { cost = 0.42; pour = 1.6; }
    return {
      cost: method === "dozen" ? round2(cost * (input.packSize ?? 12)) : cost,
      pour,
      basis: method === "dozen" ? `${input.packSize ?? 12}-pack; per bottle ex-VAT` : "Per bottle or can, ex-VAT",
    };
  }

  return { cost: null, pour: null, basis: "No estimate for this category" };
}

// ---------------------------------------------------------------------------
// Known-bottle matching: give an unweighed spirit/wine the full/empty weights
// of the catalogue bottle it obviously is.
// ---------------------------------------------------------------------------

/** Variant words: if the catalogue name has one of these and the product doesn't, it's a different bottle. */
const VARIANT_WORDS = new Set([
  "sloe", "pink", "black", "liquorice", "raspberry", "raspberri", "mango", "vanilia", "vanilla", "ginger",
  "citron", "presse", "blueberry", "passion", "fruit", "sour", "apple", "cherry", "glitter", "snaps",
  "blackberry", "violet", "parma", "coconut", "spiced", "dark", "gold", "honey", "peach", "lime", "lemon",
  "orange", "strawberry", "watermelon", "rhubarb", "elderflower", "extra", "dry", "bianco", "rosso",
  "reposado", "silver", "anejo", "añejo", "zero", "single", "serve", "magnum",
]);

const prefixMatch = (a: string, b: string): boolean =>
  a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));

export interface CatalogueNameRow {
  id: string;
  canonical_name: string;
  aliases?: string[] | null;
  category: string | null;
  size_ml: number | string | null;
  has_calibration: boolean;
}

/**
 * Picks the one calibrated catalogue bottle a product is. Exact token match
 * wins outright; otherwise a single candidate whose extra tokens are neither
 * variant words nor more than two is accepted. Ambiguity returns null.
 */
export function matchKnownBottle(
  product: Pick<HygieneProduct, "name" | "category" | "size_ml">,
  catalogue: CatalogueNameRow[],
): CatalogueNameRow | null {
  const tokens = nameTokens(product.name);
  const brandTokens = tokens.filter((t) => !isStyleToken(t));
  const styleTokens = tokens.filter(isStyleToken);
  if (brandTokens.length === 0) return null;

  const candidates = new Map<string, CatalogueNameRow>();
  let exact: CatalogueNameRow | null = null;

  for (const row of catalogue) {
    if (!row.has_calibration) continue;
    if (product.category && row.category && product.category !== row.category) continue;
    if (product.size_ml != null && row.size_ml != null && Math.abs(product.size_ml - Number(row.size_ml)) > 30) continue;

    for (const candidateName of [row.canonical_name, ...(row.aliases ?? [])]) {
      const cTokens = nameTokens(candidateName);
      const cBrand = cTokens.filter((t) => !isStyleToken(t));
      const cStyle = cTokens.filter(isStyleToken);
      if (cBrand.length === 0) continue;
      if (!brandTokens.every((t) => cBrand.some((c) => prefixMatch(t, c)))) continue;
      if (
        styleTokens.length && cStyle.length &&
        !styleTokens.every((s) => cStyle.includes(s)) &&
        !cStyle.every((s) => styleTokens.includes(s))
      ) continue;

      const extra = cBrand.filter((c) => !brandTokens.some((t) => prefixMatch(t, c)));
      if (extra.length === 0 && brandTokens.length === cBrand.length) {
        exact = row;
        break;
      }
      if (extra.length > 2) continue;
      if (extra.some((t) => VARIANT_WORDS.has(t))) continue;
      candidates.set(row.id, row);
    }
    if (exact) break;
  }

  if (exact) return exact;
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}
