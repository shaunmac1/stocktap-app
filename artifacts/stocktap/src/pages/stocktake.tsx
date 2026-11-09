import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProducts, useLocations, useStocktakes,
  useCreateStocktake, useCloseStocktake, useAddReading,
  useCountLocations, useLineEntries, addLineEntry, deleteLineEntry,
  useAddCountLocation, useBottleShapes, useUpdateProduct, recomputeOpenEntriesForProduct,
  type BottleShape,
} from "@/hooks/api";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveStocktakeSchedule } from "@/hooks/useStocktakeCadence";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberPad, MultiFieldPad } from "@/components/NumberPad";
import { db } from "@/lib/db";
import type { LocalLineEntry } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import {
  calcMlRemaining, calcTenths, calcMeasuresLeft,
  calcWeighValuation, calcCountValuation,
  calcProductGpPercent, formatGBP,
  computeCategoryReading, resolveMeasureMl, draughtCapacityMl, productCapacityMl,
  CATEGORY_METHODS, METHOD_LABELS, CATEGORY_LABELS, ML_PER_PINT,
  formatGallonsPints, pintsToGallonsAndPints, litreContainerMl, postmixDrinkLitresPerBox,
  type CountingMethod, type ProductCategory, type CategoryReadingInput,
} from "@/lib/calculations";
import { isLitreOnBottles } from "@/lib/library-hygiene";
import { describeQuantity } from "@/lib/stock-display";
import { ContainerSizePicker } from "@/components/ContainerSizePicker";
import { DraughtGaugeEntry } from "@/components/DraughtGaugeEntry";
import { isHidden } from "@/lib/hidden-products";
import { buildDraughtSheet, draughtSheetCsv } from "@/lib/draught-sheet";
import { gaugeToPints, formatGauge, draughtBreakdown } from "@/lib/draught-gauge";
import { containerSizeLabel } from "@/lib/container-sizes";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { TenthsInput } from "@/components/TenthsInput";
import { FullBottleSetup } from "@/components/FullBottleSetup";
import { ArrowLeft, CheckCircle, Plus, Trash2, Cloud, CloudOff, MapPin, X, AlertCircle, Pencil } from "lucide-react";
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

/** " · 50L keg", " · 12L box", " · 330ml" — whatever size matters for this line. */
function productSizeLabel(p: { category?: string | null; counting_method?: string | null; container_l?: number | null; container_type?: string | null; size_ml?: number | null }): string {
  const draught = (p.category ?? "").startsWith("draught_") || ["keg_weight", "dipstick", "tenths_pints"].includes(p.counting_method ?? "");
  if (draught) return p.container_l ? ` · ${p.container_l}L ${p.container_type === "cask" ? "cask" : "keg"}` : "";
  if (p.counting_method === "litre" && p.container_l) return ` · ${p.container_l}L box`;
  return p.size_ml ? ` · ${p.size_ml >= 1000 ? `${p.size_ml / 1000}L` : `${p.size_ml}ml`}` : "";
}

/** Search that ignores case, accents and apostrophes: "gordons" finds "Gordon's". */
const norm = (t: string) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['\u2019.\-/&]/g, "").replace(/\s+/g, " ").trim();

/** One plain line under a product in the count list: how it gets counted. */
function howCounted(p: { category?: string | null; counting_method?: string | null; empty_weight_g?: number | null; dip_full_mm?: number | null; unit?: string | null }): string {
  const m = p.counting_method ?? (p.unit === "count" ? "each" : "tenths");
  switch (m) {
    case "weigh": return p.empty_weight_g != null ? "Weigh the open bottle" : "Weigh a full one first, or count in tenths";
    case "tenths": case "photo_tap": return p.empty_weight_g != null ? "Tenths, or weigh it" : "Tenths: full is 10, half is 5";
    case "keg_weight": return "Full kegs + part keg in gallons and pints";
    case "dipstick": return p.dip_full_mm ? "Dip it (mm) + full casks" : "Full casks + part cask in gallons and pints";
    case "tenths_pints": return "Tenths left in the cask + full ones";
    case "dozen": return "Full cases + loose ones";
    case "litre": return p.category === "postmix" ? "Boxes or litres of drink" : "Litres left";
    default: return "Count them";
  }
}

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
  const updateProductForSize = useUpdateProduct();
  const [showTypedTenths, setShowTypedTenths] = useState(false);

  // Core navigation
  const [step, setStep] = useState<Step>("list");
  const [showSecondCountPrompt, setShowSecondCountPrompt] = useState(false);
  const [bookingSecondCount, setBookingSecondCount] = useState(false);
  const saveSchedule = useSaveStocktakeSchedule();
  const bookSecondCount = async () => {
    if (!venue?.id) return;
    setBookingSecondCount(true);
    try {
      await saveSchedule.mutateAsync({
        p_venue_id: venue.id,
        p_count_location_id: null,
        p_cadence_days: 7,
        p_preferred_weekday: new Date().getDay(),
        p_reminder_time: "10:00",
        p_assigned_user_id: null,
        p_enabled: true,
      });
      toast({ title: "Next count booked", description: "Same day next week. You'll see it on Home, and you can change it in Settings." });
      setShowSecondCountPrompt(false);
    } catch (err: any) {
      toast({ title: "Couldn't book it", description: err.message, variant: "destructive" });
    } finally {
      setBookingSecondCount(false);
    }
  };
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
  // Draught can be typed as kegs (full kegs + pints in the part keg) or as a total in
  // gallons + pints, like a stocktaker's sheet. Remembered on this device.
  const [kegMode, setKegModeState] = useState<"kegs" | "gallons">(() => {
    try { return (localStorage.getItem("stocktap:keg-mode") as "kegs" | "gallons") || "kegs"; } catch { return "kegs"; }
  });
  const setKegMode = (m: "kegs" | "gallons") => {
    setKegModeState(m);
    try { localStorage.setItem("stocktap:keg-mode", m); } catch { /* private mode */ }
  };
  // Postmix can be typed as boxes (1.4) or as litres of drink (100.8, as Venners writes it).
  const [postmixMode, setPostmixModeState] = useState<"boxes" | "litres">(() => {
    try { return (localStorage.getItem("stocktap:postmix-mode") as "boxes" | "litres") || "litres"; } catch { return "litres"; }
  });
  const setPostmixMode = (m: "boxes" | "litres") => {
    setPostmixModeState(m);
    try { localStorage.setItem("stocktap:postmix-mode", m); } catch { /* private mode */ }
  };
  // Casks: most cellar dip rods are marked in pints, so that's offered alongside a ruler in mm.
  const [dipModePref, setDipModePref] = useState<"pints" | "mm">(() => {
    try { return (localStorage.getItem("stocktap:dip-mode") as "pints" | "mm") || "pints"; } catch { return "pints"; }
  });
  const setDipMode = (m: "pints" | "mm") => {
    setDipModePref(m);
    try { localStorage.setItem("stocktap:dip-mode", m); } catch { /* private mode */ }
  };
  const [dipDepthDraft, setDipDepthDraft] = useState("");
  // The spot last counted in (bar, cellar...) is used for the next count too, so a
  // walk round the bar isn't two taps per bottle. "Change" is one tap away.
  const [lastLocation, setLastLocation] = useState<{ id: string; name: string } | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const entryScrollRef = React.useRef<HTMLDivElement>(null);
  const [entryGallonsStr, setEntryGallonsStr] = useState("0");
  const [entryPintsStr, setEntryPintsStr] = useState("0");
  // Part keg/cask read off a keg gauge: gallons + pints (0–7), like the Venners sheet.
  const [partGalStr, setPartGalStr] = useState("0");
  const [partPtStr, setPartPtStr] = useState("0");
  const [dupAsk, setDupAsk] = useState(false);
  // Editing a saved draught count: the gauge opens with its numbers, Save replaces it.
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
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

  // The count list runs in the order you'd walk it: draught, then spirits, wines, bottles...
  const countListOrder = useMemo(() => {
    const order = Object.keys(CATEGORY_LABELS);
    const rank = (c: string | null) => { const i = order.indexOf(c ?? ""); return i === -1 ? 99 : i; };
    return [...filteredProducts].sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
  }, [filteredProducts]);

  const vendorOptions = useMemo(() => {
    if (!products) return [];
    const s = new Set<string>();
    for (const p of products) if (p.vendor?.trim()) s.add(p.vendor.trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Location chips: one per name, and only locations that actually have products in them —
  // a chip that filters to nothing (or a second "Main Bar") just confuses.
  const usableLocations = useMemo(() => {
    const withProducts = new Set((products ?? []).map(p => p.location_id).filter(Boolean) as string[]);
    const seen = new Set<string>();
    return (locations ?? []).filter(l => {
      const key = l.name.trim().toLowerCase();
      if (!withProducts.has(l.id) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [locations, products]);

  const pickableProducts = useMemo(() => {
    if (!products) return [];
    let list = products.filter(p => !isHidden(p as any));
    if (selectedLocationId !== "all") list = list.filter(p => p.location_id === selectedLocationId);
    if (selectedCategory !== "all") list = list.filter(p => p.category === selectedCategory);
    if (selectedVendor !== "all") list = list.filter(p => p.vendor === selectedVendor);
    const q = norm(searchStr);
    if (q) list = list.filter(p => norm(p.name).includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedLocationId, selectedCategory, selectedVendor, searchStr]);

  // Only categories you actually stock, with how many of each.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products ?? []) if (p.category) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [products]);

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
          (entryResolvedMethod === "tenths" ? "tenths" : entryResolvedMethod === "weigh" ? "weigh" : null))
      : null;
  // Weigh chosen but no bottle weights yet: ask for one full sealed bottle (FullBottleSetup)
  // instead of falling back to tenths. "Tenths" on the switch is always one tap away.
  const needsFullBottle = bottleMethodChoice === "weigh" && !canWeigh;
  const bottleMethodResolved: CountingMethod | null =
    bottleMethodChoice === "weigh" ? (canWeigh ? "weigh" : null) : bottleMethodChoice === "tenths" ? "tenths" : null;

  // Weigh product with no bottle-weight calibration and no tenths fallback chosen —
  // show a notice, not the tenths pad. Falling back silently caused grams to be
  // interpreted as tenths (1000g → 1000.0 tenths).
  const isUncalibratedWeigh =
    !needsFullBottle && bottleMethodResolved == null && entryResolvedMethod === "weigh" && activeProduct?.empty_weight_g == null;

  const entryActiveMethod: CountingMethod | null =
    bottleMethodResolved ||
    (isUncalibratedWeigh || needsFullBottle
      ? null
      // photo_tap requires a bottle shape — fall back gracefully if none is set
      : entryResolvedMethod === "photo_tap" && !activeShape
        ? (activeProduct?.empty_weight_g != null ? "weigh" : "tenths")
        // Cans and bottles that were imported as "litre" are counted each. Real bulk lines
        // (postmix, juice by the litre, cordial, syrup) keep the litres pad.
        : entryResolvedMethod === "litre" && activeProduct && isLitreOnBottles(activeProduct as any)
          ? "each"
          : entryResolvedMethod);

  // Without a full depth, mm can't be turned into pints, so the dip rod's pints are the way in.
  const dipMode = dipModePref;
  const dipByPints = entryActiveMethod === "dipstick" && dipMode === "pints";
  // Full kegs/casks + the open one read in gallons + pints off the gauge.
  const usesGauge = dipByPints || (entryActiveMethod === "keg_weight" && kegMode === "kegs");
  const gaugePints = gaugeToPints(parseFloat(partGalStr) || 0, parseFloat(partPtStr) || 0);

  const entryCategoryInput: CategoryReadingInput | null = useMemo(() => {
    if (!entryActiveMethod) return null;
    const fc = parseFloat(entryFullContainersStr) || 0;
    // Pints read off the dip rod work exactly like pints left in a keg.
    if (dipByPints) return { method: "keg_weight", partialPints: gaugePints, fullContainers: fc };
    switch (entryActiveMethod) {
      case "dipstick":    return { method: entryActiveMethod, dipMm: parseFloat(entryNumStr) || 0, fullContainers: fc };
      case "keg_weight":
        return kegMode === "gallons"
          ? { method: entryActiveMethod, totalPints: (parseFloat(entryGallonsStr) || 0) * 8 + (parseFloat(entryPintsStr) || 0) }
          : { method: entryActiveMethod, partialPints: gaugePints, fullContainers: fc };
      case "tenths_pints":return { method: entryActiveMethod, tenths: parseFloat(entryNumStr) || 0, fullContainers: fc };
      case "tenths":      return { method: entryActiveMethod, tenths: parseFloat(entryNumStr) || 0, fullContainers: fc };
      case "dozen":       return { method: entryActiveMethod, fullPacks: fc, partUnits: parseFloat(entryNumStr) || 0 };
      case "each":        return { method: entryActiveMethod, count: parseFloat(entryNumStr) || 0 };
      case "litre":       return {
        method: entryActiveMethod,
        litres: activeProduct?.category === "postmix" && postmixMode === "boxes"
          ? (parseFloat(entryNumStr) || 0) * postmixDrinkLitresPerBox(activeProduct as any)
          : parseFloat(entryNumStr) || 0,
      };
      case "weigh":       return { method: entryActiveMethod, weightG: parseFloat(entryWeightStr) || 0, fullContainers: parseFloat(entryFullContainersStr) || 0 };
      case "photo_tap":   return { method: entryActiveMethod, tapY: photoTapY, fullContainers: fc };
      default: return null;
    }
  }, [entryActiveMethod, entryNumStr, entryFullContainersStr, entryWeightStr, photoTapY, kegMode, entryGallonsStr, entryPintsStr, postmixMode, activeProduct, dipByPints, gaugePints]);

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

  // Nothing typed at all: the Save button says so, so a slip isn't saved as "none left" by accident.
  const entryIsZero = !!entryActiveMethod && (entryCategoryResult ? entryCategoryResult.mlRemaining <= 0 && !(entryCategoryResult.fullContainers ?? 0) && !(parseFloat(entryNumStr) || 0) : false);

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

  // Review groups lines by category (draught, spirits, wines...) with a subtotal each,
  // alphabetical inside — far easier to check against a stocktaker's sheet.
  const summaryGroups = useMemo(() => {
    const order = Object.keys(CATEGORY_LABELS);
    const groups = new Map<string, typeof summaryLines>();
    for (const line of summaryLines) {
      const key = line.prod.category ?? "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(line);
    }
    return Array.from(groups.entries())
      .sort((a, b) => (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0])))
      .map(([key, lines]) => ({
        key,
        label: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? "Other",
        lines: [...lines].sort((a, b) => a.prod.name.localeCompare(b.prod.name)),
        total: lines.reduce((s, l) => s + l.val, 0),
      }));
  }, [summaryLines]);

  // Per-line quantity in the unit that line is counted in (gallons, units, litres, tenths).
  const summaryQuantityLabel = (line: { prod: Product; mlRemaining: number; count?: number }) => {
    const entries = entriesByProduct.get(line.prod.id);
    if (entries && entries.length > 0) return describeQuantity(line.prod as any, entries as any).short;
    const method = line.prod.counting_method ?? (line.prod.unit === "count" ? "each" : "tenths");
    return describeQuantity(line.prod as any, [{ method, full_containers: null, part_value: line.count ?? null, ml_remaining: line.mlRemaining }]).short;
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const startStocktake = async () => {
    if (!venue?.id) return;
    try {
      const st = await createStocktake.mutateAsync({
        venue_id: venue.id,
        location_id: selectedLocationId === "all" ? null : selectedLocationId,
        status: "open",
        opened_at: new Date().toISOString(),
        // Remember which lines this count covers, so Resume shows the same 20
        // (not the whole library) and Home can say "8 of 20 done".
        product_ids: selectedProductIds.length > 0 && selectedProductIds.length < (products?.length ?? 0) ? selectedProductIds : null,
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
      const remembered = (st as { product_ids?: string[] | null }).product_ids;
      setSelectedProductIds(remembered && remembered.length > 0 ? remembered : (products?.map(p => p.id) ?? []));
      setLegacyReadings([]);
      setCountingView("products");
      setActiveProductId(null);
      setStep("counting");
    }
  };

  // /stocktake?open=1 (from the first-count flow or the Home banner) drops
  // straight into the open count instead of the list.
  const autoOpened = React.useRef(false);
  useEffect(() => {
    if (autoOpened.current || !stocktakes || !products) return;
    if (new URLSearchParams(window.location.search).get("open") !== "1") return;
    // The list can be a stale cache for a moment after the count was just
    // created (React Query refetches in the background), so keep the param
    // until an open count actually shows up rather than giving up on first render.
    const open = stocktakes.find(s => s.status === "open");
    if (!open) return;
    autoOpened.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    void openStocktake(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocktakes, products]);

  // /stocktake?draught=1 (the new-pub "Count my draught" button) opens a new count
  // with every draught line already ticked.
  const draughtPreselected = React.useRef(false);
  useEffect(() => {
    if (draughtPreselected.current || !products || !stocktakes) return;
    if (new URLSearchParams(window.location.search).get("draught") !== "1") return;
    draughtPreselected.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    const ids = products
      .filter(p => !isHidden(p as any))
      .filter(p => (p.category ?? "").startsWith("draught_") || ["keg_weight", "dipstick", "tenths_pints"].includes(p.counting_method ?? ""))
      .map(p => p.id);
    if (ids.length === 0) return;
    setSelectedProductIds(ids);
    setStep("select");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, stocktakes]);

  const resetEntryForm = () => {
    setEntryWeightStr("0"); setEntryNumStr("0"); setEntryFullContainersStr("0");
    setEntryGallonsStr("0"); setEntryPintsStr("0");
    setPartGalStr("0"); setPartPtStr("0"); setDupAsk(false); setEditingEntryId(null);
    setEntryLocationId(""); setEntryLocationName("");
    setEntryStep("location"); setShowAddEntry(false);
    setNewLocationInput(""); setShowNewLocationField(false);
  };

  const editDraughtEntry = (entry: any) => {
    const pints = Number(entry.part_value ?? 0);
    setEntryFullContainersStr(String(entry.full_containers ?? 0));
    setPartGalStr(String(Math.floor(pints / 8)));
    setPartPtStr(String(Math.round(pints % 8) % 8));
    if (activeProduct?.counting_method === "dipstick") setDipMode("pints"); else setKegMode("kegs");
    setEntryLocationId(entry.count_location_id ?? ""); setEntryLocationName(entry.count_location_name ?? "Unspecified");
    setEditingEntryId(entry.id); setDupAsk(false);
    setShowAddEntry(true); setEntryStep("value");
  };

  const pickLocation = (id: string, name: string) => {
    setEntryLocationId(id); setEntryLocationName(name); setEntryStep("value");
  };

  // Straight to the number pad in the last spot counted (or "no specific location" when the
  // pub has no spots set up). Picking a spot is only asked the first time.
  const openAddEntry = () => {
    setShowAddEntry(true);
    const known = lastLocation && (!lastLocation.id || (countLocations ?? []).some(l => l.id === lastLocation.id));
    if (known) pickLocation(lastLocation!.id, lastLocation!.name);
    else if (!(countLocations?.length)) pickLocation("", "Unspecified");
    else setEntryStep("location");
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

  // Bottle size picked on the tenths bottle: saves the line's size (e.g. the pub buys 1L not 70cl).
  const changeBottleSize = async (ml: number) => {
    if (!activeProduct || !venue?.id) return;
    try {
      const label = ml >= 1000 ? `${ml / 1000}L` : `${ml / 10}cl`;
      // Keep the name honest: "Gordon's Gin 70cl" becomes "Gordon's Gin 1L" when the size is in the name.
      const renamed = activeProduct.name.replace(/(\b\d+(?:\.\d+)?\s?(?:cl|ml|l|ltr|litre)\b)(?!.*\b\d+(?:\.\d+)?\s?(?:cl|ml|l|ltr|litre)\b)/i, label);
      await updateProductForSize.mutateAsync({ id: activeProduct.id, venue_id: venue.id, size_ml: ml, ...(renamed !== activeProduct.name ? { name: renamed } : {}) });
      toast({ title: "Bottle size changed", description: `${renamed} is now counted as ${label} bottles.` });
    } catch (err: any) {
      toast({ title: "Couldn't change the size", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  // Keg / cask / postmix box size, changeable right here on the count screen.
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [sizeDraft, setSizeDraft] = useState("");
  const isDraughtProduct = !!activeProduct && ((activeProduct.category ?? "").startsWith("draught_") || ["keg_weight", "dipstick", "tenths_pints"].includes(activeProduct.counting_method ?? ""));
  const isBoxProduct = !!activeProduct && !isDraughtProduct && (activeProduct.category === "postmix" || (activeProduct.counting_method === "litre" && activeProduct.container_l != null));
  const sizeKind = isBoxProduct ? "postmix" : (activeProduct?.container_type ?? "keg");
  useEffect(() => { setShowSizePicker(false); setSizeDraft(activeProduct?.container_l != null ? String(activeProduct.container_l) : ""); }, [activeProduct?.id, activeProduct?.container_l]);
  const changeContainerSize = async (litres: number) => {
    if (!activeProduct || !venue?.id || !(litres > 0)) return;
    const oldL = activeProduct.container_l != null ? Number(activeProduct.container_l) : null;
    if (oldL != null && Math.abs(oldL - litres) < 0.001) { setShowSizePicker(false); return; }
    try {
      await updateProductForSize.mutateAsync({
        id: activeProduct.id, venue_id: venue.id, container_l: litres,
        ...(isBoxProduct ? { container_type: "bag_in_box" } : {}),
      } as any);
      const fixed = await recomputeOpenEntriesForProduct({
        id: activeProduct.id, venue_id: venue.id, size_ml: activeProduct.size_ml ?? null, pack_size: activeProduct.pack_size ?? null,
        counting_method: activeProduct.counting_method, container_l: litres, old_container_l: oldL,
      });
      if (fixed > 0) { queryClient.invalidateQueries({ queryKey: ["line-entries", activeStocktakeId] }); await refetchEntries(); }
      setShowSizePicker(false);
      toast({
        title: "Size changed",
        description: `${activeProduct.name} is now a ${containerSizeLabel(litres, sizeKind)}.${fixed > 0 ? ` Updated ${fixed} ${fixed === 1 ? "count" : "counts"} typed in kegs.` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Couldn't change the size", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  const saveLineEntry = async (decision?: "replace" | "add") => {
    if (!activeProduct || !venue?.id || !user?.id || !activeStocktakeId) return;

    // Counting the same spot twice by mistake would silently double the line.
    // Ask: replace the earlier count, or add this as another keg/cask?
    const sameSpot = (entriesByProduct.get(activeProduct.id) ?? []).filter((e: any) => (e.count_location_id ?? null) === (entryLocationId || null) && e.id !== editingEntryId);
    if (isDraughtProduct && sameSpot.length > 0 && !decision && !editingEntryId) { setDupAsk(true); return; }
    setDupAsk(false);
    if (decision === "replace") { for (const e of sameSpot) await deleteLineEntry((e as any).id); }
    if (editingEntryId) { await deleteLineEntry(editingEntryId); setEditingEntryId(null); }

    // Bug 1: block save entirely for uncalibrated weigh products
    if (isUncalibratedWeigh || needsFullBottle) {
      toast({ title: "Weigh a full bottle first", description: "Or tap Tenths to count this one in tenths.", variant: "destructive" });
      return;
    }
    if (underEmptyWarning) {
      toast({ title: "Check the weight", description: underEmptyWarning, variant: "destructive" });
      return;
    }

    if (entryActiveMethod === "dipstick" && !dipByPints && !activeProduct.dip_full_mm) {
      toast({ title: "Set the full depth first", description: "Or tap Pints on the rod and type the pints.", variant: "destructive" });
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
      const typedAsTotal = entryActiveMethod === "keg_weight" && kegMode === "gallons";
      // A total typed in gallons + pints is saved as the total (no full-keg split), so it
      // stays right if the keg size is changed afterwards.
      const fullContainers = typedAsTotal ? null : entryCategoryResult?.fullContainers ?? null;
      // For weigh entries the raw gram reading is the authoritative part_value
      const partValue = entryActiveMethod === "weigh"
        ? parseFloat(entryWeightStr) || null
        : typedAsTotal
          ? Math.round((ml / ML_PER_PINT) * 1000) / 1000
          : usesGauge
            ? (gaugePints || null)
            : parseFloat(entryNumStr) || null;
      const method: LocalLineEntry["method"] = (dipByPints ? "keg_weight" : entryActiveMethod ?? (
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
      setLastLocation({ id: entryLocationId, name: entryLocationName || "Unspecified" });
      resetEntryForm();
    } catch (err: any) {
      toast({ title: "Error saving entry", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setSavingEntry(false);
    }
  };

  // Deleting a count is one tap, so it must be one tap to put back.
  const removeEntry = async (id: string) => {
    const removed = (lineEntries ?? []).find(e => e.id === id);
    await deleteLineEntry(id);
    queryClient.invalidateQueries({ queryKey: ["line-entries", activeStocktakeId] });
    await refetchEntries();
    if (removed) {
      const prod = products?.find(p => p.id === removed.product_id);
      const what = prod ? describeQuantity(prod as any, [removed as any]).short : "";
      toast({
        title: "Count removed",
        description: `${prod?.name ?? "Entry"}${what ? ` · ${what}` : ""}`,
        action: (
          <ToastAction
            altText="Undo"
            data-testid="button-undo-delete-entry"
            onClick={async () => {
              await addLineEntry({ ...removed, sync_status: "pending", updated_at: new Date().toISOString() });
              queryClient.invalidateQueries({ queryKey: ["line-entries", activeStocktakeId] });
              await refetchEntries();
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    }
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
      // The variance only exists once there's a second count to compare with.
      // After the first close, offer to book it.
      const closedBefore = (stocktakes ?? []).filter(s => s.status === "closed" && s.id !== activeStocktakeId).length;
      if (closedBefore === 0) setShowSecondCountPrompt(true);
    } catch (err: any) {
      toast({
        title: "Stocktake not closed",
        description: `No success was reported because a reading failed to save: ${String(err?.message ?? err)}`,
        variant: "destructive",
      });
    }
  };

  // Next line still to count after the one open, in list order (wraps round).
  const nextUncounted = (() => {
    if (!activeProductId) return null;
    const order = countListOrder;
    const i = order.findIndex(p => p.id === activeProductId);
    for (let k = 1; k <= order.length; k++) {
      const p = order[(i + k) % order.length];
      if (p && p.id !== activeProductId && !(entriesByProduct.get(p.id) ?? []).length) return p;
    }
    return null;
  })();

  // ─── STEP: list ──────────────────────────────────────────────────────────────

  if (step === "list") {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
          <h1 className="text-2xl font-bold text-primary">Stocktake</h1>
        </div>
        <div className="p-4 space-y-4 flex-1 overflow-auto pb-24">
          {showSecondCountPrompt && (
            <Card className="border-[#3FAE74]/40 bg-[#3FAE74]/10" data-testid="card-second-count-prompt">
              <CardContent className="p-4 space-y-3">
                <div className="font-bold text-sm">First count done. The number that matters comes next.</div>
                <p className="text-sm text-muted-foreground">
                  A single count tells you what you've got. The second one, a week from now, tells you what moved, and that's where the missing money shows up. Book it and StockTap will remind you.
                </p>
                <div className="flex gap-2">
                  <Button className="flex-1 h-11 font-semibold" onClick={bookSecondCount} disabled={bookingSecondCount} data-testid="button-book-second-count">
                    {bookingSecondCount ? "Booking…" : "Count again next week"}
                  </Button>
                  <Button variant="ghost" className="h-11" onClick={() => setShowSecondCountPrompt(false)} data-testid="button-skip-second-count">
                    Not now
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {(() => {
            const openOne = (stocktakes ?? []).find(s => s.status === "open");
            return (
              <>
                <Button size="lg" className="w-full h-16 text-lg font-bold shadow-md" onClick={() => (openOne ? setConfirmNew(v => !v) : setStep("select"))} data-testid="button-new-stocktake">
                  Start New Stocktake
                </Button>
                {confirmNew && openOne && (
                  <Card className="border-[#E0A343]/40 bg-[#E0A343]/10" data-testid="card-confirm-new">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-sm">You've already got a count open from {formatDate(openOne.opened_at)}. Carry on with that one? Starting another means two counts on the go, and Reports compares closed counts only.</p>
                      <div className="flex gap-2">
                        <Button className="flex-1 h-11 font-semibold" onClick={() => { setConfirmNew(false); openStocktake(openOne); }} data-testid="button-carry-on-open">Carry on that count</Button>
                        <Button variant="outline" className="h-11" onClick={() => { setConfirmNew(false); setStep("select"); }} data-testid="button-start-another">Start another</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
          <Card data-testid="card-stocktake-tips">
            <CardContent className="p-0">
              <button type="button" className="w-full flex items-center justify-between p-4 text-left" onClick={() => setShowTips(v => !v)} aria-expanded={showTips} data-testid="button-stocktake-tips">
                <span className="font-semibold text-sm">How a count works, and weigh or tenths?</span>
                <span className="text-xs font-semibold text-primary">{showTips ? "Hide" : "Show"}</span>
              </button>
              {showTips && (
                <div className="px-4 pb-4 space-y-2 text-sm text-muted-foreground" data-testid="stocktake-tips">
                  <p><strong className="text-foreground">1. Pick what to count.</strong> The whole bar, or just the spirits on a Tuesday. You don't have to do everything at once.</p>
                  <p><strong className="text-foreground">2. Count each line where it is.</strong> Same drink behind the bar and in the cellar? Count it in both spots and StockTap adds them up.</p>
                  <p><strong className="text-foreground">Weigh or tenths?</strong> Tenths is a look at the bottle: full is 10, half is 5. Quick, and a good start. Weighing is spot on to the ml, and you set a bottle up once by putting one full sealed bottle on the scale. Do it for the dear ones first.</p>
                  <p><strong className="text-foreground">Draught.</strong> Kegs: pints left in the open keg plus the full ones. Casks: the pints on your dip rod plus the full ones.</p>
                  <p><strong className="text-foreground">3. Review and close.</strong> Closing saves the value. Count again next week and Reports shows what moved and what went missing.</p>
                  <p>It all saves on the phone as you go, so a bad signal in the cellar doesn't lose anything.</p>
                </div>
              )}
            </CardContent>
          </Card>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2">Past Stocktakes</h2>
          {!stocktakes?.length ? (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No counts yet. Tap Start New Stocktake and pick a few lines to try it.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {stocktakes.map(st => (
                <Card key={st.id} data-testid={`card-stocktake-${st.id}`} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openStocktake(st)}>
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-sm">{formatDate(st.opened_at)}</div>
                      {st.status === "open" ? (
                        <OpenCountProgress stocktake={st as any} totalProducts={products?.length ?? 0} />
                      ) : st.total_value != null && st.total_value > 0 ? (
                        <div className="text-sm text-muted-foreground">{formatGBP(st.total_value)}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Closed</div>
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
            <Button variant="ghost" size="icon" onClick={() => setStep("list")} data-testid="button-back-to-list" aria-label="Back"><ArrowLeft /></Button>
            <div>
              <h1 className="text-xl font-bold text-primary">Choose what to count</h1>
              <p className="text-xs text-muted-foreground">Pick any lines. You don't have to do the whole bar.</p>
            </div>
          </div>
          <Input placeholder={`Search ${products?.length ?? 0} products…`} value={searchStr} onChange={e => setSearchStr(e.target.value)} data-testid="input-stocktake-search" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedLocationId === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedLocationId("all")} data-testid="button-location-filter-all">All locations</button>
            {usableLocations.map(loc => (
              <button key={loc.id} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedLocationId === loc.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedLocationId(loc.id)} data-testid={`button-location-filter-${loc.id}`}>{loc.name}</button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedCategory === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedCategory("all")} data-testid="button-category-filter-all">All categories</button>
            {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).filter(cat => categoryCounts.has(cat)).map(cat => (
              <button key={cat} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} onClick={() => setSelectedCategory(cat)} data-testid={`button-category-filter-${cat}`}>{CATEGORY_LABELS[cat]} {categoryCounts.get(cat)}</button>
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
            <button className="font-semibold text-primary" onClick={allVisibleSelected ? clearSelection : selectAllVisible} data-testid="button-select-all-shown">{allVisibleSelected ? "Clear all" : `Select all ${pickableProducts.length} shown`}</button>
            <span className="text-muted-foreground" data-testid="text-selected-count">{selectedProductIds.length} selected{selectedProductIds.length > 0 && !allVisibleSelected ? <> · <button type="button" className="underline" onClick={clearSelection} data-testid="button-clear-selection">clear</button></> : null}</span>
          </div>
        </div>
        <div className="p-4 space-y-2 flex-1 overflow-auto pb-28">
          {pickableProducts.length === 0 ? (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm" data-testid="select-no-results">{searchStr.trim() ? `Nothing called “${searchStr.trim()}”. Add it in the Library first.` : "Nothing in this filter"}</CardContent></Card>
          ) : pickableProducts.map(p => {
            const checked = selectedProductIds.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggleProductSel(p.id)} data-testid={`select-product-${p.id}`} className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${checked ? "border-primary bg-primary/5" : "border-border"}`}>
                <div>
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.category ? (CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category) : "—"}{productSizeLabel(p)} · {howCounted(p)}</div>
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
      const q = norm(countingSearch);
      const searched = q ? countListOrder.filter(p => norm(p.name).includes(q)) : countListOrder;
      // "Counting in: Cellar" — the spot you're standing in. Lines tick off per spot,
      // and opening a line goes straight to full kegs, then gallons, then pints there.
      const spot = lastLocation && lastLocation.id && (countLocations ?? []).some(l => l.id === lastLocation.id) ? lastLocation : null;
      const inSpot = (pid: string) => (entriesByProduct.get(pid) ?? []).filter((e: any) => !spot || (e.count_location_id ?? "") === spot.id);
      const leftCount = filteredProducts.filter(p => inSpot(p.id).length === 0).length;
      const visibleProducts = searched.filter(p => !leftOnly || inSpot(p.id).length === 0);
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
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-count-progress">{enteredCount} of {filteredProducts.length} counted · saved as you go</p>
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
            {(countLocations?.length ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Counting in">
                <span className="text-xs font-semibold text-muted-foreground shrink-0">Counting in:</span>
                {countLocations!.map(loc => (
                  <button
                    key={loc.id}
                    type="button"
                    role="radio"
                    aria-checked={spot?.id === loc.id}
                    onClick={() => setLastLocation(spot?.id === loc.id ? null : { id: loc.id, name: loc.name })}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border ${spot?.id === loc.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                    data-testid={`button-count-spot-${loc.id}`}
                  >{loc.name}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto p-4 pb-24 space-y-2">
            {filteredProducts.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No products selected</CardContent></Card>
            ) : visibleProducts.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">{q ? "No products match that search" : "Everything is counted"}</CardContent></Card>
            ) : visibleProducts.map((p, idx) => {
              const entries = entriesByProduct.get(p.id) ?? [];
              const here = inSpot(p.id);
              const q = entries.length > 0 ? describeQuantity(p as any, entries as any) : null;
              const pending = entries.some(e => e.sync_status === "pending");
              const heading = idx === 0 || visibleProducts[idx - 1].category !== p.category
                ? (p.category ? (CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category) : "Other")
                : null;
              return (
                <React.Fragment key={p.id}>
                {heading && <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2" data-testid={`count-group-${p.category ?? "other"}`}>{heading}</h2>}
                <button
                  data-testid={`counting-product-${p.id}`}
                  onClick={() => { setActiveProductId(p.id); setCountingView("detail"); if (spot && here.length === 0) openAddEntry(); }}
                  className={`w-full flex items-start justify-between p-3 rounded-xl border text-left transition-colors ${here.length > 0 ? "border-primary/40 bg-primary/5" : "border-border"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    {entries.length === 0 ? (
                      <div className="text-xs text-muted-foreground" data-testid={`text-how-${p.id}`}>{howCounted(p)}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {q?.short ?? ""}
                        {entries.length > 1 && ` · ${entries.length} spots`}
                        {q?.value != null && ` · ${formatGBP(q.value)}`}
                      </div>
                    )}
                    {spot && (
                      <div className={`text-xs font-semibold mt-0.5 ${here.length ? "text-primary" : "text-[#B26A00]"}`} data-testid={`spot-status-${p.id}`}>
                        {here.length ? `✓ Done in ${spot.name}` : `Not counted in ${spot.name} yet`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {pending && <CloudOff className="w-3.5 h-3.5 text-[#E0A343]" />}
                    {entries.length > 0 && !pending && <Cloud className="w-3.5 h-3.5 text-[#3FAE74]" />}
                    <span className="text-xs text-muted-foreground">{entries.length > 0 ? `${entries.length}` : "+"}</span>
                  </div>
                </button>
                </React.Fragment>
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
                <p className="text-xs text-muted-foreground">{activeProduct.category ? (CATEGORY_LABELS[activeProduct.category as keyof typeof CATEGORY_LABELS] ?? activeProduct.category) : "—"}{productSizeLabel(activeProduct)}</p>
              </div>
            </div>
          </div>

          {/* Entry list */}
          <div className="flex-1 overflow-auto p-4 pb-32 space-y-2">
            {productEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm space-y-2" data-testid="text-detail-empty">
                <p>Not counted yet. {howCounted(activeProduct)}.</p>
                <p className="text-xs">Got some behind the bar and some in the cellar? Add a count for each spot and they're added up.</p>
              </div>
            ) : productEntries.map(entry => {
              const eq = describeQuantity(activeProduct as any, [entry as any]);
              return (
                <Card key={entry.id} data-testid={`entry-card-${entry.id}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{!entry.count_location_name || entry.count_location_name === "Unspecified" ? "No specific spot" : entry.count_location_name}</span>
                        {entry.sync_status === "pending"
                          ? <CloudOff className="w-3 h-3 text-[#E0A343] shrink-0" />
                          : <Cloud className="w-3 h-3 text-[#3FAE74] shrink-0" />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {eq.short}
                        {eq.kind === "draught" && entry.full_containers ? ` · ${entry.full_containers} full + ${formatGauge(entry.part_value ?? 0)}` : ""}
                        {eq.kind === "bottles" && ` · ${eq.detail}`}
                        {eq.value != null && ` · ${formatGBP(eq.value)}`}
                      </div>
                    </div>
                    {eq.kind === "draught" && entry.full_containers != null && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0" onClick={() => editDraughtEntry(entry)} aria-label="Edit this count" data-testid={`button-edit-entry-${entry.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
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
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total across all spots</div>
                {(() => {
                  const tq = describeQuantity(activeProduct as any, productEntries as any);
                  return (
                    <>
                      <div className="text-3xl font-bold text-primary font-mono tabular-nums" data-testid="text-product-total">
                        {tq.main}
                        {tq.unit && <span className="text-base font-normal text-muted-foreground ml-1">{tq.unit}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {[tq.detail, tq.value != null ? formatGBP(tq.value) : ""].filter(Boolean).join(" · ")}
                      </div>
                    </>
                  );
                })()}
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

          {/* Add a count, then straight on to the next line */}
          <div className="p-4 border-t border-border bg-card sticky bottom-0 space-y-2">
            {productEntries.length > 0 && nextUncounted ? (
              <>
                <Button size="lg" className="w-full h-14 font-bold text-base" onClick={() => { setActiveProductId(nextUncounted.id); openAddEntry(); }} data-testid="button-next-product">
                  <span className="truncate">Next: {nextUncounted.name}</span>
                </Button>
                <Button variant="outline" className="w-full h-11 font-semibold" onClick={openAddEntry} data-testid="button-add-entry">
                  <Plus className="w-4 h-4 mr-1" /> Some in another spot too
                </Button>
              </>
            ) : (
              <Button size="lg" className="w-full h-14 font-bold text-base" onClick={openAddEntry} data-testid="button-add-entry">
                <Plus className="w-5 h-5 mr-2" /> {productEntries.length ? "Add another spot" : "Count it"}
              </Button>
            )}
            {productEntries.length > 0 && !nextUncounted && (
              <Button size="lg" variant="outline" className="w-full h-12 font-semibold" onClick={() => setStep("summary")} data-testid="button-all-counted-review">
                All counted · Review &amp; close
              </Button>
            )}
          </div>

          {/* Add entry bottom sheet — z-[60] so it sits above the z-50 bottom nav */}
          {showAddEntry && (
            <div className="fixed inset-0 z-[60] flex flex-col justify-end" data-testid="add-entry-sheet">
              <div className="absolute inset-0 bg-black/50" onClick={resetEntryForm} />
              <div className="relative bg-card rounded-t-2xl border border-border max-h-[90vh] flex flex-col">
                {/* Sheet header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  {entryStep === "value" ? (
                    <button onClick={() => setEntryStep("location")} className="flex items-center gap-1 text-sm font-medium text-primary" data-testid="button-change-spot">
                      <MapPin className="w-4 h-4" /> Change spot
                    </button>
                  ) : <div />}
                  <div className="text-center flex-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {entryStep === "location" ? "Where is it?" : entryLocationName === "Unspecified" || !entryLocationName ? "No specific spot" : entryLocationName}
                    </div>
                  </div>
                  <button onClick={resetEntryForm} className="text-muted-foreground" data-testid="button-close-entry-sheet">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-auto flex-1 p-4 space-y-3" ref={entryScrollRef}>
                  {entryStep === "location" ? (
                    <>
                      {/* No location option */}
                      <button
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors border-border text-muted-foreground`}
                        onClick={() => pickLocation("", "Unspecified")}
                        data-testid="button-location-unspecified"
                      >
                        <div className="w-8 h-8 rounded-full border-2 border-border flex items-center justify-center shrink-0 text-xs">—</div>
                        <span className="text-sm font-medium">No specific spot</span>
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
                          <span className="text-sm font-medium text-muted-foreground">Add a spot (bar, cellar, back fridge)…</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Value entry step */}
                      <div className="text-center mb-2">
                        <div className="text-sm font-bold truncate" data-testid="text-entry-product">{activeProduct.name}</div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                          {entryActiveMethod === "keg_weight" ? "Kegs" : entryActiveMethod === "dipstick" ? "Cask" : needsFullBottle ? "Set this bottle up" : entryActiveMethod === "each" ? "Count them" : entryActiveMethod ? METHOD_LABELS[entryActiveMethod] : "Enter amount"}
                        </div>
                      </div>

                      {isBottleLine && activeProduct && entryResolvedMethod !== "photo_tap" && (
                        <div className="space-y-1">
                          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="radiogroup" aria-label="How to count this bottle">
                            <button
                              type="button"
                              role="radio"
                              aria-checked={entryActiveMethod === "weigh" || needsFullBottle}
                              onClick={() => { setBottleMethodOverride(prev => ({ ...prev, [activeProduct.id]: "weigh" })); setEntryNumStr("0"); }}
                              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${entryActiveMethod === "weigh" || needsFullBottle ? "bg-primary text-primary-foreground" : "text-muted-foreground"} disabled:opacity-40`}
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
                          {!canWeigh && entryActiveMethod === "tenths" && (
                            <p className="text-[11px] text-muted-foreground text-center">Got a full sealed bottle? Tap Weigh to set this bottle up once.</p>
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

                      {needsFullBottle && activeProduct && venue?.id && user?.id && (
                        <FullBottleSetup
                          product={activeProduct as any}
                          venueId={venue.id}
                          userId={user.id}
                          switchToWeigh={activeProduct.counting_method !== "weigh"}
                          useTenthsLabel="No full bottle to hand? Count this one in tenths"
                          onDone={() => entryScrollRef.current?.scrollTo({ top: 0 })}
                          onUseTenths={() => setBottleMethodOverride(prev => ({ ...prev, [activeProduct.id]: "tenths" }))}
                        />
                      )}

                      {entryActiveMethod === "weigh" && (
                        <p className="text-xs text-muted-foreground text-center" data-testid="tip-weigh">Open bottle on the scale, then type the grams. Pourer off if you can: the bottle was set up with its cap on.</p>
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
                      {(isDraughtProduct || (isBoxProduct && entryActiveMethod === "litre")) && (
                        <div className="rounded-xl border border-border p-3" data-testid="container-size-row">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm">
                              <span className="text-muted-foreground">{isBoxProduct ? "Box size" : activeProduct?.container_type === "cask" ? "Cask size" : "Keg size"}: </span>
                              <span className="font-semibold" data-testid="text-container-size">{activeProduct?.container_l ? containerSizeLabel(Number(activeProduct.container_l), sizeKind) : "not set"}</span>
                              {activeProduct?.category === "postmix" && activeProduct?.container_l ? <span className="text-muted-foreground" data-testid="text-postmix-yield"> · makes {postmixDrinkLitresPerBox(activeProduct as any)}L</span> : null}
                            </div>
                            <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setShowSizePicker(v => !v)} data-testid="button-change-container-size">
                              {showSizePicker ? "Cancel" : "Change"}
                            </button>
                          </div>
                          {showSizePicker && (
                            <div className="mt-3 space-y-3">
                              <ContainerSizePicker
                                id="count-container-size"
                                kind={sizeKind}
                                label={isBoxProduct ? "How big is the box?" : "How big is the keg?"}
                                value={sizeDraft}
                                onChange={setSizeDraft}
                                onPreset={changeContainerSize}
                                testId="count"
                              />
                              <Button type="button" variant="outline" className="w-full" disabled={!(parseFloat(sizeDraft) > 0)} onClick={() => changeContainerSize(parseFloat(sizeDraft))} data-testid="button-save-container-size">
                                Use {parseFloat(sizeDraft) > 0 ? `${parseFloat(sizeDraft)}L` : "this size"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {entryActiveMethod === "tenths_pints" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Tenths remaining (0–10)" allowDecimal />}
                      {entryActiveMethod === "tenths" && (<>
                          <TenthsInput value={entryNumStr} onChange={setEntryNumStr} shapePath={activeProduct?.shape_path} fillCurve={activeProduct?.fill_curve} imageUrl={activeProduct?.image_path} sizeMl={activeProduct?.size_ml ?? null} onSizeChange={changeBottleSize} />
                          <button type="button" className="text-xs underline text-muted-foreground w-full" onClick={() => setShowTypedTenths(v => !v)} data-testid="button-type-tenths">
                            {showTypedTenths ? "Hide number pad" : "Type the number instead"}
                          </button>
                          {showTypedTenths && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Tenths remaining (0–10)" allowDecimal />}
                        </>)}
                      {entryActiveMethod === "keg_weight" && (
                        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="radiogroup" aria-label="How to enter draught">
                          {(["kegs", "gallons"] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              role="radio"
                              aria-checked={kegMode === m}
                              onClick={() => setKegMode(m)}
                              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${kegMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                              data-testid={`button-keg-mode-${m}`}
                            >
                              {m === "kegs" ? "Full + part keg" : "Line total"}
                            </button>
                          ))}
                        </div>
                      )}
                      {entryActiveMethod === "keg_weight" && (
                        <p className="text-xs text-muted-foreground text-center" data-testid="tip-keg">{kegMode === "kegs" ? "Count the full kegs, then read the open one off your keg gauge in gallons and pints." : "The total for this line, as a stocktaker's sheet writes it: 5 gal 4 pt."}</p>
                      )}
                      {entryActiveMethod === "keg_weight" && kegMode === "kegs" && (activeProduct?.container_l ? (
                        <DraughtGaugeEntry
                          kind={dipByPints || activeProduct?.container_type === "cask" ? "cask" : "keg"}
                          containerL={activeProduct?.container_l != null ? Number(activeProduct.container_l) : null}
                          full={entryFullContainersStr} onFull={setEntryFullContainersStr}
                          gallons={partGalStr} onGallons={setPartGalStr}
                          pints={partPtStr} onPints={setPartPtStr}
                        />
                      ) : (
                        <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm text-[#E0A343]" data-testid="warn-no-keg-size">
                          Pick the keg size above first (tap Change next to Keg size), so full kegs add up right.
                        </div>
                      ))}
                      {entryActiveMethod === "keg_weight" && kegMode === "gallons" && (
                        <MultiFieldPad
                          testId="gallons-pad"
                          fields={[
                            { key: "gal", label: "Gallons", value: entryGallonsStr, onChange: setEntryGallonsStr },
                            { key: "pt", label: "Pints", value: entryPintsStr, onChange: setEntryPintsStr, allowDecimal: true },
                          ]}
                        />
                      )}
                      {entryActiveMethod === "dipstick" && (
                        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="radiogroup" aria-label="How to dip the cask">
                          {(["pints", "mm"] as const).map(m => (
                            <button key={m} type="button" role="radio" aria-checked={dipMode === m}
                              onClick={() => { setDipMode(m); setEntryNumStr("0"); }}
                              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${dipMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                              data-testid={`button-dip-mode-${m}`}>
                              {m === "pints" ? "Gallons + pints" : "Ruler (mm)"}
                            </button>
                          ))}
                        </div>
                      )}
                      {entryActiveMethod === "dipstick" && dipMode === "pints" && (
                        <>
                          <p className="text-xs text-muted-foreground text-center" data-testid="tip-dip-pints">Count the full casks, then read the open one off your gauge or rod in gallons and pints.</p>
                          <DraughtGaugeEntry
                          kind={dipByPints || activeProduct?.container_type === "cask" ? "cask" : "keg"}
                          containerL={activeProduct?.container_l != null ? Number(activeProduct.container_l) : null}
                          full={entryFullContainersStr} onFull={setEntryFullContainersStr}
                          gallons={partGalStr} onGallons={setPartGalStr}
                          pints={partPtStr} onPints={setPartPtStr}
                        />
                        </>
                      )}
                      {entryActiveMethod === "dipstick" && dipMode === "mm" && activeProduct?.dip_full_mm && (
                        <NumberPad value={entryNumStr} onChange={setEntryNumStr} label={`Dip reading (mm, full is ${activeProduct.dip_full_mm})`} allowDecimal />
                      )}
                      {entryActiveMethod === "dipstick" && dipMode === "mm" && !activeProduct?.dip_full_mm && (
                        <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 space-y-2" data-testid="dip-depth-setup">
                          <p className="text-sm">To use a ruler, StockTap needs how deep this cask is when it's full, in mm. Dip a full one once and type it here. Until then, the pints on your rod work fine.</p>
                          <div className="flex gap-2">
                            <Input type="number" inputMode="decimal" placeholder="Full depth in mm, e.g. 600" value={dipDepthDraft} onChange={e => setDipDepthDraft(e.target.value)} data-testid="input-dip-full-depth" />
                            <Button type="button" disabled={!(parseFloat(dipDepthDraft) > 0)} data-testid="button-save-dip-depth"
                              onClick={async () => {
                                try {
                                  await updateProductForSize.mutateAsync({ id: activeProduct!.id, venue_id: venue!.id, dip_full_mm: parseFloat(dipDepthDraft) } as any);
                                  setDipDepthDraft(""); setEntryNumStr("0");
                                  toast({ title: "Full depth saved", description: `${activeProduct!.name}: now dip it in mm.` });
                                } catch (err: any) {
                                  toast({ title: "Couldn't save that", description: String(err?.message ?? err), variant: "destructive" });
                                }
                              }}>Save</Button>
                          </div>
                        </div>
                      )}
                      {entryActiveMethod === "dozen" && <p className="text-xs text-muted-foreground text-center" data-testid="tip-dozen">Loose ones first, then full cases underneath. {activeProduct?.pack_size ?? 12} to a case.</p>}
                      {entryActiveMethod === "dozen" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Loose ones (not in a full case)" allowDecimal />}
                      {entryActiveMethod === "each" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Units" allowDecimal />}
                      {entryActiveMethod === "litre" && activeProduct?.category === "postmix" && (
                        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="radiogroup" aria-label="How to enter postmix">
                          {(["boxes", "litres"] as const).map(m => (
                            <button key={m} type="button" role="radio" aria-checked={postmixMode === m}
                              onClick={() => { setPostmixMode(m); setEntryNumStr("0"); }}
                              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${postmixMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                              data-testid={`button-postmix-mode-${m}`}>
                              {m === "boxes" ? "Boxes" : "Litres of drink"}
                            </button>
                          ))}
                        </div>
                      )}
                      {entryActiveMethod === "litre" && <NumberPad value={entryNumStr} onChange={setEntryNumStr} label={activeProduct?.category === "postmix" ? (postmixMode === "boxes" ? "Boxes (e.g. 1.4)" : "Litres of drink") : "Litres"} allowDecimal />}

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
                      {!entryActiveMethod && !needsFullBottle && activeProduct?.unit !== "count" && activeProduct?.empty_weight_g == null && (
                        <NumberPad value={entryNumStr} onChange={setEntryNumStr} label="Tenths remaining (0–10)" allowDecimal />
                      )}

                      {((entryActiveMethod === "dipstick" && dipMode === "mm" && !!activeProduct?.dip_full_mm) || entryActiveMethod === "tenths_pints" || entryActiveMethod === "dozen" || entryActiveMethod === "weigh" || entryActiveMethod === "tenths") && (
                        (
                          <NumberPad
                            value={entryFullContainersStr}
                            onChange={setEntryFullContainersStr}
                            label={entryActiveMethod === "dozen" ? "Full cases" : (entryActiveMethod === "weigh" || entryActiveMethod === "tenths") ? "Full sealed bottles" : activeProduct?.container_type === "keg" ? "Full kegs (not tapped)" : "Full casks (not tapped)"}
                          />
                        )
                      )}

                      {/* Real-time result — only show once the user has typed a non-zero value */}
                      {(entryCategoryResult || (entryTenths != null && entryTenths > 0) || (entryMl != null && entryMl > 0)) && (
                        <div className="bg-background rounded-xl border border-border p-4 text-center">
                          {(entryActiveMethod === "keg_weight" || entryActiveMethod === "dipstick") ? (() => {
                            const totalPints = (entryCategoryResult?.mlRemaining ?? 0) / ML_PER_PINT;
                            const full = entryCategoryResult?.fullContainers ?? 0;
                            const partPints = (((entryCategoryResult?.mlRemaining ?? 0) - full * (activeProduct?.container_l ?? 0) * 1000) / ML_PER_PINT);
                            return (
                              <>
                                <div className="text-3xl font-bold text-primary font-mono tabular-nums" data-testid="text-keg-result">
                                  {formatGallonsPints(totalPints)}
                                </div>
                                <div className="text-sm font-semibold mt-1" data-testid="text-keg-breakdown">
                                  {draughtBreakdown(totalPints, activeProduct?.container_l != null ? Number(activeProduct.container_l) : null, entryActiveMethod === "dipstick" || activeProduct?.container_type === "cask" ? "cask" : "keg")}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {activeProduct?.container_l ? `${full} full ${entryActiveMethod === "dipstick" ? (full === 1 ? "cask" : "casks") : (full === 1 ? "keg" : "kegs")} + ${formatGauge(partPints)} in the open one` : ""}
                                </div>
                                {activeProduct?.cost_price && entryCategoryResult ? (
                                  <div className="text-sm text-muted-foreground">{formatGBP(entryCategoryResult.valueGbp)} stock value</div>
                                ) : null}
                              </>
                            );
                          })() : entryActiveMethod === "dozen" ? (() => {
                            const units = (entryCategoryResult?.fullContainers ?? 0) * (activeProduct?.pack_size ?? 12) + (parseFloat(entryNumStr) || 0);
                            return (
                              <>
                                <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                                  {Math.round(units * 100) / 100}
                                  <span className="text-base font-normal text-muted-foreground ml-1">units</span>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                  <div>{entryCategoryResult?.fullContainers ?? 0} × {activeProduct?.pack_size ?? 12} + {parseFloat(entryNumStr) || 0} loose</div>
                                  {activeProduct?.cost_price && <div>{formatGBP((units / (activeProduct.pack_size ?? 12)) * activeProduct.cost_price)} stock value</div>}
                                </div>
                              </>
                            );
                          })() : entryActiveMethod === "litre" ? (() => {
                            const litres = (entryCategoryResult?.mlRemaining ?? 0) / 1000;
                            return (
                              <>
                                <div className="text-3xl font-bold text-primary font-mono tabular-nums">
                                  {Math.round(litres * 100) / 100}
                                  <span className="text-base font-normal text-muted-foreground ml-1">L</span>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                  {activeProduct?.category === "postmix"
                                    ? <div data-testid="text-postmix-boxes">= {(() => { const b = Math.round((litres / postmixDrinkLitresPerBox(activeProduct as any)) * 100) / 100; return `${b} ${b === 1 ? "box" : "boxes"}`; })()} ({postmixDrinkLitresPerBox(activeProduct as any)}L of drink a box)</div>
                                    : activeProduct?.container_l ? <div>= {(() => { const b = Math.round((litres / activeProduct.container_l!) * 100) / 100; return `${b} ${b === 1 ? "box" : "boxes"}`; })()} of {activeProduct.container_l}L</div> : null}
                                  {activeProduct?.cost_price && entryCategoryResult ? <div>{formatGBP(entryCategoryResult.valueGbp)} stock value</div> : null}
                                </div>
                              </>
                            );
                          })() : entryActiveMethod === "each" ? (
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

                      {dupAsk && activeProduct && (() => {
                        const same = (entriesByProduct.get(activeProduct.id) ?? []).filter((e: any) => (e.count_location_id ?? null) === (entryLocationId || null));
                        const ml = same.reduce((a: number, e: any) => a + (e.ml_remaining ?? 0), 0);
                        return (
                          <div className="rounded-xl border-2 border-[#E0A343] bg-[#E0A343]/10 p-3 space-y-2" data-testid="dup-spot-ask">
                            <p className="text-sm font-semibold">{activeProduct.name} is already counted at {entryLocationName || "this spot"}: {formatGauge(ml / ML_PER_PINT)}.</p>
                            <p className="text-xs text-muted-foreground">Recounting? Replace it. Another open keg on the same line? Add it.</p>
                            <div className="grid grid-cols-2 gap-2">
                              <Button type="button" className="h-11" onClick={() => saveLineEntry("replace")} data-testid="button-dup-replace">Replace it</Button>
                              <Button type="button" variant="outline" className="h-11" onClick={() => saveLineEntry("add")} data-testid="button-dup-add">Add as another</Button>
                            </div>
                          </div>
                        );
                      })()}
                      <Button type="button" size="lg" className="w-full h-14 font-bold text-base mt-2" onClick={() => saveLineEntry()} disabled={savingEntry || isUncalibratedWeigh || needsFullBottle || (entryActiveMethod === "dipstick" && dipMode === "mm" && !activeProduct?.dip_full_mm)} data-testid="button-save-entry">
                        {savingEntry ? "Saving..." : editingEntryId ? "Save changes" : entryIsZero ? "Save: none left" : "Save"}
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
              <div className="text-sm text-primary-foreground/70 mt-0.5">{summaryLines.length} {summaryLines.length === 1 ? "line" : "lines"} counted{isViewingClosed ? "" : ". Nothing's final until you close."}</div>
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
          {(() => {
            const noPrice = summaryLines.filter(l => !l.prod.cost_price);
            return noPrice.length > 0 ? (
              <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm" data-testid="banner-no-price">
                <span className="font-medium">{noPrice.length} counted {noPrice.length === 1 ? "line has" : "lines have"} no cost price</span>, so {noPrice.length === 1 ? "it's" : "they're"} £0 in this total: {noPrice.slice(0, 3).map(l => l.prod.name).join(", ")}{noPrice.length > 3 ? ` and ${noPrice.length - 3} more` : ""}. The counts are kept. Add prices in the Library (Cost prices) and the value comes right.
              </div>
            ) : null;
          })()}
          {summaryGroups.map(group => (
            <React.Fragment key={group.key}>
            <div className="flex items-baseline justify-between pt-2" data-testid={`summary-group-${group.key}`}>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{group.label} · {group.lines.length}</h2>
              <span className="text-sm font-bold text-primary font-mono tabular-nums">{formatGBP(group.total)}</span>
            </div>
          {group.lines.map(line => (
            <Card key={line.prod.id}
              className={isViewingClosed ? "" : "cursor-pointer hover:border-primary/50"}
              onClick={isViewingClosed ? undefined : () => { setActiveProductId(line.prod.id); setCountingView("detail"); setStep("counting"); }}
              data-testid={`summary-line-${line.prod.id}`}>
              <CardContent className="p-3 flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{line.prod.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {summaryQuantityLabel(line)}
                    {line.gp != null && ` · GP ${line.gp.toFixed(0)}%`}
                    {!line.prod.cost_price && <span className="text-[#E0A343]"> · no price</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-primary font-mono tabular-nums">{formatGBP(line.val)}</div>
                  {!isViewingClosed && <div className="text-[11px] text-muted-foreground">tap to fix</div>}
                </div>
              </CardContent>
            </Card>
          ))}
            </React.Fragment>
          ))}
          {summaryLines.length === 0 && (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No products counted yet</CardContent></Card>
          )}
          {(() => {
            const sheet = buildDraughtSheet(summaryLines.map(l => ({ prod: l.prod as any, entries: (entriesByProduct.get(l.prod.id) ?? []) as any })));
            if (sheet.length === 0) return null;
            const spotNames = [...new Set(sheet.flatMap(r => r.spots.map(sp => sp.name)))];
            const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            const download = () => {
              const csv = draughtSheetCsv(sheet, venue?.name ?? "StockTap", date);
              const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              const a = document.createElement("a");
              a.href = url; a.download = `${(venue?.name ?? "stocktap").replace(/[^a-z0-9]+/gi, "-")}-draught-sheet-${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
            };
            return (
              <section className="rounded-xl border border-border bg-card p-3 space-y-2" data-testid="draught-sheet">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold">Draught sheet</h2>
                    <p className="text-xs text-muted-foreground">Whole = gallons, Part = pints, as a Venners sheet sets it out.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={download} data-testid="button-download-draught-sheet">Download CSV</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="text-left py-1.5 pr-2 font-semibold">Product</th>
                        <th className="text-right py-1.5 px-1 font-semibold">Whole</th>
                        <th className="text-right py-1.5 pl-1 font-semibold">Part</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.map(r => (
                        <tr key={r.name} className="border-t border-border align-top" data-testid={`sheet-row-${r.name}`}>
                          <td className="py-1.5 pr-2">
                            <div className="font-medium">{r.name}</div>
                            {spotNames.length > 1 && <div className="text-xs text-muted-foreground">{r.spots.map(sp => `${sp.name} ${sp.whole} gal ${sp.part} pt`).join(" · ")}</div>}
                          </td>
                          <td className="text-right py-1.5 px-1 font-bold">{r.whole}</td>
                          <td className="text-right py-1.5 pl-1 font-bold">{r.part}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}
        </div>
        <div className="p-4 border-t border-border bg-card">
          {isViewingClosed ? (
            <div className="space-y-2">
            <Link href="/reports" className="flex items-center justify-center w-full h-12 rounded-md bg-primary text-primary-foreground font-semibold" data-testid="link-see-what-moved">See what moved in Reports</Link>
            <Button size="lg" variant="outline" className="w-full h-14 font-bold" onClick={() => { setStep("list"); setActiveStocktakeId(null); setLegacyReadings([]); setSelectedProductIds([]); }} data-testid="button-done-viewing">
              Done
            </Button>
            </div>
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

/** "In progress · 3 of 9 counted" on an open count in the list. */
function OpenCountProgress({ stocktake, totalProducts }: { stocktake: { id: string; product_ids?: string[] | null }; totalProducts: number }) {
  const { data: entries = [] } = useLineEntries(stocktake.id);
  const total = stocktake.product_ids?.length ?? totalProducts;
  const done = new Set(entries.map(e => e.product_id)).size;
  return (
    <div className="text-xs font-semibold text-[#E0A343]" data-testid={`text-open-progress-${stocktake.id}`}>
      In progress · {done} of {total} counted
    </div>
  );
}
