import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SafeCatalogueItem } from "@/lib/catalogue-picker";

export function useCatalogueSearch(
  venueId: string | undefined,
  query: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["server-catalogue", venueId, query.trim().toLowerCase()],
    queryFn: async () => {
      if (!venueId) return [] as SafeCatalogueItem[];
      const { data, error } = await supabase.rpc(
        "search_catalogue_items" as never,
        {
          p_venue_id: venueId,
          p_query: query.trim(),
          p_limit: 100,
        } as never,
      );
      if (error) {
        if ((error as any).message?.includes("does not exist")) return [] as SafeCatalogueItem[];
        throw error;
      }
      return (data ?? []) as unknown as SafeCatalogueItem[];
    },
    enabled: !!venueId && enabled,
    staleTime: 30_000,
  });
}

export interface AddCatalogueItemsArgs {
  venueId: string;
  catalogueIds: string[];
  locationId: string | null;
}

export interface AddedCatalogueProduct {
  product_id: string;
  catalogue_id: string;
  product_name: string;
  created: boolean;
}

export function useAddCatalogueItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ venueId, catalogueIds, locationId }: AddCatalogueItemsArgs) => {
      const uniqueIds = [...new Set(catalogueIds)];
      if (uniqueIds.length === 0) throw new Error("Select at least one product.");
      const { data, error } = await supabase.rpc(
        "add_catalogue_items_to_venue" as never,
        {
          p_venue_id: venueId,
          p_catalogue_ids: uniqueIds,
          p_location_id: locationId,
        } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as AddedCatalogueProduct[];
    },
    onSuccess: (rows, args) => {
      queryClient.invalidateQueries({ queryKey: ["products", args.venueId] });
      queryClient.invalidateQueries({ queryKey: ["server-catalogue", args.venueId] });
      if (rows.some((row) => row.created)) {
        queryClient.invalidateQueries({ queryKey: ["latest-readings", args.venueId] });
      }
    },
  });
}
