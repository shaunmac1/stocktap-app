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
        // The movements table has no "_synced" index, so asking Dexie for
        // where("_synced") threw and undid the WHOLE download (products, counts and
        // readings too) on any device whose pub had a delivery. Filter in memory.
        const unsynced = await db.movements
          .filter((m) => m._synced === 0)
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

        // A stocktake always goes up under the id it has on the phone (older queued ones
        // had none and came back with a new id each time).
        if (item.table_name === "stocktakes" && payload && !payload.id) payload = { ...payload, id: item.local_id };

        const { data, error } = await (supabase as any)
          .from(item.table_name)
          .insert(payload)
          .select()
          .single();

        // Already on the server under this id (an earlier upload got there but the reply
        // was lost): that is success, not something to retry for ever.
        const already = !!error && (error as any).code === "23505" && !!payload?.id;
        if (error && !already) throw error;
        if (already && item.table_name === "stocktakes") {
          const local = await db.stocktakes.get(item.local_id);
          if (local) await db.stocktakes.put({ ...local, _temp: 0 });
        }

        // It is on the server: take it off the queue NOW. The tidy-up below once threw
        // after a successful upload, which left the item queued and sent the same
        // stocktake up again on every sync.
        await db.sync_queue.delete(item.id!);
        flushed++;

        if (data) try {
          if (item.table_name === "readings") {
            await db.readings.delete(item.local_id);
            await db.readings.put({ ...data, _synced: 1, _temp: 0 });
          } else if (item.table_name === "stocktakes") {
            tempStocktakeToReal[item.local_id] = data.id;
            await db.stocktakes.delete(item.local_id);
            await db.stocktakes.put({ ...data, _temp: 0 });
            // Re-point any local readings that referenced the temp stocktake id
            const affected = data.id === item.local_id ? [] : await db.readings
              .filter((r: any) => r.stocktake_id === item.local_id)
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
        } catch (tidyErr) {
          console.warn("[syncUp] uploaded, local tidy-up failed:", (tidyErr as any)?.message ?? tidyErr);
        }
      } else if (item.operation === "update") {
        if (item.table_name === "stocktakes" && (item.payload as any)?.status === "closed") {
          // Never close a count on the server while some of its lines are still on the
          // phone: a closed count refuses them and they'd be stuck for good.
          const waiting = await db.line_entries.where("stocktake_id").equals(item.local_id).filter((e: any) => e.sync_status === "pending").count();
          if (waiting > 0) throw new Error(`${waiting} line counts still to upload before this stocktake can close`);
        }
        const { data: changed, error } = await (supabase as any)
          .from(item.table_name)
          .update(item.payload)
          .eq("id", item.local_id)
          .select("id");

        if (error) throw error;
        if (!changed || changed.length === 0) {
          // The row isn't on the server. For a stocktake still on this phone, put it up
          // whole (with this change applied); if the phone has no trace of it either,
          // there is nothing to change and the item is done.
          const stillQueued = items.some(q => q.id !== item.id && q.operation === "insert" && q.local_id === item.local_id);
          if (stillQueued) throw new Error(`${item.table_name} ${item.local_id} is not on the server yet`);
          if (item.table_name === "stocktakes") {
            const local: any = await db.stocktakes.get(item.local_id);
            if (local) {
              const { _temp, ...row } = { ...local, ...(item.payload as any) };
              const { error: e2 } = await (supabase as any).from("stocktakes").insert(row);
              if (e2 && (e2 as any).code !== "23505") throw e2;
            }
          }
        }
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
  // A spot-check count whose spot check was closed (or never reached the server)
  // is refused for good, so it would retry forever. Re-home it instead of losing it.
  const rehomed = new Map<string, string>(); // venue_id -> fresh open spot check id
  for (const entry of pending) {
    let error = (await upsertEntry(entry)).error;
    if (error && entry.spot_check_id && /already closed|does not belong/i.test(error.message ?? "")) {
      const { data: sess } = await supabase.from("spot_check_sessions").select("id,status").eq("id", entry.spot_check_id).maybeSingle();
      if (!sess) {
        // Created offline and never uploaded: put the spot check up first, same id.
        await supabase.from("spot_check_sessions").insert({ id: entry.spot_check_id, venue_id: entry.venue_id, status: "open", opened_at: entry.entered_at, user_id: entry.user_id } as any);
      } else {
        let fresh = rehomed.get(entry.venue_id);
        if (!fresh) {
          fresh = crypto.randomUUID();
          const now = new Date().toISOString();
          const { error: e2 } = await supabase.from("spot_check_sessions").insert({ id: fresh, venue_id: entry.venue_id, status: "open", opened_at: now, user_id: entry.user_id } as any);
          if (e2) fresh = undefined; else {
            rehomed.set(entry.venue_id, fresh);
            try { await db.spot_check_sessions.put({ id: fresh, venue_id: entry.venue_id, status: "open", opened_at: now, closed_at: null, user_id: entry.user_id, created_at: now, updated_at: now } as any); } catch { /* local cache only */ }
          }
        }
        if (fresh) { entry.spot_check_id = fresh; await db.line_entries.update(entry.id, { spot_check_id: fresh } as any); }
      }
      error = (await upsertEntry(entry)).error;
    }
    if (error && entry.stocktake_id && /already closed|does not belong|foreign key|violates/i.test(error.message ?? "")) {
      // The stocktake itself never reached the server (started with no signal): put it up
      // under the same id, then the line counts can follow. Never lose a count.
      const { data: st } = await supabase.from("stocktakes").select("id,status").eq("id", entry.stocktake_id).maybeSingle();
      if (!st) {
        const local = await db.stocktakes.get(entry.stocktake_id);
        const { error: e3 } = await supabase.from("stocktakes").insert({
          id: entry.stocktake_id, venue_id: entry.venue_id, status: "open",
          opened_at: (local as any)?.opened_at ?? entry.entered_at,
          location_id: (local as any)?.location_id ?? null,
          product_ids: (local as any)?.product_ids ?? null,
        } as any);
        if (!e3) {
          const now = new Date().toISOString();
          if (!local) { try { await db.stocktakes.put({ id: entry.stocktake_id, venue_id: entry.venue_id, location_id: null, status: "open", opened_at: entry.entered_at, closed_at: null, total_value: null, product_ids: null, created_at: now, updated_at: now, _temp: 0 } as any); } catch { /* local cache only */ } }
          error = (await upsertEntry(entry)).error;
        }
      }
    }
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
    // Lets open count/spot-check screens drop their "Not synced" badges at once.
    try { window.dispatchEvent(new Event("stocktap:line-entry-synced")); } catch { /* noop */ }
    try { window.dispatchEvent(new Event("stocktap:pending-changed")); } catch { /* noop */ }
  }
  return flushed;
}

function upsertEntry(entry: any) {
  return supabase
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

/**
 * Finishing a count writes one reading per line. If Finish is pressed again before the
 * first lot has uploaded, drop the earlier not-yet-uploaded set so a line is never read twice.
 */
export async function dropUnsentReadingsFor(stocktakeId: string): Promise<void> {
  const queued = await db.sync_queue.where("table_name").equals("readings").toArray();
  for (const q of queued) {
    if (q.operation === "insert" && (q.payload as any)?.stocktake_id === stocktakeId) {
      await db.sync_queue.delete(q.id!);
      try { await db.readings.delete(q.local_id); } catch { /* already gone */ }
    }
  }
}
