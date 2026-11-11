// The guided first count. New venues used to be handed an empty library and a
// "New Stocktake" button: add products, price every one, make a location, then
// count. An hour of setup before any payoff, and the numbers said people stopped.
//
// This screen is the shortcut: pick your 20 biggest sellers from the catalogue
// (weights already on file, prices estimated), tap Start, and you're weighing
// within a couple of minutes. Prices and the rest of the range can come after
// the first "you have £X on the shelf".

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rankCatalogueResults } from "@/lib/catalogue-picker";
import { QUICK_TARGET, QUICK_PICK_NAMES, setQuickCount } from "@/lib/quick-count";
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

const TARGET = QUICK_TARGET;

// Shown before the landlord types anything: the lines that are the biggest
// sellers in most UK pubs, so the first taps are obvious.
const SUGGESTED_SEARCHES = ["Smirnoff", "Gordons", "Jack Daniel", "Bacardi", "Captain Morgan", "Bells", "Baileys", "Jägermeister", "Prosecco", "Pinot Grigio", "Coke", "Fever-Tree"];

const METHOD_LABEL: Record<string, string> = {
  tenths: "Counted in tenths", photo_tap: "Counted in tenths", keg_weight: "Draught: kegs and pints", dipstick: "Draught: dip reading",
  tenths_pints: "Draught: tenths", litre: "Counted in litres", dozen: "Counted in dozens", each: "Counted each", count: "Counted each",
};

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
  // One-tap picks: the top catalogue match for each of the usual back-bar bottles, so the first
  // count needs no typing at all. Typing a brand still works for anything not shown.
  const { data: quickPicks = [] } = useQuery({
    queryKey: ["quick-picks", venue?.id],
    enabled: !!venue?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const hits = await Promise.all(QUICK_PICK_NAMES.map(async name => {
        try {
          const { data } = await supabase.rpc("search_catalogue_items" as never, { p_venue_id: venue!.id, p_query: name, p_limit: 8 } as never);
          const ranked = rankCatalogueResults((data ?? []) as unknown as SafeCatalogueItem[], name);
          // The standard 70cl bottle if there is one, else the best match.
          return ranked.find(i => i.size_ml === 700) ?? ranked[0] ?? null;
        } catch { return null; }
      }));
      const seen = new Set<string>();
      return hits.filter((i): i is SafeCatalogueItem => !!i && !seen.has(i.id) && !!seen.add(i.id));
    },
  });
  const [catToProduct, setCatToProduct] = useState<Record<string, string>>({});
  const [tapping, setTapping] = useState<string | null>(null);
  const tapQuickPick = async (item: SafeCatalogueItem) => {
    if (!venue?.id || tapping) return;
    const have = catToProduct[item.id];
    if (have && picked.includes(have)) { setPicked(prev => prev.filter(x => x !== have)); return; }
    if (have) { setPicked(prev => [...prev, have]); return; }
    setTapping(item.id);
    try {
      const rows = await addItems.mutateAsync({ venueId: venue.id, catalogueIds: [item.id], locationId: null });
      const row = rows[0];
      if (row) { setCatToProduct(m => ({ ...m, [item.id]: row.product_id })); setPicked(prev => (prev.includes(row.product_id) ? prev : [...prev, row.product_id])); }
    } catch (err: any) {
      toast({ title: "Couldn't add that one", description: err.message, variant: "destructive" });
    } finally { setTapping(null); }
  };
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
      // Bottles in tenths by default for this count: no scale needed to get the first number.
      setQuickCount(true);
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
            <h1 className="text-xl font-bold text-primary">Your first number, in 2 minutes</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap {TARGET} bottles you can see from where you're standing. No scale, no prices to type. You'll say how full each one is by eye.
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Not shown below? Type a brand"
            className="pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
            data-testid="input-first-count-search"
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">
            {picked.length} of {TARGET} picked
          </span>
          <span className="text-muted-foreground">{picked.length >= TARGET ? "That's plenty. Start counting" : picked.length > 0 ? "Fewer is fine. Start when you like" : "Five is a guide, not a rule"}</span>
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
            {quickPicks.length > 0 && (
              <div className="space-y-2" data-testid="quick-picks">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tap what's on your back bar</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickPicks.map(item => {
                    const pid = catToProduct[item.id];
                    const on = !!pid && picked.includes(pid);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => tapQuickPick(item)}
                        disabled={tapping === item.id}
                        aria-pressed={on}
                        className={`min-h-[3.5rem] rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold leading-snug disabled:opacity-60 ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}
                        data-testid={`quick-pick-${item.id}`}
                      >
                        <span className="flex items-start gap-1.5">
                          {on ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <Plus className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />}
                          <span className="break-words">{item.canonical_name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {quickPicks.length === 0 && picked.length === 0 && (
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
                        {p.full_weight_g != null && p.empty_weight_g != null ? "Weights on file" : p.counting_method === "weigh" || !p.counting_method ? "Tenths for now, or weigh it once" : METHOD_LABEL[p.counting_method] ?? "Counted each"}
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
            No scale needed: you'll tap how full each bottle is. Want it exact? You can weigh any bottle as you go.
          </p>
        </div>
      )}
    </div>
  );
}
