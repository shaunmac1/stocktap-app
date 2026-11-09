import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseVennersAudit, type PdfTextItem } from "./venners-audit";
import { buildPatterns, orderList, periodTag, packFor, lineKey, matchAuditLine, deliveredBase, formatBase, offsettingPairs, stockNow, type StoredAudit } from "./stock-orders";

const FIX = path.resolve(__dirname, "../../e2e/fixtures/venners");
const NAMES = ["WM7620260116", "WM7620260225", "WM7620260514", "WM7620260619", "WM7620260721", "WM7620260925"];
const audits: StoredAudit[] = NAMES.map(n => {
  const a = parseVennersAudit(JSON.parse(fs.readFileSync(path.join(FIX, `${n}.json`), "utf8")) as PdfTextItem[]);
  return { id: n, period_start: a.summary.periodStart!, period_end: a.summary.periodEnd!, days: a.summary.days!, summary: a.summary, lines: a.lines };
});
const pm = (name: string, yieldL: number) => ({ id: name, name, category: "postmix", counting_method: "litre", container_l: 12, pack_size: yieldL });
const PRODUCTS: Record<string, ReturnType<typeof pm>> = {
  [lineKey("Postmix Pepsi")]: pm("Postmix Pepsi", 72),
  [lineKey("Postmix Pepsi Max")]: pm("Postmix Pepsi Max", 84),
  [lineKey("Postmix Pepsi Diet")]: pm("Postmix Pepsi Diet", 84),
  [lineKey("Postmix Lemonade")]: pm("Postmix Lemonade", 84),
};

describe("patterns across the year", () => {
  const { order, lines } = buildPatterns(audits);
  it("orders the audits and names Christmas", () => {
    expect(order.map(a => a.period_end)).toEqual(["2026-01-16", "2026-02-25", "2026-05-14", "2026-06-19", "2026-07-21", "2026-09-25"]);
    expect(periodTag(order[0])).toBe("Christmas");
    expect(periodTag(order[5])).toBeNull();
  });
  it("has a sales rate per period for a line that's always stocked", () => {
    const p = lines.get(lineKey("Postmix Pepsi Max"))!;
    expect(p.rates.filter(r => r != null)).toHaveLength(6);
    expect(p.rates[5]).toBeCloseTo(873.706 / 66, 6);
  });
});

describe("postmix orders", () => {
  it("come out around 2 boxes a week in total, not 11", () => {
    const { order, lines } = buildPatterns(audits);
    const latestIdx = order.length - 1;
    let boxesPerWeek = 0;
    for (const [key, p] of Object.entries(PRODUCTS)) boxesPerWeek += ((lines.get(key)?.rates[latestIdx] ?? 0) * 7) / p.pack_size;
    expect(boxesPerWeek).toBeGreaterThan(1.5);
    expect(boxesPerWeek).toBeLessThan(2.5);
  });
  it("the order after the 28 Sep delivery is a handful of boxes", () => {
    const delivered = new Map<string, number>([
      [lineKey("Postmix Pepsi Max"), 2 * 84], [lineKey("Postmix Lemonade"), 2 * 84], [lineKey("Postmix Pepsi"), 1 * 72],
    ]);
    const { rows } = orderList(audits, { basis: { kind: "latest" }, busyPct: 0, coverDays: 10, sinceDays: 3 }, { delivered, productFor: k => PRODUCTS[k] ?? null });
    const postmix = rows.filter(r => r.category === "Postmix");
    const boxes = postmix.reduce((s, r) => s + r.suggested, 0);
    expect(boxes).toBeLessThanOrEqual(3);
    for (const r of postmix) expect(r.pack.one).toBe("box");
  });
});

describe("the order list", () => {
  const base = { basis: { kind: "latest" as const }, busyPct: 0, coverDays: 10, sinceDays: 3 };
  it("busier settings ask for more, never less", () => {
    const a = orderList(audits, base).rows;
    const b = orderList(audits, { ...base, busyPct: 25 }).rows;
    const sum = (rs: typeof a) => rs.reduce((s, r) => s + r.suggested, 0);
    expect(sum(b)).toBeGreaterThanOrEqual(sum(a));
    const c = orderList(audits, { ...base, basis: { kind: "busiest" } }).rows;
    expect(sum(c)).toBeGreaterThanOrEqual(sum(a));
  });
  it("uses a chosen period (Christmas)", () => {
    const xmas = orderList(audits, { ...base, basis: { kind: "period", auditId: "WM7620260116" } }).rows;
    expect(xmas.length).toBeGreaterThan(0);
  });
  it("never loses a selling line (his Pinots after the 28 Sep delivery)", () => {
    const deliveredOn = new Map([[lineKey("Wine Pinot Blush Arietta 75cl"), [{ day: 3, qty: 12 }]], [lineKey("Wine Pinot G. Colverde 75cl"), [{ day: 3, qty: 12 }]]]);
    const latest = audits[audits.length - 1];
    for (const coverDays of [3, 7, 10, 14, 21]) for (const sinceDays of [0, 3, 5, 9]) {
      const r = orderList(audits, { ...base, coverDays, sinceDays }, { deliveredOn });
      const shown = new Set([...r.rows, ...r.covered, ...r.slow].map(x => x.key));
      for (const l of latest.lines) if (!l.delist && r.order.length && l.sold > 0) expect(shown.has(lineKey(l.name)), `${l.name} cover ${coverDays} since ${sinceDays}`).toBe(true);
    }
    // Blush ran out on the count; the 12 in on day 3 lose only two days' sales by day 5
    const r = orderList(audits, { ...base, sinceDays: 5 }, { deliveredOn });
    const blush = r.rows.find(x => /Blush/.test(x.name))!;
    expect(blush.now).toBeGreaterThan(8); expect(blush.now).toBeLessThan(9);
  });
  it("leaves delisted lines out", () => {
    expect(orderList(audits, base).rows.some(r => /DELIST/.test(r.name))).toBe(false);
  });
  it("kegs order in kegs of the right size", () => {
    expect(packFor({ name: "Lager Cruzcampo 50L Keg", base: "pints", unit: "Gallon 8 Pint", category: "Draught lager" })).toMatchObject({ one: "keg" });
    expect(packFor({ name: "Lager Cruzcampo 50L Keg", base: "pints", unit: "Gallon 8 Pint", category: "Draught lager" }).size).toBeCloseTo(87.99, 1);
    expect(packFor({ name: "Ale Hobgoblin Gold 9G Cask", base: "pints", unit: "Gallon 8 Pint", category: "Draught ale" })).toMatchObject({ size: 72, one: "cask" });
    expect(packFor({ name: "Cider Old Mout FlavourWave 30L Keg", base: "pints", unit: "Gallon 8 Pint", category: "Draught cider" }).size).toBeCloseTo(52.79, 1);
  });
});

describe("helpers", () => {
  it("matches audit lines to library names", () => {
    const lib = [
      { id: "1", name: "Stout Guinness", category: "draught_stout", counting_method: "keg_weight" },
      { id: "2", name: "PPA Guinness 0% 538ml Can", category: "packaged", counting_method: "each", size_ml: 538 },
      { id: "3", name: "Postmix Pepsi Max", category: "postmix", counting_method: "litre" },
      { id: "4", name: "Postmix Pepsi", category: "postmix", counting_method: "litre" },
      { id: "5", name: "Gin Gordons", category: "spirits", counting_method: "tenths", size_ml: 700 },
    ];
    expect(matchAuditLine({ name: "Stout Guinness", base: "pints", category: "Draught stout" }, lib)?.id).toBe("1");
    expect(matchAuditLine({ name: "PPA Guinness 0% 538ml Can", base: "units", category: "Packaged" }, lib)?.id).toBe("2");
    expect(matchAuditLine({ name: "Postmix Pepsi Max", base: "litres", category: "Postmix" }, lib)?.id).toBe("3");
    expect(matchAuditLine({ name: "Postmix Pepsi", base: "litres", category: "Postmix" }, lib)?.id).toBe("4");
    expect(matchAuditLine({ name: "Gin Gordons", base: "bottles", category: "Spirits" }, lib)?.id).toBe("5");
  });
  it("converts deliveries into each line's unit", () => {
    const keg = { id: "k", name: "k", category: "draught_lager", counting_method: "keg_weight", container_l: 50 };
    expect(deliveredBase({ product_id: "k", quantity: 4, quantity_ml: 200000, delivered_at: "" }, "pints", keg)).toBeCloseTo(351.95, 1);
    expect(deliveredBase({ product_id: "p", quantity: 2, quantity_ml: 24000, delivered_at: "" }, "litres", pm("x", 84))).toBe(168);
    expect(deliveredBase({ product_id: "c", quantity: 1, quantity_ml: 12000, delivered_at: "" }, "units", { id: "c", name: "c", counting_method: "dozen", size_ml: 1000 })).toBe(12);
  });
  it("formats amounts", () => {
    expect(formatBase(89.747, "pints")).toBe("11 gal 1.7 pt");
    expect(formatBase(-35.451, "litres", true)).toBe("−35.5 L");
  });
  it("spots the lemonade / Max pattern", () => {
    const sep = audits[5];
    const pairs = offsettingPairs(sep.lines);
    const lemon = pairs.find(p => p.down.name === "Postmix Lemonade");
    expect(lemon?.ups.map(u => u.name)).toEqual(["Postmix Pepsi Max", "Postmix Pepsi Diet"]);
  });
});

describe("stock now and lines with enough in", () => {
  it("can't sell from empty before a delivery", () => {
    // counted 0, sells 2 a day, 12 came in on day 3, now day 5: out for 3 days, then 12 − 4 = 8
    expect(stockNow(0, 2, 5, [{ day: 3, qty: 12 }])).toBeCloseTo(8);
    // counted 10, sells 2 a day, nothing in: 10 − 10 = 0
    expect(stockNow(10, 2, 5, [])).toBeCloseTo(0);
    // counted 3, delivery day 1: 3 − 2 + 12 − 8 = 5
    expect(stockNow(3, 2, 5, [{ day: 1, qty: 12 }])).toBeCloseTo(5);
  });

  it("keeps every selling line: on the list, or under enough in", () => {
    const mk = (id: string, end: string, lines: any[]) => ({ id, period_start: "", period_end: end, days: 30, summary: {} as any, lines });
    const L = (name: string, sold: number, counted: number) => ({ name, category: "Wines", unit: "", base: "bottles", open: 0, del: 0, ret: 0, tin: 0, tout: 0, adj: 0, waste: 0, sold, expected: counted, counted, variance: 0, retail: 0, delist: false });
    const audits = [mk("a", "2026-09-25", [L("Wine Pinot Blush 75cl", 60, 0), L("Wine Pinot G. Colverde 75cl", 60, 40)])] as any;
    const r = orderList(audits, { basis: { kind: "latest" }, busyPct: 0, coverDays: 7, sinceDays: 3 });
    const names = [...r.rows.map(x => x.name), ...r.covered.map(x => x.name)];
    expect(names).toContain("Wine Pinot Blush 75cl");
    expect(names).toContain("Wine Pinot G. Colverde 75cl");
    expect(r.covered.map(x => x.name)).toEqual(["Wine Pinot G. Colverde 75cl"]);
  });
});
