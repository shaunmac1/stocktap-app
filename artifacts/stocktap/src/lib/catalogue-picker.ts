export type CatalogueConfidence = "unverified" | "low" | "medium" | "high" | "verified";

export interface SafeCatalogueItem {
  id: string;
  canonical_name: string;
  type: string;
  category: string;
  unit: string;
  counting_method: string;
  size_ml: number | null;
  container_type: string | null;
  container_l: number | null;
  pack_size: number | null;
  abv: number | null;
  calibration_sample_count: number;
  calibration_confidence: CatalogueConfidence;
  has_calibration: boolean;
  already_added: boolean;
}

/**
 * Prunes `selectedIds` to remove entries that are no longer valid (e.g. an
 * item became `already_added` after a catalogue refresh).
 *
 * Critically, this function returns the **same array reference** when nothing
 * is removed.  That makes the `useState` functional-updater a no-op for
 * React's `Object.is` comparison — avoiding an infinite re-render loop when
 * the catalogue items array is empty (Error #185).
 */
export function pruneSelectedIds(
  selectedIds: string[],
  catalogueItems: SafeCatalogueItem[],
): string[] {
  if (catalogueItems.length === 0) return selectedIds;
  const stillAddable = new Set(
    catalogueItems.filter((item) => !item.already_added).map((item) => item.id),
  );
  const pruned = selectedIds.filter(
    (id) => stillAddable.has(id) || !catalogueItems.some((item) => item.id === id),
  );
  return pruned.length === selectedIds.length ? selectedIds : pruned;
}

export function toggleCatalogueSelection(
  selectedIds: string[],
  item: Pick<SafeCatalogueItem, "id" | "already_added">,
): string[] {
  if (item.already_added) return selectedIds;
  return selectedIds.includes(item.id)
    ? selectedIds.filter((id) => id !== item.id)
    : [...selectedIds, item.id];
}

export function selectedAddableItems(
  items: SafeCatalogueItem[],
  selectedIds: string[],
): SafeCatalogueItem[] {
  const selected = new Set(selectedIds);
  return items.filter((item) => selected.has(item.id) && !item.already_added);
}

export function remainingProductSlots(
  tier: "free" | "pro" | "premium",
  currentProductCount: number,
): number {
  if (tier !== "free") return Number.POSITIVE_INFINITY;
  return Math.max(0, 50 - Math.max(0, currentProductCount));
}

export function selectionExceedsPlan(
  tier: "free" | "pro" | "premium",
  currentProductCount: number,
  addableCount: number,
): boolean {
  return addableCount > remainingProductSlots(tier, currentProductCount);
}

export function catalogueSizeLabel(item: Pick<SafeCatalogueItem, "size_ml" | "container_l" | "pack_size">): string {
  if (item.container_l != null) return `${item.container_l}L container`;
  if (item.pack_size != null && item.size_ml != null) return `${item.pack_size} × ${item.size_ml}ml`;
  if (item.size_ml != null) return `${item.size_ml}ml`;
  return "Size not set";
}

export function catalogueConfidenceLabel(
  item: Pick<SafeCatalogueItem, "calibration_confidence" | "calibration_sample_count" | "has_calibration">,
): string {
  if (!item.has_calibration) return "Manual setup required";
  if (item.calibration_confidence === "verified") return "Verified calibration";
  if (item.calibration_confidence === "high") return `High confidence · ${item.calibration_sample_count} samples`;
  if (item.calibration_confidence === "medium") return `Starter calibration · ${item.calibration_sample_count} sample`;
  return "Calibration needs confirmation";
}

export function isCatalogueProduct(externalId: string | null | undefined): boolean {
  return !!externalId?.startsWith("catalogue:");
}
