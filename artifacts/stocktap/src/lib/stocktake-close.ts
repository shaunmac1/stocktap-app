import { calcMeasuresLeft, productCapacityMl } from "./calculations";

export type StocktakeEntryMethod =
  | "weigh"
  | "tenths"
  | "count"
  | "keg_weight"
  | "dipstick"
  | "tenths_pints"
  | "dozen"
  | "each"
  | "litre"
  | "photo_tap";

export interface StocktakeEntryLike {
  product_id: string;
  method: StocktakeEntryMethod;
  full_containers: number | null;
  part_value: number | null;
  ml_remaining: number;
}

export interface StocktakeProductLike {
  id: string;
  unit: "weigh" | "count";
  counting_method?: string | null;
  size_ml?: number | null;
  container_l?: number | null;
  pack_size?: number | null;
  cost_price?: number | null;
  measure_ml?: number | null;
  location_id?: string | null;
}

export interface AggregatedStocktakeReading {
  productId: string;
  method: StocktakeEntryMethod;
  mlRemaining: number;
  count: number | null;
  fullContainers: number | null;
  partValue: number | null;
}

export interface PersistedStocktakeReading {
  venue_id: string;
  product_id: string;
  location_id: string | null;
  stocktake_id: string;
  method: StocktakeEntryMethod;
  weight_g: number | null;
  count: number | null;
  ml_remaining: number;
  user_id: string;
  reading_at: string;
  full_containers: number | null;
  part_value: number | null;
}

export interface ReadingToPersist {
  productName: string;
  payload: PersistedStocktakeReading;
}

const DISCRETE_METHODS = new Set<StocktakeEntryMethod>(["count", "each", "dozen"]);

export function isDiscreteCountMethod(method: StocktakeEntryMethod): boolean {
  return DISCRETE_METHODS.has(method);
}

function aggregateSingleMethod(
  product: StocktakeProductLike,
  method: StocktakeEntryMethod,
  entries: StocktakeEntryLike[],
): AggregatedStocktakeReading {
  const mlRemaining = entries.reduce((sum, entry) => sum + entry.ml_remaining, 0);
  const fullContainersRaw = entries.reduce((sum, entry) => sum + (entry.full_containers ?? 0), 0);
  const partValueRaw = entries.reduce((sum, entry) => sum + (entry.part_value ?? 0), 0);

  let count: number | null = null;
  if (method === "each" || method === "count") {
    count = partValueRaw;
  } else if (method === "dozen") {
    const packSize = product.pack_size ?? 12;
    count = fullContainersRaw * packSize + partValueRaw;
  }

  return {
    productId: product.id,
    method,
    mlRemaining,
    count,
    fullContainers: entries.some((entry) => entry.full_containers != null) ? fullContainersRaw : null,
    partValue: entries.some((entry) => entry.part_value != null) ? partValueRaw : null,
  };
}

/** Group entries by method, preserving first-seen order. */
function groupByMethod(entries: StocktakeEntryLike[]): Map<StocktakeEntryMethod, StocktakeEntryLike[]> {
  const byMethod = new Map<StocktakeEntryMethod, StocktakeEntryLike[]>();
  for (const entry of entries) {
    if (!byMethod.has(entry.method)) byMethod.set(entry.method, []);
    byMethod.get(entry.method)!.push(entry);
  }
  return byMethod;
}

/**
 * Aggregate all of a product's line entries — across count areas AND across
 * methods — into one reading.
 *
 * Mixed methods happen in real life: a product weighed at the bar, then its
 * counting method edited in the Library, then more entries added in the
 * cellar as tenths. Previously this THREW, which crashed the whole Stocktake
 * page render and permanently bricked the open stocktake. Now the subgroups
 * are aggregated per method and merged: ml always sums (it is the universal
 * normalised quantity every method produces), counts sum across discrete
 * subgroups, and the "primary" method (the one holding the most stock by ml)
 * labels the persisted reading. Data is never lost and closing never throws
 * for mixed methods.
 */
export function aggregateProductEntries(
  product: StocktakeProductLike,
  entries: StocktakeEntryLike[],
): AggregatedStocktakeReading {
  if (entries.length === 0) {
    throw new Error(`Cannot aggregate an empty stocktake entry list for product ${product.id}`);
  }

  const byMethod = groupByMethod(entries);

  if (byMethod.size === 1) {
    return aggregateSingleMethod(product, entries[0].method, entries);
  }

  const subs = Array.from(byMethod.entries()).map(([method, methodEntries]) =>
    aggregateSingleMethod(product, method, methodEntries),
  );

  // Primary = the subgroup holding the most stock (by ml); ties keep first-seen order.
  const primary = subs.reduce((best, sub) => (sub.mlRemaining > best.mlRemaining ? sub : best), subs[0]);

  const mlRemaining = subs.reduce((sum, sub) => sum + sub.mlRemaining, 0);
  const anyCounts = subs.some((sub) => sub.count != null);
  const count = anyCounts ? subs.reduce((sum, sub) => sum + (sub.count ?? 0), 0) : null;

  return {
    productId: product.id,
    method: primary.method,
    mlRemaining,
    count,
    // full/part values are method-specific units — only the primary subgroup's
    // figures are meaningful on the merged reading.
    fullContainers: primary.fullContainers,
    partValue: primary.partValue,
  };
}

/**
 * Value all of a product's line entries, mixed methods included: each method
 * subgroup is valued with its own method's rules, then summed. For a single
 * method this is identical to valueAggregatedReading(aggregateProductEntries()).
 */
export function valueProductEntries(
  product: StocktakeProductLike,
  entries: StocktakeEntryLike[],
): number {
  if (entries.length === 0) return 0;
  const byMethod = groupByMethod(entries);
  let total = 0;
  for (const [method, methodEntries] of byMethod) {
    total += valueAggregatedReading(product, aggregateSingleMethod(product, method, methodEntries));
  }
  return total;
}

export function valueAggregatedReading(
  product: StocktakeProductLike,
  reading: AggregatedStocktakeReading,
): number {
  const costPrice = product.cost_price ?? 0;
  if (costPrice <= 0) return 0;

  if (reading.method === "dozen") {
    const packSize = product.pack_size ?? 12;
    return packSize > 0 ? ((reading.count ?? 0) / packSize) * costPrice : 0;
  }

  if (reading.method === "count" || reading.method === "each") {
    return (reading.count ?? 0) * costPrice;
  }

  const capacityMl = productCapacityMl(product);
  return capacityMl > 0 ? (reading.mlRemaining / capacityMl) * costPrice : 0;
}

export function buildPersistedReading(
  product: StocktakeProductLike,
  reading: AggregatedStocktakeReading,
  context: { venueId: string; stocktakeId: string; userId: string; readingAt?: string },
): PersistedStocktakeReading {
  return {
    venue_id: context.venueId,
    product_id: product.id,
    location_id: product.location_id ?? null,
    stocktake_id: context.stocktakeId,
    method: reading.method,
    weight_g: reading.method === "weigh" ? reading.partValue : null,
    count: reading.count,
    ml_remaining: reading.mlRemaining,
    user_id: context.userId,
    reading_at: context.readingAt ?? new Date().toISOString(),
    full_containers: reading.fullContainers,
    part_value: reading.partValue,
  };
}

export async function persistReadingsThenClose<T extends { _synced: 0 | 1 }>(
  readings: ReadingToPersist[],
  saveReading: (payload: PersistedStocktakeReading) => Promise<T>,
  closeStocktake: () => Promise<void>,
): Promise<string[]> {
  const pendingSyncProducts: string[] = [];

  for (const reading of readings) {
    const saved = await saveReading(reading.payload);
    if (saved._synced === 0) pendingSyncProducts.push(reading.productName);
  }

  await closeStocktake();
  return pendingSyncProducts;
}

export function measuresRemaining(
  reading: AggregatedStocktakeReading,
  productMeasureMl: number | null | undefined,
  venueMeasureMl: number,
): number {
  return calcMeasuresLeft(reading.mlRemaining, productMeasureMl ?? venueMeasureMl);
}
