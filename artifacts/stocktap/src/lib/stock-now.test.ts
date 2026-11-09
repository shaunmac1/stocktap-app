import { describe, it, expect } from "vitest";
import { stockNow } from "./stock-now";
const P = 568.261;
const sanMig = { id: "s", category: "draught_lager", counting_method: "keg_weight", container_l: 50 };
describe("stock on hand now", () => {
  it("last count + 3 x 50L kegs delivered since", () => {
    const r = stockNow(sanMig, { ml_remaining: 80 * P, reading_at: "2026-11-08T10:00:00Z" }, [
      { product_id: "s", delivered_at: "2026-11-09T09:00:00Z", quantity_ml: 150000 },
      { product_id: "s", delivered_at: "2026-11-01T09:00:00Z", quantity_ml: 50000 }, // before the count: already in it
      { product_id: "x", delivered_at: "2026-11-09T09:00:00Z", quantity_ml: 50000 },
    ])!;
    expect(r.label).toBe("43 gal 0 pt (344 pints)");
    expect(r.deliveredLabel).toBe("33 gal 0 pt (264 pints)");
  });
  it("never counted but delivered: the delivery is the stock", () => {
    expect(stockNow(sanMig, null, [{ product_id: "s", delivered_at: "2026-11-09T09:00:00Z", quantity_ml: 50000 }])!.label).toBe("11 gal 0 pt (88 pints)");
  });
  it("nothing known: null", () => expect(stockNow(sanMig, null, [])).toBeNull());
  it("bottles", () => {
    expect(stockNow({ id: "g", category: "spirits", counting_method: "weigh", size_ml: 700, unit: "weigh" }, { ml_remaining: 1050, reading_at: "2026-11-08T10:00:00Z" }, [{ product_id: "g", delivered_at: "2026-11-09T09:00:00Z", quantity_ml: 4200 }])!.label).toBe("7.5 btl");
  });
});
