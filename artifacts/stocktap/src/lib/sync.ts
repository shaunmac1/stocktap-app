/**
 * Sync module — pure functions, no React.
 *
 * syncDown: Supabase → Dexie (pull latest data)
 * syncUp:   Dexie sync_queue → Supabase (flush pending writes)
 */
import { supabase } from "./supabase";
import { db } from "./db";

const READINGS_LOOKBACK_DAYS = 90;
const MOVEMENTS_LOOKBACK_DAYS = 90;
const MAX_READINGS = 1000;
const MAX_STOCKTAKES = 50;
const MAX_MOVEMENTS = 500;

export async function syncDown(venueId: string): Promise<void> {
  const since = new Date(
    Date.now() - READINGS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const movementsSince = new Date(
    Date.now() - MOVEMENTS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { data: products },
    { data: locations },
    { data: stocktakes },
    { data: readings },
    { data: movements },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*, locations(name)")
      .eq("venue_id", venueId)
      .order("name"),
    supabase
      .from("locations")
      .select("*")
      .eq("venue_id", venueId)
      .order("sort"),
    supabase
      .from("stocktakes")
      .select("*")
      .eq("venue_id", venueId)
      .order("opened_at", { ascending: false })
      .limit(MAX_STOCKTAKES),
    supabase
      .from("readings")
      .select("*")
      .eq("venue_id", venueId)
      .gte("reading_at", since)
      .order("reading_at", { ascending: false })
      .limit(MAX_READINGS),
    supabase
      .from("stock_movements")
      .select("*")
      .eq("venue_id", venueId)
      .gte("moved_at", movementsSince)
      .order("moved_at", { ascending: false })
      .limit(MAX_MOVEMENTS),
  ]);

  await db.transaction(
    "rw",
    [db.products, db.locations, db.stocktakes, db.readings, db.movements],
    async () => {
      if (products?.length) await db.products.bulkPut(products as any);
      if (locations?.length) await db.locations.bulkPut(locations);
      if (stocktakes?.length) await db.stocktakes.bulkPut(stocktakes);
      if (readings?.length) {
        const serverIds = new Set(readings.map((r) => r.id));
        const unsynced = await db.readings
          .where("_synced")
          .equals(0)
          .toArray();
        const unsyncedIds = new Set(unsynced.map((r) => r.id));

        const toWrite = readings
          .filter((r) => !unsyncedIds.has(r.id))
          .map((r) => ({ ...r, _synced: 1 as const, _temp: 0 as const }));

        await db.readings.bulkPut(toWrite);

        const allLocal = await db.readings
          .where("venue_id")
          .equals(venueId)
          .toArray();
        const stale = allLocal.filter(
          (r) => r._synced === 1 && !serverIds.has(r.id)
        );
        if (stale.length) await db.readings.bulkDelete(stale.map((r) => r.id));
      }
      // movements: skip gracefully if table schema not yet migrated
      if (movements?.length) {
        const serverIds = new Set(movements.map((m) => m.id));
        const unsynced = await db.movements
          .where("_synced")
          .equals(0)
          .toArray();
        const unsyncedIds = new Set(unsynced.map((m) => m.id));
        const toWrite = movements
          .filter((m) => !unsyncedIds.has(m.id))
          .map((m) => ({ ...m, _synced: 1 as const }));
        await db.movements.bulkPut(toWrite as any);
        const allLocal = await db.movements
          .where("venue_id")
          .equals(venueId)
          .toArray();
        const stale = allLocal.filter(
          (m) => m._synced === 1 && !serverIds.has(m.id)
        );
        if (stale.length) await db.movements.bulkDelete(stale.map((m) => m.id));
      }
    }
  );
}

export async function syncUp(): Promise<number> {
  const items = await db.sync_queue.orderBy("created_at").toArray();
  let flushed = 0;

  // Maps a temp (local) stocktake id to the real server id, populated the
  // moment a stocktake is successfully inserted during THIS pass. Readings
  // created offline reference the temp stocktake id, so we rewrite them here
  // before insert — otherwise they hit a foreign-key error and (previously)
  // were silently thrown away. Data must never be lost.
  const tempStocktakeToReal: Record<string, string> = {};

  for (const item of items) {
    try {
      if (item.operation === "insert") {
        // Rewrite a temp stocktake_id resolved earlier in this pass.
        let payload: any = item.payload;
        if (
          item.table_name === "readings" &&
          payload?.stocktake_id &&
          tempStocktakeToReal[payload.stocktake_id]
        ) {
          payload = { ...payload, stocktake_id: tempStocktakeToReal[payload.stocktake_id] };
        }

        const { data, error } = await (supabase as any)
          .from(item.table_name)
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        if (data) {
          if (item.table_name === "readings") {
            await db.readings.delete(item.local_id);
            await db.readings.put({ ...data, _synced: 1, _temp: 0 });
          } else if (item.table_name === "stocktakes") {
            tempStocktakeToReal[item.local_id] = data.id;
            await db.stocktakes.delete(item.local_id);
            await db.stocktakes.put({ ...data, _temp: 0 });
            // Re-point any local readings that referenced the temp stocktake id
            const affected = await db.readings
              .where("stocktake_id")
              .equals(item.local_id)
              .toArray();
            for (const r of affected) {
              await db.readings.put({ ...r, stocktake_id: data.id });
            }
            // Re-point any STILL-QUEUED reading payloads (durably, in case sync
            // is interrupted before those readings are processed).
            const queuedReadings = await db.sync_queue
              .where("table_name")
              .equals("readings")
              .toArray();
            for (const q of queuedReadings) {
              const qp = q.payload as any;
              if (qp && qp.stocktake_id === item.local_id) {
                await db.sync_queue.update(q.id!, {
                  payload: { ...qp, stocktake_id: data.id },
                });
              }
            }
          } else if (item.table_name === "till_entries") {
            await db.till_entries.put({ ...data, _synced: 1, _temp: 0 });
          } else if (item.table_name === "stock_movements") {
            await db.movements.delete(item.local_id);
            await db.movements.put({ ...data, _synced: 1 });
          }
        }

        await db.sync_queue.delete(item.id!);
        flushed++;
      } else if (item.operation === "update") {
        const { error } = await (supabase as any)
          .from(item.table_name)
          .update(item.payload)
          .eq("id", item.local_id);

        if (error) throw error;
        await db.sync_queue.delete(item.id!);
        flushed++;
      } else if (item.operation === "delete") {
        const { error } = await (supabase as any)
          .from(item.table_name)
          .delete()
          .eq("id", item.local_id);

        if (error) throw error;
        await db.sync_queue.delete(item.id!);
        flushed++;
      }
    } catch (err) {
      // CRITICAL: never delete a queued change on failure. This handles
      // someone's money — a reading that cannot sync yet must stay queued and
      // keep retrying (and stay visible via the "changes pending" banner),
      // NOT be discarded. We only record diagnostics.
      const message =
        (err as any)?.message ?? (err as any)?.error_description ?? String(err);
      console.warn("[syncUp] item", item.id, "will retry:", message);
      await db.sync_queue.update(item.id!, {
        retry_count: item.retry_count + 1,
        last_error: String(message).slice(0, 300),
      });
    }
  }

  return flushed;
}

/**
 * Auto-retry line entries stuck as "pending" (their fire-and-forget upsert
 * failed — offline, dead socket, RLS blip). Called from every sync cycle so a
 * count done in a no-signal cellar reaches the cloud without the user having
 * to tap a per-line manual retry.
 */
export async function flushPendingLineEntries(): Promise<number> {
  const pending = await db.line_entries
    .where("sync_status")
    .equals("pending")
    .toArray();
  let flushed = 0;
  for (const entry of pending) {
    const { error } = await supabase
      .from("stocktake_line_entries")
      .upsert(
        {
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
        } as any,
        { onConflict: "id" }
      );
    if (!error) {
      await db.line_entries.update(entry.id, {
        sync_status: "uploaded",
        updated_at: new Date().toISOString(),
      });
      flushed++;
    } else {
      console.warn("[flushPendingLineEntries]", entry.id, "will retry:", error.message);
    }
  }
  if (flushed && typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("stocktap:pending-changed")); } catch { /* noop */ }
  }
  return flushed;
}

export async function getPendingCount(): Promise<number> {
  const [queued, pendingLines] = await Promise.all([
    db.sync_queue.count(),
    db.line_entries.where("sync_status").equals("pending").count(),
  ]);
  return queued + pendingLines;
}

/** Queue a write for later sync. Returns the local ID used. */
export async function queueWrite(
  table_name: "readings" | "stocktakes" | "till_entries" | "stock_movements" | "stocktake_line_entries",
  operation: "insert" | "update" | "delete",
  payload: object,
  local_id: string
): Promise<void> {
  await db.sync_queue.add({
    table_name,
    operation,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    local_id,
  });
  // Let the app update its "changes pending" indicator immediately, so a queued
  // (not-yet-synced) write never masquerades as fully saved.
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("stocktap:pending-changed")); } catch { /* noop */ }
  }
}
