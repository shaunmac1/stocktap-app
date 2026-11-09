import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { emptyTillMemory, readTillMemory, type TillMemory } from "@/lib/till-matching";

/**
 * Till-import matches are remembered per pub in `till_import_memory` (one row per venue,
 * see supabase/till-import-migration.sql). Until that table exists on a server, or when
 * offline, the same data is kept in this browser's storage so nothing is lost.
 */
const MEM_TABLE = "till_import_memory";
const localKey = (venueId: string) => `stocktap:till-memory:${venueId}`;
/** Suffix on sales_records.product_name_raw so a re-import can replace the earlier one. */
export const TILL_MARKER = " [till]";

function readLocal(venueId: string): TillMemory | null {
  try {
    const raw = localStorage.getItem(localKey(venueId));
    return raw ? readTillMemory(raw) : null;
  } catch { return null; }
}
function writeLocal(venueId: string, mem: TillMemory) {
  try { localStorage.setItem(localKey(venueId), JSON.stringify(mem)); } catch { /* private mode */ }
}

function merge(a: TillMemory | null, b: TillMemory | null): TillMemory {
  return {
    version: 1,
    matches: { ...(a?.matches ?? {}), ...(b?.matches ?? {}) },
    mappings: { ...(a?.mappings ?? {}), ...(b?.mappings ?? {}) },
  };
}

export function useTillMemory(venueId: string | undefined) {
  return useQuery({
    queryKey: ["till-memory", venueId],
    queryFn: async (): Promise<TillMemory> => {
      if (!venueId) return emptyTillMemory();
      const local = readLocal(venueId);
      try {
        const { data, error } = await (supabase.from(MEM_TABLE as any) as any)
          .select("data")
          .eq("venue_id", venueId)
          .limit(1);
        if (error) return local ?? emptyTillMemory();
        const server = data?.[0]?.data ? readTillMemory(data[0].data) : null;
        return merge(local, server); // server wins where both have a key
      } catch {
        return local ?? emptyTillMemory();
      }
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });
}

export function useSaveTillMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ venueId, memory }: { venueId: string; memory: TillMemory }) => {
      writeLocal(venueId, memory);
      try {
        await (supabase.from(MEM_TABLE as any) as any)
          .upsert({ venue_id: venueId, data: memory, updated_at: new Date().toISOString() }, { onConflict: "venue_id" });
      } catch { /* kept locally; synced next save */ }
      return memory;
    },
    onSuccess: (memory, { venueId }) => qc.setQueryData(["till-memory", venueId], memory),
  });
}

export interface TillSaleRow {
  product_id: string | null;
  product_name_raw: string;
  quantity_sold: number;
  revenue_pence: number | null;
  unit_price_pence: number | null;
}

/** Till rows already saved for a period (so we can offer to replace rather than double up). */
export function useTillSalesInPeriod(venueId: string | undefined, start?: string, end?: string) {
  return useQuery({
    queryKey: ["till-sales-in-period", venueId, start, end],
    queryFn: async () => {
      if (!venueId || !start || !end) return [];
      const { data, error } = await supabase
        .from("sales_records")
        .select("id, product_id, quantity_sold, revenue_pence, sale_date, product_name_raw")
        .eq("venue_id", venueId)
        .gte("sale_date", start)
        .lte("sale_date", end)
        .like("product_name_raw", `%${TILL_MARKER.trim()}`);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId && !!start && !!end,
    staleTime: 10_000,
  });
}

export function useSaveTillSales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ venueId, saleDate, periodStart, rows, replace }: {
      venueId: string; saleDate: string; periodStart: string; rows: TillSaleRow[]; replace: boolean;
    }) => {
      if (replace) {
        const { error } = await supabase
          .from("sales_records")
          .delete()
          .eq("venue_id", venueId)
          .gte("sale_date", periodStart)
          .lte("sale_date", saleDate)
          .like("product_name_raw", `%${TILL_MARKER.trim()}`);
        if (error) throw error;
      }
      if (!rows.length) return 0;
      const { data, error } = await supabase
        .from("sales_records")
        .insert(rows.map(r => ({
          venue_id: venueId,
          product_id: r.product_id ?? undefined,
          product_name_raw: r.product_name_raw.endsWith(TILL_MARKER) ? r.product_name_raw : r.product_name_raw + TILL_MARKER,
          quantity_sold: r.quantity_sold,
          revenue_pence: r.revenue_pence ?? undefined,
          unit_price_pence: r.unit_price_pence ?? undefined,
          sale_date: saleDate,
        })))
        .select("id");
      if (error) throw error;
      return data?.length ?? rows.length;
    },
    onSuccess: (_n, { venueId }) => {
      qc.invalidateQueries({ queryKey: ["sales-records", venueId] });
      qc.invalidateQueries({ queryKey: ["till-sales-in-period", venueId] });
    },
  });
}
