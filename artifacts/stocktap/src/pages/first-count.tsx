// The guided first count. New venues used to be handed an empty library and a
// "New Stocktake" button: add products, price every one, make a location, then
// count. An hour of setup before any payoff, and the numbers said people stopped.
//
// This screen is the shortcut: pick your 20 biggest sellers from the catalogue
// (weights already on file, prices estimated), tap Start, and you're weighing
// within a couple of minutes. Prices and the rest of the range can come after
// the first "you have £X on the shelf".

import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useCreateStocktake, useStocktakes } from "@/hooks/api";
import { useAddCatalogueItems, useCatalogueSearch } from "@/hooks/useCatalogue";
import type { SafeCatalogueItem } from "@/lib/catalogue-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Plus, Scale, Search } from "lucide-react";

const TARGET = 20;

// Shown before the landlord types anything: the lines that are the biggest
// sellers in most UK pubs, so the first taps are obvious.
const SUGGESTED_SEARCHES = ["Smirnoff", "Gordons", "Jack Daniel", "Bacardi", "Captain Morgan", "Bells", "Baileys", "Jägermeister", "Prosecco", "Pinot Grigio", "Coke", "Fever-Tree"];

export default function FirstCount() {
  const { venue } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: products = [] } = useProducts(venue?.id);
  const { data: stocktakes } = useStocktakes(venue?.id);
  const [query, setQuery] = useState("");
  const { data: results = [], isLoading: searching } = useCatalogueSearch(venue?.id, query, query.trim().length >= 2);
  const addItems = useAddCatalogueItems();
  const createStocktake = useCreateStocktake();
  const [picked, setPicked] = useState<string[]>([]); // venue product ids, in the order picked
  const [starting, setStarting] = useState(false);

  const openStocktake = (stocktakes ?? []).find(s => s.status === "open");

  // Anything already in the library counts towards the 20, so a venue that
  // imported the starter catalogue isn't asked to add the same bottles twice.
  const pickedProducts = useMemo(() => {
    const byId = new Map(products.map(p => [p.id, p]));
    return picked.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }, [picked, products]);

  const libraryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return products.filter(p => p.name.toLowerCase().includes(q) && !picked.includes(p.id)).slice(0, 5);
  }, [products, query, picked]);

  const addFromCatalogue = async (item: SafeCatalogueItem) => {
    if (!venue?.id) return;
    try {
      const rows = await addItems.mutateAsync({ venueId: venue.id, catalogueIds: [item.id], locationId: null });
      const row = rows[0];
      if (row) setPicked(prev => (prev.includes(row.product_id) ? prev : [...prev, row.product_id]));
      setQuery("");
    } catch (err: any) {
      toast({ title: "Couldn't add that one", description: err.message, variant: "destructive" });
    }
  };

  const addFromLibrary = (id: string) => {
    setPicked(prev => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
  };

  const remove = (id: string) => setPicked(prev => prev.filter(x => x !== id));

  const start = async () => {
    if (!venue?.id || picked.length === 0) return;
    setStarting(true);
    try {
      await createStocktake.mutateAsync({
        venue_id: venue.id,
        location_id: null,
        status: "open",
        opened_at: new Date().toISOString(),
        product_ids: picked,
      });
      setLocation("/stocktake?open=1");
    } catch (err: any) {
      toast({ title: "Couldn't start the count", description: err.message, variant: "destructive" });
      setStarting(false);
    }
  };

  const unweighed = pickedProducts.filter(p => (p.counting_method === "weigh" || !p.counting_method) && (p.full_weight_g == null || p.empty_weight_g == null)).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-first-count-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary">Your first count</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick your {TARGET} biggest sellers. Weights are on file for most of them, so you can start weighing straight away.
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Type a brand — Smirnoff, Gordons, Peroni…"
            className="pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            data-testid="input-first-count-search"
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">
            {picked.length} of {TARGET} picked
          </span>
          <span className="text-muted-foreground">{picked.length >= TARGET ? "That's plenty — start counting" : "Twenty is a guide, not a rule"}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (picked.length / TARGET) * 100)}%` }} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-32 space-y-4">
        {openStocktake && (
          <button
            type="button"
            onClick={() => setLocation("/stocktake?open=1")}
            className="w-full rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 text-left text-sm"
            data-testid="banner-first-count-resume"
          >
            <span className="font-bold">You've already got a count open.</span> Tap to pick it up where you left off.
          </button>
        )}

        {query.trim().length >= 2 ? (
          <div className="space-y-2">
            {libraryMatches.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => addFromLibrary(p.id)}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
                data-testid={`first-count-library-${p.id}`}
              >
                <Plus className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">Already in your library</div>
                </div>
              </button>
            ))}
            {searching && <p className="text-xs text-muted-foreground text-center py-2">Searching the catalogue…</p>}
            {results
              .filter(item => !item.already_added)
              .slice(0, 12)
              .map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addFromCatalogue(item)}
                  disabled={addItems.isPending}
                  className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left disabled:opacity-60"
                  data-testid={`first-count-catalogue-${item.id}`}
                >
                  <Plus className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{item.canonical_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.size_ml ? `${item.size_ml}ml · ` : ""}
                      {item.has_calibration ? "Weights on file" : "You'll weigh this one once"}
                    </div>
                  </div>
                </button>
              ))}
            {!searching && results.filter(i => !i.already_added).length === 0 && libraryMatches.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nothing in the catalogue by that name. Add it from the Library later — start with what's here.
              </p>
            )}
          </div>
        ) : (
          <>
            {picked.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Most pubs start with</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_SEARCHES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setQuery(s)}
                      className="px-3 py-1.5 rounded-full border border-border text-sm hover:border-primary hover:text-primary"
                      data-testid={`first-count-suggest-${s.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pickedProducts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Counting these</p>
                {pickedProducts.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3" data-testid={`first-count-picked-${p.id}`}>
                    <Check className="w-4 h-4 text-[#3FAE74] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.full_weight_g != null && p.empty_weight_g != null ? "Weights on file" : p.counting_method === "weigh" || !p.counting_method ? "Tenths for now, or weigh it once" : "Counted each"}
                      </div>
                    </div>
                    <button type="button" onClick={() => remove(p.id)} className="text-xs text-muted-foreground px-2 py-1" data-testid={`first-count-remove-${p.id}`}>
                      Remove
                    </button>
                  </div>
                ))}
                {picked.length < TARGET && (
                  <button type="button" onClick={() => setQuery(" ")} className="w-full text-sm text-primary font-semibold py-2" data-testid="button-first-count-add-more">
                    + Add another
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Sits above the app's bottom nav (which is fixed at bottom-0, z-50). */}
      {picked.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto p-4 pb-3 bg-background border-t border-border space-y-1 z-40">
          <Button className="w-full h-14 text-base font-bold" onClick={start} disabled={starting} data-testid="button-first-count-start">
            <Scale className="w-4 h-4 mr-2" />
            {starting ? "Starting…" : `Start counting ${picked.length} line${picked.length === 1 ? "" : "s"}`}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            {unweighed > 0 ? `${unweighed} without bottle weights can be counted in tenths today.` : "Prices are estimated for now — fix them after the count."}
          </p>
        </div>
      )}
    </div>
  );
}
