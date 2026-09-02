import {
  ML_PER_PINT,
  calcGpPercent,
  productCapacityMl,
} from "./calculations";

export interface ReportProductLike {
  type?: string | null;
  unit?: string | null;
  counting_method?: string | null;
  size_ml?: number | null;
  container_l?: number | null;
  pack_size?: number | null;
  cost_price?: number | null;
  pour_price?: number | null;
  measure_ml?: number | null;
}

export interface ReportReadingLike {
  ml_remaining?: number | null;
  count?: number | null;
}

export function isVolumeCountingMethod(method: string | null | undefined): boolean {
  return method === "keg_weight" || method === "dipstick" || method === "tenths_pints";
}

export function isDozenProduct(product: ReportProductLike): boolean {
  return product.counting_method === "dozen";
}

export function isDiscreteCountProduct(product: ReportProductLike): boolean {
  return product.unit === "count" && !isVolumeCountingMethod(product.counting_method);
}

/** Quantity expressed in purchase units: items, packs, bottles, kegs or containers. */
export function purchaseUnitsFromReading(
  product: ReportProductLike,
  reading: ReportReadingLike | null | undefined,
): number {
  if (!reading) return 0;

  if (isDozenProduct(product)) {
    const packSize = product.pack_size ?? 12;
    return packSize > 0 ? (reading.count ?? 0) / packSize : 0;
  }

  if (isDiscreteCountProduct(product)) return reading.count ?? 0;

  const capacityMl = productCapacityMl(product);
  return capacityMl > 0 ? (reading.ml_remaining ?? 0) / capacityMl : 0;
}

export function stockValueFromReading(
  product: ReportProductLike,
  reading: ReportReadingLike | null | undefined,
): number {
  const costPrice = product.cost_price ?? 0;
  if (costPrice <= 0) return 0;
  return purchaseUnitsFromReading(product, reading) * costPrice;
}

/** Value a movement whose quantity is stored as ml-equivalent purchase volume. */
export function movementValueFromMl(
  product: ReportProductLike,
  quantityMl: number,
  unitCostPence?: number | null,
): number {
  const capacityMl = productCapacityMl(product);
  if (capacityMl <= 0) return 0;
  const unitCost = unitCostPence != null ? unitCostPence / 100 : (product.cost_price ?? 0);
  return (quantityMl / capacityMl) * unitCost;
}

/** Cost of one sold unit: item, loose unit from a pack, measure or pint. */
export function costPerSoldUnit(
  product: ReportProductLike,
  defaultMeasureMl: number,
): number | null {
  const costPrice = product.cost_price;
  if (costPrice == null || costPrice < 0) return null;

  if (isDozenProduct(product)) {
    const packSize = product.pack_size ?? 12;
    return packSize > 0 ? costPrice / packSize : null;
  }

  // Per-unit cost: discrete counts, anything counted "each", and packaged
  // lines that are not draught (a bottle of Peroni is sold whole, not by measure).
  if (
    isDiscreteCountProduct(product) ||
    product.counting_method === "each" ||
    (product.type === "packaged" && !isVolumeCountingMethod(product.counting_method))
  ) return costPrice;

  const capacityMl = productCapacityMl(product);
  if (capacityMl <= 0) return null;
  // Wine and sparkling default to a 175ml glass, not the spirit measure.
  const isWine = product.type === "wine" || product.type === "sparkling";
  // Single-serve wine and prosecco (187ml, 200ml) is sold as the whole bottle.
  if (isWine && capacityMl <= 250 && product.measure_ml == null) return costPrice;
  const measureMl = product.measure_ml
    ?? (isVolumeCountingMethod(product.counting_method) ? ML_PER_PINT : isWine ? 175 : defaultMeasureMl);
  if (measureMl <= 0) return null;
  return (costPrice / capacityMl) * measureMl;
}

export function gpPercentForProduct(
  product: ReportProductLike,
  defaultMeasureMl: number,
): number | null {
  if (product.pour_price == null || product.pour_price <= 0) return null;
  const cost = costPerSoldUnit(product, defaultMeasureMl);
  return cost == null ? null : calcGpPercent(product.pour_price, cost);
}

export function purchaseUnitLabel(product: ReportProductLike): string {
  if (isDozenProduct(product)) return "packs";
  if (isDiscreteCountProduct(product)) return "units";
  if (isVolumeCountingMethod(product.counting_method)) return "containers";
  return "btls";
}
