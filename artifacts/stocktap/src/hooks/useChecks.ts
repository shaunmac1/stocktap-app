import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { shiftISO } from "@/hooks/useDailyBoard";
import { todaysCompletion, activeSections, sectionCompletion } from "@/lib/checks";
import type { Appliance, TempReading, ApplianceKind, CheckItem, CheckCompletion, CheckSection, Cadence, Refusal } from "@/lib/checks";

export type { Appliance, TempReading, CheckItem, CheckCompletion, Refusal } from "@/lib/checks";

function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// These tables are newer than the generated Database types; access untyped.
const appliancesTable = () => (supabase as any).from("check_appliances");
const tempReadingsTable = () => (supabase as any).from("temp_readings");
const checkItemsTable = () => (supabase as any).from("check_items");
const completionsTable = () => (supabase as any).from("check_completions");
const refusalsTable = () => (supabase as any).from("refusals");

async function currentUserId(): Promise<string | null> {
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

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

// ─── Checklists (opening / closing / cleaning) ──────────────────────────────

/** Active checklist items for a venue. */
export function useCheckItems(venueId: string | undefined) {
  return useQuery({
    queryKey: ["check_items", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await checkItemsTable()
        .select("*")
        .eq("venue_id", venueId!)
        .eq("active", true)
        .order("sort", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CheckItem[];
    },
  });
}

/** Completions in a date window [fromISO, toISO] — wide enough to cover weekly cadence. */
export function useCompletions(venueId: string | undefined, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ["check_completions", venueId, fromISO, toISO],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await completionsTable()
        .select("*")
        .eq("venue_id", venueId!)
        .gte("business_date", fromISO)
        .lte("business_date", toISO)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CheckCompletion[];
    },
  });
}

/** Tick a checklist item done for a date. */
export function useTickItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { venue_id: string; item_id: string; business_date: string; note?: string | null }) => {
      const recorded_by = await currentUserId();
      const { data, error } = await completionsTable()
        .insert({ ...row, done: true, recorded_by })
        .select()
        .single();
      if (error) throw error;
      return data as CheckCompletion;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["check_completions", vars.venue_id] }),
  });
}

/** Undo a tick (delete a completion row). */
export function useUntickItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; venue_id: string }) => {
      const { error } = await completionsTable().delete().eq("id", row.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["check_completions", vars.venue_id] }),
  });
}

/** Admin: add a checklist item. */
export function useAddCheckItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { venue_id: string; section: CheckSection; label: string; cadence: Cadence; sort?: number }) => {
      const { data, error } = await checkItemsTable().insert(row).select().single();
      if (error) throw error;
      return data as CheckItem;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["check_items", vars.venue_id] }),
  });
}

/** Admin: bulk-add the starter checklist. */
export function useAddCheckItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Array<{ venue_id: string; section: CheckSection; label: string; cadence: Cadence; sort?: number }>) => {
      const { data, error } = await checkItemsTable().insert(rows).select();
      if (error) throw error;
      return data as CheckItem[];
    },
    onSuccess: (_d, vars) => { if (vars[0]) qc.invalidateQueries({ queryKey: ["check_items", vars[0].venue_id] }); },
  });
}

/** Admin: deactivate a checklist item (keeps history). */
export function useDeactivateCheckItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; venue_id: string }) => {
      const { error } = await checkItemsTable().update({ active: false }).eq("id", row.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["check_items", vars.venue_id] }),
  });
}

// ─── Refusals register (Challenge 25) ───────────────────────────────────────

/** Refusals for a venue on one business date. */
export function useRefusalsForDate(venueId: string | undefined, businessDate: string) {
  return useQuery({
    queryKey: ["refusals", venueId, businessDate],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await refusalsTable()
        .select("*")
        .eq("venue_id", venueId!)
        .eq("business_date", businessDate)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Refusal[];
    },
  });
}

/**
 * How much of today's checks are still outstanding — for in-app nudges.
 * Composes the appliance/reading/item/completion queries and counts what's left.
 */
export function useOutstandingToday(venueId: string | undefined) {
  const today = localTodayISO();
  const from = shiftISO(today, -6);
  const { data: appliances = [] } = useAppliances(venueId);
  const { data: readings = [] } = useReadingsForDate(venueId, today);
  const { data: items = [] } = useCheckItems(venueId);
  const { data: completions = [] } = useCompletions(venueId, from, today);

  return useMemo(() => {
    const temps = todaysCompletion(appliances, readings).remaining;
    const checklist = activeSections(items).reduce(
      (n, s) => n + sectionCompletion(items, completions, today, s).remaining,
      0,
    );
    return { temps, checklist, total: temps + checklist };
  }, [appliances, readings, items, completions, today]);
}

/** Log a refusal. */
export function useAddRefusal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { venue_id: string; business_date: string; description?: string | null; reason?: string | null; note?: string | null }) => {
      const recorded_by = await currentUserId();
      const { data, error } = await refusalsTable()
        .insert({ ...row, recorded_by })
        .select()
        .single();
      if (error) throw error;
      return data as Refusal;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["refusals", vars.venue_id] }),
  });
}
