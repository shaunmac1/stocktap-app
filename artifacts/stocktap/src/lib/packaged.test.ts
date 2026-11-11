import { describe, it, expect } from "vitest";
import {
  suggestedCaseSize, unitNoun, caseSizeOf, needsCaseSizeAnswer, totalUnits, splitCases,
  dozens, packagedBreakdown,
} from "./packaged";
import { computeCategoryReading } from "./calculations";
import { describeQuantity } from "./stock-display";

const each = (name: string, size_ml: number | null, pack_size: number | null = null) =>
  ({ name, category: "minerals", counting_method: "each", size_ml, pack_size });

describe("suggested case sizes from Teal Farm's real lines", () => {
  it("24 for mixers, J2O, Red Bull, 330ml and 440ml cans", () => {
    for (const [n, ml] of [
      ["Mixer Britvic Tonic 200ml", 200], ["Soft J2O Apple & Mango 275ml", 275],
      ["Soft Red Bull 250ml", 250], ["PPL Peroni Nastro Azzurro 330ml", 330],
      ["PPS Hooch Lemon 440ml Can", 440], ["PPS Buzz Ball Tequila Rita 200ml", 200],
    ] as const) expect(suggestedCaseSize(each(n, ml))).toBe(24);
  });
  it("12 for 500ml cider and wheat beer", () => {
    expect(suggestedCaseSize(each("PPC Old Mout Berries 500ml", 500))).toBe(12);
    expect(suggestedCaseSize(each("PPL Erdinger Weissbier 500ml", 500))).toBe(12);
    expect(suggestedCaseSize(each("PPA Newcastle Brown Ale 550ml", 550))).toBe(12);
  });
  it("no guess for snacks or unknown sizes", () => {
    expect(suggestedCaseSize(each("Crisps McCoys Salted 45g", null))).toBeNull();
    expect(suggestedCaseSize(each("Snacks Pork Scratchings", null))).toBeNull();
    expect(suggestedCaseSize(each("Juice Eager Pineapple", null))).toBeNull();
  });
});

describe("names, case size and the one-tap question", () => {
  it("calls things what they are", () => {
    expect(unitNoun(each("PPS Hooch Pink Can 440ml", 440), 2)).toBe("cans");
    expect(unitNoun(each("Crisps McCoys Salted 45g", null), 1)).toBe("bag");
    expect(unitNoun(each("Soft J2O Glitterberry 275ml", 275), 3)).toBe("bottles");
  });
  it("only asks once, and 1 means singles only", () => {
    expect(needsCaseSizeAnswer(each("x", 275))).toBe(true);
    expect(needsCaseSizeAnswer(each("x", 275, 24))).toBe(false);
    expect(needsCaseSizeAnswer(each("x", 275, 1))).toBe(false);
    expect(caseSizeOf(each("x", 275, 1))).toBeNull();
    expect(caseSizeOf(each("x", 275, 24))).toBe(24);
    expect(needsCaseSizeAnswer({ name: "Cordial", counting_method: "dozen", pack_size: null })).toBe(false);
  });
});

describe("cases + loose maths", () => {
  it("3 cases of 24 + 7 = 79", () => {
    expect(totalUnits(3, 7, 24)).toBe(79);
    expect(splitCases(79, 24)).toEqual({ cases: 3, loose: 7 });
  });
  it("ignores cases on a singles-only line", () => {
    expect(totalUnits(3, 7, null)).toBe(7);
    expect(splitCases(79, null)).toEqual({ cases: 0, loose: 79 });
  });
  it("round-trips every combination for every case size", () => {
    for (const cs of [6, 8, 10, 12, 15, 18, 20, 24, 30, 36])
      for (let c = 0; c <= 40; c++)
        for (let l = 0; l < cs; l++) expect(splitCases(totalUnits(c, l, cs), cs)).toEqual({ cases: c, loose: l });
  });
  it("Venners dozens", () => {
    expect(dozens(79)).toBe("6 doz 7");
    expect(dozens(12)).toBe("1 doz 0");
    expect(dozens(5)).toBe("0 doz 5");
  });
  it("breakdown line", () => {
    expect(packagedBreakdown(79, each("Soft J2O Apple & Mango 275ml", 275, 24))).toBe("79 bottles · 6 doz 7 · 3 cases + 7");
    expect(packagedBreakdown(1, each("PPS Hooch Pink Can 440ml", 440, 24))).toBe("1 can · 0 doz 1 · 0 cases + 1");
    expect(packagedBreakdown(31, each("Crisps McCoys Salted 45g", null, 1))).toBe("31 bags");
  });
});

describe("saved count is the total units, priced per bottle", () => {
  const product = {
    category: "minerals" as const, unit: "count" as const, sizeMl: 275, density: 1,
    emptyWeightG: null, fullWeightG: null, costPrice: 0.62, measureMl: null,
    containerL: null, dipFullMm: null, packSize: 24,
  };
  it("3 cases + 7 loose = 79 units, £48.98", () => {
    const r = computeCategoryReading(product, { method: "each", count: 7, fullContainers: 3 }, 25);
    expect(r.mlRemaining).toBe(79 * 275);
    expect(r.fullContainers).toBe(3);
    expect(Math.round(r.valueGbp * 100) / 100).toBe(48.98);
  });
  it("singles only still works exactly as before", () => {
    const r = computeCategoryReading({ ...product, packSize: null }, { method: "each", count: 7 }, 25);
    expect(r.mlRemaining).toBe(7 * 275);
    const r1 = computeCategoryReading({ ...product, packSize: 1 }, { method: "each", count: 7, fullContainers: 3 }, 25);
    expect(r1.mlRemaining).toBe(7 * 275);
  });
  it("downstream reads the total from part_value and shows the breakdown", () => {
    const p = { name: "Soft J2O Apple & Mango 275ml", category: "minerals", counting_method: "each", unit: "count", size_ml: 275, pack_size: 24, cost_price: 0.62 };
    const q = describeQuantity(p as any, [{ method: "each", full_containers: 3, part_value: 79, ml_remaining: 79 * 275 } as any]);
    expect(q.main).toBe("79");
    expect(q.detail).toBe("79 bottles · 6 doz 7 · 3 cases + 7");
    expect(Math.round((q.value ?? 0) * 100) / 100).toBe(48.98);
  });
});

import { caseSizePlan } from "./packaged";
describe("set every case size on one screen", () => {
  it("lists only visible lines never asked, biggest suggested size first, snacks with no guess last", () => {
    const rows = caseSizePlan([
      { id: "a", ...each("Soft J2O Apple & Mango 275ml", 275) },
      { id: "b", ...each("PPC Old Mout Berries 500ml", 500) },
      { id: "c", ...each("Crisps McCoys Salted 45g", null) },
      { id: "d", ...each("PPL Peroni 330ml", 330, 24) },                       // already set
      { id: "e", ...each("Soft Red Bull 250ml", 250, 1) },                      // singles: already answered
      { id: "f", ...each("PPS WKD Blue 275ml", 275), hidden_at: "2026-11-01" }, // hidden
      { id: "g", name: "Gin Gordons 70cl", category: "spirits", counting_method: "tenths", size_ml: 700, pack_size: null },
    ]);
    expect(rows.map(r => [r.product.id, r.suggested])).toEqual([["a", 24], ["b", 12], ["c", null]]);
  });
});
