import { describe, expect, it } from "vitest";
import {
  shiftISO,
  buildComparisons,
  entertainmentRoi,
  recentTrend,
  type CashUp,
} from "./daily-board";

function mk(business_date: string, total_taken: number | null, extra: Partial<CashUp> = {}): CashUp {
  return {
    id: business_date,
    venue_id: "v1",
    business_date,
    till_name: null,
    float_amount: null,
    z_read: null,
    cash_counted: null,
    card_taken: null,
    total_taken,
    variance: null,
    wet_sales: null,
    dry_sales: null,
    what_was_on: null,
    act_or_match: null,
    fee: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

const D = "2026-08-20";

describe("shiftISO (UTC, DST-safe)", () => {
  it("shifts by whole days", () => {
    expect(shiftISO(D, -7)).toBe("2026-08-13");
    expect(shiftISO(D, 1)).toBe("2026-08-21");
  });
  it("crosses month and year boundaries", () => {
    expect(shiftISO("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftISO("2026-03-01", -1)).toBe("2026-02-28"); // 2026 not a leap year
  });
  it("is unaffected by BST/GMT clock changes", () => {
    // UK clocks go forward 2026-03-29; UTC-based shift must still be exact.
    expect(shiftISO("2026-03-30", -1)).toBe("2026-03-29");
    expect(shiftISO("2026-03-29", -1)).toBe("2026-03-28");
  });
});

describe("buildComparisons", () => {
  const rows = [
    mk(shiftISO(D, -7), 3000),
    mk(shiftISO(D, -14), 2000),
    mk(shiftISO(D, -21), 2500),
    mk(shiftISO(D, -28), 1500),
    mk(shiftISO(D, -364), 2489.5),
    mk(shiftISO(D, -728), 2985.15),
    mk(shiftISO(D, -1092), 2387.37),
  ];

  it("finds the same day last week", () => {
    expect(buildComparisons(rows, D).sameDayLastWeek).toBe(3000);
  });

  it("averages the last four same weekdays", () => {
    expect(buildComparisons(rows, D).lastFourSameDays).toBe((3000 + 2000 + 2500 + 1500) / 4); // 2250
  });

  it("averages only the same-days that exist (no phantom zeros)", () => {
    const partial = [mk(shiftISO(D, -7), 3000), mk(shiftISO(D, -14), 2000)];
    expect(buildComparisons(partial, D).lastFourSameDays).toBe(2500); // (3000+2000)/2, not /4
  });

  it("returns the 1/2/3-years-ago same weekday", () => {
    const y = buildComparisons(rows, D).yearsAgo;
    expect(y).toEqual([
      { years: 1, total: 2489.5 },
      { years: 2, total: 2985.15 },
      { years: 3, total: 2387.37 },
    ]);
  });

  it("returns nulls with no history rather than throwing", () => {
    const c = buildComparisons([], D);
    expect(c.sameDayLastWeek).toBeNull();
    expect(c.lastFourSameDays).toBeNull();
    expect(c.yearsAgo.every((y) => y.total === null)).toBe(true);
  });
});

describe("entertainmentRoi", () => {
  const rows = [
    mk(shiftISO(D, -7), 2000),
    mk(shiftISO(D, -14), 2000),
    mk(shiftISO(D, -21), 2000),
    mk(shiftISO(D, -28), 2000),
  ];

  it("shows an act that paid for itself", () => {
    // baseline 2000, took 3000, act cost 200 -> uplift 1000, net +800
    const roi = entertainmentRoi(rows, D, 3000, 200)!;
    expect(roi.baseline).toBe(2000);
    expect(roi.uplift).toBe(1000);
    expect(roi.net).toBe(800);
  });

  it("shows an act that lost money", () => {
    // baseline 2000, took 2100, act cost 300 -> uplift 100, net -200
    const roi = entertainmentRoi(rows, D, 2100, 300)!;
    expect(roi.net).toBe(-200);
  });

  it("returns null without a fee, a take, or enough history", () => {
    expect(entertainmentRoi(rows, D, 3000, null)).toBeNull();
    expect(entertainmentRoi(rows, D, null, 200)).toBeNull();
    expect(entertainmentRoi([], D, 3000, 200)).toBeNull();
  });
});

describe("recentTrend", () => {
  const rows = [mk(shiftISO(D, -7), 3000), mk(D, 2500)];

  it("returns N points, oldest first, ending on the selected date", () => {
    const t = recentTrend(rows, D, 14);
    expect(t).toHaveLength(14);
    expect(t[13].date).toBe(D);
    expect(t[13].total).toBe(2500);
    expect(t[0].date).toBe(shiftISO(D, -13));
  });

  it("fills missing days with null", () => {
    const t = recentTrend(rows, D, 14);
    const lastWeek = t.find((p) => p.date === shiftISO(D, -7));
    expect(lastWeek?.total).toBe(3000);
    const noData = t.find((p) => p.date === shiftISO(D, -1));
    expect(noData?.total).toBeNull();
  });
});
