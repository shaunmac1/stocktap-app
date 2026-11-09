import { describe, it, expect } from "vitest";
import { findLooksWrong } from "./looks-wrong";
const P = 568.261;
const base = { productId: "c", name: "Carlsberg", draught: true, lastAt: "2026-11-02T10:00:00Z" };
describe("this looks wrong", () => {
  it("flags draught up 40 gal with no delivery", () => {
    const f = findLooksWrong([{ ...base, countedMl: 120 * 8 * P, lastMl: 80 * 8 * P, deliveredMl: 0 }]);
    expect(f).toHaveLength(1);
    expect(f[0].message).toBe("Up 40 gal 0 pt since 2 Nov, with no delivery logged. Check the count, or add the delivery.");
  });
  it("a delivery that covers it is fine", () => {
    expect(findLooksWrong([{ ...base, countedMl: 120 * 8 * P, lastMl: 80 * 8 * P, deliveredMl: 4 * 50000 }])).toHaveLength(0);
  });
  it("within a gallon is gauge error, not flagged", () => {
    expect(findLooksWrong([{ ...base, countedMl: 80 * 8 * P + 7 * P, lastMl: 80 * 8 * P, deliveredMl: 0 }])).toHaveLength(0);
  });
  it("first count of a line is never flagged", () => {
    expect(findLooksWrong([{ ...base, countedMl: 999999, lastMl: null, deliveredMl: 0 }])).toHaveLength(0);
  });
  it("bottles: up more than half a bottle", () => {
    const f = findLooksWrong([{ productId: "g", name: "Gordon's", draught: false, sizeMl: 700, countedMl: 2100, lastMl: 1050, lastAt: null, deliveredMl: 0 }]);
    expect(f[0].message).toContain("Up 1.5 bottles since the last count");
  });
});
