import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RecordManualDeliveryArgs } from "@/lib/deliveries";

export interface DeliveryRow {
  id: string;
  venue_id: string;
  product_id: string;
  entry_method: "invoice" | "ledger" | "mid_stocktake";
  quantity: number;
  unit_cost: number | null;
  invoice_ref: string | null;
  delivered_at: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  quantity_ml: number | null;
  total_cost_pence: number | null;
  supplier: string | null;
  to_location_id: string | null;
  notes: string | null;
  client_reference: string | null;
  stock_movement_id: string | null;
}

export function useDeliveries(
  venueId: string | undefined,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ["deliveries", venueId, startDate, endDate],
    queryFn: async () => {
      if (!venueId) return [] as DeliveryRow[];
      let query = supabase
        .from("deliveries")
        .select("*")
        .eq("venue_id", venueId)
        .order("delivered_at", { ascending: false });
      if (startDate) query = query.gte("delivered_at", startDate);
      if (endDate) query = query.lte("delivered_at", `${endDate}T23:59:59.999Z`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as DeliveryRow[];
    },
    enabled: !!venueId,
    staleTime: 20_000,
  });
}

export interface RecordManualDeliveryResult {
  delivery_id: string;
  movement_id: string;
  created: boolean;
}

export function useRecordManualDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: RecordManualDeliveryArgs) => {
      const { data, error } = await supabase.rpc(
        "record_manual_delivery" as never,
        args as never,
      );
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error("Delivery was not returned by the server.");
      return result as unknown as RecordManualDeliveryResult;
    },
    onSuccess: (_result, args) => {
      queryClient.invalidateQueries({ queryKey: ["deliveries", args.p_venue_id] });
      queryClient.invalidateQueries({ queryKey: ["movements", args.p_venue_id] });
    },
  });
}
