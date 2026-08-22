import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { addDaysISO, type RotaShift, type RotaArea } from "@/lib/rota";

export type { RotaShift } from "@/lib/rota";

const rotaTable = () => (supabase as any).from("rota_shifts");

/** All rota shifts for a venue on one day. */
export function useRotaForDate(venueId: string | undefined, dateISO: string) {
  return useQuery({
    queryKey: ["rota", venueId, dateISO],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await rotaTable().select("*").eq("venue_id", venueId!).eq("shift_date", dateISO);
      if (error) throw error;
      return (data ?? []) as RotaShift[];
    },
  });
}

/** Rota shifts across a Mon..Sun week (for the week strip + copy-forward). */
export function useRotaForWeek(venueId: string | undefined, weekStartISO: string) {
  const weekEnd = addDaysISO(weekStartISO, 6);
  return useQuery({
    queryKey: ["rota_week", venueId, weekStartISO],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await rotaTable()
        .select("*")
        .eq("venue_id", venueId!)
        .gte("shift_date", weekStartISO)
        .lte("shift_date", weekEnd);
      if (error) throw error;
      return (data ?? []) as RotaShift[];
    },
  });
}

function invalidateRota(qc: ReturnType<typeof useQueryClient>, venueId: string) {
  qc.invalidateQueries({ queryKey: ["rota", venueId] });
  qc.invalidateQueries({ queryKey: ["rota_week", venueId] });
}

export function useAddRotaShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      venue_id: string; staff_id: string; area: RotaArea; shift_date: string;
      start_time: string; end_time: string | null; until_close: boolean; note?: string | null;
    }) => {
      const { data, error } = await rotaTable().insert(row).select().single();
      if (error) throw error;
      return data as RotaShift;
    },
    onSuccess: (_d, vars) => invalidateRota(qc, vars.venue_id),
  });
}

export function useUpdateRotaShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      id: string; venue_id: string; area?: RotaArea; start_time?: string; end_time?: string | null; until_close?: boolean;
    }) => {
      const { id, venue_id, ...patch } = row;
      const { data, error } = await rotaTable().update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as RotaShift;
    },
    onSuccess: (_d, vars) => invalidateRota(qc, vars.venue_id),
  });
}

export function useDeleteRotaShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; venue_id: string }) => {
      const { error } = await rotaTable().delete().eq("id", row.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (_d, vars) => invalidateRota(qc, vars.venue_id),
  });
}

/** Copy the previous week's rota onto the target week (dates shifted +7 days). */
export function useCopyLastWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { venue_id: string; targetWeekStartISO: string }) => {
      const prevStart = addDaysISO(row.targetWeekStartISO, -7);
      const prevEnd = addDaysISO(prevStart, 6);
      const { data: prev, error: readErr } = await rotaTable()
        .select("*").eq("venue_id", row.venue_id).gte("shift_date", prevStart).lte("shift_date", prevEnd);
      if (readErr) throw readErr;
      const rows = (prev ?? []) as RotaShift[];
      if (rows.length === 0) return { copied: 0 };
      const newRows = rows.map((s) => ({
        venue_id: s.venue_id, staff_id: s.staff_id, area: s.area,
        shift_date: addDaysISO(s.shift_date, 7),
        start_time: s.start_time, end_time: s.end_time, until_close: s.until_close, note: s.note,
      }));
      const { error: insErr } = await rotaTable().insert(newRows);
      if (insErr) throw insErr;
      return { copied: newRows.length };
    },
    onSuccess: (_d, vars) => invalidateRota(qc, vars.venue_id),
  });
}

/** The signed-in staff member's own shifts for a date range (via SECURITY DEFINER RPC). */
export function useMyRota(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ["my_rota", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_rota" as any, { p_from: fromISO, p_to: toISO });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; area: RotaArea; shift_date: string; start_time: string; end_time: string | null; until_close: boolean; note: string | null }>;
    },
  });
}
