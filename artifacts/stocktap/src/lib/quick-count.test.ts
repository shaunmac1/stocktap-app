import { describe, it, expect } from "vitest";
import { overTheBar } from "./quick-count";

const gin = { name: "Gordons Gin 70cl", type: "gin", category: "spirits", unit: "weigh", counting_method: "tenths", size_ml: 700, measure_ml: null, pour_price: 3.6 };
const wine = { name: "Pinot Grigio 75cl", type: "wine", category: "wines", unit: "weigh", counting_method: "tenths", size_ml: 750, measure_ml: null, pour_price: 6.2 };
const lager = { name: "Lager Carlsberg", type: "draught", category: "draught_lager", unit: "weigh", counting_method: "keg_weight", size_ml: null, measure_ml: null, pour_price: 4.8 };
const j2o = { name: "J2O Apple & Mango 275ml", type: "packaged", category: "minerals", unit: "count", counting_method: "each", size_ml: 275, measure_ml: null, pour_price: 3.2 };

describe("what the count would take over the bar", () => {
  it("gin: 2.7 bottles = 75 measures of 25ml × £3.60 = £270", () => {
    expect(overTheBar([{ prod: gin as any, mlRemaining: 1890 }], 25).value).toBeCloseTo(270);
  });
  it("a 35ml pub has fewer, bigger measures", () => {
    expect(overTheBar([{ prod: gin as any, mlRemaining: 700 }], 35).value).toBeCloseTo(20 * 3.6);
  });
  it("wine by the 175ml glass, draught by the pint, bottles sold whole by the bottle", () => {
    expect(overTheBar([{ prod: wine as any, mlRemaining: 750 }], 25).value).toBeCloseTo(4 * 6.2);
    expect(overTheBar([{ prod: lager as any, mlRemaining: 88 * 568.261 }], 25).value).toBeCloseTo(88 * 4.8);
    expect(overTheBar([{ prod: j2o as any, mlRemaining: 79 * 275, count: 79 }], 25).value).toBeCloseTo(79 * 3.2);
  });
  it("lines with no sell price are left out and counted, never guessed", () => {
    const r = overTheBar([{ prod: gin as any, mlRemaining: 700 }, { prod: { ...wine, pour_price: null } as any, mlRemaining: 750 }], 25);
    expect(r).toMatchObject({ priced: 1, unpriced: 1 });
    expect(r.value).toBeCloseTo(28 * 3.6);
  });
});
