import React, { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useLatestReadings, useLatestReadingsByProduct, useStocktakes, useLineEntries } from "@/hooks/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  calcWeighValuation,
  calcCountValuation,
  calcGpPercent,
  calcProductGpPercent,
  calcCostPerMeasure,
  formatGBP,
  productCapacityMl,
} from "@/lib/calculations";
import { stockValueFromReading } from "@/lib/inventory-reporting";
import { valueProductEntries } from "@/lib/stocktake-close";
import { formatDistanceToNow } from "date-fns";
import { TrendingDown, TrendingUp, Settings } from "lucide-react";
import { StocktakeTasksCard } from "@/components/StocktakeTasksCard";
import { venueTrial } from "@/hooks/useSubscription";
import { NewPubWelcome } from "@/components/NewPubWelcome";
import { isHidden } from "@/lib/hidden-products";
import { draughtAmount, isDraughtProduct } from "@/lib/draught-gauge";
import { useLineChecks } from "@/hooks/useLineChecks";

export default function Home() {
  const { venue } = useAuth();
  const { data: products } = useProducts(venue?.id);
  // Ordered feed for recent activity — still uses the capped hook (last 100 events is fine here)
  const { data: allReadings } = useLatestReadings(venue?.id);
  // Full latest-per-product map for accurate value calculations — no 100-reading cap
  const { data: latestByProduct = {} } = useLatestReadingsByProduct(venue?.id);
  const { data: stocktakes } = useStocktakes(venue?.id);
  const openStocktake = (stocktakes ?? []).find((s: any) => s.status === "open");
  const hasClosedCount = (stocktakes ?? []).some((s: any) => s.status === "closed");
  const trial = venueTrial(venue);
  // "8 of 20 done" on the resume banner
  const { data: openEntries = [] } = useLineEntries(openStocktake?.id ?? null);
  const openTotal = (openStocktake as any)?.product_ids?.length ?? (products?.length ?? 0);
  const openDone = new Set(openEntries.map(e => e.product_id)).size;

  const measureMl = venue?.measure_ml ?? 25;

  // Value of what's been counted so far in the open stocktake.
  const countedSoFar = useMemo(() => {
    if (!products || !openEntries.length) return 0;
    const byProduct = new Map<string, any[]>();
    for (const e of openEntries as any[]) { const l = byProduct.get(e.product_id) ?? []; l.push(e); byProduct.set(e.product_id, l); }
    let sum = 0;
    for (const [pid, es] of byProduct) {
      const p = products.find(x => x.id === pid);
      if (!p || !p.cost_price) continue;
      try { sum += valueProductEntries(p as any, es as any); } catch { /* one bad line never breaks home */ }
    }
    return sum;
  }, [products, openEntries]);

  // Total stock value
  const totalValue = useMemo(() => {
    if (!products) return 0;
    // Same valuation as Reports, so the two screens always agree.
    return products.reduce((sum, p) => {
      const r = latestByProduct[p.id];
      if (!r || !p.cost_price) return sum;
      return sum + stockValueFromReading(p as any, r as any);
    }, 0);
  }, [products, latestByProduct]);

  // Overall GP%
  const overallGP = useMemo(() => {
    if (!products) return null;
    const gps = products
      .map(p => calcProductGpPercent(p, measureMl))
      .filter((g): g is number => g !== null);
    if (!gps.length) return null;
    return gps.reduce((a, b) => a + b, 0) / gps.length;
  }, [products, measureMl]);

  // Last updated timestamp
  const lastUpdated = useMemo(() => {
    if (!allReadings?.length) return null;
    try {
      return formatDistanceToNow(new Date(allReadings[0].reading_at), { addSuffix: true });
    } catch {
      return null;
    }
  }, [allReadings]);

  // Recent variances (from last 5 spot-check readings that have till data)
  // We approximate by looking for readings that changed significantly
  const recentReadings = useMemo(() => {
    if (!allReadings) return [];
    return allReadings.slice(0, 5).map(r => ({
      r,
      productName: (r as any).products?.name ?? "Unknown",
    }));
  }, [allReadings]);

  // A pub that has never finished a count (and has no readings) gets the guided
  // first screen instead of an empty value and a GP% from placeholder prices.
  const isNewPub = !!products && !!stocktakes && !openStocktake && !hasClosedCount && Object.keys(latestByProduct).length === 0;
  const { data: lineChecks = [] } = useLineChecks(venue?.id);
  const lineCheckOn = (venue as any)?.features?.morning_line_check !== false;
  const shownProducts = (products ?? []).filter(p => !isHidden(p as any));
  const draughtLines = shownProducts.filter(p => (p.category ?? "").startsWith("draught_") || ["keg_weight", "dipstick", "tenths_pints"].includes((p as any).counting_method ?? "")).length;

  return (
    <div className="flex flex-col h-full overflow-auto pb-20">
      <div className="p-4 bg-card border-b border-border sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-primary">{venue?.name ?? "StockTap"}</h1>
        <Link href="/settings">
          <Button variant="ghost" size="icon" data-testid="button-settings">
            <Settings className="w-5 h-5 text-muted-foreground" />
          </Button>
        </Link>
      </div>

      {isNewPub ? (
        <div className="p-4 space-y-4">
          {trial.active && trial.daysLeft <= 3 && (
            <Link href="/settings" className="block">
              <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm" data-testid="banner-trial-ending">
                Your free trial ends in {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"}. Pick a plan to keep spot checks, reports and unlimited products.
              </div>
            </Link>
          )}
          <NewPubWelcome draughtLines={draughtLines} totalLines={shownProducts.length} />
        </div>
      ) : (
      <div className="p-4 space-y-4">
        {/* Stock value hero */}
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-primary-foreground/75">Total Stock Value</div>
            {Object.keys(latestByProduct).length === 0 ? (
              <>
                <div className="text-5xl font-bold mt-1" data-testid="text-stock-value">{countedSoFar > 0 ? formatGBP(countedSoFar) : "—"}</div>
                <div className="text-xs text-primary-foreground/75 mt-2" data-testid="text-stock-value-hint">
                  {countedSoFar > 0 ? `Counted so far, ${openDone} of ${openTotal} lines. Final when you close the count.` : openStocktake ? "Shows here when you close your stocktake." : "Shows here after your first count."}
                </div>
              </>
            ) : (
              <div className="text-5xl font-bold mt-1" data-testid="text-stock-value">{formatGBP(totalValue)}</div>
            )}
            {lastUpdated && (
              <div className="text-xs text-primary-foreground/60 mt-2">Updated {lastUpdated}</div>
            )}
          </CardContent>
        </Card>

        {lineCheckOn && draughtLines > 0 && (() => {
          const latestAt = lineChecks[0]?.checked_at ?? null;
          const latest = latestAt ? lineChecks.filter(h => h.checked_at === latestAt) : [];
          const short = latest.filter(h => h.missing_ml != null && h.missing_ml / h.unit_ml > 0.5).sort((a, b) => (b.missing_ml ?? 0) - (a.missing_ml ?? 0));
          const pence = short.reduce((a, h) => a + (h.missing_value_pence ?? 0), 0);
          const when = latestAt ? new Date(latestAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : null;
          const checkedToday = !!latestAt && latestAt.slice(0, 10) === new Date().toISOString().slice(0, 10);
          return (
            <Link href="/line-check" className="block">
              <div className={`rounded-xl border-2 p-4 ${short.length ? "border-[#E5544B]/50 bg-[#E5544B]/10" : "border-primary/40 bg-primary/5"}`} data-testid="card-line-check">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold">{!latestAt ? "Morning line check" : short.length ? `${short.length} ${short.length === 1 ? "line" : "lines"} short${pence ? ` · ${formatGBP(pence / 100)}` : ""}` : "Lines balanced"}</div>
                  <span className="text-sm font-semibold text-primary whitespace-nowrap">{checkedToday ? "Open →" : "Check now →"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {!latestAt ? "Count your kegs, type the till pints, see what's missing. Two minutes." : `Last check ${when}, ${latest.length} ${latest.length === 1 ? "line" : "lines"}.`}
                </div>
                {short.slice(0, 3).map(h => (
                  <div key={h.id} className="text-sm font-semibold text-[#C2372E] mt-1" data-testid={`home-short-${h.product_id}`}>
                    {(products ?? []).find(p => p.id === h.product_id)?.name ?? "Line"}: {Math.round((h.missing_ml ?? 0) / h.unit_ml)} pints missing{h.missing_value_pence ? ` · ${formatGBP(h.missing_value_pence / 100)}` : ""}
                  </div>
                ))}
              </div>
            </Link>
          );
        })()}

        {/* GP + Last updated */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-1">Overall GP%</div>
              <div className="text-2xl font-bold" data-testid="text-gp">
                {overallGP != null ? `${overallGP.toFixed(0)}%` : "—"}
              </div>
              {overallGP != null && (
                <div className={`text-xs mt-0.5 ${overallGP >= 65 ? "text-green-600" : overallGP >= 60 ? "text-amber-600" : "text-red-600"}`}>
                  {overallGP >= 65 ? "Healthy" : overallGP >= 60 ? "Watch" : "Needs attention"}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-1">Products</div>
              <div className="text-2xl font-bold" data-testid="text-product-count">{products?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-0.5">in library</div>
            </CardContent>
          </Card>
        </div>

        {venue?.id && <StocktakeTasksCard venueId={venue.id} />}

        {trial.active && trial.daysLeft <= 3 && (
          <Link href="/settings" className="block">
            <div
              className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-3 text-sm flex items-center justify-between gap-3"
              data-testid="banner-trial-ending"
            >
              <span>
                Your free trial ends in {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"}. Pick a plan to keep spot checks, reports and unlimited products.
              </span>
              <span className="font-semibold whitespace-nowrap">Plans →</span>
            </div>
          </Link>
        )}

        {/* Quick actions */}
        <div className="space-y-3">
          {!openStocktake && !hasClosedCount && (
            <Link href="/first-count" className="block">
              <div
                className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 flex items-center justify-between gap-3"
                data-testid="banner-first-count"
              >
                <div>
                  <div className="font-bold text-sm">Do your first count</div>
                  <div className="text-xs text-muted-foreground">
                    Pick your 20 biggest sellers and weigh them. About twenty minutes to your first real number.
                  </div>
                </div>
                <span className="text-sm font-semibold text-primary whitespace-nowrap">Start →</span>
              </div>
            </Link>
          )}
          {openStocktake && (
            <Link href="/stocktake?open=1" className="block">
              <div
                className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-center justify-between gap-3"
                data-testid="banner-open-stocktake"
              >
                <div>
                  <div className="font-bold text-sm">Count in progress{openTotal > 0 ? ` — ${openDone} of ${openTotal} done` : ""}</div>
                  <div className="text-xs text-muted-foreground">
                    Started{" "}
                    {new Date(openStocktake.opened_at || openStocktake.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                    . {openTotal > 0 && openTotal - openDone > 0 ? `${openTotal - openDone} left — a couple of minutes each.` : "Pick up where you left off."}
                  </div>
                </div>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">Resume →</span>
              </div>
            </Link>
          )}
          <Link href={openStocktake ? "/stocktake?open=1" : "/stocktake"} className="block">
            <Button size="lg" className="w-full h-16 text-lg font-bold shadow-md" data-testid="button-home-stocktake">
              {openStocktake ? "Continue stocktake" : "New Stocktake"}
            </Button>
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/spot-check" className="block">
              <Button variant="outline" size="lg" className="w-full h-14 font-semibold border-2 border-primary/25 text-primary" data-testid="button-home-spot-check">
                Spot Check
              </Button>
            </Link>
            <Link href="/delivery" className="block">
              <Button variant="secondary" size="lg" className="w-full h-14 font-semibold" data-testid="button-home-scan-delivery">
                Add Delivery
              </Button>
            </Link>
          </div>
          <Link href="/orders" className="block">
            <Button variant="outline" size="lg" className="w-full h-auto py-2.5 flex-col gap-0 font-semibold border-2 border-primary/25 text-primary whitespace-normal" data-testid="button-home-orders">
              <span>Stock &amp; Orders</span>
              <span className="text-xs font-normal text-muted-foreground">What to order, what's up and down</span>
            </Button>
          </Link>
          <Link href="/library" className="block">
            <Button variant="outline" size="lg" className="w-full h-12 font-semibold" data-testid="button-home-add-bottle">
              Add or manage products
            </Button>
          </Link>
          <Link href="/finances" className="block">
            <Button variant="outline" size="lg" className="w-full h-12 font-semibold" data-testid="button-home-finances">
              Finances — takings, spending &amp; payments
            </Button>
          </Link>
        </div>

        {/* Recent readings strip */}
        {recentReadings.length > 0 && (
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Recent Readings</div>
            <div className="space-y-1.5">
              {recentReadings.map(({ r, productName }) => (
                <div key={r.id} className="flex items-center justify-between bg-card rounded-xl px-3 py-2 border border-border" data-testid={`row-reading-${r.id}`}>
                  <span className="text-sm font-medium truncate flex-1 mr-2">{productName}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{isDraughtProduct((r as any).products ?? (products ?? []).find(p => p.id === (r as any).product_id)) ? draughtAmount(r.ml_remaining) : `${Math.round(r.ml_remaining)}ml`}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!products?.length && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">Your library is empty. Add your first bottle to get started.</p>
            <Link href="/library">
              <Button variant="outline" data-testid="button-home-go-library">Go to Library</Button>
            </Link>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
