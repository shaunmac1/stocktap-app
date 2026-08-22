import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FinanceEntry } from "@/lib/finance";

export type { FinanceEntry } from "@/lib/finance";

const table = () => (supabase as any).from("finance_entries");

export function useFinanceEntries(venueId: string | undefined) {
  return useQuery({
    queryKey: ["finance", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data, error } = await table()
        .select("*")
        .eq("venue_id", venueId!)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FinanceEntry[];
    },
  });
}

type NewEntry = Omit<FinanceEntry, "id" | "created_at" | "updated_at">;

function invalidate(qc: ReturnType<typeof useQueryClient>, venueId: string) {
  qc.invalidateQueries({ queryKey: ["finance", venueId] });
}

export function useAddFinanceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: NewEntry) => {
      const { data, error } = await table().insert(row).select().single();
      if (error) throw error;
      return data as FinanceEntry;
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.venue_id),
  });
}

export function useUpdateFinanceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<FinanceEntry> & { id: string; venue_id: string }) => {
      const { id, venue_id, created_at, updated_at, ...patch } = row;
      const { data, error } = await table().update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as FinanceEntry;
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.venue_id),
  });
}

export function useDeleteFinanceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; venue_id: string }) => {
      const { error } = await table().delete().eq("id", row.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.venue_id),
  });
}

/** Bulk insert (used by the spreadsheet importer). Inserts in chunks to stay under limits. */
export function useImportFinanceEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: NewEntry[]) => {
      if (!rows.length) return 0;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error, count } = await table().insert(chunk, { count: "exact" });
        if (error) throw error;
        inserted += count ?? chunk.length;
      }
      return inserted;
    },
    onSuccess: (_d, vars) => { if (vars[0]) invalidate(qc, vars[0].venue_id); },
  });
}
