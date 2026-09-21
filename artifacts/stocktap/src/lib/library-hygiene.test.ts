import { describe, expect, it } from "vitest";
import {
  brandKey,
  estimateDefaultPrices,
  findLikelyDuplicate,
  findMethodMismatches,
  inferCountingMethod,
  inferSizeMl,
  isLitreOnBottles,
  matchKnownBottle,
  methodFamily,
  sizeMlFromName,
  type HygieneProduct,
} from "./library-hygiene";

const p = (over: Partial<HygieneProduct> & { name: string }): HygieneProduct => ({
  id: over.name,
  category: null,
  counting_method: null,
  size_ml: null,
  ...over,
});

describe("sizeMlFromName", () => {
  it("reads cl, ml, litres and pints", () => {
    expect(sizeMlFromName("Gordons 70cl")?.sizeMl).toBe(700);
    expect(sizeMlFromName("Coke 330ml")?.sizeMl).toBe(330);
    expect(sizeMlFromName("Cordial 1 ltr")?.sizeMl).toBe(1000);
    expect(sizeMlFromName("Lemonade 1.5l")?.sizeMl).toBe(1500);
    expect(sizeMlFromName("Ale 4 pints")?.sizeMl).toBe(2272);
  });
  it("reads case packs as size + pack", () => {
    expect(sizeMlFromName("Peroni 12 x 330ml")).toEqual({ sizeMl: 330, packSize: 12 });
    expect(sizeMlFromName("Coke 24x200ml")).toEqual({ sizeMl: 200, packSize: 24 });
  });
  it("returns null with no size", () => {
    expect(sizeMlFromName("House Red")).toBeNull();
  });
});

describe("inferSizeMl", () => {
  it("prefers the size in the name", () => {
    expect(inferSizeMl("Smirnoff 1L", "spirits", "weigh")).toBe(1000);
  });
  it("defaults spirits to 700 and wines to 750", () => {
    expect(inferSizeMl("Smirnoff", "spirits", "weigh")).toBe(700);
    expect(inferSizeMl("House Sauvignon", "wines", "tenths")).toBe(750);
  });
  it("knows single-serve and magnum wines", () => {
    expect(inferSizeMl("Prosecco single serve", "wines", null)).toBe(200);
    expect(inferSizeMl("Prosecco Magnum", "wines", null)).toBe(1500);
  });
  it("handles minerals: cordials 1L, bare numbers, weighed mixers 700", () => {
    expect(inferSizeMl("Lime Cordial", "minerals", "litre")).toBe(1000);
    expect(inferSizeMl("Coke 330", "minerals", "each")).toBe(330);
    expect(inferSizeMl("Tonic", "minerals", "weigh")).toBe(700);
    expect(inferSizeMl("Tonic", "minerals", "each")).toBeNull();
  });
  it("leaves draught alone", () => {
    expect(inferSizeMl("Carling", "draught_lager", "keg_weight")).toBeNull();
  });
});

describe("inferCountingMethod", () => {
  it("turns a stocktaker's 'litre' on packaged bottles into 'each'", () => {
    expect(inferCountingMethod("packaged", "litre", "Peroni 330ml", 330, null)).toBe("each");
  });
  it("keeps 'litre' for genuine bulk minerals", () => {
    expect(inferCountingMethod("minerals", "litre", "Lime Cordial", 1000, null)).toBe("litre");
    expect(inferCountingMethod("minerals", "litre", "Postmix BIB", null, null)).toBe("litre");
  });
  it("turns 'litre' on a small mineral bottle into 'each'", () => {
    expect(inferCountingMethod("minerals", "litre", "Fever-Tree Tonic 200ml", 200, null)).toBe("each");
  });
  it("uses the fallback when nothing requested", () => {
    expect(inferCountingMethod("spirits", null, "Gin", 700, "weigh")).toBe("weigh");
  });
});

describe("brandKey / methodFamily", () => {
  it("strips sizes, units and category words to find the brand", () => {
    expect(brandKey("GIN - Gordon's 70cl")).toBe("gordons");
    expect(brandKey("Fever-Tree Tonic 200ml")).toBe("fever");
  });
  it("skips grape/style words", () => {
    expect(brandKey("House Sauvignon Blanc 750ml")).toBe("house");
    expect(brandKey("Sauvignon Blanc")).toBeNull();
  });
  it("groups methods into families", () => {
    expect(methodFamily("weigh")).toBe("bottle");
    expect(methodFamily("photo_tap")).toBe("bottle");
    expect(methodFamily("each")).toBe("count");
    expect(methodFamily("litre")).toBe("bulk");
    expect(methodFamily("dipstick")).toBe("draught");
    expect(methodFamily(null)).toBe("none");
  });
});

describe("findMethodMismatches", () => {
  it("flags the same brand+category+size counted two different ways", () => {
    const flagged = findMethodMismatches([
      p({ id: "a", name: "Gordons Gin 70cl", category: "spirits", counting_method: "weigh", size_ml: 700 }),
      p({ id: "b", name: "GIN - Gordon's 700ml", category: "spirits", counting_method: "each", size_ml: 700 }),
    ]);
    expect(flagged).toEqual(new Set(["a", "b"]));
  });
  it("does not flag weigh vs tenths (same family)", () => {
    const flagged = findMethodMismatches([
      p({ id: "a", name: "Gordons Gin 70cl", category: "spirits", counting_method: "weigh", size_ml: 700 }),
      p({ id: "b", name: "Gordons Gin 70cl", category: "spirits", counting_method: "tenths", size_ml: 700 }),
    ]);
    expect(flagged.size).toBe(0);
  });
  it("does not flag different sizes of the same brand", () => {
    const flagged = findMethodMismatches([
      p({ id: "a", name: "Coke 330ml", category: "minerals", counting_method: "each", size_ml: 330 }),
      p({ id: "b", name: "Coke 1.5L", category: "minerals", counting_method: "litre", size_ml: 1500 }),
    ]);
    expect(flagged.size).toBe(0);
  });
  it("ignores draught", () => {
    const flagged = findMethodMismatches([
      p({ id: "a", name: "Carling", category: "draught_lager", counting_method: "keg_weight" }),
      p({ id: "b", name: "Carling", category: "draught_lager", counting_method: "dipstick" }),
    ]);
    expect(flagged.size).toBe(0);
  });
});

describe("isLitreOnBottles", () => {
  it("is true for packaged on litre", () => {
    expect(isLitreOnBottles(p({ name: "Peroni 330ml", category: "packaged", counting_method: "litre", size_ml: 330 }))).toBe(true);
  });
  it("is false for cordials and bulk", () => {
    expect(isLitreOnBottles(p({ name: "Lime Cordial", category: "minerals", counting_method: "litre", size_ml: 1000 }))).toBe(false);
    expect(isLitreOnBottles(p({ name: "Lemonade 5L", category: "minerals", counting_method: "litre", size_ml: 5000 }))).toBe(false);
  });
  it("is false when not on litre", () => {
    expect(isLitreOnBottles(p({ name: "Peroni", category: "packaged", counting_method: "each" }))).toBe(false);
  });
});

describe("findLikelyDuplicate", () => {
  const existing = [
    p({ id: "1", name: "GIN - Gordon's 700ml", category: "spirits", size_ml: 700 }),
    p({ id: "2", name: "House Sauv Blanc 750ml", category: "wines", size_ml: 750 }),
  ];
  it("matches across naming conventions", () => {
    expect(findLikelyDuplicate({ name: "Gordons Gin 70cl", category: "spirits", size_ml: 700 }, existing)?.product.id).toBe("1");
  });
  it("matches grape abbreviations", () => {
    expect(findLikelyDuplicate({ name: "House Sauvignon Blanc", category: "wines", size_ml: null }, existing)?.product.id).toBe("2");
  });
  it("does not match a different size or category", () => {
    expect(findLikelyDuplicate({ name: "Gordons Gin 1L", category: "spirits", size_ml: 1000 }, existing)).toBeNull();
    expect(findLikelyDuplicate({ name: "Gordons Gin", category: "wines", size_ml: null }, existing)).toBeNull();
  });
});

describe("estimateDefaultPrices", () => {
  it("prices spirits by tier and scales by size", () => {
    expect(estimateDefaultPrices({ name: "Smirnoff", category: "spirits", sizeMl: 700 })).toMatchObject({ cost: 14.5, pour: 3.3 });
    expect(estimateDefaultPrices({ name: "Hendricks", category: "spirits", sizeMl: 700 })).toMatchObject({ cost: 26, pour: 3.9 });
    expect(estimateDefaultPrices({ name: "Smirnoff", category: "spirits", sizeMl: 1000 }).cost).toBe(20.71);
  });
  it("prices wines, single-serve sold whole", () => {
    expect(estimateDefaultPrices({ name: "House Red", category: "wines", sizeMl: 750 })).toMatchObject({ cost: 6.5, pour: 5.6 });
    expect(estimateDefaultPrices({ name: "Prosecco 200ml", category: "wines", sizeMl: 200 })).toMatchObject({ cost: 2.4, pour: 6.25 });
  });
  it("needs a container size for draught cost", () => {
    expect(estimateDefaultPrices({ name: "Carling", category: "draught_lager" })).toMatchObject({ cost: null, pour: 3.95 });
    expect(estimateDefaultPrices({ name: "Carling", category: "draught_lager", containerL: 50 })).toMatchObject({ cost: 165, pour: 3.95 });
  });
  it("multiplies packaged by pack size on dozen", () => {
    expect(estimateDefaultPrices({ name: "Peroni 330ml", category: "packaged", sizeMl: 330, countingMethod: "dozen", packSize: 24 }).cost).toBe(26.4);
  });
  it("gives no estimate without a category", () => {
    expect(estimateDefaultPrices({ name: "Mystery", category: null })).toMatchObject({ cost: null, pour: null });
  });
});

describe("matchKnownBottle", () => {
  const catalogue = [
    { id: "g", canonical_name: "Gordons London Dry Gin", aliases: ["Gordon's Gin"], category: "spirits", size_ml: 700, has_calibration: true },
    { id: "gp", canonical_name: "Gordons Pink Gin", aliases: [], category: "spirits", size_ml: 700, has_calibration: true },
    { id: "nc", canonical_name: "Uncalibrated Gin", aliases: [], category: "spirits", size_ml: 700, has_calibration: false },
  ];
  it("matches by alias exactly", () => {
    expect(matchKnownBottle({ name: "Gordon's Gin 70cl", category: "spirits", size_ml: 700 }, catalogue)?.id).toBe("g");
  });
  it("never matches a variant (pink) to the plain bottle or vice versa", () => {
    expect(matchKnownBottle({ name: "Gordons Pink 70cl", category: "spirits", size_ml: 700 }, catalogue)?.id).toBe("gp");
    expect(matchKnownBottle({ name: "Gordons", category: "spirits", size_ml: 700 }, catalogue)?.id).toBe("g");
  });
  it("skips uncalibrated and wrong-size bottles", () => {
    expect(matchKnownBottle({ name: "Uncalibrated", category: "spirits", size_ml: 700 }, catalogue)).toBeNull();
    expect(matchKnownBottle({ name: "Gordon's Gin", category: "spirits", size_ml: 1000 }, catalogue)).toBeNull();
  });
});
