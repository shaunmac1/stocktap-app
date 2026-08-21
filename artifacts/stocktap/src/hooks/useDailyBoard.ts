import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CashUp, CashUpUpsert } from "@/lib/daily-board";

// Re-export the pure helpers so pages can import everything from one place.
export {
  shiftISO,
  buildComparisons,
  entertainmentRoi,
  recentTrend,
} from "@/lib/daily-board";
export type { CashUp, CashUpUpsert, Comparisons, EntertainmentRoi, TrendPoint } from "@/lib/daily-board";

// cash_ups is newer than the generated Database types; access it untyped and
// cast results to CashUp below. (Regenerate database.types.ts to remove this.)
const cashUpsTable = () => (supabase as any).from("cash_ups");

/** All cash-ups for a venue, newest business_date first. */
export function useCashUps(venueId: string | undefined) {
  return useQuery({
    queryKey: ["cash_ups", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await cashUpsTable()
        .select("*")
        .eq("venue_id", venueId!)
        .order("business_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CashUp[];
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
