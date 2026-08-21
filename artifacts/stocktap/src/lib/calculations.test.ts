import { describe, it, expect } from "vitest";
import {
  deriveDensity,
  deriveEmptyWeight,
  checkCalibrationPlausibility,
  CALIBRATION_DENSITY_MIN,
  CALIBRATION_DENSITY_MAX,
  DEFAULT_DENSITIES,
  calcVariance,
  calcSoldSinceLast,
} from "./calculations";

describe("deriveDensity", () => {
  it("derives correct density for a spirit bottle", () => {
    // 700ml spirit: liquid weight = 700 * 0.948 = 663.6g; empty = 200g; full = 863.6g
    const full = 200 + 700 * 0.948;
    expect(deriveDensity(full, 200, 700)).toBeCloseTo(0.948, 4);
  });

  it("derives correct density for a syrup bottle", () => {
    // 500ml syrup: liquid = 500 * 1.29 = 645g; empty = 205g; full = 850g
    expect(deriveDensity(850, 205, 500)).toBeCloseTo(1.29, 2);
  });

  it("derives correct density for a wine bottle", () => {
    // 750ml wine: liquid = 750 * 0.99 = 742.5g; empty = 448g; full = 1190.5g
    expect(deriveDensity(1190.5, 448, 750)).toBeCloseTo(0.99, 3);
  });

  it("derives correct density for a liqueur bottle (1.05)", () => {
    // 700ml Baileys: liquid = 700 * 1.05 = 735g; empty = 215g; full = 950g
    expect(deriveDensity(950, 215, 700)).toBeCloseTo(1.05, 4);
  });

  it("returns 0 when sizeMl is zero (guard against divide-by-zero)", () => {
    expect(deriveDensity(1000, 200, 0)).toBe(0);
  });

  it("returns a negative value when full weight is less than empty (signals a mis-weigh)", () => {
    expect(deriveDensity(200, 300, 700)).toBeLessThan(0);
  });

  it("is consistent with deriveEmptyWeight round-trip for every DEFAULT_DENSITIES category", () => {
    const size = 700;
    const empty = 215;
    for (const [category, density] of Object.entries(DEFAULT_DENSITIES)) {
      const full = empty + size * density;
      const derived = deriveDensity(full, empty, size);
      expect(derived).toBeCloseTo(density, 4);
    }
  });
});

describe("checkCalibrationPlausibility", () => {
  it("accepts a normal spirit calibration (density ~0.948)", () => {
    // full=863.6g, empty=200g, 700ml → density = 0.948
    const result = checkCalibrationPlausibility(863.6, 200, 700);
    expect(result.ok).toBe(true);
    expect(result.warningMessage).toBe("");
    expect(result.impliedDensity).toBeCloseTo(0.948, 3);
  });

  it("accepts a dense syrup calibration (density 1.29)", () => {
    // full=850g, empty=205g, 500ml → density = 1.29
    const result = checkCalibrationPlausibility(850, 205, 500);
    expect(result.ok).toBe(true);
  });

  it("accepts a liqueur calibration (density 1.05 — Baileys-style)", () => {
    // full=950g, empty=215g, 700ml → density = 1.05
    const result = checkCalibrationPlausibility(950, 215, 700);
    expect(result.ok).toBe(true);
    expect(result.impliedDensity).toBeCloseTo(1.05, 2);
  });

  it("accepts a vermouth calibration (density 0.99)", () => {
    // full=905g, empty=213g, 700ml → density = 0.989
    const full = 213 + 700 * 0.99;
    const result = checkCalibrationPlausibility(full, 213, 700);
    expect(result.ok).toBe(true);
  });

  it("rejects when the derived empty-bottle weight is zero or negative (Britvic cordial mis-weigh)", () => {
    // User enters a weight too low for the bottle size + density, yielding negative tare
    // full=534g, empty=-130g (derived), 700ml with density 0.948: 534 - 700*0.948 = -129.6
    const result = checkCalibrationPlausibility(534, -130, 700);
    expect(result.ok).toBe(false);
    expect(result.warningMessage).toMatch(/negative|zero|empty-bottle/i);
  });

  it("rejects when implied density is below 0.90 (too light to be any drink)", () => {
    // full=534g, empty=64g, 700ml → density = 470/700 = 0.671 — well below min
    const result = checkCalibrationPlausibility(534, 64, 700);
    expect(result.ok).toBe(false);
    expect(result.impliedDensity).toBeCloseTo(0.671, 2);
    expect(result.warningMessage).toMatch(/density/i);
    expect(result.impliedDensity).toBeLessThan(CALIBRATION_DENSITY_MIN);
  });

  it("rejects when implied density exceeds 1.40 (impossible for any drink)", () => {
    // full=1200g, empty=100g, 700ml → density = 1100/700 ≈ 1.571
    const result = checkCalibrationPlausibility(1200, 100, 700);
    expect(result.ok).toBe(false);
    expect(result.impliedDensity).toBeGreaterThan(CALIBRATION_DENSITY_MAX);
  });

  it("exposes the density min/max constants", () => {
    expect(CALIBRATION_DENSITY_MIN).toBe(0.90);
    expect(CALIBRATION_DENSITY_MAX).toBe(1.40);
  });
});

describe("DEFAULT_DENSITIES — correct values by category", () => {
  it("has the correct density for liqueur: 1.05 (not spirit 0.948)", () => {
    expect(DEFAULT_DENSITIES["liqueur"]).toBe(1.05);
    expect(DEFAULT_DENSITIES["liqueur"]).not.toBe(0.948);
  });

  it("has the correct density for syrup: 1.29 (not spirit 0.948)", () => {
    expect(DEFAULT_DENSITIES["syrup"]).toBe(1.29);
    expect(DEFAULT_DENSITIES["syrup"]).not.toBe(0.948);
  });

  it("has the correct density for cordial: 1.1 (not spirit 0.948)", () => {
    expect(DEFAULT_DENSITIES["cordial"]).toBe(1.1);
    expect(DEFAULT_DENSITIES["cordial"]).not.toBe(0.948);
  });

  it("has the correct density for vermouth: 0.99 (not spirit 0.948)", () => {
    expect(DEFAULT_DENSITIES["vermouth"]).toBe(0.99);
    expect(DEFAULT_DENSITIES["vermouth"]).not.toBe(0.948);
  });

  it("has the correct base spirit density: 0.948", () => {
    expect(DEFAULT_DENSITIES["spirit"]).toBe(0.948);
    expect(DEFAULT_DENSITIES["gin"]).toBe(0.948);
    expect(DEFAULT_DENSITIES["vodka"]).toBe(0.948);
    expect(DEFAULT_DENSITIES["whisky"]).toBe(0.948);
    expect(DEFAULT_DENSITIES["rum"]).toBe(0.948);
  });

  it("all defined densities are within the plausible calibration range", () => {
    for (const [category, density] of Object.entries(DEFAULT_DENSITIES)) {
      expect(density).toBeGreaterThanOrEqual(CALIBRATION_DENSITY_MIN);
      expect(density).toBeLessThanOrEqual(CALIBRATION_DENSITY_MAX);
    }
  });
});

// ─── Defect-1 runtime proof: variance sign convention ────────────────────────
// The exact scenario from the bug report: 30.3 measures poured, 0 rung.
// positive result = shrinkage = money missing (must be RED in UI, loss alert).
describe("calcVariance — sign convention (Defect 1 regression)", () => {
  it("poured-but-not-rung produces POSITIVE variance (shrinkage)", () => {
    const v = calcVariance(30.3, 0);
    expect(v).toBeCloseTo(30.3, 1);
    expect(v).toBeGreaterThan(0); // positive = shrinkage = RED
  });

  it("more-rung-than-poured produces NEGATIVE variance (over-ring, not a gain)", () => {
    const v = calcVariance(10, 15);
    expect(v).toBeCloseTo(-5, 1);
    expect(v).toBeLessThan(0); // negative = over-ring = AMBER / check till
  });

  it("balanced reads zero", () => {
    expect(calcVariance(10, 10)).toBe(0);
  });

  it("loss alert threshold fires when POSITIVE (shrinkage) not negative", () => {
    const LOSS_THRESHOLD_GBP = 10;
    const pourPrice = 3.60; // per measure

    // Scenario from bug: 30.3 unaccounted measures @ £3.60 = £109.08 — must fire alert
    const shrinkageVariance = calcVariance(30.3, 0);
    const shrinkageValue = shrinkageVariance * pourPrice;
    expect(shrinkageValue).toBeGreaterThan(LOSS_THRESHOLD_GBP); // correct: alert fires

    // Old (broken) condition: valueVariance < -LOSS_THRESHOLD_GBP would NOT fire here
    expect(shrinkageValue).toBeGreaterThan(0); // positive — old condition missed this
    expect(shrinkageValue < -LOSS_THRESHOLD_GBP).toBe(false); // old condition was wrong

    // Over-ring: 10 poured, 15 rung — till-side surplus, no loss alert
    const overRingVariance = calcVariance(10, 15);
    const overRingValue = overRingVariance * pourPrice;
    expect(overRingValue).toBeLessThan(0); // negative = not a loss
    expect(overRingValue > LOSS_THRESHOLD_GBP).toBe(false); // correct: no alert
  });
});

// ─── calcSoldSinceLast baseline ───────────────────────────────────────────────
describe("calcSoldSinceLast", () => {
  it("computes measures sold between two readings", () => {
    // Baseline 1190ml (full + cellar), current 432ml — spot check scenario
    const sold = calcSoldSinceLast(1190, 432, 25);
    expect(sold).toBeCloseTo(30.32, 1);
  });

  it("returns 0 when nothing has changed", () => {
    expect(calcSoldSinceLast(700, 700, 25)).toBe(0);
  });

  it("returns 0 for zero measure size (guard)", () => {
    expect(calcSoldSinceLast(700, 500, 0)).toBe(0);
  });
});
