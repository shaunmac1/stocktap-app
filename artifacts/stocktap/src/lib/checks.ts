// Pure, testable logic for the Checks module (temperature compliance logs).
// No Supabase / React imports so it can be unit-tested in isolation.

export type ApplianceKind = "fridge" | "freezer" | "hot_hold" | "probe" | "other";

export interface Appliance {
  id: string;
  venue_id: string;
  name: string;
  kind: ApplianceKind;
  min_c: number | null; // lowest safe temperature, null = no lower bound
  max_c: number | null; // highest safe temperature, null = no upper bound
  sort: number;
  active: boolean;
  created_at: string;
}

export interface TempReading {
  id: string;
  venue_id: string;
  appliance_id: string;
  business_date: string; // yyyy-mm-dd
  reading_c: number;
  recorded_by: string | null;
  note: string | null;
  created_at: string; // ISO timestamp
}

export type ReadingStatus = "ok" | "high" | "low";

/**
 * Whether a reading sits inside the appliance's safe range.
 * Below min_c => "low", above max_c => "high", otherwise "ok".
 * A null bound means that side is unbounded.
 */
export function readingStatus(reading_c: number, min_c: number | null, max_c: number | null): ReadingStatus {
  if (max_c != null && reading_c > max_c) return "high";
  if (min_c != null && reading_c < min_c) return "low";
  return "ok";
}

/** Human label for a status, in Shaun's plain style. */
export function statusLabel(status: ReadingStatus): string {
  switch (status) {
    case "high": return "Too warm";
    case "low": return "Too cold";
    default: return "In range";
  }
}

/** The most recent reading for an appliance (by created_at), or null. */
export function latestReading(applianceId: string, readings: TempReading[]): TempReading | null {
  let best: TempReading | null = null;
  for (const r of readings) {
    if (r.appliance_id !== applianceId) continue;
    if (!best || new Date(r.created_at).getTime() > new Date(best.created_at).getTime()) best = r;
  }
  return best;
}

/** Readings taken on a given business date. */
export function readingsOnDate(readings: TempReading[], businessDate: string): TempReading[] {
  return readings.filter((r) => r.business_date === businessDate);
}

export interface Completion {
  done: number; // appliances with at least one reading today
  total: number; // active appliances
  remaining: number;
  complete: boolean;
}

/** How many appliances have been logged today. */
export function todaysCompletion(appliances: Appliance[], todaysReadings: TempReading[]): Completion {
  const active = appliances.filter((a) => a.active);
  const logged = new Set(todaysReadings.map((r) => r.appliance_id));
  const done = active.filter((a) => logged.has(a.id)).length;
  const total = active.length;
  return { done, total, remaining: Math.max(0, total - done), complete: total > 0 && done >= total };
}

export interface Alert {
  appliance: Appliance;
  reading: TempReading;
  status: ReadingStatus;
}

/** Appliances whose latest reading today is out of range — the things to act on. */
export function outOfRangeToday(appliances: Appliance[], todaysReadings: TempReading[]): Alert[] {
  const alerts: Alert[] = [];
  for (const a of appliances) {
    if (!a.active) continue;
    const r = latestReading(a.id, todaysReadings);
    if (!r) continue;
    const status = readingStatus(r.reading_c, a.min_c, a.max_c);
    if (status !== "ok") alerts.push({ appliance: a, reading: r, status });
  }
  return alerts;
}

/** Sensible UK starter appliances with safe ranges, offered on first setup. */
export const DEFAULT_APPLIANCES: Array<{ name: string; kind: ApplianceKind; min_c: number | null; max_c: number | null }> = [
  { name: "Cellar fridge", kind: "fridge", min_c: 0, max_c: 5 },
  { name: "Kitchen fridge", kind: "fridge", min_c: 0, max_c: 5 },
  { name: "Bottle fridge", kind: "fridge", min_c: 0, max_c: 5 },
  { name: "Freezer", kind: "freezer", min_c: -30, max_c: -18 },
  { name: "Hot holding", kind: "hot_hold", min_c: 63, max_c: null },
];

/** Default safe range for a kind, used to prefill the add-appliance form. */
export function defaultRange(kind: ApplianceKind): { min_c: number | null; max_c: number | null } {
  switch (kind) {
    case "freezer": return { min_c: -30, max_c: -18 };
    case "hot_hold": return { min_c: 63, max_c: null };
    case "probe": return { min_c: 75, max_c: null };
    case "fridge": return { min_c: 0, max_c: 5 };
    default: return { min_c: null, max_c: null };
  }
}
