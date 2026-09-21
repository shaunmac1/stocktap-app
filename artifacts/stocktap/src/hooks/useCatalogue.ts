import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SafeCatalogueItem } from "@/lib/catalogue-picker";
import { estimateDefaultPrices, type CatalogueNameRow, type HygieneProduct } from "@/lib/library-hygiene";

/**
 * Newly created products get a rough UK trade price so the GP report isn't
 * zero. Only fills blanks, and flags every filled value as estimated so the
 * Library can nag until it's corrected. Best-effort: never throws.
 */
export async function fillEstimatedPrices(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, counting_method, size_ml, container_l, pack_size, cost_price, pour_price")
    .in("id", productIds);
  if (error || !data) return;
  await Promise.all(
    data.map(async (row) => {
      if (row.cost_price != null && row.pour_price != null) return;
      const est = estimateDefaultPrices({
        name: row.name,
        category: row.category,
        countingMethod: row.counting_method,
        sizeMl: row.size_ml,
        containerL: row.container_l,
        packSize: row.pack_size,
      });
      const patch: Record<string, unknown> = {};
      if (row.cost_price == null && est.cost != null) {
        patch.cost_price = est.cost;
        patch.cost_price_estimated = true;
      }
      if (row.pour_price == null && est.pour != null) {
        patch.pour_price = est.pour;
        patch.pour_price_estimated = true;
      }
      if (Object.keys(patch).length === 0) return;
      await supabase.from("products").update(patch as never).eq("id", row.id);
    }),
  );
}

export interface KnownBottleMatchResult {
  matched: number;
  unmatched: number;
  matchedNames: string[];
}

type MatchableProduct = Pick<HygieneProduct, "id" | "name" | "category" | "counting_method" | "size_ml"> & {
  full_weight_g: number | null;
  empty_weight_g: number | null;
};

/**
 * For every unweighed bottle line (spirits, wines, or any weigh/tenths/photo
 * method), look for the calibrated catalogue bottle it obviously is and copy
 * its full/empty weights across via `apply_catalogue_calibration`.
 */
export async function matchKnownBottles(venueId: string, products: MatchableProduct[]): Promise<KnownBottleMatchResult> {
  const { matchKnownBottle } = await import("@/lib/library-hygiene");
  const unweighed = products.filter(
    (p) =>
      (p.category === "spirits" || p.category === "wines" ||
        p.counting_method === "weigh" || p.counting_method === "tenths" || p.counting_method === "photo_tap") &&
      (p.full_weight_g == null || p.empty_weight_g == null),
  );
  if (unweighed.length === 0) return { matched: 0, unmatched: 0, matchedNames: [] };

  const { data, error } = await supabase.rpc("list_catalogue_names" as never, { p_venue_id: venueId } as never);
  if (error) throw error;
  const catalogue = (data ?? []) as unknown as CatalogueNameRow[];

  let matched = 0;
  const matchedNames: string[] = [];
  for (const product of unweighed) {
    const hit = matchKnownBottle(product, catalogue);
    if (!hit) continue;
    const { data: applied, error: applyError } = await supabase.rpc(
      "apply_catalogue_calibration" as never,
      { p_product_id: product.id, p_catalogue_id: hit.id } as never,
    );
    if (!applyError && applied) {
      matched++;
      matchedNames.push(product.name);
    }
  }
  return { matched, unmatched: unweighed.length - matched, matchedNames };
}

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
      const rows = (data ?? []) as unknown as AddedCatalogueProduct[];
      try {
        await fillEstimatedPrices(rows.filter((row) => row.created).map((row) => row.product_id));
      } catch {
        // estimates are a nicety; never fail the add
      }
      return rows;
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
