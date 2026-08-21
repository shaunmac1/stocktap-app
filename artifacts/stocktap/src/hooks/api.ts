import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import { queueWrite } from "@/lib/sync";
import { deriveEmptyWeight, deriveDensity, checkCalibrationPlausibility, DEFAULT_DENSITIES } from "@/lib/calculations";
import type { Database } from "@/lib/database.types";
import type { LocalReading, LocalProduct, LocalLineEntry, LocalCountLocation, LocalTillEntry, LocalSpotCheckSession } from "@/lib/db";

export type Product = LocalProduct;
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type Stocktake = Database["public"]["Tables"]["stocktakes"]["Row"] & { _temp?: 0 | 1 };
export type Reading = LocalReading;
export type TillEntry = Database["public"]["Tables"]["till_entries"]["Row"];

// Sort helpers — Dexie's `.reverse().sortBy()` are incompatible: sortBy always
// sorts ascending regardless of the reverse() flag. Do the sort ourselves.
function byReadingAtDesc(a: LocalReading, b: LocalReading) {
  return b.reading_at < a.reading_at ? -1 : b.reading_at > a.reading_at ? 1 : 0;
}
function byOpenedAtDesc(
  a: { opened_at: string },
  b: { opened_at: string }
) {
  return b.opened_at < a.opened_at ? -1 : b.opened_at > a.opened_at ? 1 : 0;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export function useProducts(venueId: string | undefined) {
  return useQuery({
    queryKey: ["products", venueId],
    queryFn: async () => {
      if (!venueId) return [] as Product[];
      // Always go to Supabase — Dexie alone can never detect server-side deletions
      // (e.g. another device or direct DB edit). staleTime:30s means this only
      // re-runs when data is actually stale, so it's not called on every render.
      const { data, error } = await supabase
        .from("products")
        .select("*, locations(name)")
        .eq("venue_id", venueId)
        .order("name");
      if (error) {
        // Network/auth failure — serve Dexie cache so the app works offline
        const local = await db.products.where("venue_id").equals(venueId).toArray();
        local.sort((a, b) => a.name.localeCompare(b.name));
        if (local.length > 0) return local;
        throw error;
      }
      const serverData = (data ?? []) as Product[];
      // Reconcile Dexie: evict any rows the server no longer has (deletions from
      // other devices/sessions would otherwise linger in the local cache forever).
      const local = await db.products.where("venue_id").equals(venueId).toArray();
      if (local.length > 0) {
        const serverIds = new Set(serverData.map(p => p.id));
        const orphanIds = local.filter(p => !serverIds.has(p.id)).map(p => p.id);
        if (orphanIds.length > 0) await db.products.bulkDelete(orphanIds);
      }
      if (serverData.length > 0) await db.products.bulkPut(serverData);
      return serverData;
    },
    enabled: !!venueId,
    staleTime: 30_000,
  });
}

export function useAddProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product: ProductInsert) => {
      const { data, error } = await supabase
        .from("products")
        .insert(product)
        .select("*, locations(name)")
        .single();
      if (error) throw error;
      await db.products.put(data as unknown as Product);
      return data as unknown as Product;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products", variables.venue_id] });
    },
  });
}

export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      venue_id,
      ...updates
    }: ProductUpdate & { id: string; venue_id: string }) => {
      const { data, error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", id)
        .select("*, locations(name)")
        .single();
      if (error) throw error;
      await db.products.put(data as unknown as Product);
      return { data: data as unknown as Product, venue_id };
    },
    onSuccess: ({ venue_id }) => {
      queryClient.invalidateQueries({ queryKey: ["products", venue_id] });
    },
  });
}

/**
 * Shared "weigh a full bottle to set up tracking" calibration logic — derives the tare
 * (empty) weight from a full-bottle reading, saves it onto the product, and logs the
 * calibration itself as a full reading. This is the SAME math/flow used by the per-product
 * Library "weigh now" screen; other entry points (CSV import follow-up, Add Product nudge)
 * must call this instead of re-implementing it, so behavior never drifts between them.
 */
export function useCalibrateFullBottle() {
  const queryClient = useQueryClient();
  const updateProduct = useUpdateProduct();
  return useMutation({
    mutationFn: async ({
      product,
      venueId,
      userId,
      weightG,
    }: {
      product: { id: string; size_ml: number | null; density: number | null; location_id: string | null; type?: string | null; empty_weight_g?: number | null };
      venueId: string;
      userId: string;
      weightG: number;
    }) => {
      const sizeMl = product.size_ml ?? 700;

      // Fix 3: if a tare weight was directly measured, derive density from both measurements
      // (measurement beats an assumption). Otherwise fall back to stored density → category default.
      let resolvedDensity: number;
      let derivedEmpty: number;

      if (product.empty_weight_g != null && sizeMl > 0) {
        resolvedDensity = deriveDensity(weightG, product.empty_weight_g, sizeMl);
        derivedEmpty = product.empty_weight_g; // tare is a measurement — keep it
      } else {
        resolvedDensity = product.density ?? DEFAULT_DENSITIES[(product.type ?? "") as keyof typeof DEFAULT_DENSITIES] ?? 0.948;
        derivedEmpty = deriveEmptyWeight(weightG, sizeMl, resolvedDensity);
      }

      // Fix 4: plausibility gate — catch mis-weighings before they corrupt the calibration.
      const plausibility = checkCalibrationPlausibility(weightG, derivedEmpty, sizeMl);
      if (!plausibility.ok) {
        throw new Error(plausibility.warningMessage);
      }

      await updateProduct.mutateAsync({
        id: product.id,
        venue_id: venueId,
        full_weight_g: weightG,
        empty_weight_g: derivedEmpty,
        // When density was derived from two measurements, persist it so the stored value
        // reflects reality (rounded to 3 d.p. for clean display).
        ...(product.empty_weight_g != null ? { density: Math.round(resolvedDensity * 1000) / 1000 } : {}),
      });

      const { error } = await supabase.from("readings").insert({
        venue_id: venueId,
        product_id: product.id,
        location_id: product.location_id,
        method: "weigh",
        weight_g: weightG,
        ml_remaining: sizeMl,
        user_id: userId,
        reading_at: new Date().toISOString(),
      });
      if (error) throw error;

      return { derivedEmpty };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["latest-readings", variables.venueId] });
      queryClient.invalidateQueries({ queryKey: ["products", variables.venueId] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, venue_id }: { id: string; venue_id: string }) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      await db.products.delete(id);
      return { id, venue_id };
    },
    onSuccess: ({ venue_id }) => {
      queryClient.invalidateQueries({ queryKey: ["products", venue_id] });
    },
  });
}

// ─── Baseline Audits (Venners / stocktaker report import) ──────────────────

export function useBaselineAudits(venueId: string | undefined) {
  return useQuery({
    queryKey: ["baseline-audits", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const { data, error } = await supabase
        .from("baseline_audits")
        .select("*")
        .eq("venue_id", venueId)
        .order("audit_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId,
  });
}

export function useAddBaselineAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (audit: Database["public"]["Tables"]["baseline_audits"]["Insert"]) => {
      const { data, error } = await supabase.from("baseline_audits").insert(audit).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["baseline-audits", data.venue_id] });
    },
  });
}

export function useDeleteBaselineAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, venue_id }: { id: string; venue_id: string }) => {
      const { error } = await supabase.from("baseline_audits").delete().eq("id", id);
      if (error) throw error;
      return { id, venue_id };
    },
    onSuccess: ({ venue_id }) => {
      queryClient.invalidateQueries({ queryKey: ["baseline-audits", venue_id] });
    },
  });
}

// ─── Special Offers ─────────────────────────────────────────────────────────

export function useSpecialOffers(venueId: string | undefined) {
  return useQuery({
    queryKey: ["special-offers", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const { data, error } = await supabase
        .from("special_offers")
        .select("*")
        .eq("venue_id", venueId)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId,
  });
}

export function useAddSpecialOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offer: Database["public"]["Tables"]["special_offers"]["Insert"]) => {
      const { data, error } = await supabase.from("special_offers").insert(offer).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["special-offers", data.venue_id] });
    },
  });
}

/** Active special offer for a product at a given instant (date-range match). Overrides pour_price. */
export function useActiveOfferForProduct(venueId: string | undefined, productId: string | undefined) {
  const { data: offers } = useSpecialOffers(venueId);
  if (!offers || !productId) return null;
  const now = Date.now();
  return (
    offers.find((o: any) => {
      if (!o.product_ids?.includes(productId)) return false;
      const starts = new Date(o.starts_at).getTime();
      const ends = new Date(o.ends_at).getTime();
      return now >= starts && now <= ends;
    }) ?? null
  );
}

export function useDeleteSpecialOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, venue_id }: { id: string; venue_id: string }) => {
      const { error } = await supabase.from("special_offers").delete().eq("id", id);
      if (error) throw error;
      return { id, venue_id };
    },
    onSuccess: ({ venue_id }) => {
      queryClient.invalidateQueries({ queryKey: ["special-offers", venue_id] });
    },
  });
}

// ─── Support Tickets ────────────────────────────────────────────────────────

const SUPPORT_KEYWORDS: Record<Database["public"]["Tables"]["support_tickets"]["Row"]["category"], string[]> = {
  billing: ["invoice", "charge", "refund", "price", "subscription", "trial", "card", "payment", "vat"],
  technical: ["error", "bug", "crash", "won't load", "wont load", "broken", "offline", "sync", "scale", "weight not"],
  data: ["missing", "wrong number", "deleted", "lost data", "csv", "import", "export"],
  feature_request: ["wish", "could you add", "feature", "would be great", "suggestion"],
  other: [],
};

export function categorizeSupportMessage(text: string): Database["public"]["Tables"]["support_tickets"]["Row"]["category"] {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(SUPPORT_KEYWORDS)) {
    if (category === "other") continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      return category as Database["public"]["Tables"]["support_tickets"]["Row"]["category"];
    }
  }
  return "other";
}

const AUTO_REPLIES: Record<Database["public"]["Tables"]["support_tickets"]["Row"]["category"], string> = {
  billing: "Thanks — we've logged your billing query. Most billing questions (receipts, upgrades, cancellations) can be self-served from Settings > Plan > Manage Subscription. A member of the team will follow up by email within 1 business day.",
  technical: "Thanks — we've logged this as a technical issue. Try closing and reopening the app first (this resolves most sync glitches). We'll follow up by email if we need more details, usually within 1 business day.",
  data: "Thanks — we've logged your data query. If this is about a stocktake or reading that looks wrong, double-check the raw weight entry in that product's history. We'll follow up by email within 1 business day.",
  feature_request: "Thanks for the suggestion — we've logged it as a feature request. We read every one of these when planning what to build next.",
  other: "Thanks — we've received your message and will get back to you by email, usually within 1 business day.",
};

export function useSupportTickets(venueId: string | undefined) {
  return useQuery({
    queryKey: ["support-tickets", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      venue_id,
      user_id,
      subject,
      message,
    }: {
      venue_id: string;
      user_id: string | null;
      subject: string;
      message: string;
    }) => {
      const category = categorizeSupportMessage(`${subject} ${message}`);
      const auto_reply = AUTO_REPLIES[category];
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({ venue_id, user_id, subject, message, category, auto_reply, status: "acknowledged" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets", data.venue_id] });
    },
  });
}

// ─── Feature Suggestions ────────────────────────────────────────────────────

export type FeatureSuggestion = Database["public"]["Tables"]["feature_suggestions"]["Row"] & {
  venue: { founding_landlord: boolean } | null;
  has_voted: boolean;
};

export function useFeatureSuggestions(userId: string | undefined) {
  return useQuery({
    queryKey: ["feature-suggestions", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_suggestions")
        .select("*, venue:venues(founding_landlord)")
        .order("upvote_count", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      let votedIds = new Set<string>();
      if (userId) {
        const { data: votes, error: vErr } = await supabase
          .from("feature_suggestion_votes")
          .select("suggestion_id")
          .eq("user_id", userId);
        if (vErr) throw vErr;
        votedIds = new Set((votes ?? []).map((v) => v.suggestion_id));
      }

      return (data ?? []).map((s: any) => ({
        ...s,
        has_voted: votedIds.has(s.id),
      })) as FeatureSuggestion[];
    },
  });
}

export function useCreateFeatureSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      user_id,
      venue_id,
      title,
      detail,
    }: {
      user_id: string;
      venue_id: string | null;
      title: string;
      detail: string;
    }) => {
      const { data, error } = await supabase
        .from("feature_suggestions")
        .insert({ user_id, venue_id, title, detail: detail || null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-suggestions"] });
    },
  });
}

export function useToggleSuggestionVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      suggestion_id,
      user_id,
      has_voted,
    }: {
      suggestion_id: string;
      user_id: string;
      has_voted: boolean;
    }) => {
      if (has_voted) {
        const { error } = await supabase
          .from("feature_suggestion_votes")
          .delete()
          .eq("suggestion_id", suggestion_id)
          .eq("user_id", user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("feature_suggestion_votes")
          .insert({ suggestion_id, user_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-suggestions"] });
    },
  });
}

// ─── Public / landing-page ──────────────────────────────────────────────────

/**
 * How many of the 20 "Lock-In" founding-landlord slots have been claimed.
 * Public RPC (see get_founding_landlord_count in schema.sql) — callable from the
 * unauthenticated landing page. Returns null if the RPC isn't deployed yet or the
 * request fails, so the banner can hide itself rather than show a fake number.
 */
export function useFoundingLandlordCount() {
  return useQuery({
    queryKey: ["founding-landlord-count"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_founding_landlord_count");
      if (error) return null;
      return data as number;
    },
    staleTime: 60_000,
    retry: false,
  });
}

// ─── Locations ────────────────────────────────────────────────────────────────

export function useLocations(venueId: string | undefined) {
  return useQuery({
    queryKey: ["locations", venueId],
    queryFn: async () => {
      if (!venueId) return [] as Location[];
      const local = await db.locations
        .where("venue_id")
        .equals(venueId)
        .toArray();
      local.sort((a, b) => a.sort - b.sort);
      if (local.length > 0) return local;
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("venue_id", venueId)
        .order("sort");
      if (error) throw error;
      if (data?.length) await db.locations.bulkPut(data);
      return data ?? [];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });
}

// ─── Readings ─────────────────────────────────────────────────────────────────

export function useLatestReadings(venueId: string | undefined) {
  return useQuery({
    queryKey: ["latest-readings", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      let readings = await db.readings
        .where("venue_id")
        .equals(venueId)
        .toArray();
      readings.sort(byReadingAtDesc);

      // Fresh device / cleared cache — fall back to Supabase and hydrate Dexie.
      // Same pattern as useProducts and the line-entries hook.
      if (readings.length === 0) {
        const since = new Date(
          Date.now() - 90 * 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: serverReadings } = await supabase
          .from("readings")
          .select("*")
          .eq("venue_id", venueId)
          .gte("reading_at", since)
          .order("reading_at", { ascending: false })
          .limit(1000);
        if (serverReadings?.length) {
          const toWrite = serverReadings.map((r) => ({
            ...r,
            _synced: 1 as const,
            _temp: 0 as const,
          }));
          await db.readings.bulkPut(toWrite as any);
          readings = toWrite as any;
          readings.sort(byReadingAtDesc);
        }
      }

      const limited = readings.slice(0, 100);
      const productIds = [...new Set(limited.map((r) => r.product_id))];
      const products = await db.products.bulkGet(productIds);
      const productMap = new Map(
        products.filter(Boolean).map((p) => [p!.id, p!])
      );

      return limited.map((r) => ({
        ...r,
        products: productMap.get(r.product_id) ?? null,
      }));
    },
    enabled: !!venueId,
    staleTime: 10_000,
  });
}

/**
 * Latest reading per product for the venue.
 * Used by Reports — covers ALL products with no arbitrary reading cap.
 * Returns Record<product_id, reading> where each value is the most recent reading.
 */
export function useLatestReadingsByProduct(venueId: string | undefined) {
  return useQuery({
    queryKey: ["latest-readings-by-product", venueId],
    queryFn: async () => {
      if (!venueId) return {} as Record<string, any>;
      let readings = await db.readings
        .where("venue_id")
        .equals(venueId)
        .toArray();
      readings.sort(byReadingAtDesc);

      // Fresh device / cleared cache — fall back to Supabase and hydrate Dexie.
      if (readings.length === 0) {
        const since = new Date(
          Date.now() - 90 * 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: serverReadings } = await supabase
          .from("readings")
          .select("*")
          .eq("venue_id", venueId)
          .gte("reading_at", since)
          .order("reading_at", { ascending: false });
        if (serverReadings?.length) {
          const toWrite = serverReadings.map((r) => ({
            ...r,
            _synced: 1 as const,
            _temp: 0 as const,
          }));
          await db.readings.bulkPut(toWrite as any);
          readings = toWrite as any;
          readings.sort(byReadingAtDesc);
        }
      }

      // Build latest-per-product map (readings sorted desc → first = latest).
      const map: Record<string, typeof readings[0]> = {};
      for (const r of readings) {
        if (!map[r.product_id]) map[r.product_id] = r;
      }
      return map;
    },
    enabled: !!venueId,
    staleTime: 10_000,
  });
}

/** Latest single reading for a product — used by spot-check. Works offline.
 *  Pass locationId to restrict the baseline to readings saved against a specific
 *  location (enabling like-for-like location spot checks). */
export function useLastReading(
  productId: string | undefined,
  venueId: string | undefined,
  locationId?: string | null
) {
  return useQuery({
    queryKey: ["last-reading", productId, locationId ?? null],
    queryFn: async () => {
      if (!productId || !venueId) return null;
      const rows = await db.readings
        .where("[venue_id+product_id]")
        .equals([venueId, productId])
        .toArray();
      rows.sort(byReadingAtDesc);
      if (locationId) {
        const filtered = rows.filter(r => r.location_id === locationId);
        return filtered[0] ?? null;
      }
      return rows[0] ?? null;
    },
    enabled: !!productId && !!venueId,
    staleTime: 10_000,
  });
}

/** Recent spot-check-style readings for the venue (no stocktake_id), newest first.
 *  Used by the retrospective till entry UI. */
export function useRecentSpotReadings(venueId: string | undefined) {
  return useQuery({
    queryKey: ["recent-spot-readings", venueId],
    queryFn: async () => {
      if (!venueId) return [] as LocalReading[];
      const rows = await db.readings.where("venue_id").equals(venueId).toArray();
      return rows
        .filter(r => !r.stocktake_id)
        .sort(byReadingAtDesc)
        .slice(0, 150);
    },
    enabled: !!venueId,
    staleTime: 10_000,
  });
}

/** All till entries for the venue from Dexie. Used to determine which readings
 *  already have till figures attached. */
export function useTillEntries(venueId: string | undefined) {
  return useQuery({
    queryKey: ["till-entries", venueId],
    queryFn: async () => {
      if (!venueId) return [] as LocalTillEntry[];
      return db.till_entries.where("venue_id").equals(venueId).toArray();
    },
    enabled: !!venueId,
    staleTime: 10_000,
  });
}

type ReadingInsert = Database["public"]["Tables"]["readings"]["Insert"];

export function useAddReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reading: ReadingInsert) => {
      const localId = crypto.randomUUID();
      const now = new Date().toISOString();

      const localReading: LocalReading = {
        id: localId,
        venue_id: reading.venue_id,
        product_id: reading.product_id,
        location_id: reading.location_id ?? null,
        stocktake_id: reading.stocktake_id ?? null,
        method: reading.method ?? "weigh",
        weight_g: reading.weight_g ?? null,
        count: reading.count ?? null,
        ml_remaining: reading.ml_remaining,
        user_id: reading.user_id,
        staff_on: reading.staff_on ?? null,
        reading_at: reading.reading_at ?? now,
        full_containers: reading.full_containers ?? null,
        part_value: reading.part_value ?? null,
        is_line_check: reading.is_line_check ?? false,
        is_delivery: reading.is_delivery ?? false,
        created_at: now,
        updated_at: now,
        _synced: 0,
        _temp: 1,
      };

      // Write locally first — immediately visible, works offline
      await db.readings.put(localReading);

      try {
        const { data, error } = await supabase
          .from("readings")
          .insert(reading)
          .select()
          .single();
        if (error) throw error;
        // Replace temp record with server-confirmed one
        await db.readings.delete(localId);
        await db.readings.put({ ...data, _synced: 1, _temp: 0 });
        return { ...data, _synced: 1 as const, _temp: 0 as const } as LocalReading;
      } catch (_err) {
        // Offline or transient — queue for later sync
        await queueWrite("readings", "insert", reading, localId);
        return localReading;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["latest-readings", data.venue_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["last-reading", data.product_id],
      });
    },
  });
}

// ─── Stocktakes ───────────────────────────────────────────────────────────────

export function useStocktakes(venueId: string | undefined) {
  return useQuery({
    queryKey: ["stocktakes", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const local = await db.stocktakes
        .where("venue_id")
        .equals(venueId)
        .toArray();
      local.sort(byOpenedAtDesc);
      if (local.length > 0) return local;
      const { data, error } = await supabase
        .from("stocktakes")
        .select("*")
        .eq("venue_id", venueId)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      if (data?.length) await db.stocktakes.bulkPut(data);
      return data ?? [];
    },
    enabled: !!venueId,
    staleTime: 30_000,
  });
}

export function useCreateStocktake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      stocktake: Database["public"]["Tables"]["stocktakes"]["Insert"]
    ) => {
      const now = new Date().toISOString();
      try {
        const { data, error } = await supabase
          .from("stocktakes")
          .insert(stocktake)
          .select()
          .single();
        if (error) throw error;
        await db.stocktakes.put({ ...data, _temp: 0 });
        return data;
      } catch (_err) {
        // Offline fallback — create with temp UUID, sync later
        const localId = crypto.randomUUID();
        const local = {
          id: localId,
          venue_id: stocktake.venue_id,
          location_id: stocktake.location_id ?? null,
          status: (stocktake.status ?? "open") as "open" | "closed",
          opened_at: stocktake.opened_at ?? now,
          closed_at: null,
          total_value: null,
          created_at: now,
          updated_at: now,
          _temp: 1 as const,
        };
        await db.stocktakes.put(local);
        await queueWrite("stocktakes", "insert", stocktake, localId);
        return local;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes", data.venue_id] });
    },
  });
}

export function useCloseStocktake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      total_value,
    }: {
      id: string;
      total_value: number;
    }) => {
      const updates = {
        status: "closed" as const,
        total_value,
        closed_at: new Date().toISOString(),
      };
      try {
        const { data, error } = await supabase
          .from("stocktakes")
          .update(updates)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        await db.stocktakes.put({ ...data, _temp: 0 });
        return data;
      } catch (_err) {
        const existing = await db.stocktakes.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          await db.stocktakes.put(updated);
          await queueWrite("stocktakes", "update", updates, id);
          return updated;
        }
        throw new Error("Stocktake not found locally");
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes", data.venue_id] });
    },
  });
}

// ─── Till entries ─────────────────────────────────────────────────────────────

type TillEntryInsert = Database["public"]["Tables"]["till_entries"]["Insert"];

/** Fire-and-forget: writes locally and syncs to Supabase, queues if offline. */
export async function addTillEntry(entry: TillEntryInsert): Promise<void> {
  const now = new Date().toISOString();
  const localId = crypto.randomUUID();
  const local = {
    id: localId,
    venue_id: entry.venue_id,
    product_id: entry.product_id,
    measures_sold: entry.measures_sold,
    period_start: entry.period_start,
    period_end: entry.period_end,
    created_at: now,
    updated_at: now,
    _synced: 0 as const,
    _temp: 1 as const,
  };
  await db.till_entries.put(local);
  try {
    const { data, error } = await supabase
      .from("till_entries")
      .insert(entry)
      .select()
      .single();
    if (error) throw error;
    await db.till_entries.delete(localId);
    await db.till_entries.put({ ...data, _synced: 1, _temp: 0 });
  } catch (_err) {
    await queueWrite("till_entries", "insert", entry, localId);
  }
}

// ─── Stock Movements ──────────────────────────────────────────────────────────

type MovementInsert = Database["public"]["Tables"]["stock_movements"]["Insert"];

export function useMovements(venueId: string | undefined) {
  return useQuery({
    queryKey: ["movements", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const local = await db.movements
        .where("venue_id")
        .equals(venueId)
        .toArray();
      local.sort((a, b) => new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime());
      if (local.length > 0) return local;
      // fallback: pull from Supabase if Dexie is empty (first load)
      const { data } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("venue_id", venueId)
        .order("moved_at", { ascending: false })
        .limit(200);
      if (data?.length) {
        await db.movements.bulkPut(data.map(m => ({ ...m, _synced: 1 as const })) as any);
      }
      return (data ?? []).map(m => ({ ...m, _synced: 1 as const }));
    },
    enabled: !!venueId,
    staleTime: 20_000,
  });
}

export function useAddMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (movement: MovementInsert) => {
      const localId = crypto.randomUUID();
      const now = new Date().toISOString();
      const localMovement = {
        id: localId,
        venue_id: movement.venue_id,
        product_id: movement.product_id,
        from_location_id: movement.from_location_id ?? null,
        to_location_id: movement.to_location_id ?? null,
        movement_type: movement.movement_type,
        quantity_ml: movement.quantity_ml,
        unit_cost_pence: movement.unit_cost_pence ?? null,
        reason: movement.reason ?? null,
        notes: movement.notes ?? null,
        moved_at: movement.moved_at ?? now,
        user_id: movement.user_id ?? null,
        created_at: now,
        updated_at: now,
        _synced: 0 as const,
      };
      await db.movements.put(localMovement);
      try {
        const { data, error } = await supabase
          .from("stock_movements")
          .insert(movement)
          .select()
          .single();
        if (error) throw error;
        await db.movements.delete(localId);
        await db.movements.put({ ...data, _synced: 1 as const } as any);
        return { ...data, _synced: 1 as const };
      } catch (_err) {
        await queueWrite("stock_movements", "insert", movement, localId);
        return localMovement;
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["movements", data.venue_id] });
    },
  });
}

// ─── Sales Records ────────────────────────────────────────────────────────────

type SalesRecordInsert = Database["public"]["Tables"]["sales_records"]["Insert"];

export function useInsertSalesRecords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (records: SalesRecordInsert[]) => {
      const { data, error } = await supabase
        .from("sales_records")
        .insert(records)
        .select();
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (data: any[]) => {
      if (data.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["sales-records", data[0].venue_id] });
      }
    },
  });
}

export function useSalesRecords(
  venueId: string | undefined,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ["sales-records", venueId, startDate, endDate],
    queryFn: async () => {
      if (!venueId) return [];
      let q = supabase
        .from("sales_records")
        .select("*")
        .eq("venue_id", venueId)
        .order("sale_date", { ascending: false });
      if (startDate) q = q.gte("sale_date", startDate);
      if (endDate) q = q.lte("sale_date", endDate);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId,
    staleTime: 30_000,
  });
}

export function useStocktakeReadings(
  venueId: string | undefined,
  stocktakeId: string | undefined,
) {
  return useQuery({
    queryKey: ["stocktake-readings", venueId, stocktakeId],
    queryFn: async () => {
      if (!venueId || !stocktakeId) return [];
      const { data, error } = await supabase
        .from("readings")
        .select("product_id, ml_remaining, count, reading_at")
        .eq("venue_id", venueId)
        .eq("stocktake_id", stocktakeId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId && !!stocktakeId,
    staleTime: 60_000,
  });
}

/** Returns a map of product_id → all ReadingPoints (ml_remaining + reading_at) from Dexie. */
export function useProductReadingsMap(venueId: string | undefined) {
  return useQuery({
    queryKey: ["product-readings-map", venueId],
    queryFn: async () => {
      if (!venueId) return new Map<string, { ml_remaining: number; reading_at: string }[]>();
      const all = await db.readings.where("venue_id").equals(venueId).toArray();
      const map = new Map<string, { ml_remaining: number; reading_at: string }[]>();
      for (const r of all) {
        if (!map.has(r.product_id)) map.set(r.product_id, []);
        map.get(r.product_id)!.push({ ml_remaining: r.ml_remaining, reading_at: r.reading_at });
      }
      return map;
    },
    enabled: !!venueId,
    staleTime: 30_000,
  });
}

// ─── Count Locations ──────────────────────────────────────────────────────────

type CountLocationRow = Database["public"]["Tables"]["count_locations"]["Row"];
export type CountLocation = LocalCountLocation;

export function useCountLocations(venueId: string | undefined) {
  return useQuery({
    queryKey: ["count-locations", venueId],
    queryFn: async () => {
      if (!venueId) return [] as CountLocationRow[];
      const local = await db.count_locations.where("venue_id").equals(venueId).toArray();
      local.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      if (local.length > 0) return local;
      const { data, error } = await supabase
        .from("count_locations")
        .select("*")
        .eq("venue_id", venueId)
        .order("sort");
      // Gracefully handle missing table (migration not yet run)
      if (error) return [] as CountLocationRow[];
      if (data?.length) await db.count_locations.bulkPut(data as LocalCountLocation[]);
      return (data ?? []) as CountLocationRow[];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });
}

export function useAddCountLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ venue_id, name, sort }: { venue_id: string; name: string; sort: number }) => {
      const { data, error } = await supabase
        .from("count_locations")
        .insert({ venue_id, name, sort })
        .select()
        .single();
      if (error) throw error;
      await db.count_locations.put(data as LocalCountLocation);
      return data as CountLocationRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["count-locations", data.venue_id] });
    },
  });
}

export function useUpdateCountLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, venue_id, name }: { id: string; venue_id: string; name: string }) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("count_locations")
        .update({ name, updated_at: now })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await db.count_locations.update(id, { name, updated_at: now });
      return data as CountLocationRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["count-locations", data.venue_id] });
    },
  });
}

export function useDeleteCountLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, venue_id }: { id: string; venue_id: string }) => {
      const { error } = await supabase.from("count_locations").delete().eq("id", id);
      if (error && !(error as any).message?.includes("does not exist")) throw error;
      await db.count_locations.delete(id);
      return { id, venue_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["count-locations", data.venue_id] });
    },
  });
}

// ─── Spot Check Sessions ──────────────────────────────────────────────────────

export type SpotCheckSession = LocalSpotCheckSession;

/** The venue's open spot-check session from Dexie (falls back to Supabase).
 *  Used to resume an in-progress spot check. Tolerates a missing table. */
export function useOpenSpotCheckSession(venueId: string | undefined) {
  return useQuery({
    queryKey: ["open-spot-check", venueId],
    queryFn: async () => {
      if (!venueId) return null;
      const local = await db.spot_check_sessions
        .where("venue_id").equals(venueId)
        .filter(s => s.status === "open")
        .toArray();
      if (local.length > 0) {
        local.sort((a, b) => b.opened_at.localeCompare(a.opened_at));
        return local[0];
      }
      const { data, error } = await supabase
        .from("spot_check_sessions")
        .select("*")
        .eq("venue_id", venueId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1);
      // Missing table (migration not yet run) → behave as "no open session"
      if (error || !data?.length) return null;
      const session = data[0] as LocalSpotCheckSession;
      await db.spot_check_sessions.put(session);
      return session;
    },
    enabled: !!venueId,
    staleTime: 10_000,
  });
}

/** Create a spot-check session. Dexie-first; Supabase insert is best-effort so
 *  counting still works before the migration has been run / offline. */
export async function createSpotCheckSession(venueId: string, userId: string): Promise<LocalSpotCheckSession> {
  const now = new Date().toISOString();
  const session: LocalSpotCheckSession = {
    id: crypto.randomUUID(),
    venue_id: venueId,
    status: "open",
    opened_at: now,
    closed_at: null,
    user_id: userId,
    created_at: now,
    updated_at: now,
  };
  await db.spot_check_sessions.put(session);
  // Await the remote insert (errors tolerated: offline / migration not run) so
  // that child line-entry uploads never race the session FK.
  try {
    await supabase
      .from("spot_check_sessions")
      .insert({ id: session.id, venue_id: venueId, status: "open", opened_at: now, user_id: userId });
  } catch { /* local-only session; entries stay pending until synced */ }
  return session;
}

/** Close a spot-check session (best-effort remote). */
export async function closeSpotCheckSession(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.spot_check_sessions.update(id, { status: "closed", closed_at: now, updated_at: now });
  try {
    await supabase
      .from("spot_check_sessions")
      .update({ status: "closed", closed_at: now, updated_at: now })
      .eq("id", id);
  } catch { /* tolerated: offline / migration not run */ }
}

/** Line entries for a spot-check session (Dexie-first, hydrates from Supabase). */
export function useSpotCheckLineEntries(spotCheckId: string | null) {
  return useQuery({
    queryKey: ["spot-check-line-entries", spotCheckId],
    queryFn: async () => {
      if (!spotCheckId) return [] as LocalLineEntry[];
      const local = await db.line_entries.where("spot_check_id").equals(spotCheckId).toArray();
      local.sort((a, b) => a.entered_at.localeCompare(b.entered_at));
      if (local.length > 0) return local;

      const { data, error } = await supabase
        .from("stocktake_line_entries")
        .select("*, count_locations(name)")
        .eq("spot_check_id", spotCheckId)
        .order("entered_at");
      // Missing column/table → no remote entries
      if (error || !data?.length) return [] as LocalLineEntry[];

      const hydrated: LocalLineEntry[] = (data as any[]).map((row) => ({
        id: row.id,
        venue_id: row.venue_id,
        stocktake_id: row.stocktake_id ?? null,
        spot_check_id: row.spot_check_id ?? null,
        product_id: row.product_id,
        count_location_id: row.count_location_id ?? null,
        count_location_name: row.count_locations?.name ?? null,
        method: row.method,
        full_containers: row.full_containers ?? null,
        part_value: row.part_value ?? null,
        ml_remaining: row.ml_remaining,
        sync_status: "uploaded" as const,
        entered_at: row.entered_at,
        user_id: row.user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      await db.line_entries.bulkPut(hydrated);
      return hydrated;
    },
    enabled: !!spotCheckId,
    staleTime: 0,
  });
}

/** Retry the Supabase upload for a line entry that is stuck as 'pending'. */
export async function retryLineEntryUpload(id: string): Promise<boolean> {
  const entry = await db.line_entries.get(id);
  if (!entry) return false;
  const { error } = await supabase.from("stocktake_line_entries").upsert({
    id: entry.id,
    venue_id: entry.venue_id,
    stocktake_id: entry.stocktake_id,
    spot_check_id: entry.spot_check_id ?? null,
    product_id: entry.product_id,
    count_location_id: entry.count_location_id,
    method: entry.method,
    full_containers: entry.full_containers,
    part_value: entry.part_value,
    ml_remaining: entry.ml_remaining,
    sync_status: "uploaded",
    entered_at: entry.entered_at,
    user_id: entry.user_id,
  }, { onConflict: "id" });
  if (error) return false;
  await db.line_entries.update(id, { sync_status: "uploaded", updated_at: new Date().toISOString() });
  return true;
}

type ReadingUpdate = Database["public"]["Tables"]["readings"]["Update"];

/** Update an existing readings row (used when re-confirming a spot-check product:
 *  recalculate the aggregate rather than appending a second row). */
export async function updateReading(id: string, patch: ReadingUpdate): Promise<void> {
  const now = new Date().toISOString();
  await db.readings.update(id, { ...patch, updated_at: now } as any);
  const { error } = await supabase
    .from("readings")
    .update({ ...patch, updated_at: now })
    .eq("id", id);
  if (error) {
    await queueWrite("readings", "update", { ...patch, updated_at: now }, id);
  }
}

// ─── Stocktake Line Entries ───────────────────────────────────────────────────

export function useLineEntries(stocktakeId: string | null) {
  return useQuery({
    queryKey: ["line-entries", stocktakeId],
    queryFn: async () => {
      if (!stocktakeId) return [] as LocalLineEntry[];
      const local = await db.line_entries.where("stocktake_id").equals(stocktakeId).toArray();
      local.sort((a, b) => a.entered_at.localeCompare(b.entered_at));
      if (local.length > 0) return local;

      // Fresh device / cleared cache — pull from Supabase and hydrate Dexie.
      // Joins count_locations so we can restore the denormalised count_location_name.
      const { data, error } = await supabase
        .from("stocktake_line_entries")
        .select("*, count_locations(name)")
        .eq("stocktake_id", stocktakeId)
        .order("entered_at");
      if (error) throw error;
      if (!data?.length) return [] as LocalLineEntry[];

      const hydrated: LocalLineEntry[] = (data as any[]).map((row) => ({
        id: row.id,
        venue_id: row.venue_id,
        stocktake_id: row.stocktake_id,
        product_id: row.product_id,
        count_location_id: row.count_location_id ?? null,
        count_location_name: row.count_locations?.name ?? null,
        method: row.method,
        full_containers: row.full_containers ?? null,
        part_value: row.part_value ?? null,
        ml_remaining: row.ml_remaining,
        sync_status: "uploaded" as const,
        entered_at: row.entered_at,
        user_id: row.user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      await db.line_entries.bulkPut(hydrated);
      return hydrated;
    },
    enabled: !!stocktakeId,
    staleTime: 0,
  });
}

/** Write a line entry locally then attempt background Supabase upload.
 *  Uses an id-keyed upsert so re-saving the same entry (e.g. editing a
 *  product × location count) updates in place — no delete/insert races. */
export async function addLineEntry(entry: LocalLineEntry): Promise<void> {
  await db.line_entries.put(entry);
  supabase
    .from("stocktake_line_entries")
    .upsert({
      id: entry.id,
      venue_id: entry.venue_id,
      stocktake_id: entry.stocktake_id,
      spot_check_id: entry.spot_check_id ?? null,
      product_id: entry.product_id,
      count_location_id: entry.count_location_id,
      method: entry.method,
      full_containers: entry.full_containers,
      part_value: entry.part_value,
      ml_remaining: entry.ml_remaining,
      sync_status: "uploaded",
      entered_at: entry.entered_at,
      user_id: entry.user_id,
    }, { onConflict: "id" })
    .then(({ error }) => {
      if (!error) {
        db.line_entries.update(entry.id, { sync_status: "uploaded", updated_at: new Date().toISOString() });
      }
      // If error (table missing / offline) leave as 'pending' — counting continues
    });
}

/** Remove a line entry from Dexie; delete remotely, queueing durably on failure
 *  so an offline delete is never silently lost (the count would otherwise
 *  resurrect on the next device that hydrates from Supabase). */
export async function deleteLineEntry(id: string): Promise<void> {
  await db.line_entries.delete(id);
  const { error } = await supabase.from("stocktake_line_entries").delete().eq("id", id);
  if (error) {
    await queueWrite("stocktake_line_entries", "delete", {}, id);
  }
}

// ─── Bottle Shapes ────────────────────────────────────────────────────────────

export type BottleShape = {
  id: string;
  venue_id: string;
  name: string;
  photo_url: string | null;
  fill_curve: Array<{ y: number; fill: number }>;
  created_at: string;
  updated_at: string;
};

export type BottleShapeInsert = {
  id?: string;
  venue_id: string;
  name: string;
  photo_url?: string | null;
  fill_curve?: Array<{ y: number; fill: number }>;
};

export function useBottleShapes(venueId: string | undefined) {
  return useQuery({
    queryKey: ["bottle-shapes", venueId],
    queryFn: async () => {
      if (!venueId) return [] as BottleShape[];
      const { data, error } = await supabase
        .from("bottle_shapes")
        .select("*")
        .eq("venue_id", venueId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as BottleShape[];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });
}

export function useUpsertBottleShape() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shape: BottleShapeInsert & { id?: string }) => {
      if (shape.id) {
        const { data, error } = await supabase
          .from("bottle_shapes")
          .update({ name: shape.name, photo_url: shape.photo_url ?? null, fill_curve: shape.fill_curve ?? [] })
          .eq("id", shape.id)
          .select()
          .single();
        if (error) throw error;
        return data as BottleShape;
      } else {
        const { data, error } = await supabase
          .from("bottle_shapes")
          .insert({ ...shape, fill_curve: shape.fill_curve ?? [] })
          .select()
          .single();
        if (error) throw error;
        return data as BottleShape;
      }
    },
    onSuccess: (data: BottleShape) => {
      queryClient.invalidateQueries({ queryKey: ["bottle-shapes", data.venue_id] });
    },
  });
}

export function useAttachShapeToProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, shapeId, venueId }: { productId: string; shapeId: string | null; venueId: string }) => {
      const { error } = await supabase
        .from("products")
        .update({ bottle_shape_id: shapeId } as any)
        .eq("id", productId);
      if (error) throw error;
      return { productId, shapeId, venueId };
    },
    onSuccess: ({ venueId }) => {
      queryClient.invalidateQueries({ queryKey: ["products", venueId] });
    },
  });
}
