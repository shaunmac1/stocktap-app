// Pure, testable logic for the Checks module (temperature compliance logs).
// No Supabase / React imports so it can be unit-tested in isolation.

export type ApplianceKind = "fridge" | "freezer" | "hot_hold" | "probe" | "cellar" | "delivery" | "other";

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
  { name: "Cellar", kind: "cellar", min_c: 11, max_c: 13 },
];

/** Default safe range for a kind, used to prefill the add-appliance form. */
export function defaultRange(kind: ApplianceKind): { min_c: number | null; max_c: number | null } {
  switch (kind) {
    case "freezer": return { min_c: -30, max_c: -18 };
    case "hot_hold": return { min_c: 63, max_c: null };
    case "probe": return { min_c: 75, max_c: null };
    case "fridge": return { min_c: 0, max_c: 5 };
    case "cellar": return { min_c: 11, max_c: 13 };
    case "delivery": return { min_c: null, max_c: 8 };
    default: return { min_c: null, max_c: null };
  }
}

// ─── Checklists (opening / closing / cleaning) ──────────────────────────────

export type CheckSection = "opening" | "closing" | "cleaning";
export type Cadence = "daily" | "weekly";

export interface CheckItem {
  id: string;
  venue_id: string;
  section: CheckSection;
  label: string;
  cadence: Cadence;
  sort: number;
  active: boolean;
  created_at: string;
}

export interface CheckCompletion {
  id: string;
  venue_id: string;
  item_id: string;
  business_date: string; // yyyy-mm-dd
  done: boolean;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface Refusal {
  id: string;
  venue_id: string;
  business_date: string;
  occurred_at: string;
  description: string | null;
  reason: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

const SECTION_ORDER: CheckSection[] = ["opening", "closing", "cleaning"];
export const SECTION_LABELS: Record<CheckSection, string> = {
  opening: "Opening checks",
  closing: "Closing checks",
  cleaning: "Cleaning",
};

/** Whole days between two yyyy-mm-dd dates (UTC, positive if to is after from). */
export function daysBetween(fromDateISO: string, toDateISO: string): number {
  const p = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((p(toDateISO) - p(fromDateISO)) / 86_400_000);
}

/**
 * Is a checklist item satisfied for today?
 * Daily items need a completion dated today. Weekly items (e.g. line cleaning)
 * count as done if they were completed in the last 7 days.
 */
export function isItemDone(item: CheckItem, completions: CheckCompletion[], todayISO: string): boolean {
  const mine = completions.filter((c) => c.item_id === item.id && c.done);
  if (item.cadence === "weekly") {
    return mine.some((c) => {
      const d = daysBetween(c.business_date, todayISO);
      return d >= 0 && d <= 6;
    });
  }
  return mine.some((c) => c.business_date === todayISO);
}

/** Latest completion date for an item, or null. */
export function lastDoneDate(itemId: string, completions: CheckCompletion[]): string | null {
  let best: string | null = null;
  for (const c of completions) {
    if (c.item_id !== itemId || !c.done) continue;
    if (!best || c.business_date > best) best = c.business_date;
  }
  return best;
}

export interface WeeklyStatus {
  lastDoneISO: string | null;
  daysAgo: number | null; // days since last done
  dueInDays: number; // 0 or negative = due/overdue now
  overdue: boolean;
}

/** Cadence status for a weekly item (used for beer-line cleaning etc.). */
export function weeklyStatus(item: CheckItem, completions: CheckCompletion[], todayISO: string): WeeklyStatus {
  const last = lastDoneDate(item.id, completions);
  if (!last) return { lastDoneISO: null, daysAgo: null, dueInDays: 0, overdue: true };
  const daysAgo = daysBetween(last, todayISO);
  const dueInDays = 7 - daysAgo; // due again 7 days after last done
  return { lastDoneISO: last, daysAgo, dueInDays, overdue: dueInDays <= 0 };
}

/** Active items in a section, in display order. */
export function itemsInSection(items: CheckItem[], section: CheckSection): CheckItem[] {
  return items.filter((i) => i.active && i.section === section).sort((a, b) => a.sort - b.sort);
}

/** Completion of one section for today. */
export function sectionCompletion(
  items: CheckItem[],
  completions: CheckCompletion[],
  todayISO: string,
  section: CheckSection,
): Completion {
  const active = itemsInSection(items, section);
  const done = active.filter((i) => isItemDone(i, completions, todayISO)).length;
  const total = active.length;
  return { done, total, remaining: Math.max(0, total - done), complete: total > 0 && done >= total };
}

/** Which sections have any active items — so the UI only shows what's set up. */
export function activeSections(items: CheckItem[]): CheckSection[] {
  return SECTION_ORDER.filter((s) => items.some((i) => i.active && i.section === s));
}

/** Starter checklist items, offered on first setup (matches SFBB daily diary). */
export const DEFAULT_CHECK_ITEMS: Array<{ section: CheckSection; label: string; cadence: Cadence }> = [
  { section: "opening", label: "Fridges and freezers running and cold", cadence: "daily" },
  { section: "opening", label: "No signs of pests", cadence: "daily" },
  { section: "opening", label: "Staff fit to work and in clean uniform", cadence: "daily" },
  { section: "opening", label: "Hand-wash sink stocked (soap and towels)", cadence: "daily" },
  { section: "opening", label: "Probe thermometer working", cadence: "daily" },
  { section: "opening", label: "Food from yesterday in date and covered", cadence: "daily" },
  { section: "closing", label: "All food covered, labelled and in date", cadence: "daily" },
  { section: "closing", label: "Fridges and freezers shut and cold", cadence: "daily" },
  { section: "closing", label: "Hot food cooled and stored correctly", cadence: "daily" },
  { section: "closing", label: "Cleaning completed", cadence: "daily" },
  { section: "closing", label: "Waste and recycling out", cadence: "daily" },
  { section: "cleaning", label: "Bar surfaces and taps wiped", cadence: "daily" },
  { section: "cleaning", label: "Toilets checked and clean", cadence: "daily" },
  { section: "cleaning", label: "Kitchen surfaces sanitised", cadence: "daily" },
  { section: "cleaning", label: "Floors swept and mopped", cadence: "daily" },
  { section: "cleaning", label: "Beer lines cleaned", cadence: "weekly" },
  { section: "cleaning", label: "Cellar cleaned and tidy", cadence: "weekly" },
];

// ─── Refusals register (Challenge 25) ───────────────────────────────────────

export const REFUSAL_REASONS = ["No ID shown", "ID looked fake", "Appeared under 18", "Proxy sale (buying for a minor)", "Other"] as const;
