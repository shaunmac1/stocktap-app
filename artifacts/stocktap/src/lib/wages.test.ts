import { describe, expect, it } from "vitest";
import {
  shiftDurationHours,
  shiftCost,
  dayWageCost,
  wagePercent,
  isOnShift,
  shiftCapISO,
  isForgottenClockOut,
  type Shift,
  type CloseTimes,
} from "./wages";

const CLOSE: CloseTimes = { mon: "23:30", tue: "23:30", wed: "23:30", thu: "23:30", fri: "00:30", sat: "00:30", sun: "23:30" };

function mkShift(clock_in: string, clock_out: string | null, rate_snapshot: number | null): Shift {
  return {
    id: clock_in,
    venue_id: "v1",
    staff_id: "s1",
    business_date: clock_in.slice(0, 10),
    clock_in,
    clock_out,
    rate_snapshot,
    note: null,
    created_at: "",
    updated_at: "",
  };
}

const NOW = "2026-08-22T22:00:00Z";

describe("shiftDurationHours", () => {
  it("measures a closed shift", () => {
    expect(shiftDurationHours("2026-08-22T17:00:00Z", "2026-08-22T23:00:00Z", NOW)).toBe(6);
  });
  it("counts an open shift up to now", () => {
    // clocked in at 18:00, now is 22:00 -> 4 hours and still going
    expect(shiftDurationHours("2026-08-22T18:00:00Z", null, NOW)).toBe(4);
  });
  it("handles part hours", () => {
    expect(shiftDurationHours("2026-08-22T17:00:00Z", "2026-08-22T22:30:00Z", NOW)).toBe(5.5);
  });
  it("never returns negative for a clock_out before clock_in", () => {
    expect(shiftDurationHours("2026-08-22T23:00:00Z", "2026-08-22T22:00:00Z", NOW)).toBe(0);
  });
});

describe("shiftCost", () => {
  it("multiplies hours by the snapshot rate", () => {
    expect(shiftCost(mkShift("2026-08-22T17:00:00Z", "2026-08-22T23:00:00Z", 12), NOW)).toBe(72);
  });
  it("treats a missing rate as zero rather than crashing", () => {
    expect(shiftCost(mkShift("2026-08-22T17:00:00Z", "2026-08-22T23:00:00Z", null), NOW)).toBe(0);
  });
  it("costs an open shift live", () => {
    // 18:00 -> now 22:00 = 4h at £11 = £44
    expect(shiftCost(mkShift("2026-08-22T18:00:00Z", null, 11), NOW)).toBe(44);
  });
});

describe("dayWageCost", () => {
  it("sums every shift, open and closed", () => {
    const shifts = [
      mkShift("2026-08-22T17:00:00Z", "2026-08-22T23:00:00Z", 12), // £72
      mkShift("2026-08-22T18:00:00Z", null, 11), // 4h live = £44
    ];
    expect(dayWageCost(shifts, NOW)).toBe(116);
  });
  it("is zero with no shifts", () => {
    expect(dayWageCost([], NOW)).toBe(0);
  });
});

describe("wagePercent", () => {
  it("expresses wage cost as a % of the take", () => {
    expect(wagePercent(116, 3180)).toBeCloseTo(3.6478, 3);
  });
  it("is null until there's a take to divide by", () => {
    expect(wagePercent(116, null)).toBeNull();
    expect(wagePercent(116, 0)).toBeNull();
  });
});

describe("isOnShift", () => {
  it("is true only while clocked in", () => {
    expect(isOnShift(mkShift("2026-08-22T18:00:00Z", null, 11))).toBe(true);
    expect(isOnShift(mkShift("2026-08-22T18:00:00Z", "2026-08-22T22:00:00Z", 11))).toBe(false);
  });
});

// The container runs in UTC, so local == UTC here; assertions use UTC instants.
describe("shiftCapISO (venue close cut-off)", () => {
  it("uses the weekday's close time", () => {
    // 2026-08-24 is a Monday -> 23:30 that day
    expect(shiftCapISO("2026-08-24", CLOSE)).toBe("2026-08-24T23:30:00.000Z");
  });
  it("rolls an after-midnight close onto the next day (Fri 00:30 = Sat morning)", () => {
    // 2026-08-21 is a Friday -> 00:30 the following morning
    expect(shiftCapISO("2026-08-21", CLOSE)).toBe("2026-08-22T00:30:00.000Z");
  });
  it("returns null with no close times", () => {
    expect(shiftCapISO("2026-08-24", null)).toBeNull();
  });
});

describe("auto clock-out cap", () => {
  const cap = shiftCapISO("2026-08-24", CLOSE)!; // Mon 23:30

  it("caps a forgotten open shift at the close time", () => {
    // clocked in 18:00, forgot to clock out, it's now 9am next day
    const hours = shiftDurationHours("2026-08-24T18:00:00Z", null, "2026-08-25T09:00:00Z", cap);
    expect(hours).toBe(5.5); // 18:00 -> 23:30, not 15 hours
  });
  it("does not cap a shift still legitimately running before close", () => {
    const hours = shiftDurationHours("2026-08-24T18:00:00Z", null, "2026-08-24T21:00:00Z", cap);
    expect(hours).toBe(3); // live, now is before the cap
  });
  it("dayWageCost caps forgotten shifts via close_times", () => {
    const shifts = [mkShift("2026-08-24T18:00:00Z", null, 12)]; // rate £12, business_date 2026-08-24 (Mon)
    // capped at 5.5h * £12 = £66, not a runaway all-nighter
    expect(dayWageCost(shifts, "2026-08-25T09:00:00Z", CLOSE)).toBe(66);
  });
  it("flags a missed clock-out", () => {
    const forgotten = mkShift("2026-08-24T18:00:00Z", null, 12);
    const stillOn = mkShift("2026-08-24T18:00:00Z", null, 12);
    expect(isForgottenClockOut(forgotten, "2026-08-25T09:00:00Z", cap)).toBe(true); // past close
    expect(isForgottenClockOut(stillOn, "2026-08-24T21:00:00Z", cap)).toBe(false); // before close
  });
});
