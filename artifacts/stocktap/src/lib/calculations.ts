import { gpPercentForProduct } from "./inventory-reporting";

/**
 * StockTap Core Calculations — UK pub stock-taking by weight
 * All calculations are exact as specified.
 */

/**
 * Derive empty (tare) weight from full weight.
 * empty_weight_g = round(full_weight_g - (size_ml * density))
 */
export function deriveEmptyWeight(fullWeightG: number, sizeMl: number, density: number): number {
  return Math.round(fullWeightG - sizeMl * density);
}

/** Minimum plausible liquid density for any beverage product, g/ml (very high-ABV spirit). */
export const CALIBRATION_DENSITY_MIN = 0.90;
/** Maximum plausible liquid density for any beverage product, g/ml (thick sugar syrup). */
export const CALIBRATION_DENSITY_MAX = 1.40;

/**
 * Derive liquid density from two calibration measurements.
 * density = (full_weight_g - empty_weight_g) / size_ml
 *
 * Prefer this over a stored density assumption when both weights are directly measured —
 * a measurement beats an assumption.
 */
export function deriveDensity(fullWeightG: number, emptyWeightG: number, sizeMl: number): number {
  if (sizeMl <= 0) return 0;
  return (fullWeightG - emptyWeightG) / sizeMl;
}

export interface CalibrationPlausibility {
  ok: boolean;
  impliedDensity: number;
  warningMessage: string;
}

/**
 * Validate that a full/empty weight pair produces a plausible calibration.
 * Returns ok=false with a plain-English warningMessage if anything looks wrong.
 * Use before saving calibration data to catch mis-weighings early.
 *
 * Rejects when:
 *   - emptyWeightG <= 0 (near-zero or negative tare — almost certainly a mis-weigh)
 *   - implied density < CALIBRATION_DENSITY_MIN or > CALIBRATION_DENSITY_MAX
 */
export function checkCalibrationPlausibility(
  fullWeightG: number,
  emptyWeightG: number,
  sizeMl: number
): CalibrationPlausibility {
  const impliedDensity = sizeMl > 0 ? (fullWeightG - emptyWeightG) / sizeMl : 0;

  if (emptyWeightG <= 0) {
    return {
      ok: false,
      impliedDensity,
      warningMessage: `This gives an empty-bottle weight of ${Math.round(emptyWeightG)}g — did you weigh a full, sealed bottle? Check the gram reading.`,
    };
  }

  if (impliedDensity < CALIBRATION_DENSITY_MIN || impliedDensity > CALIBRATION_DENSITY_MAX) {
    return {
      ok: false,
      impliedDensity,
      warningMessage: `Implied density ${impliedDensity.toFixed(3)} g/ml is outside the expected range (${CALIBRATION_DENSITY_MIN}–${CALIBRATION_DENSITY_MAX}). Did you weigh a full, sealed bottle?`,
    };
  }

  return { ok: true, impliedDensity, warningMessage: "" };
}

/**
 * Calculate ml remaining from current weight.
 * ml_remaining = clamp((current_weight_g - empty_weight_g) / density, 0, size_ml)
 */
export function calcMlRemaining(
  currentWeightG: number,
  emptyWeightG: number,
  density: number,
  sizeMl: number
): number {
  // Guard a missing/zero density (would give NaN or Infinity and poison every
  // downstream total). Fall back to a plausible spirit density so the reading
  // degrades sensibly instead of corrupting the stocktake.
  const d = density > 0 && isFinite(density) ? density : 0.95;
  const ml = (currentWeightG - emptyWeightG) / d;
  return Math.max(0, Math.min(isFinite(ml) ? ml : 0, sizeMl));
}

/**
 * Calculate ml remaining using the weight-fraction method (preferred when both
 * full_weight_g and empty_weight_g are calibrated).
 *
 * fraction = clamp((current - empty) / (full - empty), 0, 1)
 * ml_remaining = fraction × size_ml
 *
 * This is mathematically equivalent to the density formula when density is
 * correctly derived, but is immune to density=0 / missing density values.
 */
export function calcMlRemainingFromWeights(
  currentWeightG: number,
  emptyWeightG: number,
  fullWeightG: number,
  sizeMl: number
): number {
  const range = fullWeightG - emptyWeightG;
  if (range <= 0) return 0;
  const fraction = Math.max(0, Math.min(1, (currentWeightG - emptyWeightG) / range));
  return fraction * sizeMl;
}

/**
 * Calculate tenths (0–10 scale, 1 decimal place).
 * tenths = round(ml_remaining / size_ml * 10, 1)
 */
export function calcTenths(mlRemaining: number, sizeMl: number): number {
  if (sizeMl <= 0) return 0;
  return Math.round((mlRemaining / sizeMl) * 10 * 10) / 10;
}

/**
 * Calculate measures remaining.
 * measures_left = floor(ml_remaining / measure_ml)
 */
export function calcMeasuresLeft(mlRemaining: number, measureMl: number): number {
  if (measureMl <= 0) return 0;
  return Math.floor(mlRemaining / measureMl);
}

/**
 * Calculate sold since last reading (in measures).
 * sold_since_last = (previous_reading_ml - current_ml) / measure_ml
 */
export function calcSoldSinceLast(
  previousMl: number,
  currentMl: number,
  measureMl: number
): number {
  if (measureMl <= 0) return 0;
  return (previousMl - currentMl) / measureMl;
}

/**
 * Calculate £ value of units sold.
 */
export function calcRevenueSold(measuresSold: number, pourPrice: number): number {
  return measuresSold * pourPrice;
}

/**
 * Calculate variance between weight-derived sales and till sales.
 * Positive = surplus (over-poured), Negative = deficit (missing money).
 */
export function calcVariance(soldByWeight: number, tillMeasuresSold: number): number {
  return soldByWeight - tillMeasuresSold;
}

/**
 * Cost per measure (ex-VAT).
 * cost_per_measure = cost_price / (size_ml / measure_ml)
 */
export function calcCostPerMeasure(costPrice: number, sizeMl: number, measureMl: number): number {
  if (measureMl <= 0 || sizeMl <= 0) return 0;
  return costPrice / (sizeMl / measureMl);
}

/**
 * Gross profit percentage (ex-VAT).
 * GP% = (pour_price - cost_per_measure) / pour_price * 100
 */
export function calcGpPercent(pourPrice: number, costPerMeasure: number): number {
  if (pourPrice <= 0) return 0;
  return ((pourPrice - costPerMeasure) / pourPrice) * 100;
}

/**
 * Canonical, unit-aware GP% for a product. THE single source of truth —
 * every screen that shows GP% must use this so numbers agree everywhere.
 *
 * - unit "count" (packaged: bottled beer, cans, bags): cost_price and
 *   pour_price are both PER ITEM → GP = (pour − cost) / pour.
 * - unit "weigh" (spirits, wine…): cost_price is per bottle, pour_price is
 *   per measure → convert cost to cost-per-measure first.
 *
 * Returns null when the product lacks the data needed for a meaningful GP.
 */
export function calcProductGpPercent(
  p: {
    type?: string | null;
    unit?: string | null;
    counting_method?: string | null;
    container_l?: number | null;
    pack_size?: number | null;
    cost_price?: number | null;
    pour_price?: number | null;
    size_ml?: number | null;
    measure_ml?: number | null;
  },
  defaultMeasureMl: number,
): number | null {
  // One GP definition everywhere: the Reports helper handles dozen packs,
  // per-unit packaged lines, draught pints and wine glasses correctly, so the
  // Library and Home must agree with it rather than carry a second formula.
  return gpPercentForProduct(p, defaultMeasureMl);
}

/**
 * Valuation for a weigh-unit product.
 * value = (ml_remaining / size_ml) * cost_price
 */
export function calcWeighValuation(mlRemaining: number, sizeMl: number, costPrice: number): number {
  if (sizeMl <= 0) return 0;
  return (mlRemaining / sizeMl) * costPrice;
}

/**
 * Valuation for a count-unit product.
 * value = count * cost_price
 */
export function calcCountValuation(count: number, costPrice: number): number {
  return count * costPrice;
}

/**
 * Format a number as GBP currency (£).
 */
export function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

/**
 * Format ml remaining as a readable string.
 */
export function formatMl(ml: number): string {
  return `${Math.round(ml)}ml`;
}

/**
 * Display value based on user preference (tenths or exact).
 */
export function displayAmount(
  mlRemaining: number,
  sizeMl: number,
  measureMl: number,
  view: "tenths" | "exact"
): string {
  if (view === "tenths") {
    return `${calcTenths(mlRemaining, sizeMl).toFixed(1)} tenths`;
  }
  return `${Math.round(mlRemaining)}ml / ${calcMeasuresLeft(mlRemaining, measureMl)} measures`;
}

/**
 * Default densities by product type (g/ml).
 */
export const DEFAULT_DENSITIES: Record<string, number> = {
  spirit:   0.948, // 40% ABV
  gin:      0.948, // 40% ABV (use 0.951 for 37.5% ABV products)
  vodka:    0.948, // 40% ABV
  whisky:   0.948, // 40% ABV
  rum:      0.948, // 40% ABV
  liqueur:  1.05,
  wine:     0.99,
  sparkling: 0.99,
  vermouth: 0.99,
  syrup:    1.29,
  cordial:  1.1,
  packaged: 1.0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Full-bar unit model — per-category counting methods
// ─────────────────────────────────────────────────────────────────────────────

export type ProductCategory =
  | "draught_lager" | "draught_ale" | "draught_cider" | "draught_stout"
  | "minerals" | "packaged" | "postmix" | "spirits" | "wines";

export type CountingMethod =
  | "dipstick" | "keg_weight" | "tenths_pints" | "dozen" | "each" | "litre" | "weigh" | "tenths" | "photo_tap";

export type ContainerType = "keg" | "cask" | "bag_in_box";

/** Which counting methods are valid for each category, and the default. */
export const CATEGORY_METHODS: Record<ProductCategory, { methods: CountingMethod[]; default: CountingMethod }> = {
  draught_lager: { methods: ["dipstick", "keg_weight", "tenths_pints"], default: "keg_weight" },
  draught_ale: { methods: ["dipstick", "keg_weight", "tenths_pints"], default: "tenths_pints" },
  draught_cider: { methods: ["dipstick", "keg_weight", "tenths_pints"], default: "keg_weight" },
  draught_stout: { methods: ["dipstick", "keg_weight", "tenths_pints"], default: "keg_weight" },
  minerals: { methods: ["dozen", "each", "litre"], default: "dozen" },
  packaged: { methods: ["dozen", "each", "litre"], default: "each" },
  postmix: { methods: ["litre"], default: "litre" },
  spirits: { methods: ["weigh", "tenths", "photo_tap"], default: "weigh" },
  wines: { methods: ["weigh", "tenths", "photo_tap"], default: "weigh" },
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  draught_lager: "Draught Lager",
  draught_ale: "Draught Ale",
  draught_cider: "Draught Cider",
  draught_stout: "Draught Stout",
  minerals: "Minerals",
  packaged: "Packaged",
  postmix: "Postmix",
  spirits: "Spirits",
  wines: "Wines",
};

export const METHOD_LABELS: Record<CountingMethod, string> = {
  dipstick: "Dipstick",
  keg_weight: "Keg weight",
  tenths_pints: "Tenths / pints",
  dozen: "Dozen",
  photo_tap: "Photo tap",
  each: "Each",
  litre: "Litre",
  weigh: "Weigh",
  tenths: "Tenths",
};

export function isDraughtCategory(category: string | null | undefined): boolean {
  return !!category && category.startsWith("draught_");
}

/** Container capacity in ml for a draught/postmix product. */
export function draughtCapacityMl(containerL: number | null | undefined): number {
  return (containerL ?? 0) * 1000;
}

/**
 * Effective full-container capacity in ml for any product, based on counting_method.
 * Use this instead of `size_ml ?? 700` anywhere you need to compute tenths or value.
 *
 * - keg_weight / dipstick / tenths_pints → container_l × 1000
 * - each                                 → size_ml || 1
 * - dozen                                → (pack_size ?? 12) × (size_ml || 1)
 * - weigh / tenths / null                → size_ml ?? 700
 */
export function productCapacityMl(p: {
  counting_method?: string | null;
  container_l?: number | null;
  size_ml?: number | null;
  pack_size?: number | null;
}): number {
  const m = p.counting_method;
  if (m === "keg_weight" || m === "dipstick" || m === "tenths_pints") {
    return draughtCapacityMl(p.container_l);
  }
  if (m === "each")  return p.size_ml || 1;
  if (m === "dozen") return (p.pack_size ?? 12) * (p.size_ml || 1);
  return p.size_ml ?? 700;
}

/** Result of a single reading entry, normalised for display regardless of counting method. */
export interface CategoryReadingResult {
  mlRemaining: number;
  tenths: number;
  fullContainers: number;
  partContainerFraction: number; // 0..1, fraction of the "in use" / partial container
  measuresRemaining: number;
  volumeMl: number;
  valueGbp: number;
}

/** ml per Imperial pint (used for keg/barrel pint ↔ ml conversions). */
export const ML_PER_PINT = 568.261;

/** Raw, method-specific input captured on the stocktake screen. */
export interface CategoryReadingInput {
  method: CountingMethod;
  // dipstick
  dipMm?: number;
  // keg_weight — user reads pints directly off the keg-weigher gadget
  partialPints?: number;
  // tenths_pints / tenths (spirits)
  tenths?: number;
  // dozen
  fullPacks?: number;
  partUnits?: number;
  // each
  count?: number;
  // litre
  litres?: number;
  // weigh (existing)
  weightG?: number;
  // photo_tap — tap position as fraction of bottle height from bottom (0=empty, 1=full)
  tapY?: number;
  // shared: number of full/unopened spare containers/cases in addition to the one being read
  fullContainers?: number;
}

export interface CategoryReadingProduct {
  category: ProductCategory | null;
  unit: "weigh" | "count";
  sizeMl: number | null;
  density: number;
  emptyWeightG: number | null;
  /** When set alongside emptyWeightG, the weight-fraction formula is used instead of density. */
  fullWeightG: number | null;
  costPrice: number | null;
  measureMl: number | null;
  containerL: number | null;
  dipFullMm: number | null;
  packSize: number | null;
  fillCurve?: Array<{ y: number; fill: number }>;
}

/**
 * Compute a normalised reading result from method-specific input.
 * Falls back to the legacy weigh/count logic when no category is set.
 */
export function computeCategoryReading(
  product: CategoryReadingProduct,
  input: CategoryReadingInput,
  venueMeasureMl: number
): CategoryReadingResult {
  const measureMl = product.measureMl ?? venueMeasureMl;
  const fullSpare = input.fullContainers ?? 0;
  let partialMl = 0;
  let capacityMl = product.sizeMl ?? 0;
  // What to persist as `full_containers`. For most methods it's the spare full
  // containers; for "dozen" it must be the full PACKS, or close-time count math
  // (full_containers*packSize + loose) drops the packs entirely.
  let reportedFullContainers = fullSpare;

  switch (input.method) {
    case "dipstick": {
      capacityMl = draughtCapacityMl(product.containerL);
      const dipFull = product.dipFullMm ?? 0;
      const frac = dipFull > 0 ? Math.max(0, Math.min(1, (input.dipMm ?? 0) / dipFull)) : 0;
      partialMl = frac * capacityMl;
      break;
    }
    case "keg_weight": {
      capacityMl = draughtCapacityMl(product.containerL);
      // User reads pints directly from the keg-weigher gadget; convert to ml for storage.
      // When no capacity is set (capacityMl === 0) do NOT clamp — let the raw pint reading
      // through so partial entries aren't silently zeroed. Full containers still contribute 0
      // (we can't know their volume) but that is surfaced as a UI warning, not silent loss.
      const rawPartialMl = (input.partialPints ?? 0) * ML_PER_PINT;
      partialMl = capacityMl > 0 ? Math.max(0, Math.min(rawPartialMl, capacityMl)) : rawPartialMl;
      break;
    }
    case "tenths_pints": {
      capacityMl = draughtCapacityMl(product.containerL);
      partialMl = ((input.tenths ?? 0) / 10) * capacityMl;
      break;
    }
    case "tenths": {
      capacityMl = product.sizeMl ?? 0;
      partialMl = ((input.tenths ?? 0) / 10) * capacityMl;
      break;
    }
    case "dozen": {
      const packSize = product.packSize ?? 12;
      // sizeMl is per-unit capacity. When unknown, store total_units as raw count
      // so valueGbp = (total_units/packSize)*costPrice_per_pack is preserved.
      const unitMl = product.sizeMl || 1;
      capacityMl = packSize * unitMl;
      const fullPacks = input.fullPacks ?? 0;
      const partUnits = input.partUnits ?? 0;
      partialMl = (fullPacks * packSize + partUnits) * unitMl;
      reportedFullContainers = fullPacks;
      break;
    }
    case "each": {
      // sizeMl is per-unit capacity. When unknown, store count as raw units
      // (1 unit = 1 storage unit) so valueGbp = (count/1)*costPrice = count*costPrice.
      const unitMl = product.sizeMl || 1;
      capacityMl = unitMl;
      partialMl = (input.count ?? 0) * unitMl;
      break;
    }
    case "litre": {
      capacityMl = draughtCapacityMl(product.containerL) || (input.litres ?? 0) * 1000;
      partialMl = (input.litres ?? 0) * 1000;
      break;
    }
    case "photo_tap": {
      capacityMl = product.sizeMl ?? 0;
      const curve = (product.fillCurve ?? []).slice().sort((a, b) => a.y - b.y);
      if (curve.length >= 2 && capacityMl > 0) {
        const tapY = Math.max(0, Math.min(1, input.tapY ?? 0));
        let fillFraction: number;
        if (tapY <= curve[0].y) {
          fillFraction = curve[0].fill;
        } else if (tapY >= curve[curve.length - 1].y) {
          fillFraction = curve[curve.length - 1].fill;
        } else {
          const idx = curve.findIndex(pt => pt.y > tapY) - 1;
          const lo = curve[idx];
          const hi = curve[idx + 1];
          const t = (tapY - lo.y) / (hi.y - lo.y);
          fillFraction = lo.fill + t * (hi.fill - lo.fill);
        }
        partialMl = Math.max(0, Math.min(1, fillFraction)) * capacityMl;
      }
      break;
    }
    case "weigh":
    default: {
      capacityMl = product.sizeMl ?? 0;
      // Prefer weight-fraction formula when both calibration weights are available —
      // it is immune to density=0/missing and is mathematically equivalent when
      // density is correctly derived from the calibration.
      if (product.fullWeightG != null && product.emptyWeightG != null) {
        partialMl = calcMlRemainingFromWeights(
          input.weightG ?? 0, product.emptyWeightG, product.fullWeightG, capacityMl
        );
      } else {
        partialMl = calcMlRemaining(input.weightG ?? 0, product.emptyWeightG ?? 0, product.density, capacityMl);
      }
      break;
    }
  }

  const mlRemaining = fullSpare * capacityMl + partialMl;
  const tenths = capacityMl > 0 ? calcTenths(partialMl, capacityMl) : 0;
  const partContainerFraction = capacityMl > 0 ? Math.max(0, Math.min(1, partialMl / capacityMl)) : 0;
  const measuresRemaining = calcMeasuresLeft(mlRemaining, measureMl);
  const valueGbp = capacityMl > 0 && product.costPrice
    ? (mlRemaining / capacityMl) * product.costPrice
    : 0;

  return {
    mlRemaining,
    tenths,
    fullContainers: reportedFullContainers,
    partContainerFraction,
    measuresRemaining,
    volumeMl: mlRemaining,
    valueGbp,
  };
}

/**
 * Resolve the measure size (ml) that should drive measures-remaining / GP% / variance
 * maths for a product: the product's own override always wins, otherwise fall back to
 * the venue's configured measure preset (uk/ie/us/eu/free_pour), and finally 25ml.
 * Use this everywhere instead of ad-hoc `product.measure_ml ?? venue.measure_ml ?? 25`
 * chains so a venue-level measure change consistently propagates everywhere.
 */
export function resolveMeasureMl(
  productMeasureMl: number | null | undefined,
  venueMeasureMl: number | null | undefined
): number {
  return productMeasureMl ?? venueMeasureMl ?? 25;
}

/** Venue measure-size presets by locale/system. Values in ml (US converted from fl oz). */
export const MEASURE_PRESETS: Record<string, { label: string; options: { label: string; ml: number }[] }> = {
  uk: { label: "UK", options: [{ label: "25ml", ml: 25 }, { label: "35ml", ml: 35 }, { label: "50ml", ml: 50 }] },
  ie: { label: "Ireland", options: [{ label: "35.5ml", ml: 35.5 }] },
  us: {
    label: "US",
    options: [
      { label: "1oz", ml: 29.57 },
      { label: "1.25oz", ml: 36.97 },
      { label: "1.5oz", ml: 44.36 },
    ],
  },
  eu: { label: "EU", options: [{ label: "20ml", ml: 20 }, { label: "40ml", ml: 40 }] },
  free_pour: { label: "Free-pour", options: [{ label: "No fixed measure", ml: 0 }] },
};

/**
 * Generate a unique referral code.
 */
export function generateReferralCode(venueId: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix = "ST";
  let code = prefix;
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
