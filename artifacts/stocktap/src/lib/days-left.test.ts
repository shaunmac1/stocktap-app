import { describe, expect, it } from "vitest";
import { daysLeft, daysLeftLabel, kegsToOrder } from "./days-left";
const P = 568.261;
const at = (d: number, h = 9) => new Date(Date.UTC(2026, 10, d, h)).toISOString();

describe("daysLeft", () => {
  it("Poretti: 376 pints Tuesday, 296 Thursday = 40 a day, about 7 days left", () => {
    const r = daysLeft([{ ml: 376 * P, at: at(10) }, { ml: 296 * P, at: at(12) }], []);
    expect(r.status).toBe("ok");
    expect(Math.round(r.perDayMl! / P)).toBe(40);
    expect(Math.round(r.days! * 10) / 10).toBe(7.4);
  });
  it("counts a delivery between the two counts as stock that was drunk too", () => {
    const r = daysLeft([{ ml: 100 * P, at: at(10) }, { ml: 100 * P, at: at(12) }], [{ ml: 88 * P, at: at(11) }]);
    expect(Math.round(r.usedMl! / P)).toBe(88);
    expect(Math.round(r.perDayMl! / P)).toBe(44);
  });
  it("adds a delivery since the last count onto stock", () => {
    const r = daysLeft([{ ml: 200 * P, at: at(10) }, { ml: 120 * P, at: at(12) }], [{ ml: 88 * P, at: at(12, 12) }]);
    expect(Math.round(r.stockMl / P)).toBe(208);
    expect(Math.round(r.days!)).toBe(5);
  });
  it("uses the oldest count in the last 14 days so the weekend is in the rate", () => {
    const r = daysLeft([{ ml: 900 * P, at: at(1) }, { ml: 500 * P, at: at(5) }, { ml: 440 * P, at: at(10) }, { ml: 424 * P, at: at(12) }], []);
    expect(r.fromAt).toBe(at(1));
    expect(Math.round(r.spanDays!)).toBe(11);
  });
  it("ignores counts older than 14 days", () => {
    const r = daysLeft([{ ml: 900 * P, at: new Date(Date.UTC(2026, 9, 1)).toISOString() }, { ml: 424 * P, at: at(12) }], []);
    expect(r.status).toBe("no-history");
  });
  it("stock went up with no delivery: says so, gives no number", () => {
    const r = daysLeft([{ ml: 968 * P, at: at(10) }, { ml: 1000 * P, at: at(12) }], []);
    expect(r.status).toBe("went-up");
    expect(r.days).toBeNull();
  });
  it("one count only: stock but no rate", () => {
    const r = daysLeft([{ ml: 300 * P, at: at(12) }], []);
    expect(r.status).toBe("no-history");
    expect(Math.round(r.stockMl / P)).toBe(300);
  });
  it("two counts the same morning are not a rate", () => {
    expect(daysLeft([{ ml: 300 * P, at: at(12, 8) }, { ml: 290 * P, at: at(12, 9) }], []).status).toBe("no-history");
  });
  it("nothing sold", () => {
    expect(daysLeft([{ ml: 300 * P, at: at(10) }, { ml: 300 * P, at: at(12) }], []).status).toBe("not-moving");
  });
  it("never counted but delivered", () => {
    const r = daysLeft([], [{ ml: 88 * P, at: at(9) }]);
    expect(r.status).toBe("no-count");
    expect(Math.round(r.stockMl / P)).toBe(88);
  });
});

describe("labels and order", () => {
  it("labels", () => {
    expect(daysLeftLabel(0.4)).toBe("under a day");
    expect(daysLeftLabel(7.4)).toBe("about 7.5 days");
    expect(daysLeftLabel(1.1)).toBe("about 1 day");
    expect(daysLeftLabel(17)).toBe("about 17 days");
    expect(daysLeftLabel(42)).toBe("3 weeks or more");
  });
  it("kegs to order to cover 10 days", () => {
    const r = daysLeft([{ ml: 376 * P, at: at(10) }, { ml: 296 * P, at: at(12) }], []);
    // 40 pints a day x 10 = 400, have 296, need 104 = 2 kegs of 88
    expect(kegsToOrder(r, 50000, 10)).toBe(2);
    expect(kegsToOrder(r, 50000, 7)).toBe(0);
  });
});
