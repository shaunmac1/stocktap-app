import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { deriveCadenceStatus, sortCadenceStatuses, type CadenceHealth } from "@/lib/cadence";

export interface StocktakeCadenceRow {
  schedule_id: string;
  venue_id: string;
  count_location_id: string | null;
  scope_name: string;
  cadence_days: number;
  preferred_weekday: number | null;
  reminder_time: string;
  assigned_user_id: string | null;
  enabled: boolean;
  last_counted_at: string | null;
}

export interface DecoratedStocktakeCadenceRow extends StocktakeCadenceRow {
  health: CadenceHealth;
  nextDueAt: Date | null;
  daysUntilDue: number | null;
  statusLabel: string;
}

export interface SaveStocktakeScheduleArgs {
  p_venue_id: string;
  p_count_location_id: string | null;
  p_cadence_days: number;
  p_preferred_weekday: number | null;
  p_reminder_time: string;
  p_assigned_user_id: string | null;
  p_enabled: boolean;
}

export function decorateStocktakeCadenceRows(
  rows: StocktakeCadenceRow[],
  now = new Date(),
): DecoratedStocktakeCadenceRow[] {
  return sortCadenceStatuses(rows.map((row) => {
    const status = deriveCadenceStatus({
      enabled: row.enabled,
      cadenceDays: row.cadence_days,
      preferredWeekday: row.preferred_weekday,
      lastCountedAt: row.last_counted_at,
      now,
    });

    return {
      ...row,
      health: status.health,
      nextDueAt: status.nextDueAt,
      daysUntilDue: status.daysUntilDue,
      statusLabel: status.label,
    };
  }));
}

export function useStocktakeCadenceStatus(venueId: string | undefined) {
  return useQuery({
    queryKey: ["stocktake-cadence", venueId],
    queryFn: async () => {
      if (!venueId) return [] as StocktakeCadenceRow[];
      const { data, error } = await supabase.rpc(
        "get_stocktake_cadence_status" as never,
        { p_venue_id: venueId } as never,
      );
      if (error) {
        if ((error as any).message?.includes("does not exist")) return [] as StocktakeCadenceRow[];
        throw error;
      }
      return (data ?? []) as unknown as StocktakeCadenceRow[];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });
}

export function useSaveStocktakeSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveStocktakeScheduleArgs) => {
      const { data, error } = await supabase.rpc(
        "save_stocktake_schedule" as never,
        args as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: ["stocktake-cadence", args.p_venue_id] });
    },
  });
}
