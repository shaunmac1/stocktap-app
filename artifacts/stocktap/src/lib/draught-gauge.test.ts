import { describe, it, expect } from "vitest";
import { gaugeToPints, pintsToGauge, formatGauge, gaugeScaleFor } from "./draught-gauge";
import { computeCategoryReading } from "./calculations";

describe("keg gauge: gallons + pints", () => {
  it("10 gal 0 pt is 80 pints; 6 gal 3 pt is 51", () => {
    expect(gaugeToPints(10, 0)).toBe(80);
    expect(gaugeToPints(6, 3)).toBe(51);
  });
  it("pints are 0–7 only and junk is treated as 0", () => {
    expect(gaugeToPints(1, 9)).toBe(15);
    expect(gaugeToPints(NaN, NaN)).toBe(0);
    expect(gaugeToPints(-2, -1)).toBe(0);
  });
  it("turns pints back into the Venners Gallon 8 Pint pair", () => {
    expect(pintsToGauge(109 * 8)).toEqual({ gallons: 109, pints: 0 });
    expect(pintsToGauge(491)).toEqual({ gallons: 61, pints: 3 });
    expect(formatGauge(37)).toBe("4 gal 5 pt");
  });
  it("tells you which side of a two-scale gauge to read", () => {
    expect(gaugeScaleFor(50)).toBe("up to 22G");
    expect(gaugeScaleFor(100)).toBe("up to 22G");
    expect(gaugeScaleFor(163.7)).toBe("36G");
    expect(gaugeScaleFor(null)).toBeNull();
  });
});

describe("full kegs + part read off the gauge", () => {
  const carlsberg = { costPrice: 100, containerL: 50, sizeMl: null, packSize: null, category: "draught_lager" } as any;
  it("9 full 11G kegs + 10 gal in the open one = 109 gal", () => {
    const r = computeCategoryReading(carlsberg, { method: "keg_weight", partialPints: gaugeToPints(10, 0), fullContainers: 9 } as any, 25);
    const pints = r.mlRemaining / 568.261;
    // a 50L keg is 87.99 pints, so 9 of them + 80 pints = 871.9 pints → 109 gal 0 pt to the nearest pint
    expect(pintsToGauge(pints)).toEqual({ gallons: 109, pints: 0 });
    expect(Math.abs(pints - (9 * 50000 / 568.261 + 80))).toBeLessThan(0.01);
    expect(r.fullContainers).toBe(9);
  });
});
