import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import type { Database, Json } from "@/lib/database.types";
import { generateWeeklyInsights, type InsightEngineInput } from "@/lib/insightsEngine";

export type Insight = Database["public"]["Tables"]["insights"]["Row"];

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // back up to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

/** Fetches this venue's insights, most recent week first. Premium-gated in the UI. */
export function useInsights(venueId: string | undefined) {
  return useQuery({
    queryKey: ["insights", venueId],
    queryFn: async () => {
      if (!venueId) return [] as Insight[];
      const { data, error } = await supabase
        .from("insights")
        .select("*")
        .eq("venue_id", venueId)
        .eq("dismissed", false)
        .order("week_start", { ascending: false })
        .order("severity", { ascending: true })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });
}

export function useDismissInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, venue_id }: { id: string; venue_id: string }) => {
      const { error } = await supabase.from("insights").update({ dismissed: true }).eq("id", id);
      if (error) throw error;
      return { venue_id };
    },
    onSuccess: ({ venue_id }) => {
      queryClient.invalidateQueries({ queryKey: ["insights", venue_id] });
    },
  });
}

/**
 * Runs the deterministic rules engine over locally-cached data (works offline)
 * and writes any new insights for the current week. Safe to call repeatedly —
 * skips insert if this week's insights already exist, unless `force` is set.
 */
export function useGenerateInsights() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      venueId,
      orderCycleDays,
      defaultMeasureMl,
      force,
    }: {
      venueId: string;
      orderCycleDays: number;
      defaultMeasureMl: number;
      force?: boolean;
    }) => {
      const weekStart = currentWeekStart();

      if (!force) {
        const { data: existing } = await supabase
          .from("insights")
          .select("id")
          .eq("venue_id", venueId)
          .eq("week_start", weekStart)
          .limit(1);
        if (existing && existing.length > 0) {
          return { generated: 0, weekStart };
        }
      }

      const products = await db.products.where("venue_id").equals(venueId).toArray();
      const readings = await db.readings.where("venue_id").equals(venueId).toArray();
      const tillEntries = await db.till_entries.where("venue_id").equals(venueId).toArray();

      const readingsByProduct = new Map<string, { ml_remaining: number; reading_at: string }[]>();
      for (const r of readings) {
        if (!readingsByProduct.has(r.product_id)) readingsByProduct.set(r.product_id, []);
        readingsByProduct.get(r.product_id)!.push({ ml_remaining: r.ml_remaining, reading_at: r.reading_at });
      }

      const input: InsightEngineInput = {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          size_ml: p.size_ml,
          cost_price: p.cost_price,
          pour_price: p.pour_price,
          measure_ml: p.measure_ml,
          unit: p.unit,
        })),
        readingsByProduct,
        tillEntries: tillEntries.map((t) => ({
          product_id: t.product_id,
          measures_sold: t.measures_sold,
          period_start: t.period_start,
          period_end: t.period_end,
        })),
        orderCycleDays,
        defaultMeasureMl,
      };

      const generated = generateWeeklyInsights(input);
      if (generated.length === 0) return { generated: 0, weekStart };

      const rows = generated.map((g) => ({
        venue_id: venueId,
        type: g.type,
        title: g.title,
        body: g.body,
        severity: g.severity,
        week_start: weekStart,
        data: (g.data ?? null) as Json,
      }));

      const { error } = await supabase.from("insights").insert(rows);
      if (error) throw error;

      return { generated: generated.length, weekStart };
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["insights", variables.venueId] });
    },
  });
}
