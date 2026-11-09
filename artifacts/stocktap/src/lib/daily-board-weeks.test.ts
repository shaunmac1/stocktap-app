import { describe, expect, it } from "vitest";
import { weekStartOf, weekRows, monthRows, shiftISO, type CashUp } from "./daily-board";

const cu = (d: string, t: number): CashUp => ({ id: d, venue_id: "v", business_date: d, total_taken: t } as CashUp);

describe("weeks", () => {
  it("finds the Sunday or Monday a week starts on", () => {
    expect(weekStartOf("2026-09-30")).toBe("2026-09-27"); // Wed → Sun
    expect(weekStartOf("2026-09-27")).toBe("2026-09-27");
    expect(weekStartOf("2026-09-30", 1)).toBe("2026-09-28");
  });

  it("totals each week and compares like-for-like weekdays 52 weeks back", () => {
    const ups: CashUp[] = [];
    for (let i = 0; i < 7; i++) ups.push(cu(shiftISO("2025-09-28", i), 100 + i)); // a full week last year
    for (let i = 0; i < 3; i++) ups.push(cu(shiftISO("2026-09-27", i), 200)); // Sun–Tue this year
    const wages = new Map([["2025-09-28", 105.35]]);
    const [now, then] = weekRows(ups, wages);
    expect(now.start).toBe("2026-09-27");
    expect(now.total).toBe(600);
    expect(now.days).toBe(3);
    expect(now.lastYear).toBe(721);
    expect(now.lastYearSoFar).toBe(100 + 101 + 102);
    expect(then.total).toBe(721);
    expect(then.wagePct).toBeCloseTo(14.61, 2);
  });

  it("gives month totals, with last year only when that month was fully logged", () => {
    const ups: CashUp[] = [];
    for (let d = 1; d <= 30; d++) ups.push(cu(`2025-09-${String(d).padStart(2, "0")}`, 10));
    for (let d = 1; d <= 29; d++) ups.push(cu(`2026-09-${String(d).padStart(2, "0")}`, 20));
    ups.push(cu("2025-08-15", 50));
    const rows = monthRows(ups);
    expect(rows[0]).toMatchObject({ month: "2026-09", total: 580, days: 29, lastYear: 300 });
    expect(monthRows([cu("2026-08-01", 1), cu("2025-08-15", 50)])[0].lastYear).toBeNull();
  });
});

import { parseUkDate, parseTakingsPaste } from "./daily-board";
describe("pasting past takings", () => {
  it("reads UK dates", () => {
    expect(parseUkDate("29/09/2026")).toBe("2026-09-29");
    expect(parseUkDate("8/3/23")).toBe("2023-03-08");
    expect(parseUkDate("2026-09-29")).toBe("2026-09-29");
    expect(parseUkDate("Tue 29 Sept 2026")).toBe("2026-09-29");
    expect(parseUkDate("31/02/2026")).toBeNull();
    expect(parseUkDate("Total")).toBeNull();
  });
  it("takes date and amount from pasted rows, skipping headers and totals", () => {
    const r = parseTakingsPaste("Date\tTakings\n29/09/2026\t£1,022.10\n28/09/2026\t717.89\nTotal\t1739.99\n\n27/09/2026, 1743.75\n27 Sep 2026  1743.80");
    expect(r.rows).toEqual([{ date: "2026-09-27", total: 1743.8 }, { date: "2026-09-28", total: 717.89 }, { date: "2026-09-29", total: 1022.1 }]);
    expect(r.skipped).toEqual(["Date\tTakings".trim(), "Total\t1739.99"]);
    expect(r.duplicates).toBe(1);
  });
  it("reads comma files with thousands, quoted or with a £", () => {
    const r = parseTakingsPaste('Date,Takings\nMon 1st Jan 2024,£1,100.00\n02/01/2024,"1,234.56",x\n03/01/2024,1,100.00\n04/01/2024,100,500\n05/01/2024,-20');
    expect(r.rows).toEqual([
      { date: "2024-01-01", total: 1100 }, { date: "2024-01-02", total: 1234.56 },
      { date: "2024-01-03", total: 1100 }, { date: "2024-01-04", total: 100 },
    ]);
    expect(r.skipped.length).toBe(2);
  });
});

import { parseTakingsTable } from "./daily-board";
// Layouts modelled on the vendors' help docs (made-up figures).
describe("till exports", () => {
  it("days across the top (Square sales summary style): picks Total collected", () => {
    const t = parseTakingsTable([
      "Sales Summary,28 Sep 2026,29 Sep 2026,30 Sep 2026",
      "Gross Sales,\"£1,000.00\",£800.00,£900.00",
      "Discounts,-£20.00,£0.00,-£5.00",
      "Net Sales,£980.00,£800.00,£895.00",
      "Tax,£196.00,£160.00,£179.00",
      "Total Collected,\"£1,176.00\",£960.00,\"£1,074.00\"",
    ].join("\n"));
    expect(t.across).toBe(true);
    expect(t.columns[t.best].label).toBe("Total Collected");
    expect(t.columns[t.best].rows).toEqual([{ date: "2026-09-28", total: 1176 }, { date: "2026-09-29", total: 960 }, { date: "2026-09-30", total: 1074 }]);
  });
  it("one row per day with several columns (Epos Now style): prefers inc-VAT sales over counts", () => {
    const t = parseTakingsTable([
      "Date,Transactions,Sales Inc. Tax,Discount,Net Sales Exc. Tax",
      "28/09/2026,112,1450.20,12.00,1198.50",
      "29/09/2026,98,1302.10,0.00,1085.08",
      "Total,210,2752.30,12.00,2283.58",
    ].join("\n"));
    expect(t.columns.map(c => c.label)).toEqual(["Transactions", "Sales Inc. Tax", "Discount", "Net Sales Exc. Tax"]);
    expect(t.columns[t.best].label).toBe("Sales Inc. Tax");
    expect(t.columns[t.best].rows).toEqual([{ date: "2026-09-28", total: 1450.2 }, { date: "2026-09-29", total: 1302.1 }]);
    expect(t.columns[t.best].skipped).toEqual(["Total 210 2752.30 12.00 2283.58"]);
  });
  it("Excel-style dates and times, tab separated", () => {
    const t = parseTakingsTable("Day\tGross\n28-Sep-2026 00:00\t1,010.00\n2026/09/29\t990.50");
    expect(t.columns[t.best].rows).toEqual([{ date: "2026-09-28", total: 1010 }, { date: "2026-09-29", total: 990.5 }]);
  });
  it("two plain columns still work", () => {
    const t = parseTakingsTable("08/03/2023\t777.50\n09/03/2023\t1,570.46");
    expect(t.columns).toHaveLength(1);
    expect(t.columns[0].rows[1]).toEqual({ date: "2023-03-09", total: 1570.46 });
  });
});
