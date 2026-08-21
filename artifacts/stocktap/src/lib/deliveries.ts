import { productCapacityMl } from "./calculations";
import { purchaseUnitLabel, type ReportProductLike } from "./inventory-reporting";

export type DeliveryEntryMethod = "invoice" | "ledger" | "mid_stocktake";

export interface DeliveryProductLike extends ReportProductLike {
  id: string;
  venue_id: string;
}

export interface ManualDeliveryDraft {
  purchaseQuantity: number;
  unitCostPence: number;
  invoiceRef?: string | null;
  supplier?: string | null;
  toLocationId?: string | null;
  notes?: string | null;
  deliveredAt?: string | null;
  clientReference: string;
}

export interface RecordManualDeliveryArgs {
  p_venue_id: string;
  p_product_id: string;
  p_purchase_quantity: number;
  p_quantity_ml: number;
  p_unit_cost_pence: number;
  p_client_reference: string;
  p_invoice_ref: string | null;
  p_supplier: string | null;
  p_to_location_id: string | null;
  p_notes: string | null;
  p_delivered_at: string;
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function deliveryTotalPence(purchaseQuantity: number, unitCostPence: number): number {
  if (!Number.isFinite(purchaseQuantity) || !Number.isFinite(unitCostPence)) return 0;
  return Math.round(purchaseQuantity * unitCostPence);
}

export function deliveryQuantityMl(product: ReportProductLike, purchaseQuantity: number): number {
  if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0) return 0;
  const capacityMl = productCapacityMl(product);
  return capacityMl > 0 ? capacityMl * purchaseQuantity : 0;
}

export function deliveryUnitLabel(product: ReportProductLike): string {
  return purchaseUnitLabel(product);
}

export function validateManualDelivery(
  product: DeliveryProductLike | null | undefined,
  draft: Partial<ManualDeliveryDraft>,
): string[] {
  const errors: string[] = [];

  if (!product) errors.push("Select a product.");
  if (!draft.clientReference?.trim()) errors.push("A retry-safe client reference is required.");

  if (!Number.isFinite(draft.purchaseQuantity) || (draft.purchaseQuantity ?? 0) <= 0) {
    errors.push("Purchase quantity must be greater than zero.");
  }

  if (!Number.isInteger(draft.unitCostPence) || (draft.unitCostPence ?? -1) < 0) {
    errors.push("Unit cost must be a non-negative amount in whole pence.");
  }

  if (product && deliveryQuantityMl(product, draft.purchaseQuantity ?? 0) <= 0) {
    errors.push("This product does not have a usable purchase-unit capacity.");
  }

  if (draft.deliveredAt && Number.isNaN(Date.parse(draft.deliveredAt))) {
    errors.push("Delivery date is invalid.");
  }

  return errors;
}

export function buildManualDeliveryArgs(
  venueId: string,
  product: DeliveryProductLike,
  draft: ManualDeliveryDraft,
): RecordManualDeliveryArgs {
  const errors = validateManualDelivery(product, draft);
  if (errors.length > 0) throw new Error(errors.join(" "));
  if (product.venue_id !== venueId) throw new Error("Product does not belong to the selected venue.");

  return {
    p_venue_id: venueId,
    p_product_id: product.id,
    p_purchase_quantity: draft.purchaseQuantity,
    p_quantity_ml: deliveryQuantityMl(product, draft.purchaseQuantity),
    p_unit_cost_pence: draft.unitCostPence,
    p_client_reference: draft.clientReference,
    p_invoice_ref: cleanOptional(draft.invoiceRef),
    p_supplier: cleanOptional(draft.supplier),
    p_to_location_id: cleanOptional(draft.toLocationId),
    p_notes: cleanOptional(draft.notes),
    p_delivered_at: draft.deliveredAt
      ? new Date(draft.deliveredAt).toISOString()
      : new Date().toISOString(),
  };
}

export function deliveryProvenanceLabel(method: DeliveryEntryMethod): string {
  switch (method) {
    case "invoice":
      return "Invoice scan";
    case "mid_stocktake":
      return "Added during stocktake";
    case "ledger":
    default:
      return "Manual delivery";
  }
}

export interface DeliveryProvenanceRow {
  entry_method: DeliveryEntryMethod;
  total_cost_pence?: number | null;
  quantity?: number | null;
  unit_cost?: number | null;
}

export function deliveryCostPence(row: DeliveryProvenanceRow): number {
  if (row.total_cost_pence != null) return Math.round(row.total_cost_pence);
  return Math.round((row.quantity ?? 0) * (row.unit_cost ?? 0) * 100);
}

export function summariseDeliveryProvenance(rows: DeliveryProvenanceRow[]) {
  const byMethod: Record<DeliveryEntryMethod, number> = {
    invoice: 0,
    ledger: 0,
    mid_stocktake: 0,
  };

  for (const row of rows) byMethod[row.entry_method] += deliveryCostPence(row);

  return {
    byMethod,
    totalPence: byMethod.invoice + byMethod.ledger + byMethod.mid_stocktake,
  };
}
