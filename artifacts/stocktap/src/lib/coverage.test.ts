import { describe, it, expect } from "vitest";
import { calcDailyConsumption } from "./coverage";

describe("same-day recount guard", () => {
  it("ignores a spot check taken 90 minutes after a stocktake", () => {
    const t0 = new Date("2026-09-02T08:00:00Z").getTime();
    const readings = [
      { reading_at: new Date(t0).toISOString(), ml_remaining: 700 },
      { reading_at: new Date(t0 + 90 * 60_000).toISOString(), ml_remaining: 650 },
    ];
    expect(calcDailyConsumption(readings)).toBe(0);
  });
  it("needs at least a day of observation before quoting a rate", () => {
    const t0 = new Date("2026-09-02T08:00:00Z").getTime();
    const readings = [
      { reading_at: new Date(t0).toISOString(), ml_remaining: 700 },
      { reading_at: new Date(t0 + 14 * 3_600_000).toISOString(), ml_remaining: 650 },
    ];
    expect(calcDailyConsumption(readings)).toBe(0);
  });
  it("still computes a rate over two days", () => {
    const t0 = new Date("2026-09-02T08:00:00Z").getTime();
    const readings = [
      { reading_at: new Date(t0).toISOString(), ml_remaining: 700 },
      { reading_at: new Date(t0 + 2 * 86_400_000).toISOString(), ml_remaining: 500 },
    ];
    expect(calcDailyConsumption(readings)).toBeCloseTo(100, 6);
  });
});
