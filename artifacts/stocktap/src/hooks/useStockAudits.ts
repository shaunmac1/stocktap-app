import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { StoredAudit } from "@/lib/stock-orders";
import type { ParsedAudit } from "@/lib/venners-audit";

export interface StockAuditRow extends StoredAudit {
  venue_id: string;
  source: string;
  file_name: string | null;
  created_at: string;
}

export function useStockAudits(venueId: string | undefined) {
  return useQuery({
    queryKey: ["stock-audits", venueId],
    queryFn: async () => {
      if (!venueId) return [] as StockAuditRow[];
      const { data, error } = await supabase
        .from("stock_audits" as never)
        .select("*")
        .eq("venue_id", venueId)
        .order("period_end", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StockAuditRow[];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });
}

export function useSaveStockAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ venueId, audit, fileName }: { venueId: string; audit: ParsedAudit; fileName: string | null }) => {
      const s = audit.summary;
      if (!s.periodStart || !s.periodEnd) throw new Error("Couldn't find the audit dates in this PDF.");
      const row = {
        venue_id: venueId,
        source: "venners",
        period_start: s.periodStart,
        period_end: s.periodEnd,
        days: s.days ?? Math.round((Date.parse(s.periodEnd) - Date.parse(s.periodStart)) / 864e5),
        summary: s,
        lines: audit.lines,
        file_name: fileName,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("stock_audits" as never)
        .upsert(row as never, { onConflict: "venue_id,source,period_start,period_end" })
        .select("id")
        .single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["stock-audits", v.venueId] }),
  });
}

export function useDeleteStockAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; venueId: string }) => {
      const { error } = await supabase.from("stock_audits" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["stock-audits", v.venueId] }),
  });
}

/** Readings from the given (closed) stocktakes, for building the order list from StockTap's own counts. */
export function useStocktakeReadingsFor(venueId: string | undefined, stocktakeIds: string[]) {
  const key = [...stocktakeIds].sort().join(",");
  return useQuery({
    queryKey: ["readings-for-stocktakes", venueId, key],
    queryFn: async () => {
      if (!venueId || !stocktakeIds.length) return [] as Array<{ stocktake_id: string | null; product_id: string; ml_remaining: number | null; count: number | null }>;
      const out: any[] = [];
      for (let i = 0; i < stocktakeIds.length; i += 50) {
        const { data, error } = await supabase
          .from("readings")
          .select("stocktake_id, product_id, ml_remaining, count")
          .eq("venue_id", venueId)
          .in("stocktake_id", stocktakeIds.slice(i, i + 50));
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return out;
    },
    enabled: !!venueId && stocktakeIds.length >= 2,
  });
}
