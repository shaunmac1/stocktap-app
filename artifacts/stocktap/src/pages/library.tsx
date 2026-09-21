import { isVolumeCountingMethod } from "@/lib/inventory-reporting";
import React, { useState, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useAddProduct, useLocations, useProductReadingsMap, useDeleteProduct } from "@/hooks/api";
import { calcCoverage } from "@/lib/coverage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { NumberPad } from "@/components/NumberPad";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  deriveEmptyWeight,
  checkCalibrationPlausibility,
  calcMlRemaining,
  calcTenths,
  calcMeasuresLeft,
  DEFAULT_DENSITIES,
  formatGBP,
  calcGpPercent,
  calcProductGpPercent,
  CATEGORY_METHODS,
  CATEGORY_LABELS,
  METHOD_LABELS,
  isDraughtCategory,
  draughtCapacityMl,
  type ProductCategory,
  type CountingMethod,
} from "@/lib/calculations";
import { useUpdateProduct, useCalibrateFullBottle, useBottleShapes, useUpsertBottleShape, useAttachShapeToProduct, type BottleShape } from "@/hooks/api";
import { Search, Plus, Scale, SlidersHorizontal, Upload, CheckCircle2, AlertCircle, ArrowLeftRight, Library as LibraryIcon, Tags, PackagePlus, Pencil, Trash2, Banknote } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/lib/database.types";
import { bestCatalogueMatch, findBestNameMatch, scoreNameMatch, type CatalogueEntry } from "@/lib/catalogue";
import {
  CSV_CATEGORY_MAP,
  assertCsvImportRows,
  legacyCategoryForType,
  parseCsvCategory,
  validateCsvImportRows,
} from "@/lib/csv-import-validation";
import { gpPercentForProduct } from "@/lib/inventory-reporting";
import { CataloguePickerSheet } from "@/components/CataloguePickerSheet";
import {
  estimateDefaultPrices,
  findLikelyDuplicate,
  findMethodMismatches,
  inferCountingMethod,
  inferSizeMl,
  isLitreOnBottles,
} from "@/lib/library-hygiene";
import { matchKnownBottles } from "@/hooks/useCatalogue";

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductType = "spirit" | "gin" | "vodka" | "whisky" | "rum" | "liqueur" | "wine" | "sparkling" | "vermouth" | "syrup" | "cordial" | "packaged";

const PRODUCT_TYPES: ProductType[] = ["spirit", "gin", "vodka", "whisky", "rum", "liqueur", "wine", "sparkling", "vermouth", "syrup", "cordial", "packaged"];

const TYPE_COLORS: Record<ProductType, string> = {
  spirit: "bg-amber-100 text-amber-800",
  gin: "bg-violet-100 text-violet-800",
  vodka: "bg-blue-100 text-blue-800",
  whisky: "bg-orange-100 text-orange-800",
  rum: "bg-brown-100 text-yellow-900",
  liqueur: "bg-pink-100 text-pink-800",
  wine: "bg-red-100 text-red-800",
  sparkling: "bg-yellow-100 text-yellow-800",
  vermouth: "bg-emerald-100 text-emerald-800",
  syrup: "bg-rose-100 text-rose-800",
  cordial: "bg-teal-100 text-teal-800",
  packaged: "bg-gray-100 text-gray-700",
};

function AddProductSheet({ open, onClose, venueId, products, initialName, initialMatch }: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  products?: { name: string }[];
  initialName?: string;
  initialMatch?: CatalogueEntry | null;
}) {
  const { data: locations } = useLocations(venueId);
  const addProduct = useAddProduct();
  const { toast } = useToast();

  const [name, setName] = useState(initialName ?? "");
  const [appliedMatch, setAppliedMatch] = useState<CatalogueEntry | null>(null);
  const [dismissedMatch, setDismissedMatch] = useState(false);
  const [type, setType] = useState<ProductType>("spirit");
  const [category, setCategory] = useState<ProductCategory>("spirits");
  const [countingMethod, setCountingMethod] = useState<CountingMethod>("weigh");
  const [containerType, setContainerType] = useState<"keg" | "cask" | "bag_in_box">("keg");
  const [containerL, setContainerL] = useState("50");
  const [dipFullMm, setDipFullMm] = useState("");
  const [packSize, setPackSize] = useState("12");
  const [parLevel, setParLevel] = useState("");
  const [unit, setUnit] = useState<"weigh" | "count">("weigh");
  const [sizeMl, setSizeMl] = useState("700");
  const [density, setDensity] = useState("0.913");
  const [measureMl, setMeasureMl] = useState("");
  const [fullWeightG, setFullWeightG] = useState("");
  const [emptyWeightG, setEmptyWeightG] = useState("");
  const [knownEmptyMode, setKnownEmptyMode] = useState(false);
  const [costPrice, setCostPrice] = useState("");
  const [pourPrice, setPourPrice] = useState("");
  const [abv, setAbv] = useState("");
  const [barcode, setBarcode] = useState("");
  const [vendor, setVendor] = useState("");
  const [sku, setSku] = useState("");
  const [productNotes, setProductNotes] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sliderVal, setSliderVal] = useState(50);
  const [useSlider, setUseSlider] = useState(false);

  const applyMatch = (entry: CatalogueEntry) => {
    setType(entry.type as ProductType);
    if (entry.sizeMl != null) setSizeMl(String(entry.sizeMl));
    setDensity(String(entry.density));
    if (entry.fullWeightG != null) setFullWeightG(String(entry.fullWeightG));
    if (entry.emptyWeightG != null) { setKnownEmptyMode(true); setEmptyWeightG(String(entry.emptyWeightG)); }
    if (entry.abv != null) setAbv(String(entry.abv));
    setAppliedMatch(entry);
    setDismissedMatch(true);
  };

  // Reset / prefill whenever the sheet is (re)opened
  React.useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setDismissedMatch(false);
    setAppliedMatch(null);
    if (initialMatch) applyMatch(initialMatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, initialMatch]);

  // Live catalogue match as the user types the name
  const catalogueMatch = useMemo(() => bestCatalogueMatch(name), [name]);
  const showMatchSuggestion = !!catalogueMatch && !dismissedMatch && catalogueMatch.entry.name.toLowerCase() !== name.trim().toLowerCase();
  const showNewProductHint = name.trim().length >= 2 && !catalogueMatch && !dismissedMatch;
  const duplicateInLibrary = useMemo(() => findBestNameMatch(name, products ?? []), [name, products]);
  // Strengthen the weight-entry nudge when there's no catalogue match to fall back on and
  // no weight has been entered yet — this is the case most likely to leave a product stuck
  // on rough tenths estimates forever if skipped.
  const needsWeighNudge = showNewProductHint && !fullWeightG.trim() && !emptyWeightG.trim();

  // Auto-fill density when type changes
  React.useEffect(() => {
    setDensity(String(DEFAULT_DENSITIES[type] ?? 0.948));
  }, [type]);

  // Keep counting method valid whenever category changes
  React.useEffect(() => {
    setCountingMethod(CATEGORY_METHODS[category].default);
  }, [category]);

  // Auto-derive empty weight
  const derivedEmptyWeight = useMemo(() => {
    const fw = parseFloat(fullWeightG);
    const sm = parseFloat(sizeMl);
    const d = parseFloat(density);
    if (!isNaN(fw) && !isNaN(sm) && !isNaN(d) && sm > 0 && !knownEmptyMode) {
      return deriveEmptyWeight(fw, sm, d);
    }
    return null;
  }, [fullWeightG, sizeMl, density, knownEmptyMode]);

  // Fix 4: plausibility check — warn if the full-weight entry implies implausible calibration
  const calibrationPlausibility = useMemo(() => {
    if (knownEmptyMode || derivedEmptyWeight === null) return null;
    const fw = parseFloat(fullWeightG);
    const sm = parseFloat(sizeMl);
    if (isNaN(fw) || isNaN(sm) || sm <= 0) return null;
    return checkCalibrationPlausibility(fw, derivedEmptyWeight, sm);
  }, [fullWeightG, sizeMl, knownEmptyMode, derivedEmptyWeight]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const sm = parseFloat(sizeMl) || null;
    const d = parseFloat(density) || DEFAULT_DENSITIES[type] || 0.948;
    const fw = parseFloat(fullWeightG) || null;
    const ew = knownEmptyMode
      ? (parseFloat(emptyWeightG) || null)
      : (derivedEmptyWeight ?? null);

    // Never let someone create a weightless duplicate of a bottle we already have weights for —
    // check both the master catalogue and the venue's own existing library.
    if (fw == null && ew == null && !dismissedMatch) {
      if (catalogueMatch?.entry.hasWeights) {
        toast({
          title: "Known bottle — weights on file",
          description: `Tap the "${catalogueMatch.entry.name}" suggestion above to use those weights, or submit again to add it without weights.`,
        });
        setDismissedMatch(true);
        return;
      }
      if (duplicateInLibrary) {
        toast({
          title: "Possible duplicate",
          description: `You already have "${duplicateInLibrary.item.name}" in your library — check it doesn't already have weights before adding another.`,
        });
        setDismissedMatch(true);
        return;
      }
    }

    const product: ProductInsert = {
      venue_id: venueId,
      name: name.trim(),
      type,
      unit,
      size_ml: sm,
      density: d,
      full_weight_g: fw,
      empty_weight_g: ew,
      measure_ml: parseFloat(measureMl) || null,
      cost_price: parseFloat(costPrice) || null,
      pour_price: parseFloat(pourPrice) || null,
      abv: parseFloat(abv) || null,
      barcode: barcode.trim() || null,
      location_id: locationId || null,
      category,
      counting_method: countingMethod,
      container_type: isDraughtCategory(category) ? containerType : null,
      container_l: isDraughtCategory(category) || category === "postmix" ? (parseFloat(containerL) || null) : null,
      dip_full_mm: countingMethod === "dipstick" ? (parseFloat(dipFullMm) || null) : null,
      pack_size: countingMethod === "dozen" ? (parseFloat(packSize) || null) : null,
      par_level: parseFloat(parLevel) || null,
      vendor: vendor.trim() || null,
      sku: sku.trim() || null,
      notes: productNotes.trim() || null,
    };

    try {
      await addProduct.mutateAsync(product);
      toast({ title: "Product added", description: name });
      onClose();
      // Reset
      setName(""); setFullWeightG(""); setEmptyWeightG(""); setCostPrice("");
      setPourPrice(""); setAbv(""); setBarcode(""); setLocationId("");
      setVendor(""); setSku(""); setProductNotes("");
      setDipFullMm(""); setParLevel("");
      setAppliedMatch(null); setDismissedMatch(false); setKnownEmptyMode(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Add Product</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pb-8">
          <div>
            <Label htmlFor="p-name">Name *</Label>
            <Input
              id="p-name"
              required
              value={name}
              onChange={e => { setName(e.target.value); setDismissedMatch(false); }}
              placeholder="Hendrick's Gin"
              className="mt-1"
              data-testid="input-product-name"
            />

            {showMatchSuggestion && catalogueMatch && (
              <button
                type="button"
                onClick={() => applyMatch(catalogueMatch.entry)}
                className="mt-2 w-full text-left border border-[#3FAE74]/40 bg-[#3FAE74]/10 rounded-xl p-3 flex items-start gap-2"
                data-testid="suggestion-catalogue-match"
              >
                <CheckCircle2 className="w-4 h-4 text-[#3FAE74] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{catalogueMatch.entry.name}</span>
                    {catalogueMatch.entry.hasWeights && (
                      <Badge className="bg-[#3FAE74] text-white text-[10px] px-1.5 py-0">Known bottle — weights on file</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {catalogueMatch.entry.hasWeights
                      ? "Tap to prefill known weights for this bottle — no more guesswork on tenths"
                      : "Tap to prefill size, type & density from the catalogue"}
                  </p>
                </div>
              </button>
            )}

            {appliedMatch && (
              <div className="mt-2 flex items-center gap-2 text-xs text-[#3FAE74]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Prefilled from catalogue match: {appliedMatch.name}
                <button type="button" className="underline text-muted-foreground" onClick={() => setAppliedMatch(null)}>
                  dismiss
                </button>
              </div>
            )}

            {showNewProductHint && (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="hint-add-new-product">
                No catalogue match — add "{name.trim()}" as a new product below.
              </p>
            )}

            {duplicateInLibrary && !catalogueMatch && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                You already have "{duplicateInLibrary.item.name}" in your library — check before adding a duplicate.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as ProductType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={v => setCategory(v as ProductCategory)}>
                <SelectTrigger className="mt-1" data-testid="select-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Counting method</Label>
              <Select value={countingMethod} onValueChange={v => setCountingMethod(v as CountingMethod)}>
                <SelectTrigger className="mt-1" data-testid="select-counting-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_METHODS[category].methods.map(m => (
                    <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isDraughtCategory(category) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Container</Label>
                <Select value={containerType} onValueChange={v => setContainerType(v as "keg" | "cask" | "bag_in_box")}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keg">Keg</SelectItem>
                    <SelectItem value="cask">Cask</SelectItem>
                    <SelectItem value="bag_in_box">Bag-in-box</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-container-l">Capacity (litres)</Label>
                <Input id="p-container-l" type="number" value={containerL} onChange={e => setContainerL(e.target.value)} className="mt-1" placeholder="50" />
              </div>
            </div>
          )}

          {countingMethod === "dipstick" && (
            <div>
              <Label htmlFor="p-dip-full">Dip reading when full (mm)</Label>
              <Input id="p-dip-full" type="number" value={dipFullMm} onChange={e => setDipFullMm(e.target.value)} className="mt-1" placeholder="e.g. 480" />
            </div>
          )}

          {countingMethod === "dozen" && (
            <div>
              <Label htmlFor="p-pack-size">Units per pack/case</Label>
              <Input id="p-pack-size" type="number" value={packSize} onChange={e => setPackSize(e.target.value)} className="mt-1" placeholder="12" />
            </div>
          )}

          <div>
            <Label htmlFor="p-par">Par level (optional)</Label>
            <Input id="p-par" type="number" value={parLevel} onChange={e => setParLevel(e.target.value)} className="mt-1" placeholder="Reorder threshold" />
          </div>

          <div>
            <Label>Unit</Label>
            <RadioGroup value={unit} onValueChange={v => setUnit(v as "weigh" | "count")} className="flex gap-4 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="weigh" id="u-weigh" />
                <Label htmlFor="u-weigh">Weigh</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="count" id="u-count" />
                <Label htmlFor="u-count">Count</Label>
              </div>
            </RadioGroup>
          </div>

          {unit === "weigh" && countingMethod !== "dipstick" && countingMethod !== "keg_weight" && countingMethod !== "tenths_pints" && countingMethod !== "litre" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="p-size">Size (ml)</Label>
                  <Input id="p-size" type="number" value={sizeMl} onChange={e => setSizeMl(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="p-density">Density (g/ml)</Label>
                  <Input id="p-density" type="number" step="0.001" value={density} onChange={e => setDensity(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div className={needsWeighNudge ? "border-2 border-[#E0A343] bg-[#E0A343]/10 rounded-xl p-3" : ""} data-testid="section-weight-nudge">
                <div className="flex justify-between items-center mb-2">
                  <Label className={needsWeighNudge ? "font-bold" : ""}>
                    {needsWeighNudge ? "Weigh it now — set up accurate tracking" : "Weight"}
                  </Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setKnownEmptyMode(!knownEmptyMode)} className="h-7 text-xs">
                    {knownEmptyMode ? "Enter full weight instead" : "Enter known tare weight"}
                  </Button>
                </div>
                {needsWeighNudge && (
                  <p className="text-xs text-amber-800 mb-2">
                    No catalogue match found and no weight entered yet — without this, {name.trim() || "this product"} will be stuck on rough tenths estimates instead of accurate weight tracking.
                  </p>
                )}
                {knownEmptyMode ? (
                  <div>
                    <Label htmlFor="p-empty" className="text-muted-foreground text-xs">Empty/Tare weight (g)</Label>
                    <Input id="p-empty" type="number" value={emptyWeightG} onChange={e => setEmptyWeightG(e.target.value)} className="mt-1" placeholder="215" />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="p-full" className="text-muted-foreground text-xs">Full bottle weight (g)</Label>
                    <Input id="p-full" type="number" value={fullWeightG} onChange={e => setFullWeightG(e.target.value)} className="mt-1" placeholder="1163" />
                    {derivedEmptyWeight !== null && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          Derived tare weight: <strong>{derivedEmptyWeight}g</strong>
                        </p>
                        {calibrationPlausibility && !calibrationPlausibility.ok && (
                          <div className="mt-2 rounded-xl border border-[#E5544B]/40 bg-[#E5544B]/10 p-2 text-xs text-[#E5544B]">
                            <strong>Check this weight.</strong> {calibrationPlausibility.warningMessage}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="border border-dashed border-border rounded-xl p-4 bg-muted/40">
                <div className="flex items-center gap-2 mb-2">
                  <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-muted-foreground">Quick estimate (no scale)</Label>
                  <span className="ml-auto text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Rough — not exact</span>
                </div>
                <Slider
                  min={0} max={100} step={5}
                  value={[sliderVal]}
                  onValueChange={([v]) => { setSliderVal(v); setUseSlider(true); }}
                  className="mt-2"
                />
                <p className="text-center text-sm text-muted-foreground mt-1">{sliderVal}% full</p>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-measure">Measure (ml)</Label>
              <Input id="p-measure" type="number" value={measureMl} onChange={e => setMeasureMl(e.target.value)} className="mt-1" placeholder="25" />
            </div>
            <div>
              <Label htmlFor="p-abv">ABV %</Label>
              <Input id="p-abv" type="number" step="0.1" value={abv} onChange={e => setAbv(e.target.value)} className="mt-1" placeholder="40" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-cost">Cost price £ <span className="text-muted-foreground text-xs">(ex-VAT)</span></Label>
              <Input id="p-cost" type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="mt-1" placeholder="18.00" />
            </div>
            <div>
              <Label htmlFor="p-pour">Pour price £ <span className="text-muted-foreground text-xs">(ex-VAT)</span></Label>
              <Input id="p-pour" type="number" step="0.01" value={pourPrice} onChange={e => setPourPrice(e.target.value)} className="mt-1" placeholder="3.20" />
            </div>
          </div>

          <div>
            <Label htmlFor="p-barcode">Barcode (optional)</Label>
            <Input id="p-barcode" value={barcode} onChange={e => setBarcode(e.target.value)} className="mt-1" placeholder="5012345678900" />
          </div>

          <div>
            <Label htmlFor="p-vendor">Supplier / vendor (optional)</Label>
            <Input id="p-vendor" value={vendor} onChange={e => setVendor(e.target.value)} className="mt-1" placeholder="e.g. Matthew Clark" />
          </div>

          <div>
            <Label htmlFor="p-sku">SKU / product code (optional)</Label>
            <Input id="p-sku" value={sku} onChange={e => setSku(e.target.value)} className="mt-1" placeholder="e.g. AB700" />
          </div>

          <div>
            <Label htmlFor="p-notes">Notes (optional)</Label>
            <Input id="p-notes" value={productNotes} onChange={e => setProductNotes(e.target.value)} className="mt-1" placeholder="e.g. Check date on delivery" />
          </div>

          <Button type="submit" className="w-full h-14 text-lg font-bold" disabled={addProduct.isPending}>
            {addProduct.isPending ? "Adding..." : "Add Product"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function WeighNowSheet({ open, onClose, product, venueId }: {
  open: boolean;
  onClose: () => void;
  product: any;
  venueId: string;
}) {
  const [weightStr, setWeightStr] = useState("0");
  const [tenthsStr, setTenthsStr] = useState("0");
  const [calibrating, setCalibrating] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const calibrateFullBottle = useCalibrateFullBottle();

  const hasWeights = product?.full_weight_g != null && product?.empty_weight_g != null;
  // Products with no tare weight default to tenths entry; the weigh pad is only shown
  // once weights exist, or while explicitly calibrating a full bottle.
  const useTenths = !hasWeights && !calibrating;
  const sizeMl = product?.size_ml ?? 700;

  const weightG = parseFloat(weightStr) || 0;
  const tenthsInput = parseFloat(tenthsStr) || 0;

  const mlRemaining = useTenths
    ? (tenthsInput / 10) * sizeMl
    : product?.empty_weight_g != null && product?.density
    ? calcMlRemaining(weightG, product.empty_weight_g, product.density, sizeMl)
    : null;
  const tenths = useTenths
    ? tenthsInput
    : mlRemaining !== null && product?.size_ml
    ? calcTenths(mlRemaining, product.size_ml)
    : null;

  const reset = () => {
    setWeightStr("0");
    setTenthsStr("0");
    setCalibrating(false);
  };

  const handleConfirm = async () => {
    if (!product) return;
    setLoading(true);
    try {
      if (calibrating) {
        await calibrateFullBottle.mutateAsync({
          product,
          venueId,
          userId: user!.id,
          weightG,
        });
        toast({ title: "Weight tracking set up", description: `${product.name}: full weight saved` });
      } else {
        if (mlRemaining === null) return;
        await supabase.from("readings").insert({
          venue_id: venueId,
          product_id: product.id,
          location_id: product.location_id,
          method: "weigh",
          weight_g: useTenths ? null : weightG,
          ml_remaining: mlRemaining,
          user_id: user!.id,
          reading_at: new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: ["latest-readings", venueId] });
        toast({ title: "Reading saved", description: `${product.name}: ${tenths?.toFixed(1)} tenths` });
      }
      onClose();
      reset();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>{product?.name ?? "Weigh"}</SheetTitle>
          {!hasWeights && !calibrating && (
            <p className="text-xs text-muted-foreground bg-accent rounded p-2">
              No weight set up yet for this product — enter a rough tenths estimate, or{" "}
              <button type="button" className="underline font-medium text-primary" onClick={() => setCalibrating(true)}>
                weigh a full bottle to set up tracking
              </button>.
            </p>
          )}
          {calibrating && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
              Weigh a full, unopened bottle now — it'll be saved as this product's full weight for future stocktakes.
            </p>
          )}
        </SheetHeader>

        {useTenths ? (
          <NumberPad value={tenthsStr} onChange={setTenthsStr} label="Tenths remaining (0-10)" allowDecimal />
        ) : (
          <NumberPad value={weightStr} onChange={setWeightStr} label="Weight in grams" allowDecimal />
        )}

        {mlRemaining !== null && (
          <div className="mt-4 bg-accent rounded-xl p-4 text-center space-y-1">
            <div className="text-3xl font-bold text-primary">{tenths?.toFixed(1)} tenths</div>
            <div className="text-sm text-muted-foreground">
              {useTenths ? "Rough estimate — not exact · " : ""}
              {Math.round(mlRemaining)}ml remaining
            </div>
          </div>
        )}

        {calibrating && (
          <button type="button" className="text-xs text-muted-foreground underline mt-2 block" onClick={() => setCalibrating(false)}>
            Cancel — enter a rough tenths estimate instead
          </button>
        )}

        <Button
          className="w-full h-14 text-lg font-bold mt-4"
          onClick={handleConfirm}
          disabled={loading || (calibrating ? weightG <= 0 : mlRemaining === null)}
        >
          {loading ? "Saving..." : calibrating ? "Save as Full Weight" : "Save Reading"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

// ─── CSV TYPE MAPPING ────────────────────────────────────────────────────────
const CSV_TYPE_MAP: Record<string, ProductType> = {
  "sparkling wine": "sparkling", "sparkling": "sparkling",
  "wine": "wine",
  "gin": "gin",
  "liqueur": "liqueur", "liqueur (cream)": "liqueur", "liqueur (flavoured rum)": "liqueur",
  "tequila (spirit)": "spirit",
  "vermouth": "vermouth",
  "rum": "rum",
  "vodka": "vodka",
  "whisky": "whisky", "whiskey": "whisky",
  "syrup": "syrup",
  "cordial (0%)": "cordial", "cordial": "cordial",
  "spirit": "spirit",
  "packaged": "packaged",
};

interface CsvRow {
  name: string;
  type: ProductType;
  size_ml: number | null;
  full_weight_g: number | null;
  empty_weight_g: number | null;
  density: number;
  abv: number | null;
  ok: boolean;
  warn: string;
  externalId?: string | null;
  category?: ProductCategory | null;
  countingMethod?: CountingMethod | null;
  costPrice?: number | null;
  sellPrice?: number | null;
  parLevel?: number | null;
  /** Keg/cask capacity in litres — sets container_l for keg_weight/dipstick/tenths_pints products. */
  containerL?: number | null;
  /** Dipstick full-tank depth in mm — sets dip_full_mm for dipstick products. */
  dipFullMm?: number | null;
  /** True once catalogue-matching has run and the row still has no full/empty weight. */
  needsWeighing?: boolean;
  /** Price came from estimateDefaultPrices, not the file — written to the DB as *_estimated. */
  costEstimated?: boolean;
  sellEstimated?: boolean;
  /** Name of an existing library product this row looks like (import preview unticks it). */
  duplicateOf?: string | null;
  /** Unticked rows are skipped on import. */
  include?: boolean;
}

/** Fill any blank price from a typical UK trade price, flagged as estimated. */
function applyPriceEstimates(row: CsvRow): CsvRow {
  if (row.costPrice != null && row.sellPrice != null) return row;
  const est = estimateDefaultPrices({
    name: row.name,
    category: row.category ?? null,
    countingMethod: row.countingMethod ?? null,
    sizeMl: row.size_ml,
    containerL: row.containerL ?? null,
  });
  const next = { ...row };
  if (next.costPrice == null && est.cost != null) { next.costPrice = est.cost; next.costEstimated = true; }
  if (next.sellPrice == null && est.pour != null) { next.sellPrice = est.pour; next.sellEstimated = true; }
  return next;
}

/** Untick rows that are the same product as one already in the library under another name. */
function applyDuplicateCheck(row: CsvRow, existing: Array<{ id: string; name: string; category: ProductCategory | null; counting_method: CountingMethod | null; size_ml: number | null }>): CsvRow {
  const dup = findLikelyDuplicate({ name: row.name, category: row.category ?? null, size_ml: row.size_ml }, existing);
  return dup
    ? { ...row, duplicateOf: dup.product.name, include: false }
    : { ...row, duplicateOf: null, include: row.include ?? true };
}

/**
 * For rows that arrived with no weight data, check the pre-loaded catalogue by name and
 * apply known weight/density when there's a match — the same lookup used for manually-added
 * products. Anything still unweighed afterwards is flagged via `needsWeighing` so the import
 * preview and post-import checklist can offer to weigh it.
 */
function applyCatalogueFallback(row: CsvRow): CsvRow {
  if (row.full_weight_g != null && row.empty_weight_g != null) {
    return { ...row, needsWeighing: false };
  }
  const match = bestCatalogueMatch(row.name);
  if (match?.entry.hasWeights) {
    return {
      ...row,
      size_ml: match.entry.sizeMl ?? row.size_ml,
      full_weight_g: match.entry.fullWeightG,
      empty_weight_g: match.entry.emptyWeightG,
      density: match.entry.density,
      abv: match.entry.abv ?? row.abv,
      needsWeighing: false,
      warn: "",
    };
  }
  return { ...row, needsWeighing: true };
}

const CSV_UNIT_METHOD_MAP: Record<string, CountingMethod> = {
  "keg": "keg_weight", "keg weight": "keg_weight",
  "cask": "dipstick", "dipstick": "dipstick",
  "tenths": "tenths", "tenths/pints": "tenths_pints", "pints": "tenths_pints",
  "dozen": "dozen", "case": "dozen",
  "each": "each", "unit": "each",
  "litre": "litre", "litres": "litre",
  "weigh": "weigh", "bottle": "weigh",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s*\(.*?\)/g, "").trim().replace(/\s+/g, "_");
}

function normalizeRowKeys(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) out[normalizeHeader(k)] = v;
  return out;
}

interface RawCsv {
  /** Original header text, in file order — used for mapping-UI dropdowns. */
  headers: string[];
  /** Rows keyed by ORIGINAL header text (not normalized). */
  rows: Record<string, string>[];
}

/** Phase 1: raw parse only — no field interpretation, so we can decide auto-detect vs. manual mapping. */
function rawParseCsv(text: string): RawCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

type CsvFormat = "fullbar" | "legacy" | "unknown";

/**
 * Detect one of the two known formats from the file's headers, else "unknown" (needs manual mapping).
 * Requires a strong multi-column signature per format — a single generic-sounding column
 * (e.g. a lone "Category" header) must NOT be enough to claim a match, or foreign CSVs
 * would get silently mis-parsed instead of routed to manual mapping.
 */
function detectCsvFormat(headers: string[]): CsvFormat {
  const norm = headers.map(normalizeHeader);
  const has = (h: string) => norm.includes(h);

  const isFullBar = (has("product_name") || has("name")) && has("category") && (has("unit_type") || has("part_unit_type"));
  if (isFullBar) return "fullbar";

  const hasNameCol = has("drink") || has("name");
  const hasWeighSignature = has("full_weight_g") || has("full_weight") || has("empty_weight_g") || has("empty_tare_g") || has("empty_tare");
  const isLegacy = hasNameCol && has("size_ml") && hasWeighSignature;
  if (isLegacy) return "legacy";

  return "unknown";
}

// Full-bar unit CSV format: Product_ID,Product_Name,Category,Unit_Type,Part_Unit_Type,Cost_Price,Sell_Price,Par_Level
function mapFullBarRow(row: Record<string, string>): CsvRow {
  const rawName = (row["product_name"] ?? row["name"] ?? "").trim();
  const rawCategory = (row["category"] ?? "").trim().toLowerCase();
  const category = parseCsvCategory(rawCategory);
  const unitType = (row["unit_type"] ?? "").trim().toLowerCase();
  const partUnitType = (row["part_unit_type"] ?? "").trim().toLowerCase();
  const requestedMethod = category ? (CSV_UNIT_METHOD_MAP[partUnitType] ?? CSV_UNIT_METHOD_MAP[unitType] ?? null) : null;
  const sizeFromFile = parseFloat(row["size_ml"] ?? row["size"] ?? "") || null;
  const sizeMl = category ? (sizeFromFile ?? inferSizeMl(rawName, category, requestedMethod)) : sizeFromFile;
  // A stocktaker's "litre" on a packaged bottle means "each"; see inferCountingMethod.
  const countingMethod = category
    ? (inferCountingMethod(category, requestedMethod, rawName, sizeMl, CATEGORY_METHODS[category].default) ?? null)
    : null;
  const costPriceRaw = parseFloat(row["cost_price"] ?? "") || null;
  const sellPriceRaw = parseFloat(row["sell_price"] ?? "") || null;
  const costPrice = costPriceRaw != null && costPriceRaw < 0 ? null : costPriceRaw;
  const sellPrice = sellPriceRaw != null && sellPriceRaw < 0 ? null : sellPriceRaw;
  const categoryWarn = category
    ? ""
    : rawCategory
      ? `Unknown category “${rawCategory}” — select a valid category`
      : "Category is required";
  const negativePriceWarn = (costPriceRaw != null && costPriceRaw < 0) || (sellPriceRaw != null && sellPriceRaw < 0)
    ? "Negative price cleared — re-enter cost/sell" : "";
  const parLevel = parseFloat(row["par_level"] ?? "") || null;
  const isVolumeMethod = countingMethod === "keg_weight" || countingMethod === "dipstick" || countingMethod === "tenths_pints";
  const containerL = isVolumeMethod ? (parseFloat(row["container_l"] ?? row["container_litres"] ?? row["keg_size_l"] ?? "") || null) : null;
  const dipFullMm = countingMethod === "dipstick" ? (parseFloat(row["dip_full_mm"] ?? row["dip_full"] ?? "") || null) : null;
  const mappedType: ProductType = category === "wines" ? "wine" : category === "packaged" ? "packaged" : "spirit";
  return {
    name: rawName,
    type: mappedType,
    size_ml: sizeMl,
    full_weight_g: null,
    empty_weight_g: null,
    density: DEFAULT_DENSITIES[mappedType] ?? 0.948,
    abv: null,
    ok: !!rawName,
    warn: [categoryWarn, negativePriceWarn].filter(Boolean).join(" · "),
    externalId: (row["product_id"] ?? "").trim() || null,
    category,
    countingMethod,
    costPrice,
    sellPrice,
    parLevel,
    containerL,
    dipFullMm,
  };
}

// Legacy weigh-only CSV format: name/drink, type, size_ml, full_weight_g, empty_weight_g, density, abv
function mapLegacyRow(row: Record<string, string>): CsvRow {
  const rawName = (row["drink"] ?? row["name"] ?? "").trim();
  const rawType = (row["type"] ?? "spirit").trim().toLowerCase();
  const sizeMl = parseFloat(row["size_ml"] ?? row["size"] ?? "") || null;
  const fullG = parseFloat(row["full_weight_g"] ?? row["full_weight"] ?? "") || null;
  const emptyRaw = row["empty_tare_g"] ?? row["empty_weight_g"] ?? row["empty/tare"] ?? row["empty_tare"] ?? "";
  const emptyG = (emptyRaw === "" || emptyRaw?.toUpperCase() === "RE-WEIGH")
    ? null
    : (parseFloat(emptyRaw) || null);
  const density = parseFloat(row["density_g/ml"] ?? row["density"] ?? "") || (DEFAULT_DENSITIES[(CSV_TYPE_MAP[rawType] ?? "spirit")] ?? 0.948);
  const abv = parseFloat(row["abv"] ?? "") || null;
  const costPriceRaw = parseFloat(row["cost_price"] ?? row["cost"] ?? "") || null;
  const sellPriceRaw = parseFloat(row["sell_price"] ?? row["price"] ?? "") || null;
  const costPrice = costPriceRaw != null && costPriceRaw < 0 ? null : costPriceRaw;
  const sellPrice = sellPriceRaw != null && sellPriceRaw < 0 ? null : sellPriceRaw;
  const parLevel = parseFloat(row["par_level"] ?? row["par"] ?? "") || null;

  const mappedType: ProductType = CSV_TYPE_MAP[rawType] ?? "spirit";
  const category = legacyCategoryForType(mappedType);
  const resolvedSizeMl = sizeMl ?? inferSizeMl(rawName, category, CATEGORY_METHODS[category].default);
  const weightWarn = emptyG === null ? "No tare weight — re-weigh empty bottle to use" : "";
  const negativePriceWarn = (costPriceRaw != null && costPriceRaw < 0) || (sellPriceRaw != null && sellPriceRaw < 0)
    ? "Negative price cleared — re-enter cost/sell" : "";
  const warn = [weightWarn, negativePriceWarn].filter(Boolean).join(" · ");

  return {
    name: rawName,
    type: mappedType,
    size_ml: resolvedSizeMl,
    full_weight_g: fullG,
    empty_weight_g: emptyG,
    density,
    abv,
    ok: !!rawName,
    warn,
    externalId: (row["product_id"] ?? "").trim() || null,
    category,
    countingMethod: CATEGORY_METHODS[category].default,
    costPrice,
    sellPrice,
    parLevel,
  };
}

function parseCsvRows(text: string, venueDefaultMeasure: number): CsvRow[] {
  const { headers, rows } = rawParseCsv(text);
  const format = detectCsvFormat(headers);
  if (format === "unknown") return [];
  return rows
    .map(row => {
      const norm = normalizeRowKeys(row);
      return format === "fullbar" ? mapFullBarRow(norm) : mapLegacyRow(norm);
    })
    .filter(r => r.ok);
}

// ─── MANUAL COLUMN MAPPING (fallback for unrecognized CSV formats) ──────────
type MappableField =
  | "name" | "type" | "category" | "size_ml" | "full_weight_g" | "empty_weight_g"
  | "density" | "abv" | "cost_price" | "sell_price" | "par_level";

const MAPPABLE_FIELDS: { key: MappableField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "category", label: "Category" },
  { key: "size_ml", label: "Size/ml" },
  { key: "full_weight_g", label: "Full weight" },
  { key: "empty_weight_g", label: "Empty weight" },
  { key: "density", label: "Density" },
  { key: "abv", label: "ABV" },
  { key: "cost_price", label: "Cost price" },
  { key: "sell_price", label: "Sell price" },
  { key: "par_level", label: "Par level" },
];

const FIELD_SYNONYMS: Record<MappableField, string[]> = {
  name: ["name", "product", "product_name", "drink", "item", "item_name"],
  type: ["type", "spirit_type", "product_type"],
  category: ["category", "cat"],
  size_ml: ["size_ml", "size", "bottle_size", "ml", "volume"],
  full_weight_g: ["full_weight_g", "full_weight", "full", "weight_full"],
  empty_weight_g: ["empty_weight_g", "empty_weight", "tare", "empty_tare_g", "empty_tare", "empty"],
  density: ["density", "density_g/ml", "sg"],
  abv: ["abv", "alcohol"],
  cost_price: ["cost_price", "cost", "buy_price"],
  sell_price: ["sell_price", "sale_price", "price", "pour_price"],
  par_level: ["par_level", "par"],
};

/** Best-guess column mapping based on header text, so the mapping step arrives pre-filled. */
function guessColumnMapping(headers: string[]): Partial<Record<MappableField, string>> {
  const normalized = headers.map(h => ({ original: h, norm: normalizeHeader(h) }));
  const mapping: Partial<Record<MappableField, string>> = {};
  for (const field of Object.keys(FIELD_SYNONYMS) as MappableField[]) {
    const synonyms = FIELD_SYNONYMS[field];
    const exact = normalized.find(h => synonyms.includes(h.norm));
    const partial = exact ?? normalized.find(h => synonyms.some(s => h.norm.includes(s)));
    if (partial) mapping[field] = partial.original;
  }
  return mapping;
}

/** Turn one manually-mapped row into the same internal CsvRow shape the preview/import already expect. */
function mapGenericRow(row: Record<string, string>, mapping: Partial<Record<MappableField, string>>): CsvRow {
  const get = (f: MappableField) => {
    const header = mapping[f];
    return header ? (row[header] ?? "").trim() : "";
  };

  const name = get("name");
  const rawType = (get("type") || "spirit").toLowerCase();
  const type: ProductType = CSV_TYPE_MAP[rawType] ?? (PRODUCT_TYPES.includes(rawType as ProductType) ? (rawType as ProductType) : "spirit");
  const rawCategory = get("category").toLowerCase();
  const category = parseCsvCategory(rawCategory);
  const sizeMl = parseFloat(get("size_ml")) || null;
  const fullG = parseFloat(get("full_weight_g")) || null;
  const emptyG = parseFloat(get("empty_weight_g")) || null;
  const density = parseFloat(get("density")) || (DEFAULT_DENSITIES[type] ?? 0.948);
  const abv = parseFloat(get("abv")) || null;
  const costPriceRaw = parseFloat(get("cost_price")) || null;
  const sellPriceRaw = parseFloat(get("sell_price")) || null;
  const costPrice = costPriceRaw != null && costPriceRaw < 0 ? null : costPriceRaw;
  const sellPrice = sellPriceRaw != null && sellPriceRaw < 0 ? null : sellPriceRaw;
  const parLevel = parseFloat(get("par_level")) || null;
  const categoryWarn = category
    ? ""
    : rawCategory
      ? `Unknown category “${rawCategory}” — select a valid category`
      : "Category is required";
  const weightWarn = fullG == null && emptyG == null ? "No weights mapped — add manually before use" : "";
  const negativePriceWarn = (costPriceRaw != null && costPriceRaw < 0) || (sellPriceRaw != null && sellPriceRaw < 0)
    ? "Negative price cleared — re-enter cost/sell" : "";
  const warn = [categoryWarn, weightWarn, negativePriceWarn].filter(Boolean).join(" · ");
  const resolvedSizeMl = sizeMl ?? (category ? inferSizeMl(name, category, null) : null);

  return {
    name,
    type,
    size_ml: resolvedSizeMl,
    full_weight_g: fullG,
    empty_weight_g: emptyG,
    density,
    abv,
    ok: !!name,
    warn,
    externalId: (() => { const k = Object.keys(row).find(h => normalizeHeader(h) === "product_id"); return k ? (row[k] ?? "").trim() || null : null; })(),
    category,
    countingMethod: category ? (inferCountingMethod(category, null, name, resolvedSizeMl, CATEGORY_METHODS[category].default) ?? undefined) : undefined,
    costPrice,
    sellPrice,
    parLevel,
  };
}

interface ImportedProductSummary {
  id: string;
  name: string;
  size_ml: number | null;
  density: number | null;
  location_id: string | null;
  needsWeighing: boolean;
}

async function insertCsvRows(rows: CsvRow[], venueId: string): Promise<ImportedProductSummary[]> {
  assertCsvImportRows(rows);
  const inserted: ImportedProductSummary[] = [];
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = rows.slice(i, i + 20);
    const batch = chunk.map(r => ({
      venue_id: venueId,
      name: r.name,
      type: r.type,
      unit: (r.countingMethod === "weigh" || r.countingMethod === "tenths" || !r.countingMethod ? "weigh" : "count") as "weigh" | "count",
      size_ml: r.size_ml,
      full_weight_g: r.full_weight_g,
      empty_weight_g: r.empty_weight_g,
      density: r.density,
      abv: r.abv,
      category: r.category!,
      counting_method: r.countingMethod!,
      cost_price: r.costPrice ?? null,
      pour_price: r.sellPrice ?? null,
      cost_price_estimated: !!r.costEstimated && r.costPrice != null,
      pour_price_estimated: !!r.sellEstimated && r.sellPrice != null,
      par_level: r.parLevel ?? null,
      sku: r.externalId ?? null,
      container_l: r.containerL ?? null,
      dip_full_mm: r.dipFullMm ?? null,
    }));
    const { data, error } = await supabase.from("products").insert(batch).select("id, name, size_ml, density, location_id");
    if (error) throw error;
    (data ?? []).forEach((p, idx) => {
      // Only weigh-unit products (spirits/wines) benefit from the weighing follow-up —
      // count/draught methods never use full/empty weight.
      const row = chunk[idx];
      const isWeighUnit = row.countingMethod === "weigh" || row.countingMethod === "tenths" || !row.countingMethod;
      inserted.push({
        id: p.id,
        name: p.name,
        size_ml: p.size_ml,
        density: p.density,
        location_id: p.location_id,
        needsWeighing: isWeighUnit && !!row.needsWeighing,
      });
    });
  }
  // Calibration data belongs to the venue. CSV import must not auto-submit weights
  // to a shared catalogue without a separate, explicit opt-in flow.
  return inserted;
}

/** Update existing products matched by SKU (externalId). Only updates pricing/par/category fields — not name, weights, or type. */
async function updateCsvRows(
  rows: CsvRow[],
  existingSkuMap: Map<string, { id: string; name: string }>,
): Promise<number> {
  let updated = 0;
  for (const r of rows) {
    const key = (r.externalId ?? "").trim().toLowerCase();
    if (!key) continue;
    const existing = existingSkuMap.get(key);
    if (!existing) continue;
    const patch: {
      cost_price?: number;
      pour_price?: number;
      cost_price_estimated?: boolean;
      pour_price_estimated?: boolean;
      par_level?: number;
      category?: ProductCategory;
      counting_method?: CountingMethod;
      container_l?: number;
      dip_full_mm?: number;
    } = {};
    // Only real prices from the file overwrite an existing product; estimates never do.
    if (r.costPrice != null && !r.costEstimated) { patch.cost_price = r.costPrice; patch.cost_price_estimated = false; }
    if (r.sellPrice != null && !r.sellEstimated) { patch.pour_price = r.sellPrice; patch.pour_price_estimated = false; }
    if (r.parLevel != null) patch.par_level = r.parLevel;
    if (r.category) patch.category = r.category;
    if (r.countingMethod) patch.counting_method = r.countingMethod;
    if (r.containerL != null) patch.container_l = r.containerL;
    if (r.dipFullMm != null) patch.dip_full_mm = r.dipFullMm;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("products").update(patch).eq("id", existing.id);
    if (!error) updated++;
  }
  return updated;
}

function ImportCSVSheet({ open, onClose, venueId, defaultMeasure, maxNew, existingProducts }: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  defaultMeasure: number;
  /** Remaining product slots on the current plan (Infinity on Pro/Premium). */
  maxNew?: number;
  /** Products already in this venue's library — used for dedup and SKU-match updates. */
  existingProducts?: { id: string; name: string; sku: string | null; category: ProductCategory | null; counting_method: CountingMethod | null; size_ml: number | null }[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [rawCsv, setRawCsv] = useState<RawCsv | null>(null);
  const [columnMapping, setColumnMapping] = useState<Partial<Record<MappableField, string>>>({});
  const [needsMapping, setNeedsMapping] = useState(false);
  const [unweighedProducts, setUnweighedProducts] = useState<ImportedProductSummary[]>([]);
  const [showWeighChecklist, setShowWeighChecklist] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<ProductCategory | "">("");
  const [importBlockError, setImportBlockError] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const raw = rawParseCsv(text);
      const format = detectCsvFormat(raw.headers);
      const parsed = format === "unknown" ? [] : raw.rows
        .map(row => {
          const norm = normalizeRowKeys(row);
          return format === "fullbar" ? mapFullBarRow(norm) : mapLegacyRow(norm);
        })
        .filter(r => r.ok)
        .map(applyCatalogueFallback)
        .map(applyPriceEstimates)
        .map(r => applyDuplicateCheck(r, existingProducts ?? []));

      // Fall back to manual mapping if the format is unrecognized, or if a "recognized"
      // format still produced zero usable rows (e.g. no name column actually matched).
      if (format === "unknown" || parsed.length === 0) {
        setRawCsv(raw);
        setColumnMapping(guessColumnMapping(raw.headers));
        setNeedsMapping(true);
        setRows([]);
      } else {
        setRows(parsed);
        setNeedsMapping(false);
        setRawCsv(null);
      }
      setDone(false);
    };
    reader.readAsText(file);
  };

  const handleApplyMapping = () => {
    if (!rawCsv) return;
    const parsed = rawCsv.rows
      .map(row => mapGenericRow(row, columnMapping))
      .filter(r => r.ok)
      .map(applyCatalogueFallback)
      .map(applyPriceEstimates)
      .map(r => applyDuplicateCheck(r, existingProducts ?? []));
    setRows(parsed);
    setNeedsMapping(false);
  };

  const updateRow = (i: number, patch: Partial<CsvRow>) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      let merged = { ...r, ...patch };
      if (patch.category && (!merged.countingMethod || !CATEGORY_METHODS[patch.category].methods.includes(merged.countingMethod))) {
        merged.countingMethod = CATEGORY_METHODS[patch.category].default;
      }
      if (patch.name !== undefined) {
        merged = applyCatalogueFallback(merged);
      }
      // Anything that changes what the product IS re-derives its estimated prices
      // and re-runs the duplicate check; a price typed by hand stops being an estimate.
      if (patch.category !== undefined || patch.name !== undefined || patch.countingMethod !== undefined) {
        if (merged.costEstimated) { merged.costPrice = null; merged.costEstimated = false; }
        if (merged.sellEstimated) { merged.sellPrice = null; merged.sellEstimated = false; }
        merged = applyPriceEstimates(merged);
        if (patch.name !== undefined) merged = applyDuplicateCheck(merged, existingProducts ?? []);
      }
      if (patch.costPrice !== undefined) merged.costEstimated = false;
      if (patch.sellPrice !== undefined) merged.sellEstimated = false;
      return merged;
    }));
  };

  const existingNamesLower = useMemo(
    () => new Set((existingProducts ?? []).map(p => p.name.trim().toLowerCase())),
    [existingProducts],
  );

  /** Map of sku (lowercase) → { id, name } for products that already have a SKU stored. */
  const existingSkuMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of existingProducts ?? []) {
      if (p.sku) map.set(p.sku.trim().toLowerCase(), { id: p.id, name: p.name });
    }
    return map;
  }, [existingProducts]);

  /** Count of each externalId appearing in the current file — used to flag within-file duplicates. */
  const fileSkuCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = (r.externalId ?? "").trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const handleImport = async () => {
    if (!rows.length) return;
    setImportBlockError(null);
    const ticked = rows.filter(r => r.include !== false);
    const untickedCount = rows.length - ticked.length;
    if (ticked.length === 0) {
      toast({ title: "Nothing ticked", description: "Every row is unticked — tick the ones you want to import." });
      return;
    }
    const validationErrors = validateCsvImportRows(ticked);
    if (validationErrors.length > 0) {
      setImportBlockError(validationErrors.slice(0, 3).join(" ") + (validationErrors.length > 3 ? ` ${validationErrors.length - 3} more error(s).` : ""));
      return;
    }
    // Rows whose externalId matches an existing SKU → update, not insert.
    const toUpdate = ticked.filter(r => {
      const key = (r.externalId ?? "").trim().toLowerCase();
      return key && existingSkuMap.has(key);
    });
    // Remaining rows: skip those already in library by name, insert the rest.
    const toInsertRaw = ticked.filter(r => {
      const key = (r.externalId ?? "").trim().toLowerCase();
      return !(key && existingSkuMap.has(key));
    });
    const toInsert = toInsertRaw.filter(r => !existingNamesLower.has(r.name.trim().toLowerCase()));
    const nameSkipCount = toInsertRaw.length - toInsert.length;

    if (toUpdate.length === 0 && toInsert.length === 0) {
      toast({ title: "Nothing to import", description: "All products in this file are already in your library." });
      return;
    }
    // (tier gate) Free plan: 50-product cap applies to new inserts only, not updates
    if (maxNew !== undefined && Number.isFinite(maxNew) && toInsert.length > maxNew) {
      setImportBlockError(
        maxNew === 0
          ? `Your library is at the 50-product free plan limit. Upgrade to Pro for unlimited products.`
          : `This file has ${toInsert.length} new products but the free plan only has room for ${maxNew} more. Upgrade to Pro for unlimited products.`
      );
      return;
    }
    setImporting(true);
    try {
      let updatedCount = 0;
      if (toUpdate.length > 0) updatedCount = await updateCsvRows(toUpdate, existingSkuMap);
      const inserted = toInsert.length > 0 ? await insertCsvRows(toInsert, venueId) : [];
      // Give unweighed bottles the catalogue's weights where it obviously knows the bottle.
      let matchedNames = new Set<string>();
      try {
        const byName = new Map(toInsert.map(r => [r.name, r] as const));
        const result = await matchKnownBottles(
          venueId,
          inserted.filter(p => p.needsWeighing).map(p => ({
            id: p.id,
            name: p.name,
            category: byName.get(p.name)?.category ?? null,
            size_ml: p.size_ml,
            counting_method: byName.get(p.name)?.countingMethod ?? null,
            full_weight_g: null,
            empty_weight_g: null,
          })),
        );
        matchedNames = new Set(result.matchedNames);
        if (result.matched > 0) {
          toast({
            title: `${result.matched} bottle${result.matched === 1 ? "" : "s"} matched to known weights`,
            description: "No need to weigh those — the catalogue already has them.",
          });
        }
      } catch {
        // matching is a nicety; the import already succeeded
      }
      queryClient.invalidateQueries({ queryKey: ["products", venueId] });
      setImportedCount(inserted.length + updatedCount);
      setUnweighedProducts(inserted.filter(p => p.needsWeighing && !matchedNames.has(p.name)));
      setDone(true);
      const parts: string[] = [];
      if (inserted.length > 0) parts.push(`${inserted.length} added`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (nameSkipCount + untickedCount > 0) parts.push(`${nameSkipCount + untickedCount} skipped (already in your library)`);
      toast({ title: "Library updated", description: parts.join(" · ") || "No changes made" });
    } catch (err: any) {
      toast({ title: "Import error", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setRows([]);
    setDone(false);
    setImportedCount(0);
    setRawCsv(null);
    setColumnMapping({});
    setNeedsMapping(false);
    setUnweighedProducts([]);
    setShowWeighChecklist(false);
    setBulkCategory("");
    setImportBlockError(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={o => !o && handleClose()}>
      <SheetContent side="bottom" className="h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Import Products from CSV</SheetTitle>
        </SheetHeader>

        {done ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <h2 className="text-2xl font-bold">{importedCount} products imported</h2>
            <p className="text-muted-foreground">Your library has been updated.</p>
            {unweighedProducts.length > 0 && (
              <div className="w-full border border-amber-300 bg-amber-50 rounded-xl p-4 text-left space-y-2" data-testid="section-post-import-weigh-prompt">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                  <Scale className="w-4 h-4" />
                  {unweighedProducts.length} product{unweighedProducts.length === 1 ? "" : "s"} still need weighing
                </div>
                <p className="text-xs text-amber-700">
                  Weigh them now so they're tracked accurately from your next stocktake, instead of stuck on rough tenths estimates.
                </p>
                <Button
                  className="w-full h-11 font-bold"
                  onClick={() => setShowWeighChecklist(true)}
                  data-testid="button-weigh-now-checklist"
                >
                  Weigh them now
                </Button>
              </div>
            )}
            <Button className="w-full h-14 text-lg font-bold mt-4" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4 pb-8">
            <div className="bg-muted/60 rounded-xl p-4 text-sm space-y-1.5">
              <p className="font-semibold">Expected CSV columns:</p>
              <p className="text-muted-foreground font-mono text-xs">Product_ID, Product_Name, Category, Unit_Type, Part_Unit_Type, Cost_Price, Sell_Price, Par_Level</p>
              <p className="text-muted-foreground text-xs mt-1">For keg/cask products, add optional columns: <span className="font-mono">Container_L</span> (keg or cask capacity in litres, e.g. 50 for a 50L keg) and <span className="font-mono">Dip_Full_MM</span> (dipstick full-tank depth in mm, dipstick products only). These calibrate draught products on import so you don't need to fix them manually afterwards.</p>
              <p className="text-muted-foreground text-xs mt-1">Also accepts the legacy weigh-only format (name, type, size_ml, full_weight_g, empty_weight_g, density, abv). Any other format will prompt you to map columns manually.</p>
            </div>

            <div>
              <Label htmlFor="csv-file">Choose CSV file</Label>
              <input
                id="csv-file"
                ref={fileRef}
                type="file"
                accept=".csv"
                className="mt-2 w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                onChange={handleFile}
                data-testid="input-csv-file"
              />
            </div>

            {needsMapping && rawCsv && (
              <div className="space-y-3 border border-border rounded-xl p-4" data-testid="section-column-mapping">
                <div>
                  <p className="text-sm font-semibold">We couldn't recognize these columns</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Map each field below to a column from your file. Best guesses are pre-selected.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {MAPPABLE_FIELDS.map(f => (
                    <div key={f.key}>
                      <Label className="text-xs text-muted-foreground">{f.label}{f.key === "name" || f.key === "category" ? " *" : ""}</Label>
                      <Select
                        value={columnMapping[f.key] ?? "__none__"}
                        onValueChange={v => setColumnMapping(prev => ({ ...prev, [f.key]: v === "__none__" ? undefined : v }))}
                      >
                        <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`select-map-${f.key}`}><SelectValue placeholder="Not mapped" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Not mapped</SelectItem>
                          {rawCsv.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full h-12 font-bold"
                  onClick={handleApplyMapping}
                  disabled={!columnMapping.name || !columnMapping.category}
                  data-testid="button-apply-mapping"
                >
                  Continue to preview
                </Button>
              </div>
            )}

            {rows.length > 0 && (
              <>
                <div className="text-sm font-semibold">{rows.length} products found — review &amp; edit before import:</div>

                {rows.some(r => !r.category) && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40" data-testid="bulk-category-bar">
                    <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0 font-medium">Set all uncategorized:</span>
                    <Select value={bulkCategory} onValueChange={v => setBulkCategory(v as ProductCategory | "")}>
                      <SelectTrigger className="h-8 flex-1 text-xs min-w-0" data-testid="select-bulk-category">
                        <SelectValue placeholder="Pick a category…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map(c => (
                          <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 text-xs border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-800/30"
                      disabled={!bulkCategory}
                      onClick={() => {
                        if (!bulkCategory) return;
                        setRows(prev => prev.map(r => r.category ? r : { ...r, category: bulkCategory as ProductCategory }));
                        setBulkCategory("");
                      }}
                      data-testid="button-apply-bulk-category"
                    >
                      Apply to all
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {rows.slice(0, 20).map((r, i) => {
                    const skuKey = (r.externalId ?? "").trim().toLowerCase();
                    const updateTarget = skuKey ? existingSkuMap.get(skuKey) : undefined;
                    const dupInFile = skuKey ? (fileSkuCounts.get(skuKey) ?? 0) > 1 : false;
                    const parHigh = r.parLevel != null && r.parLevel > 100;
                    const hasWarning = !!(r.warn || parHigh || dupInFile);
                    const skipped = r.include === false;
                    return (
                    <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${skipped ? "bg-muted/30 opacity-70 border border-dashed border-border" : hasWarning ? "bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40" : updateTarget ? "bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-700/40" : "bg-muted/40"}`}>
                      <input
                        type="checkbox"
                        className="mt-2 h-4 w-4 shrink-0 accent-primary"
                        checked={!skipped}
                        onChange={e => updateRow(i, { include: e.target.checked })}
                        aria-label={skipped ? "Include this row" : "Skip this row"}
                        data-testid={`checkbox-preview-include-${i}`}
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 text-sm font-medium flex-1"
                            value={r.name}
                            onChange={e => updateRow(i, { name: e.target.value })}
                            data-testid={`input-preview-name-${i}`}
                          />
                          {updateTarget && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0" data-testid={`badge-update-${i}`}>
                              UPDATE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Select
                            value={r.category ?? ""}
                            onValueChange={v => updateRow(i, { category: v === "" ? undefined : v as ProductCategory })}
                          >
                            <SelectTrigger
                              className={`h-8 w-36 text-xs ${!r.category ? "border-amber-400 text-amber-700" : ""}`}
                              data-testid={`select-preview-category-${i}`}
                            >
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">— Select category —</SelectItem>
                              {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map(c => (
                                <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`h-8 w-20 text-xs ${r.costEstimated ? "border-dashed text-muted-foreground" : ""}`}
                            placeholder="Cost £"
                            title={r.costEstimated ? "Estimated from category — type the real price to replace it" : undefined}
                            value={r.costPrice ?? ""}
                            onChange={e => updateRow(i, { costPrice: e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value)) })}
                            data-testid={`input-preview-cost-${i}`}
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`h-8 w-20 text-xs ${r.sellEstimated ? "border-dashed text-muted-foreground" : ""}`}
                            placeholder="Sell £"
                            title={r.sellEstimated ? "Estimated from category — type the real price to replace it" : undefined}
                            value={r.sellPrice ?? ""}
                            onChange={e => updateRow(i, { sellPrice: e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value)) })}
                            data-testid={`input-preview-sell-${i}`}
                          />
                          {(r.costEstimated || r.sellEstimated) && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground" data-testid={`badge-price-estimated-${i}`}>
                              est. price
                            </span>
                          )}
                          <span className="text-muted-foreground text-xs">{r.category ? (CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category) : "—"} · {r.size_ml ?? "—"}ml</span>
                          {(r.countingMethod === "weigh" || r.countingMethod === "tenths" || r.countingMethod === "photo_tap" || !r.countingMethod) && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                r.needsWeighing
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              }`}
                              data-testid={`badge-weigh-status-${i}`}
                            >
                              {r.needsWeighing ? "Needs Weighing" : "Weighed"}
                            </span>
                          )}
                        </div>
                        {r.warn && (
                          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            {r.warn}
                          </div>
                        )}
                        {parHigh && (
                          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs mt-0.5" data-testid={`warning-par-high-${i}`}>
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            Par level {r.parLevel} looks unusually high — double-check before importing
                          </div>
                        )}
                        {dupInFile && (
                          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs mt-0.5" data-testid={`warning-dup-in-file-${i}`}>
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            Duplicate Product_ID in this file — only the first match will be used
                          </div>
                        )}
                        {r.duplicateOf && (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5" data-testid={`warning-duplicate-of-${i}`}>
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            Looks like “{r.duplicateOf}”, already in your library — skipped. Tick the box to add it anyway.
                          </div>
                        )}
                      </div>
                      {hasWarning
                        ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-1" />
                        : updateTarget
                          ? <span className="text-[10px] font-bold text-blue-500 shrink-0 mt-1">UPD</span>
                          : <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-1" />
                      }
                    </div>
                    );
                  })}
                  {rows.length > 20 && (
                    <p className="text-xs text-center text-muted-foreground py-1">...and {rows.length - 20} more</p>
                  )}
                </div>

                {(() => {
                  const ticked = rows.filter(r => r.include !== false);
                  const unticked = rows.length - ticked.length;
                  const estimatedCount = ticked.filter(r => r.costEstimated || r.sellEstimated).length;
                  const uncategorized = ticked.filter(r => !r.category).length;
                  const skuUpdates = ticked.filter(r => {
                    const key = (r.externalId ?? "").trim().toLowerCase();
                    return key && existingSkuMap.has(key);
                  });
                  const toInsertRaw = ticked.filter(r => {
                    const key = (r.externalId ?? "").trim().toLowerCase();
                    return !(key && existingSkuMap.has(key));
                  });
                  const nameSkips = toInsertRaw.filter(r => existingNamesLower.has(r.name.trim().toLowerCase())).length + unticked;
                  const newCount = toInsertRaw.length - (nameSkips - unticked);
                  const parHighCount = ticked.filter(r => r.parLevel != null && r.parLevel > 100).length;
                  const buttonLabel = importing ? "Importing..." : [
                    newCount > 0 ? `Add ${newCount}` : "",
                    skuUpdates.length > 0 ? `Update ${skuUpdates.length}` : "",
                  ].filter(Boolean).join(" + ") || "Nothing to import";
                  return (
                    <>
                      {uncategorized > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 text-center py-1" data-testid="warning-uncategorized">
                          {uncategorized} row{uncategorized === 1 ? "" : "s"} still need{uncategorized === 1 ? "s" : ""} a category selected above before you can import.
                        </p>
                      )}
                      {skuUpdates.length > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 text-center py-1" data-testid="info-sku-updates">
                          {skuUpdates.length} product{skuUpdates.length === 1 ? "" : "s"} matched by Product_ID — pricing and par will be updated, not duplicated.
                        </p>
                      )}
                      {nameSkips > 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1" data-testid="info-duplicates">
                          {nameSkips} product{nameSkips === 1 ? "" : "s"} already in your library — will be skipped.
                        </p>
                      )}
                      {estimatedCount > 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1" data-testid="info-estimated-prices">
                          {estimatedCount} row{estimatedCount === 1 ? "" : "s"} had no price, so a typical UK trade price has been filled in and marked “est.” — correct the ones that matter after importing.
                        </p>
                      )}
                      {parHighCount > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 text-center py-1" data-testid="warning-par-high-summary">
                          {parHighCount} row{parHighCount === 1 ? "" : "s"} with par level &gt; 100 — check highlighted rows before importing.
                        </p>
                      )}
                      {importBlockError && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm" data-testid="import-block-error">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{importBlockError}</span>
                        </div>
                      )}
                      <Button
                        className="w-full h-14 text-lg font-bold"
                        onClick={handleImport}
                        disabled={importing || uncategorized > 0 || (newCount === 0 && skuUpdates.length === 0)}
                        data-testid="button-confirm-import"
                      >
                        {buttonLabel}
                      </Button>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </SheetContent>
      <PostImportWeighChecklist
        open={showWeighChecklist}
        onClose={() => setShowWeighChecklist(false)}
        products={unweighedProducts}
        venueId={venueId}
      />
    </Sheet>
  );
}

/**
 * Steps through products imported without weights, offering the same full-bottle
 * calibration flow used by the Library "weigh now" screen — shared logic, not a copy.
 */
function PostImportWeighChecklist({ open, onClose, products, venueId }: {
  open: boolean;
  onClose: () => void;
  products: ImportedProductSummary[];
  venueId: string;
}) {
  const [index, setIndex] = useState(0);
  const [weightStr, setWeightStr] = useState("0");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const calibrateFullBottle = useCalibrateFullBottle();

  React.useEffect(() => {
    if (open) {
      setIndex(0);
      setWeightStr("0");
    }
  }, [open]);

  const current = products[index];
  const weightG = parseFloat(weightStr) || 0;

  const advance = () => {
    if (index + 1 < products.length) {
      setIndex(index + 1);
      setWeightStr("0");
    } else {
      onClose();
    }
  };

  const handleSkip = () => advance();

  const handleSave = async () => {
    if (!current || weightG <= 0) return;
    setLoading(true);
    try {
      await calibrateFullBottle.mutateAsync({
        product: current,
        venueId,
        userId: user!.id,
        weightG,
      });
      toast({ title: "Weight tracking set up", description: `${current.name}: full weight saved` });
      advance();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!current) return null;

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>{current.name}</SheetTitle>
          <p className="text-xs text-muted-foreground bg-accent rounded p-2">
            Product {index + 1} of {products.length} · Weigh a full, unopened bottle now — it'll be saved as this product's full weight for future stocktakes.
          </p>
        </SheetHeader>

        <NumberPad value={weightStr} onChange={setWeightStr} label="Full bottle weight in grams" allowDecimal />

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1 h-14" onClick={handleSkip} disabled={loading} data-testid="button-skip-weigh">
            Skip
          </Button>
          <Button className="flex-1 h-14 text-lg font-bold" onClick={handleSave} disabled={loading || weightG <= 0} data-testid="button-save-weigh">
            {loading ? "Saving..." : "Save & Next"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── V21 Cost Price Importer ─────────────────────────────────────────────────

/**
 * Normalise a V21 product name for fuzzy matching:
 *   - Strip Marston's V21 category prefixes: PPL PPC PPA PPS
 *   - Strip trailing size tokens: 70cl, 330ml, 9G Cask, 1Ltr, etc.
 *   - Lower-case, remove punctuation, collapse whitespace
 */
function normalizeV21Name(name: string): string {
  return name
    .trim()
    .replace(/^(PPL|PPC|PPA|PPS)\s+/i, "")
    .replace(/\s+\d+(\.\d+)?\s*(cl|ml|ltr|l|g\s*cask|pint|pt|litre)s?\s*$/i, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface V21Row {
  rawName: string;
  supplierCode: string;
  newCost: number;
  product: any;
  matchScore: number;
  codeMatch: boolean;
}

function parseV21Text(
  text: string,
  existingProducts: any[]
): { matched: V21Row[]; unmatched: string[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { matched: [], unmatched: [] };

  // Detect separator: tabs or 2+ spaces
  const useTabs = lines[0].includes("\t");
  const splitLine = (l: string) =>
    useTabs ? l.split("\t").map(p => p.trim()) : l.split(/\s{2,}/).map(p => p.trim());

  // Skip header row if present
  const firstParts = splitLine(lines[0]).map(p => p.toLowerCase());
  const dataStart =
    firstParts.some(p => p === "category" || p.includes("product name") || p.includes("cost price"))
      ? 1
      : 0;

  const matched: V21Row[] = [];
  const unmatched: string[] = [];
  const seenProductIds = new Set<string>();

  for (let i = dataStart; i < lines.length; i++) {
    const parts = splitLine(lines[i]);
    // V21 columns: [0]=Category [1]=Code [2]=SupplierProductCode [3]=ProductName [4]=CaseSize [5]=CostPrice
    if (parts.length < 6) continue;

    const supplierCode = parts[2] ?? "";
    const rawName = parts[3] ?? "";
    const costStr = (parts[5] ?? "").replace(/[£,]/g, "");
    if (!rawName) continue;

    const newCost = parseFloat(costStr);
    if (!isFinite(newCost) || newCost <= 0) continue;

    // 1. Match by stored v21_code (exact, zero ambiguity)
    let product: any = null;
    let matchScore = 0;
    let codeMatch = false;

    if (supplierCode) {
      product = existingProducts.find(p => (p as any).v21_code === supplierCode);
      if (product) { matchScore = 100; codeMatch = true; }
    }

    // 2. Fuzzy name match fallback
    if (!product) {
      const normalised = normalizeV21Name(rawName);
      let best: { product: any; score: number } | null = null;
      for (const p of existingProducts) {
        const score = scoreNameMatch(normalised, p.name);
        if (score >= 35 && (!best || score > best.score)) best = { product: p, score };
      }
      if (best) { product = best.product; matchScore = best.score; }
    }

    if (product && !seenProductIds.has(product.id)) {
      seenProductIds.add(product.id);
      matched.push({ rawName, supplierCode, newCost, product, matchScore, codeMatch });
    } else if (!product) {
      unmatched.push(rawName);
    }
  }

  return { matched, unmatched };
}

function V21ImportCostPricesSheet({
  open,
  onClose,
  venueId,
  products,
}: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  products: any[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [step, setStep] = useState<"paste" | "confirm">("paste");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) { setRawText(""); setStep("paste"); }
  }, [open]);

  const { matched, unmatched } = useMemo(
    () => (rawText.trim() ? parseV21Text(rawText, products) : { matched: [], unmatched: [] }),
    [rawText, products]
  );

  const confidenceBadge = (score: number, isCm: boolean) => {
    if (isCm)       return { label: "Code match", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
    if (score >= 80) return { label: "High",       cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
    if (score >= 60) return { label: "Medium",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
    return               { label: "Low",           cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  };

  const handleConfirm = async () => {
    setSaving(true);
    let updated = 0;
    try {
      for (const row of matched) {
        const { error } = await supabase
          .from("products")
          .update({ cost_price: row.newCost })
          .eq("id", row.product.id);
        if (error) throw error;
        updated++;
        // Best-effort: store supplier code for faster future matching.
        // Silent no-op if v21_code column not yet created.
        if (row.supplierCode) {
          await supabase
            .from("products")
            .update({ v21_code: row.supplierCode } as any)
            .eq("id", row.product.id)
            .then(() => {});
        }
      }
      queryClient.invalidateQueries({ queryKey: ["products", venueId] });
      toast({ title: `${updated} cost price${updated === 1 ? "" : "s"} updated` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error updating costs", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Import cost prices from V21</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-32">
          {step === "paste" && (
            <>
              <p className="text-sm text-muted-foreground">
                Copy rows from Marston's V21 Store Management ordering screen and paste below.
                Tab-separated or 2+ space-separated. Columns expected: Category · Code · Supplier
                Product Code · Product Name · Case Size · Cost Price · …
              </p>
              <textarea
                className="w-full h-44 rounded-lg border border-border bg-muted/30 p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={"Spirits\t1234\tPPL12345\tPPL Absolut Vodka 70cl\t6\t16.74\tY\t0\t2\t100.44"}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                data-testid="textarea-v21-paste"
              />
              {rawText.trim().length > 0 && matched.length === 0 && unmatched.length === 0 && (
                <p className="text-sm text-amber-600">
                  No valid rows detected. Columns must be tab-separated or separated by 2 or more spaces.
                </p>
              )}
            </>
          )}

          {step === "confirm" && (
            <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-4">
              <p className="font-semibold text-sm">
                About to write {matched.length} cost price{matched.length !== 1 ? "s" : ""} to the database
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This cannot be undone from this screen. Verify the preview below before confirming.
              </p>
            </div>
          )}

          {matched.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {matched.length} matched product{matched.length !== 1 ? "s" : ""}
              </h3>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-xs min-w-[420px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-semibold">Product</th>
                      <th className="text-right p-2 font-semibold">Current</th>
                      <th className="text-right p-2 font-semibold">New</th>
                      <th className="text-right p-2 font-semibold">Change</th>
                      <th className="text-right p-2 font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((row, i) => {
                      const diff = row.newCost - (row.product.cost_price ?? 0);
                      const { label, cls } = confidenceBadge(row.matchScore, row.codeMatch);
                      return (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 font-medium max-w-[140px] truncate" title={row.product.name}>
                            {row.product.name}
                          </td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">
                            {row.product.cost_price != null ? formatGBP(row.product.cost_price) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums font-semibold">
                            {formatGBP(row.newCost)}
                          </td>
                          <td className={`p-2 text-right tabular-nums font-semibold ${diff > 0.001 ? "text-[#E5544B]" : diff < -0.001 ? "text-[#3FAE74]" : "text-muted-foreground"}`}>
                            {Math.abs(diff) < 0.001 ? "—" : `${diff > 0 ? "+" : ""}${formatGBP(diff)}`}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
                              {label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-600">
                {unmatched.length} unmatched row{unmatched.length !== 1 ? "s" : ""} — not imported
              </h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3 space-y-1 max-h-40 overflow-y-auto">
                {unmatched.map((name, idx) => (
                  <p key={idx} className="text-xs text-amber-800 dark:text-amber-300 font-mono truncate">{name}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        {step === "paste" && matched.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
            <Button
              className="w-full h-14 text-base font-bold"
              onClick={() => setStep("confirm")}
              data-testid="button-v21-review"
            >
              Update {matched.length} cost price{matched.length !== 1 ? "s" : ""} →
            </Button>
          </div>
        )}

        {step === "confirm" && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep("paste")} disabled={saving}>
              Back
            </Button>
            <Button
              className="flex-1 h-14 text-base font-bold"
              onClick={handleConfirm}
              disabled={saving}
              data-testid="button-v21-confirm"
            >
              {saving ? "Saving..." : `Confirm ${matched.length} update${matched.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BulkPriceEditorSheet({ open, onClose, venueId, products: allProducts, mode = "all" }: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  products: any[];
  /** "prices": only lines on an estimated price, dearest first ("Correct your prices"). */
  mode?: "all" | "prices";
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { cost: string; sell: string; par: string; category: ProductCategory; countingMethod: CountingMethod; vendor: string }>>({});
  const [saving, setSaving] = useState(false);
  const products = useMemo(
    () =>
      mode !== "prices"
        ? allProducts
        : allProducts
            .filter((p: any) => p.cost_price_estimated || p.pour_price_estimated)
            .slice()
            .sort((a: any, b: any) => (b.cost_price ?? 0) - (a.cost_price ?? 0)),
    [allProducts, mode],
  );

  React.useEffect(() => {
    if (open) {
      const initial: Record<string, { cost: string; sell: string; par: string; category: ProductCategory; countingMethod: CountingMethod; vendor: string }> = {};
      for (const p of products) {
        const category: ProductCategory = (p.category ?? "spirits") as ProductCategory;
        const countingMethod: CountingMethod = (p.counting_method ?? CATEGORY_METHODS[category].default) as CountingMethod;
        initial[p.id] = {
          cost: p.cost_price != null ? String(p.cost_price) : "",
          sell: p.pour_price != null ? String(p.pour_price) : "",
          par: p.par_level != null ? String(p.par_level) : "",
          category,
          countingMethod,
          vendor: p.vendor ?? "",
        };
      }
      setEdits(initial);
    }
  }, [open, products]);

  const setRowCategory = (id: string, category: ProductCategory) => {
    setEdits(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        category,
        countingMethod: CATEGORY_METHODS[category].methods.includes(prev[id]?.countingMethod)
          ? prev[id].countingMethod
          : CATEGORY_METHODS[category].default,
      },
    }));
  };

  const gpFor = (p: any) => {
    const e = edits[p.id];
    const cost = parseFloat(e?.cost ?? "");
    const sell = parseFloat(e?.sell ?? "");
    if (!isFinite(cost) || !isFinite(sell) || sell <= 0) return null;
    return gpPercentForProduct(
      {
        unit: p.unit,
        counting_method: e?.countingMethod ?? p.counting_method,
        cost_price: cost,
        pour_price: sell,
        size_ml: p.size_ml,
        container_l: p.container_l,
        pack_size: p.pack_size,
        measure_ml: p.measure_ml,
      },
      25,
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(edits)
        .map(([id, v]) => {
          const product = products.find(p => p.id === id);
          if (!product) return null;
          const cost = v.cost === "" ? null : parseFloat(v.cost);
          const sell = v.sell === "" ? null : parseFloat(v.sell);
          const par = v.par === "" ? null : parseFloat(v.par);
          const vendor = v.vendor.trim() === "" ? null : v.vendor.trim();
          const costChanged = cost !== (product.cost_price ?? null);
          const sellChanged = sell !== (product.pour_price ?? null);
          const changed =
            costChanged ||
            sellChanged ||
            par !== (product.par_level ?? null) ||
            v.category !== (product.category ?? "spirits") ||
            v.countingMethod !== (product.counting_method ?? CATEGORY_METHODS[v.category].default) ||
            vendor !== (product.vendor ?? null);
          return changed
            ? {
                id, cost_price: cost, pour_price: sell, par_level: par, category: v.category, counting_method: v.countingMethod, vendor,
                // A price typed by the landlord is no longer an estimate.
                cost_price_estimated: costChanged ? false : !!(product as any).cost_price_estimated,
                pour_price_estimated: sellChanged ? false : !!(product as any).pour_price_estimated,
              }
            : null;
        })
        .filter((u): u is { id: string; cost_price: number | null; pour_price: number | null; par_level: number | null; category: ProductCategory; counting_method: CountingMethod; vendor: string | null; cost_price_estimated: boolean; pour_price_estimated: boolean } => !!u);

      for (const u of updates) {
        const { error } = await supabase
          .from("products")
          .update({
            cost_price: u.cost_price,
            pour_price: u.pour_price,
            par_level: u.par_level,
            category: u.category,
            counting_method: u.counting_method,
            unit: u.counting_method === "weigh" || u.counting_method === "tenths" || u.counting_method === "photo_tap" ? "weigh" : "count",
            vendor: u.vendor,
            cost_price_estimated: u.cost_price_estimated,
            pour_price_estimated: u.pour_price_estimated,
          })
          .eq("id", u.id);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["products", venueId] });
      toast({ title: `${updates.length} product${updates.length === 1 ? "" : "s"} updated` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>{mode === "prices" ? "Correct your prices" : "Bulk Editor"}</SheetTitle>
          {mode === "prices" && (
            <p className="text-sm text-muted-foreground">
              {products.length} product{products.length === 1 ? " is" : "s are"} on a typical UK trade price, dearest first. Overwrite the ones you know; leave the rest for now.
            </p>
          )}
        </SheetHeader>

        <div className="space-y-3 pb-24">
          {products.map(p => {
            const gp = gpFor(p);
            const e = edits[p.id];
            if (!e) return null;
            const costIsEstimate = !!p.cost_price_estimated && e.cost === (p.cost_price != null ? String(p.cost_price) : "");
            const sellIsEstimate = !!p.pour_price_estimated && e.sell === (p.pour_price != null ? String(p.pour_price) : "");
            return (
              <div key={p.id} className="bg-card border border-border rounded-lg p-3 space-y-2" data-testid={`row-price-${p.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {p.name}
                    {(costIsEstimate || sellIsEstimate) && (
                      <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-dashed border-border align-middle">est.</span>
                    )}
                  </span>
                  <span className={`text-sm font-bold shrink-0 ${gp === null ? "text-muted-foreground" : gp < 50 ? "text-red-500" : "text-green-500"}`}>
                    {gp === null ? "GP —" : `GP ${gp.toFixed(0)}%`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select value={e.category} onValueChange={v => setRowCategory(p.id, v as ProductCategory)}>
                      <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`select-category-${p.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map(c => (
                          <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Counting method</Label>
                    <Select value={e.countingMethod} onValueChange={v => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], countingMethod: v as CountingMethod } }))}>
                      <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`select-counting-method-${p.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_METHODS[e.category].methods.map(m => (
                          <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Cost £{costIsEstimate ? " (est.)" : ""}</Label>
                    <Input
                      type="number"
                      className={`mt-1 h-9 text-sm ${costIsEstimate ? "border-dashed text-muted-foreground" : ""}`}
                      value={e.cost}
                      onChange={ev => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], cost: ev.target.value } }))}
                      data-testid={`input-cost-${p.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Sell £{sellIsEstimate ? " (est.)" : ""}</Label>
                    <Input
                      type="number"
                      className={`mt-1 h-9 text-sm ${sellIsEstimate ? "border-dashed text-muted-foreground" : ""}`}
                      value={e.sell}
                      onChange={ev => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], sell: ev.target.value } }))}
                      data-testid={`input-sell-${p.id}`}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Vendor</Label>
                  <Input
                    type="text"
                    className="mt-1 h-9 text-sm"
                    value={e.vendor}
                    placeholder="—"
                    onChange={ev => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], vendor: ev.target.value } }))}
                    data-testid={`input-vendor-${p.id}`}
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Par level</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    className="mt-1 h-9 text-sm tabular-nums"
                    value={e.par}
                    placeholder="—"
                    onChange={ev => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], par: ev.target.value } }))}
                    data-testid={`input-par-${p.id}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
          <Button className="w-full h-14 text-lg font-bold" onClick={handleSaveAll} disabled={saving} data-testid="button-save-prices">
            {saving ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DeliveryEntrySheet({ open, onClose, venueId, products }: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  products: any[];
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const qty = parseFloat(quantity);
    if (!productId || !isFinite(qty) || qty <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("deliveries").insert({
        venue_id: venueId,
        product_id: productId,
        entry_method: "invoice",
        quantity: qty,
        unit_cost: parseFloat(unitCost) || null,
        invoice_ref: invoiceRef.trim() || null,
        user_id: user?.id ?? null,
      });
      if (error) throw error;

      const product = products.find(p => p.id === productId);
      if (product && user?.id) {
        await supabase.from("readings").insert({
          venue_id: venueId,
          product_id: productId,
          location_id: product.location_id,
          method: product.unit as "weigh" | "count",
          ml_remaining: 0,
          full_containers: qty,
          is_delivery: true,
          user_id: user.id,
          reading_at: new Date().toISOString(),
        });
      }

      queryClient.invalidateQueries({ queryKey: ["latest-readings", venueId] });
      toast({ title: "Delivery logged", description: `${qty} units received` });
      setProductId(""); setQuantity(""); setUnitCost(""); setInvoiceRef("");
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Log Delivery</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div>
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="mt-1" data-testid="select-delivery-product"><SelectValue placeholder="Choose product" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="d-qty">Quantity received</Label>
            <Input id="d-qty" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="mt-1" placeholder="e.g. 24" />
          </div>
          <div>
            <Label htmlFor="d-cost">Unit cost £ (optional)</Label>
            <Input id="d-cost" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="d-invoice">Invoice ref (optional)</Label>
            <Input id="d-invoice" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} className="mt-1" />
          </div>
          <Button className="w-full h-14 text-lg font-bold" onClick={handleSave} disabled={saving || !productId || !quantity} data-testid="button-save-delivery">
            {saving ? "Saving..." : "Log Delivery"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── BULK KEG CAPACITY EDITOR ────────────────────────────────────────────────

const KEG_QUICK_SIZES = [
  { label: "30L", value: 30 },
  { label: "50L", value: 50 },
  { label: "9 gal (40.9L)", value: 40.9 },
  { label: "18 gal (81.8L)", value: 81.8 },
  { label: "4.5 gal (20.5L)", value: 20.5 },
];

interface ProductFieldRepairSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  field: "container_l" | "dip_full_mm";
  unit: string;
  placeholder: string;
  quickSizes?: Array<{ label: string; value: number }>;
  /** Per-product preset chips (e.g. keg vs cask sizes based on the line's category). */
  presetsFor?: (p: RepairableProduct) => Array<{ label: string; value: number }>;
  products: RepairableProduct[];
  venueId: string;
}

type RepairableProduct = {
  id: string;
  name: string;
  category?: string | null;
  counting_method?: string | null;
  container_type?: string | null;
  container_l?: number | null;
  dip_full_mm?: number | null;
  cost_price?: number | null;
  pour_price?: number | null;
};

function ProductFieldRepairSheet({
  open, onClose, title, description, field, unit, placeholder, quickSizes, presetsFor, products, venueId,
}: ProductFieldRepairSheetProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      for (const p of products) {
        const existing = (p as any)[field];
        initial[p.id] = existing != null ? String(existing) : "";
      }
      setValues(initial);
    }
  }, [open, products, field]);

  const applyToAll = (v: number) => {
    const next: Record<string, string> = {};
    for (const p of products) next[p.id] = String(v);
    setValues(next);
  };

  const setOne = (id: string, val: string) =>
    setValues(prev => ({ ...prev, [id]: val }));

  const handleSave = async () => {
    const toUpdate = products
      .map(p => ({ id: p.id, val: parseFloat(values[p.id] ?? "") }))
      .filter(r => !isNaN(r.val) && r.val > 0);

    if (toUpdate.length === 0) {
      toast({ title: "Nothing to save", description: `Enter a value for at least one product.` });
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        toUpdate.map(({ id, val }) => {
          const patch: Record<string, unknown> = { [field]: val };
          const product = products.find(p => p.id === id);
          // Setting a container size implies a container type if none is set yet.
          if (field === "container_l" && product && !product.container_type && presetsFor) {
            patch.container_type =
              product.counting_method === "dipstick" ? "cask"
              : product.counting_method === "keg_weight" ? "keg"
              : product.category === "draught_ale" ? "cask"
              : "keg";
          }
          // A container size is enough to estimate a keg/cask cost (flagged est.).
          if (field === "container_l" && product && product.cost_price == null) {
            const est = estimateDefaultPrices({
              name: product.name,
              category: product.category as any,
              countingMethod: product.counting_method as any,
              containerL: val,
            });
            if (est.cost != null) { patch.cost_price = est.cost; patch.cost_price_estimated = true; }
            if (product.pour_price == null && est.pour != null) { patch.pour_price = est.pour; patch.pour_price_estimated = true; }
          }
          return supabase.from("products").update(patch as any).eq("id", id);
        })
      );
      queryClient.invalidateQueries({ queryKey: ["products", venueId] });
      toast({ title: `${toUpdate.length} product${toUpdate.length === 1 ? "" : "s"} updated` });
      onClose();
    } catch (err: any) {
      toast({ title: "Save error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setCount = Object.values(values).filter(v => parseFloat(v) > 0).length;

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] flex flex-col">
        <SheetHeader className="mb-3 shrink-0">
          <SheetTitle>{title}</SheetTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </SheetHeader>

        {quickSizes && quickSizes.length > 0 && (
          <div className="shrink-0 mb-3">
            <p className="text-xs text-muted-foreground mb-2">Apply to all:</p>
            <div className="flex flex-wrap gap-2">
              {quickSizes.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => applyToAll(s.value)}
                  className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0 space-y-2 pr-1">
          {products.map(p => {
            const presets = presetsFor?.(p) ?? [];
            const current = parseFloat(values[p.id] ?? "");
            return (
              <div key={p.id} className="space-y-1 py-1 border-b border-border/60 last:border-0" data-testid={`repair-row-${p.id}`}>
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm truncate">{p.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      className="w-24 h-9 text-right tabular-nums"
                      placeholder={placeholder}
                      value={values[p.id] ?? ""}
                      onChange={e => setOne(p.id, e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground w-8">{unit}</span>
                  </div>
                </div>
                {presets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map(preset => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setOne(p.id, String(preset.value))}
                        className={`text-xs px-2.5 py-1 rounded-md border ${Math.abs(current - preset.value) < 0.05 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
                        data-testid={`repair-preset-${p.id}-${preset.value}`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 pt-3 border-t border-border mt-3">
          <Button
            className="w-full h-12 font-bold text-base"
            onClick={handleSave}
            disabled={saving || setCount === 0}
          >
            {saving ? "Saving..." : `Save ${setCount > 0 ? setCount : ""} product${setCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BottleShapeSheet — pick or create a bottle shape for a product

const CALIBRATION_LEVELS = [
  { label: "Empty (0%)", fill: 0 },
  { label: "Quarter (25%)", fill: 0.25 },
  { label: "Half (50%)", fill: 0.5 },
  { label: "Three-quarters (75%)", fill: 0.75 },
  { label: "Full (100%)", fill: 1.0 },
];

function BottleShapeSheet({ open, onClose, product, venueId }: {
  open: boolean;
  onClose: () => void;
  product: any;
  venueId: string;
}) {
  const { data: shapes = [] } = useBottleShapes(venueId);
  const upsertShape = useUpsertBottleShape();
  const attachShape = useAttachShapeToProduct();
  const { toast } = useToast();

  type UIStep = "pick" | "create" | "calibrate";
  const [step, setStep] = useState<UIStep>("pick");
  const [shapeName, setShapeName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<Array<{ y: number; fill: number }>>([]);
  const [calibStep, setCalibStep] = useState(0); // which fill level we're on
  const [pendingY, setPendingY] = useState(""); // controlled value for manual Y entry
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setStep("pick"); setShapeName(""); setPhotoUrl(null); setPhotoFile(null);
      setCalibrationPoints([]); setCalibStep(0); setPendingY(""); setUploading(false); setSaving(false);
    }
  }, [open]);

  const commitPendingY = () => {
    const v = parseFloat(pendingY);
    if (isNaN(v) || v < 0 || v > 1) return;
    const fill = CALIBRATION_LEVELS[calibStep].fill;
    setCalibrationPoints(prev =>
      [...prev.filter(p => p.fill !== fill), { y: v, fill }].sort((a, b) => a.y - b.y)
    );
    setCalibStep(s => Math.min(s + 1, CALIBRATION_LEVELS.length));
    setPendingY("");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
  };

  const handlePhotoTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (calibStep >= CALIBRATION_LEVELS.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const y = Math.max(0, Math.min(1, 1 - (clickY / rect.height))); // 0=bottom, 1=top
    const fill = CALIBRATION_LEVELS[calibStep].fill;
    const next = [...calibrationPoints.filter(p => p.fill !== fill), { y, fill }]
      .sort((a, b) => a.y - b.y);
    setCalibrationPoints(next);
    setCalibStep(s => Math.min(s + 1, CALIBRATION_LEVELS.length));
  };

  const handleSaveShape = async () => {
    if (!shapeName.trim()) { toast({ title: "Enter a name for this shape", variant: "destructive" }); return; }
    if (calibrationPoints.length < 2) { toast({ title: "Mark at least 2 calibration points first", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let finalPhotoUrl: string | null = null;
      if (photoFile) {
        setUploading(true);
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${venueId}/${Date.now()}.${ext}`;
        const { data: up, error: upErr } = await supabase.storage.from("bottle-photos").upload(path, photoFile);
        setUploading(false);
        if (upErr) throw upErr;
        finalPhotoUrl = supabase.storage.from("bottle-photos").getPublicUrl(up!.path).data.publicUrl;
      }
      const shape = await upsertShape.mutateAsync({ venue_id: venueId, name: shapeName.trim(), photo_url: finalPhotoUrl, fill_curve: calibrationPoints });
      await attachShape.mutateAsync({ productId: product.id, shapeId: shape.id, venueId });
      toast({ title: "Bottle shape saved", description: `${shape.name} attached to ${product.name}` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error saving shape", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePickShape = async (shapeId: string | null) => {
    try {
      await attachShape.mutateAsync({ productId: product.id, shapeId, venueId });
      toast({ title: shapeId ? "Shape attached" : "Shape removed" });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] flex flex-col">
        <SheetHeader className="mb-3 shrink-0">
          <SheetTitle>
            {step === "pick" ? "Bottle shape" : step === "create" ? "New bottle shape" : "Calibrate shape"}
          </SheetTitle>
          {step === "pick" && (
            <p className="text-sm text-muted-foreground">
              Pick an existing shape or calibrate a new one. The shape lets you tap the liquid line in a photo instead of guessing tenths.
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-auto min-h-0 space-y-3 pr-1">
          {step === "pick" && (
            <>
              {shapes.length > 0 && shapes.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handlePickShape(s.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    (product as any).bottle_shape_id === s.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {s.photo_url && (
                    <img src={s.photo_url} alt={s.name} className="w-10 h-14 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.fill_curve.length} calibration points</div>
                  </div>
                  {(product as any).bottle_shape_id === s.id && (
                    <span className="text-xs font-semibold text-primary shrink-0">Current</span>
                  )}
                </button>
              ))}
              {(product as any).bottle_shape_id && (
                <button
                  type="button"
                  onClick={() => handlePickShape(null)}
                  className="w-full p-3 rounded-xl border border-border text-sm text-muted-foreground text-left hover:border-destructive/50 hover:text-destructive transition-colors"
                >
                  Remove shape from this product
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep("create")}
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Calibrate a new shape
              </button>
            </>
          )}

          {step === "create" && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-1 block">Shape name</Label>
                <Input placeholder="e.g. Standard 700ml spirit" value={shapeName} onChange={e => setShapeName(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">Photo (optional but recommended)</Label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                  {photoUrl ? "Change photo" : "Upload photo"}
                </Button>
                {photoUrl && (
                  <img src={photoUrl} alt="preview" className="mt-2 w-32 mx-auto object-cover rounded-xl border border-border" />
                )}
              </div>
              <Button className="w-full h-12 font-bold" onClick={() => setStep("calibrate")} disabled={!shapeName.trim()}>
                Next: Calibrate
              </Button>
            </div>
          )}

          {step === "calibrate" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-accent p-3 text-sm text-muted-foreground">
                {calibStep < CALIBRATION_LEVELS.length
                  ? <>Tap the photo where the liquid line sits at <strong className="text-primary">{CALIBRATION_LEVELS[calibStep].label}</strong></>
                  : <span className="text-[#3FAE74] font-medium">All points marked. Save the shape below.</span>}
              </div>

              {photoUrl ? (
                <div
                  className="relative select-none rounded-xl overflow-hidden border border-border cursor-crosshair"
                  style={{ maxHeight: 380 }}
                  onClick={handlePhotoTap}
                >
                  <img src={photoUrl} alt="calibration" className="w-full object-contain" />
                  {calibrationPoints.map((pt) => (
                    <div
                      key={pt.fill}
                      className="absolute left-0 right-0 flex items-center pointer-events-none"
                      style={{ top: `${(1 - pt.y) * 100}%`, transform: "translateY(-50%)" }}
                    >
                      <div className="w-full h-px bg-[#E0A343]" />
                      <span className="absolute right-1 text-[10px] font-bold text-[#E0A343] bg-card px-1 rounded">
                        {Math.round(pt.fill * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
                  No photo uploaded — you can still calibrate by tapping below and entering the fill level manually, or go back and upload a photo.
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {CALIBRATION_LEVELS.map((lvl, i) => (
                  <button
                    key={lvl.fill}
                    type="button"
                    onClick={() => setCalibStep(i)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      calibrationPoints.some(p => p.fill === lvl.fill)
                        ? "border-[#3FAE74] text-[#3FAE74] bg-[#3FAE74]/10"
                        : i === calibStep
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>

              {calibStep < CALIBRATION_LEVELS.length && !photoUrl && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Enter the Y value (0 = bottom/empty, 1 = top/full) then tap Set point.
                  </p>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number" min={0} max={1} step={0.01}
                      placeholder="0.00"
                      className="w-28 text-right tabular-nums"
                      value={pendingY}
                      onChange={e => setPendingY(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitPendingY(); } }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={(() => { const v = parseFloat(pendingY); return isNaN(v) || v < 0 || v > 1; })()}
                      onClick={commitPendingY}
                    >
                      Set point
                    </Button>
                  </div>
                </div>
              )}

              <Button
                className="w-full h-12 font-bold"
                onClick={handleSaveShape}
                disabled={saving || uploading || calibrationPoints.length < 2}
              >
                {saving || uploading ? "Saving..." : "Save shape"}
              </Button>
            </div>
          )}
        </div>

        {step !== "pick" && (
          <div className="shrink-0 pt-3 border-t border-border mt-2">
            <Button variant="ghost" className="w-full" onClick={() => setStep(step === "calibrate" ? "create" : "pick")}>
              Back
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── INDIVIDUAL PRODUCT EDIT SHEET ───────────────────────────────────────────

const CONTAINER_PRESETS: Record<string, Array<{ label: string; value: number }>> = {
  keg: [
    { label: "20L", value: 20 },
    { label: "30L", value: 30 },
    { label: "50L (11 gal)", value: 50 },
    { label: "100L (22 gal)", value: 100 },
  ],
  cask: [
    { label: "Pin 4.5 gal (20.5L)", value: 20.5 },
    { label: "Firkin 9 gal (40.9L)", value: 40.9 },
    { label: "Kilderkin 18 gal (81.8L)", value: 81.8 },
    { label: "Barrel 36 gal (163.7L)", value: 163.7 },
    { label: "Hogshead 54 gal (245.5L)", value: 245.5 },
  ],
  bag_in_box: [
    { label: "10L", value: 10 },
    { label: "18L", value: 18 },
    { label: "20L", value: 20 },
  ],
};

/** Keg/cask/bag-in-box size: one-tap presets plus a free "Other size" box. */
function ContainerSizeField({ id, containerType, value, onChange }: {
  id: string;
  containerType: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const presets = CONTAINER_PRESETS[containerType] ?? CONTAINER_PRESETS.keg;
  const current = parseFloat(value);
  return (
    <div>
      <Label htmlFor={id}>Size</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {presets.map(preset => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(String(preset.value))}
            className={`text-xs px-2.5 py-1.5 rounded-md border ${Math.abs(current - preset.value) < 0.05 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
            data-testid={`preset-container-${preset.value}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input id={id} type="number" step="0.1" value={value} onChange={e => onChange(e.target.value)} className="h-9" placeholder="Other size" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">litres</span>
      </div>
    </div>
  );
}

function EditProductSheet({ open, onClose, product, venueId }: {
  open: boolean;
  onClose: () => void;
  product: any;
  venueId: string;
}) {
  const { toast } = useToast();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [sku, setSku] = useState("");
  const [notes, setNotes] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [pourPrice, setPourPrice] = useState("");
  const [parLevel, setParLevel] = useState("");
  const [barcode, setBarcode] = useState("");
  const [containerL, setContainerL] = useState("");
  const [containerType, setContainerType] = useState("keg");
  const isDraughtLine = !!product && (isDraughtCategory(product.category) || ["keg_weight", "dipstick", "tenths_pints"].includes(product.counting_method));

  React.useEffect(() => {
    if (open && product) {
      setContainerL(product.container_l != null ? String(product.container_l) : "");
      setContainerType(
        product.container_type ||
          (product.counting_method === "dipstick" ? "cask"
            : product.counting_method === "keg_weight" ? "keg"
            : product.category === "draught_ale" ? "cask"
            : "keg"),
      );
      setName(product.name ?? "");
      setVendor(product.vendor ?? "");
      setSku(product.sku ?? "");
      setNotes(product.notes ?? "");
      setCostPrice(product.cost_price != null ? String(product.cost_price) : "");
      setPourPrice(product.pour_price != null ? String(product.pour_price) : "");
      setParLevel(product.par_level != null ? String(product.par_level) : "");
      setBarcode(product.barcode ?? "");
    }
  }, [open, product]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    try {
      const containerLitres = isDraughtLine && containerL !== "" ? parseFloat(containerL) : null;
      let cost = costPrice !== "" ? parseFloat(costPrice) : null;
      let pour = pourPrice !== "" ? parseFloat(pourPrice) : null;
      // Typing a price clears its "estimated" flag; leaving an estimate untouched keeps it.
      const costTouched = cost !== (product.cost_price ?? null) || !product.cost_price_estimated;
      const pourTouched = pour !== (product.pour_price ?? null) || !product.pour_price_estimated;
      let costEstimated = cost != null && !costTouched;
      let pourEstimated = pour != null && !pourTouched;
      if (isDraughtLine && cost == null && containerLitres != null) {
        const est = estimateDefaultPrices({
          name: name.trim(),
          category: product.category,
          countingMethod: product.counting_method,
          containerL: containerLitres,
        });
        if (est.cost != null) { cost = est.cost; costEstimated = true; }
        if (pour == null && est.pour != null) { pour = est.pour; pourEstimated = true; }
      }
      await updateProduct.mutateAsync({
        id: product.id,
        venue_id: venueId,
        name: name.trim(),
        vendor: vendor.trim() || null,
        sku: sku.trim() || null,
        notes: notes.trim() || null,
        cost_price: cost,
        pour_price: pour,
        cost_price_estimated: costEstimated,
        pour_price_estimated: pourEstimated,
        par_level: parLevel !== "" ? parseFloat(parLevel) : null,
        barcode: barcode.trim() || null,
        ...(isDraughtLine ? { container_l: containerLitres, container_type: containerType as any } : {}),
      } as any);
      toast({ title: "Product updated" });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProduct.mutateAsync({ id: product.id, venue_id: venueId });
      toast({ title: "Product removed", description: `${product.name} has been deleted from your library.` });
      onClose();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Edit Product</SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="ep-name">Name</Label>
            <Input id="ep-name" value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ep-vendor">Supplier / vendor</Label>
            <Input id="ep-vendor" value={vendor} onChange={e => setVendor(e.target.value)} className="mt-1" placeholder="e.g. Matthew Clark" />
          </div>
          <div>
            <Label htmlFor="ep-sku">SKU / product code</Label>
            <Input id="ep-sku" value={sku} onChange={e => setSku(e.target.value)} className="mt-1" placeholder="e.g. AB700" />
          </div>
          <div>
            <Label htmlFor="ep-notes">Notes</Label>
            <Input id="ep-notes" value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" placeholder="e.g. Check date on delivery" />
          </div>
          {isDraughtLine && (
            <div className="space-y-3">
              <div>
                <Label>Container</Label>
                <Select value={containerType} onValueChange={v => setContainerType(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keg">Keg</SelectItem>
                    <SelectItem value="cask">Cask</SelectItem>
                    <SelectItem value="bag_in_box">Bag-in-box</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ContainerSizeField id="ep-container-l" containerType={containerType} value={containerL} onChange={setContainerL} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ep-cost">Cost price £ <span className="text-muted-foreground text-xs">(ex-VAT{product?.cost_price_estimated ? ", estimated" : ""})</span></Label>
              <Input
                id="ep-cost"
                type="number"
                step="0.01"
                value={costPrice}
                onChange={e => setCostPrice(e.target.value)}
                className={`mt-1 ${product?.cost_price_estimated && costPrice === (product.cost_price != null ? String(product.cost_price) : "") ? "border-dashed text-muted-foreground" : ""}`}
              />
            </div>
            <div>
              <Label htmlFor="ep-pour">Pour price £ <span className="text-muted-foreground text-xs">(ex-VAT{product?.pour_price_estimated ? ", estimated" : ""})</span></Label>
              <Input
                id="ep-pour"
                type="number"
                step="0.01"
                value={pourPrice}
                onChange={e => setPourPrice(e.target.value)}
                className={`mt-1 ${product?.pour_price_estimated && pourPrice === (product.pour_price != null ? String(product.pour_price) : "") ? "border-dashed text-muted-foreground" : ""}`}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="ep-par">Par level</Label>
            <Input id="ep-par" type="number" step="0.5" value={parLevel} onChange={e => setParLevel(e.target.value)} className="mt-1" placeholder="Reorder threshold" />
          </div>
          <div>
            <Label htmlFor="ep-barcode">Barcode</Label>
            <Input id="ep-barcode" value={barcode} onChange={e => setBarcode(e.target.value)} className="mt-1" placeholder="5012345678900" />
          </div>
          <Button
            className="w-full h-14 text-lg font-bold"
            onClick={handleSave}
            disabled={updateProduct.isPending || deleteProduct.isPending}
            data-testid="button-save-edit-product"
          >
            {updateProduct.isPending ? "Saving..." : "Save Changes"}
          </Button>

          <div className="pt-2 border-t border-border">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full h-11 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={updateProduct.isPending || deleteProduct.isPending}
                  data-testid="button-delete-product-trigger"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove from library
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this product?</AlertDialogTitle>
                  <AlertDialogDescription>
                    <strong>{product?.name}</strong> will be permanently deleted from your library. Any historical readings for this product will be unaffected, but the product won't appear in future stocktakes or reports.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-delete-cancel">Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-delete-confirm"
                  >
                    {deleteProduct.isPending ? "Removing..." : "Yes, remove"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Library() {
  const { venue } = useAuth();
  const [, setLocation] = useLocation();
  const { data: products, isLoading } = useProducts(venue?.id);
  const { data: libraryLocations = [] } = useLocations(venue?.id);
  const { data: readingsMap } = useProductReadingsMap(venue?.id);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [correctPricesOpen, setCorrectPricesOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [v21ImportOpen, setV21ImportOpen] = useState(false);
  const [bulkCapacityOpen, setBulkCapacityOpen] = useState(false); // kept for any legacy refs — driven by repairKegOpen now
  const [weighProduct, setWeighProduct] = useState<any>(null);
  const [addPrefill, setAddPrefill] = useState<{ name: string; match: CatalogueEntry | null }>({ name: "", match: null });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPro = venue?.tier === "pro" || venue?.tier === "premium";
  const orderCycleDays = venue?.order_cycle_days ?? 21;

  // "Fill in prices": give every unpriced line a typical UK trade price, flagged est.
  const [fillingPrices, setFillingPrices] = useState(false);
  const handleFillPrices = async () => {
    if (!venue?.id || !products) return;
    setFillingPrices(true);
    try {
      let count = 0;
      for (const p of products) {
        if (p.cost_price != null && p.pour_price != null) continue;
        const est = estimateDefaultPrices({
          name: p.name,
          category: p.category,
          countingMethod: p.counting_method,
          sizeMl: p.size_ml,
          containerL: p.container_l,
          packSize: p.pack_size,
        });
        const patch: Record<string, unknown> = {};
        if (p.cost_price == null && est.cost != null) { patch.cost_price = est.cost; patch.cost_price_estimated = true; }
        if (p.pour_price == null && est.pour != null) { patch.pour_price = est.pour; patch.pour_price_estimated = true; }
        if (Object.keys(patch).length === 0) continue;
        const { error } = await supabase.from("products").update(patch as any).eq("id", p.id);
        if (error) throw error;
        count++;
      }
      queryClient.invalidateQueries({ queryKey: ["products", venue.id] });
      toast({
        title: `${count} product${count === 1 ? "" : "s"} given a typical price`,
        description: "They're marked \u201cest.\u201d in the list. Correct the dear ones first \u2014 kegs and premium spirits.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't fill prices", description: err.message, variant: "destructive" });
    } finally {
      setFillingPrices(false);
    }
  };

  const handleImportStarterLibrary = () => {
    setCatalogueOpen(true);
  };

  // Onboarding deep-links: /library?import=1 opens the CSV sheet, ?starter=1 runs the starter import
  const paramsHandled = React.useRef(false);
  React.useEffect(() => {
    if (paramsHandled.current || !venue?.id || products === undefined) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") === "1") {
      paramsHandled.current = true;
      setImportOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("starter") === "1") {
      paramsHandled.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      handleImportStarterLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id, products]);

  const openAddProduct = (prefillName?: string, prefillMatch?: CatalogueEntry | null) => {
    if (venue?.tier === "free" && (products?.length ?? 0) >= 50) {
      toast({ title: "Free plan — 50 product limit", description: "Upgrade to Pro for unlimited products.", variant: "destructive" });
      return;
    }
    setAddPrefill({ name: prefillName ?? "", match: prefillMatch ?? null });
    setAddOpen(true);
  };

  const searchFiltered = useMemo(() => {
    if (!products) return [];
    const q = search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q));
  }, [products, search]);

  // Live catalogue matching in the search box: surface known-weighed bottles the venue
  // doesn't have yet, or offer to add a brand-new product so a search never dead-ends.
  const searchCatalogueMatch = useMemo(() => {
    if (search.trim().length < 2 || searchFiltered.length > 0) return null;
    return bestCatalogueMatch(search);
  }, [search, searchFiltered.length]);
  const searchHasNoMatchAtAll = search.trim().length >= 2 && searchFiltered.length === 0 && !searchCatalogueMatch;

  /**
   * Returns true when a product has enough calibration data to be tracked
   * accurately — the definition varies by counting_method.
   */
  const isCalibrated = (p: {
    full_weight_g: number | null;
    empty_weight_g: number | null;
    counting_method?: string | null;
    container_l?: number | null;
    dip_full_mm?: number | null;
  }) => {
    const m = p.counting_method;
    if (m === "keg_weight")  return !!p.container_l;
    if (m === "dipstick")    return !!p.dip_full_mm && !!p.container_l;
    // tenths-based and count-based methods need no physical calibration.
    if (m === "tenths_pints" || m === "tenths" || m === "each" || m === "dozen" || m === "litre") return true;
    // weigh (default): requires both weights.
    return p.full_weight_g != null && p.empty_weight_g != null;
  };

  // Keep the old name as an alias so any other call-sites keep working.
  const isWeighed = isCalibrated;

  const needsWeighingCount = useMemo(
    () => searchFiltered.filter(p => !isCalibrated(p)).length,
    [searchFiltered],
  );

  const [unweighedOnly, setUnweighedOnly] = useState(false);
  const filtered = useMemo(() => {
    if (!unweighedOnly) return searchFiltered;
    return searchFiltered.filter(p => !isCalibrated(p));
  }, [searchFiltered, unweighedOnly]);

  // Bypass Dexie entirely — query Supabase directly so that direct SQL changes
  // (container_l set to NULL) are always reflected without a cache wipe.
  // Also filters by category (draught_*) rather than counting_method, so products
  // whose counting_method column is null are still caught.
  const { data: nullCapacityKegs = [] } = useQuery({
    queryKey: ["null-capacity-kegs", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [] as RepairableProduct[];
      const { data } = await supabase
        .from("products")
        .select("id, name, container_l, category, counting_method, container_type, cost_price, pour_price")
        .eq("venue_id", venue.id)
        .is("container_l", null)
        .like("category", "draught_%")
        .order("name");
      return (data ?? []) as RepairableProduct[];
    },
    enabled: !!venue?.id,
    staleTime: 10_000,
  });

  const [repairKegOpen, setRepairKegOpen] = useState(false);
  const [repairDipOpen, setRepairDipOpen] = useState(false);
  const [shapeProduct, setShapeProduct] = useState<any>(null);
  const [editProduct, setEditProduct] = useState<any>(null);

  // Dipstick products missing dip_full_mm
  const { data: missingDipstickDepth = [] } = useQuery({
    queryKey: ["missing-dipstick-depth", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [] as Array<{ id: string; name: string; dip_full_mm: number | null }>;
      const { data } = await supabase
        .from("products")
        .select("id, name, dip_full_mm")
        .eq("venue_id", venue.id)
        .eq("counting_method", "dipstick")
        .is("dip_full_mm", null)
        .order("name");
      return (data ?? []) as Array<{ id: string; name: string; dip_full_mm: number | null }>;
    },
    enabled: !!venue?.id,
    staleTime: 10_000,
  });

  const [groupBy, setGroupBy] = useState<"none" | "location" | "category" | "vendor">("location");
  const GROUP_BY_OPTIONS: { key: typeof groupBy; label: string }[] = [
    { key: "none", label: "All Items" },
    { key: "location", label: "Location" },
    { key: "category", label: "Category" },
    { key: "vendor", label: "Vendor" },
  ];

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const p of filtered) {
      let key: string;
      if (groupBy === "location") key = (p as any).locations?.name ?? "Unassigned";
      else if (groupBy === "category") key = CATEGORY_LABELS[(p.category ?? "spirits") as ProductCategory] ?? "Other";
      else if (groupBy === "vendor") key = (p as any).vendor?.trim() || "No vendor";
      else key = "All Items";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [filtered, groupBy]);

  // ── Data quality flags ─────────────────────────────────────────────────────
  // Same brand + category + size bucket counted in two different method
  // families (weigh vs each, say). Prefix-aware, so "Gordons" and "Gordons
  // Pink" don't collide, and weigh/tenths/photo count as one family.
  const inconsistentMethodIds = useMemo(
    () => (products ? findMethodMismatches(products) : new Set<string>()),
    [products],
  );

  // Stocktaker-style "litre" on packaged bottles that should be counted each.
  const litreOnBottleIds = useMemo(
    () => (products ? new Set(products.filter(p => isLitreOnBottles(p)).map(p => p.id)) : new Set<string>()),
    [products],
  );

  const estimatedPriceIds = useMemo(
    () => (products ? new Set(products.filter(p => p.cost_price_estimated || p.pour_price_estimated).map(p => p.id)) : new Set<string>()),
    [products],
  );

  // Lines with no price at all (kegs with no size can't be priced until sized).
  const unpricedCount = useMemo(
    () =>
      (products ?? []).filter(
        p =>
          !(String(p.category ?? "").startsWith("draught_") && p.container_l == null) &&
          (p.cost_price == null || (p.pour_price == null && p.category !== "minerals")),
      ).length,
    [products],
  );

  // Wines imported at a spirit's 700ml when the name doesn't say so.
  const wrongSizeWines = useMemo(
    () => (products ?? []).filter(p => p.category === "wines" && p.size_ml === 700 && inferSizeMl(p.name, "wines", null) !== 700),
    [products],
  );
  const [fixingWines, setFixingWines] = useState(false);
  const handleFixWineSizes = async () => {
    if (!venue?.id || wrongSizeWines.length === 0) return;
    setFixingWines(true);
    try {
      for (const p of wrongSizeWines) {
        const sizeMl = inferSizeMl(p.name, "wines", null) ?? 750;
        const { error } = await supabase.from("products").update({ size_ml: sizeMl }).eq("id", p.id);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["products", venue.id] });
      toast({
        title: `${wrongSizeWines.length} wine size${wrongSizeWines.length === 1 ? "" : "s"} fixed`,
        description: "75cl unless the name says otherwise (187ml, 200ml).",
      });
    } catch (err: any) {
      toast({ title: "Couldn't fix wine sizes", description: err.message, variant: "destructive" });
    } finally {
      setFixingWines(false);
    }
  };

  // Spirits and wines with no bottle weights: try the shared catalogue first.
  const unweighedBottles = useMemo(
    () => (products ?? []).filter(p => (p.category === "spirits" || p.category === "wines") && (p.full_weight_g == null || p.empty_weight_g == null)),
    [products],
  );
  const [matchingBottles, setMatchingBottles] = useState(false);
  const handleMatchKnownBottles = async () => {
    if (!venue?.id || unweighedBottles.length === 0) return;
    setMatchingBottles(true);
    try {
      const result = await matchKnownBottles(venue.id, unweighedBottles);
      queryClient.invalidateQueries({ queryKey: ["products", venue.id] });
      toast({
        title: result.matched > 0 ? `${result.matched} bottle${result.matched === 1 ? "" : "s"} given known weights` : "No new matches",
        description:
          result.unmatched > 0
            ? `${result.unmatched} still need weighing \u2014 a minute each with the kitchen scale.`
            : "Every spirit and wine now has bottle weights.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't match bottles", description: err.message, variant: "destructive" });
    } finally {
      setMatchingBottles(false);
    }
  };

  const [fixingMethods, setFixingMethods] = useState(false);
  const handleCountEach = async () => {
    if (!venue?.id || litreOnBottleIds.size === 0) return;
    setFixingMethods(true);
    try {
      let count = 0;
      for (const p of products ?? []) {
        if (!litreOnBottleIds.has(p.id)) continue;
        const sizeMl = p.size_ml ?? inferSizeMl(p.name, p.category, null) ?? null;
        const patch: Record<string, unknown> = { counting_method: "each", unit: "count" };
        if (sizeMl != null) patch.size_ml = sizeMl;
        const { error } = await supabase.from("products").update(patch as any).eq("id", p.id);
        if (error) throw error;
        count++;
      }
      queryClient.invalidateQueries({ queryKey: ["products", venue.id] });
      toast({ title: `${count} product${count === 1 ? "" : "s"} now counted each`, description: "Bottle and can sizes taken from the names." });
    } catch (err: any) {
      toast({ title: "Couldn't change counting method", description: err.message, variant: "destructive" });
    } finally {
      setFixingMethods(false);
    }
  };

  // Flag par levels in (0, 1) — almost always a mis-entry (e.g. 0.3 instead of 3).
  const suspectParIds = useMemo(() => {
    if (!products) return new Set<string>();
    return new Set(
      products
        .filter((p: any) => p.par_level != null && p.par_level > 0 && p.par_level < 1)
        .map((p: any) => p.id)
    );
  }, [products]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10 space-y-3">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">Library</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{products?.length ?? 0} products</span>
            {isPro && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => setLocation("/ledger")}
                data-testid="button-movements-link"
                title="Stock movements"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => setDeliveryOpen(true)}
              data-testid="button-log-delivery"
              title="Log delivery"
            >
              <PackagePlus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => setBulkPriceOpen(true)}
              data-testid="button-bulk-price-editor"
              title="Bulk editor"
            >
              <Tags className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => setCatalogueOpen(true)}
              data-testid="button-open-catalogue"
              title="Browse global catalogue"
            >
              <LibraryIcon className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => setV21ImportOpen(true)}
              data-testid="button-v21-import-costs"
              title="Import cost prices from V21"
            >
              <Banknote className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => setImportOpen(true)}
              data-testid="button-import-csv"
              title="Import from CSV"
            >
              <Upload className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-library-search"
          />
        </div>

        {searchCatalogueMatch && (
          <button
            type="button"
            onClick={() => openAddProduct(searchCatalogueMatch.entry.name, searchCatalogueMatch.entry)}
            className="w-full text-left border border-[#3FAE74]/40 bg-[#3FAE74]/10 rounded-xl p-3 flex items-start gap-2"
            data-testid="suggestion-search-catalogue-match"
          >
            <CheckCircle2 className="w-4 h-4 text-[#3FAE74] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{searchCatalogueMatch.entry.name}</span>
                {searchCatalogueMatch.entry.hasWeights && (
                  <Badge className="bg-[#3FAE74] text-white text-[10px] px-1.5 py-0">Known bottle — weights on file</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Not in your library yet — tap to add it with weights prefilled</p>
            </div>
          </button>
        )}

        {searchHasNoMatchAtAll && (
          <button
            type="button"
            onClick={() => openAddProduct(search.trim(), null)}
            className="w-full text-left border border-dashed border-border rounded-xl p-3 flex items-center gap-2 text-muted-foreground"
            data-testid="suggestion-add-new-from-search"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="text-sm">Add "{search.trim()}" as a new product?</span>
          </button>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0 mr-0.5">Group by</span>
          {GROUP_BY_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${groupBy === opt.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
              onClick={() => setGroupBy(opt.key)}
              data-testid={`button-group-by-${opt.key}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {needsWeighingCount > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border flex items-center gap-1.5 ${
                unweighedOnly ? "bg-amber-500 text-white border-amber-500" : "border-border text-muted-foreground"
              }`}
              onClick={() => setUnweighedOnly(v => !v)}
              data-testid="filter-chip-needs-weighing"
            >
              <Scale className="w-3 h-3" />
              Needs Weighing ({needsWeighingCount})
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 pb-24 space-y-6">
        {nullCapacityKegs.length > 0 && (
          <button
            type="button"
            onClick={() => setRepairKegOpen(true)}
            className="w-full flex items-start gap-3 rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-left"
          >
            <AlertCircle className="w-4 h-4 text-[#E0A343] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-[#E0A343]">
                {nullCapacityKegs.length} draught {nullCapacityKegs.length === 1 ? "line has" : "lines have"} no keg or cask size
              </span>
              <span className="text-xs text-[#E0A343]/80 block">
                Counts save as zero until each line has a size. Tap a size per line — takes a minute.
              </span>
            </div>
            <span className="text-xs font-semibold text-[#E0A343] shrink-0 self-center">Fix now</span>
          </button>
        )}

        {unweighedBottles.length > 0 && (
          <button
            type="button"
            onClick={handleMatchKnownBottles}
            disabled={matchingBottles}
            className="w-full flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3 text-left"
            data-testid="banner-match-known-bottles"
          >
            <Scale className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">
                {unweighedBottles.length} spirit{unweighedBottles.length === 1 ? " or wine has" : "s and wines have"} no bottle weights
              </span>
              <span className="text-xs text-muted-foreground block">
                Tap to copy weights for the bottles StockTap already knows. Whatever's left, weigh once with the kitchen scale.
              </span>
            </div>
            <span className="text-xs font-semibold text-primary shrink-0 self-center">{matchingBottles ? "Matching…" : "Match"}</span>
          </button>
        )}

        {litreOnBottleIds.size > 0 && (
          <button
            type="button"
            onClick={handleCountEach}
            disabled={fixingMethods}
            className="w-full flex items-start gap-3 rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-left"
            data-testid="banner-fix-litre-bottles"
          >
            <AlertCircle className="w-4 h-4 text-[#E0A343] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-[#E0A343]">
                {litreOnBottleIds.size} bottle{litreOnBottleIds.size === 1 ? " or can is" : "s and cans are"} set to be counted in litres
              </span>
              <span className="text-xs text-[#E0A343]/80 block">
                That's how a stocktaker's sheet totals them; in the cellar you count them each. Tap to switch them to “each” with sizes from the names.
              </span>
            </div>
            <span className="text-xs font-semibold text-[#E0A343] shrink-0 self-center">{fixingMethods ? "Fixing…" : "Count each"}</span>
          </button>
        )}

        {wrongSizeWines.length > 0 && (
          <button
            type="button"
            onClick={handleFixWineSizes}
            disabled={fixingWines}
            className="w-full flex items-start gap-3 rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-left"
            data-testid="banner-fix-wine-sizes"
          >
            <AlertCircle className="w-4 h-4 text-[#E0A343] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-[#E0A343]">
                {wrongSizeWines.length} wine{wrongSizeWines.length === 1 ? " is" : "s are"} set to 700ml
              </span>
              <span className="text-xs text-[#E0A343]/80 block">
                Wine is 75cl unless the name says 187ml or 200ml. Tenths and value are out by 7% until fixed. Tap to correct them.
              </span>
            </div>
            <span className="text-xs font-semibold text-[#E0A343] shrink-0 self-center">{fixingWines ? "Fixing…" : "Fix sizes"}</span>
          </button>
        )}

        {unpricedCount > 0 && (
          <button
            type="button"
            onClick={handleFillPrices}
            disabled={fillingPrices}
            className="w-full flex items-start gap-3 rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-left"
            data-testid="banner-fill-prices"
          >
            <AlertCircle className="w-4 h-4 text-[#E0A343] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-[#E0A343]">
                {unpricedCount} product{unpricedCount === 1 ? " has" : "s have"} no price
              </span>
              <span className="text-xs text-[#E0A343]/80 block">
                Stock value and GP% can't be worked out without one. Tap to fill in typical UK trade prices, then correct the ones that matter.
              </span>
            </div>
            <span className="text-xs font-semibold text-[#E0A343] shrink-0 self-center">{fillingPrices ? "Filling…" : "Fill in"}</span>
          </button>
        )}

        {estimatedPriceIds.size > 0 && (
          <button
            type="button"
            onClick={() => setCorrectPricesOpen(true)}
            className="w-full flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3 text-left"
            data-testid="banner-correct-prices"
          >
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">
                {estimatedPriceIds.size} product{estimatedPriceIds.size === 1 ? " is" : "s are"} on an estimated price
              </span>
              <span className="text-xs text-muted-foreground block">
                Typical UK trade prices, so the numbers mean something today. Correct your dearest lines first — kegs, then spirits.
              </span>
            </div>
            <span className="text-xs font-semibold text-primary shrink-0 self-center">Correct</span>
          </button>
        )}

        {missingDipstickDepth.length > 0 && (
          <button
            type="button"
            onClick={() => setRepairDipOpen(true)}
            className="w-full flex items-start gap-3 rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-left"
          >
            <AlertCircle className="w-4 h-4 text-[#E0A343] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-[#E0A343]">
                {missingDipstickDepth.length} dipstick {missingDipstickDepth.length === 1 ? "product has" : "products have"} no full depth set
              </span>
              <span className="text-xs text-[#E0A343]/80 block">
                Dipstick readings read as 0% until the full-tank depth is calibrated. Tap to fix.
              </span>
            </div>
            <span className="text-xs font-semibold text-[#E0A343] shrink-0 self-center">Fix now</span>
          </button>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Scale className="mx-auto w-12 h-12 text-muted-foreground/50" />
            <p className="text-muted-foreground font-medium">Your library is empty</p>
            <p className="text-sm text-muted-foreground">Add your first bottle or import from CSV</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => setCatalogueOpen(true)} data-testid="button-browse-catalogue-empty">
                <LibraryIcon className="w-4 h-4 mr-2" /> Browse Catalogue
              </Button>
              <Button variant="outline" onClick={() => openAddProduct()} data-testid="button-add-first-product">Add Custom Product</Button>
              <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="button-import-first">
                <Upload className="w-4 h-4 mr-2" /> Import CSV
              </Button>
            </div>
            {(products?.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground pt-2">
                The protected catalogue includes calibrated bottles plus starter keg and cask templates.
              </p>
            )}
          </div>
        ) : (
          Object.entries(grouped).map(([groupName, prods]) => (
            <div key={groupName}>
              {groupBy !== "none" && (
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">{groupName}</h2>
              )}
              <div className="space-y-2">
                {prods.map(p => {
                  const pReadings = readingsMap?.get(p.id) ?? [];
                  const latestReading = pReadings.length > 0
                    ? pReadings.reduce((best, r) => new Date(r.reading_at) > new Date(best.reading_at) ? r : best)
                    : null;
                  const coverage = isPro && pReadings.length >= 2 && latestReading
                    ? calcCoverage(latestReading.ml_remaining, pReadings, orderCycleDays)
                    : null;
                  const coverageDays = coverage && isFinite(coverage.daysOfCover) ? Math.round(coverage.daysOfCover) : null;
                  // Suppress "Order now" if current stock is at or above par level —
                  // velocity-only orderFlag can fire even when shelves are full.
                  const bottlesOnHand = latestReading && p.size_ml ? latestReading.ml_remaining / p.size_ml : null;
                  const abovePar = p.par_level != null && bottlesOnHand != null && bottlesOnHand >= p.par_level;
                  const weighed = isWeighed(p);
                  return (
                    <div
                      key={p.id}
                      className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"
                      data-testid={`card-product-${p.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{p.name}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border border-border">{p.category ? (CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category) : "—"}</Badge>
                          {/* Size display: show capacity in litres for keg/dipstick, ml for bottles */}
                          {(p.counting_method === "keg_weight" || p.counting_method === "dipstick" || p.counting_method === "tenths_pints")
                            ? p.container_l
                              ? <span className="text-xs text-muted-foreground">{p.container_l}L</span>
                              : <span className="text-xs text-amber-600">No capacity set</span>
                            : p.size_ml
                              ? <span className="text-xs text-muted-foreground">{p.size_ml}ml</span>
                              : null
                          }
                          {p.pour_price && <span className="text-xs text-muted-foreground">{formatGBP(p.pour_price)}</span>}
                          {estimatedPriceIds.has(p.id) && (
                            <button
                              type="button"
                              onClick={() => setEditProduct(p)}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-dashed border-border"
                              title="Typical UK trade price filled in for you — tap to put in your real price"
                              data-testid={`badge-price-estimated-${p.id}`}
                            >
                              est. price
                            </button>
                          )}
                          {/* Calibration status badge — varies by method */}
                          {p.counting_method === "keg_weight" ? (
                            p.container_l ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Calibrated
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditProduct(p)}
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                data-testid={`badge-needs-weighing-${p.id}`}
                              >
                                Set capacity
                              </button>
                            )
                          ) : p.counting_method === "dipstick" ? (
                            (p.dip_full_mm && p.container_l) ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Calibrated
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditProduct(p)}
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                data-testid={`badge-needs-weighing-${p.id}`}
                              >
                                {!p.container_l ? "Set capacity" : "Set depth"}
                              </button>
                            )
                          ) : p.counting_method === "tenths_pints" || p.counting_method === "tenths" || p.counting_method === "each" || p.counting_method === "dozen" || p.counting_method === "litre" ? null
                          : weighed ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              Weighed
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setWeighProduct(p)}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              data-testid={`badge-needs-weighing-${p.id}`}
                            >
                              Needs Weighing
                            </button>
                          )}
                          {p.counting_method === "photo_tap" && (
                            <button
                              type="button"
                              onClick={() => setShapeProduct(p)}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                (p as any).bottle_shape_id
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              }`}
                            >
                              {(p as any).bottle_shape_id ? "Shape set" : "Set shape"}
                            </button>
                          )}
                          {coverage?.orderFlag && !abovePar && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              Order now
                            </span>
                          )}
                          {coverageDays !== null && !coverage?.orderFlag && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                              coverageDays >= orderCycleDays * 2
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}>
                              {coverageDays}d cover
                            </span>
                          )}
                          {litreOnBottleIds.has(p.id) ? (
                            <button
                              type="button"
                              onClick={() => setEditProduct(p)}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              title="This is a bottle or can but it is set to be counted in litres. Bottles are counted each."
                              data-testid={`badge-litre-on-bottles-${p.id}`}
                            >
                              Counted in litres?
                            </button>
                          ) : inconsistentMethodIds.has(p.id) && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              title="Same brand and size as another product but counted a different way (each vs litres) — variance won't add up between them"
                            >
                              Method mismatch
                            </span>
                          )}
                          {suspectParIds.has(p.id) && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              title={`Par level ${p.par_level} looks like a mis-entry — did you mean ${Math.round((p.par_level ?? 0) * 10)}?`}
                            >
                              Par level low
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {/* Only show the bottle-weigh button for products that use gram weighing */}
                        {p.counting_method !== "keg_weight" && p.counting_method !== "dipstick" && p.counting_method !== "tenths_pints" && p.counting_method !== "tenths" && p.counting_method !== "each" && p.counting_method !== "dozen" && p.counting_method !== "litre" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-3 font-medium border-primary/30 text-primary"
                            onClick={() => setWeighProduct(p)}
                            data-testid={`button-weigh-${p.id}`}
                          >
                            <Scale className="w-3.5 h-3.5 mr-1" />
                            Weigh
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 px-2 text-muted-foreground"
                          onClick={() => setEditProduct(p)}
                          data-testid={`button-edit-${p.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
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
        onClick={() => openAddProduct()}
        data-testid="button-add-product-fab"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {venue?.id && (
        <AddProductSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          venueId={venue.id}
          products={products ?? []}
          initialName={addPrefill.name}
          initialMatch={addPrefill.match}
        />
      )}

      {venue?.id && (
        <CataloguePickerSheet
          open={catalogueOpen}
          onClose={() => setCatalogueOpen(false)}
          venueId={venue.id}
          tier={venue.tier}
          products={products ?? []}
          locations={libraryLocations}
        />
      )}

      {weighProduct && venue?.id && (
        <WeighNowSheet
          open={!!weighProduct}
          onClose={() => setWeighProduct(null)}
          product={weighProduct}
          venueId={venue.id}
        />
      )}

      {venue?.id && (
        <ImportCSVSheet
          maxNew={venue?.tier === "free" ? Math.max(0, 50 - (products?.length ?? 0)) : Number.POSITIVE_INFINITY}
          open={importOpen}
          onClose={() => setImportOpen(false)}
          venueId={venue.id}
          defaultMeasure={venue.measure_ml ?? 25}
          existingProducts={products ?? []}
        />
      )}

      {venue?.id && (
        <BulkPriceEditorSheet
          open={bulkPriceOpen}
          onClose={() => setBulkPriceOpen(false)}
          venueId={venue.id}
          products={products ?? []}
        />
      )}

      {venue?.id && (
        <BulkPriceEditorSheet
          open={correctPricesOpen}
          onClose={() => setCorrectPricesOpen(false)}
          venueId={venue.id}
          products={products ?? []}
          mode="prices"
        />
      )}

      {venue?.id && (
        <DeliveryEntrySheet
          open={deliveryOpen}
          onClose={() => setDeliveryOpen(false)}
          venueId={venue.id}
          products={products ?? []}
        />
      )}

      {venue?.id && (
        <V21ImportCostPricesSheet
          open={v21ImportOpen}
          onClose={() => setV21ImportOpen(false)}
          venueId={venue.id}
          products={products ?? []}
        />
      )}

      {venue?.id && (
        <ProductFieldRepairSheet
          open={repairKegOpen}
          onClose={() => setRepairKegOpen(false)}
          title="Set keg and cask sizes"
          description={`${nullCapacityKegs.length} draught line${nullCapacityKegs.length === 1 ? "" : "s"} ${nullCapacityKegs.length === 1 ? "has" : "have"} no size. Tap the size under each line; a missing cost is estimated from the size and marked "est." until you correct it.`}
          field="container_l"
          unit="L"
          placeholder="litres"
          quickSizes={KEG_QUICK_SIZES}
          presetsFor={p => {
            const type = p.container_type ?? (p.counting_method === "dipstick" ? "cask" : p.counting_method === "keg_weight" ? "keg" : p.category === "draught_ale" ? "cask" : "keg");
            return CONTAINER_PRESETS[type] ?? CONTAINER_PRESETS.keg;
          }}
          products={nullCapacityKegs}
          venueId={venue.id}
        />
      )}

      {venue?.id && (
        <ProductFieldRepairSheet
          open={repairDipOpen}
          onClose={() => setRepairDipOpen(false)}
          title="Set dipstick full depths"
          description={`${missingDipstickDepth.length} dipstick product${missingDipstickDepth.length === 1 ? "" : "s"} have no full-tank depth set. Readings will show 0% until calibrated.`}
          field="dip_full_mm"
          unit="mm"
          placeholder="mm"
          products={missingDipstickDepth}
          venueId={venue.id}
        />
      )}

      {editProduct && venue?.id && (
        <EditProductSheet
          open={!!editProduct}
          onClose={() => setEditProduct(null)}
          product={editProduct}
          venueId={venue.id}
        />
      )}

      {venue?.id && shapeProduct && (
        <BottleShapeSheet
          open={!!shapeProduct}
          onClose={() => setShapeProduct(null)}
          product={shapeProduct}
          venueId={venue.id}
        />
      )}
    </div>
  );
}
