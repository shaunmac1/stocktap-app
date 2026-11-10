import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import { useDeliveries } from "@/hooks/useDeliveries";
import { useStockAudits } from "@/hooks/useStockAudits";
import { buildPatterns, lineKey, matchAuditLine, type Basis, type OrderProductLike } from "@/lib/stock-orders";
import { auditRatesByProduct, forecastLine, type ForecastProduct, type ForecastReading, type LineForecast } from "@/lib/line-forecast";

const HISTORY_DAYS = 120;

function load(k: string) { try { return localStorage.getItem(k); } catch { return null; } }

/** The Orders page settings, so the Library lines and the Orders page always agree. */
export function orderSettings(): { cover: number; busy: number; basis: Basis } {
  const c = Number(load("orders:cover"));
  const basisId = load("orders:basis") || "latest";
  return {
    cover: c >= 3 && c <= 28 ? c : 10,
    busy: Number(load("orders:busy")) || 0,
    basis: basisId === "latest" ? { kind: "latest" } : basisId === "average" ? { kind: "average" } : basisId === "busiest" ? { kind: "busiest" } : { kind: "period", auditId: basisId },
  };
}

/** Every count of every line in the last 120 days. Works offline from the phone's copy. */
export function useReadingHistory(venueId: string | undefined) {
  return useQuery({
    queryKey: ["reading-history", venueId],
    queryFn: async () => {
      if (!venueId) return [] as ForecastReading[];
      const since = new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString();
      try {
        const out: ForecastReading[] = [];
        for (let from = 0; from < 20000; from += 1000) {
          const { data, error } = await supabase
            .from("readings")
            .select("product_id, ml_remaining, reading_at")
            .eq("venue_id", venueId)
            .gte("reading_at", since)
            .order("reading_at", { ascending: false })
            .range(from, from + 999);
          if (error) throw error;
          out.push(...((data ?? []) as ForecastReading[]));
          if (!data || data.length < 1000) break;
        }
        return out;
      } catch {
        const local = await db.readings.where("venue_id").equals(venueId).toArray();
        return local.filter(r => r.reading_at >= since).map(r => ({ product_id: r.product_id, ml_remaining: Number(r.ml_remaining), reading_at: r.reading_at }));
      }
    },
    enabled: !!venueId,
    staleTime: 30_000,
  });
}

/** Days left and what to order, for every line, keyed by product id. */
export function useLineForecasts(venueId: string | undefined, products: ForecastProduct[] | undefined): Map<string, LineForecast> {
  const { data: history = [] } = useReadingHistory(venueId);
  const since = useMemo(() => new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString().slice(0, 10), []);
  const { data: deliveries = [] } = useDeliveries(venueId, since);
  const { data: audits = [] } = useStockAudits(venueId);

  return useMemo(() => {
    const out = new Map<string, LineForecast>();
    if (!products?.length) return out;
    const settings = orderSettings();
    // Audit sales speeds, matched to library lines the same way the Orders page does.
    let auditRates = new Map<string, number>();
    if (audits.length) {
      const { order, lines } = buildPatterns(audits);
      const latest = order[order.length - 1];
      const byKey = new Map<string, ForecastProduct>();
      const live = new Set<string>();
      for (const l of latest?.lines ?? []) {
        if (l.delist) continue;
        const key = lineKey(l.name); live.add(key);
        const p = matchAuditLine(l, products as unknown as OrderProductLike[]);
        if (p) byKey.set(key, p as unknown as ForecastProduct);
      }
      const current = new Map([...lines].filter(([k]) => live.has(k)));
      auditRates = auditRatesByProduct(current, order, settings.basis, settings.busy, k => byKey.get(k) ?? null);
    }
    const hByP = new Map<string, ForecastReading[]>();
    for (const r of history) { const a = hByP.get(r.product_id) ?? []; a.push(r); hByP.set(r.product_id, a); }
    const dByP = new Map<string, typeof deliveries>();
    for (const d of deliveries as any[]) { const a = dByP.get(d.product_id) ?? []; a.push(d); dByP.set(d.product_id, a); }
    for (const p of products) {
      out.set(p.id, forecastLine({
        product: p,
        history: hByP.get(p.id) ?? [],
        deliveries: (dByP.get(p.id) ?? []) as any,
        auditRateMl: auditRates.get(p.id) ?? null,
        coverDays: settings.cover,
      }));
    }
    return out;
  }, [products, history, deliveries, audits]);
}
