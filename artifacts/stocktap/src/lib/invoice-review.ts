export interface ReviewableInvoiceLine {
  id: string;
  review_status: "unmatched" | "accepted" | "ignored";
  matched_product_id: string | null;
  purchase_quantity: number;
  unit_cost_pence: number | null;
  line_total_pence: number | null;
}

export interface InvoiceReviewProgress {
  accepted: number;
  ignored: number;
  unresolved: number;
  commitErrors: string[];
  canCommit: boolean;
  totalPence: number;
}

export function calculatedInvoiceLineTotalPence(line: Pick<ReviewableInvoiceLine, "purchase_quantity" | "unit_cost_pence" | "line_total_pence">): number {
  if (line.line_total_pence != null && line.line_total_pence >= 0) return line.line_total_pence;
  if (line.unit_cost_pence == null || line.unit_cost_pence < 0 || !Number.isFinite(line.purchase_quantity) || line.purchase_quantity <= 0) return 0;
  return Math.round(line.purchase_quantity * line.unit_cost_pence);
}

export function invoiceReviewProgress(lines: ReviewableInvoiceLine[]): InvoiceReviewProgress {
  const acceptedLines = lines.filter((line) => line.review_status === "accepted");
  const ignored = lines.filter((line) => line.review_status === "ignored").length;
  const unresolved = lines.length - acceptedLines.length - ignored;
  const commitErrors: string[] = [];

  if (acceptedLines.length === 0) commitErrors.push("Accept at least one product line.");
  for (const line of acceptedLines) {
    if (!line.matched_product_id) commitErrors.push("Every accepted line needs a product match.");
    if (!Number.isFinite(line.purchase_quantity) || line.purchase_quantity <= 0) commitErrors.push("Every accepted line needs a quantity greater than zero.");
    if (line.unit_cost_pence == null || line.unit_cost_pence < 0) commitErrors.push("Every accepted line needs a non-negative unit cost.");
  }

  return {
    accepted: acceptedLines.length,
    ignored,
    unresolved,
    commitErrors: [...new Set(commitErrors)],
    canCommit: commitErrors.length === 0,
    totalPence: acceptedLines.reduce((sum, line) => sum + calculatedInvoiceLineTotalPence(line), 0),
  };
}

export function poundsInputToPence(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function penceToPoundsInput(value: number | null): string {
  return value == null ? "" : (value / 100).toFixed(2);
}
