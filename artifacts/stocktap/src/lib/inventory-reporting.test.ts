import { describe, expect, it } from "vitest";
import {
  costPerSoldUnit,
  gpPercentForProduct,
  movementValueFromMl,
  purchaseUnitLabel,
  purchaseUnitsFromReading,
  stockValueFromReading,
} from "./inventory-reporting";

describe("report stock valuation", () => {
  it("values 10 counted bottles at £1.20 as £12", () => {
    const product = { unit: "count", counting_method: "each", size_ml: 330, cost_price: 1.2 };
    const reading = { count: 10, ml_remaining: 3300 };
    expect(purchaseUnitsFromReading(product, reading)).toBe(10);
    expect(stockValueFromReading(product, reading)).toBeCloseTo(12, 8);
  });

  it("values 27 units from 12-packs as 2.25 packs, not 27 packs", () => {
    const product = { unit: "count", counting_method: "dozen", pack_size: 12, size_ml: 330, cost_price: 12 };
    const reading = { count: 27, ml_remaining: 27 * 330 };
    expect(purchaseUnitsFromReading(product, reading)).toBeCloseTo(2.25, 8);
    expect(stockValueFromReading(product, reading)).toBeCloseTo(27, 8);
    expect(purchaseUnitLabel(product)).toBe("packs");
  });

  it("values half a 50L keg at half its £120 purchase cost", () => {
    const product = { unit: "count", counting_method: "keg_weight", container_l: 50, cost_price: 120 };
    const reading = { count: null, ml_remaining: 25_000 };
    expect(purchaseUnitsFromReading(product, reading)).toBeCloseTo(0.5, 8);
    expect(stockValueFromReading(product, reading)).toBeCloseTo(60, 8);
  });

  it("uses effective capacity for movement valuation", () => {
    const keg = { unit: "count", counting_method: "keg_weight", container_l: 50, cost_price: 120 };
    expect(movementValueFromMl(keg, 25_000)).toBeCloseTo(60, 8);
    expect(movementValueFromMl(keg, 25_000, 10_000)).toBeCloseTo(50, 8);
  });
});

describe("report GP cost", () => {
  it("uses per-item cost for each products", () => {
    const product = { unit: "count", counting_method: "each", cost_price: 1.2, pour_price: 3 };
    expect(costPerSoldUnit(product, 25)).toBeCloseTo(1.2, 8);
    expect(gpPercentForProduct(product, 25)).toBeCloseTo(60, 8);
  });

  it("uses pack cost divided by pack size for dozen products", () => {
    const product = { unit: "count", counting_method: "dozen", pack_size: 12, cost_price: 12, pour_price: 3 };
    expect(costPerSoldUnit(product, 25)).toBeCloseTo(1, 8);
    expect(gpPercentForProduct(product, 25)).toBeCloseTo(66.6666667, 6);
  });

  it("uses a pint as the default draught sale measure", () => {
    const product = { unit: "count", counting_method: "keg_weight", container_l: 50, cost_price: 120, pour_price: 5 };
    expect(costPerSoldUnit(product, 25)).toBeCloseTo((120 / 50_000) * 568.261, 8);
    expect(gpPercentForProduct(product, 25)).toBeGreaterThan(70);
  });
});

describe("GP rules ported from the live bundle patches (Aug/Sep 2026)", () => {
  it("prices a 750ml wine by a 175ml glass when no measure is set", () => {
    const wine = { type: "wine", unit: "weigh", size_ml: 750, cost_price: 6, pour_price: 4.5 };
    expect(costPerSoldUnit(wine, 25)).toBeCloseTo(1.4, 8);
    expect(gpPercentForProduct(wine, 25)).toBeCloseTo(68.888, 2);
  });
  it("sells a 200ml single-serve prosecco as a whole bottle", () => {
    const mini = { type: "sparkling", unit: "weigh", size_ml: 200, cost_price: 1.6, pour_price: 6 };
    expect(costPerSoldUnit(mini, 25)).toBeCloseTo(1.6, 8);
  });
  it("treats non-draught packaged lines as per-unit even when unit is weigh", () => {
    const peroni = { type: "packaged", unit: "weigh", size_ml: 330, cost_price: 1.15, pour_price: 3.9 };
    expect(costPerSoldUnit(peroni, 25)).toBeCloseTo(1.15, 8);
  });
  it("treats counting_method each as per-unit", () => {
    const bag = { type: "spirit", unit: "weigh", counting_method: "each", size_ml: 700, cost_price: 2, pour_price: 3 };
    expect(costPerSoldUnit(bag, 25)).toBeCloseTo(2, 8);
  });
});
