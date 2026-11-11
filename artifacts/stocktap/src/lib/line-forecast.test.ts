import { describe, it, expect } from "vitest";
import { forecastLine, countRate, orderPack, auditRateToMl, weekAmount, sellsText, isWholeLineCount, type ForecastProduct } from "./line-forecast";
import { ML_PER_PINT } from "./stock-orders";

const DAY = 864e5;
const NOW = Date.parse("2026-11-10T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

const j2o: ForecastProduct = { id: "j2o", name: "Soft J2O Apple & Mango 275ml", category: "minerals", counting_method: "each", unit: "count", size_ml: 275, pack_size: 24 };
const carls: ForecastProduct = { id: "carls", name: "Carlsberg 3.4%", category: "draught_lager", counting_method: "keg_weight", container_l: 50, container_type: "keg" };
const gin: ForecastProduct = { id: "gin", name: "Gin Gordons 70cl", category: "spirits", counting_method: "tenths", unit: "weigh", size_ml: 700 };
const crisps: ForecastProduct = { id: "crisps", name: "Crisps McCoys Salted 45g", category: "packaged", counting_method: "each", unit: "count", size_ml: null, pack_size: 1 };

describe("what each line is ordered in", () => {
  it("cases, kegs, bottles, bags", () => {
    expect(orderPack(j2o)).toEqual({ ml: 24 * 275, one: "case of 24", many: "cases of 24" });
    expect(orderPack(carls).many).toBe("kegs");
    expect(orderPack(gin)).toEqual({ ml: 700, one: "bottle", many: "bottles" });
    expect(orderPack(crisps)).toEqual({ ml: 1, one: "bag", many: "bags" });
    expect(orderPack({ ...j2o, pack_size: null }).many).toBe("bottles");
  });
});

describe("sales speed from your own counts", () => {
  it("earlier count + deliveries − later count, over the days between", () => {
    const h = [{ product_id: "j2o", ml_remaining: 100 * 275, reading_at: ago(14) }, { product_id: "j2o", ml_remaining: 60 * 275, reading_at: ago(0) }];
    const d = [{ product_id: "j2o", delivered_at: ago(7), quantity_ml: 48 * 275 }];
    const r = countRate(h, d, 7)!;
    expect(Math.round(r.rate / 275)).toBe(6); // (100 + 48 − 60) / 14 = 6.3 a day
    expect(r.days).toBe(14);
  });
  it("ignores deliveries outside the window and needs the gap", () => {
    const h = [{ product_id: "j2o", ml_remaining: 100, reading_at: ago(2) }, { product_id: "j2o", ml_remaining: 80, reading_at: ago(0) }];
    expect(countRate(h, [], 7)).toBeNull();
    expect(countRate(h, [], 2)!.rate).toBe(10);
  });
  it("won't invent a speed when stock went up with no delivery", () => {
    const h = [{ product_id: "j2o", ml_remaining: 50, reading_at: ago(10) }, { product_id: "j2o", ml_remaining: 80, reading_at: ago(0) }];
    expect(countRate(h, [], 7)).toBeNull();
  });
});

describe("days left and the order, on every line", () => {
  it("J2O: 90 counted 3 days ago, sells 6 a day, cover 10 days → about 12 days, nothing to order", () => {
    const f = forecastLine({ product: j2o, history: [{ product_id: "j2o", ml_remaining: 90 * 275, reading_at: ago(3) }], deliveries: [], auditRateMl: 6 * 275, coverDays: 10, now: NOW });
    expect(Math.round(f.nowMl / 275)).toBe(72);
    expect(f.status).toBe("ok");
    expect(f.label).toBe("Lasts 12 days · no order needed");
    expect(f.detail).toBe("Sells about 42 bottles a week (from your stock audits)");
  });
  it("orders whole cases: needs 6×14 − 30 = 54 bottles → 3 cases of 24", () => {
    const f = forecastLine({ product: j2o, history: [{ product_id: "j2o", ml_remaining: 30 * 275, reading_at: ago(0) }], deliveries: [], auditRateMl: 6 * 275, coverDays: 14, now: NOW });
    expect(f.orderQty).toBe(3);
    expect(f.status).toBe("low");
    expect(f.label).toBe("Lasts 5 days · order 3 cases of 24");
  });
  it("a delivery since the count is added", () => {
    const f = forecastLine({ product: j2o, history: [{ product_id: "j2o", ml_remaining: 10 * 275, reading_at: ago(4) }], deliveries: [{ product_id: "j2o", delivered_at: ago(2), quantity_ml: 48 * 275 }], auditRateMl: 5 * 275, coverDays: 7, now: NOW });
    // 10 − 2 days × 5 = 0, then +48, then − 2 days × 5 = 38
    expect(Math.round(f.nowMl / 275)).toBe(38);
  });
  it("can't sell what isn't there: stock never goes below nothing before a delivery", () => {
    const f = forecastLine({ product: j2o, history: [{ product_id: "j2o", ml_remaining: 2 * 275, reading_at: ago(10) }], deliveries: [{ product_id: "j2o", delivered_at: ago(1), quantity_ml: 24 * 275 }], auditRateMl: 6 * 275, coverDays: 7, now: NOW });
    expect(Math.round(f.nowMl / 275)).toBe(18);
  });
  it("own counts beat the audit once there's a week of them", () => {
    const h = [{ product_id: "j2o", ml_remaining: 100 * 275, reading_at: ago(7) }, { product_id: "j2o", ml_remaining: 79 * 275, reading_at: ago(0) }];
    const f = forecastLine({ product: j2o, history: h, deliveries: [], auditRateMl: 20 * 275, coverDays: 7, now: NOW });
    expect(f.source).toBe("counts");
    expect(Math.round(f.rate / 275)).toBe(3);
  });
  it("draught: 2 kegs left, 250 pints a week → order kegs", () => {
    const f = forecastLine({ product: carls, history: [{ product_id: "carls", ml_remaining: 100_000, reading_at: ago(0) }], deliveries: [], auditRateMl: (250 / 7) * ML_PER_PINT, coverDays: 10, now: NOW });
    expect(f.detail.startsWith("Sells about 250 pints a week")).toBe(true);
    // need 357 pints ≈ 202.9L − 100L = 102.9L → 3 × 50L kegs
    expect(f.orderQty).toBe(3);
    expect(f.label).toMatch(/order 3 kegs$/);
  });
  it("out: counted at nothing and nothing delivered", () => {
    const f = forecastLine({ product: gin, history: [{ product_id: "gin", ml_remaining: 0, reading_at: ago(1) }], deliveries: [], auditRateMl: 100, coverDays: 7, now: NOW });
    expect(f.status).toBe("out");
    expect(f.label).toBe("Out · order 1 bottle");
  });
  it("due: was in stock at the count, the sums say it has gone — said as an estimate, never 'out'", () => {
    // Real Teal Farm case: 8.9 bottles of Pinot counted 6 days ago, sells 11.8 a week.
    const wine = { ...gin, id: "wine", name: "Wine Pinot G. Colverde 75cl", category: "wine", size_ml: 750 };
    const f = forecastLine({ product: wine, history: [{ product_id: "wine", ml_remaining: 8.9 * 750, reading_at: ago(6) }], deliveries: [], auditRateMl: (11.8 / 7) * 750, coverDays: 10, now: NOW });
    expect(f.status).toBe("due");
    expect(f.label).toBe("Due to run out about now · order 17 bottles");
  });
  it("slow sellers never read '0 a week'", () => {
    expect(sellsText(gin, 700 / 63)).toBe("Sells about 1 bottle every 9 weeks");
    expect(sellsText(gin, 700 / 7)).toBe("Sells about 1 bottle a week");
    expect(sellsText(gin, 700 / 800)).toBe("Sells less than 1 bottle a year");
    expect(sellsText(j2o, 6 * 275)).toBe("Sells about 42 bottles a week");
    expect(sellsText(carls, 20 * ML_PER_PINT)).toBe("Sells about 140 pints a week");
    const f = forecastLine({ product: gin, history: [{ product_id: "gin", ml_remaining: 0, reading_at: ago(1) }], deliveries: [], auditRateMl: 700 / 63, coverDays: 10, now: NOW });
    expect(f.detail).toBe("Sells about 1 bottle every 9 weeks (from your stock audits)");
  });
  it("out + sells under a pack a month: shown as out, kept off the order list (same rule as the Orders page)", () => {
    const f = forecastLine({ product: gin, history: [{ product_id: "gin", ml_remaining: 0, reading_at: ago(1) }], deliveries: [], auditRateMl: 700 / 63, coverDays: 10, now: NOW });
    expect(f.status).toBe("out");
    expect(f.orderQty).toBe(0);
    expect(f.label).toBe("Out · slow seller, order only if you want it back");
  });
  it("'how busy' uplift orders for more but doesn't pretend the past week was busier", () => {
    const base = { product: j2o, history: [{ product_id: "j2o", ml_remaining: 100 * 275, reading_at: ago(5) }], deliveries: [], coverDays: 10, now: NOW };
    const normal = forecastLine({ ...base, auditRateMl: 6 * 275, auditRecentMl: 6 * 275, busyPct: 0 });
    const xmas = forecastLine({ ...base, auditRateMl: 9 * 275, auditRecentMl: 6 * 275, busyPct: 50 });
    expect(Math.round(normal.nowMl / 275)).toBe(70);
    expect(Math.round(xmas.nowMl / 275)).toBe(70);          // same stock now
    expect(normal.orderQty).toBe(0);                          // 70 ≥ 60
    expect(xmas.orderQty).toBe(1);                            // 70 < 90 → 1 case of 24
    // own counts get the uplift too
    const h = [{ product_id: "j2o", ml_remaining: 142 * 275, reading_at: ago(7) }, { product_id: "j2o", ml_remaining: 100 * 275, reading_at: ago(0) }];
    const own = forecastLine({ product: j2o, history: h, deliveries: [], auditRateMl: null, busyPct: 50, coverDays: 10, now: NOW });
    expect(Math.round(own.runRate / 275)).toBe(6);
    expect(Math.round(own.rate / 275)).toBe(9);
  });
  it("dead stock: on the audit, none sold, still on the shelf → don't reorder (not 'no data')", () => {
    const f = forecastLine({ product: gin, history: [{ product_id: "gin", ml_remaining: 1400, reading_at: ago(6) }], deliveries: [], auditRateMl: 0, auditSpan: "your last stock audit (66 days)", coverDays: 10, now: NOW });
    expect(f.status).toBe("dead");
    expect(f.label).toBe("None sold in your last stock audit (66 days) · don't reorder");
    expect(f.orderQty).toBe(0);
    const none = forecastLine({ product: gin, history: [{ product_id: "gin", ml_remaining: 0, reading_at: ago(6) }], deliveries: [], auditRateMl: 0, auditSpan: "your last stock audit (66 days)", coverDays: 10, now: NOW });
    expect(none.status).toBe("unknown");
    expect(none.detail).toBe("None sold in your last stock audit (66 days)");
  });
  it("one open bottle weighed from the Library is NOT the whole line", () => {
    const h = [
      { product_id: "gin", ml_remaining: 3 * 700, reading_at: ago(5), stocktake_id: "st1", method: "tenths" },
      { product_id: "gin", ml_remaining: 0.4 * 700, reading_at: ago(1), stocktake_id: null, method: "weigh", full_containers: null, part_value: null },
    ];
    const f = forecastLine({ product: gin, history: h, deliveries: [], auditRateMl: 10, coverDays: 7, now: NOW });
    expect(Math.round(f.nowMl)).toBe(3 * 700 - 50);
    expect(f.countedAt).toBe(h[0].reading_at);
    expect(isWholeLineCount(h[1])).toBe(false);
    // a spot check (full bottles + open one) IS the whole line
    expect(isWholeLineCount({ product_id: "gin", ml_remaining: 900, reading_at: ago(1), stocktake_id: null, method: "weigh", full_containers: 1, part_value: 480 })).toBe(true);
    expect(isWholeLineCount({ product_id: "gin", ml_remaining: 200, reading_at: ago(1), stocktake_id: null, method: "weigh", full_containers: null, part_value: 480 })).toBe(true);
  });
  it("a delivery logged as a reading is never read as 'counted none'", () => {
    const h = [
      { product_id: "gin", ml_remaining: 2 * 700, reading_at: ago(5), stocktake_id: "st1", method: "tenths" },
      { product_id: "gin", ml_remaining: 0, reading_at: ago(1), is_delivery: true, method: "weigh", full_containers: 6 },
    ];
    const f = forecastLine({ product: gin, history: h, deliveries: [], auditRateMl: 10, coverDays: 7, now: NOW });
    expect(f.status).not.toBe("out");
    expect(Math.round(f.nowMl)).toBe(1400 - 50);
  });
  it("never guesses: no speed means no order figure", () => {
    const f = forecastLine({ product: crisps, history: [{ product_id: "crisps", ml_remaining: 31, reading_at: ago(1) }], deliveries: [], auditRateMl: null, coverDays: 7, now: NOW });
    expect(f.status).toBe("unknown");
    expect(f.label).toBe("No sales speed yet");
    expect(f.orderQty).toBe(0);
  });
  it("not counted yet", () => {
    expect(forecastLine({ product: gin, history: [], deliveries: [], auditRateMl: 50, coverDays: 7, now: NOW }).label).toBe("Not counted yet");
  });
});

describe("units", () => {
  it("audit base units → ml", () => {
    expect(auditRateToMl(2, "units", j2o)).toBe(550);
    expect(auditRateToMl(8, "pints", carls)).toBeCloseTo(8 * ML_PER_PINT);
    expect(auditRateToMl(0.5, "bottles", gin)).toBe(350);
    expect(auditRateToMl(3, "litres", { id: "pm", name: "Pepsi postmix", category: "postmix", counting_method: "litre" })).toBe(3000);
  });
  it("a week in words", () => {
    expect(weekAmount(crisps, 4)).toBe("28 bags");
    expect(weekAmount(gin, 50)).toBe("0.5 bottles");
  });
});
