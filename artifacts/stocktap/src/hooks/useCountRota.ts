import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useLatestReadings } from "@/hooks/api";
import { readRota, rotaToday, type RotaToday, type CountRota } from "@/lib/count-rota";

/** Today's count for this pub, from the rota in Settings and what's actually been counted. */
export function useRotaToday(): { rota: CountRota; on: boolean; status: RotaToday | null; weeklyTarget: number | null } {
  const { venue } = useAuth();
  const { data: products } = useProducts(venue?.id);
  const { data: readings = [] } = useLatestReadings(venue?.id);
  const features = (venue as any)?.features ?? {};
  const rota = useMemo(() => readRota(features), [JSON.stringify(features?.count_rota ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = useMemo(() => {
    if (!products) return null;
    const last: Record<string, string> = {};
    for (const r of readings as any[]) {
      if (r.is_delivery) continue;
      if (!last[r.product_id] || r.reading_at > last[r.product_id]) last[r.product_id] = r.reading_at;
    }
    return rotaToday(rota, products as any[], last);
  }, [products, readings, rota]);
  const t = Number(features.weekly_line_target);
  return { rota, on: features.daily_count !== false, status, weeklyTarget: Number.isFinite(t) && t > 0 ? Math.round(t) : null };
}

export interface StaffCount { stocktakeId: string; at: string; lines: number; by: string }

/** Counts finished by someone other than me in the last two days (for the owner's Home). */
export function useStaffCounts(venueId: string | undefined, myId: string | undefined) {
  return useQuery({
    queryKey: ["staff-counts", venueId, myId],
    enabled: !!venueId && !!myId,
    staleTime: 60_000,
    queryFn: async (): Promise<StaffCount[]> => {
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const { data, error } = await supabase.from("readings")
        .select("stocktake_id, user_id, reading_at, product_id")
        .eq("venue_id", venueId!).gte("reading_at", since).not("stocktake_id", "is", null).neq("user_id", myId!)
        .order("reading_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const by = new Map<string, { at: string; user: string; products: Set<string> }>();
      for (const r of (data ?? []) as any[]) {
        const g = by.get(r.stocktake_id) ?? { at: r.reading_at, user: r.user_id, products: new Set<string>() };
        g.products.add(r.product_id); if (r.reading_at > g.at) g.at = r.reading_at;
        by.set(r.stocktake_id, g);
      }
      if (by.size === 0) return [];
      const users = Array.from(new Set(Array.from(by.values()).map(g => g.user)));
      const { data: staff } = await (supabase as any).from("staff").select("name, user_id").eq("venue_id", venueId!).in("user_id", users);
      const names = new Map<string, string>(((staff ?? []) as any[]).map(s => [s.user_id, s.name]));
      return Array.from(by.entries()).map(([stocktakeId, g]) => ({ stocktakeId, at: g.at, lines: g.products.size, by: names.get(g.user) ?? "Your team" }))
        .sort((a, b) => (a.at < b.at ? 1 : -1));
    },
  });
}
