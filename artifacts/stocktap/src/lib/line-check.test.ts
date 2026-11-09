import { describe, it, expect } from "vitest";
import { lineCheck } from "./line-check";
const P = 568.261;
describe("daily line check", () => {
  // Kronenbourg: 192 pints yesterday, 2 x 11G kegs delivered (176), 164 today, till sold 196
  const r = lineCheck({ lastMl: 192 * P, deliveredMl: 176 * P, nowMl: 164 * P, tillUnits: 196, unitMl: P, draught: true, pricePerUnit: 4.6 });
  it("gone = last + delivered - now", () => {
    expect(Math.round(r.goneUnits)).toBe(204);
    expect(r.label(r.goneMl)).toBe("204 pints · 25 gal 4 pt");
  });
  it("missing = gone - till, in pints, gallons and money", () => {
    expect(Math.round(r.missingUnits!)).toBe(8);
    expect(r.label(r.missingMl!)).toBe("8 pints · 1 gal 0 pt");
    expect(r.missingValue!.toFixed(2)).toBe("36.80");
  });
  it("no till figure yet: gone only", () => {
    const n = lineCheck({ lastMl: 100 * P, deliveredMl: 0, nowMl: 60 * P, tillUnits: null, unitMl: P, draught: true });
    expect(n.missingUnits).toBeNull();
    expect(Math.round(n.goneUnits)).toBe(40);
  });
  it("spirits use measures", () => {
    const s = lineCheck({ lastMl: 700, deliveredMl: 0, nowMl: 450, tillUnits: 9, unitMl: 25, draught: false });
    expect(s.label(s.goneMl)).toBe("10.0 measures");
    expect(s.missingUnits).toBeCloseTo(1, 5);
  });
});
