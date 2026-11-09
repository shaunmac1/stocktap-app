import { describe, it, expect } from "vitest";
import { buildCountAudits, baseFor, readingBase } from "./count-audits";
import { orderList, lineKey, ML_PER_PINT } from "./stock-orders";

const P = {
  gin: { id: "g", name: "Gordon's Gin 70cl", category: "spirits", counting_method: "weigh", size_ml: 700, cost_price: 14 },
  lager: { id: "l", name: "Carling 11G Keg", category: "draught_lager", counting_method: "keg_weight", container_l: 50, cost_price: 150 },
  cans: { id: "c", name: "Coke 330ml", category: "minerals", counting_method: "dozen", pack_size: 24, size_ml: 330, cost_price: 12 },
  pepsi: { id: "p", name: "Postmix Pepsi", category: "postmix", counting_method: "litre", container_l: 12, pack_size: 72, cost_price: 52 },
};
const products = Object.values(P) as any[];
const st = (id: string, closed: string) => ({ id, status: "closed", closed_at: closed });

describe("order list from StockTap's own stocktakes", () => {
  it("picks the right unit for each kind of line", () => {
    expect(baseFor(P.gin as any)).toBe("bottles");
    expect(baseFor(P.lager as any)).toBe("pints");
    expect(baseFor(P.cans as any)).toBe("units");
    expect(baseFor(P.pepsi as any)).toBe("litres");
    expect(readingBase(P.cans as any, { stocktake_id: "a", product_id: "c", ml_remaining: 0, count: 30 })).toBe(30);
    expect(readingBase(P.lager as any, { stocktake_id: "a", product_id: "l", ml_remaining: ML_PER_PINT * 88, count: 0 })).toBeCloseTo(88);
  });

  it("works out sold = opening + delivered − closing between two counts", () => {
    const stocktakes = [st("a", "2026-09-01T22:00:00Z"), st("b", "2026-09-08T22:00:00Z"), { id: "o", status: "open", closed_at: null }];
    const readings = [
      { stocktake_id: "a", product_id: "g", ml_remaining: 2100, count: 0 },   // 3 bottles
      { stocktake_id: "b", product_id: "g", ml_remaining: 700, count: 0 },    // 1 bottle
      { stocktake_id: "a", product_id: "l", ml_remaining: ML_PER_PINT * 100, count: 0 },
      { stocktake_id: "b", product_id: "l", ml_remaining: ML_PER_PINT * 40, count: 0 },
      { stocktake_id: "a", product_id: "c", ml_remaining: 0, count: 24 },
      { stocktake_id: "b", product_id: "c", ml_remaining: 0, count: 10 },
      { stocktake_id: "b", product_id: "p", ml_remaining: 60000, count: 0 },  // only in the second count: skipped
    ];
    const deliveries = [
      { product_id: "g", delivered_at: "2026-09-04T09:00:00Z", quantity: 2, quantity_ml: 1400 },
      { product_id: "l", delivered_at: "2026-09-05T09:00:00Z", quantity: 1, quantity_ml: 50000 },
      { product_id: "c", delivered_at: "2026-09-05T09:00:00Z", quantity: 1, quantity_ml: null },
      { product_id: "g", delivered_at: "2026-09-10T09:00:00Z", quantity: 1, quantity_ml: 700 }, // after: not in this period
    ];
    const [a] = buildCountAudits(stocktakes, readings, deliveries, products);
    expect(a.period_start).toBe("2026-09-01"); expect(a.period_end).toBe("2026-09-08"); expect(Math.round(a.days)).toBe(7);
    const line = (n: string) => a.lines.find(l => l.name === n)!;
    expect(line("Gordon's Gin 70cl").sold).toBeCloseTo(3 + 2 - 1);
    expect(line("Carling 11G Keg").sold).toBeCloseTo(100 + 50000 / ML_PER_PINT - 40);
    expect(line("Coke 330ml").sold).toBe(24 + 24 - 10);
    expect(a.lines.find(l => l.name === "Postmix Pepsi")).toBeUndefined();
    expect(a.lines.every(l => l.variance === 0 && l.retail === 0)).toBe(true);

    // and the order list runs on it
    const r = orderList([a], { basis: { kind: "latest" }, busyPct: 0, coverDays: 14, sinceDays: 0 }, { productFor: k => products.find(p => lineKey(p.name) === k) ?? null });
    const gin = r.rows.find(x => x.name === "Gordon's Gin 70cl")!;
    expect(gin.rate).toBeCloseTo(4 / 7);
    expect(gin.suggested).toBe(Math.ceil(4 / 7 * 14 - 1));  // 8 − 1 on the shelf = 7 bottles
    const cans = r.rows.find(x => x.name === "Coke 330ml")!;
    expect(cans.pack.size).toBe(24); // cases of the size in the library
  });

  it("needs two closed stocktakes", () => {
    expect(buildCountAudits([st("a", "2026-09-01T22:00:00Z")], [], [], products)).toEqual([]);
  });

  it("negative usage (miscount) is treated as nothing sold", () => {
    const [a] = buildCountAudits([st("a", "2026-09-01T00:00:00Z"), st("b", "2026-09-03T00:00:00Z")],
      [{ stocktake_id: "a", product_id: "g", ml_remaining: 350, count: 0 }, { stocktake_id: "b", product_id: "g", ml_remaining: 700, count: 0 }], [], products);
    expect(a.lines[0].sold).toBe(0);
  });
});
