import { describe, expect, it } from "vitest";
import {
  readingStatus,
  latestReading,
  readingsOnDate,
  todaysCompletion,
  outOfRangeToday,
  defaultRange,
  type Appliance,
  type TempReading,
} from "./checks";

function mkApp(id: string, min_c: number | null, max_c: number | null, active = true): Appliance {
  return { id, venue_id: "v1", name: id, kind: "fridge", min_c, max_c, sort: 0, active, created_at: "" };
}
function mkReading(id: string, appliance_id: string, reading_c: number, created_at: string, business_date = "2026-08-21"): TempReading {
  return { id, venue_id: "v1", appliance_id, business_date, reading_c, recorded_by: null, note: null, created_at };
}

describe("readingStatus", () => {
  it("is ok inside the range", () => {
    expect(readingStatus(4, 0, 5)).toBe("ok");
    expect(readingStatus(0, 0, 5)).toBe("ok"); // boundary inclusive
    expect(readingStatus(5, 0, 5)).toBe("ok");
  });
  it("flags too warm above max", () => {
    expect(readingStatus(8, 0, 5)).toBe("high");
  });
  it("flags too cold below min", () => {
    expect(readingStatus(-2, 0, 5)).toBe("low");
  });
  it("treats null bounds as unbounded", () => {
    expect(readingStatus(90, 63, null)).toBe("ok"); // hot hold, no upper bound
    expect(readingStatus(50, 63, null)).toBe("low"); // hot hold too cool
    expect(readingStatus(-40, null, -18)).toBe("ok"); // freezer, no lower bound
  });
});

describe("latestReading", () => {
  it("returns the most recent reading for an appliance", () => {
    const readings = [
      mkReading("r1", "a1", 4, "2026-08-21T09:00:00Z"),
      mkReading("r2", "a1", 6, "2026-08-21T17:00:00Z"),
      mkReading("r3", "a2", 3, "2026-08-21T10:00:00Z"),
    ];
    expect(latestReading("a1", readings)?.id).toBe("r2");
  });
  it("returns null when there are none", () => {
    expect(latestReading("a1", [])).toBeNull();
  });
});

describe("readingsOnDate", () => {
  it("filters to one business date", () => {
    const readings = [
      mkReading("r1", "a1", 4, "2026-08-20T09:00:00Z", "2026-08-20"),
      mkReading("r2", "a1", 4, "2026-08-21T09:00:00Z", "2026-08-21"),
    ];
    expect(readingsOnDate(readings, "2026-08-21").map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("todaysCompletion", () => {
  it("counts appliances logged today", () => {
    const apps = [mkApp("a1", 0, 5), mkApp("a2", 0, 5), mkApp("a3", 0, 5)];
    const readings = [mkReading("r1", "a1", 4, "2026-08-21T09:00:00Z"), mkReading("r2", "a2", 3, "2026-08-21T09:00:00Z")];
    expect(todaysCompletion(apps, readings)).toEqual({ done: 2, total: 3, remaining: 1, complete: false });
  });
  it("is complete when every active appliance is logged", () => {
    const apps = [mkApp("a1", 0, 5), mkApp("a2", 0, 5)];
    const readings = [mkReading("r1", "a1", 4, "2026-08-21T09:00:00Z"), mkReading("r2", "a2", 3, "2026-08-21T09:00:00Z")];
    expect(todaysCompletion(apps, readings).complete).toBe(true);
  });
  it("ignores inactive appliances", () => {
    const apps = [mkApp("a1", 0, 5), mkApp("a2", 0, 5, false)];
    const readings = [mkReading("r1", "a1", 4, "2026-08-21T09:00:00Z")];
    expect(todaysCompletion(apps, readings)).toEqual({ done: 1, total: 1, remaining: 0, complete: true });
  });
  it("is not complete with zero appliances", () => {
    expect(todaysCompletion([], []).complete).toBe(false);
  });
});

describe("outOfRangeToday", () => {
  it("flags only appliances whose latest reading is out of range", () => {
    const apps = [mkApp("a1", 0, 5), mkApp("a2", 0, 5)];
    const readings = [
      mkReading("r1", "a1", 9, "2026-08-21T09:00:00Z"), // too warm early
      mkReading("r2", "a1", 4, "2026-08-21T12:00:00Z"), // fixed later -> latest is ok
      mkReading("r3", "a2", 8, "2026-08-21T10:00:00Z"), // still warm
    ];
    const alerts = outOfRangeToday(apps, readings);
    expect(alerts.map((x) => x.appliance.id)).toEqual(["a2"]);
    expect(alerts[0].status).toBe("high");
  });
  it("returns nothing when all latest readings are in range", () => {
    const apps = [mkApp("a1", 0, 5)];
    const readings = [mkReading("r1", "a1", 3, "2026-08-21T09:00:00Z")];
    expect(outOfRangeToday(apps, readings)).toEqual([]);
  });
});

describe("defaultRange", () => {
  it("gives sensible starting ranges per kind", () => {
    expect(defaultRange("fridge")).toEqual({ min_c: 0, max_c: 5 });
    expect(defaultRange("freezer")).toEqual({ min_c: -30, max_c: -18 });
    expect(defaultRange("hot_hold")).toEqual({ min_c: 63, max_c: null });
    expect(defaultRange("probe")).toEqual({ min_c: 75, max_c: null });
    expect(defaultRange("other")).toEqual({ min_c: null, max_c: null });
  });
});
