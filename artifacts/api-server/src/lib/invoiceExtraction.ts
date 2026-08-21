export interface ExtractedInvoiceLine {
  description: string;
  purchase_quantity: number;
  unit_label: string | null;
  unit_cost: number | null;
  line_total: number | null;
  is_product: boolean;
}

export interface ExtractedInvoice {
  supplier: string | null;
  invoice_ref: string | null;
  invoice_date: string | null;
  currency: string;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  lines: ExtractedInvoiceLine[];
}

export interface MatchableProduct {
  id: string;
  name: string;
  vendor?: string | null;
  sku?: string | null;
}

export interface DraftInvoiceLine {
  line_number: number;
  raw_description: string;
  purchase_quantity: number;
  unit_label: string | null;
  unit_cost_pence: number | null;
  line_total_pence: number | null;
  matched_product_id: string | null;
  match_confidence: number | null;
  review_status: "unmatched" | "accepted" | "ignored";
}

export const INVOICE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "invoice_ref", "invoice_date", "currency", "subtotal", "vat", "total", "lines"],
  properties: {
    supplier: { type: ["string", "null"] },
    invoice_ref: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD when visible" },
    currency: { type: "string", description: "Three-letter currency code, normally GBP" },
    subtotal: { type: ["number", "null"] },
    vat: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "purchase_quantity", "unit_label", "unit_cost", "line_total", "is_product"],
        properties: {
          description: { type: "string" },
          purchase_quantity: { type: "number", description: "Number of cases, bottles, kegs or other purchase units" },
          unit_label: { type: ["string", "null"] },
          unit_cost: { type: ["number", "null"], description: "Cost for one purchase unit in the document currency" },
          line_total: { type: ["number", "null"] },
          is_product: { type: "boolean", description: "False for delivery charges, deposits, credits, discounts and totals" },
        },
      },
    },
  },
} as const;

function cleanNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

export function majorCurrencyToPence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function normalizeExtractedInvoice(value: unknown): ExtractedInvoice {
  if (!value || typeof value !== "object") throw new Error("Invoice extraction did not return an object.");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.lines)) throw new Error("Invoice extraction did not return line items.");

  const lines = raw.lines.map((line, index): ExtractedInvoiceLine => {
    if (!line || typeof line !== "object") throw new Error(`Invoice line ${index + 1} is invalid.`);
    const row = line as Record<string, unknown>;
    const description = cleanNullableText(row.description);
    if (!description) throw new Error(`Invoice line ${index + 1} has no description.`);
    const quantity = typeof row.purchase_quantity === "number" && Number.isFinite(row.purchase_quantity) && row.purchase_quantity > 0
      ? row.purchase_quantity
      : 1;
    return {
      description,
      purchase_quantity: quantity,
      unit_label: cleanNullableText(row.unit_label),
      unit_cost: typeof row.unit_cost === "number" && Number.isFinite(row.unit_cost) && row.unit_cost >= 0 ? row.unit_cost : null,
      line_total: typeof row.line_total === "number" && Number.isFinite(row.line_total) && row.line_total >= 0 ? row.line_total : null,
      is_product: row.is_product !== false,
    };
  });

  return {
    supplier: cleanNullableText(raw.supplier),
    invoice_ref: cleanNullableText(raw.invoice_ref),
    invoice_date: cleanNullableText(raw.invoice_date),
    currency: cleanNullableText(raw.currency)?.toUpperCase() ?? "GBP",
    subtotal: typeof raw.subtotal === "number" && Number.isFinite(raw.subtotal) && raw.subtotal >= 0 ? raw.subtotal : null,
    vat: typeof raw.vat === "number" && Number.isFinite(raw.vat) && raw.vat >= 0 ? raw.vat : null,
    total: typeof raw.total === "number" && Number.isFinite(raw.total) && raw.total >= 0 ? raw.total : null,
    lines,
  };
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function productMatchScore(description: string, product: MatchableProduct): number {
  const descriptionName = normalizeName(description);
  const productName = normalizeName(product.name);
  if (!descriptionName || !productName) return 0;
  if (descriptionName === productName) return 1;
  if (descriptionName.includes(productName) || productName.includes(descriptionName)) return 0.9;

  const descriptionWords = new Set(descriptionName.split(" ").filter((word) => word.length > 1));
  const productWords = productName.split(" ").filter((word) => word.length > 1);
  if (productWords.length === 0) return 0;
  const matched = productWords.filter((word) => descriptionWords.has(word) || [...descriptionWords].some((candidate) => candidate.startsWith(word) || word.startsWith(candidate)));
  const nameCoverage = matched.length / productWords.length;

  const sku = normalizeName(product.sku ?? "");
  const skuMatched = !!sku && descriptionName.split(" ").includes(sku);
  if (skuMatched && nameCoverage >= 0.5) return 1;
  if (skuMatched) return 0.9;

  const vendor = normalizeName(product.vendor ?? "");
  const vendorBoost = vendor && descriptionName.includes(vendor) ? 0.15 : 0;
  return Math.min(1, nameCoverage * 0.85 + vendorBoost);
}

export function bestProductMatch(
  description: string,
  products: MatchableProduct[],
  threshold = 0.55,
): { productId: string; confidence: number } | null {
  let best: { productId: string; confidence: number } | null = null;
  for (const product of products) {
    const confidence = productMatchScore(description, product);
    if (confidence >= threshold && (!best || confidence > best.confidence)) {
      best = { productId: product.id, confidence };
    }
  }
  return best;
}

export function buildDraftInvoiceLines(
  invoice: ExtractedInvoice,
  products: MatchableProduct[],
): DraftInvoiceLine[] {
  return invoice.lines.map((line, index) => {
    const match = line.is_product ? bestProductMatch(line.description, products) : null;
    return {
      line_number: index + 1,
      raw_description: line.description,
      purchase_quantity: line.purchase_quantity,
      unit_label: line.unit_label,
      unit_cost_pence: majorCurrencyToPence(line.unit_cost),
      line_total_pence: majorCurrencyToPence(line.line_total),
      matched_product_id: match?.productId ?? null,
      match_confidence: match?.confidence ?? null,
      review_status: !line.is_product ? "ignored" : match && match.confidence >= 0.85 ? "accepted" : "unmatched",
    };
  });
}

export function extractResponseOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("OpenAI returned an invalid response.");
  const response = payload as Record<string, any>;
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const output of response.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }
  throw new Error("OpenAI response contained no structured output text.");
}
