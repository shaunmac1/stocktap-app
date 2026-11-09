import { describe, expect, it } from "vitest";
import {
  basePerPurchaseUnit, buildTillVariance, costPerBase, DEFAULT_TOLERANCE, describeAmount, soldUnitInBase, toleranceFor,
  varianceTotals, type VarianceInput, type VarianceProduct,
} from "./till-variance";
import { calcVariance } from "./calculations";
import { costPerSoldUnit } from "./inventory-reporting";

const PINT = 568.26125;
const A = { id: "st-a", closed_at: "2026-11-01T09:00:00.000Z" };
const B = { id: "st-b", closed_at: "2026-11-08T09:00:00.000Z" };

const P: Record<string, VarianceProduct> = {
  carling: { id: "carling", name: "Carling 11G", category: "draught_lager", counting_method: "keg_weight", unit: "count", type: "packaged", container_l: 50, cost_price: 165, pour_price: 4.9 },
  guinness: { id: "guinness", name: "Guinness 11G", category: "draught_stout", counting_method: "keg_weight", unit: "count", type: "packaged", container_l: 50, cost_price: 190, pour_price: 5.8 },
  gordons: { id: "gordons", name: "Gordon's Gin 70cl", category: "spirits", counting_method: "weigh", unit: "weigh", type: "gin", size_ml: 700, cost_price: 14, pour_price: 3.5 },
  crisps: { id: "crisps", name: "Crisps C&O", category: "packaged", counting_method: "each", unit: "count", type: "packaged", cost_price: 0.5, pour_price: 1.5 },
  wine: { id: "wine", name: "House White 75cl", category: "wines", counting_method: "tenths", unit: "weigh", type: "wine", size_ml: 750, cost_price: 6.5, pour_price: 5.5 },
  pmax: { id: "pmax", name: "Postmix Pepsi Max", category: "postmix", counting_method: "litre", unit: "count", type: "packaged", container_l: 12, pack_size: 84, cost_price: 52, pour_price: 3 },
  j2o: { id: "j2o", name: "J2O 275ml", category: "minerals", counting_method: "dozen", unit: "count", type: "packaged", size_ml: 275, pack_size: 24, cost_price: 18, pour_price: 2.8 },
};

function input(over: Partial<VarianceInput> = {}): VarianceInput {
  return {
    products: Object.values(P),
    opening: A, closing: B,
    readings: [
      { stocktake_id: A.id, product_id: "carling", ml_remaining: 150 * PINT, count: null },
      { stocktake_id: B.id, product_id: "carling", ml_remaining: 30 * PINT, count: null },
      { stocktake_id: A.id, product_id: "guinness", ml_remaining: 120 * PINT, count: null },
      { stocktake_id: B.id, product_id: "guinness", ml_remaining: 25 * PINT, count: null },
      // Gordon's counted in two places at the close: they add up
      { stocktake_id: A.id, product_id: "gordons", ml_remaining: 2800, count: null },
      { stocktake_id: B.id, product_id: "gordons", ml_remaining: 200, count: null },
      { stocktake_id: B.id, product_id: "gordons", ml_remaining: 150, count: null },
      { stocktake_id: A.id, product_id: "crisps", ml_remaining: 0, count: 40 },
      { stocktake_id: B.id, product_id: "crisps", ml_remaining: 0, count: 6 },
      { stocktake_id: "other", product_id: "crisps", ml_remaining: 0, count: 999 },
    ],
    deliveries: [
      { product_id: "carling", delivered_at: "2026-11-04T07:00:00Z", quantity: 1, quantity_ml: 50000 },
      { product_id: "gordons", delivered_at: "2026-11-05T07:00:00Z", quantity: 2, quantity_ml: 1400 },
      { product_id: "carling", delivered_at: "2026-10-30T07:00:00Z", quantity: 1, quantity_ml: 50000 }, // before the period
    ],
    wastage: [
      { product_id: "guinness", quantity_ml: 5 * PINT, moved_at: "2026-11-03T22:00:00Z", movement_type: "wastage" },
      { product_id: "guinness", quantity_ml: 50000, moved_at: "2026-11-03T22:00:00Z", movement_type: "delivery" }, // not wastage
    ],
    sales: [
      { product_id: "carling", quantity_sold: 171.5, revenue_pence: 84035 },
      { product_id: "carling", quantity_sold: 28.5, revenue_pence: 13965 }, // halves, already in pints
      { product_id: "guinness", quantity_sold: 90, revenue_pence: null },
      { product_id: "gordons", quantity_sold: 150, revenue_pence: null },
      { product_id: "crisps", quantity_sold: 40, revenue_pence: 6000 },
      { product_id: "wine", quantity_sold: 64, revenue_pence: 35200 },
      { product_id: null, quantity_sold: 31, revenue_pence: 3100 }, // pool table, unmatched
    ],
    defaultMeasureMl: 25,
    ...over,
  };
}

describe("unit conversions agree with the rest of the app", () => {
  it("cost of one sold unit = cost per base × base per sold unit", () => {
    for (const p of Object.values(P)) {
      expect(costPerBase(p)! * soldUnitInBase(p, 25)).toBeCloseTo(costPerSoldUnit(p, 25)!, 6);
    }
  });
  it("base units per purchase unit", () => {
    expect(basePerPurchaseUnit(P.carling)).toBeCloseTo(50000 / 568.261, 3);
    expect(basePerPurchaseUnit(P.pmax)).toBe(84);
    expect(basePerPurchaseUnit(P.j2o)).toBe(24);
    expect(basePerPurchaseUnit(P.gordons)).toBe(1);
    expect(costPerBase({ ...P.carling, container_l: null })).toBeNull();
  });
});

describe("buildTillVariance", () => {
  const rows = buildTillVariance(input());
  const by = (id: string) => rows.find(r => r.productId === id)!;

  it("draught: counts + deliveries vs till, flagged as a loss over tolerance", () => {
    const r = by("carling");
    expect(r.base).toBe("pints");
    expect(r.opening).toBeCloseTo(150, 3);
    expect(r.deliveries).toBeCloseTo(87.988, 2);
    expect(r.usedByCounts).toBeCloseTo(207.988, 2);
    expect(r.soldOnTill).toBeCloseTo(200, 4);
    expect(r.unexplained).toBeCloseTo(7.988, 2);
    expect(r.unexplained).toBeCloseTo(calcVariance(r.usedByCounts!, r.soldOnTill), 4);
    expect(r.atCost).toBeCloseTo(7.988 * (165 / (50000 / 568.261)), 1);
    expect(r.atSale).toBeCloseTo(7.988 * 4.9, 1); // till's own price: £980 / 200 pints
    expect(r.status).toBe("loss");
  });
  it("recorded wastage explains stock gone, so it isn't flagged", () => {
    const r = by("guinness");
    expect(r.wastage).toBeCloseTo(5, 2);
    expect(r.unexplained).toBeCloseTo(0, 2);
    expect(r.status).toBe("ok");
    expect(r.atSale).toBeCloseTo(0, 1);
  });
  it("spirits: 4 measures short is inside 3% tolerance; £ at sale uses the library price when the till has no money", () => {
    const r = by("gordons");
    expect(r.closing).toBeCloseTo(0.5, 6);
    expect(r.usedByCounts).toBeCloseTo(5.5, 6);
    expect(r.unexplained).toBeCloseTo(4 / 28, 6);
    expect(r.atCost).toBeCloseTo(2, 2);
    expect(r.atSale).toBeCloseTo(14, 2);
    expect(r.status).toBe("ok");
    expect(describeAmount(r.unexplained!, P.gordons, 25, true)).toBe("+4 measures");
  });
  it("items: till sold more than went → flagged as over", () => {
    const r = by("crisps");
    expect(r.usedByCounts).toBe(34);
    expect(r.unexplained).toBe(-6);
    expect(r.atCost).toBe(-3);
    expect(r.atSale).toBe(-9);
    expect(r.status).toBe("over");
  });
  it("sold on the till but not counted at both ends: shown, not compared", () => {
    const r = by("wine");
    expect(r.status).toBe("not_counted");
    expect(r.unexplained).toBeNull();
    expect(r.soldOnTill).toBeCloseTo(64 * 175 / 750, 4);
    expect(describeAmount(r.soldOnTill, P.wine, 25)).toBe("64 glasses");
  });
  it("biggest £ first, not-counted last; totals add up", () => {
    expect(rows[0].productId).toBe("carling");
    expect(rows[rows.length - 1].status).toBe("not_counted");
    const t = varianceTotals(rows);
    expect(t).toMatchObject({ compared: 4, flagged: 2, notCounted: 1 });
    expect(t.atCost).toBeCloseTo(rows.reduce((s, r) => s + (r.atCost ?? 0), 0), 2);
  });
  it("a looser tolerance stops the draught flag", () => {
    const loose = buildTillVariance(input({ tolerance: { ...DEFAULT_TOLERANCE, pct: 0.05 } }));
    expect(loose.find(r => r.productId === "carling")!.status).toBe("ok");
  });
  it("products counted but with nothing on the till still show (all of it unexplained)", () => {
    const r = buildTillVariance(input({ sales: [] })).find(x => x.productId === "carling")!;
    expect(r.soldOnTill).toBe(0);
    expect(r.status).toBe("loss");
  });
});

describe("tolerance and display", () => {
  it("uses the bigger of % of usage and a floor in sensible units", () => {
    expect(toleranceFor(P.carling, 10, DEFAULT_TOLERANCE, 25)).toBe(2);
    expect(toleranceFor(P.carling, 200, DEFAULT_TOLERANCE, 25)).toBeCloseTo(6, 6);
    expect(toleranceFor(P.gordons, 0.5, DEFAULT_TOLERANCE, 25)).toBeCloseTo(2 * 25 / 700, 6);
  });
  it("describes amounts as the bar would", () => {
    expect(describeAmount(7.99, P.carling, 25, true)).toBe("+8 pt");
    expect(describeAmount(40, P.carling, 25)).toBe("40 pt");
    expect(describeAmount(208, P.carling, 25)).toBe("26 gal 0 pt");
    expect(describeAmount(-3, P.crisps, 25, true)).toBe("−3");
    expect(describeAmount(1 / 28, P.gordons, 25)).toBe("1 measure");
    expect(describeAmount(2.5, P.pmax, 25)).toBe("2.5 L");
  });
});
