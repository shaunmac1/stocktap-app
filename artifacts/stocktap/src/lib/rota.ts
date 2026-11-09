// Pure, testable logic for the Rota module. No Supabase / React imports.

export type RotaArea = "bar" | "kitchen";
export const ROTA_AREAS: RotaArea[] = ["bar", "kitchen"];
export const AREA_LABELS: Record<RotaArea, string> = { bar: "Bar", kitchen: "Kitchen" };

export interface RotaShift {
  id: string;
  venue_id: string;
  staff_id: string;
  area: RotaArea;
  shift_date: string; // yyyy-mm-dd
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string | null; // null when until_close
  until_close: boolean;
  note: string | null;
  created_at: string;
}

const DAY_MS = 86_400_000;
function parse(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function toISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Add whole days to a yyyy-mm-dd date (UTC-safe). */
export function addDaysISO(dateISO: string, days: number): string {
  return toISO(parse(dateISO) + days * DAY_MS);
}

/** Monday of the week containing dateISO (UK weeks start Monday). */
export function weekStartISO(dateISO: string): string {
  const dow = new Date(parse(dateISO)).getUTCDay(); // 0 Sun .. 6 Sat
  const backToMonday = (dow + 6) % 7;
  return addDaysISO(dateISO, -backToMonday);
}

/** The seven yyyy-mm-dd dates Mon..Sun for the week containing dateISO. */
export function weekDaysISO(dateISO: string): string[] {
  const start = weekStartISO(dateISO);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

/** Short weekday label, e.g. "Mon". */
export function weekdayShort(dateISO: string): string {
  return new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

/** "17:00:00" or "17:00" -> "5pm" / "5:30pm" / "11:30am". */
export function prettyTime(t: string | null | undefined): string {
  if (!t) return "";
  const [hhStr, mmStr] = t.split(":");
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  if (!Number.isFinite(hh)) return t;
  const ampm = hh < 12 ? "am" : "pm";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return mm ? `${h12}:${String(mm).padStart(2, "0")}${ampm}` : `${h12}${ampm}`;
}

/** "5pm – close" or "11:30am – 5pm". */
export function shiftRangeLabel(shift: Pick<RotaShift, "start_time" | "end_time" | "until_close">): string {
  const start = prettyTime(shift.start_time);
  const end = shift.until_close ? "close" : prettyTime(shift.end_time);
  return end ? `${start} – ${end}` : start;
}

function startKey(s: RotaShift): string {
  return (s.start_time || "").slice(0, 5);
}

/** Shifts in an area on a day, earliest start first. */
export function shiftsByArea(shifts: RotaShift[], area: RotaArea): RotaShift[] {
  return shifts.filter((s) => s.area === area).sort((a, b) => startKey(a).localeCompare(startKey(b)));
}

/** All shifts sorted by start time. */
export function sortByStart(shifts: RotaShift[]): RotaShift[] {
  return [...shifts].sort((a, b) => startKey(a).localeCompare(startKey(b)));
}

/** Count of people scheduled per area for a day. */
export function areaCounts(shifts: RotaShift[]): Record<RotaArea, number> {
  return { bar: shifts.filter((s) => s.area === "bar").length, kitchen: shifts.filter((s) => s.area === "kitchen").length };
}

// ---- Planned wage cost (what the rota will cost before the week happens) ----

/** Holiday pay accrual for irregular hours (5.6 weeks / 46.4 weeks). */
export const HOLIDAY_ACCRUAL = 0.1207;
const ROTA_WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Planned hours for a rota shift. "Until close" uses the venue's close time for that weekday
 * (a close before 6am belongs to the next morning). Returns null if the end can't be known.
 */
export function plannedShiftHours(
  shift: Pick<RotaShift, "shift_date" | "start_time" | "end_time" | "until_close">,
  closeTimes?: Record<string, string> | null,
): number | null {
  const start = toMinutes(shift.start_time);
  if (start === null) return null;
  let end: number | null;
  if (shift.until_close) {
    const key = ROTA_WEEKDAY_KEYS[new Date(shift.shift_date + "T00:00:00Z").getUTCDay()];
    end = toMinutes(closeTimes?.[key]);
  } else {
    end = toMinutes(shift.end_time);
  }
  if (end === null) return null;
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

export interface PlannedCost {
  hours: number; // hours we could cost
  cost: number; // pay + holiday pay, £
  noRate: number; // shifts for staff with no hourly rate set
  noEnd: number; // "until close" shifts with no close time set
}

/** Planned pay + holiday pay for a set of rota shifts. Employer NI and pension are not included. */
export function plannedCost(
  shifts: Array<Pick<RotaShift, "staff_id" | "shift_date" | "start_time" | "end_time" | "until_close">>,
  rateByStaff: Map<string, number | null | undefined>,
  closeTimes?: Record<string, string> | null,
): PlannedCost {
  const out: PlannedCost = { hours: 0, cost: 0, noRate: 0, noEnd: 0 };
  for (const s of shifts) {
    const h = plannedShiftHours(s, closeTimes);
    if (h === null) { out.noEnd++; continue; }
    const rate = rateByStaff.get(s.staff_id);
    if (rate == null || !(rate > 0)) { out.noRate++; continue; }
    out.hours += h;
    out.cost += h * rate * (1 + HOLIDAY_ACCRUAL);
  }
  out.cost = Math.round(out.cost * 100) / 100;
  return out;
}
