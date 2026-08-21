import { describe, expect, it } from "vitest";
import {
  bestProductMatch,
  buildDraftInvoiceLines,
  extractResponseOutputText,
  majorCurrencyToPence,
  normalizeExtractedInvoice,
  productMatchScore,
} from "./invoiceExtraction";

const products = [
  { id: "smirnoff", name: "Smirnoff Red 70cl", vendor: "Diageo", sku: "SMIR70" },
  { id: "lager", name: "Carling 50L Keg", vendor: "Molson Coors", sku: "CAR50" },
];

describe("invoice extraction normalisation", () => {
  it("converts major currency to integer pence without floating-point drift", () => {
    expect(majorCurrencyToPence(126.34)).toBe(12634);
    expect(majorCurrencyToPence(2.505)).toBe(251);
    expect(majorCurrencyToPence(-1)).toBeNull();
  });

  it("normalises extracted invoice metadata and defaults bad quantities to one", () => {
    const invoice = normalizeExtractedInvoice({
      supplier: " Matthew Clark ",
      invoice_ref: " INV-1001 ",
      invoice_date: "2026-07-14",
      currency: "gbp",
      subtotal: 100,
      vat: 20,
      total: 120,
      lines: [{
        description: " Smirnoff Red 70cl ",
        purchase_quantity: 0,
        unit_label: "case",
        unit_cost: 15.5,
        line_total: 31,
        is_product: true,
      }],
    });

    expect(invoice).toMatchObject({
      supplier: "Matthew Clark",
      invoice_ref: "INV-1001",
      currency: "GBP",
    });
    expect(invoice.lines[0]).toMatchObject({
      description: "Smirnoff Red 70cl",
      purchase_quantity: 1,
    });
  });

  it("rejects a response without line items", () => {
    expect(() => normalizeExtractedInvoice({ supplier: "Supplier" })).toThrow(/line items/);
  });
});

describe("invoice product matching", () => {
  it("scores exact and SKU matches strongly", () => {
    expect(productMatchScore("Smirnoff Red 70cl", products[0])).toBe(1);
    expect(productMatchScore("SMIR70 VODKA", products[0])).toBeGreaterThanOrEqual(0.55);
  });

  it("returns the best product only above the threshold", () => {
    expect(bestProductMatch("CAR50 Carling keg", products)).toEqual({ productId: "lager", confidence: 1 });
    expect(bestProductMatch("Delivery charge", products)).toBeNull();
  });

  it("auto-accepts only high-confidence product rows and ignores charges", () => {
    const invoice = normalizeExtractedInvoice({
      supplier: "Supplier",
      invoice_ref: "1",
      invoice_date: "2026-07-14",
      currency: "GBP",
      subtotal: 100,
      vat: 20,
      total: 120,
      lines: [
        { description: "Smirnoff Red 70cl", purchase_quantity: 2, unit_label: "bottle", unit_cost: 15, line_total: 30, is_product: true },
        { description: "Delivery charge", purchase_quantity: 1, unit_label: null, unit_cost: 5, line_total: 5, is_product: false },
        { description: "Unknown craft beer", purchase_quantity: 1, unit_label: "case", unit_cost: 25, line_total: 25, is_product: true },
      ],
    });

    const draft = buildDraftInvoiceLines(invoice, products);
    expect(draft[0]).toMatchObject({ matched_product_id: "smirnoff", review_status: "accepted", unit_cost_pence: 1500 });
    expect(draft[1]).toMatchObject({ matched_product_id: null, review_status: "ignored" });
    expect(draft[2]).toMatchObject({ matched_product_id: null, review_status: "unmatched" });
  });
});

describe("OpenAI response parsing", () => {
  it("reads SDK-style output_text and raw Responses API message content", () => {
    expect(extractResponseOutputText({ output_text: '{"supplier":"A"}' })).toBe('{"supplier":"A"}');
    expect(extractResponseOutputText({ output: [{ content: [{ type: "output_text", text: '{"supplier":"B"}' }] }] })).toBe('{"supplier":"B"}');
  });

  it("rejects a response with no output text", () => {
    expect(() => extractResponseOutputText({ output: [] })).toThrow(/no structured output text/);
  });
});
