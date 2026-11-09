import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CashUp, CashUpUpsert } from "@/lib/daily-board";

// Re-export the pure helpers so pages can import everything from one place.
export {
  shiftISO,
  buildComparisons,
  entertainmentRoi,
  recentTrend,
  weekStartOf,
  weekRows,
  monthRows,
  parseTakingsPaste,
} from "@/lib/daily-board";
export type { CashUp, CashUpUpsert, Comparisons, EntertainmentRoi, TrendPoint, WeekRow, MonthRow } from "@/lib/daily-board";

// cash_ups is newer than the generated Database types; access it untyped and
// cast results to CashUp below. (Regenerate database.types.ts to remove this.)
const cashUpsTable = () => (supabase as any).from("cash_ups");

/** All cash-ups for a venue, newest business_date first. */
export function useCashUps(venueId: string | undefined) {
  return useQuery({
    queryKey: ["cash_ups", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      // Years of nightly takings run past the server's 1,000-row page, so read it in pages.
      const out: CashUp[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await cashUpsTable()
          .select("*")
          .eq("venue_id", venueId!)
          .order("business_date", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        out.push(...((data ?? []) as CashUp[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
}

/** Upsert a cash-up (one row per venue per business_date). */
export function useSaveCashUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: CashUpUpsert) => {
      const payload = { ...row, updated_at: new Date().toISOString() };
      const { data, error } = await cashUpsTable()
        .upsert(payload, { onConflict: "venue_id,business_date" })
        .select()
        .single();
      if (error) throw error;
      return data as CashUp;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cash_ups", vars.venue_id] });
    },
  });
}

/** Bring in past nightly takings in one go (only the total is set; anything else on those days is kept). */
export function useImportCashUps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ venue_id, rows }: { venue_id: string; rows: { date: string; total: number }[] }) => {
      const now = new Date().toISOString();
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(r => ({ venue_id, business_date: r.date, total_taken: r.total, updated_at: now }));
        const { error } = await cashUpsTable().upsert(chunk, { onConflict: "venue_id,business_date" });
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["cash_ups", vars.venue_id] }),
  });
}
