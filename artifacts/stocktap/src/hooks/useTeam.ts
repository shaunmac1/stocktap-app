import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Staff, Shift } from "@/lib/wages";

export type { Staff, Shift } from "@/lib/wages";

// staff / shifts are newer than the generated Database types; access untyped.
const staffTable = () => (supabase as any).from("staff");
const shiftsTable = () => (supabase as any).from("shifts");

/** Active staff for a venue, alphabetical. */
export function useStaff(venueId: string | undefined) {
  return useQuery({
    queryKey: ["staff", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await staffTable()
        .select("*")
        .eq("venue_id", venueId!)
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Staff[];
    },
  });
}

/** All shifts for a venue on one business date (open + closed). */
export function useShiftsForDate(venueId: string | undefined, businessDate: string) {
  return useQuery({
    queryKey: ["shifts", venueId, businessDate],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await shiftsTable()
        .select("*")
        .eq("venue_id", venueId!)
        .eq("business_date", businessDate)
        .order("clock_in", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });
}

/** Every open (not-clocked-out) shift for a venue, any date — to catch forgotten clock-outs. */
export function useOpenShifts(venueId: string | undefined) {
  return useQuery({
    queryKey: ["shifts_open", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await shiftsTable()
        .select("*")
        .eq("venue_id", venueId!)
        .is("clock_out", null)
        .order("clock_in", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });
}

/** Close a shift at a specific time (e.g. the venue close, to fix a forgotten clock-out). */
export function useCloseShiftAt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; venue_id: string; at: string }) => {
      const { data, error } = await shiftsTable()
        .update({ clock_out: row.at, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select()
        .single();
      if (error) throw error;
      return data as Shift;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["shifts_open", vars.venue_id] });
      qc.invalidateQueries({ queryKey: ["shifts", vars.venue_id] });
    },
  });
}

export function useAddStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { venue_id: string; name: string; hourly_rate: number | null }) => {
      const { data, error } = await staffTable().insert(row).select().single();
      if (error) throw error;
      return data as Staff;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["staff", vars.venue_id] }),
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      venue_id: string;
      staff_id: string;
      business_date: string;
      rate_snapshot: number | null;
    }) => {
      const { data, error } = await shiftsTable()
        .insert({ ...row, clock_in: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      return data as Shift;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["shifts", vars.venue_id, vars.business_date] }),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; venue_id: string; business_date: string }) => {
      const { data, error } = await shiftsTable()
        .update({ clock_out: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select()
        .single();
      if (error) throw error;
      return data as Shift;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["shifts", vars.venue_id, vars.business_date] }),
  });
}
