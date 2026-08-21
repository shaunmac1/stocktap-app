import Dexie, { type Table } from "dexie";
import type { Database } from "./database.types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type LocationRow = Database["public"]["Tables"]["locations"]["Row"];
type StocktakeRow = Database["public"]["Tables"]["stocktakes"]["Row"];
type ReadingRow = Database["public"]["Tables"]["readings"]["Row"];
type TillEntryRow = Database["public"]["Tables"]["till_entries"]["Row"];
type MovementRow = Database["public"]["Tables"]["stock_movements"]["Row"];

export type LocalProduct = ProductRow & {
  locations?: { name: string } | null;
};

export type LocalLocation = LocationRow;

export type LocalStocktake = StocktakeRow & { _temp?: 0 | 1 };

export type LocalReading = ReadingRow & { _synced: 0 | 1; _temp: 0 | 1 };

export type LocalTillEntry = TillEntryRow & { _synced: 0 | 1; _temp: 0 | 1 };

export type LocalMovement = MovementRow & { _synced: 0 | 1 };

export interface LocalCountLocation {
  id: string;
  venue_id: string;
  name: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface LocalSpotCheckSession {
  id: string;
  venue_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalLineEntry {
  id: string;
  venue_id: string;
  /** Exactly one of stocktake_id / spot_check_id is set. */
  stocktake_id: string | null;
  spot_check_id?: string | null;
  product_id: string;
  count_location_id: string | null;
  count_location_name: string | null;
  method: "weigh" | "tenths" | "count" | "keg_weight" | "dipstick" | "tenths_pints" | "dozen" | "each" | "litre" | "photo_tap";
  full_containers: number | null;
  part_value: number | null;
  ml_remaining: number;
  sync_status: "pending" | "uploading" | "uploaded";
  entered_at: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SyncQueueItem {
  id?: number;
  table_name: "readings" | "stocktakes" | "till_entries" | "stock_movements" | "stocktake_line_entries";
  operation: "insert" | "update" | "delete";
  payload: object;
  created_at: string;
  retry_count: number;
  local_id: string;
  /** Last sync error, for diagnostics. Never causes the item to be discarded. */
  last_error?: string;
}

class StocktapDB extends Dexie {
  products!: Table<LocalProduct, string>;
  locations!: Table<LocalLocation, string>;
  stocktakes!: Table<LocalStocktake, string>;
  readings!: Table<LocalReading, string>;
  till_entries!: Table<LocalTillEntry, string>;
  movements!: Table<LocalMovement, string>;
  sync_queue!: Table<SyncQueueItem, number>;
  count_locations!: Table<LocalCountLocation, string>;
  line_entries!: Table<LocalLineEntry, string>;
  spot_check_sessions!: Table<LocalSpotCheckSession, string>;

  constructor() {
    super("stocktap_v1");
    this.version(1).stores({
      products: "id, venue_id, location_id",
      locations: "id, venue_id",
      stocktakes: "id, venue_id, opened_at",
      readings: "id, venue_id, product_id, reading_at, _synced, [venue_id+product_id]",
      till_entries: "id, venue_id, product_id",
      sync_queue: "++id, table_name, created_at",
    });
    this.version(2).stores({
      movements: "id, venue_id, product_id, moved_at, [venue_id+product_id]",
    });
    this.version(3).stores({
      count_locations: "id, venue_id",
      line_entries: "id, venue_id, stocktake_id, product_id, sync_status, [stocktake_id+product_id]",
    });
    // v4: spot checks share line_entries — add spot_check_id index + sessions store
    this.version(4).stores({
      spot_check_sessions: "id, venue_id, status",
      line_entries: "id, venue_id, stocktake_id, spot_check_id, product_id, sync_status, [stocktake_id+product_id], [spot_check_id+product_id]",
    });
  }
}

export const db = new StocktapDB();
