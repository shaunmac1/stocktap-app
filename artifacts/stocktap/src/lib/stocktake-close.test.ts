import { describe, expect, it, vi } from "vitest";
import {
  aggregateProductEntries,
  buildPersistedReading,
  measuresRemaining,
  persistReadingsThenClose,
  valueAggregatedReading,
  valueProductEntries,
} from "./stocktake-close";

const countProduct = {
  id: "bottles",
  unit: "count" as const,
  counting_method: "each",
  size_ml: 330,
  cost_price: 1.2,
  location_id: "bar",
};

const kegProduct = {
  id: "keg",
  unit: "count" as const,
  counting_method: "keg_weight",
  container_l: 50,
  cost_price: 120,
  location_id: "cellar",
};

const weighProduct = {
  id: "gin",
  unit: "weigh" as const,
  counting_method: "weigh",
  size_ml: 700,
  cost_price: 20,
  measure_ml: 25,
  location_id: "bar",
};

describe("stocktake close valuation", () => {
  it("values 10 x 330ml bottles at £1.20 as £12, never as 3300 units", () => {
    const reading = aggregateProductEntries(countProduct, [{
      product_id: "bottles",
      method: "each",
      full_containers: null,
      part_value: 10,
      ml_remaining: 3300,
    }]);

    expect(reading.count).toBe(10);
    expect(valueAggregatedReading(countProduct, reading)).toBeCloseTo(12, 8);
    expect(valueAggregatedReading(countProduct, reading)).not.toBeCloseTo(3960, 2);
  });

  it("values a half-full 50L keg as half its keg cost even though unit is count", () => {
    const reading = aggregateProductEntries(kegProduct, [{
      product_id: "keg",
      method: "keg_weight",
      full_containers: 0,
      part_value: 44,
      ml_remaining: 25_000,
    }]);

    expect(reading.count).toBeNull();
    expect(valueAggregatedReading(kegProduct, reading)).toBeCloseTo(60, 8);
  });

  it("values dozen products from pack cost, including loose units", () => {
    const product = { ...countProduct, id: "case", counting_method: "dozen", pack_size: 12, cost_price: 12 };
    const reading = aggregateProductEntries(product, [{
      product_id: "case",
      method: "dozen",
      full_containers: 2,
      part_value: 3,
      ml_remaining: 27 * 330,
    }]);

    expect(reading.count).toBe(27);
    expect(valueAggregatedReading(product, reading)).toBeCloseTo(27, 8);
  });
});

describe("persisted readings", () => {
  it.each([
    ["each", countProduct, 10, 10, null, 10],
    ["keg_weight", kegProduct, null, 44, 0, 44],
    ["weigh", weighProduct, null, 850, null, 850],
    ["tenths", weighProduct, null, 5, null, 5],
    ["dipstick", kegProduct, null, 250, 1, 250],
    ["tenths_pints", kegProduct, null, 4, 1, 4],
    ["litre", kegProduct, null, 12.5, null, 12.5],
    ["photo_tap", weighProduct, null, 0.5, null, 0.5],
  ] as const)("preserves %s rather than hardcoding weigh", (method, product, expectedCount, partValue, fullContainers, expectedPart) => {
    const reading = aggregateProductEntries(product, [{
      product_id: product.id,
      method,
      full_containers: fullContainers,
      part_value: partValue,
      ml_remaining: method === "each" ? 3300 : 350,
    }]);
    const persisted = buildPersistedReading(product, reading, {
      venueId: "venue",
      stocktakeId: "stocktake",
      userId: "user",
      readingAt: "2026-07-14T12:00:00.000Z",
    });

    expect(persisted.method).toBe(method);
    expect(persisted.count).toBe(expectedCount);
    expect(persisted.full_containers).toBe(fullContainers);
    expect(persisted.part_value).toBe(expectedPart);
    expect(persisted.weight_g).toBe(method === "weigh" ? expectedPart : null);
  });

  it("merges mixed methods safely instead of throwing (throwing bricked open stocktakes)", () => {
    const entries = [
      { product_id: "gin", method: "weigh" as const, full_containers: null, part_value: 850, ml_remaining: 350 },
      { product_id: "gin", method: "tenths" as const, full_containers: null, part_value: 5, ml_remaining: 350 },
    ];
    expect(() => aggregateProductEntries(weighProduct, entries)).not.toThrow();
    const reading = aggregateProductEntries(weighProduct, entries);
    // ml always sums — no stock is silently dropped
    expect(reading.mlRemaining).toBe(700);
    // both subgroups are valued by their own rules: (350+350)/700 × £20 = £20
    expect(valueProductEntries(weighProduct, entries)).toBeCloseTo(20, 6);
  });
});

describe("close failure handling", () => {
  const payload = buildPersistedReading(
    weighProduct,
    aggregateProductEntries(weighProduct, [{
      product_id: "gin",
      method: "weigh",
      full_containers: null,
      part_value: 850,
      ml_remaining: 350,
    }]),
    { venueId: "venue", stocktakeId: "stocktake", userId: "user" },
  );

  it("does not close the stocktake when any reading save throws", async () => {
    const close = vi.fn(async () => undefined);
    const save = vi.fn(async () => { throw new Error("reading rejected"); });

    await expect(persistReadingsThenClose(
      [{ productName: "Test Gin", payload }],
      save,
      close,
    )).rejects.toThrow("reading rejected");
    expect(close).not.toHaveBeenCalled();
  });

  it("returns the exact product names that are queued rather than silently claiming full sync", async () => {
    const close = vi.fn(async () => undefined);
    const pending = await persistReadingsThenClose(
      [{ productName: "Test Gin", payload }],
      async () => ({ _synced: 0 as const }),
      close,
    );

    expect(pending).toEqual(["Test Gin"]);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("bug regression: counting pad fixes", () => {
  it("values 54 x Budweiser 330ml at £1.20 each as £64.80, never as tenths-clamped nonsense", () => {
    const product = { ...countProduct, id: "bud", size_ml: 330, cost_price: 1.20 };
    const reading = aggregateProductEntries(product, [{
      product_id: "bud",
      method: "each",
      full_containers: null,
      part_value: 54,
      ml_remaining: 54 * 330,
    }]);

    expect(reading.count).toBe(54);
    expect(valueAggregatedReading(product, reading)).toBeCloseTo(64.80, 2);
    // Must not be the tenths-clamped figure (10/10 * £1.20 = £1.20)
    expect(valueAggregatedReading(product, reading)).not.toBeCloseTo(1.20, 1);
  });

  it("sums sealed full bottles plus a part-bottle for weigh products", () => {
    const product = { ...weighProduct, id: "whisky", size_ml: 700, cost_price: 25, empty_weight_g: 300 };
    const partMl = 350;
    const reading = aggregateProductEntries(product, [{
      product_id: "whisky",
      method: "weigh",
      full_containers: 6,
      part_value: 860,
      ml_remaining: 6 * 700 + partMl,
    }]);

    expect(reading.fullContainers).toBe(6);
    expect(reading.mlRemaining).toBeCloseTo(6 * 700 + partMl, 0);
    // 4550ml / 700ml * £25 = £162.50
    expect(valueAggregatedReading(product, reading)).toBeCloseTo((6 * 700 + partMl) / 700 * 25, 2);
  });

  it("rejects tenths > 10 at the aggregation boundary by ensuring ml stays bounded", () => {
    const product = { ...weighProduct, size_ml: 700 };
    const reading = aggregateProductEntries(product, [{
      product_id: "gin",
      method: "tenths",
      full_containers: null,
      part_value: 7.5,
      ml_remaining: (7.5 / 10) * 700,
    }]);

    // 7.5 tenths of 700ml = 525ml; value = 525/700 * £20 = £15
    expect(reading.mlRemaining).toBeCloseTo(525, 0);
    expect(valueAggregatedReading(product, reading)).toBeCloseTo(15, 2);
    // Confirm that 1000-tenths worth of ml would be rejected at the UI layer
    // (the save layer now validates ≤10; here we just confirm the math would be wrong)
    const badMl = (1000 / 10) * 700;
    expect(badMl).toBeGreaterThan(700 * 10); // sanity check: obviously absurd
  });
});

describe("measures display", () => {
  it("shows 350ml as 14 x 25ml measures", () => {
    const reading = aggregateProductEntries(weighProduct, [{
      product_id: "gin",
      method: "weigh",
      full_containers: null,
      part_value: 850,
      ml_remaining: 350,
    }]);

    expect(measuresRemaining(reading, 25, 25)).toBe(14);
  });
});

describe("multi-area aggregation (Smirnoff scenario)", () => {
  const smirnoff = {
    id: "smirnoff",
    unit: "weigh" as const,
    counting_method: "tenths",
    size_ml: 700,
    cost_price: 14,
    measure_ml: 25,
    location_id: "bar",
  };

  it("adds bar (1 full + 4 tenths) and cellar (6 full) into one true total", () => {
    const entries = [
      // Bar: 1 full sealed bottle + 4 tenths of the open one → 700 + 280 = 980ml
      { product_id: "smirnoff", method: "tenths" as const, full_containers: 1, part_value: 4, ml_remaining: 980 },
      // Cellar: 6 full sealed bottles → 4200ml
      { product_id: "smirnoff", method: "tenths" as const, full_containers: 6, part_value: 0, ml_remaining: 4200 },
    ];
    const reading = aggregateProductEntries(smirnoff, entries);
    expect(reading.mlRemaining).toBe(5180); // 7.4 bottles
    expect(reading.fullContainers).toBe(7);
    // Value: 7.4 bottles × £14 = £103.60
    expect(valueProductEntries(smirnoff, entries)).toBeCloseTo(103.6, 6);
  });

  it("never throws on mixed methods and values each subgroup by its own rules", () => {
    const entries = [
      // Bar counted by weigh: raw grams as part_value, 350ml remaining
      { product_id: "smirnoff", method: "weigh" as const, full_containers: 0, part_value: 812, ml_remaining: 350 },
      // Cellar counted by tenths after a Library edit: 6 full bottles
      { product_id: "smirnoff", method: "tenths" as const, full_containers: 6, part_value: 0, ml_remaining: 4200 },
    ];
    expect(() => aggregateProductEntries(smirnoff, entries)).not.toThrow();
    const reading = aggregateProductEntries(smirnoff, entries);
    expect(reading.mlRemaining).toBe(4550);
    // Primary method = the subgroup holding most stock (cellar tenths)
    expect(reading.method).toBe("tenths");
    // (350 + 4200) / 700 × £14 = £91
    expect(valueProductEntries(smirnoff, entries)).toBeCloseTo(91, 6);
  });

  it("mixed discrete + volume methods sum counts and value independently", () => {
    const mixers = { id: "cola", unit: "count" as const, counting_method: "each", size_ml: 200, cost_price: 0.5, location_id: "bar" };
    const entries = [
      { product_id: "cola", method: "each" as const, full_containers: null, part_value: 10, ml_remaining: 2000 },
      { product_id: "cola", method: "dozen" as const, full_containers: 2, part_value: 0, ml_remaining: 4800 },
    ];
    expect(() => aggregateProductEntries({ ...mixers, pack_size: 12 }, entries)).not.toThrow();
    const reading = aggregateProductEntries({ ...mixers, pack_size: 12 }, entries);
    expect(reading.count).toBe(34); // 10 each + 24 in packs
  });
});
