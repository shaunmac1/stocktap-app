import { describe, it, expect } from "vitest";
import { suggestChecks, stockValue } from "./check-picks";
import { forecastLine, type ForecastProduct } from "./line-forecast";

const DAY = 864e5; const NOW = Date.parse("2026-11-10T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const P = (id: string, over: Partial<ForecastProduct & { cost_price: number; hidden_at: string | null }> = {}) =>
  ({ id, name: id, category: "spirits", counting_method: "tenths", unit: "weigh", size_ml: 700, cost_price: 15, ...over });
const fc = (p: any, units: number, d: number, perDay: number | null) =>
  forecastLine({ product: p, history: [{ product_id: p.id, ml_remaining: units * (p.size_ml || 1), reading_at: ago(d) }], deliveries: [], auditRateMl: perDay == null ? null : perDay * (p.size_ml || 1), coverDays: 10, now: NOW });

describe("today's check picks", () => {
  it("running low first (soonest out), then dearest not checked for a week, then never checked; hidden left out", () => {
    const low = P("low"), out = P("out"), dear = P("dear", { cost_price: 40 }), cheap = P("cheap", { cost_price: 5 }), fresh = P("fresh", { cost_price: 60 }),
      never = P("never"), hidden = P("hidden", { hidden_at: ago(1) });
    const products = [low, out, dear, cheap, fresh, never, hidden];
    const f = new Map([
      ["low", fc(low, 3, 0, 1)], ["out", fc(out, 0, 0, 1)], ["dear", fc(dear, 10, 9, 0.1)],
      ["cheap", fc(cheap, 10, 9, 0.1)], ["fresh", fc(fresh, 10, 2, 0.1)], ["hidden", fc(hidden, 0, 0, 1)],
    ]);
    const last = new Map([["low", ago(0)], ["out", ago(0)], ["dear", ago(9)], ["cheap", ago(9)], ["fresh", ago(2)], ["hidden", ago(0)]]);
    const picks = suggestChecks(products, f, last, { now: NOW });
    expect(picks.map(x => x.id)).toEqual(["out", "low", "dear", "cheap", "never"]);
    expect(picks[0].label).toBe("Probably out: check before ordering");
    expect(picks[1].label).toBe("Running low: 3 days left");
    expect(picks[2].label).toBe("Dearest lines: not checked for 9 days");
    expect(picks[4].label).toBe("Never checked");
  });
  it("stays short: capped", () => {
    const many = Array.from({ length: 30 }, (_, i) => P(`n${i}`));
    expect(suggestChecks(many, new Map(), new Map(), { now: NOW, max: 10 }).length).toBe(10);
  });
  it("money in the line: per bottle, per single can on a case line, per case on a dozen line", () => {
    const gin = P("gin");
    expect(stockValue(gin, fc(gin, 2.5, 0, 1))).toBeCloseTo(37.5);
    const j2o = P("j2o", { category: "minerals", counting_method: "each", unit: "count", size_ml: 275, pack_size: 24, cost_price: 0.62 });
    expect(stockValue(j2o, fc(j2o, 79, 0, 1))).toBeCloseTo(48.98);
    const cord = P("cord", { category: "minerals", counting_method: "dozen", unit: "count", size_ml: 1000, pack_size: 12, cost_price: 36 });
    expect(stockValue(cord, fc(cord, 18, 0, 1))).toBeCloseTo(54);
  });
});
