import { describe, expect, it } from "vitest";
import {
  assertCsvImportRows,
  legacyCategoryForType,
  parseCsvCategory,
  validateCsvImportRows,
} from "./csv-import-validation";

describe("CSV category parsing", () => {
  it("does not silently turn an unknown category into spirits", () => {
    expect(parseCsvCategory("Unknown Drinks")).toBeNull();
    expect(parseCsvCategory("")).toBeNull();
  });

  it("maps known category aliases deliberately", () => {
    expect(parseCsvCategory("Draught Lager")).toBe("draught_lager");
    expect(parseCsvCategory("wine")).toBe("wines");
  });

  it("derives categories only for the explicit legacy format", () => {
    expect(legacyCategoryForType("wine")).toBe("wines");
    expect(legacyCategoryForType("packaged")).toBe("packaged");
    expect(legacyCategoryForType("gin")).toBe("spirits");
  });
});

describe("CSV import validation", () => {
  it("blocks missing categories even when the row has a valid name", () => {
    const errors = validateCsvImportRows([
      { name: "Test Gin", category: null, countingMethod: null },
    ]);
    expect(errors).toEqual(["Row 1 (Test Gin): category is required."]);
    expect(() => assertCsvImportRows([
      { name: "Test Gin", category: null, countingMethod: null },
    ])).toThrow(/category is required/);
  });

  it("blocks a counting method that is invalid for the category", () => {
    expect(validateCsvImportRows([
      { name: "Test Gin", category: "spirits", countingMethod: "keg_weight" },
    ])).toEqual([
      "Row 1 (Test Gin): keg_weight is not valid for spirits.",
    ]);
  });

  it("blocks duplicate Product_ID values inside the same file", () => {
    const errors = validateCsvImportRows([
      { name: "A", category: "packaged", countingMethod: "each", externalId: "ABC" },
      { name: "B", category: "packaged", countingMethod: "each", externalId: "abc" },
    ]);
    expect(errors).toEqual(["Row 2 (B): duplicate Product_ID abc."]);
  });

  it("accepts a fully valid mixed import", () => {
    expect(validateCsvImportRows([
      { name: "Gin", category: "spirits", countingMethod: "weigh", externalId: "G1" },
      { name: "Lager", category: "draught_lager", countingMethod: "keg_weight", externalId: "L1" },
      { name: "Cans", category: "packaged", countingMethod: "dozen", externalId: "C1" },
    ])).toEqual([]);
  });
});
