import React, { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useLatestReadings, useLatestReadingsByProduct, useStocktakes } from "@/hooks/api";
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
import { isVolumeCountingMethod } from "@/lib/inventory-reporting";
import { formatDistanceToNow } from "date-fns";
import { TrendingDown, TrendingUp, Settings } from "lucide-react";
import { StocktakeTasksCard } from "@/components/StocktakeTasksCard";
import { venueTrial } from "@/hooks/useSubscription";

export default function Home() {
  const { venue } = useAuth();
  const { data: products } = useProducts(venue?.id);
  // Ordered feed for recent activity — still uses the capped hook (last 100 events is fine here)
  const { data: allReadings } = useLatestReadings(venue?.id);
  // Full latest-per-product map for accurate value calculations — no 100-reading cap
  const { data: latestByProduct = {} } = useLatestReadingsByProduct(venue?.id);
  const { data: stocktakes } = useStocktakes(venue?.id);
  const openStocktake = (stocktakes ?? []).find((s: any) => s.status === "open");
  const trial = venueTrial(venue);

  const measureMl = venue?.measure_ml ?? 25;

  // Total stock value
  const totalValue = useMemo(() => {
    if (!products) return 0;
    return products.reduce((sum, p) => {
      const r = latestByProduct[p.id];
      if (!r || !p.cost_price) return sum;
      // Draught is stored as unit "count" but read in ml (keg weight, dipstick),
      // so it has to be valued by volume like a bottle, not by count.
      if (p.unit === "count" && !isVolumeCountingMethod(p.counting_method)) {
        return sum + calcCountValuation(r.count ?? 0, p.cost_price);
      }
      return sum + calcWeighValuation(r.ml_remaining, productCapacityMl(p), p.cost_price);
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

      <div className="p-4 space-y-4">
        {/* Stock value hero */}
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-primary-foreground/75">Total Stock Value</div>
            <div className="text-5xl font-bold mt-1" data-testid="text-stock-value">{formatGBP(totalValue)}</div>
            {lastUpdated && (
              <div className="text-xs text-primary-foreground/60 mt-2">Updated {lastUpdated}</div>
            )}
          </CardContent>
        </Card>

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
                Your Pro trial ends in {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"}. Pick a plan to keep spot checks, reports and unlimited products.
              </span>
              <span className="font-semibold whitespace-nowrap">Plans →</span>
            </div>
          </Link>
        )}

        {/* Quick actions */}
        <div className="space-y-3">
          {openStocktake && (
            <Link href="/stocktake" className="block">
              <div
                className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-center justify-between gap-3"
                data-testid="banner-open-stocktake"
              >
                <div>
                  <div className="font-bold text-sm">Count in progress</div>
                  <div className="text-xs text-muted-foreground">
                    Started{" "}
                    {new Date(openStocktake.opened_at || openStocktake.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                    . Pick up where you left off.
                  </div>
                </div>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">Resume →</span>
              </div>
            </Link>
          )}
          <Link href="/stocktake" className="block">
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
            <Link href="/invoice-scan" className="block">
              <Button variant="secondary" size="lg" className="w-full h-14 font-semibold" data-testid="button-home-scan-delivery">
                Scan Delivery
              </Button>
            </Link>
          </div>
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
                  <span className="text-xs text-muted-foreground tabular-nums">{Math.round(r.ml_remaining)}ml</span>
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
    </div>
  );
}
