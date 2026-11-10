import { describe, expect, it } from "vitest";
import { gaugeToPints, pintsToGauge, draughtAmount, draughtBreakdown } from "./draught-gauge";

const P = 568.261;
/** What the count screens store: full containers at their litre size + the part read off the gauge. */
const storedMl = (full: number, containerL: number, gal: number, pt: number) => full * containerL * 1000 + gaugeToPints(gal, pt) * P;

describe("every count a landlord can enter comes back as the same gallons and pints", () => {
  // 50L = 11 gal keg, firkin 9 gal, kilderkin 18 gal, 10 gal keg, pin 4.5 gal.
  const sizes: Array<[number, number]> = [[50, 11], [40.91, 9], [81.83, 18], [45.46, 10], [20.46, 4.5]];
  for (const [litres, gallons] of sizes) {
    it(`${litres}L (${gallons} gal): 0-40 full with every gauge reading`, () => {
      for (let full = 0; full <= 40; full++) for (let gal = 0; gal < Math.floor(gallons); gal++) for (let pt = 0; pt <= 7; pt++) {
        const ml = storedMl(full, litres, gal, pt);
        const want = full * gallons * 8 + gal * 8 + pt; // the Venners "Gallon 8 Pint" figure
        const got = pintsToGauge(ml / P);
        if (got.gallons * 8 + got.pints !== want) throw new Error(`${full} full + ${gal} gal ${pt} pt of ${litres}L gave ${got.gallons} gal ${got.pints} pt, wanted ${Math.floor(want / 8)} gal ${want % 8} pt`);
      }
    });
  }
  it("30L keg (6.6 gal): the part reading is never lost to rounding", () => {
    for (let full = 0; full <= 40; full++) for (let gal = 0; gal < 7; gal++) for (let pt = 0; pt <= 7; pt++) {
      const total = Math.round(storedMl(full, 30, gal, pt) / P);
      const kegs = Math.round(full * 30000 / P);
      expect(Math.abs(total - (kegs + gal * 8 + pt))).toBeLessThanOrEqual(1);
    }
  });
  it("labels agree with each other", () => {
    const ml = storedMl(2, 50, 2, 0);
    expect(draughtAmount(ml)).toBe("24 gal 0 pt (192 pints)");
    expect(draughtBreakdown(ml / P, 50)).toBe("192 pints · 24 gal 0 pt · 2.2 kegs");
  });
});
