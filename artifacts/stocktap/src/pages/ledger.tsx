import React, { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMovements, useAddMovement, useProducts, useLocations } from "@/hooks/api";
import { useRecordManualDelivery } from "@/hooks/useDeliveries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Plus, ArrowLeftRight, Truck, Trash2, Lock, ChevronLeft } from "lucide-react";
import { formatGBP } from "@/lib/calculations";
import {
  buildManualDeliveryArgs,
  deliveryQuantityMl,
  deliveryTotalPence,
  deliveryUnitLabel,
} from "@/lib/deliveries";
import type { Database } from "@/lib/database.types";

type MovementType = "delivery" | "transfer" | "wastage";

const MOVEMENT_LABELS: Record<MovementType, string> = {
  delivery: "Delivery",
  transfer: "Transfer",
  wastage: "Wastage",
};

const MOVEMENT_COLORS: Record<MovementType, string> = {
  delivery: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  transfer: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  wastage: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const MOVEMENT_ICONS: Record<MovementType, React.ComponentType<any>> = {
  delivery: Truck,
  transfer: ArrowLeftRight,
  wastage: Trash2,
};

function formatMovedAt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function groupByDate(movements: any[]) {
  const groups: Record<string, any[]> = {};
  for (const m of movements) {
    const key = new Date(m.moved_at).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return groups;
}

function AddMovementSheet({
  open,
  onClose,
  venueId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  userId: string;
}) {
  const { data: products } = useProducts(venueId);
  const { data: locations } = useLocations(venueId);
  const addMovement = useAddMovement();
  const recordManualDelivery = useRecordManualDelivery();
  const { toast } = useToast();

  const [movementType, setMovementType] = useState<MovementType>("delivery");
  const [productId, setProductId] = useState("");
  const [quantityMl, setQuantityMl] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [supplier, setSupplier] = useState("");
  const [clientReference, setClientReference] = useState(() => crypto.randomUUID());
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [wastageReason, setWastageReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const selectedProduct = products?.find(p => p.id === productId);

  const reset = () => {
    setMovementType("delivery");
    setProductId("");
    setQuantityMl("");
    setPurchaseQuantity("1");
    setUnitCost("");
    setInvoiceRef("");
    setSupplier("");
    setClientReference(crypto.randomUUID());
    setFromLocationId("");
    setToLocationId("");
    setReason("");
    setWastageReason("");
  };

  const handleSave = async () => {
    if (!selectedProduct) {
      toast({ title: "Missing fields", description: "Select a product.", variant: "destructive" });
      return;
    }

    if (movementType === "transfer" && !fromLocationId && !toLocationId) {
      toast({ title: "Missing fields", description: "Specify at least one location for a transfer.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (movementType === "delivery") {
        const purchaseQty = parseFloat(purchaseQuantity);
        const unitCostPence = Math.round(parseFloat(unitCost) * 100);
        const args = buildManualDeliveryArgs(venueId, selectedProduct, {
          purchaseQuantity: purchaseQty,
          unitCostPence,
          invoiceRef,
          supplier,
          toLocationId: toLocationId || null,
          notes: reason,
          clientReference,
        });
        const result = await recordManualDelivery.mutateAsync(args);
        const total = deliveryTotalPence(purchaseQty, unitCostPence) / 100;
        toast({
          title: result.created ? "Delivery recorded" : "Delivery already recorded",
          description: `${purchaseQty} ${deliveryUnitLabel(selectedProduct)} · ${formatGBP(total)} · saved with manual provenance`,
        });
      } else {
        if (!quantityMl || isNaN(parseFloat(quantityMl)) || parseFloat(quantityMl) <= 0) {
          throw new Error("Enter a physical quantity greater than zero.");
        }
        await addMovement.mutateAsync({
          venue_id: venueId,
          product_id: productId,
          movement_type: movementType,
          quantity_ml: parseFloat(quantityMl),
          from_location_id: movementType === "transfer" ? (fromLocationId || null) : null,
          to_location_id: null,
          reason: (() => {
            const cat = movementType === "wastage" ? wastageReason : "";
            const txt = reason.trim();
            if (cat && txt) return `${cat}: ${txt}`;
            return cat || txt || null;
          })(),
          user_id: userId,
          moved_at: new Date().toISOString(),
        });
        toast({ title: "Movement recorded" });
      }
      reset();
      onClose();
    } catch (err: any) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Quantity helpers based on product size
  const sizeOptions = useMemo(() => {
    if (!selectedProduct?.size_ml) return [];
    const s = selectedProduct.size_ml;
    return [
      { label: `1 bottle (${s}ml)`, value: String(s) },
      { label: `2 bottles (${s * 2}ml)`, value: String(s * 2) },
      { label: `3 bottles (${s * 3}ml)`, value: String(s * 3) },
      { label: `6 bottles (${s * 6}ml)`, value: String(s * 6) },
      { label: `12 bottles (${s * 12}ml)`, value: String(s * 12) },
    ];
  }, [selectedProduct]);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Record Movement</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div>
            <Label>Movement type</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(["delivery", "transfer", "wastage"] as MovementType[]).map(t => {
                const Icon = MOVEMENT_ICONS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setMovementType(t)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-medium transition-colors ${
                      movementType === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {MOVEMENT_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {(products ?? []).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {movementType === "delivery" ? (
            <div className="space-y-4 rounded-xl border border-border p-3 bg-muted/20" data-testid="section-delivery-financials">
              <div>
                <Label>Purchase quantity ({deliveryUnitLabel(selectedProduct ?? {})})</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 2"
                  value={purchaseQuantity}
                  onChange={e => setPurchaseQuantity(e.target.value)}
                  className="mt-1 tabular-nums"
                  data-testid="input-delivery-purchase-quantity"
                />
                {selectedProduct && parseFloat(purchaseQuantity) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Physical stock movement: {Math.round(deliveryQuantityMl(selectedProduct, parseFloat(purchaseQuantity))).toLocaleString("en-GB")}ml
                  </p>
                )}
              </div>

              <div>
                <Label>Cost per {deliveryUnitLabel(selectedProduct ?? {})}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 126.34"
                  value={unitCost}
                  onChange={e => setUnitCost(e.target.value)}
                  className="mt-1 tabular-nums"
                  data-testid="input-delivery-unit-cost"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Supplier</Label>
                  <Input
                    placeholder="Optional"
                    value={supplier}
                    onChange={e => setSupplier(e.target.value)}
                    className="mt-1"
                    data-testid="input-delivery-supplier"
                  />
                </div>
                <div>
                  <Label>Invoice reference</Label>
                  <Input
                    placeholder="Optional"
                    value={invoiceRef}
                    onChange={e => setInvoiceRef(e.target.value)}
                    className="mt-1"
                    data-testid="input-delivery-invoice-ref"
                  />
                </div>
              </div>

              {parseFloat(purchaseQuantity) > 0 && parseFloat(unitCost) >= 0 && (
                <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 border border-border" data-testid="delivery-total-preview">
                  <span className="text-sm text-muted-foreground">Purchase total</span>
                  <span className="font-bold tabular-nums">
                    {formatGBP(deliveryTotalPence(parseFloat(purchaseQuantity), Math.round(parseFloat(unitCost) * 100)) / 100)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Label>Quantity (ml)</Label>
              {sizeOptions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 mb-2">
                  {sizeOptions.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setQuantityMl(o.value)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        quantityMl === o.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              <Input
                type="number"
                placeholder="e.g. 700"
                value={quantityMl}
                onChange={e => setQuantityMl(e.target.value)}
                className="tabular-nums"
              />
            </div>
          )}

          {movementType === "transfer" && locations && locations.length > 0 && (
            <>
              <div>
                <Label>From Location</Label>
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Any / not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any / not specified</SelectItem>
                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>To Location</Label>
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Any / not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any / not specified</SelectItem>
                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {movementType === "delivery" && locations && locations.length > 0 && (
            <div>
              <Label>To Location</Label>
              <Select value={toLocationId} onValueChange={setToLocationId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Any / not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any / not specified</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {movementType === "wastage" && (
            <div>
              <Label>Loss category</Label>
              <Select value={wastageReason} onValueChange={setWastageReason}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakage">Breakage</SelectItem>
                  <SelectItem value="spill">Spill</SelectItem>
                  <SelectItem value="spoilage">Spoilage</SelectItem>
                  <SelectItem value="comp">Comp / complimentary</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Reason / Notes</Label>
            <Input
              placeholder={movementType === "wastage" ? "e.g. Broken bottle, staff name..." : movementType === "transfer" ? "e.g. Restocking bar" : "e.g. Weekly delivery"}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="mt-1"
            />
          </div>

          <Button
            className="w-full h-12 font-bold"
            onClick={handleSave}
            disabled={saving || !productId || (movementType === "delivery" ? !purchaseQuantity || unitCost === "" : !quantityMl)}
          >
            {saving ? "Saving..." : "Record Movement"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Ledger() {
  const { venue, user } = useAuth();
  const [, setLocation] = useLocation();
  const isPro = venue?.tier === "pro" || venue?.tier === "premium";

  const { data: movements, isLoading } = useMovements(venue?.id);
  const { data: products } = useProducts(venue?.id);
  const [addOpen, setAddOpen] = useState(false);

  const productMap = useMemo(
    () => new Map((products ?? []).map(p => [p.id, p])),
    [products],
  );

  const grouped = useMemo(() => {
    if (!movements) return {};
    return groupByDate(movements);
  }, [movements]);

  if (!isPro) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
          <button onClick={() => setLocation("/library")} className="text-muted-foreground">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-primary">Stock Movements</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <div className="font-bold text-lg mb-1">Pro feature</div>
            <div className="text-sm text-muted-foreground max-w-xs">
              Track deliveries, transfers between locations, and wastage with the stock movement ledger.
            </div>
          </div>
          <Button onClick={() => setLocation("/settings?tab=subscription")}>
            Upgrade to Pro
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => setLocation("/library")} className="text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">Stock Movements</h1>
          <div className="text-xs text-muted-foreground">Deliveries, transfers and wastage</div>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-movement">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-24 space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <ArrowLeftRight className="mx-auto w-12 h-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No movements recorded</p>
            <p className="text-sm text-muted-foreground">Log deliveries, transfers between locations, and wastage.</p>
            <Button onClick={() => setAddOpen(true)} data-testid="button-add-first-movement">Record Movement</Button>
          </div>
        ) : (
          Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">{dateLabel}</div>
              <div className="space-y-2">
                {items.map(m => {
                  const product = productMap.get(m.product_id);
                  const Icon = MOVEMENT_ICONS[m.movement_type as MovementType] ?? ArrowLeftRight;
                  const bottles = product?.size_ml
                    ? (m.quantity_ml / product.size_ml).toFixed(1)
                    : null;
                  return (
                    <div
                      key={m.id}
                      className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"
                      data-testid={`movement-row-${m.id}`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${MOVEMENT_COLORS[m.movement_type as MovementType]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{product?.name ?? "Unknown product"}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={`text-[10px] px-1.5 py-0 ${MOVEMENT_COLORS[m.movement_type as MovementType]}`}>
                            {MOVEMENT_LABELS[m.movement_type as MovementType]}
                          </Badge>
                          {m.reason && (
                            <span className="text-xs text-muted-foreground truncate">{m.reason}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold tabular-nums text-sm">{Math.round(m.quantity_ml)}ml</div>
                        {bottles && (
                          <div className="text-xs text-muted-foreground tabular-nums">{bottles} btl</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <Button
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-xl z-40"
        size="icon"
        onClick={() => setAddOpen(true)}
        data-testid="button-add-movement-fab"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {venue?.id && user?.id && (
        <AddMovementSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          venueId={venue.id}
          userId={user.id}
        />
      )}
    </div>
  );
}
