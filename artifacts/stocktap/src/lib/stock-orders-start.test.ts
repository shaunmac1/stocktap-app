import { describe, it, expect } from "vitest";
import { orderList, type StoredAudit } from "./stock-orders";
import { mlToAuditBase, auditRateToMl } from "./line-forecast";

const line = (over: Partial<StoredAudit["lines"][number]>) => ({
  name: "Soft J2O Apple & Mango 275ml", category: "Minerals", unit: "Each", base: "units" as const,
  open: 0, del: 0, ret: 0, tin: 0, tout: 0, adj: 0, waste: 0, sold: 0, expected: 0, counted: 0, variance: 0, retail: 0, delist: false, ...over,
});
const audit: StoredAudit = { id: "a1", period_start: "2026-08-25", period_end: "2026-09-25", days: 31, summary: {} as any, lines: [line({ sold: 186, counted: 200 })] };

describe("Orders start from a newer real count when there is one", () => {
  it("audit start: 200 counted on 25 Sept, 6 a day, 46 days on → out", () => {
    const r = orderList([audit], { basis: { kind: "latest" }, busyPct: 0, coverDays: 10, sinceDays: 46 });
    expect(r.rows[0].now).toBeLessThanOrEqual(0);
    expect(r.rows[0].group).toBe("out");
  });
  it("newer count of 90 two days ago → about 78 now, enough for 10 days, nothing to order", () => {
    const r = orderList([audit], { basis: { kind: "latest" }, busyPct: 0, coverDays: 10, sinceDays: 46 },
      { startFor: () => ({ counted: 90, sinceDays: 2, deliveredOn: [] }) });
    expect(r.rows.length).toBe(0);
    expect(Math.round(r.covered[0].now)).toBe(78);
  });
  it("ml ⇄ audit base round-trips", () => {
    const p = { id: "x", name: "J2O 275ml", counting_method: "each", size_ml: 275 };
    expect(mlToAuditBase(90 * 275, "units", p)).toBe(90);
    expect(mlToAuditBase(auditRateToMl(3.5, "pints", { id: "k", name: "Carlsberg", category: "draught_lager" }), "pints", { id: "k", name: "Carlsberg", category: "draught_lager" })).toBeCloseTo(3.5);
  });
});

import { packFor } from "./stock-orders";
describe("Orders page orders packaged lines in their case size", () => {
  const l = { name: "Soft J2O Apple & Mango 275ml", base: "units" as const, unit: "Each", category: "Minerals" };
  it("case of 24 when set, single units when not", () => {
    expect(packFor(l, { id: "j", name: l.name, counting_method: "each", size_ml: 275, pack_size: 24 })).toEqual({ size: 24, one: "case of 24", many: "cases of 24" });
    expect(packFor(l, { id: "j", name: l.name, counting_method: "each", size_ml: 275, pack_size: 1 }).many).toBe("units");
    expect(packFor(l, null).many).toBe("units");
  });
});

describe("Orders use the pub's own sales speed when the Library does", () => {
  it("rateFor replaces the audit speed for running down and for ordering", () => {
    // audit says 6 a day; own counts say 2 a day. 90 counted 2 days ago → 86 now; 10 days needs 20.
    const r = orderList([audit], { basis: { kind: "latest" }, busyPct: 0, coverDays: 10, sinceDays: 46 },
      { startFor: () => ({ counted: 90, sinceDays: 2, deliveredOn: [] }), rateFor: () => ({ recent: 2, rate: 2 }) });
    expect(r.rows.length).toBe(0);
    expect(Math.round(r.covered[0].now)).toBe(86);
    expect(Math.round(r.covered[0].daysLeft)).toBe(43);
  });
});

describe("Orders leave out what the pub has hidden, and never assume a case of 12", () => {
  it("a hidden line is on no list, however well it sold on the last audit", () => {
    const r = orderList([audit], { basis: { kind: "latest" }, busyPct: 0, coverDays: 10, sinceDays: 46 }, { skip: () => true });
    expect(r.rows.length + r.covered.length + r.slow.length).toBe(0);
  });
  it("a bottle line the audit calls 'Dozen': the pub's case size if set, single units if not", () => {
    const l = { name: "PPS WKD Blue 275ml", base: "units" as const, unit: "Dozen", category: "Packaged" };
    expect(packFor(l, { id: "w", name: l.name, counting_method: "each", size_ml: 275, pack_size: 24 }).one).toBe("case of 24");
    expect(packFor(l, { id: "w", name: l.name, counting_method: "each", size_ml: 275, pack_size: null }).many).toBe("units");
    expect(packFor(l, { id: "w", name: l.name, counting_method: "dozen", size_ml: 275, pack_size: null }).one).toBe("case of 12");
    expect(packFor(l, null).one).toBe("case of 12");
  });
});
