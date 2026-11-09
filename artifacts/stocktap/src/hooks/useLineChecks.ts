import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface LineCheckRow {
  id: string; venue_id: string; product_id: string; checked_at: string;
  last_ml: number | null; last_at: string | null; delivered_ml: number; now_ml: number;
  full_containers: number | null; part_pints: number | null; till_units: number | null;
  waste_ml: number; unit_ml: number; gone_ml: number | null; missing_ml: number | null;
  missing_value_pence: number | null; user_id: string | null;
}

const KEY = "stocktap:pending-line-checks";
const readQ = (): LineCheckRow[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const writeQ = (r: LineCheckRow[]) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage blocked */ } };

/** Send any line checks saved while offline. */
export async function flushLineChecks(): Promise<void> {
  const q = readQ();
  if (q.length === 0) return;
  const { error } = await supabase.from("line_checks" as never).upsert(q as never, { onConflict: "id" } as never);
  if (!error) writeQ([]);
}

/** Save checks on the phone first, then to the server. Returns true when the server has them. */
export async function saveLineChecks(rows: LineCheckRow[]): Promise<boolean> {
  writeQ([...readQ(), ...rows]);
  try { await flushLineChecks(); } catch { /* offline: stays queued */ }
  return readQ().length === 0;
}

/** Line checks for the pub, newest first, including any still waiting to sync. */
export function useLineChecks(venueId: string | undefined, days = 60) {
  return useQuery({
    queryKey: ["line-checks", venueId, days],
    queryFn: async () => {
      if (!venueId) return [] as LineCheckRow[];
      try { await flushLineChecks(); } catch { /* offline */ }
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const pending = readQ().filter(r => r.venue_id === venueId);
      const { data, error } = await supabase.from("line_checks" as never).select("*").eq("venue_id", venueId).gte("checked_at", since).order("checked_at", { ascending: false });
      const server = error ? [] : ((data ?? []) as unknown as LineCheckRow[]);
      const ids = new Set(server.map(r => r.id));
      return [...pending.filter(r => !ids.has(r.id)), ...server].sort((a, b) => b.checked_at.localeCompare(a.checked_at));
    },
    enabled: !!venueId,
    staleTime: 15_000,
  });
}

export function useInvalidateLineChecks() {
  const qc = useQueryClient();
  return (venueId: string) => qc.invalidateQueries({ queryKey: ["line-checks", venueId] });
}
