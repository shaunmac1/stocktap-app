import { describe, expect, it } from "vitest";
import {
  catalogueConfidenceLabel,
  catalogueSizeLabel,
  isCatalogueProduct,
  pruneSelectedIds,
  remainingProductSlots,
  selectedAddableItems,
  selectionExceedsPlan,
  toggleCatalogueSelection,
  type SafeCatalogueItem,
} from "./catalogue-picker";

const item = (overrides: Partial<SafeCatalogueItem> = {}): SafeCatalogueItem => ({
  id: "catalogue-1",
  canonical_name: "Test Gin",
  type: "gin",
  category: "spirits",
  unit: "weigh",
  counting_method: "weigh",
  size_ml: 700,
  container_type: null,
  container_l: null,
  pack_size: null,
  abv: 40,
  calibration_sample_count: 1,
  calibration_confidence: "medium",
  has_calibration: true,
  already_added: false,
  ...overrides,
});

describe("catalogue multi-select", () => {
  it("adds and removes selectable catalogue ids", () => {
    expect(toggleCatalogueSelection([], item())).toEqual(["catalogue-1"]);
    expect(toggleCatalogueSelection(["catalogue-1"], item())).toEqual([]);
  });

  it("never selects a product already in the venue library", () => {
    expect(toggleCatalogueSelection([], item({ already_added: true }))).toEqual([]);
  });

  it("filters selected ids down to genuinely addable items", () => {
    const rows = [item(), item({ id: "catalogue-2", already_added: true }), item({ id: "catalogue-3" })];
    expect(selectedAddableItems(rows, ["catalogue-1", "catalogue-2"]).map((row) => row.id)).toEqual(["catalogue-1"]);
  });
});

describe("catalogue plan limits", () => {
  it("returns the exact Free-plan slots and unlimited paid slots", () => {
    expect(remainingProductSlots("free", 47)).toBe(3);
    expect(remainingProductSlots("free", 60)).toBe(0);
    expect(remainingProductSlots("pro", 500)).toBe(Number.POSITIVE_INFINITY);
  });

  it("blocks a Free selection that would exceed 50 products", () => {
    expect(selectionExceedsPlan("free", 48, 3)).toBe(true);
    expect(selectionExceedsPlan("free", 48, 2)).toBe(false);
    expect(selectionExceedsPlan("premium", 48, 100)).toBe(false);
  });
});

describe("catalogue labels", () => {
  it("formats bottles, packs and containers in real-world units", () => {
    expect(catalogueSizeLabel(item())).toBe("700ml");
    expect(catalogueSizeLabel(item({ size_ml: 330, pack_size: 12 }))).toBe("12 × 330ml");
    expect(catalogueSizeLabel(item({ size_ml: null, container_l: 50 }))).toBe("50L container");
  });

  it("describes calibration confidence without exposing weights", () => {
    expect(catalogueConfidenceLabel(item())).toBe("Starter calibration · 1 sample");
    expect(catalogueConfidenceLabel(item({ has_calibration: false }))).toBe("Manual setup required");
    expect(catalogueConfidenceLabel(item({ calibration_confidence: "verified", calibration_sample_count: 20 }))).toBe("Verified calibration");
  });

  it("recognises venue products sourced from the global catalogue", () => {
    expect(isCatalogueProduct("catalogue:abc")).toBe(true);
    expect(isCatalogueProduct("supplier:abc")).toBe(false);
    expect(isCatalogueProduct(null)).toBe(false);
  });
});

// Regression suite for Error #185 (infinite setState loop).
//
// Root cause: the inline `= []` default in the useCatalogueSearch destructure
// produces a new array reference on every render when data is undefined.  The
// pruneSelectedIds effect then calls setSelectedIds, Object.is([], []) === false
// triggers another render, and the loop never terminates.
//
// Fix: pruneSelectedIds must return the SAME reference when nothing changes so
// the useState functional updater is a no-op from React's perspective.
describe("pruneSelectedIds — Error #185 regression", () => {
  it("returns the exact same array reference when catalogue items is empty", () => {
    const ids: string[] = [];
    // Critical invariant: same ref → Object.is() === true → setState no-op → no loop
    expect(pruneSelectedIds(ids, [])).toBe(ids);
  });

  it("returns the same reference when no ids need to be removed", () => {
    const ids = ["catalogue-1", "catalogue-3"];
    const items = [item(), item({ id: "catalogue-3" })];
    expect(pruneSelectedIds(ids, items)).toBe(ids);
  });

  it("returns the same reference when selected id is not in catalogue yet (partial load)", () => {
    const ids = ["catalogue-999"];
    expect(pruneSelectedIds(ids, [item()])).toBe(ids);
  });

  it("returns a new array removing only ids whose items became already_added", () => {
    const ids = ["catalogue-1", "catalogue-2"];
    const items = [item(), item({ id: "catalogue-2", already_added: true })];
    const result = pruneSelectedIds(ids, items);
    expect(result).not.toBe(ids);
    expect(result).toEqual(["catalogue-1"]);
  });

  it("returns an empty new array when all selected items became already_added", () => {
    const ids = ["catalogue-1"];
    const result = pruneSelectedIds(ids, [item({ already_added: true })]);
    expect(result).not.toBe(ids);
    expect(result).toEqual([]);
  });
});
