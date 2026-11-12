import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useLatestReadings } from "@/hooks/api";
import { useDeliveries } from "@/hooks/useDeliveries";
import { isHidden } from "@/lib/hidden-products";
import { isDraughtProduct, formatGauge } from "@/lib/draught-gauge";
import { daysLeft, daysLeftLabel, kegsToOrder, LOOKBACK_DAYS, type DaysLeft } from "@/lib/days-left";

const P = 568.261;
const COVER_KEY = "stocktap:days-left-cover";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "3 kegs + 4 gal 0 pt" from a volume and the container size. */
export function kegsAndPart(ml: number, containerL: number | null | undefined, word: string): string {
  const pints = Math.round(ml / P);
  if (!containerL) return formatGauge(pints);
  const cap = Math.round((Number(containerL) * 1000) / P);
  const full = Math.floor(pints / cap), part = pints - full * cap;
  const fullTxt = `${full} ${word}${full === 1 ? "" : "s"}`;
  return part > 0 ? `${fullTxt} + ${formatGauge(part)}` : fullTxt;
}

export default function DaysLeftPage() {
  const { venue } = useAuth();
  const { data: products } = useProducts(venue?.id);
  const { data: readings = [] } = useLatestReadings(venue?.id);
  const since = useMemo(() => new Date(Date.now() - (LOOKBACK_DAYS + 2) * 86_400_000).toISOString().slice(0, 10), []);
  const { data: deliveries = [], isError: deliveriesFailed } = useDeliveries(venue?.id, since);
  const [cover, setCover] = useState<number>(() => { try { return Number(localStorage.getItem(COVER_KEY)) || 7; } catch { return 7; } });
  const pickCover = (n: number) => { setCover(n); try { localStorage.setItem(COVER_KEY, String(n)); } catch { /* private mode */ } };

  const rows = useMemo(() => {
    const lines = ((products ?? []) as any[]).filter(p => !isHidden(p) && isDraughtProduct(p) && p.container_l);
    return lines.map(p => {
      const counts = (readings as any[]).filter(r => r.product_id === p.id && !r.is_delivery).map(r => ({ ml: Number(r.ml_remaining), at: r.reading_at as string }));
      const dels = (deliveries as any[]).filter(d => d.product_id === p.id).map(d => ({ ml: Number(d.quantity_ml) || 0, at: d.delivered_at as string }));
      const d = daysLeft(counts, dels);
      const word = p.container_type === "cask" || p.counting_method === "dipstick" ? "cask" : "keg";
      return { p, d, word, order: kegsToOrder(d, Number(p.container_l) * 1000, cover) };
    }).sort((a, b) => rank(a.d) - rank(b.d) || a.p.name.localeCompare(b.p.name));
  }, [products, readings, deliveries, cover]);

  const counted = rows.filter(r => r.d.status !== "no-count");
  const toOrder = rows.filter(r => (r.order ?? 0) > 0);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/"><button className="p-2 -ml-2" aria-label="Back" data-testid="button-back-home"><ArrowLeft className="w-5 h-5" /></button></Link>
          <div>
            <h1 className="text-xl font-bold text-primary">Days left</h1>
            <p className="text-xs text-muted-foreground">Kegs and casks. What you've got, how fast it's going, when it runs out.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="rounded-xl border border-border bg-card p-3 text-sm" data-testid="card-cover">
          <div className="font-semibold">Order to last me</div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[4, 7, 10, 14].map(n => (
              <button key={n} type="button" onClick={() => pickCover(n)} aria-pressed={cover === n}
                className={`h-11 rounded-lg border font-bold ${cover === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`} data-testid={`button-cover-${n}`}>{n} days</button>
            ))}
          </div>
          <div className="mt-2 font-semibold" data-testid="text-order-summary">
            {counted.length === 0 ? "Count your kegs twice, a day or more apart, and the days left show here."
              : toOrder.length === 0 ? `Nothing needed to cover ${cover} days at the rate it's going.`
              : `To cover ${cover} days: ${toOrder.map(r => `${r.order} × ${r.p.name}`).join(", ")}`}
          </div>
        </div>

        {deliveriesFailed && <p className="text-xs font-semibold text-[#B26A00]" data-testid="warn-no-deliveries">No signal, so deliveries since your last count may be missing from these figures.</p>}

        {rows.map(({ p, d, word, order }) => {
          const tone = d.status === "ok" && d.days! < 4 ? "border-[#E5544B]/60 bg-[#E5544B]/10" : d.status === "ok" && d.days! < 8 ? "border-[#E0A343]/60 bg-[#E0A343]/10" : "border-border bg-card";
          return (
            <div key={p.id} className={`rounded-xl border p-3 ${tone}`} data-testid={`days-${p.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm" data-testid={`days-stock-${p.id}`}>
                    {d.status === "no-count" && d.stockMl <= 0 ? "Not counted yet" : `${kegsAndPart(d.stockMl, p.container_l, word)} (${Math.round(d.stockMl / P)} pints)`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold tabular-nums" data-testid={`days-left-${p.id}`}>
                    {d.status === "ok" ? daysLeftLabel(d.days!) : d.status === "went-up" ? "Check count" : d.status === "not-moving" ? "Not moving" : "No rate yet"}
                  </div>
                  {order != null && order > 0 && <div className="text-xs font-bold text-primary" data-testid={`days-order-${p.id}`}>order {order} {word}{order === 1 ? "" : "s"}</div>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1" data-testid={`days-why-${p.id}`}>
                {d.status === "ok" && `Going at ${Math.round(d.perDayMl! / P)} pints a day (${Math.round(d.usedMl! / P)} pints from ${day(d.fromAt!)} to ${day(d.lastAt!)}).`}
                {d.status === "went-up" && `Stock went up ${Math.round(-d.usedMl! / P)} pints between ${day(d.fromAt!)} and ${day(d.lastAt!)} with no delivery on record. One of those counts is out, or a delivery wasn't put in.`}
                {d.status === "not-moving" && `Nothing gone between ${day(d.fromAt!)} and ${day(d.lastAt!)}.`}
                {d.status === "no-history" && `Counted once, on ${day(d.lastAt!)}. Count it again another day and the days left show.`}
                {d.status === "no-count" && (d.stockMl > 0 ? "Delivered but never counted." : "Count it to start.")}
                {d.deliveredSinceMl > 0 && d.status !== "no-count" && ` Includes ${formatGauge(d.deliveredSinceMl / P)} delivered since.`}
                {d.status === "ok" && d.spanDays! < 5 && " Only a few days of history, so a busy weekend will go faster than this."}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No keg or cask lines yet.</p>}
      </div>
    </div>
  );
}

function rank(d: DaysLeft): number {
  if (d.status === "ok") return d.days!;
  if (d.status === "went-up") return 9000;
  if (d.status === "not-moving") return 9100;
  if (d.status === "no-history") return 9200;
  return 9300;
}
