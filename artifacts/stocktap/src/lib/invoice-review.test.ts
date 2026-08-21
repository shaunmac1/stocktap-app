import { describe, expect, it } from "vitest";
import {
  calculatedInvoiceLineTotalPence,
  invoiceReviewProgress,
  penceToPoundsInput,
  poundsInputToPence,
  type ReviewableInvoiceLine,
} from "./invoice-review";

const line = (overrides: Partial<ReviewableInvoiceLine> = {}): ReviewableInvoiceLine => ({
  id: "line-1",
  review_status: "accepted",
  matched_product_id: "product-1",
  purchase_quantity: 2,
  unit_cost_pence: 1500,
  line_total_pence: null,
  ...overrides,
});

describe("invoice review totals", () => {
  it("prefers an explicit line total and otherwise multiplies quantity by unit cost", () => {
    expect(calculatedInvoiceLineTotalPence(line())).toBe(3000);
    expect(calculatedInvoiceLineTotalPence(line({ line_total_pence: 2995 }))).toBe(2995);
  });

  it("converts editable pound fields to integer pence", () => {
    expect(poundsInputToPence("126.34")).toBe(12634);
    expect(poundsInputToPence("-1")).toBeNull();
    expect(poundsInputToPence("")).toBeNull();
    expect(penceToPoundsInput(12634)).toBe("126.34");
  });
});

describe("invoice commit gate", () => {
  it("allows a reviewed invoice whose accepted rows all have product, quantity and cost", () => {
    expect(invoiceReviewProgress([
      line(),
      line({ id: "charge", review_status: "ignored", matched_product_id: null, unit_cost_pence: 500 }),
    ])).toMatchObject({
      accepted: 1,
      ignored: 1,
      unresolved: 0,
      canCommit: true,
      totalPence: 3000,
      commitErrors: [],
    });
  });

  it("blocks an invoice with no accepted product rows", () => {
    const progress = invoiceReviewProgress([line({ review_status: "ignored" })]);
    expect(progress.canCommit).toBe(false);
    expect(progress.commitErrors).toContain("Accept at least one product line.");
  });

  it("blocks missing product matches, bad quantities and missing costs", () => {
    const progress = invoiceReviewProgress([
      line({ matched_product_id: null }),
      line({ id: "bad-qty", purchase_quantity: 0 }),
      line({ id: "bad-cost", unit_cost_pence: null }),
    ]);
    expect(progress.canCommit).toBe(false);
    expect(progress.commitErrors).toEqual(expect.arrayContaining([
      "Every accepted line needs a product match.",
      "Every accepted line needs a quantity greater than zero.",
      "Every accepted line needs a non-negative unit cost.",
    ]));
  });
});
