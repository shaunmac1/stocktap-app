import React from "react";
import { BottleGauge } from "@/components/BottleGauge";
import { Check, Database, Library, Search, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAddCatalogueItems, useCatalogueSearch } from "@/hooks/useCatalogue";
import {
  catalogueConfidenceLabel,
  catalogueSizeLabel,
  isCatalogueProduct,
  pruneSelectedIds,
  remainingProductSlots,
  selectionExceedsPlan,
  toggleCatalogueSelection,
  type SafeCatalogueItem,
} from "@/lib/catalogue-picker";
import { CATEGORY_LABELS } from "@/lib/calculations";

// Stable module-level constant used as the default when the query has not yet
// resolved.  An inline `= []` default would create a new array reference on
// every render, making the pruneSelectedIds effect dependency change every
// render and triggering an infinite setState loop (Error #185).
const EMPTY_CATALOGUE: SafeCatalogueItem[] = [];

interface VenueProductLike {
  id: string;
  name: string;
  type: string;
  category: string | null;
  size_ml: number | null;
  container_l: number | null;
  external_id: string | null;
}

interface LocationLike {
  id: string;
  name: string;
}

function confidenceClasses(item: SafeCatalogueItem): string {
  if (!item.has_calibration || item.calibration_confidence === "unverified") {
    return "bg-muted text-muted-foreground";
  }
  if (item.calibration_confidence === "low") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
  if (item.calibration_confidence === "verified" || item.calibration_confidence === "high") {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
}

function categoryLabel(category: string | null): string {
  if (!category) return "Uncategorised";
  return (CATEGORY_LABELS as Record<string, string>)[category] ?? category.replaceAll("_", " ");
}

export function CataloguePickerSheet({
  open,
  onClose,
  venueId,
  tier,
  products,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  tier: "free" | "pro" | "premium";
  products: VenueProductLike[];
  locations: LocationLike[];
}) {
  const { toast } = useToast();
  const [tab, setTab] = React.useState("global");
  const [query, setQuery] = React.useState("");
  const [venueQuery, setVenueQuery] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [locationId, setLocationId] = React.useState("none");
  const { data: catalogueItems = EMPTY_CATALOGUE, isLoading, error } = useCatalogueSearch(venueId, query, open && tab === "global");
  const addItems = useAddCatalogueItems();

  React.useEffect(() => {
    if (!open) return;
    setTab("global");
    setQuery("");
    setVenueQuery("");
    setSelectedIds([]);
    setLocationId("none");
  }, [open]);

  // Prune selected IDs whenever the catalogue result changes (e.g. an item
  // becomes already_added after being added by another user).  pruneSelectedIds
  // returns the SAME reference when nothing is removed so the setState call is
  // a no-op for React's Object.is check — preventing a re-render loop.
  React.useEffect(() => {
    setSelectedIds((ids) => pruneSelectedIds(ids, catalogueItems));
  }, [catalogueItems]);

  const slots = remainingProductSlots(tier, products.length);
  const overPlan = selectionExceedsPlan(tier, products.length, selectedIds.length);
  const filteredVenueProducts = React.useMemo(() => {
    const normalized = venueQuery.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(normalized)
      || product.type.toLowerCase().includes(normalized)
      || (product.category ?? "").toLowerCase().includes(normalized),
    );
  }, [products, venueQuery]);

  const addSelected = async () => {
    if (selectedIds.length === 0 || overPlan) return;
    try {
      const rows = await addItems.mutateAsync({
        venueId,
        catalogueIds: selectedIds,
        locationId: locationId === "none" ? null : locationId,
      });
      const created = rows.filter((row) => row.created).length;
      const existing = rows.length - created;
      toast({
        title: `${created} product${created === 1 ? "" : "s"} added`,
        description: existing > 0 ? `${existing} already existed and were not duplicated.` : "Ready to add prices and par levels.",
      });
      setSelectedIds([]);
      onClose();
    } catch (addError: any) {
      toast({ title: "Could not add catalogue products", description: addError.message, variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="h-[94dvh] rounded-t-2xl flex flex-col p-0">
        <SheetHeader className="p-4 pb-2 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Product Catalogue
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Add several products at once. Search results never expose raw calibration weights.
          </p>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="mx-4 mt-3 grid grid-cols-2 shrink-0">
            <TabsTrigger value="global" data-testid="tab-global-catalogue">Global Catalogue</TabsTrigger>
            <TabsTrigger value="venue" data-testid="tab-venue-catalogue">My Venue ({products.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="flex-1 min-h-0 mt-0 flex flex-col">
            <div className="p-4 pb-3 space-y-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search bottles, wine, kegs…"
                  className="pl-9"
                  data-testid="input-global-catalogue-search"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  {tier === "free" ? `${slots} Free-plan slot${slots === 1 ? "" : "s"} remaining` : "Unlimited catalogue products"}
                </span>
                {selectedIds.length > 0 && (
                  <button className="text-primary font-semibold" type="button" onClick={() => setSelectedIds([])}>Clear selection</button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-4 pb-32 space-y-2">
              {isLoading ? (
                [1, 2, 3, 4].map((index) => <div key={index} className="h-24 rounded-xl bg-muted animate-pulse" />)
              ) : error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  Catalogue search is unavailable until its database migration is applied.
                </div>
              ) : catalogueItems.length === 0 ? (
                <div className="text-center py-14 space-y-2">
                  <Library className="w-10 h-10 mx-auto text-muted-foreground/40" />
                  <div className="font-medium text-sm">No catalogue matches</div>
                  <p className="text-xs text-muted-foreground">Try a shorter brand name or add it as a custom product.</p>
                </div>
              ) : (
                catalogueItems.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      disabled={item.already_added}
                      onClick={() => setSelectedIds((ids) => toggleCatalogueSelection(ids, item))}
                      className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors ${
                        item.already_added
                          ? "border-border bg-muted/30 opacity-65"
                          : selected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-primary/40"
                      }`}
                      data-testid={`catalogue-item-${item.id}`}
                    >
                      <span className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${selected ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                        {(selected || item.already_added) && <Check className="w-4 h-4" />}
                      </span>
                      {item.shape_path && (
                        <BottleGauge shapePath={item.shape_path} imageUrl={item.image_path} tenths={10} className="h-14 w-9 shrink-0" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{item.canonical_name}</span>
                          {item.already_added && <Badge variant="secondary">Already added</Badge>}
                        </span>
                        <span className="text-xs text-muted-foreground mt-1 block">
                          {categoryLabel(item.category)} · {catalogueSizeLabel(item)} · {item.counting_method.replaceAll("_", " ")}
                        </span>
                        <span className="mt-2 flex items-center gap-2 flex-wrap">
                          <Badge className={confidenceClasses(item)}>{catalogueConfidenceLabel(item)}</Badge>
                          {item.has_calibration && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Calibration available</span>}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background p-4 space-y-3">
              {locations.length > 0 && (
                <div>
                  <Label className="text-xs">Add selected products to</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger className="mt-1 h-10" data-testid="select-catalogue-location"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No location yet</SelectItem>
                      {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {overPlan && (
                <p className="text-xs text-destructive">This selection exceeds the 50-product Free-plan limit. Remove {selectedIds.length - slots} product{selectedIds.length - slots === 1 ? "" : "s"} or upgrade.</p>
              )}
              <Button className="w-full h-12 font-bold" onClick={addSelected} disabled={selectedIds.length === 0 || overPlan || addItems.isPending} data-testid="button-add-catalogue-products">
                {addItems.isPending ? "Adding products…" : `Add ${selectedIds.length || ""} Product${selectedIds.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="venue" className="flex-1 min-h-0 mt-0 flex flex-col">
            <div className="p-4 pb-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={venueQuery}
                  onChange={(event) => setVenueQuery(event.target.value)}
                  placeholder="Search my venue products…"
                  className="pl-9"
                  data-testid="input-venue-catalogue-search"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto px-4 pb-6 space-y-2">
              {filteredVenueProducts.length === 0 ? (
                <div className="text-center py-14 text-sm text-muted-foreground">No venue products match this search.</div>
              ) : filteredVenueProducts.map((product) => (
                <div key={product.id} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <Library className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{product.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {categoryLabel(product.category)} · {product.container_l != null ? `${product.container_l}L` : product.size_ml != null ? `${product.size_ml}ml` : "Size not set"}
                    </div>
                  </div>
                  <Badge className={isCatalogueProduct(product.external_id) ? "bg-blue-100 text-blue-800" : "bg-muted text-muted-foreground"}>
                    {isCatalogueProduct(product.external_id) ? "Global" : "Custom"}
                  </Badge>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
