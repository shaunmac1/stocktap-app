import { describe, expect, it } from "vitest";
import {
  buildManualDeliveryArgs,
  deliveryCostPence,
  deliveryProvenanceLabel,
  deliveryQuantityMl,
  deliveryTotalPence,
  summariseDeliveryProvenance,
  validateManualDelivery,
} from "./deliveries";

const bottle = {
  id: "vodka",
  venue_id: "venue-1",
  unit: "weigh",
  counting_method: "weigh",
  size_ml: 700,
};

const keg = {
  id: "lager-keg",
  venue_id: "venue-1",
  unit: "count",
  counting_method: "keg_weight",
  container_l: 50,
};

const caseOfTwelve = {
  id: "case",
  venue_id: "venue-1",
  unit: "count",
  counting_method: "dozen",
  size_ml: 330,
  pack_size: 12,
};

describe("manual delivery calculations", () => {
  it("converts purchase units to ml-equivalent physical movement quantity", () => {
    expect(deliveryQuantityMl(bottle, 3)).toBe(2100);
    expect(deliveryQuantityMl(keg, 2)).toBe(100_000);
    expect(deliveryQuantityMl(caseOfTwelve, 2)).toBe(7_920);
  });

  it("calculates purchase totals in integer pence", () => {
    expect(deliveryTotalPence(10, 120)).toBe(1200);
    expect(deliveryTotalPence(2.5, 999)).toBe(2498);
  });

  it("builds retry-safe RPC arguments and trims optional fields", () => {
    const args = buildManualDeliveryArgs("venue-1", keg, {
      purchaseQuantity: 2,
      unitCostPence: 12_345,
      clientReference: "0a970c30-2645-45c2-bc0f-50c5a15fa1ab",
      invoiceRef: " INV-1001 ",
      supplier: " Matthew Clark ",
      toLocationId: " cellar ",
      notes: " Weekly order ",
      deliveredAt: "2026-07-14T09:30:00+01:00",
    });

    expect(args).toMatchObject({
      p_venue_id: "venue-1",
      p_product_id: "lager-keg",
      p_purchase_quantity: 2,
      p_quantity_ml: 100_000,
      p_unit_cost_pence: 12_345,
      p_invoice_ref: "INV-1001",
      p_supplier: "Matthew Clark",
      p_to_location_id: "cellar",
      p_notes: "Weekly order",
    });
    expect(args.p_delivered_at).toBe("2026-07-14T08:30:00.000Z");
  });

  it("blocks missing quantities, negative costs and unusable capacities", () => {
    expect(validateManualDelivery(bottle, {
      purchaseQuantity: 0,
      unitCostPence: -1,
      clientReference: "",
    })).toEqual(expect.arrayContaining([
      "A retry-safe client reference is required.",
      "Purchase quantity must be greater than zero.",
      "Unit cost must be a non-negative amount in whole pence.",
    ]));

    expect(validateManualDelivery({ ...bottle, size_ml: 0 }, {
      purchaseQuantity: 1,
      unitCostPence: 100,
      clientReference: "client-ref",
    })).toContain("This product does not have a usable purchase-unit capacity.");
  });

  it("rejects a product from another venue", () => {
    expect(() => buildManualDeliveryArgs("venue-2", bottle, {
      purchaseQuantity: 1,
      unitCostPence: 700,
      clientReference: "client-ref",
    })).toThrow("Product does not belong to the selected venue.");
  });
});

describe("delivery provenance", () => {
  it("labels every supported source clearly", () => {
    expect(deliveryProvenanceLabel("ledger")).toBe("Manual delivery");
    expect(deliveryProvenanceLabel("invoice")).toBe("Invoice scan");
    expect(deliveryProvenanceLabel("mid_stocktake")).toBe("Added during stocktake");
  });

  it("uses stored exact totals and falls back to quantity times unit cost", () => {
    expect(deliveryCostPence({ entry_method: "ledger", total_cost_pence: 12634 })).toBe(12634);
    expect(deliveryCostPence({ entry_method: "invoice", quantity: 3, unit_cost: 12.5 })).toBe(3750);
  });

  it("summarises purchase totals by provenance", () => {
    const summary = summariseDeliveryProvenance([
      { entry_method: "ledger", total_cost_pence: 12_634 },
      { entry_method: "invoice", total_cost_pence: 50_000 },
      { entry_method: "mid_stocktake", total_cost_pence: 1_200 },
      { entry_method: "ledger", quantity: 2, unit_cost: 10 },
    ]);

    expect(summary.byMethod).toEqual({
      ledger: 14_634,
      invoice: 50_000,
      mid_stocktake: 1_200,
    });
    expect(summary.totalPence).toBe(65_834);
  });
});
