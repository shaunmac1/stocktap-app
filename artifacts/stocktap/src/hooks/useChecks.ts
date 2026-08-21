import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Appliance, TempReading, ApplianceKind } from "@/lib/checks";

export type { Appliance, TempReading } from "@/lib/checks";

// check_appliances / temp_readings are newer than the generated Database types.
const appliancesTable = () => (supabase as any).from("check_appliances");
const tempReadingsTable = () => (supabase as any).from("temp_readings");

/** Active appliances for a venue, in display order. */
export function useAppliances(venueId: string | undefined) {
  return useQuery({
    queryKey: ["appliances", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await appliancesTable()
        .select("*")
        .eq("venue_id", venueId!)
        .eq("active", true)
        .order("sort", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Appliance[];
    },
  });
}

/** Temperature readings for a venue on one business date. */
export function useReadingsForDate(venueId: string | undefined, businessDate: string) {
  return useQuery({
    queryKey: ["temp_readings", venueId, businessDate],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await tempReadingsTable()
        .select("*")
        .eq("venue_id", venueId!)
        .eq("business_date", businessDate)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TempReading[];
    },
  });
}

/** Record a temperature reading. */
export function useAddReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      venue_id: string;
      appliance_id: string;
      business_date: string;
      reading_c: number;
      note?: string | null;
    }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { data, error } = await tempReadingsTable()
        .insert({ ...row, recorded_by: uid })
        .select()
        .single();
      if (error) throw error;
      return data as TempReading;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["temp_readings", vars.venue_id, vars.business_date] }),
  });
}

/** Add an appliance to check. */
export function useAddAppliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      venue_id: string;
      name: string;
      kind: ApplianceKind;
      min_c: number | null;
      max_c: number | null;
      sort?: number;
    }) => {
      const { data, error } = await appliancesTable().insert(row).select().single();
      if (error) throw error;
      return data as Appliance;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["appliances", vars.venue_id] }),
  });
}

/** Bulk-add appliances (used by the "add the usual ones" starter button). */
export function useAddAppliances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Array<{
      venue_id: string;
      name: string;
      kind: ApplianceKind;
      min_c: number | null;
      max_c: number | null;
      sort?: number;
    }>) => {
      const { data, error } = await appliancesTable().insert(rows).select();
      if (error) throw error;
      return data as Appliance[];
    },
    onSuccess: (_d, vars) => {
      if (vars[0]) qc.invalidateQueries({ queryKey: ["appliances", vars[0].venue_id] });
    },
  });
}

/** Soft-delete (deactivate) an appliance so its history is kept. */
export function useDeactivateAppliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; venue_id: string }) => {
      const { error } = await appliancesTable().update({ active: false }).eq("id", row.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["appliances", vars.venue_id] }),
  });
}
