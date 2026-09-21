import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProducts, useLocations, useStocktakes,
  useCreateStocktake, useCloseStocktake, useAddReading,
  useCountLocations, useLineEntries, addLineEntry, deleteLineEntry,
  useAddCountLocation, useBottleShapes,
  type BottleShape,
} from "@/hooks/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberPad } from "@/components/NumberPad";
import { db } from "@/lib/db";
import type { LocalLineEntry } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import {
  calcMlRemaining, calcTenths, calcMeasuresLeft,
  calcWeighValuation, calcCountValuation,
  calcProductGpPercent, formatGBP,
  computeCategoryReading, resolveMeasureMl, draughtCapacityMl, productCapacityMl,
  CATEGORY_METHODS, METHOD_LABELS, CATEGORY_LABELS, ML_PER_PINT,
  type CountingMethod, type ProductCategory, type CategoryReadingInput,
} from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, Plus, Trash2, Cloud, CloudOff, MapPin, X, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { Database } from "@/lib/database.types";
import {
  aggregateProductEntries,
  buildPersistedReading,
  measuresRemaining,
  persistReadingsThenClose,
  valueProductEntries,
} from "@/lib/stocktake-close";

type Step = "list" | "select" | "counting" | "summary";
type CountingView = "products" | "detail";
type Product = Database["public"]["Tables"]["products"]["Row"] & { locations?: { name: string } | null };
type LegacyReading = { productId: string; mlRemaining: number; count?: number };

function formatDate(ts: string) {
  try { return format(new Date(ts), "d MMM yyyy, HH:mm"); } catch { return ts; }
}

export default function Stocktake() {
  const { venue, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: products } = useProducts(venue?.id);
  const { data: locations } = useLocations(venue?.id);
  const { data: stocktakes } = useStocktakes(venue?.id);
  const { data: countLocations } = useCountLocations(venue?.id);
  const createStocktake = useCreateStocktake();
  const closeStocktake = useCloseStocktake();
  const addReading = useAddReading();
  const addCountLocation = useAddCountLocation();
  const { toast } = useToast();

  // Core navigation
  const [step, setStep] = useState<Step>("list");
  const [selectedLocationId, setSelectedLocationId] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedVendor, setSelectedVendor] = useState("all");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [searchStr, setSearchStr] = useState("");
  const [activeStocktakeId, setActiveStocktakeId] = useState<string | null>(null);

  // Counting step
  const [countingView, setCountingView] = useState<CountingView>("products");
  const [countingSearch, setCountingSearch] = useState("");
  const [leftOnly, setLeftOnly] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryStep, setEntryStep] = useState<"location" | "value">("location");
  const [entryLocationId, setEntryLocationId] = useState("");
  const [entryLocationName, setEntryLocationName] = useState("");
  const [entryWeightStr, setEntryWeightStr] = useState("0");
  const [entryNumStr, setEntryNumStr] = useState("0");
  const [entryFullContainersStr, setEntryFullContainersStr] = useState("0");
  const [newLocationInput, setNewLocationInput] = useState("");
  const [showNewLocationField, setShowNewLocationField] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);

  // Photo-tap: y-position of the liquid line (fraction from bottom, 0=empty 1=full)
  const [photoTapY, setPhotoTapY] = useState(0.5);

  // Per-product Weigh/Tenths choice for this count (see bottleMethodChoice below)
  const [bottleMethodOverride, setBottleMethodOverride] = useState<Record<string, "weigh" | "tenths">>({});

  // Legacy readings for closed stocktakes opened from list
  const [legacyReadings, setLegacyReadings] = useState<LegacyReading[]>([]);

  // Line entries for the active in-progress stocktake
  const { data: lineEntries, refetch: refetchEntries } = useLineEntries(activeStocktakeId);

  // When the sync queue lands a line entry, refresh so "Not synced" badges clear immediately.
  useEffect(() => {
    if (!activeStocktakeId) return;
    const onSynced = () => { refetchEntries(); };
    window.addEventListener("stocktap:line-entry-synced", onSynced);
    return () => window.removeEventListener("stocktap:line-entry-synced", onSynced);
  }, [activeStocktakeId, refetchEntries]);

  // Bottle shapes (for photo-tap counting method)
  const { data: bottleShapes = [] } = useBottleShapes(venue?.id);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    if (!products || selectedProductIds.length === 0) return [];
    const idSet = new Set(selectedProductIds);
    return products.filter(p => idSet.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedProductIds]);

  const vendorOptions = useMemo(() => {
    if (!products) return [];
    const s = new Set<string>();
    for (const p of products) if (p.vendor?.trim()) s.add(p.vendor.trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const pickableProducts = useMemo(() => {
    if (!products) return [];
    let list = products;
    if (selectedLocationId !== "all") list = list.filter(p => p.location_id === selectedLocationId);
    if (selectedCategory !== "all") list = list.filter(p => p.category === selectedCategory);
    if (selectedVendor !== "all") list = list.filter(p => p.vendor === selectedVendor);
    const q = searchStr.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedLocationId, selectedCategory, selectedVendor, searchStr]);

  const toggleProductSel = (id: string) =>
    setSelectedProductIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const selectAllVisible = () =>
    setSelectedProductIds(ids => Array.from(new Set([...ids, ...pickableProducts.map(p => p.id)])));
  const clearSelection = () => setSelectedProductIds([]);

  const activeProduct = useMemo(
    () => filteredProducts.find(p => p.id === activeProductId) as Product | undefined,
    [filteredProducts, activeProductId]
  );

  const activeShape = useMemo<BottleShape | null>(
    () => (activeProduct as any)?.bottle_shape_id
      ? (bottleShapes.find(s => s.id === (activeProduct as any).bottle_shape_id) ?? null)
      : null,
    [activeProduct, bottleShapes]
  );

  // Entry form computation
  const entryResolvedMethod: CountingMethod | null = activeProduct?.category
    ? ((activeProduct.counting_method as CountingMethod) ?? CATEGORY_METHODS[activeProduct.category as ProductCategory].default)
    : null;

  // Bottle lines (weigh / tenths / photo-tap) get a one-tap Weigh ⇄ Tenths
  // switch on the count screen. The choice is remembered per product for this
  // count only; the Library setting is untouched.
  const isBottleLine = entryResolvedMethod === "weigh" || entryResolvedMethod === "tenths" || entryResolvedMethod === "photo_tap";
  const canWeigh = !!activeProduct && activeProduct.empty_weight_g != null;
  const bottleMethodChoice: "weigh" | "tenths" | null =
    isBottleLine && activeProduct
      ? (bottleMethodOverride[activeProduct.id] ??
          (entryResolvedMethod === "tenths" ? "tenths" : entryResolvedMethod === "weigh" ? (canWeigh ? "weigh" : "tenths") : null))
      : null;
  const bottleMethodResolved: CountingMethod | null =
    bottleMethodChoice === "weigh" ? (canWeigh ? "weigh" : "tenths") : bottleMethodChoice === "tenths" ? "tenths" : null;

  // Weigh product with no bottle-weight calibration and no tenths fallback chosen —
  // show a notice, not the tenths pad. Falling back silently caused grams to be
  // interpreted as tenths (1000g → 1000.0 tenths).
  const isUncalibratedWeigh =
    bottleMethodResolved == null && entryResolvedMethod === "weigh" && activeProduct?.empty_weight_g == null;

  const entryActiveMethod: CountingMethod | null =
    bottleMethodResolved ||
    (isUncalibratedWeigh
      ? null
      // photo_tap requires a bottle shape — fall back gracefully if none is set
      : entryResolvedMethod === "photo_tap" && !activeShape
        ? (activeProduct?.empty_weight_g != null ? "weigh" : "tenths")
        // count-unit products (packaged, minerals) must never land on the litres pad
        : activeProduct?.unit === "count" && entryResolvedMethod === "litre"
          ? "each"
          : entryResolvedMethod);

  const entryCategoryInput: CategoryReadingInput | null = useMemo(() => {
    if (!entryActiveMethod) return null;
    const fc = parseFloat(entryFullContainersStr) || 0;
    switch (entryActiveMethod) {
      case "dipstick":    return { method: entryActiveMethod, dipMm: parseFloat(entryNumStr) || 0, fullContainers: fc };
      case "keg_weight":  return { method: entryActiveMethod, partialPints: parseFloat(entryNumStr) || 0, fullContainers: fc };
      case "tenths_pints":return { method: entryActiveMethod, tenths: parseFloat(entryNumStr) || 0, fullContainers: fc };
      case "tenths":      return { method: entryActiveMethod, tenths: parseFloat(entryNumStr) || 0, fullContainers: fc };
      case "dozen":       return { method: entryActiveMethod, fullPacks: fc, partUnits: parseFloat(entryNumStr) || 0 };
      case "each":        return { method: entryActiveMethod, count: parseFloat(entryNumStr) || 0 };
      case "litre":       return { method: entryActiveMethod, litres: parseFloat(entryNumStr) || 0 };
      case "weigh":       return { method: entryActiveMethod, weightG: parseFloat(entryWeightStr) || 0, fullContainers: parseFloat(entryFullContainersStr) || 0 };
      case "photo_tap":   return { method: entryActiveMethod, tapY: photoTapY, fullContainers: fc };
      default: return null;
    }
  }, [entryActiveMethod, entryNumStr, entryFullContainersStr, entryWeightStr, photoTapY]);

  const entryMeasureMl = resolveMeasureMl(activeProduct?.measure_ml, venue?.measure_ml);

  const entryCategoryResult = useMemo(() => {
    if (!activeProduct || !entryCategoryInput) return null;
    return computeCategoryReading(
      {
        category: (activeProduct.category as ProductCategory) ?? null,
        unit: activeProduct.unit,
        sizeMl: activeProduct.size_ml,
        density: activeProduct.density,
        emptyWeightG: activeProduct.empty_weight_g,
        fullWeightG: activeProduct.full_weight_g ?? null,
        costPrice: activeProduct.cost_price,
        measureMl: activeProduct.measure_ml,
        containerL: activeProduct.container_l ?? null,
        dipFullMm: activeProduct.dip_full_mm ?? null,
        packSize: activeProduct.pack_size ?? null,
        fillCurve: activeShape?.fill_curve ?? undefined,
      },
      entryCategoryInput,
      entryMeasureMl
    );
  }, [activeProduct, activeShape, entryCategoryInput, entryMeasureMl]);

  const entryMl = useMemo(() => {
    if (entryCategoryResult) return entryCategoryResult.mlRemaining;
    if (!activeProduct || activeProduct.unit !== "weigh") return null;
    if (activeProduct.empty_weight_g == null) {
      const t = parseFloat(entryNumStr) || 0;
      return (t / 10) * (activeProduct.size_ml ?? 700);
    }
    return calcMlRemaining(parseFloat(entryWeightStr) || 0, activeProduct.empty_weight_g, activeProduct.density, activeProduct.size_ml ?? 700);
  }, [entryWeightStr, entryNumStr, activeProduct, entryCategoryResult]);

  // Fix 5: detect readings that exceed the calibrated full weight by more than 5% —
  // a sign that bottle weights need recalibrating rather than a genuine >100% reading.
  const overCalibrationWarning = useMemo(() => {
    if (entryActiveMethod !== "weigh") return null;
    const fw = activeProduct?.full_weight_g;
    const ew = activeProduct?.empty_weight_g;
    if (fw == null || ew == null) return null;
    const weightG = parseFloat(entryWeightStr) || 0;
    if (weightG === 0) return null;
    const range = fw - ew;
    if (range <= 0) return null;
    const rawFraction = (weightG - ew) / range;
    if (rawFraction > 1.05) {
      return `This reading implies ${(rawFraction * 100).toFixed(0)}% full — above the calibrated full weight. Check bottle weights in the Library.`;
    }
    return null;
  }, [entryActiveMethod, entryWeightStr, activeProduct]);

  // A scale reading below the empty-bottle weight can't be right: either the
  // scale was misread or the bottle weights in the Library are wrong.
  const underEmptyWarning = useMemo(() => {
    if (entryActiveMethod !== "weigh") return null;
    const ew = activeProduct?.empty_weight_g;
    if (ew == null) return null;
    const weightG = parseFloat(entryWeightStr) || 0;
    if (weightG > 0 && weightG < ew * 0.97) {
      return `${weightG}g is lighter than the empty bottle (${Math.round(ew)}g). Check the scale reading or the bottle weights in the Library.`;
    }
    return null;
  }, [entryActiveMethod, entryWeightStr, activeProduct]);

  const entryTenths = entryCategoryResult
    ? entryCategoryResult.tenths
    : entryMl !== null && activeProduct?.size_ml
    ? calcTenths(entryMl, activeProduct.size_ml)
    : null;

  // Group line entries by product
  const entriesByProduct = useMemo(() => {
    const map = new Map<string, LocalLineEntry[]>();
    for (const e of lineEntries ?? []) {
      if (!map.has(e.product_id)) map.set(e.product_id, []);
      map.get(e.product_id)!.push(e);
    }
    return map;
  }, [lineEntries]);

  // Summary and close use the same aggregation/valuation helpers so they cannot drift.
  const summaryLines = useMemo(() => {
    if ((lineEntries?.length ?? 0) > 0) {
      const grouped = new Map<string, LocalLineEntry[]>();
      for (const entry of lineEntries!) {
        if (!grouped.has(entry.product_id)) grouped.set(entry.product_id, []);
        grouped.get(entry.product_id)!.push(entry);
      }

      return Array.from(grouped.entries()).map(([productId, entries]) => {
        const prod = products?.find(p => p.id === productId);
        if (!prod) return null;
        // Defensive: one bad product must never crash the whole stocktake page.
        try {
          const reading = aggregateProductEntries(prod, entries);
          const capMl = productCapacityMl(prod);
          const mml = resolveMeasureMl(prod.measure_ml, venue?.measure_ml);
          return {
            prod,
            mlRemaining: reading.mlRemaining,
            val: valueProductEntries(prod, entries),
            gp: calcProductGpPercent(prod, mml),
            count: reading.count ?? undefined,
            tenthsVal: capMl > 0 ? calcTenths(reading.mlRemaining, capMl) : null,
            measuresVal: measuresRemaining(reading, prod.measure_ml, venue?.measure_ml ?? 25),
          };
        } catch (err) {
          console.error("[stocktake] summary aggregation failed for", prod.name, err);
          return null;
        }
      }).filter(Boolean) as { prod: Product; mlRemaining: number; val: number; gp: number | null; count?: number; tenthsVal: number | null; measuresVal: number }[];
    }

    return legacyReadings.map(({ productId, mlRemaining, count }) => {
      const prod = products?.find(p => p.id === productId);
      if (!prod) return null;
      const mml = resolveMeasureMl(prod.measure_ml, venue?.measure_ml);
      const capMl = productCapacityMl(prod);
      const isVolumeMethod = prod.counting_method === "keg_weight" || prod.counting_method === "dipstick" || prod.counting_method === "tenths_pints";
      const val = prod.cost_price
        ? prod.unit === "count" && !isVolumeMethod
          ? calcCountValuation(count ?? 0, prod.cost_price)
          : capMl > 0 ? (mlRemaining / capMl) * prod.cost_price : 0
        : 0;
      return { prod, mlRemaining, val, gp: calcProductGpPercent(prod, mml), count, tenthsVal: capMl > 0 ? calcTenths(mlRemaining, capMl) : null, measuresVal: calcMeasuresLeft(mlRemaining, mml) };
    }).filter(Boolean) as { prod: Product; mlRemaining: number; val: number; gp: number | null; count?: number; tenthsVal: number | null; measuresVal: number }[];
  }, [lineEntries, legacyReadings, products, venue?.measure_ml]);

  const totalSummaryValue = summaryLines.reduce((s, l) => s + l.val, 0);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const startStocktake = async () => {
    if (!venue?.id) return;
    try {
      const st = await createStocktake.mutateAsync({
        venue_id: venue.id,
        location_id: selectedLocationId === "all" ? null : selectedLocationId,
        status: "open",
        opened_at: new Date().toISOString(),
      });
      setActiveStocktakeId(st.id);
      setLegacyReadings([]);
      setCountingView("products");
      setActiveProductId(null);
      setStep("counting");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const openStocktake = async (st: { id: string; status: string }) => {
    setActiveStocktakeId(st.id);
    if (st.status === "closed") {
      // Try Dexie first (fast, offline); fall back to Supabase if this session
      // hasn't synced readings for this stocktake yet.
      let rs = await db.readings.filter(r => r.stocktake_id === st.id).toArray();
      if (rs.length === 0 && venue?.id) {
        const { data } = await supabase
          .from("readings")
          .select("product_id, ml_remaining, count")
          .eq("stocktake_id", st.id)
          .eq("venue_id", venue.id);
        if (data && data.length > 0) {
          rs = data.map(r => ({
            product_id: r.product_id,
            ml_remaining: r.ml_remaining,
            count: r.count ?? null,
            stocktake_id: st.id,
          })) as any[];
        }
      }
      setLegacyReadings(rs.map(r => ({ productId: r.product_id, mlRemaining: r.ml_remaining, count: r.count ?? undefined })));
      setSelectedProductIds(rs.map(r => r.product_id));
      setStep("summary");
    } else {
      setSelectedProductIds(products?.map(p => p.id) ?? []);
      setLegacyReadings([]);
      setCountingView("products");
      setActiveProductId(null);
      setStep("counting");
    }
  };

  const resetEntryForm = () => {
    setEntryWeightStr("0"); setEntryNumStr("0"); setEntryFullContainersStr("0");
    setEntryLocationId(""); setEntryLocationName("");
    setEntryStep("location"); setShowAddEntry(false);
    setNewLocationInput(""); setShowNewLocationField(false);
  };

  const pickLocation = (id: string, name: string) => {
    setEntryLocationId(id); setEntryLocationName(name); setEntryStep("value");
  };

  const addNewLocationAndPick = async () => {
    if (!venue?.id || !newLocationInput.trim()) return;
    const name = newLocationInput.trim();
    try {
      const result = await addCountLocation.mutateAsync({ venue_id: venue.id, name, sort: countLocations?.length ?? 0 });
      pickLocation(result.id, result.name);
    } catch {
      // Table not yet created — use as label-only
      pickLocation("", name);
    }
    setNewLocationInput(""); setShowNewLocationField(false);
  };

  const saveLineEntry = async () => {
    if (!activeProduct || !venue?.id || !user?.id || !activeStocktakeId) return;

    // Bug 1: block save entirely for uncalibrated weigh products
    if (isUncalibratedWeigh) {
      toast({ title: "Cannot save", description: "Set bottle weights in the Library before counting this product by weight.", variant: "destructive" });
      return;
    }
    if (underEmptyWarning) {
      toast({ title: "Check the weight", description: underEmptyWarning, variant: "destructive" });
      return;
    }

    // Backstop: tenths must be 0–10; anything above almost certainly means the user
    // typed grams into the tenths pad
    const resolvedMethodForValidation = entryActiveMethod ?? "tenths";
    if (resolvedMethodForValidation === "tenths" || resolvedMethodForValidation === "tenths_pints") {
      const t = parseFloat(entryNumStr) || 0;
      if (t < 0 || t > 10) {
        toast({ title: "Cannot save", description: `Tenths must be between 0 and 10 — got ${t.toFixed(1)}. Did you mean to weigh the bottle?`, variant: "destructive" });
        return;
      }
    }

    setSavingEntry(true);
    try {
      const rawMl = entryCategoryResult ? entryCategoryResult.mlRemaining : (entryMl ?? 0);
      const ml = Math.max(0, rawMl);
      const fullContainers = entryCategoryResult?.fullContainers ?? null;
      // For weigh entries the raw gram reading is the authoritative part_value
      const partValue = entryActiveMethod === "weigh"
        ? parseFloat(entryWeightStr) || null
        : parseFloat(entryNumStr) || null;
      const method: LocalLineEntry["method"] = (entryActiveMethod ?? (
        activeProduct.unit === "count" ? "count" :
        activeProduct.empty_weight_g != null ? "weigh" : "tenths"
      )) as LocalLineEntry["method"];
      const now = new Date().toISOString();
      await addLineEntry({
        id: crypto.randomUUID(),
        venue_id: venue.id,
        stocktake_id: activeStocktakeId,
        product_id: activeProduct.id,
        count_location_id: entryLocationId || null,
        count_location_name: entryLocationName || null,
        method,
        full_containers: fullContainers,
        part_value: partValue,
        ml_remaining: ml,
        sync_status: "pending",
        entered_at: now,
        user_id: user.id,
        created_at: now,
        updated_at: now,
      });
      queryClient.invalidateQueries({ queryKey: ["line-entries", activeStocktakeId] });
      await refetchEntries();
      resetEntryForm();
    } catch (err: any) {
      toast({ title: "Error saving entry", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setSavingEntry(false);
    }
  };

  const removeEntry = async (id: string) => {
    await deleteLineEntry(id);
    queryClient.invalidateQueries({ queryKey: ["line-entries", activeStocktakeId] });
    await refetchEntries();
  };

  const finishStocktake = async () => {
    if (!activeStocktakeId || !venue?.id || !user?.id) return;

    try {
      let totalValue = 0;
      const readingsToPersist: { productName: string; payload: ReturnType<typeof buildPersistedReading> }[] = [];
      const hasLineEntries = (lineEntries?.length ?? 0) > 0;

      if (hasLineEntries) {
        const grouped = new Map<string, LocalLineEntry[]>();
        for (const entry of lineEntries!) {
          if (!grouped.has(entry.product_id)) grouped.set(entry.product_id, []);
          grouped.get(entry.product_id)!.push(entry);
        }

        for (const [productId, entries] of grouped) {
          const prod = products?.find(p => p.id === productId);
          if (!prod) throw new Error(`Product ${productId} is missing from the library`);

          const reading = aggregateProductEntries(prod, entries);
          totalValue += valueProductEntries(prod, entries);
          readingsToPersist.push({
            productName: prod.name,
            payload: buildPersistedReading(prod, reading, {
              venueId: venue.id,
              stocktakeId: activeStocktakeId,
              userId: user.id,
            }),
          });
        }
      } else {
        for (const r of legacyReadings) {
          const prod = products?.find(p => p.id === r.productId);
          if (!prod?.cost_price) continue;
          const cap = productCapacityMl(prod);
          const isVolumeMethod = prod.counting_method === "keg_weight" || prod.counting_method === "dipstick" || prod.counting_method === "tenths_pints";
          totalValue += prod.unit === "count" && !isVolumeMethod
            ? calcCountValuation(r.count ?? 0, prod.cost_price)
            : cap > 0 ? (r.mlRemaining / cap) * prod.cost_price : 0;
        }
      }

      const pendingSyncProducts = await persistReadingsThenClose(
        readingsToPersist,
        (payload) => addReading.mutateAsync(payload),
        async () => { await closeStocktake.mutateAsync({ id: activeStocktakeId, total_value: totalValue }); },
      );
      toast({
        title: pendingSyncProducts.length > 0 ? "Stocktake saved — sync pending" : "Stocktake complete",
        description: pendingSyncProducts.length > 0
          ? `Total value: ${formatGBP(totalValue)}. Waiting to sync: ${pendingSyncProducts.join(", ")}.`
          : `Total value: ${formatGBP(totalValue)}`,
        variant: pendingSyncProducts.length > 0 ? "default" : undefined,
      });
      setStep("list");
      setActiveStocktakeId(null); setLegacyReadings([]);
      setSelectedProductIds([]); setCountingView("products"); setActiveProductId(null);
    } catch (err: any) {
      toast({
        title: "Stocktake not closed",
        description: `No success was reported because a reading failed to save: ${String(err?.message ?? err)}`,
        variant: "destructive",
      });
    }
  };

  // ─── STEP: list ──────────────────────────────────────────────────────────────

  if (step === "list") {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
          <h1 className="text-2xl font-bold text-primary">Stocktake</h1>
        </div>
        <div className="p-4 space-y-4 flex-1 overflow-auto pb-24">
          <Button size="lg" className="w-full h-16 text-lg font-bold shadow-md" onClick={() => setStep("select")} data-testid="button-new-stocktake">
            Start New Stocktake
          </Button>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2">Past Stocktakes</h2>
          {!stocktakes?.length ? (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No stocktakes yet</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {stocktakes.map(st => (
                <Card key={st.id} data-testid={`card-stocktake-${st.id}`} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openStocktake(st)}>
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-sm">{formatDate(st.opened_at)}</div>
                      {st.total_value != null && st.total_value > 0 ? (
                        <div className="text-sm text-muted-foreground">{formatGBP(st.total_value)}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground capitalize">{st.status}</div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); openStocktake(st); }} data-testid={`button-open-stocktake-${st.id}`}>
                      {st.status === "open" ? "Resume" : "View"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── STEP: select ─────────────────────────────────────────────────────────────

  if (step === "select") {
    const allVisibleSelected = pickableProducts.length > 0 && pickableProducts.every(p => selectedProductIds.includes(p.id));
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10 space-y-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep("list")}><ArrowLeft /></Button>
            <div>
              <h1 className="text-xl font-bold text-primary">Choose what to count</h1>
              <p className="text-xs text-muted-foreground">Pick any bottles — you don't have to do the whole bar</p>
            </div>
          </div>
          <Input placeholder="Search products…" value={searchStr} onChange={e => setSearchStr(e.target.value)} data-testid="input-stocktake-search" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedLocationId === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedLocationId("all")}>All locations</button>
            {locations?.map(loc => (
              <button key={loc.id} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedLocationId === loc.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedLocationId(loc.id)}>{loc.name}</button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedCategory === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedCategory("all")} data-testid="button-category-filter-all">All categories</button>
            {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map(cat => (
              <button key={cat} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedCategory(cat)} data-testid={`button-category-filter-${cat}`}>{CATEGORY_LABELS[cat]}</button>
            ))}
          </div>
          {vendorOptions.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedVendor === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedVendor("all")} data-testid="button-vendor-filter-all">All vendors</button>
              {vendorOptions.map(v => (
                <button key={v} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedVendor === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedVendor(v)} data-testid={`button-vendor-filter-${v}`}>{v}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <button className="font-semibold text-primary" onClick={allVisibleSelected ? clearSelection : selectAllVisible}>{allVisibleSelected ? "Clear all" : "Select all shown"}</button>
            <span className="text-muted-foreground">{selectedProductIds.length} selected</span>
          </div>
        </div>
        <div className="p-4 space-y-2 flex-1 overflow-auto pb-28">
          {pickableProducts.length === 0 ? (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No products match</CardContent></Card>
          ) : pickableProducts.map(p => {
            const checked = selectedProductIds.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggleProductSel(p.id)} data-testid={`select-product-${p.id}`} className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${checked ? "border-primary bg-primary/5" : "border-border"}`}>
                <div>
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.category ? (CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category) : "—"}{p.size_ml ? ` · ${p.size_ml}ml` : ""}</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${checked ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                  {checked && <CheckCircle className="w-4 h-4 text-primary-foreground" />}
                </div>
              </button>
            );
          })}
        </div>
        <div className="p-4 border-t border-border bg-card sticky bottom-0">
          <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={startStocktake} disabled={createStocktake.isPending || selectedProductIds.length === 0} data-testid="button-start-stocktake">
            {createStocktake.isPending ? "Starting..." : `Start counting (${selectedProductIds.length})`}
          </Button>
        </div>
      </div>
    );
  }

  // ─── STEP: counting ───────────────────────────────────────────────────────────

  if (step === "counting") {
    const productEntries = activeProductId ? (entriesByProduct.get(activeProductId) ?? []) : [];
    const productTotalMl = productEntries.reduce((s, e) => s + e.ml_remaining, 0);
    const isEachOrDozen = entryResolvedMethod === "each" || entryResolvedMethod === "dozen";
    const isDraught = entryResolvedMethod === "dipstick" || entryResolvedMethod === "tenths_pints";
    // Capacity denominator: draught uses keg volume, dozen uses pack volume, each uses per-unit, others use bottle size_ml.
    const productEffectiveCapMl = isDraught
      ? draughtCapacityMl(activeProduct?.container_l)
      : entryResolvedMethod === "dozen"
      ? (activeProduct?.pack_size ?? 12) * (activeProduct?.size_ml || 1)
      : entryResolvedMethod === "each"
      ? (activeProduct?.size_ml || 1)
      : (activeProduct?.size_ml ?? 0);
    const productTotalTenths = productEffectiveCapMl > 0 ? calcTenths(productTotalMl, productEffectiveCapMl) : null;
    const hasPending = productEntries.some(e => e.sync_status === "pending");
    const isKegProduct = activeProduct?.counting_method === "keg_weight";
    const productTotalPints = productTotalMl / ML_PER_PINT;

    // Par badge
    const parLevel = activeProduct?.par_level ?? null;
    const parCurrentValue = parLevel != null
      ? (isKegProduct ? productTotalPints : productTotalMl / (productEffectiveCapMl || 1))
      : 0;
    const parFraction = parLevel != null && parLevel > 0 ? parCurrentValue / parLevel : 0;
    const parDisplayValue = isKegProduct ? productTotalPints.toFixed(0) : parCurrentValue.toFixed(1);
    const parUnit = isKegProduct ? "pt" : "btl";

    // ── products list view
    if (countingView === "products") {
      const enteredCount = Array.from(entriesByProduct.keys()).filter(pid => selectedProductIds.includes(pid)).length;
      const q = countingSearch.trim().toLowerCase();
      const searched = q ? filteredProducts.filter(p => p.name.toLowerCase().includes(q)) : filteredProducts;
      const leftCount = filteredProducts.length - enteredCount;
      const visibleProducts = searched.filter(p => !leftOnly || !(entriesByProduct.get(p.id) ?? []).length);
      return (
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setStep("list"); setActiveStocktakeId(null); }}
                  data-testid="button-exit-counting"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-primary">Counting</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">{enteredCount} of {filteredProducts.length} entered</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setStep("summary")} data-testid="button-review-stocktake">
                Review &amp; Close
              </Button>
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Find a product…"
                value={countingSearch}
                onChange={e => setCountingSearch(e.target.value)}
                data-testid="input-counting-search"
              />
              <Button
                variant={leftOnly ? "default" : "outline"}
                size="sm"
                className="shrink-0 h-10"
                onClick={() => setLeftOnly(v => !v)}
                data-testid="button-toggle-remaining"
              >
                {leftOnly ? "All" : `Left (${leftCount})`}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 pb-24 space-y-2">
            {filteredProducts.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No products selected</CardContent></Card>
            ) : visibleProducts.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">{q ? "No products match that search" : "Everything is counted"}</CardContent></Card>
            ) : visibleProducts.map(p => {
              const entries = entriesByProduct.get(p.id) ?? [];
              const totalMl = entries.reduce((s, e) => s + e.ml_remaining, 0);
              const isKeg = p.counting_method === "keg_weight";
              const pints = isKeg && entries.length > 0 ? totalMl / ML_PER_PINT : null;
              const isEachOrDozenProd = p.counting_method === "each" || p.counting_method === "dozen" ||
                (!p.counting_method && (p.category === "minerals" || p.category === "packaged"));
              const isDraughtProd = p.counting_method === "dipstick" || p.counting_method === "tenths_pints";
              const listEffCap = isDraughtProd
                ? draughtCapacityMl(p.container_l)
                : p.counting_method === "dozen"
                ? (p.pack_size ?? 12) * (p.size_ml || 1)
                : isEachOrDozenProd ? (p.size_ml || 1) : (p.size_ml ?? 700);
              const tenths = !isKeg && entries.length > 0 ? calcTenths(totalMl, listEffCap) : null;
              const val = p.cost_price && !isKeg && entries.length > 0 ? calcWeighValuation(totalMl, listEffCap, p.cost_price) : null;
              const pending = entries.some(e => e.sync_status === "pending");
              // Use the saved entry method as the display source of truth — the product's
              // counting_method may differ (e.g. "litre" on a product whose entries were
              // correctly saved as "each" after the Bug 2 fix).
              const entryMethod = entries.length > 0 ? entries[0].method : null;
              const isEachCountEntries = entryMethod === "each" || entryMethod === "count";
              const listUnitCount = isEachCountEntries
                ? entries.reduce((s, e) => s + (e.part_value ?? 0), 0)
                : null;
              const listEachVal = isEachCountEntries && p.cost_price && listUnitCount != null
                ? listUnitCount * p.cost_price
                : null;
              return (
                <button
                  key={p.id}
                  data-testid={`counting-product-${p.id}`}
                  onClick={() => { setActiveProductId(p.id); setCountingView("detail"); }}
                  className={`w-full flex items-start justify-between p-3 rounded-xl border text-left transition-colors ${entries.length > 0 ? "border-primary/40 bg-primary/5" : "border-border"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    {entries.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No entries yet</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {entries.length} {entries.length === 1 ? "entry" : "entries"}
                        {pints != null
                          ? ` · ${pints.toFixed(1)} pt`
                          : listUnitCount != null
                            ? ` · ${Math.round(listUnitCount)} units`
                            : tenths != null ? ` · ${tenths.toFixed(1)} tenths` : null}
                        {(listEachVal ?? val) != null && ` · ${formatGBP((listEachVal ?? val)!)}`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {pending && <CloudOff className="w-3.5 h-3.5 text-[#E0A343]" />}
                    {entries.length > 0 && !pending && <Cloud className="w-3.5 h-3.5 text-[#3FAE74]" />}
                    <span className="text-xs text-muted-foreground">{entries.length > 0 ? `${entries.length}` : "+"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // ── product detail view
    if (countingView === "detail" && activeProduct) {
      return (
        <div className="flex flex-col h-full relative">
          {/* Header */}
          <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setCountingView("products"); setActiveProductId(null); }} data-testid="button-back-to-products">
                <ArrowLeft />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-primary leading-tight truncate">{activeProduct.name}</h2>
                <p className="text-xs text-muted-foreground">{activeProduct.category ? (CATEGORY_LABELS[activeProduct.category as keyof typeof CATEGORY_LABELS] ?? activeProduct.category) : "—"}{activeProduct.size_ml ? ` · ${activeProduct.size_ml}ml` : ""}</p>
              </div>
            </div>
          </div>

          {/* Entry list */}
          <div className="flex-1 overflow-auto p-4 pb-32 space-y-2">
            {productEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No entries for this product yet.<br />Tap below to add your first location entry.</div>
            ) : productEntries.map(entry => {
              const isKegEntry = entry.method === "keg_weight";
              const entPints = isKegEntry ? entry.ml_remaining / ML_PER_PINT : null;
              const isEachOrDozenEntry = entry.method === "each" || entry.method === "dozen";
              const isDraughtEntry = entry.method === "dipstick" || entry.method === "tenths_pints";
              const entEffCap = isDraughtEntry
                ? draughtCapacityMl(activeProduct.container_l)
                : entry.method === "dozen"
                ? (activeProduct.pack_size ?? 12) * (activeProduct.size_ml || 1)
                : isEachOrDozenEntry ? (activeProduct.size_ml || 1) : (activeProduct.size_ml ?? 700);
              const entTenths = !isKegEntry ? calcTenths(entry.ml_remaining, entEffCap) : null;
              const entVal = activeProduct.cost_price && !isKegEntry ? calcWeighValuation(entry.ml_remaining, entEffCap, activeProduct.cost_price) : null;
              return (
                <Card key={entry.id} data-testid={`entry-card-${entry.id}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{entry.count_location_name || "Unspecified"}</span>
                        {entry.sync_status === "pending"
                          ? <CloudOff className="w-3 h-3 text-[#E0A343] shrink-0" />
                          : <Cloud className="w-3 h-3 text-[#3FAE74] shrink-0" />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isKegEntry
                          ? `${entPints!.toFixed(1)} pt`
                          : entTenths != null
                            ? `${entTenths.toFixed(1)} tenths · ${Math.round(entry.ml_remaining)}ml`
                            : `${Math.round(entry.ml_remaining)}ml`}
                        {entVal != null && ` · ${formatGBP(entVal)}`}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeEntry(entry.id)} data-testid={`button-delete-entry-${entry.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}

            {/* Running total */}
            {productEntries.length > 0 && (
              <div className="rounded-xl bg-accent p-4 text-center mt-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total across all locations</div>
                {isKegProduct ? (
                  <>
                    <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                      {productTotalPints.toFixed(1)}
                      <span className="text-base font-normal text-muted-foreground ml-1">pt</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {(productTotalMl / 1000).toFixed(1)}L
                    </div>
                  </>
                ) : entryResolvedMethod === "litre" ? (
                  <>
                    <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                      {(productTotalMl / 1000).toFixed(1)}
                      <span className="text-base font-normal text-muted-foreground ml-1">L</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {Math.round(productTotalMl)}ml
                      {activeProduct.cost_price && activeProduct.container_l && ` · ${formatGBP(calcWeighValuation(productTotalMl, activeProduct.container_l * 1000, activeProduct.cost_price))}`}
                    </div>
                  </>
                ) : isEachOrDozen ? (
                  <>
                    <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                      {Math.round(productTotalMl / (activeProduct.size_ml || 1))}
                      <span className="text-base font-normal text-muted-foreground ml-1">units</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {activeProduct.size_ml ? `${activeProduct.size_ml}ml each` : "unit size not set in Library"}
                      {activeProduct.cost_price && ` · ${formatGBP(calcWeighValuation(productTotalMl, productEffectiveCapMl, activeProduct.cost_price))}`}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                      {productTotalTenths != null ? `${productTotalTenths.toFixed(1)}` : "—"}
                      <span className="text-base font-normal text-muted-foreground ml-1">tenths</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {Math.round(productTotalMl)}ml
                      {activeProduct.cost_price && productEffectiveCapMl > 0 && ` · ${formatGBP(calcWeighValuation(productTotalMl, productEffectiveCapMl, activeProduct.cost_price))}`}
                    </div>
                  </>
                )}
                {parLevel != null && productEntries.length > 0 && (
                  <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
                    parFraction >= 1 ? "bg-[#3FAE74]/20 text-[#3FAE74]" :
                    parFraction >= 0.7 ? "bg-[#E0A343]/20 text-[#E0A343]" :
                    "bg-[#E5544B]/20 text-[#E5544B]"
                  }`}>
                    {parDisplayValue} {parUnit} / par {Number(parLevel).toFixed(isKegProduct ? 0 : 1)} {parUnit}
                  </div>
                )}
                {hasPending && (
                  <div className="flex items-center justify-center gap-1 mt-2 text-xs text-[#E0A343]">
                    <CloudOff className="w-3 h-3" /> Syncing...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add entry button */}
          <div className="p-4 border-t border-border bg-card sticky bottom-0">
            <Button size="lg" className="w-full h-14 font-bold text-base" onClick={() => { setShowAddEntry(true); setEntryStep("location"); }} data-testid="button-add-entry">
              <Plus className="w-5 h-5 mr-2" /> Add location entry
            </Button>
          </div>

          {/* Add entry bottom sheet — z-[60] so it sits above the z-50 bottom nav */}
          {showAddEntry && (
            <div className="fixed inset-0 z-[60] flex flex-col justify-end" data-testid="add-entry-sheet">
              <div className="absolute inset-0 bg-black/50" onClick={resetEntryForm} />
              <div className="relative bg-card rounded-t-2xl border border-border max-h-[90vh] flex flex-col">
                {/* Sheet header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  {entryStep === "value" ? (
                    <button onClick={() => setEntryStep("location")} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                  ) : <div />}
                  <div className="text-center flex-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {entryStep === "location" ? "Pick a location" : entryLocationName}
                    </div>
                  </div>
                  <button onClick={resetEntryForm} className="text-muted-foreground" data-testid="button-close-entry-sheet">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-auto flex-1 p-4 space-y-3">
                  {entryStep === "location" ? (
                    <>
                      {/* No location option */}
                      <button
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors border-border text-muted-foreground`}
                        onClick={() => pickLocation("", "Unspecified")}
                        data-testid="button-location-unspecified"
                      >
                        <div className="w-8 h-8 rounded-full border-2 border-border flex items-center justify-center shrink-0 text-xs">—</div>
                        <span className="text-sm font-medium">No specific location</span>
                      </button>

                      {/* Count location list */}
                      {(countLocations?.length ?? 0) > 0 && countLocations!.map(loc => (
                        <button
                          key={loc.id}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-border text-left hover:border-primary/50 transition-colors"
                          onClick={() => pickLocation(loc.id, loc.name)}
                          data-testid={`button-location-${loc.id}`}
                        >
                          <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium">{loc.name}</span>
                        </button>
                      ))}

                      {/* Add new location inline */}
                      {showNewLocationField ? (
                        <div className="flex gap-2">
                          <Input
                            autoFocus
                            placeholder="Location name, e.g. Bar, Cellar"
                            value={newLocationInput}
                            onChange={e => setNewLocationInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addNewLocationAndPick()}
                            data-testid="input-new-count-location-inline"
                          />
                          <Button onClick={addNewLocationAndPick} disabled={!newLocationInput.trim() || addCountLocation.isPending} data-testid="button-save-new-location">
                            {addCountLocation.isPending ? "..." : "Add"}
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border text-left hover:border-primary/50 transition-colors"
                          onClick={() => setShowNewLocationField(true)}
                          data-testid="button-add-new-location"
                        >
                          <Plus className="w-5 h-5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-muted-foreground">Add new location...</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Value entry step */}
                      <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                        {entryActiveMethod ? METHOD_LABELS[entryActiveMethod] : "Enter amount"}
                      </div>

                      {isBottleLine && activeProduct && entryResolvedMethod !== "photo_tap" && (
                        <div className="space-y-1">
                          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="radiogroup" aria-label="How to count this bottle">
                            <button
                              type="button"
                              role="radio"
                              aria-checked={entryActiveMethod === "weigh"}
                              disabled={!canWeigh}
                              onClick={() => { setBottleMethodOverride(prev => ({ ...prev, [activeProduct.id]: "weigh" })); setEntryNumStr("0"); }}
                              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${entryActiveMethod === "weigh" ? "bg-primary text-primary-foreground" : "text-muted-foreground"} disabled:opacity-40`}
                              data-testid="button-bottle-method-weigh"
                            >
                              Weigh
                            </button>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={entryActiveMethod === "tenths"}
                              onClick={() => { setBottleMethodOverride(prev => ({ ...prev, [activeProduct.id]: "tenths" })); setEntryWeightStr("0"); }}
                              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${entryActiveMethod === "tenths" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                              data-testid="button-bottle-method-tenths"
                            >
                              Tenths
                            </button>
                          </div>
                          {!canWeigh && (
                            <p className="text-[11px] text-muted-foreground text-center">Weigh needs the empty-bottle weight — add it in the Library. Tenths works now.</p>
                          )}
                        </div>
                      )}

                      {/* Photo tap fallback notice — shown when product has photo_tap method but no shape calibrated */}
                      {entryResolvedMethod === "photo_tap" && !activeShape && (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40 p-2 text-xs text-amber-700 dark:text-amber-400 text-center">
                          No bottle shape set — counting by {activeProduct?.empty_weight_g != null ? "weight" : "tenths"} instead. Set one up in Library.
                        </div>
                      )}

                      {/* Bug 1: uncalibrated weigh product — block entry, prompt to calibrate */}
                      {isUncalibratedWeigh && (
                        <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-4 text-center space-y-1">
                          <p className="font-semibold text-sm text-[#E0A343]">Bottle weights not calibrated</p>
                          <p className="text-xs text-muted-foreground">
                            Add the full and empty bottle weights in the Library to count this product by weight.
                          </p>
                        </div>
                      )}

                      {entryActiveMethod === "weigh" && <NumberPad value={entryWeightStr} onChange={setEntryWeightStr} label="Weight (grams)" allowDecimal />}
                      {entryActiveMethod === "weigh" && overCalibrationWarning && (
                        <div className="rounded-xl border border-[#E5544B]/40 bg-[#E5544B]/10 p-3 text-sm text-[#E5544B]">
                          {overCalibrationWarning}
                        </div>
                      )}
                      {entryActiveMethod === "weigh" && underEmptyWarning && (
                        <div className="rounded-xl border border-[#E5544B]/40 bg-[#E5544B]/10 p-3 text-sm text-[#E5544B]" data-testid="warning-under-weight">
                          {underEmptyWarning}
                        </div>
                      )}
                      {(entryActiveMethod === "tenths" || entryActiveMethod === "tenths_pints") && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Tenths remaining (0–10)" allowDecimal />}
                      {entryActiveMethod === "keg_weight" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Pints remaining" allowDecimal />}
                      {entryActiveMethod === "dipstick" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Dip reading (mm)" allowDecimal />}
                      {entryActiveMethod === "dipstick" && !activeProduct?.dip_full_mm && (
                        <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm text-[#E0A343]">
                          Full-tank depth not calibrated — the mm reading cannot convert to volume or value. Set the tank depth in the Product Library first.
                        </div>
                      )}
                      {entryActiveMethod === "dozen" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Part units (loose)" allowDecimal />}
                      {entryActiveMethod === "dozen" && !activeProduct?.size_ml && (
                        <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm text-[#E0A343]">
                          No unit size set — add the bottle/can size (ml) in the Product Library for accurate ml and £ tracking.
                        </div>
                      )}
                      {entryActiveMethod === "each" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Units" allowDecimal />}
                      {entryActiveMethod === "each" && !activeProduct?.size_ml && (
                        <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm text-[#E0A343]">
                          No unit size set — add the bottle/can size (ml) in the Product Library for accurate ml and £ tracking.
                        </div>
                      )}
                      {entryActiveMethod === "litre" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Litres" allowDecimal />}

                      {entryActiveMethod === "photo_tap" && (
                        <div className="space-y-3">
                          {activeShape ? (
                            activeShape.photo_url ? (
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground text-center">Tap where the liquid line sits</p>
                                <div
                                  className="relative select-none rounded-xl overflow-hidden border border-border cursor-crosshair"
                                  style={{ maxHeight: 300 }}
                                  onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const clickY = e.clientY - rect.top;
                                    const y = Math.max(0, Math.min(1, 1 - (clickY / rect.height)));
                                    setPhotoTapY(y);
                                  }}
                                >
                                  <img src={activeShape.photo_url} alt="bottle" className="w-full object-contain" />
                                  <div
                                    className="absolute left-0 right-0 flex items-center pointer-events-none"
                                    style={{ top: `${(1 - photoTapY) * 100}%`, transform: "translateY(-50%)" }}
                                  >
                                    <div className="w-full h-0.5 bg-[#E0A343]" />
                                    <span className="absolute right-2 text-xs font-bold text-[#E0A343] bg-card px-1 rounded">
                                      {Math.round(photoTapY * 100)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground text-center">No photo for this shape — slide to set fill level</p>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-muted-foreground w-6">0%</span>
                                  <input
                                    type="range" min={0} max={1} step={0.01}
                                    value={photoTapY}
                                    onChange={e => setPhotoTapY(parseFloat(e.target.value))}
                                    className="flex-1 accent-[#E0A343]"
                                  />
                                  <span className="text-sm text-muted-foreground w-10">100%</span>
                                </div>
                                <div className="text-center text-2xl font-bold font-mono tabular-nums text-primary">
                                  {Math.round(photoTapY * 100)}%
                                </div>
                              </div>
                            )
                          ) : (
                            <div className="rounded-xl bg-accent border border-border p-4 text-center text-sm text-muted-foreground">
                              No bottle shape set for this product. Go to the Library to calibrate one.
                            </div>
                          )}
                        </div>
                      )}
                      {!entryActiveMethod && activeProduct?.unit === "count" && (
                        <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Count" />
                      )}
                      {/* Calibrated spirit/wine: empty_weight_g is set → show weight pad */}
                      {!entryActiveMethod && activeProduct?.unit !== "count" && activeProduct?.empty_weight_g != null && (
                        <NumberPad value={entryWeightStr} onChange={setEntryWeightStr} label="Weight (grams)" allowDecimal />
                      )}
                      {/* Uncalibrated product: no empty weight → estimate by tenths */}
                      {!entryActiveMethod && activeProduct?.unit !== "count" && activeProduct?.empty_weight_g == null && (
                        <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Tenths remaining (0–10)" allowDecimal />
                      )}

                      {(entryActiveMethod === "keg_weight" || entryActiveMethod === "dipstick" || entryActiveMethod === "tenths_pints" || entryActiveMethod === "dozen" || entryActiveMethod === "weigh" || entryActiveMethod === "tenths") && (
                        entryActiveMethod === "keg_weight" && !activeProduct?.container_l ? (
                          <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm text-[#E0A343]">
                            Keg capacity not set — full barrel counting is disabled. Set the keg size (e.g. 50L or 9 gal) in the Product Library to count full barrels.
                          </div>
                        ) : (
                          <NumberPad
                            value={entryFullContainersStr}
                            onChange={setEntryFullContainersStr}
                            label={entryActiveMethod === "dozen" ? "Full packs" : (entryActiveMethod === "weigh" || entryActiveMethod === "tenths") ? "Full sealed bottles" : "Full containers (spare)"}
                          />
                        )
                      )}

                      {/* Real-time result — only show once the user has typed a non-zero value */}
                      {(entryCategoryResult || (entryTenths != null && entryTenths > 0) || (entryMl != null && entryMl > 0)) && (
                        <div className="bg-background rounded-xl border border-border p-4 text-center">
                          {entryActiveMethod === "keg_weight" ? (
                            <>
                              <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                                {((entryCategoryResult?.mlRemaining ?? 0) / ML_PER_PINT).toFixed(1)}
                                <span className="text-base font-normal text-muted-foreground ml-1">pt</span>
                              </div>
                              {entryCategoryResult?.fullContainers != null && entryCategoryResult.fullContainers > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {entryCategoryResult.fullContainers} full + {(parseFloat(entryNumStr) || 0).toFixed(1)} pt part
                                </div>
                              )}
                            </>
                          ) : entryActiveMethod === "each" ? (
                            // Bug 2: count-unit products — show a unit count, not a clamped tenths figure
                            <>
                              <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                                {Math.round(parseFloat(entryNumStr) || 0)}
                                <span className="text-base font-normal text-muted-foreground ml-1">units</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                {activeProduct?.size_ml && <div>{activeProduct.size_ml}ml each</div>}
                                {activeProduct?.cost_price && (
                                  <div>{formatGBP((parseFloat(entryNumStr) || 0) * activeProduct.cost_price)} stock value</div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                                {(entryCategoryResult?.tenths ?? entryTenths ?? 0).toFixed(1)}
                                <span className="text-base font-normal text-muted-foreground ml-1">tenths</span>
                              </div>
                              {activeProduct?.unit !== "count" && (
                                <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                  <div>{Math.round(entryCategoryResult?.mlRemaining ?? entryMl ?? 0)}ml remaining</div>
                                  {entryMeasureMl > 0 && (
                                    <div>{entryCategoryResult?.measuresRemaining ?? calcMeasuresLeft(entryMl ?? 0, entryMeasureMl)} × {entryMeasureMl}ml measures</div>
                                  )}
                                  {activeProduct.cost_price && (
                                    <div>{formatGBP(entryCategoryResult
                                      ? entryCategoryResult.valueGbp
                                      : calcWeighValuation(entryMl ?? 0, productCapacityMl(activeProduct), activeProduct.cost_price)
                                    )} stock value</div>
                                  )}
                                </div>
                              )}
                              {entryCategoryResult?.fullContainers != null && entryCategoryResult.fullContainers > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">{entryCategoryResult.fullContainers} full + part</div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <Button type="button" size="lg" className="w-full h-14 font-bold text-base mt-2" onClick={saveLineEntry} disabled={savingEntry || isUncalibratedWeigh} data-testid="button-save-entry">
                        {savingEntry ? "Saving..." : "Save Entry"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  // ─── STEP: summary ────────────────────────────────────────────────────────────

  if (step === "summary") {
    // Determine whether we're viewing a completed stocktake (read-only) vs reviewing
    // an in-progress one before closing. Use the authoritative status from the list,
    // not legacyReadings.length (which can be 0 if readings hadn't synced to Dexie).
    const activeStocktakeStatus = stocktakes?.find(s => s.id === activeStocktakeId)?.status;
    const isViewingClosed = activeStocktakeStatus === "closed";
    const uncounted = isViewingClosed ? [] : filteredProducts.filter(p => !(entriesByProduct.get(p.id) ?? []).length);
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
          {!isViewingClosed && (
            <Button variant="ghost" size="icon" onClick={() => setStep("counting")} data-testid="button-back-to-counting">
              <ArrowLeft />
            </Button>
          )}
          <h1 className="text-2xl font-bold text-primary">
            {isViewingClosed ? "Stocktake Summary" : "Review"}
          </h1>
        </div>
        <div className="flex-1 overflow-auto p-4 pb-24 space-y-3">
          <Card className="bg-primary text-primary-foreground border-none">
            <CardContent className="p-4">
              <div className="text-sm text-primary-foreground/80">Total Stock Value</div>
              <div className="text-4xl font-bold font-mono tabular-nums">{formatGBP(totalSummaryValue)}</div>
              <div className="text-sm text-primary-foreground/70 mt-0.5">{summaryLines.length} products counted</div>
            </CardContent>
          </Card>
          {uncounted.length > 0 && (
            <button
              type="button"
              onClick={() => { setLeftOnly(true); setStep("counting"); setCountingView("products"); }}
              className="w-full flex items-start gap-3 rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-left"
              data-testid="banner-uncounted"
            >
              <AlertCircle className="w-4 h-4 text-[#E0A343] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[#E0A343]">{uncounted.length} of {filteredProducts.length} lines not counted</span>
                <span className="text-xs text-[#E0A343]/80 block">
                  {uncounted.slice(0, 3).map(p => p.name).join(", ")}{uncounted.length > 3 ? ` and ${uncounted.length - 3} more` : ""}. They keep their last reading. Tap to count them, or close anyway.
                </span>
              </div>
              <span className="text-xs font-semibold text-[#E0A343] shrink-0 self-center">Count</span>
            </button>
          )}
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Per Product</h2>
          {summaryLines.map((line, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-sm">{line.prod.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {line.tenthsVal != null ? `${line.tenthsVal.toFixed(1)} tenths` : `${Math.round(line.mlRemaining)}ml`}
                    {line.gp != null && ` · GP ${line.gp.toFixed(0)}%`}
                  </div>
                </div>
                <div className="font-bold text-primary font-mono tabular-nums">{formatGBP(line.val)}</div>
              </CardContent>
            </Card>
          ))}
          {summaryLines.length === 0 && (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No products counted yet</CardContent></Card>
          )}
        </div>
        <div className="p-4 border-t border-border bg-card">
          {isViewingClosed ? (
            <Button size="lg" variant="outline" className="w-full h-14 font-bold" onClick={() => { setStep("list"); setActiveStocktakeId(null); setLegacyReadings([]); setSelectedProductIds([]); }} data-testid="button-done-viewing">
              Done
            </Button>
          ) : (
            <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={finishStocktake} disabled={closeStocktake.isPending || summaryLines.length === 0} data-testid="button-finish-stocktake">
              <CheckCircle className="w-5 h-5 mr-2" />
              {closeStocktake.isPending ? "Saving..." : "Save & Close Stocktake"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
