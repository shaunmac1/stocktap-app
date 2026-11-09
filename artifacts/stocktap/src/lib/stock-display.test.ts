import { describe, expect, it } from "vitest";
import { describeQuantity, recomputeEntryMl, quantityKind } from "./stock-display";
import {
  computeCategoryReading,
  formatGallonsPints,
  pintsToGallonsAndPints,
  productCapacityMl,
  splitIntoContainers,
  ML_PER_PINT,
} from "./calculations";

const baseProduct = {
  category: null,
  unit: "count" as const,
  sizeMl: null,
  density: 1,
  emptyWeightG: null,
  fullWeightG: null,
  costPrice: null,
  measureMl: null,
  containerL: null,
  dipFullMm: null,
  packSize: null,
};

describe("gallons and pints", () => {
  it("reads a stocktaker's figures", () => {
    expect(pintsToGallonsAndPints(144)).toEqual({ gallons: 18, pints: 0 });
    expect(pintsToGallonsAndPints(89.747)).toEqual({ gallons: 11, pints: 2 }); // whole pints, like the Venners sheet
    expect(formatGallonsPints(143.99)).toBe("18 gal 0 pt");
    expect(formatGallonsPints(1152)).toBe("144 gal 0 pt");
    expect(formatGallonsPints(7.999)).toBe("1 gal 0 pt");
  });

  it("splits a total into full kegs and a part keg", () => {
    const s = splitIntoContainers(144, 50);
    expect(s.full).toBe(1);
    expect(s.partPints).toBeCloseTo(56.01, 1);
    expect(splitIntoContainers(48, 30)).toEqual({ full: 0, partPints: 48 });
  });

  it("keg entered by gallons stores full kegs + part and the exact total", () => {
    const r = computeCategoryReading(
      { ...baseProduct, category: "draught_lager", containerL: 50, costPrice: 150 },
      { method: "keg_weight", totalPints: 18 * 8 },
      25,
    );
    expect(r.mlRemaining / ML_PER_PINT).toBeCloseTo(144, 6);
    expect(r.fullContainers).toBe(1);
    expect(r.valueGbp).toBeCloseTo(((144 * ML_PER_PINT) / 50000) * 150, 6);
  });

  it("keg entered as kegs still works the old way", () => {
    const r = computeCategoryReading(
      { ...baseProduct, category: "draught_lager", containerL: 50 },
      { method: "keg_weight", partialPints: 56, fullContainers: 1 },
      25,
    );
    expect(r.mlRemaining).toBeCloseTo(50000 + 56 * ML_PER_PINT, 3);
  });
});

describe("litre lines", () => {
  it("values postmix by the drink a box makes (Venners counts litres of drink)", () => {
    const r = computeCategoryReading(
      { ...baseProduct, category: "postmix", containerL: 12, costPrice: 60 },
      { method: "litre", litres: 100.8 },
      25,
    );
    expect(r.mlRemaining).toBeCloseTo(100800, 6);
    // 12L box at 5:1 makes 72L of drink → 1.4 boxes
    expect(r.valueGbp).toBeCloseTo(1.4 * 60, 6);
    // high-yield box set to 84L of drink
    const hy = computeCategoryReading({ ...baseProduct, category: "postmix", containerL: 12, packSize: 84, costPrice: 60 }, { method: "litre", litres: 84 }, 25);
    expect(hy.valueGbp).toBeCloseTo(60, 6);
    expect(productCapacityMl({ counting_method: "litre", container_l: 12, category: "postmix" })).toBe(72000);
    expect(productCapacityMl({ counting_method: "litre", container_l: 12 })).toBe(12000);
  });

  it("values a 1L juice bottle per litre when no box size", () => {
    const r = computeCategoryReading(
      { ...baseProduct, category: "minerals", sizeMl: 1000, costPrice: 3.6 },
      { method: "litre", litres: 13.6 },
      25,
    );
    expect(r.mlRemaining).toBeCloseTo(13600, 6);
    expect(r.valueGbp).toBeCloseTo(13.6 * 3.6, 6);
    expect(productCapacityMl({ counting_method: "litre" })).toBe(1000);
  });
});

describe("describeQuantity", () => {
  it("draught shows gallons and pints", () => {
    const d = describeQuantity(
      { counting_method: "keg_weight", container_l: 50, cost_price: null },
      [{ method: "keg_weight", full_containers: 1, part_value: 56, ml_remaining: 144 * ML_PER_PINT }],
    );
    expect(d.kind).toBe("draught");
    expect(d.main).toBe("18 gal 0 pt");
    expect(d.detail).toContain("144 pints");
  });

  it("cans show units, never tenths", () => {
    const d = describeQuantity(
      { counting_method: "each", size_ml: 330, cost_price: 0.8 },
      [{ method: "each", full_containers: 0, part_value: 21, ml_remaining: 21 * 330 }],
    );
    expect(d.short).toBe("21 units");
    expect(d.detail).toBe("330ml each");
    expect(d.value).toBeCloseTo(16.8, 6);
  });

  it("dozen shows the total units and values per pack", () => {
    const d = describeQuantity(
      { counting_method: "dozen", size_ml: 1000, pack_size: 12, cost_price: 36 },
      [{ method: "dozen", full_containers: 1, part_value: 2.6, ml_remaining: 14600 }],
    );
    expect(d.short).toBe("14.6 units");
    expect(d.value).toBeCloseTo((14.6 / 12) * 36, 6);
  });

  it("litres show litres and boxes", () => {
    const d = describeQuantity(
      { counting_method: "litre", container_l: 12, cost_price: 60 },
      [{ method: "litre", full_containers: 0, part_value: 100.8, ml_remaining: 100800 }],
    );
    expect(d.short).toBe("100.8 L");
    expect(d.detail).toBe("= 8.4 boxes of 12L");
    expect(d.value).toBeCloseTo(504, 6);
  });
  it("postmix shows litres of drink and boxes", () => {
    const d = describeQuantity(
      { counting_method: "litre", category: "postmix", container_l: 12, cost_price: 60 },
      [{ method: "litre", full_containers: 0, part_value: 100.8, ml_remaining: 100800 }],
    );
    expect(d.short).toBe("100.8 L");
    expect(d.detail).toBe("= 1.4 boxes (72L of drink a box)");
    expect(d.value).toBeCloseTo(84, 6);
  });

  it("bottles show as bottles with tenths underneath", () => {
    const d = describeQuantity(
      { counting_method: "tenths", size_ml: 700, cost_price: 17 },
      [{ method: "tenths", full_containers: 1, part_value: 3, ml_remaining: 910 }],
    );
    expect(d.short).toBe("1.3 btl");
    expect(d.detail).toBe("13.0 tenths · 910ml");
    expect(d.value).toBeCloseTo(1.3 * 17, 6);
  });

  it("falls back to the category when nothing is counted yet", () => {
    expect(quantityKind(null, "draught_ale")).toBe("draught");
    expect(quantityKind(null, "packaged")).toBe("units");
    expect(quantityKind(null, "postmix")).toBe("litres");
    expect(quantityKind(null, "spirits")).toBe("bottles");
  });
});

describe("recomputeEntryMl", () => {
  it("fixes a can saved against a wrong size", () => {
    expect(recomputeEntryMl({ method: "each", full_containers: 0, part_value: 23, ml_remaining: 16100 }, { size_ml: 330 })).toBe(7590);
    expect(recomputeEntryMl({ method: "dozen", full_containers: 2, part_value: 0, ml_remaining: 0 }, { size_ml: 330, pack_size: 12 })).toBe(7920);
    expect(recomputeEntryMl({ method: "tenths", full_containers: 1, part_value: 3, ml_remaining: 910 }, { size_ml: 700 })).toBeNull();
  });
});

import { gpPercentForProduct, stockValueFromReading } from "./inventory-reporting";
describe("postmix in reports", () => {
  const pepsi = { unit: "count", type: "packaged", category: "postmix", counting_method: "litre", container_l: 12, cost_price: 60, pour_price: 2.4 };
  // Counts are litres of drink; a 12L box at 5:1 makes 72L.
  it("GP is per pint from a 12L box, not the whole box", () => {
    const gp = gpPercentForProduct(pepsi, 25)!;
    const costPerPint = ((60 / 12000) * ML_PER_PINT) / 6; // 5:1 water to syrup
    expect(gp).toBeCloseTo(((2.4 - costPerPint) / 2.4) * 100, 6);
    expect(gp).toBeGreaterThan(0);
  });
  it("stock value comes from litres, not a count", () => {
    expect(stockValueFromReading(pepsi, { ml_remaining: 100800, count: null })).toBeCloseTo(84, 6);
  });
});

import { isLitreOnBottles } from "./library-hygiene";
describe("which litre lines get the litres pad", () => {
  const base = { id: "x", category: "minerals" as const, counting_method: "litre" as const };
  it("a 1L juice by the litre keeps the litres pad", () => {
    expect(isLitreOnBottles({ ...base, name: "Juice Sunpride Apple", size_ml: 1000 })).toBe(false);
  });
  it("a 250ml cartridge or 330ml can is counted each", () => {
    expect(isLitreOnBottles({ ...base, name: "Old Mout FW Cartridge Kiwi & Lime 250ml", size_ml: 250 })).toBe(true);
    expect(isLitreOnBottles({ ...base, name: "Soft Tango Apple 330ml", size_ml: 330 })).toBe(true);
  });
});

import { guessCategoryFromName } from "./library-hygiene";
describe("guessCategoryFromName", () => {
  it("guesses the obvious ones", () => {
    expect(guessCategoryFromName("Soft Tango Orange Can 330ml")).toBe("minerals");
    expect(guessCategoryFromName("PPL Corona 330ml")).toBe("packaged");
    expect(guessCategoryFromName("Crisps McCoys Salted 45g")).toBe("packaged");
    expect(guessCategoryFromName("Postmix Pepsi")).toBe("postmix");
    expect(guessCategoryFromName("Cider Inch's Riversider 30L Keg")).toBe("draught_cider");
    expect(guessCategoryFromName("Stout Guinness Keg")).toBe("draught_stout");
    expect(guessCategoryFromName("Wine Merlot Jack Rabbit 187ml")).toBe("wines");
    expect(guessCategoryFromName("Hendrick's Gin 70cl")).toBeNull();
  });
});

import { describeMovedMl } from "./stock-display";
describe("describeMovedMl", () => {
  it("reads deliveries in the product's own terms", () => {
    expect(describeMovedMl({ counting_method: "keg_weight", container_l: 50, container_type: "keg" }, 200000)).toBe("4 kegs · 44 gal 0 pt");
    expect(describeMovedMl({ counting_method: "each", size_ml: 275 }, 48 * 275)).toBe("48 units");
    expect(describeMovedMl({ counting_method: "each", size_ml: null }, 36)).toBe("36 units");
    expect(describeMovedMl({ counting_method: "litre", container_l: 12 }, 24000)).toBe("24 L · 2 × 12L box");
    expect(describeMovedMl({ counting_method: "litre", category: "postmix", container_l: 12, pack_size: 84 } as any, 168000)).toBe("2 boxes · 168 L of drink");
    expect(describeMovedMl({ counting_method: "tenths", size_ml: 750 }, 9000)).toBe("12.0 btl");
  });
});
describe("cartridges", () => {
  it("a 250ml cartridge counted by the litre reads as a count", () => {
    expect(describeMovedMl({ counting_method: "litre", size_ml: 250 }, 250)).toBe("1 × 250ml");
    expect(describeMovedMl({ counting_method: "litre", size_ml: 1000 }, 12000)).toBe("12 L");
  });
});
