import React, { useState, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useLatestReadingsByProduct, useBaselineAudits, useAddBaselineAudit, useDeleteBaselineAudit } from "@/hooks/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  calcWeighValuation,
  calcCountValuation,
  calcTenths,
  calcGpPercent,
  calcProductGpPercent,
  calcCostPerMeasure,
  formatGBP,
  CATEGORY_LABELS,
  productCapacityMl,
} from "@/lib/calculations";
import { Download, Copy, TrendingDown, Lock, MapPin, Sparkles, AlertTriangle, Info, X, ClipboardCheck, Plus, Trash2, CheckCircle2, Upload } from "lucide-react";
import Papa from "papaparse";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLocations, useStocktakes, useStocktakeReadings, useInsertSalesRecords, useSalesRecords, useMovements } from "@/hooks/api";
import { useInsights, useGenerateInsights, useDismissInsight } from "@/hooks/useInsights";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useDeliveries } from "@/hooks/useDeliveries";
import { deliveryProvenanceLabel, summariseDeliveryProvenance } from "@/lib/deliveries";
import {
  costPerSoldUnit,
  gpPercentForProduct,
  isDiscreteCountProduct,
  isVolumeCountingMethod,
  movementValueFromMl,
  purchaseUnitLabel,
  purchaseUnitsFromReading,
  stockValueFromReading,
} from "@/lib/inventory-reporting";

export default function Reports() {
  const { venue } = useAuth();
  const { toast } = useToast();
  const isPro = venue?.tier === "pro" || venue?.tier === "premium";
  const isPremium = venue?.tier === "premium";
  const [, setLocation] = useLocation();
  const { data: products } = useProducts(venue?.id);
  const { data: latestByProduct = {} } = useLatestReadingsByProduct(venue?.id);
  const { data: locations } = useLocations(venue?.id);
  const { data: insights, isLoading: insightsLoading } = useInsights(isPremium ? venue?.id : undefined);
  const generateInsights = useGenerateInsights();
  const dismissInsight = useDismissInsight();

  React.useEffect(() => {
    if (isPremium && venue?.id) {
      generateInsights.mutate({
        venueId: venue.id,
        orderCycleDays: venue.order_cycle_days ?? 21,
        defaultMeasureMl: venue.measure_ml ?? 25,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium, venue?.id]);

  const measureMl = venue?.measure_ml ?? 25;
  const [showZeroRows, setShowZeroRows] = useState(false);

  const valuationRows = useMemo(() => {
    if (!products) return [];
    return products.map(p => {
      const reading = latestByProduct[p.id];
      let mlRemaining = reading?.ml_remaining ?? 0;
      const count = reading?.count ?? 0;
      const capMl = productCapacityMl(p);

      const isVolumeMethod = p.counting_method === "keg_weight" || p.counting_method === "dipstick" || p.counting_method === "tenths_pints";
      const isCountUnit = p.unit === "count" && !isVolumeMethod;

      let value = 0;
      if (isCountUnit && p.cost_price) {
        value = calcCountValuation(count, p.cost_price);
      } else if (p.cost_price && capMl > 0) {
        value = calcWeighValuation(mlRemaining, capMl, p.cost_price);
      }

      const tenths = capMl > 0 ? calcTenths(mlRemaining, capMl) : null;
      const locName = (p as any).locations?.name ?? "—";

      return { p, mlRemaining, count, value, tenths, locName, reading };
    }).sort((a, b) => b.value - a.value);
  }, [products, latestByProduct]);

  const totalValue = useMemo(() => valuationRows.reduce((s, r) => s + r.value, 0), [valuationRows]);
  const zeroRowCount = valuationRows.filter(r => r.value === 0).length;
  const displayedValuationRows = showZeroRows ? valuationRows : valuationRows.filter(r => r.value > 0);

  const gpRows = useMemo(() => {
    if (!products) return [];
    return products
      .map(p => {
        const gp = gpPercentForProduct(p, measureMl);
        const cpm = costPerSoldUnit(p, measureMl);
        if (gp === null || cpm === null) return null;
        return { p, cpm, gp };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.gp - b.gp); // worst GP first
  }, [products, measureMl]);

  // Overall live GP% (simple average across priced products) — used for the baseline comparison card.
  const liveGpPercent = useMemo(() => {
    if (!gpRows.length) return null;
    return gpRows.reduce((sum, r) => sum + r.gp, 0) / gpRows.length;
  }, [gpRows]);

  const { data: baselineAudits } = useBaselineAudits(venue?.id);
  const addBaselineAudit = useAddBaselineAudit();
  const deleteBaselineAudit = useDeleteBaselineAudit();
  const latestBaseline = baselineAudits?.[0] ?? null;
  const [baselineFormOpen, setBaselineFormOpen] = useState(false);

  // ── COGS / Sales ────────────────────────────────────────────────────────────
  const [salesUploadOpen, setSalesUploadOpen] = useState(false);
  const [openingStocktakeId, setOpeningStocktakeId] = useState("");
  const [closingStocktakeId, setClosingStocktakeId] = useState("");
  const { data: stocktakes } = useStocktakes(venue?.id);
  const openingStocktake = stocktakes?.find(s => s.id === openingStocktakeId);
  const closingStocktake = stocktakes?.find(s => s.id === closingStocktakeId);
  const periodStart = openingStocktake?.opened_at?.slice(0, 10);
  const periodEnd = (closingStocktake?.closed_at ?? closingStocktake?.opened_at)?.slice(0, 10);
  const { data: periodDeliveries = [] } = useDeliveries(venue?.id, periodStart, periodEnd);
  const deliveryProvenance = useMemo(
    () => summariseDeliveryProvenance(periodDeliveries),
    [periodDeliveries],
  );
  const openingReadings = useStocktakeReadings(venue?.id, openingStocktakeId || undefined);
  const closingReadings = useStocktakeReadings(venue?.id, closingStocktakeId || undefined);
  const { data: periodSales } = useSalesRecords(venue?.id, periodStart, periodEnd);
  const { data: periodMovements } = useQuery({
    queryKey: ["period-movements", venue?.id, periodStart, periodEnd],
    queryFn: async () => {
      if (!venue?.id || !periodStart || !periodEnd) return [];
      const { data } = await supabase
        .from("stock_movements")
        .select("product_id, movement_type, quantity_ml, unit_cost_pence")
        .eq("venue_id", venue.id)
        .gte("moved_at", periodStart)
        .lte("moved_at", periodEnd + "T23:59:59Z");
      return data ?? [];
    },
    enabled: !!venue?.id && !!periodStart && !!periodEnd,
    staleTime: 30_000,
  });

  const cogsRows = useMemo(() => {
    if (!products || !openingReadings.data || !closingReadings.data) return [];
    const openingMap = new Map<string, { ml: number; count: number | null }>();
    for (const r of openingReadings.data) openingMap.set(r.product_id, { ml: r.ml_remaining, count: r.count });
    const closingMap = new Map<string, { ml: number; count: number | null }>();
    for (const r of closingReadings.data) closingMap.set(r.product_id, { ml: r.ml_remaining, count: r.count });
    const relevantIds = new Set([...openingMap.keys(), ...closingMap.keys()]);
    if (relevantIds.size === 0) return [];
    return products
      .filter(p => relevantIds.has(p.id))
      .map(p => {
        const oe = openingMap.get(p.id);
        const ce = closingMap.get(p.id);
        const openingValue = stockValueFromReading(p, oe ? { ml_remaining: oe.ml, count: oe.count } : null);
        const closingActual = stockValueFromReading(p, ce ? { ml_remaining: ce.ml, count: ce.count } : null);
        const deliveriesValue = (periodMovements ?? [])
          .filter(m => m.product_id === p.id && m.movement_type === "delivery")
          .reduce((sum, m) => sum + movementValueFromMl(p, m.quantity_ml, m.unit_cost_pence), 0);
        const wastageValue = (periodMovements ?? [])
          .filter(m => m.product_id === p.id && m.movement_type === "wastage")
          .reduce((sum, m) => sum + movementValueFromMl(p, m.quantity_ml, m.unit_cost_pence), 0);
        const soldUnitCost = costPerSoldUnit(p, measureMl) ?? 0;
        const salesAtCost = (periodSales ?? [])
          .filter(s => s.product_id === p.id)
          .reduce((sum, s) => sum + s.quantity_sold * soldUnitCost, 0);
        const expectedClosing = openingValue + deliveriesValue - salesAtCost - wastageValue;
        const variance = closingActual - expectedClosing;
        return { product: p, openingValue, deliveriesValue, salesAtCost, wastageValue, expectedClosing, closingActual, variance };
      })
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [products, openingReadings.data, closingReadings.data, periodMovements, periodSales, measureMl]);

  // ── Unused & Excess Inventory ──────────────────────────────────────────────
  const EXCESS_THRESHOLD = 1.5;
  const [inventoryView, setInventoryView] = useState<"unused" | "excess">("unused");
  const [lookbackDays, setLookbackDays] = useState(30);
  const lookbackStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - lookbackDays);
    return d.toISOString().slice(0, 10);
  }, [lookbackDays]);
  const { data: allMovements } = useMovements(venue?.id);
  const { data: lookbackSales } = useSalesRecords(venue?.id, lookbackStart);

  const unusedRows = useMemo(() => {
    if (!products) return [];
    const outboundInPeriod = new Set<string>();
    const lastMovedAt = new Map<string, string>();
    for (const m of allMovements ?? []) {
      const prev = lastMovedAt.get(m.product_id);
      if (!prev || m.moved_at > prev) lastMovedAt.set(m.product_id, m.moved_at);
      if ((m.movement_type === "wastage" || m.movement_type === "transfer") && m.moved_at >= lookbackStart) {
        outboundInPeriod.add(m.product_id);
      }
    }
    const soldInPeriod = new Set<string>();
    for (const s of lookbackSales ?? []) {
      if (s.product_id) soldInPeriod.add(s.product_id);
    }
    const today = new Date();
    return products
      .filter(p => {
        const reading = latestByProduct[p.id];
        if (!reading) return false;
        const hasStock = p.unit === "count" ? (reading.count ?? 0) > 0 : reading.ml_remaining > 0;
        if (!hasStock) return false;
        return !outboundInPeriod.has(p.id) && !soldInPeriod.has(p.id);
      })
      .map(p => {
        const reading = latestByProduct[p.id]!;
        const lastMoved = lastMovedAt.get(p.id);
        const daysSince = lastMoved
          ? Math.floor((today.getTime() - new Date(lastMoved).getTime()) / 86_400_000)
          : null;
        const mlRemaining = reading.ml_remaining;
        const count = reading.count ?? 0;
        const capMl = productCapacityMl(p);
        const value = p.unit === "count" && p.cost_price
          ? count * p.cost_price
          : (p.cost_price && capMl > 0 ? (mlRemaining / capMl) * p.cost_price : 0);
        return { product: p, value, daysSince, mlRemaining, count };
      })
      .sort((a, b) => b.value - a.value);
  }, [products, allMovements, lookbackSales, latestByProduct, lookbackStart]);

  const excessRows = useMemo(() => {
    if (!products) return [];
    return products
      .filter(p => {
        const parLevel = (p as any).par_level as number | null | undefined;
        if (!parLevel || parLevel <= 0) return false;
        const reading = latestByProduct[p.id];
        if (!reading) return false;
        const currentQty = purchaseUnitsFromReading(p, reading);
        return currentQty > parLevel * EXCESS_THRESHOLD;
      })
      .map(p => {
        const parLevel = (p as any).par_level as number;
        const reading = latestByProduct[p.id]!;
        const currentQty = purchaseUnitsFromReading(p, reading);
        const excessQty = currentQty - parLevel;
        const excessValue = p.cost_price != null ? excessQty * p.cost_price : null;
        return { product: p, currentQty, parLevel, excessQty, excessValue };
      })
      .sort((a, b) => (b.excessValue ?? 0) - (a.excessValue ?? 0));
  }, [products, latestByProduct]);

  // ── Order Guide (fill to par) ──────────────────────────────────────────────
  const orderRows = useMemo(() => {
    if (!products) return [];
    return products
      .filter(p => {
        if (!p.par_level || p.par_level <= 0) return false;
        const reading = latestByProduct[p.id];
        const currentQty = purchaseUnitsFromReading(p, reading);
        return currentQty < p.par_level;
      })
      .map(p => {
        const reading = latestByProduct[p.id];
        const currentQty = purchaseUnitsFromReading(p, reading);
        const parLevel = p.par_level!;
        const shortfall = Math.ceil(parLevel - currentQty);
        const unit = purchaseUnitLabel(p);
        const costToFill = p.cost_price != null ? shortfall * p.cost_price : null;
        return { product: p, vendor: p.vendor?.trim() || "", currentQty, parLevel, shortfall, unit, costToFill };
      });
  }, [products, latestByProduct]);

  const orderGroups = useMemo(() => {
    const groups = new Map<string, typeof orderRows>();
    for (const row of orderRows) {
      const key = row.vendor;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => (b.costToFill ?? 0) - (a.costToFill ?? 0));
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    });
    return keys.map(k => ({ vendor: k || "No vendor", rows: groups.get(k)! }));
  }, [orderRows]);

  const exportOrderCSV = () => {
    const rows: object[] = [];
    for (const group of orderGroups) {
      for (const r of group.rows) {
        rows.push({
          Vendor: group.vendor,
          Product: r.product.name,
          SKU: r.product.sku ?? "",
          "Current qty": `${r.currentQty.toFixed(1)} ${r.unit}`,
          "Par level": `${r.parLevel} ${r.unit}`,
          "Order qty": `${r.shortfall} ${r.unit}`,
          "Cost to fill (ex-VAT)": r.costToFill != null ? r.costToFill.toFixed(2) : "",
        });
      }
    }
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stocktap-order-guide-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyOrderList = () => {
    const lines: string[] = [`Order guide — ${new Date().toLocaleDateString("en-GB")}`, ""];
    for (const group of orderGroups) {
      lines.push(`${group.vendor}`);
      for (const r of group.rows) {
        const cost = r.costToFill != null ? `  ${formatGBP(r.costToFill)}` : "";
        lines.push(`  ${r.product.name}  ${r.shortfall} ${r.unit}${cost}`);
      }
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() =>
      toast({ title: "Copied", description: "Order list copied to clipboard." })
    );
  };

  const exportValuationCSV = () => {
    const rows = valuationRows.map(r => ({
      Product: r.p.name,
      Type: r.p.type,
      Location: r.locName,
      Qty: (() => { const vM = r.p.counting_method === "keg_weight" || r.p.counting_method === "dipstick" || r.p.counting_method === "tenths_pints"; const cU = r.p.unit === "count" && !vM; return cU ? `${Math.round(r.count)} units` : vM && r.p.container_l ? `${(r.mlRemaining / 1000).toFixed(1)}L` : `${Math.round(r.mlRemaining)}ml`; })(),
      Tenths: (() => { const vM = r.p.counting_method === "keg_weight" || r.p.counting_method === "dipstick" || r.p.counting_method === "tenths_pints"; const cU = r.p.unit === "count" && !vM; return cU || vM ? "—" : (r.tenths?.toFixed(1) ?? "—"); })(),
      "Value (£)": r.value.toFixed(2),
    }));
    rows.push({ Product: "TOTAL", Type: "" as (typeof rows)[0]["Type"], Location: "", Qty: "", Tenths: "", "Value (£)": totalValue.toFixed(2) });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stocktap-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportGPCSV = () => {
    const rows = gpRows.map(r => ({
      Product: r.p.name,
      "Cost/Measure (£)": r.cpm.toFixed(4),
      "Pour Price (£)": r.p.pour_price?.toFixed(2) ?? "—",
      "GP%": r.gp.toFixed(1),
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stocktap-gp-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-primary">Reports</h1>
      </div>

      <Tabs defaultValue="valuation" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-4 grid grid-cols-3 h-auto">
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="gp">GP Analysis</TabsTrigger>
          <TabsTrigger value="bylocation">By Location</TabsTrigger>
          <TabsTrigger value="cogs" data-testid="tab-cogs">COGS</TabsTrigger>
          <TabsTrigger value="baseline" data-testid="tab-baseline">Baseline</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">Insights</TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory</TabsTrigger>
          <TabsTrigger value="order" data-testid="tab-order">Order</TabsTrigger>
        </TabsList>

        <TabsContent value="valuation" className="flex-1 overflow-auto mt-0">
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <div className="text-xs text-muted-foreground">Total Stock Value</div>
                <div className="text-3xl font-bold text-primary">{formatGBP(totalValue)}</div>
              </div>
              {isPro ? (
                <Button size="sm" variant="outline" onClick={exportValuationCSV} data-testid="button-export-valuation">
                  <Download className="w-4 h-4 mr-1.5" /> CSV
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-muted-foreground border-dashed" onClick={() => setLocation("/settings?tab=subscription")} data-testid="button-export-valuation">
                  <Lock className="w-3.5 h-3.5 mr-1.5" /> Pro
                </Button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Product</TableHead>
                    <TableHead className="font-semibold">Location</TableHead>
                    <TableHead className="font-semibold text-right">Qty</TableHead>
                    <TableHead className="font-semibold text-right">Tenths</TableHead>
                    <TableHead className="font-semibold text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedValuationRows.map(({ p, mlRemaining, count, value, tenths, locName, reading }) => {
                    const isVolM = p.counting_method === "keg_weight" || p.counting_method === "dipstick" || p.counting_method === "tenths_pints";
                    const isCnt = p.unit === "count" && !isVolM;
                    return (
                    <TableRow key={p.id} data-testid={`row-valuation-${p.id}`}>
                      <TableCell className="font-medium text-sm max-w-[120px] truncate">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{locName}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{!reading ? "—" : isCnt ? `${Math.round(count)} units` : isVolM && p.container_l ? `${(mlRemaining / 1000).toFixed(1)}L` : `${Math.round(mlRemaining)}ml`}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{!reading || isCnt || isVolM ? "—" : (tenths != null ? tenths.toFixed(1) : "—")}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-sm">{formatGBP(value)}</TableCell>
                    </TableRow>
                    );
                  })}
                  <TableRow className="bg-primary/5 font-bold">
                    <TableCell colSpan={4} className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold text-primary">{formatGBP(totalValue)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {zeroRowCount > 0 && (
              <button
                onClick={() => setShowZeroRows(!showZeroRows)}
                className="text-xs text-muted-foreground hover:text-foreground mt-2 block w-full text-center transition-colors"
                data-testid="button-toggle-zero-rows"
              >
                {showZeroRows
                  ? `Hide ${zeroRowCount} unweighed product${zeroRowCount === 1 ? "" : "s"}`
                  : `Show ${zeroRowCount} unweighed product${zeroRowCount === 1 ? "" : "s"} (£0.00)`}
              </button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="gp" className="flex-1 overflow-auto mt-0">
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm text-muted-foreground">Sorted worst GP first · Prices ex-VAT</div>
              {isPro ? (
                <Button size="sm" variant="outline" onClick={exportGPCSV} data-testid="button-export-gp">
                  <Download className="w-4 h-4 mr-1.5" /> CSV
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-muted-foreground border-dashed" onClick={() => setLocation("/settings?tab=subscription")} data-testid="button-export-gp">
                  <Lock className="w-3.5 h-3.5 mr-1.5" /> Pro
                </Button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Product</TableHead>
                    <TableHead className="font-semibold text-right">Cost/measure</TableHead>
                    <TableHead className="font-semibold text-right">Pour price</TableHead>
                    <TableHead className="font-semibold text-right">GP%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gpRows.map(({ p, cpm, gp }) => (
                    <TableRow
                      key={p.id}
                      className={gp < 60 ? "bg-amber-50" : ""}
                      data-testid={`row-gp-${p.id}`}
                    >
                      <TableCell className="font-medium text-sm max-w-[140px] truncate">
                        {p.name}
                        {gp < 60 && <TrendingDown className="w-3.5 h-3.5 inline ml-1 text-amber-600" />}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatGBP(cpm)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatGBP(p.pour_price!)}</TableCell>
                      <TableCell className={`text-right font-bold tabular-nums ${gp < 60 ? "text-amber-700" : "text-green-700"}`}>
                        {gp.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                  {gpRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8 text-sm">
                        Add cost and pour prices to products to see GP analysis
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bylocation" className="flex-1 overflow-auto mt-0">
          <div className="p-4 space-y-5">
            {!isPro ? (
              <div className="flex flex-col items-center text-center py-10 gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-bold mb-1">Pro feature</div>
                  <div className="text-sm text-muted-foreground max-w-xs">Per-location valuation breakdown is available on the Pro plan.</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setLocation("/settings?tab=subscription")}>Upgrade to Pro</Button>
              </div>
            ) : (() => {
              const locationMap = new Map((locations ?? []).map(l => [l.id, l.name]));
              const grouped: Record<string, typeof valuationRows> = {};
              for (const row of valuationRows) {
                const locId = row.reading?.location_id ?? "__none__";
                const locLabel = locationMap.get(locId) ?? (locId === "__none__" ? "Unassigned" : "Unknown");
                if (!grouped[locLabel]) grouped[locLabel] = [];
                grouped[locLabel].push(row);
              }
              const locationTotals = Object.entries(grouped).map(([name, rows]) => ({
                name,
                total: rows.reduce((s, r) => s + r.value, 0),
                rows,
              })).sort((a, b) => b.total - a.total);
              return locationTotals.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <MapPin className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  No readings yet — run a stocktake first.
                </div>
              ) : (
                locationTotals.map(({ name, total, rows }) => (
                  <div key={name} className="rounded-xl border border-border overflow-hidden">
                    <div className="flex justify-between items-center px-4 py-2.5 bg-muted/50 border-b border-border">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-semibold text-sm">{name}</span>
                      </div>
                      <span className="font-bold tabular-nums text-sm text-primary">{formatGBP(total)}</span>
                    </div>
                    <div className="divide-y divide-border">
                      {rows.map(({ p, mlRemaining, count, value, tenths, reading }) => {
                        const isVolM2 = p.counting_method === "keg_weight" || p.counting_method === "dipstick" || p.counting_method === "tenths_pints";
                        const isCnt2 = p.unit === "count" && !isVolM2;
                        return (
                        <div key={p.id} className="flex items-center px-4 py-2 gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            {reading && (
                              <div className="text-xs text-muted-foreground tabular-nums">
                                {isCnt2
                                  ? `${Math.round(count)} units`
                                  : isVolM2 && p.container_l
                                    ? `${(mlRemaining / 1000).toFixed(1)}L`
                                    : `${Math.round(mlRemaining)}ml · ${tenths != null ? tenths.toFixed(1) : "—"} tenths`}
                              </div>
                            )}
                          </div>
                          <div className="text-right tabular-nums font-semibold text-sm">{formatGBP(value)}</div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              );
            })()}
          </div>
        </TabsContent>

        <TabsContent value="baseline" className="flex-1 overflow-auto mt-0">
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-start gap-3">
              <div className="text-sm text-muted-foreground max-w-[70%]">
                Import the headline numbers from your stocktaker's (e.g. Venners) audit report to compare their snapshot against StockTap's live numbers.
              </div>
              <Button size="sm" onClick={() => setBaselineFormOpen(true)} data-testid="button-import-baseline">
                <Plus className="w-4 h-4 mr-1.5" /> Import report
              </Button>
            </div>

            {latestBaseline ? (
              <Card className="border-[#E0A343]/40 bg-[#E0A343]/5" data-testid="card-baseline-comparison">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <ClipboardCheck className="w-4 h-4" />
                    Baseline vs StockTap
                  </div>
                  <p className="text-sm text-foreground">
                    Your stocktaker said GP{" "}
                    <span className="font-bold tabular-nums">
                      {latestBaseline.actual_gp_percent != null ? `${Number(latestBaseline.actual_gp_percent).toFixed(2)}%` : "—"}
                    </span>{" "}
                    vs optimum{" "}
                    <span className="font-bold tabular-nums">
                      {latestBaseline.optimum_gp_percent != null ? `${Number(latestBaseline.optimum_gp_percent).toFixed(1)}%` : "—"}
                    </span>{" "}
                    on {new Date(latestBaseline.audit_date).toLocaleDateString("en-GB")} — StockTap live GP today is{" "}
                    <span className="font-bold tabular-nums text-primary">
                      {liveGpPercent != null ? `${liveGpPercent.toFixed(2)}%` : "not enough priced products yet"}
                    </span>
                    .
                  </p>
                  {liveGpPercent != null && latestBaseline.actual_gp_percent != null && (
                    <div className="text-xs text-muted-foreground">
                      {liveGpPercent >= Number(latestBaseline.actual_gp_percent)
                        ? "Live GP is holding at or above your last stocktaker visit — keep it up."
                        : "Live GP has drifted below your last stocktaker visit — worth a closer look before your next audit."}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ClipboardCheck className="w-8 h-8 mx-auto mb-3 opacity-40" />
                No stocktaker reports imported yet. Import your last Venners audit to see how it compares to StockTap's live numbers.
              </div>
            )}

            {baselineAudits && baselineAudits.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Import history</div>
                {baselineAudits.map((a: any) => (
                  <Card key={a.id} data-testid={`card-baseline-audit-${a.id}`}>
                    <CardContent className="p-3 flex justify-between items-center">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {a.site || "Audit"} {a.job_number ? `· Job ${a.job_number}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(a.audit_date).toLocaleDateString("en-GB")} · Actual GP {a.actual_gp_percent != null ? `${Number(a.actual_gp_percent).toFixed(2)}%` : "—"} · Optimum {a.optimum_gp_percent != null ? `${Number(a.optimum_gp_percent).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive h-8 w-8 shrink-0"
                        onClick={() => venue?.id && deleteBaselineAudit.mutate({ id: a.id, venue_id: venue.id })}
                        data-testid={`button-delete-baseline-${a.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <BaselineImportSheet
            open={baselineFormOpen}
            onClose={() => setBaselineFormOpen(false)}
            venueId={venue?.id}
            onSubmit={(payload) => {
              if (!venue?.id) return;
              addBaselineAudit.mutate(
                { ...payload, venue_id: venue.id },
                {
                  onSuccess: () => setBaselineFormOpen(false),
                }
              );
            }}
            isPending={addBaselineAudit.isPending}
          />
        </TabsContent>

        <TabsContent value="insights" className="flex-1 overflow-auto mt-0">
          <div className="p-4 space-y-3">
            {!isPremium ? (
              <div className="flex flex-col items-center text-center py-10 gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-bold mb-1">Premium feature</div>
                  <div className="text-sm text-muted-foreground max-w-xs">
                    The AI insight engine flags variance, over-pouring and GP drift automatically. Available on the Premium plan.
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setLocation("/settings?tab=subscription")}>Upgrade to Premium</Button>
              </div>
            ) : insightsLoading || generateInsights.isPending ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Analysing your data...</div>
            ) : !insights || insights.length === 0 ? (
              <div className="flex flex-col items-center text-center py-10 gap-3">
                <Sparkles className="w-8 h-8 text-muted-foreground opacity-40" />
                <div className="text-sm text-muted-foreground max-w-xs">
                  Not enough data yet — keep logging weigh-ins and till entries and insights will appear here weekly.
                </div>
              </div>
            ) : (
              insights.map((insight) => {
                const Icon = insight.severity === "critical" ? AlertTriangle : insight.severity === "warning" ? TrendingDown : Info;
                const colorClass =
                  insight.severity === "critical" ? "text-[#E5544B] border-[#E5544B]/30 bg-[#E5544B]/5"
                  : insight.severity === "warning" ? "text-[#E0A343] border-[#E0A343]/30 bg-[#E0A343]/5"
                  : "text-muted-foreground border-border";
                return (
                  <Card key={insight.id} className={colorClass} data-testid={`card-insight-${insight.id}`}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-foreground">{insight.title}</div>
                        <p className="text-sm text-muted-foreground mt-1">{insight.body}</p>
                      </div>
                      <button
                        onClick={() => venue?.id && dismissInsight.mutate({ id: insight.id, venue_id: venue.id })}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label="Dismiss"
                        data-testid={`button-dismiss-insight-${insight.id}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="cogs" className="flex-1 overflow-auto mt-0">
          <div className="px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Usage &amp; Cost of Goods</h2>
              <Button size="sm" variant="outline" onClick={() => setSalesUploadOpen(true)} data-testid="button-upload-sales">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload sales
              </Button>
            </div>

            {(!stocktakes || stocktakes.length < 2) ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <ClipboardCheck className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-sm font-medium">Complete at least 2 stocktakes</p>
                <p className="text-xs text-muted-foreground max-w-xs">COGS is calculated by comparing two stocktake snapshots. Close your first stocktake and run another to unlock this report.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Opening stocktake</label>
                    <Select value={openingStocktakeId} onValueChange={setOpeningStocktakeId}>
                      <SelectTrigger className="h-9 text-xs" data-testid="select-opening-stocktake">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {stocktakes.map(s => (
                          <SelectItem key={s.id} value={s.id} disabled={s.id === closingStocktakeId}>
                            {new Date(s.opened_at).toLocaleDateString("en-GB")}{s.status === "open" ? " (open)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Closing stocktake</label>
                    <Select value={closingStocktakeId} onValueChange={setClosingStocktakeId}>
                      <SelectTrigger className="h-9 text-xs" data-testid="select-closing-stocktake">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {stocktakes.map(s => (
                          <SelectItem key={s.id} value={s.id} disabled={s.id === openingStocktakeId}>
                            {new Date(s.opened_at).toLocaleDateString("en-GB")}{s.status === "open" ? " (open)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(!openingStocktakeId || !closingStocktakeId) ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Select two stocktakes above to calculate COGS for that period.</p>
                ) : (openingReadings.isLoading || closingReadings.isLoading) ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading stocktake data…</p>
                ) : cogsRows.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-sm font-medium">No products found in either stocktake</p>
                    <p className="text-xs text-muted-foreground">Readings must be linked to a stocktake via the stocktake flow — spot checks won't appear here.</p>
                  </div>
                ) : (
                  <>
                    {(openingStocktake?.status === "open" || closingStocktake?.status === "open") && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40" data-testid="section-open-stocktake-warning">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                          {openingStocktake?.status === "open" && closingStocktake?.status === "open"
                            ? "Both stocktakes are still open — figures are provisional until they are closed."
                            : openingStocktake?.status === "open"
                              ? "Opening stocktake is still open — figures are provisional until it is closed."
                              : "Closing stocktake is still open — figures are provisional until it is closed."}
                        </p>
                      </div>
                    )}
                    {periodSales !== undefined && periodSales.length === 0 && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40" data-testid="section-no-sales-warning">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">No sales data for this period. Upload a sales CSV to complete the COGS calculation.</p>
                      </div>
                    )}
                    {periodDeliveries.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="section-purchase-provenance">
                        {(["ledger", "invoice", "mid_stocktake"] as const).map(method => (
                          <div key={method} className="rounded-xl border border-border bg-card p-3">
                            <div className="text-xs text-muted-foreground">{deliveryProvenanceLabel(method)}</div>
                            <div className="font-bold tabular-nums mt-1">{formatGBP(deliveryProvenance.byMethod[method] / 100)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="overflow-auto rounded-xl border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold text-xs">Product</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Opening</TableHead>
                            <TableHead className="font-semibold text-xs text-right">+Deliveries</TableHead>
                            <TableHead className="font-semibold text-xs text-right">−Sales</TableHead>
                            <TableHead className="font-semibold text-xs text-right">−Wastage</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Expected</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Actual</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Variance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cogsRows.map(({ product: p, openingValue, deliveriesValue, salesAtCost, wastageValue, expectedClosing, closingActual, variance }) => (
                            <TableRow key={p.id} data-testid={`row-cogs-${p.id}`}>
                              <TableCell className="text-xs font-medium max-w-[90px] truncate">{p.name}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{formatGBP(openingValue)}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{formatGBP(deliveriesValue)}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{formatGBP(salesAtCost)}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{formatGBP(wastageValue)}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{formatGBP(expectedClosing)}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{formatGBP(closingActual)}</TableCell>
                              <TableCell className={`text-xs text-right tabular-nums font-semibold ${variance < -0.005 ? "text-[#E5544B]" : variance > 0.005 ? "text-[#3FAE74]" : "text-muted-foreground"}`}>
                                {variance > 0 ? "+" : ""}{formatGBP(variance)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-primary/5 font-bold">
                            <TableCell className="text-xs font-bold">Total</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold">{formatGBP(cogsRows.reduce((s, r) => s + r.openingValue, 0))}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold">{formatGBP(cogsRows.reduce((s, r) => s + r.deliveriesValue, 0))}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold">{formatGBP(cogsRows.reduce((s, r) => s + r.salesAtCost, 0))}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold">{formatGBP(cogsRows.reduce((s, r) => s + r.wastageValue, 0))}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold">{formatGBP(cogsRows.reduce((s, r) => s + r.expectedClosing, 0))}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold">{formatGBP(cogsRows.reduce((s, r) => s + r.closingActual, 0))}</TableCell>
                            {(() => { const v = cogsRows.reduce((s, r) => s + r.variance, 0); return (
                              <TableCell className={`text-xs text-right tabular-nums font-bold ${v < -0.005 ? "text-[#E5544B]" : v > 0.005 ? "text-[#3FAE74]" : "text-muted-foreground"}`}>
                                {v > 0 ? "+" : ""}{formatGBP(v)}
                              </TableCell>
                            ); })()}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-xs text-muted-foreground">Variance = Actual closing − Expected closing. Negative means more used or missing than expected.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Inventory: Unused & Excess ─────────────────────────────────── */}
        <TabsContent value="inventory" className="flex-1 overflow-auto mt-0">
          <div className="px-4 py-4 space-y-4">
            {/* View toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
              <button
                onClick={() => setInventoryView("unused")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${inventoryView === "unused" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-unused"
              >
                Unused
              </button>
              <button
                onClick={() => setInventoryView("excess")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${inventoryView === "excess" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-excess"
              >
                Excess
              </button>
            </div>

            {inventoryView === "unused" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Unused Inventory</p>
                    <p className="text-xs text-muted-foreground">Stock on hand with no sales or outbound movements in the lookback window.</p>
                  </div>
                  <Select value={String(lookbackDays)} onValueChange={v => setLookbackDays(Number(v))}>
                    <SelectTrigger className="h-8 w-24 text-xs" data-testid="select-lookback-days">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {unusedRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
                    <CheckCircle2 className="w-10 h-10 text-[#3FAE74]/60" />
                    <p className="text-sm font-medium">No unused stock found</p>
                    <p className="text-xs text-muted-foreground">Everything on hand moved in the last {lookbackDays} days.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">{unusedRows.length} product{unusedRows.length === 1 ? "" : "s"} with no recorded usage in the last {lookbackDays} days</p>
                    <div className="overflow-auto rounded-xl border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold text-xs">Product</TableHead>
                            <TableHead className="font-semibold text-xs">Category</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Current qty</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Value</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Last movement</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unusedRows.map(({ product: p, value, daysSince, mlRemaining, count }) => (
                            <TableRow key={p.id} data-testid={`row-unused-${p.id}`}>
                              <TableCell className="text-xs font-medium max-w-[110px] truncate">{p.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{p.category ? (CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category) : "—"}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {p.unit === "count"
                                  ? `${count} units`
                                  : p.size_ml
                                    ? `${(mlRemaining / p.size_ml).toFixed(1)} btls`
                                    : `${Math.round(mlRemaining)}ml`}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums font-semibold">
                                {p.cost_price != null ? formatGBP(value) : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground tabular-nums">
                                {daysSince === null ? "Never moved" : `${daysSince}d ago`}
                              </TableCell>
                            </TableRow>
                          ))}
                          {unusedRows.some(r => r.product.cost_price != null) && (
                            <TableRow className="bg-primary/5 font-bold">
                              <TableCell colSpan={3} className="text-xs font-bold">Total dead-stock value</TableCell>
                              <TableCell className="text-xs text-right tabular-nums font-bold text-[#E5544B]">
                                {formatGBP(unusedRows.reduce((s, r) => s + r.value, 0))}
                              </TableCell>
                              <TableCell />
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
            )}

            {inventoryView === "excess" && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Excess Inventory</p>
                  <p className="text-xs text-muted-foreground">Products where current stock exceeds par level by more than 50%. Only products with a par level set appear here.</p>
                </div>

                {excessRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
                    <CheckCircle2 className="w-10 h-10 text-[#3FAE74]/60" />
                    <p className="text-sm font-medium">No excess stock found</p>
                    <p className="text-xs text-muted-foreground">
                      {products?.some(p => (p as any).par_level)
                        ? "All stocked products are within 150% of par."
                        : "Set par levels in the Library to enable this report."}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">{excessRows.length} product{excessRows.length === 1 ? "" : "s"} above 150% of par</p>
                    <div className="overflow-auto rounded-xl border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold text-xs">Product</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Current</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Par</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Excess qty</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Excess value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {excessRows.map(({ product: p, currentQty, parLevel, excessQty, excessValue }) => {
                            const unit = p.unit === "count" ? "units" : "btls";
                            return (
                              <TableRow key={p.id} data-testid={`row-excess-${p.id}`}>
                                <TableCell className="text-xs font-medium max-w-[110px] truncate">{p.name}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{currentQty.toFixed(1)} {unit}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{parLevel} {unit}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums text-[#E5544B] font-semibold">+{excessQty.toFixed(1)} {unit}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums font-semibold">
                                  {excessValue != null ? formatGBP(excessValue) : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {excessRows.some(r => r.excessValue != null) && (
                            <TableRow className="bg-primary/5 font-bold">
                              <TableCell colSpan={4} className="text-xs font-bold">Total excess value</TableCell>
                              <TableCell className="text-xs text-right tabular-nums font-bold text-[#E5544B]">
                                {formatGBP(excessRows.reduce((s, r) => s + (r.excessValue ?? 0), 0))}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Order Guide ────────────────────────────────────────────────── */}
        <TabsContent value="order" className="flex-1 overflow-auto mt-0">
          <div className="px-4 py-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Order Guide</p>
                <p className="text-xs text-muted-foreground">Products below par level, grouped by vendor. Only products with a par level set appear here.</p>
              </div>
              {orderGroups.length > 0 && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={copyOrderList} data-testid="button-copy-order">
                    <Copy className="w-3.5 h-3.5 mr-1.5" />Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportOrderCSV} data-testid="button-export-order">
                    <Download className="w-3.5 h-3.5 mr-1.5" />CSV
                  </Button>
                </div>
              )}
            </div>

            {orderGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
                <CheckCircle2 className="w-10 h-10 text-[#3FAE74]/60" />
                <p className="text-sm font-medium">All stocked up</p>
                <p className="text-xs text-muted-foreground">
                  {products?.some(p => p.par_level)
                    ? "Every product with a par level is at or above par."
                    : "Set par levels in the Library to enable order guides."}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold text-xs">Product</TableHead>
                        <TableHead className="font-semibold text-xs">SKU</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Current</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Par</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Order qty</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Cost (ex-VAT)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderGroups.map(({ vendor, rows }) => (
                        <React.Fragment key={vendor}>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={6} className="py-1.5 px-3">
                              <span className="text-[0.7rem] font-bold uppercase tracking-widest text-muted-foreground">{vendor}</span>
                            </TableCell>
                          </TableRow>
                          {rows.map(({ product: p, currentQty, parLevel, shortfall, unit, costToFill }) => (
                            <TableRow key={p.id} data-testid={`row-order-${p.id}`}>
                              <TableCell className="text-xs font-medium max-w-[110px] truncate pl-5">{p.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{p.sku || "—"}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{currentQty.toFixed(1)} {unit}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">{parLevel} {unit}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums font-semibold text-[#E0A343]">+{shortfall} {unit}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums font-semibold">
                                {costToFill != null ? formatGBP(costToFill) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      ))}
                      {orderRows.some(r => r.costToFill != null) && (
                        <TableRow className="bg-primary/5">
                          <TableCell colSpan={5} className="text-xs font-bold">Total cost to fill to par</TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-bold text-[#E0A343]">
                            {formatGBP(orderRows.reduce((s, r) => s + (r.costToFill ?? 0), 0))}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">Order qty rounded up to nearest whole unit. Set vendor names in the Library to group per supplier.</p>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <SalesUploadSheet
        open={salesUploadOpen}
        onClose={() => setSalesUploadOpen(false)}
        venueId={venue?.id ?? ""}
        products={products ?? []}
      />
    </div>
  );
}

// ── SalesUploadSheet ──────────────────────────────────────────────────────────

type SalesField = "product_name" | "quantity" | "date" | "sku" | "unit_price" | "revenue";

const SALES_FIELDS: { key: SalesField; label: string; required: boolean }[] = [
  { key: "product_name", label: "Product name", required: true },
  { key: "quantity", label: "Quantity sold", required: true },
  { key: "date", label: "Sale date", required: true },
  { key: "sku", label: "SKU / barcode", required: false },
  { key: "unit_price", label: "Unit price (£)", required: false },
  { key: "revenue", label: "Total revenue (£)", required: false },
];

function parseSaleDate(raw: string): string | null {
  const s = raw?.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoMatch) return isoMatch[1];
  return null;
}

interface ParsedSalesRow {
  product_name_raw: string;
  product_id: string | null;
  quantity_sold: number;
  unit_price_pence: number | null;
  revenue_pence: number | null;
  sale_date: string;
  matched: boolean;
}

function guessMapping(headers: string[]): Partial<Record<SalesField, string>> {
  const m: Partial<Record<SalesField, string>> = {};
  for (const h of headers) {
    const l = h.toLowerCase();
    if (!m.product_name && (l.includes("product") || l.includes("item") || l.includes("description") || l.includes("name"))) m.product_name = h;
    if (!m.quantity && (l === "qty" || l.includes("quantity") || l.includes("sold") || l === "units")) m.quantity = h;
    if (!m.date && (l.includes("date") || l === "day" || l.includes("period"))) m.date = h;
    if (!m.sku && (l.includes("sku") || l.includes("barcode") || l.includes("plu") || l.includes("code"))) m.sku = h;
    if (!m.unit_price && (l.includes("unit") && l.includes("price"))) m.unit_price = h;
    if (!m.revenue && (l.includes("revenue") || l.includes("total") || (l.includes("net") && l.includes("sale")))) m.revenue = h;
  }
  return m;
}

function SalesUploadSheet({ open, onClose, venueId, products }: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  products: { id: string; name: string; barcode?: string | null; sku?: string | null }[];
}) {
  const { toast } = useToast();
  const insertSales = useInsertSalesRecords();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<SalesField, string>>>({});
  const [previewRows, setPreviewRows] = useState<ParsedSalesRow[]>([]);
  const [insertedCount, setInsertedCount] = useState(0);

  const { nameMap, skuMap } = useMemo(() => {
    const nameMap = new Map<string, string>();
    const skuMap = new Map<string, string>();
    for (const p of products) {
      nameMap.set(p.name.trim().toLowerCase(), p.id);
      if (p.barcode) skuMap.set(String(p.barcode).trim().toLowerCase(), p.id);
      if (p.sku) skuMap.set(String(p.sku).trim().toLowerCase(), p.id);
    }
    return { nameMap, skuMap };
  }, [products]);

  const matchProduct = (name: string, sku: string) => {
    if (sku?.trim()) {
      const hit = skuMap.get(sku.trim().toLowerCase());
      if (hit) return hit;
    }
    const nl = name?.trim().toLowerCase();
    if (nl) {
      if (nameMap.has(nl)) return nameMap.get(nl)!;
      for (const [pName, pId] of nameMap) {
        if (nl.length > 3 && (pName.includes(nl) || nl.includes(pName))) return pId;
      }
    }
    return null;
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const headers: string[] = results.meta.fields ?? [];
        setRawHeaders(headers);
        setRawRows(results.data as Record<string, string>[]);
        setMapping(guessMapping(headers));
        setStep("map");
      },
      error: () => toast({ title: "Could not parse CSV", variant: "destructive" }),
    });
  };

  const handleApplyMapping = () => {
    if (!mapping.product_name || !mapping.quantity || !mapping.date) return;
    const rows: ParsedSalesRow[] = (rawRows as Record<string, string>[])
      .map(row => {
        const nameRaw = row[mapping.product_name!] ?? "";
        const qtyRaw = (row[mapping.quantity!] ?? "").replace(/[^0-9.-]/g, "");
        const dateRaw = row[mapping.date!] ?? "";
        const skuRaw = mapping.sku ? (row[mapping.sku] ?? "") : "";
        const upRaw = mapping.unit_price ? (row[mapping.unit_price] ?? "").replace(/[^0-9.-]/g, "") : "";
        const revRaw = mapping.revenue ? (row[mapping.revenue] ?? "").replace(/[^0-9.-]/g, "") : "";
        const qty = parseFloat(qtyRaw);
        const saleDate = parseSaleDate(dateRaw);
        if (!nameRaw.trim() || isNaN(qty) || qty <= 0 || !saleDate) return null;
        const productId = matchProduct(nameRaw, skuRaw);
        const up = upRaw ? Math.round(parseFloat(upRaw) * 100) : null;
        const rev = revRaw ? Math.round(parseFloat(revRaw) * 100) : null;
        return {
          product_name_raw: nameRaw.trim(),
          product_id: productId,
          quantity_sold: qty,
          unit_price_pence: up !== null && !isNaN(up) ? up : null,
          revenue_pence: rev !== null && !isNaN(rev) ? rev : null,
          sale_date: saleDate,
          matched: !!productId,
        } as ParsedSalesRow;
      })
      .filter((r): r is ParsedSalesRow => r !== null);
    setPreviewRows(rows);
    setStep("preview");
  };

  const handleImport = async () => {
    try {
      const inserts = previewRows.map(r => ({
        venue_id: venueId,
        product_id: r.product_id ?? undefined,
        product_name_raw: r.product_name_raw,
        quantity_sold: r.quantity_sold,
        unit_price_pence: r.unit_price_pence ?? undefined,
        revenue_pence: r.revenue_pence ?? undefined,
        sale_date: r.sale_date,
      }));
      await insertSales.mutateAsync(inserts);
      setInsertedCount(previewRows.length);
      setStep("done");
      toast({ title: `${previewRows.length} rows uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const handleClose = () => {
    setStep("upload");
    setRawHeaders([]);
    setRawRows([]);
    setMapping({});
    setPreviewRows([]);
    setInsertedCount(0);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  };

  const unmatchedCount = previewRows.filter(r => !r.matched).length;

  return (
    <Sheet open={open} onOpenChange={o => !o && handleClose()}>
      <SheetContent side="bottom" className="h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Upload Sales Data</SheetTitle>
        </SheetHeader>

        {step === "upload" && (
          <div className="space-y-4 pb-8">
            <div className="bg-muted/60 rounded-xl p-4 text-sm space-y-1.5">
              <p className="font-semibold">Export a sales CSV from your till / EPOS system</p>
              <p className="text-muted-foreground text-xs">Any format works — you'll map the columns to the right fields in the next step.</p>
            </div>
            <div>
              <label htmlFor="sales-csv-file" className="text-sm font-medium">Choose CSV file</label>
              <input
                id="sales-csv-file"
                ref={fileRef}
                type="file"
                accept=".csv"
                className="mt-2 w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                onChange={handleFile}
                data-testid="input-sales-csv-file"
              />
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4 pb-8">
            <div>
              <p className="text-sm font-semibold">{rawRows.length} rows found — map columns</p>
              <p className="text-xs text-muted-foreground mt-0.5">Best guesses are pre-selected. Required fields marked *.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SALES_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground">{f.label}{f.required ? " *" : ""}</label>
                  <Select
                    value={mapping[f.key] ?? "__none__"}
                    onValueChange={v => setMapping(prev => ({ ...prev, [f.key]: v === "__none__" ? undefined : v }))}
                  >
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Not mapped" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not mapped</SelectItem>
                      {rawHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button
              className="w-full h-12 font-bold"
              disabled={!mapping.product_name || !mapping.quantity || !mapping.date}
              onClick={handleApplyMapping}
              data-testid="button-apply-sales-mapping"
            >
              Preview rows
            </Button>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 pb-8">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{previewRows.length} rows parsed</p>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setStep("map")}>Back</button>
            </div>
            {unmatchedCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40" data-testid="section-unmatched-warning">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{unmatchedCount} row{unmatchedCount === 1 ? "" : "s"} not matched to a product</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Saved without a product link — won't appear in COGS. Match product names in your library to fix this next time.</p>
                </div>
              </div>
            )}
            <div className="overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Product</th>
                    <th className="text-right px-3 py-2 font-semibold">Qty</th>
                    <th className="text-right px-3 py-2 font-semibold">Date</th>
                    <th className="text-right px-3 py-2 font-semibold">Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((r, i) => (
                    <tr key={i} className={`border-t border-border ${!r.matched ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}`}>
                      <td className="px-3 py-1.5 max-w-[140px] truncate">{r.product_name_raw}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.quantity_sold}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.sale_date}</td>
                      <td className="px-3 py-1.5 text-right">{r.matched ? <span className="text-[#3FAE74] font-semibold">Yes</span> : <span className="text-[#E5544B] font-semibold">No</span>}</td>
                    </tr>
                  ))}
                  {previewRows.length > 50 && (
                    <tr className="border-t border-border">
                      <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">…and {previewRows.length - 50} more rows</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Button
              className="w-full h-14 text-lg font-bold"
              onClick={handleImport}
              disabled={insertSales.isPending || previewRows.length === 0}
              data-testid="button-confirm-sales-import"
            >
              {insertSales.isPending ? "Uploading…" : `Upload ${previewRows.length} rows`}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center pb-8">
            <CheckCircle2 className="w-16 h-16 text-[#3FAE74]" />
            <h2 className="text-2xl font-bold">{insertedCount} sales rows uploaded</h2>
            {unmatchedCount > 0 && (
              <p className="text-sm text-muted-foreground">{unmatchedCount} unmatched — won't appear in COGS until product names match.</p>
            )}
            <Button className="w-full h-14 text-lg font-bold" onClick={handleClose}>Done</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface BaselineFormPayload {
  job_number: string | null;
  site: string | null;
  audit_date: string;
  period_start: string | null;
  period_end: string | null;
  opening_stock: number | null;
  closing_stock: number | null;
  revenue: number | null;
  purchases: number | null;
  days_stock_holding: number | null;
  optimum_gp_percent: number | null;
  actual_gp_percent: number | null;
  wastage: number | null;
  notes: string | null;
}

function BaselineImportSheet({
  open,
  onClose,
  venueId,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  venueId: string | undefined;
  onSubmit: (payload: BaselineFormPayload) => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const emptyForm = {
    job_number: "",
    site: "",
    audit_date: new Date().toISOString().slice(0, 10),
    period_start: "",
    period_end: "",
    opening_stock: "",
    closing_stock: "",
    revenue: "",
    purchases: "",
    days_stock_holding: "",
    optimum_gp_percent: "",
    actual_gp_percent: "",
    wastage: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const numOrNull = (v: string) => (v.trim() === "" ? null : parseFloat(v));

  const handleSubmit = () => {
    if (!venueId) return;
    if (!form.audit_date) {
      toast({ title: "Audit date required", variant: "destructive" });
      return;
    }
    onSubmit({
      job_number: form.job_number || null,
      site: form.site || null,
      audit_date: form.audit_date,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      opening_stock: numOrNull(form.opening_stock),
      closing_stock: numOrNull(form.closing_stock),
      revenue: numOrNull(form.revenue),
      purchases: numOrNull(form.purchases),
      days_stock_holding: numOrNull(form.days_stock_holding),
      optimum_gp_percent: numOrNull(form.optimum_gp_percent),
      actual_gp_percent: numOrNull(form.actual_gp_percent),
      wastage: numOrNull(form.wastage),
      notes: form.notes || null,
    });
    setForm(emptyForm);
  };

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Import Stocktaker Report</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-8">
          <p className="text-sm text-muted-foreground">
            Enter the headline numbers from your stocktaker's audit report (e.g. Venners Site Audit Report). PDF auto-parsing is coming later — for now, type in the summary page figures.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ba-job">Job number</Label>
              <Input id="ba-job" value={form.job_number} onChange={set("job_number")} className="mt-1" data-testid="input-baseline-job-number" />
            </div>
            <div>
              <Label htmlFor="ba-site">Site</Label>
              <Input id="ba-site" value={form.site} onChange={set("site")} className="mt-1" data-testid="input-baseline-site" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="ba-date">Audit date</Label>
              <Input id="ba-date" type="date" value={form.audit_date} onChange={set("audit_date")} className="mt-1" data-testid="input-baseline-audit-date" />
            </div>
            <div>
              <Label htmlFor="ba-period-start">Period start</Label>
              <Input id="ba-period-start" type="date" value={form.period_start} onChange={set("period_start")} className="mt-1" data-testid="input-baseline-period-start" />
            </div>
            <div>
              <Label htmlFor="ba-period-end">Period end</Label>
              <Input id="ba-period-end" type="date" value={form.period_end} onChange={set("period_end")} className="mt-1" data-testid="input-baseline-period-end" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ba-opening">Opening stock (£ ex-VAT)</Label>
              <Input id="ba-opening" type="number" step="0.01" inputMode="decimal" value={form.opening_stock} onChange={set("opening_stock")} className="mt-1" data-testid="input-baseline-opening-stock" />
            </div>
            <div>
              <Label htmlFor="ba-closing">Closing stock (£ ex-VAT)</Label>
              <Input id="ba-closing" type="number" step="0.01" inputMode="decimal" value={form.closing_stock} onChange={set("closing_stock")} className="mt-1" data-testid="input-baseline-closing-stock" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ba-revenue">Revenue inc. VAT (£)</Label>
              <Input id="ba-revenue" type="number" step="0.01" inputMode="decimal" value={form.revenue} onChange={set("revenue")} className="mt-1" data-testid="input-baseline-revenue" />
            </div>
            <div>
              <Label htmlFor="ba-purchases">Purchases (£ ex-VAT)</Label>
              <Input id="ba-purchases" type="number" step="0.01" inputMode="decimal" value={form.purchases} onChange={set("purchases")} className="mt-1" data-testid="input-baseline-purchases" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ba-days">Days stock holding</Label>
              <Input id="ba-days" type="number" step="0.1" inputMode="decimal" value={form.days_stock_holding} onChange={set("days_stock_holding")} className="mt-1" data-testid="input-baseline-days-stock-holding" />
            </div>
            <div>
              <Label htmlFor="ba-wastage">Wastage (£ ex-VAT)</Label>
              <Input id="ba-wastage" type="number" step="0.01" inputMode="decimal" value={form.wastage} onChange={set("wastage")} className="mt-1" data-testid="input-baseline-wastage" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ba-optimum-gp">Optimum GP%</Label>
              <Input id="ba-optimum-gp" type="number" step="0.01" inputMode="decimal" value={form.optimum_gp_percent} onChange={set("optimum_gp_percent")} className="mt-1" data-testid="input-baseline-optimum-gp" />
            </div>
            <div>
              <Label htmlFor="ba-actual-gp">Actual GP%</Label>
              <Input id="ba-actual-gp" type="number" step="0.01" inputMode="decimal" value={form.actual_gp_percent} onChange={set("actual_gp_percent")} className="mt-1" data-testid="input-baseline-actual-gp" />
            </div>
          </div>

          <div>
            <Label htmlFor="ba-notes">Notes (optional)</Label>
            <textarea
              id="ba-notes"
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="Line-level detail, auditor comments, anything else worth keeping"
              data-testid="input-baseline-notes"
            />
          </div>

          <Button
            className="w-full h-14 text-lg font-bold"
            onClick={handleSubmit}
            disabled={isPending}
            data-testid="button-save-baseline"
          >
            {isPending ? "Saving..." : "Save Baseline"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
