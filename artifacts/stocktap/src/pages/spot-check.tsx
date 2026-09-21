import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProducts,
  useAddReading,
  useLastReading,
  useRecentSpotReadings,
  useTillEntries,
  addTillEntry,
  useActiveOfferForProduct,
  useCountLocations,
  useOpenSpotCheckSession,
  createSpotCheckSession,
  closeSpotCheckSession,
  useSpotCheckLineEntries,
  addLineEntry,
  deleteLineEntry,
  retryLineEntryUpload,
  updateReading,
} from "@/hooks/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberPad } from "@/components/NumberPad";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calcMlRemaining,
  calcMlRemainingFromWeights,
  calcTenths,
  calcMeasuresLeft,
  calcSoldSinceLast,
  calcVariance,
  resolveMeasureMl,
  formatGBP,
  CATEGORY_LABELS,
  draughtCapacityMl,
  ML_PER_PINT,
} from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, AlertCircle, TrendingDown, Tag, Clock, MapPin,
  ChevronDown, ChevronUp, Minus, Plus, Trash2, RefreshCw, PlayCircle, CheckCircle2,
} from "lucide-react";
import type { Database } from "@/lib/database.types";
import { db } from "@/lib/db";
import type { LocalReading, LocalLineEntry } from "@/lib/db";

type Step = "pick" | "weigh" | "results" | "retro";
type Product = Database["public"]["Tables"]["products"]["Row"] & { locations?: { name: string } | null };

interface LocationBreakdownRow {
  locationName: string;
  fullContainers: number;
  ml: number;
}

interface SpotResult {
  product: Product;
  mlRemaining: number;
  weightG: number;
  measuresSold: number;
  soldByWeight: number;
  variance: number;
  valueVariance: number;
  measuresRemaining: number | null;
  usedOfferPrice: number | null;
  readingAt: string;
  /** Per-counting-location breakdown, empty for single-reading (legacy) checks. */
  breakdown: LocationBreakdownRow[];
  /** True when the user saved the count without till figures. */
  awaitingTill: boolean;
}

const LOSS_THRESHOLD_GBP = 10;

function formatReadingDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SpotCheck() {
  const { venue, user } = useAuth();
  const { data: products } = useProducts(venue?.id);
  const { data: countLocations } = useCountLocations(venue?.id);
  const addReading = useAddReading();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("pick");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchStr, setSearchStr] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [weightStr, setWeightStr] = useState("0");
  const [tenthsStr, setTenthsStr] = useState("0");
  const [fullCount, setFullCount] = useState(0);
  const [tillStr, setTillStr] = useState("0");
  const [tillInputMode, setTillInputMode] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [results, setResults] = useState<SpotResult[]>([]);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  // Multi-location count entry: parent session + line entries
  const { data: openSession } = useOpenSpotCheckSession(venue?.id);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionOpenedAt, setSessionOpenedAt] = useState<string | null>(null);
  const activeSessionId = sessionId ?? openSession?.id ?? null;
  const activeSessionOpenedAt = sessionOpenedAt ?? openSession?.opened_at ?? null;
  const { data: spotEntries, refetch: refetchSpotEntries } = useSpotCheckLineEntries(activeSessionId);

  // Clear "Not synced" badges the moment the sync queue lands an entry.
  useEffect(() => {
    if (!activeSessionId) return;
    const onSynced = () => { refetchSpotEntries(); };
    window.addEventListener("stocktap:line-entry-synced", onSynced);
    return () => window.removeEventListener("stocktap:line-entry-synced", onSynced);
  }, [activeSessionId, refetchSpotEntries]);

  // Which count_locations location the CURRENT entry is being counted at.
  // Defaults to the first active count location (spec condition 6).
  const [entryCountLocationId, setEntryCountLocationId] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // readings row already written per product this session (re-confirm = update, never append)
  const [readingIds, setReadingIds] = useState<Record<string, string>>({});

  // Retro till entry state
  const [retroReadingId, setRetroReadingId] = useState<string | null>(null);
  const [retroTillStr, setRetroTillStr] = useState("0");

  const { data: recentSpotReadings } = useRecentSpotReadings(venue?.id);
  const { data: tillEntries } = useTillEntries(venue?.id);

  // Venue members for staff tagging (online-only; fine if null when offline)
  const { data: members } = useQuery({
    queryKey: ["venue-members", venue?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_members")
        .select("*, profiles(full_name)")
        .eq("venue_id", venue!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!venue?.id,
    staleTime: 120_000,
  });

  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);

  // Default the entry location to the first active count location once loaded.
  useEffect(() => {
    if (entryCountLocationId === null && countLocations && countLocations.length > 0) {
      setEntryCountLocationId(countLocations[0].id);
    }
  }, [countLocations, entryCountLocationId]);

  const vendorOptions = useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    for (const p of products) {
      if (p.vendor && p.vendor.trim()) set.add(p.vendor.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const pickableProducts = useMemo(() => {
    if (!products) return [];
    let list = products;
    if (selectedCategory !== "all") list = list.filter(p => p.category === selectedCategory);
    if (selectedVendor !== "all") list = list.filter(p => p.vendor === selectedVendor);
    const q = searchStr.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedCategory, selectedVendor, searchStr]);

  const selectAllVisible = () =>
    setSelectedIds(ids => Array.from(new Set([...ids, ...pickableProducts.map(p => p.id)])));
  const clearSelection = () => setSelectedIds([]);

  const selectedProducts = useMemo(() => {
    if (!products) return [];
    return selectedIds
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean) as Product[];
  }, [selectedIds, products]);

  const currentProduct = selectedProducts[currentIndex];

  const countingMethod = currentProduct?.counting_method ?? null;
  const isKegWeight  = countingMethod === "keg_weight";
  const isDipstick   = countingMethod === "dipstick";
  const isTenthsPints = countingMethod === "tenths_pints";

  const hasKegCalibration  = isKegWeight  && !!currentProduct?.container_l;
  const hasDipCalibration  = isDipstick   && !!currentProduct?.dip_full_mm && !!currentProduct?.container_l;
  const hasBottleWeights   = !isKegWeight && !isDipstick &&
    currentProduct?.full_weight_g != null && currentProduct?.empty_weight_g != null;

  const hasCalibration = hasKegCalibration || hasDipCalibration || hasBottleWeights;
  const effectiveQuickMode = quickMode || (!isKegWeight && !isDipstick && !hasBottleWeights);

  const effectiveCapMl: number = (() => {
    if (isKegWeight || isDipstick || isTenthsPints) return draughtCapacityMl(currentProduct?.container_l);
    return currentProduct?.size_ml ?? 700;
  })();

  // Baseline is the last venue-wide reading for this product (count locations
  // are a within-count dimension, not a baseline filter).
  const { data: lastReading } = useLastReading(currentProduct?.id, venue?.id, null);

  const activeOffer = useActiveOfferForProduct(venue?.id, currentProduct?.id);

  // Part-measurement of the currently OPEN container (grams / tenths / keg / dip)
  const partMl = useMemo(() => {
    if (!currentProduct) return null;
    if (isKegWeight) {
      if (!currentProduct.container_l) return null;
      const pints = parseFloat(weightStr) || 0;
      return pints * ML_PER_PINT;
    }
    if (isDipstick) {
      if (!currentProduct.dip_full_mm || !currentProduct.container_l) return null;
      const dipMm = parseFloat(weightStr) || 0;
      const frac = Math.max(0, Math.min(1, dipMm / currentProduct.dip_full_mm));
      return frac * draughtCapacityMl(currentProduct.container_l);
    }
    if (effectiveQuickMode) {
      const t = parseFloat(tenthsStr) || 0;
      return (t / 10) * effectiveCapMl;
    }
    if (currentProduct.unit !== "weigh" || currentProduct.empty_weight_g == null) return null;
    const w = parseFloat(weightStr) || 0;
    const sizeMl = currentProduct.size_ml ?? 700;
    if (currentProduct.full_weight_g != null) {
      return calcMlRemainingFromWeights(w, currentProduct.empty_weight_g, currentProduct.full_weight_g, sizeMl);
    }
    return calcMlRemaining(w, currentProduct.empty_weight_g, currentProduct.density, sizeMl);
  }, [weightStr, tenthsStr, effectiveQuickMode, currentProduct, isKegWeight, isDipstick, effectiveCapMl]);

  // ml for the entry currently being composed = full containers + open-container part
  const entryMl = partMl !== null ? fullCount * effectiveCapMl + partMl : (fullCount > 0 ? fullCount * effectiveCapMl : null);

  // Saved entries for the current product in this session
  const productEntries = useMemo(() => {
    if (!currentProduct || !spotEntries) return [] as LocalLineEntry[];
    return spotEntries.filter(e => e.product_id === currentProduct.id);
  }, [spotEntries, currentProduct]);

  const savedTotalMl = productEntries.reduce((sum, e) => sum + e.ml_remaining, 0);

  // Total used for variance: summed line entries if any, otherwise the live single reading.
  const totalMl = productEntries.length > 0 ? savedTotalMl : entryMl;

  const tenths =
    partMl !== null && effectiveCapMl > 0
      ? calcTenths(partMl, effectiveCapMl)
      : null;

  const measureMl = resolveMeasureMl(currentProduct?.measure_ml, venue?.measure_ml);

  const measuresRemaining = totalMl !== null ? calcMeasuresLeft(totalMl, measureMl) : null;

  const soldByWeight = useMemo(() => {
    if (totalMl === null || !lastReading) return null;
    return calcSoldSinceLast(lastReading.ml_remaining, totalMl, measureMl);
  }, [totalMl, lastReading, measureMl]);

  const effectivePourPrice = activeOffer?.offer_price ?? currentProduct?.pour_price ?? null;

  const tillMeasures = parseFloat(tillStr) || 0;

  // variance = soldByWeight - tillMeasuresSold. Positive = shrinkage (red).
  const variance = soldByWeight !== null ? calcVariance(soldByWeight, tillMeasures) : null;
  const valueVariance =
    variance !== null && effectivePourPrice
      ? variance * effectivePourPrice
      : null;

  const entryLocationName = (id: string | null) =>
    id ? (countLocations?.find(l => l.id === id)?.name ?? "Unknown") : "General";

  const entryMethod = (): LocalLineEntry["method"] =>
    isKegWeight ? "keg_weight" : isDipstick ? "dipstick" : effectiveQuickMode ? "count" : "weigh";

  const ensureSession = async (): Promise<string> => {
    if (activeSessionId) {
      if (!sessionId) setSessionId(activeSessionId);
      if (!sessionOpenedAt && openSession) setSessionOpenedAt(openSession.opened_at);
      return activeSessionId;
    }
    const session = await createSpotCheckSession(venue!.id, user!.id);
    setSessionId(session.id);
    setSessionOpenedAt(session.opened_at);
    queryClient.invalidateQueries({ queryKey: ["open-spot-check", venue?.id] });
    return session.id;
  };

  // Save the composed entry for the chosen counting location.
  // Replaces any existing entry for the same product + location (recalculate, never duplicate).
  const saveLocationEntry = async () => {
    if (!currentProduct || !venue || !user || entryMl === null) return;
    const sid = await ensureSession();
    const locId = entryCountLocationId;
    // Editing the same product × location REUSES the entry id, so the remote
    // id-keyed upsert updates in place (no delete/insert race, no unique-index conflict).
    const existing = productEntries.find(e => (e.count_location_id ?? null) === locId);

    const now = new Date().toISOString();
    const partValue = effectiveQuickMode
      ? (parseFloat(tenthsStr) || null)
      : (parseFloat(weightStr) || null);
    await addLineEntry({
      id: existing?.id ?? crypto.randomUUID(),
      venue_id: venue.id,
      stocktake_id: null,
      spot_check_id: sid,
      product_id: currentProduct.id,
      count_location_id: locId,
      count_location_name: entryLocationName(locId),
      method: entryMethod(),
      full_containers: fullCount,
      part_value: partValue,
      ml_remaining: Math.max(0, entryMl),
      sync_status: "pending",
      entered_at: now,
      user_id: user.id,
      created_at: now,
      updated_at: now,
    });
    queryClient.invalidateQueries({ queryKey: ["spot-check-line-entries", sid] });
    await refetchSpotEntries();
    setFullCount(0);
    setWeightStr("0");
    setTenthsStr("0");
    // Move the picker on to the next un-counted location for convenience
    const remaining = (countLocations ?? []).filter(
      l => l.id !== locId && !productEntries.some(e => e.count_location_id === l.id),
    );
    if (remaining.length > 0) setEntryCountLocationId(remaining[0].id);
  };

  const removeEntry = async (id: string) => {
    await deleteLineEntry(id);
    if (activeSessionId) queryClient.invalidateQueries({ queryKey: ["spot-check-line-entries", activeSessionId] });
    await refetchSpotEntries();
  };

  const retryEntry = async (id: string) => {
    const ok = await retryLineEntryUpload(id);
    toast(ok
      ? { title: "Entry synced" }
      : { title: "Still can't sync", description: "Check your connection — the entry is saved on this device.", variant: "destructive" });
    await refetchSpotEntries();
  };

  const resetEntryInputs = () => {
    setWeightStr("0");
    setTenthsStr("0");
    setFullCount(0);
    setTillStr("0");
    setTillInputMode(false);
    setEntryCountLocationId(countLocations?.[0]?.id ?? null);
  };

  const advanceOrFinish = async (newResults: SpotResult[]) => {
    if (currentIndex + 1 >= selectedProducts.length) {
      if (activeSessionId) {
        await closeSpotCheckSession(activeSessionId);
        queryClient.invalidateQueries({ queryKey: ["open-spot-check", venue?.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["latest-readings", venue?.id] });
      queryClient.invalidateQueries({ queryKey: ["recent-spot-readings", venue?.id] });
      setStep("results");
    } else {
      setCurrentIndex((i) => i + 1);
      resetEntryInputs();
    }
  };

  /** Persist ONE aggregate readings row for the current product.
   *  Re-confirming updates the existing row (never appends a second one). */
  const persistAggregateReading = async (now: string): Promise<LocalReading | null> => {
    if (!currentProduct || totalMl === null || !user || !venue) return null;

    const hasEntries = productEntries.length > 0;
    const method = hasEntries ? productEntries[0].method : entryMethod();
    const fullSum = hasEntries
      ? productEntries.reduce((s, e) => s + (e.full_containers ?? 0), 0)
      : fullCount;
    const partSum = hasEntries
      ? productEntries.reduce((s, e) => s + (e.part_value ?? 0), 0)
      : (effectiveQuickMode ? parseFloat(tenthsStr) || 0 : parseFloat(weightStr) || 0);

    const base = {
      location_id: currentProduct.location_id ?? null,
      method,
      weight_g: !hasEntries && method === "weigh" ? (parseFloat(weightStr) || 0) : null,
      ml_remaining: Math.max(0, totalMl),
      full_containers: fullSum > 0 || hasEntries ? fullSum : null,
      part_value: partSum || null,
      reading_at: now,
      is_line_check: effectiveQuickMode && !isKegWeight && !isDipstick && !hasEntries,
    };

    // Find the readings row already written for this product in this session —
    // from local state, or (after a reload/resume) from Dexie by session window.
    let existingId: string | null = readingIds[currentProduct.id] ?? null;
    if (!existingId && activeSessionOpenedAt) {
      const candidates = await db.readings
        .where("[venue_id+product_id]")
        .equals([venue.id, currentProduct.id])
        .toArray();
      const inSession = candidates
        .filter(r => !r.stocktake_id && r.reading_at >= activeSessionOpenedAt)
        .sort((a, b) => b.reading_at.localeCompare(a.reading_at));
      existingId = inSession[0]?.id ?? null;
    }

    if (existingId) {
      try {
        await updateReading(existingId, base);
        setReadingIds(prev => ({ ...prev, [currentProduct.id]: existingId! }));
        return (await db.readings.get(existingId)) ?? null;
      } catch {
        return null;
      }
    }

    try {
      const saved = await addReading.mutateAsync({
        venue_id: venue.id,
        product_id: currentProduct.id,
        user_id: user.id,
        staff_on: selectedStaff.length > 0 ? selectedStaff : null,
        ...base,
      });
      setReadingIds(prev => ({ ...prev, [currentProduct.id]: saved.id }));
      return saved;
    } catch {
      return null;
    }
  };

  const buildResult = (tm: number, now: string): SpotResult | null => {
    if (!currentProduct || totalMl === null) return null;
    const sw = soldByWeight ?? 0;
    const v = calcVariance(sw, tm);
    const vv = effectivePourPrice ? v * effectivePourPrice : 0;
    return {
      product: currentProduct,
      mlRemaining: totalMl,
      weightG: effectiveQuickMode ? 0 : (parseFloat(weightStr) || 0),
      measuresSold: tm,
      soldByWeight: sw,
      variance: tm > 0 ? v : 0,
      valueVariance: tm > 0 ? vv : 0,
      measuresRemaining,
      usedOfferPrice: tm > 0 && activeOffer ? activeOffer.offer_price : null,
      readingAt: now,
      breakdown: productEntries.map(e => ({
        locationName: e.count_location_name ?? entryLocationName(e.count_location_id),
        fullContainers: e.full_containers ?? 0,
        ml: e.ml_remaining,
      })),
      awaitingTill: tm <= 0,
    };
  };

  const upsertResult = (result: SpotResult): SpotResult[] => {
    const others = results.filter(r => r.product.id !== result.product.id);
    const newResults = [...others, result];
    setResults(newResults);
    return newResults;
  };

  // Save count + till (till may be 0 = awaiting till data).
  const handleWeighConfirm = async () => {
    if (!currentProduct || totalMl === null || !user || !venue) return;
    const now = new Date().toISOString();
    const tm = tillMeasures;
    const result = buildResult(tm, now);
    if (!result) return;
    const newResults = upsertResult(result);

    if (result.valueVariance > LOSS_THRESHOLD_GBP) {
      toast({
        title: "Loss alert",
        description: `${currentProduct.name}: ${formatGBP(result.valueVariance)} unaccounted for`,
        variant: "destructive",
      });
    }

    await persistAggregateReading(now);

    if (tm > 0 && lastReading) {
      await addTillEntry({
        venue_id: venue.id,
        product_id: currentProduct.id,
        measures_sold: tm,
        period_start: lastReading.reading_at,
        period_end: now,
      });
      queryClient.invalidateQueries({ queryKey: ["till-entries", venue?.id] });
    }

    await advanceOrFinish(newResults);
  };

  // Save count only — skip till entry for now ("Awaiting till data").
  const handleSaveWeightOnly = async () => {
    if (!currentProduct || totalMl === null || !user || !venue) return;
    const now = new Date().toISOString();
    const result = buildResult(0, now);
    if (!result) return;
    const newResults = upsertResult(result);
    await persistAggregateReading(now);
    await advanceOrFinish(newResults);
  };

  const toggleProduct = (id: string) => {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
    );
  };

  // Resume an in-progress spot check: pre-select the products that already have entries.
  const resumableProductIds = useMemo(() => {
    if (!openSession || !spotEntries) return [] as string[];
    return Array.from(new Set(spotEntries.map(e => e.product_id)));
  }, [openSession, spotEntries]);

  const resumeSession = () => {
    if (!openSession) return;
    setSessionId(openSession.id);
    setSessionOpenedAt(openSession.opened_at);
    setSelectedIds(resumableProductIds);
    setCurrentIndex(0);
    setResults([]);
    resetEntryInputs();
    setStep("weigh");
  };

  // Retro: recent spot readings without a till entry attached.
  const retroCandidates = useMemo(() => {
    if (!recentSpotReadings || !products) return [];
    const tillPeriodEnds = new Set((tillEntries ?? []).map(te => te.period_end));
    return recentSpotReadings
      .filter(r => !tillPeriodEnds.has(r.reading_at))
      .map(r => {
        const product = products.find(p => p.id === r.product_id);
        return product ? { reading: r, product } : null;
      })
      .filter(Boolean) as { reading: LocalReading; product: Product }[];
  }, [recentSpotReadings, tillEntries, products]);

  const selectedRetroItem = retroCandidates.find(c => c.reading.id === retroReadingId) ?? null;

  const retroPreviousReading = useMemo(() => {
    if (!selectedRetroItem || !recentSpotReadings) return null;
    const productReadings = recentSpotReadings
      .filter(r => r.product_id === selectedRetroItem.reading.product_id
                && r.id !== selectedRetroItem.reading.id
                && r.reading_at < selectedRetroItem.reading.reading_at)
      .sort((a, b) => b.reading_at.localeCompare(a.reading_at));
    return productReadings[0] ?? null;
  }, [selectedRetroItem, recentSpotReadings]);

  // ──────────────────────────────────────────────────────────────────────
  // STEP: pick
  // ──────────────────────────────────────────────────────────────────────
  if (step === "pick") {
    const allVisibleSelected =
      pickableProducts.length > 0 &&
      pickableProducts.every(p => selectedIds.includes(p.id));
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10 space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">Spot Check</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select products to check against the till
            </p>
          </div>
          {openSession && resumableProductIds.length > 0 && (
            <button
              className="w-full flex items-center gap-2 p-3 rounded-xl border border-primary/40 bg-primary/5 text-left"
              onClick={resumeSession}
              data-testid="button-resume-spot-check"
            >
              <PlayCircle className="w-5 h-5 text-primary shrink-0" />
              <div>
                <div className="text-sm font-semibold text-primary">Resume spot check in progress</div>
                <div className="text-xs text-muted-foreground">
                  {resumableProductIds.length} product{resumableProductIds.length === 1 ? "" : "s"} with saved counts from {formatReadingDate(openSession.opened_at)}
                </div>
              </div>
            </button>
          )}
          <Input
            placeholder="Search products…"
            value={searchStr}
            onChange={e => setSearchStr(e.target.value)}
            data-testid="input-spotcheck-search"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedCategory === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
              onClick={() => setSelectedCategory("all")}
              data-testid="button-category-filter-all"
            >All categories</button>
            {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map(cat => (
              <button
                key={cat}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                onClick={() => setSelectedCategory(cat)}
                data-testid={`button-category-filter-${cat}`}
              >{CATEGORY_LABELS[cat]}</button>
            ))}
          </div>
          {vendorOptions.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedVendor === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                onClick={() => setSelectedVendor("all")}
                data-testid="button-vendor-filter-all"
              >All vendors</button>
              {vendorOptions.map(vendor => (
                <button
                  key={vendor}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${selectedVendor === vendor ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                  onClick={() => setSelectedVendor(vendor)}
                  data-testid={`button-vendor-filter-${vendor}`}
                >{vendor}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <button className="font-semibold text-primary" onClick={allVisibleSelected ? clearSelection : selectAllVisible} data-testid="button-select-all-shown">
              {allVisibleSelected ? "Clear all" : "Select all shown"}
            </button>
            <span className="text-muted-foreground">{selectedIds.length} selected</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 pb-24 space-y-2">
          {pickableProducts.length === 0 ? (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">No products match</CardContent></Card>
          ) : pickableProducts.map((p) => (
            <button
              key={p.id}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                selectedIds.includes(p.id)
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              }`}
              onClick={() => toggleProduct(p.id)}
              data-testid={`button-select-product-${p.id}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.category ? (CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category) : "—"}{p.size_ml ? ` · ${p.size_ml}ml` : ""}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 ${
                    selectedIds.includes(p.id)
                      ? "bg-primary border-primary"
                      : "border-muted-foreground"
                  }`}
                />
              </div>
            </button>
          ))}

          {members && members.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                Shifts to Review (optional)
              </div>
              {members.map((m: any) => (
                <button
                  key={m.user_id}
                  className={`w-full text-left px-4 py-3 rounded-xl border mb-2 transition-colors ${
                    selectedStaff.includes(m.user_id)
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  onClick={() =>
                    setSelectedStaff((ss) =>
                      ss.includes(m.user_id)
                        ? ss.filter((id) => id !== m.user_id)
                        : [...ss, m.user_id]
                    )
                  }
                >
                  <span className="font-medium text-sm">
                    {m.profiles?.full_name ?? m.user_id.slice(0, 8)}
                  </span>
                  <Badge variant="secondary" className="ml-2 text-xs capitalize">
                    {m.role}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-card space-y-2">
          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold"
            disabled={selectedIds.length === 0}
            onClick={() => {
              setCurrentIndex(0);
              setResults([]);
              setReadingIds({});
              resetEntryInputs();
              setStep("weigh");
            }}
            data-testid="button-start-spot-check"
          >
            Start Check ({selectedIds.length} selected)
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground mt-1"
            onClick={() => setQuickMode((q) => !q)}
            data-testid="button-toggle-quick-mode"
          >
            {quickMode ? "Quick line-check mode: ON — tap to switch to full weigh" : "Switch to Quick line-check mode (fast tenths entry)"}
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // STEP: weigh — multi-location count entry
  // ──────────────────────────────────────────────────────────────────────
  if (step === "weigh" && currentProduct) {
    const currentLocName = entryLocationName(entryCountLocationId);
    const containerNoun = isKegWeight || isDipstick || isTenthsPints ? "kegs" : "bottles";
    const hasSavedEntries = productEntries.length > 0;
    const pendingEntries = productEntries.filter(e => e.sync_status === "pending");

    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep("pick")}>
              <ArrowLeft />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                {currentIndex + 1} of {selectedProducts.length}
              </div>
              <div className="font-bold text-primary truncate">{currentProduct.name}</div>
            </div>
            {hasSavedEntries && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1 text-[#3FAE74]" />
                {productEntries.length} location{productEntries.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>

          {/* Counting-location picker (count_locations, defaults to the first) */}
          <div className="mt-2">
            {!showLocationPicker ? (
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowLocationPicker(true)}
                data-testid="button-show-location-picker"
              >
                <MapPin className="w-3 h-3" />
                Counting at: <span className="font-semibold text-foreground">{currentLocName}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(countLocations ?? []).map(loc => (
                  <button
                    key={loc.id}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${entryCountLocationId === loc.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                    onClick={() => { setEntryCountLocationId(loc.id); setShowLocationPicker(false); }}
                    data-testid={`button-count-location-${loc.id}`}
                  >{loc.name}</button>
                ))}
                {(!countLocations || countLocations.length === 0) && (
                  <button
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${entryCountLocationId === null ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                    onClick={() => { setEntryCountLocationId(null); setShowLocationPicker(false); }}
                  >General</button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-4 overflow-auto">
          {!tillInputMode ? (
            <>
              {(effectiveQuickMode || isKegWeight || isDipstick) && (
                <div className="text-xs font-semibold text-primary uppercase tracking-wide -mb-2">
                  {isKegWeight ? "Keg weight entry" : isDipstick ? "Dipstick entry" : hasCalibration ? "Quick line-check" : "No weight set up yet — tenths entry"}
                </div>
              )}

              {/* Full containers stepper — alongside the part measurement */}
              <div className="flex items-center justify-between bg-card border border-border rounded-xl p-3">
                <div>
                  <div className="text-sm font-semibold">Full {containerNoun}</div>
                  <div className="text-xs text-muted-foreground">Unopened, at {currentLocName}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline" size="icon" className="h-10 w-10"
                    onClick={() => setFullCount(c => Math.max(0, c - 1))}
                    disabled={fullCount <= 0}
                    data-testid="button-full-minus"
                  ><Minus className="w-4 h-4" /></Button>
                  <span className="text-2xl font-bold w-8 text-center" data-testid="text-full-count">{fullCount}</span>
                  <Button
                    variant="outline" size="icon" className="h-10 w-10"
                    onClick={() => setFullCount(c => c + 1)}
                    data-testid="button-full-plus"
                  ><Plus className="w-4 h-4" /></Button>
                </div>
              </div>

              <NumberPad
                value={isKegWeight || isDipstick ? weightStr : effectiveQuickMode ? tenthsStr : weightStr}
                onChange={isKegWeight || isDipstick ? setWeightStr : effectiveQuickMode ? setTenthsStr : setWeightStr}
                label={isKegWeight ? "Pints remaining (open keg)" : isDipstick ? "Dip reading (mm)" : effectiveQuickMode ? "Open bottle: tenths remaining (0-10)" : "Open bottle weight (grams)"}
                allowDecimal
              />

              {entryMl !== null && (
                <div className="bg-accent rounded-xl p-4 text-center space-y-1">
                  <div className="text-lg font-bold text-primary">
                    This entry: {fullCount > 0 ? `${fullCount} full + ` : ""}{Math.round(partMl ?? 0)}ml open = {Math.round(entryMl)}ml
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {effectiveQuickMode ? "Rough estimate — not exact · " : ""}
                    {tenths !== null ? `open ${containerNoun.slice(0, -1)}: ${tenths.toFixed(1)} tenths · ` : ""}
                    at {currentLocName}
                  </div>
                  {activeOffer && (
                    <Badge className="bg-[#E0A343] text-black font-semibold mt-1" data-testid="badge-active-offer">
                      <Tag className="w-3 h-3 mr-1" /> Offer active: {formatGBP(activeOffer.offer_price)}/measure
                    </Badge>
                  )}
                </div>
              )}

              <Button
                variant="secondary"
                className="h-12 font-semibold"
                onClick={saveLocationEntry}
                disabled={entryMl === null}
                data-testid="button-save-location-entry"
              >
                {productEntries.some(e => (e.count_location_id ?? null) === entryCountLocationId)
                  ? `Update ${currentLocName} entry`
                  : `Save ${currentLocName} entry`}
              </Button>

              {/* Saved per-location entries + running total */}
              {hasSavedEntries && (
                <div className="space-y-2">
                  {productEntries.map(e => (
                    <div key={e.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-3 py-2" data-testid={`row-entry-${e.id}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{e.count_location_name ?? entryLocationName(e.count_location_id)}</div>
                        <div className="text-xs text-muted-foreground">
                          {(e.full_containers ?? 0) > 0 ? `${e.full_containers} full · ` : ""}{Math.round(e.ml_remaining)}ml
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {e.sync_status === "pending" && (
                          <button
                            className="flex items-center gap-1 text-[10px] font-semibold text-[#E0A343] border border-[#E0A343]/40 rounded-full px-2 py-0.5"
                            onClick={() => retryEntry(e.id)}
                            data-testid={`button-retry-entry-${e.id}`}
                          >
                            <RefreshCw className="w-3 h-3" /> Not synced — retry
                          </button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => removeEntry(e.id)} data-testid={`button-delete-entry-${e.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="bg-muted rounded-xl p-3 text-center space-y-0.5">
                    <div className="text-sm text-muted-foreground">Running total ({productEntries.length} location{productEntries.length === 1 ? "" : "s"})</div>
                    <div className="text-2xl font-bold text-primary" data-testid="text-running-total">{Math.round(savedTotalMl)}ml</div>
                    <div className="text-sm text-muted-foreground">
                      {calcMeasuresLeft(savedTotalMl, measureMl)} measures remaining
                      {currentProduct.cost_price != null && effectiveCapMl > 0 && (
                        <> · {formatGBP((savedTotalMl / effectiveCapMl) * currentProduct.cost_price)}</>
                      )}
                    </div>
                    {lastReading && soldByWeight !== null && (
                      <div className="text-sm text-muted-foreground">
                        Sold since last check: ~{soldByWeight.toFixed(1)} measures
                      </div>
                    )}
                    {!lastReading && (
                      <div className="text-xs text-[#E0A343]">
                        No previous reading — count recorded, variance available next check.
                      </div>
                    )}
                  </div>
                  {pendingEntries.length > 0 && (
                    <div className="text-xs text-[#E0A343] text-center">
                      {pendingEntries.length} entr{pendingEntries.length === 1 ? "y" : "ies"} saved on this device, not yet synced.
                    </div>
                  )}
                </div>
              )}

              <Button
                size="lg"
                className="h-14 text-lg font-bold"
                onClick={() => setTillInputMode(true)}
                disabled={totalMl === null}
                data-testid="button-enter-till"
              >
                Enter Till Measures
              </Button>

              <Button
                variant="outline"
                className="h-12"
                onClick={handleSaveWeightOnly}
                disabled={totalMl === null || addReading.isPending}
                data-testid="button-save-weight-only"
              >
                Save count, log till later
              </Button>
            </>
          ) : (
            <>
              <div className="bg-muted rounded-xl p-3 text-center space-y-1">
                <div className="text-sm text-muted-foreground">
                  {hasSavedEntries ? `Total across ${productEntries.length} location${productEntries.length === 1 ? "" : "s"}` : "Count reading"}
                </div>
                <div className="text-2xl font-bold">
                  {Math.round(totalMl ?? 0)}ml
                </div>
                <div className="text-sm text-muted-foreground">
                  {measuresRemaining} measures remaining
                  {currentProduct.cost_price != null && effectiveCapMl > 0 && (
                    <> · {formatGBP(((totalMl ?? 0) / effectiveCapMl) * currentProduct.cost_price)}</>
                  )}
                </div>
                {hasSavedEntries && (
                  <div className="text-xs text-muted-foreground">
                    {productEntries.map(e => `${e.count_location_name ?? entryLocationName(e.count_location_id)}: ${Math.round(e.ml_remaining)}ml`).join(" · ")}
                  </div>
                )}
                {lastReading && soldByWeight !== null && (
                  <div className="text-sm text-muted-foreground">
                    Sold since last check: ~{soldByWeight.toFixed(1)} measures
                  </div>
                )}
                {activeOffer && (
                  <Badge className="bg-[#E0A343] text-black font-semibold" data-testid="badge-active-offer-till">
                    <Tag className="w-3 h-3 mr-1" /> Offer price applied: {formatGBP(activeOffer.offer_price)}/measure
                  </Badge>
                )}
              </div>

              <NumberPad
                value={tillStr}
                onChange={setTillStr}
                label="Till measures sold"
                allowDecimal
              />

              {soldByWeight !== null && variance !== null && (
                <VarianceDisplay
                  variance={variance}
                  valueVariance={valueVariance}
                  soldByWeight={soldByWeight}
                  tillMeasures={tillMeasures}
                />
              )}

              <Button
                size="lg"
                className="h-16 text-xl font-bold"
                onClick={handleWeighConfirm}
                disabled={addReading.isPending}
                data-testid="button-confirm-spot-check"
              >
                {addReading.isPending
                  ? "Saving..."
                  : currentIndex + 1 < selectedProducts.length
                  ? "Save & Next"
                  : "Save & Finish"}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // STEP: results
  // ──────────────────────────────────────────────────────────────────────
  if (step === "results") {
    const withTill = results.filter(r => !r.awaitingTill);
    const awaiting = results.filter(r => r.awaitingTill);
    const totalVarianceGBP = withTill.reduce((sum, r) => sum + r.valueVariance, 0);
    const allAwaiting = withTill.length === 0;

    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
          <h1 className="text-2xl font-bold text-primary">Spot Check Results</h1>
        </div>
        <div className="flex-1 overflow-auto p-4 pb-24 space-y-3">
          {/* Total variance — neutral grey when awaiting till data, never a green £0.00 */}
          {allAwaiting ? (
            <Card className="border-2 border-border bg-muted/50" data-testid="card-awaiting-till">
              <CardContent className="p-4 text-center">
                <div className="text-sm font-medium text-muted-foreground">Total Variance</div>
                <div className="text-3xl font-bold text-muted-foreground flex items-center justify-center gap-2">
                  <Clock className="w-6 h-6" /> Awaiting till data
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Counts saved — log till figures to see the variance
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card
              className={`border-2 ${
                totalVarianceGBP > LOSS_THRESHOLD_GBP
                  ? "border-[#E5544B]/40 bg-[#E5544B]/10"
                  : totalVarianceGBP < -LOSS_THRESHOLD_GBP
                  ? "border-[#E0A343]/40 bg-[#E0A343]/10"
                  : "border-[#3FAE74]/40 bg-[#3FAE74]/10"
              }`}
            >
              <CardContent className="p-4 text-center">
                <div className="text-sm font-medium text-muted-foreground">Total Variance</div>
                <div
                  className={`text-4xl font-bold ${
                    totalVarianceGBP > LOSS_THRESHOLD_GBP
                      ? "text-[#E5544B]"
                      : totalVarianceGBP < -LOSS_THRESHOLD_GBP
                      ? "text-[#E0A343]"
                      : "text-[#3FAE74]"
                  }`}
                >
                  {totalVarianceGBP > 0 ? "+" : ""}{formatGBP(totalVarianceGBP)}
                </div>
                {totalVarianceGBP > LOSS_THRESHOLD_GBP && (
                  <div className="text-xs text-[#E5544B] mt-1">Money missing — investigate</div>
                )}
                {totalVarianceGBP < -LOSS_THRESHOLD_GBP && (
                  <div className="text-xs text-[#E0A343] mt-1">More rung than poured — check the till or measure size</div>
                )}
                {awaiting.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {awaiting.length} product{awaiting.length === 1 ? "" : "s"} awaiting till data — not included
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {results.map((r, i) => {
            const isExpanded = expandedResult === i;
            return (
              <Card key={i} className={!r.awaitingTill && r.valueVariance > LOSS_THRESHOLD_GBP ? "border-[#E5544B]/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-1.5">
                        {r.product.name}
                        {r.usedOfferPrice != null && (
                          <Badge className="bg-[#E0A343] text-black text-[10px] font-semibold" data-testid={`badge-offer-result-${i}`}>
                            <Tag className="w-3 h-3 mr-1" /> Offer price
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {Math.round(r.mlRemaining)}ml remaining
                        {r.measuresRemaining != null && ` · ${r.measuresRemaining} measures remaining`}
                      </div>
                      {!r.awaitingTill ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          By weight: {r.soldByWeight.toFixed(1)} · Till: {r.measuresSold.toFixed(1)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1" data-testid={`text-awaiting-till-${i}`}>
                          <Clock className="w-3 h-3" /> Awaiting till data — log it below
                        </div>
                      )}
                      {r.breakdown.length > 0 && (
                        <button
                          className="flex items-center gap-1 text-xs font-semibold text-primary mt-1.5"
                          onClick={() => setExpandedResult(isExpanded ? null : i)}
                          data-testid={`button-toggle-breakdown-${i}`}
                        >
                          <MapPin className="w-3 h-3" />
                          {r.breakdown.length} location{r.breakdown.length === 1 ? "" : "s"}
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                    {!r.awaitingTill ? (
                      <ResultVarianceBadge variance={r.variance} valueVariance={r.valueVariance} />
                    ) : (
                      <Badge variant="secondary" className="shrink-0 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" /> Awaiting till
                      </Badge>
                    )}
                  </div>
                  {isExpanded && r.breakdown.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border space-y-1" data-testid={`breakdown-${i}`}>
                      {r.breakdown.map((b, j) => (
                        <div key={j} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{b.locationName}</span>
                          <span className="font-medium">
                            {b.fullContainers > 0 ? `${b.fullContainers} full · ` : ""}{Math.round(b.ml)}ml
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {retroCandidates.length > 0 && (
            <div className="pt-2">
              <button
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                onClick={() => { setRetroReadingId(null); setRetroTillStr("0"); setStep("retro"); }}
                data-testid="button-log-till-later"
              >
                <Clock className="w-4 h-4" />
                Log till figures for a past reading ({retroCandidates.length} without till data)
              </button>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-card">
          <Button
            variant="outline"
            className="w-full h-12"
            onClick={() => {
              setStep("pick");
              setSelectedIds([]);
              setResults([]);
              setReadingIds({});
              setSessionId(null);
            }}
          >
            Start New Spot Check
          </Button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // STEP: retro — log till figures against a past reading
  // ──────────────────────────────────────────────────────────────────────
  if (step === "retro") {
    const handleRetroSave = async () => {
      if (!selectedRetroItem || !venue) return;
      const tm = parseFloat(retroTillStr) || 0;
      if (tm <= 0) return;
      const periodStart = retroPreviousReading?.reading_at ?? selectedRetroItem.reading.reading_at;
      await addTillEntry({
        venue_id: venue.id,
        product_id: selectedRetroItem.reading.product_id,
        measures_sold: tm,
        period_start: periodStart,
        period_end: selectedRetroItem.reading.reading_at,
      });
      queryClient.invalidateQueries({ queryKey: ["till-entries", venue?.id] });
      toast({ title: "Till figures saved", description: `${selectedRetroItem.product.name} — ${tm.toFixed(1)} measures logged` });
      setRetroReadingId(null);
      setRetroTillStr("0");
      setStep("results");
    };

    const retroMeasureMl = resolveMeasureMl(selectedRetroItem?.product?.measure_ml, venue?.measure_ml);
    const retroSoldByWeight = selectedRetroItem && retroPreviousReading
      ? calcSoldSinceLast(retroPreviousReading.ml_remaining, selectedRetroItem.reading.ml_remaining, retroMeasureMl)
      : null;
    const retroTm = parseFloat(retroTillStr) || 0;
    const retroVariance = retroSoldByWeight !== null ? calcVariance(retroSoldByWeight, retroTm) : null;
    const retroPourPrice = selectedRetroItem?.product?.pour_price ?? null;
    const retroValueVariance = retroVariance !== null && retroPourPrice ? retroVariance * retroPourPrice : null;

    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setStep("results")}>
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-primary">Log Till Figures</h1>
            <p className="text-xs text-muted-foreground">Attach till data to a past reading</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 pb-24 space-y-3">
          {!retroReadingId ? (
            <>
              <p className="text-sm text-muted-foreground">
                Select a reading to attach till figures to:
              </p>
              {retroCandidates.length === 0 ? (
                <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">All readings already have till figures</CardContent></Card>
              ) : retroCandidates.map(({ reading, product }) => (
                <button
                  key={reading.id}
                  className="w-full text-left p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 transition-colors"
                  onClick={() => { setRetroReadingId(reading.id); setRetroTillStr("0"); }}
                  data-testid={`button-retro-reading-${reading.id}`}
                >
                  <div className="font-semibold">{product.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatReadingDate(reading.reading_at)} · {Math.round(reading.ml_remaining)}ml remaining
                  </div>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="bg-muted rounded-xl p-4 space-y-1">
                <div className="font-semibold">{selectedRetroItem?.product.name}</div>
                <div className="text-sm text-muted-foreground">
                  Reading: {selectedRetroItem ? formatReadingDate(selectedRetroItem.reading.reading_at) : "—"}
                </div>
                {retroPreviousReading && (
                  <div className="text-sm text-muted-foreground">
                    Period covers: {formatReadingDate(retroPreviousReading.reading_at)} → {selectedRetroItem ? formatReadingDate(selectedRetroItem.reading.reading_at) : "—"}
                  </div>
                )}
                {retroSoldByWeight !== null && (
                  <div className="text-sm font-medium">
                    Sold by weight: {retroSoldByWeight.toFixed(1)} measures
                  </div>
                )}
                {!retroPreviousReading && (
                  <div className="text-xs text-[#E0A343]">
                    No previous reading found — period start will default to this reading's timestamp.
                  </div>
                )}
              </div>

              <NumberPad
                value={retroTillStr}
                onChange={setRetroTillStr}
                label="Till measures sold for this period"
                allowDecimal
              />

              {retroSoldByWeight !== null && retroVariance !== null && (
                <VarianceDisplay
                  variance={retroVariance}
                  valueVariance={retroValueVariance}
                  soldByWeight={retroSoldByWeight}
                  tillMeasures={retroTm}
                />
              )}

              <Button
                size="lg"
                className="h-14 text-lg font-bold w-full"
                onClick={handleRetroSave}
                disabled={retroTm <= 0}
                data-testid="button-save-retro-till"
              >
                Save Till Figures
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setRetroReadingId(null)}
              >
                Pick a different reading
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared variance display component — used in both live and retro flows.
// Positive variance = shrinkage = red. Negative = over-ring = amber.
// ──────────────────────────────────────────────────────────────────────────────
function VarianceDisplay({
  variance,
  valueVariance,
  soldByWeight,
  tillMeasures,
}: {
  variance: number;
  valueVariance: number | null;
  soldByWeight: number;
  tillMeasures: number;
}) {
  const isShrinkage = variance > 0;
  const isOverRing  = variance < 0;

  const bgClass = isShrinkage
    ? "bg-[#E5544B]/10 border border-[#E5544B]/30"
    : isOverRing
    ? "bg-[#E0A343]/10 border border-[#E0A343]/30"
    : "bg-[#3FAE74]/10 border border-[#3FAE74]/30";

  const textClass = isShrinkage
    ? "text-[#E5544B]"
    : isOverRing
    ? "text-[#E0A343]"
    : "text-[#3FAE74]";

  const label = isShrinkage
    ? `${variance.toFixed(1)} measures unaccounted for`
    : isOverRing
    ? `${Math.abs(variance).toFixed(1)} more measures rung than poured — check the till or measure size`
    : "Balanced";

  return (
    <div className={`rounded-xl p-4 text-center ${bgClass}`} data-testid="variance-display">
      <div className="flex items-center justify-center gap-2">
        {isShrinkage && <TrendingDown className="w-5 h-5 text-[#E5544B]" />}
        {isOverRing && <AlertCircle className="w-5 h-5 text-[#E0A343]" />}
        <span className={`text-lg font-bold ${textClass}`}>{label}</span>
      </div>
      {valueVariance !== null && (
        <div className={`text-2xl font-bold mt-1 ${textClass}`}>
          {valueVariance > 0
            ? `${formatGBP(valueVariance)} of sales missing`
            : valueVariance < 0
            ? `${formatGBP(Math.abs(valueVariance))} rung but not poured`
            : formatGBP(0)}
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-1">
        By weight: {soldByWeight.toFixed(1)} · Till: {tillMeasures.toFixed(1)}
      </div>
    </div>
  );
}

// Per-result badge on the results screen.
function ResultVarianceBadge({ variance, valueVariance }: { variance: number; valueVariance: number }) {
  const isShrinkage = variance > 0;
  const isOverRing  = variance < 0;

  const textClass = isShrinkage ? "text-[#E5544B]" : isOverRing ? "text-[#E0A343]" : "text-[#3FAE74]";

  return (
    <div className={`font-bold text-right ${textClass}`}>
      {valueVariance > 0 ? "+" : ""}{formatGBP(valueVariance)}
      {isShrinkage && <AlertCircle className="w-4 h-4 ml-1 inline-block" />}
      <div className="text-xs font-normal mt-0.5">
        {variance > 0 ? `+${variance.toFixed(1)}` : variance.toFixed(1)} measures
      </div>
    </div>
  );
}
