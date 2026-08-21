// Pure, testable logic for the Team module (staff + live wage cost).
// No Supabase / React imports so it can be unit-tested in isolation.

export interface Staff {
  id: string;
  venue_id: string;
  name: string;
  hourly_rate: number | null;
  active: boolean;
  user_id: string | null;
  created_at: string;
}

export interface Shift {
  id: string;
  venue_id: string;
  staff_id: string;
  business_date: string; // yyyy-mm-dd
  clock_in: string; // ISO timestamp
  clock_out: string | null; // ISO timestamp; null = still on shift
  rate_snapshot: number | null; // £/hour at clock-in
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type ShiftInsert = { venue_id: string; staff_id: string; business_date: string } & Partial<
  Omit<Shift, "id" | "venue_id" | "staff_id" | "business_date" | "created_at" | "updated_at">
>;

export type CloseTimes = Record<string, string>; // { mon:"23:30", ..., fri:"00:30" }
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * The latest clock-out instant for a business date, from the venue's close_times.
 * A close time before ~6am (e.g. Fri/Sat "00:30") belongs to the following day.
 * Built in the runtime's local timezone (the venue's own phone/tablet).
 */
export function shiftCapISO(businessDate: string, closeTimes: CloseTimes | null | undefined): string | null {
  if (!closeTimes) return null;
  const key = WEEKDAY_KEYS[new Date(businessDate + "T00:00:00").getDay()];
  const t = closeTimes[key];
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const cap = new Date(businessDate + "T00:00:00");
  cap.setHours(hh, mm, 0, 0);
  if (hh < 6) cap.setDate(cap.getDate() + 1); // after-midnight close = next calendar day
  return cap.toISOString();
}

/**
 * Hours worked on a shift. Open shifts run up to nowISO — but never past
 * capISO (the venue close), so a forgotten clock-out can't run away.
 */
export function shiftDurationHours(
  clockIn: string,
  clockOut: string | null,
  nowISO: string,
  capISO?: string | null,
): number {
  const start = new Date(clockIn).getTime();
  let end = new Date(clockOut ?? nowISO).getTime();
  if (clockOut == null && capISO) {
    const cap = new Date(capISO).getTime();
    if (Number.isFinite(cap)) end = Math.min(end, cap);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const hours = (end - start) / 3_600_000;
  return hours > 0 ? hours : 0;
}

/** Cost of a single shift, using the rate snapshot taken at clock-in. */
export function shiftCost(shift: Shift, nowISO: string, capISO?: string | null): number {
  const hours = shiftDurationHours(shift.clock_in, shift.clock_out, nowISO, capISO);
  const rate = shift.rate_snapshot ?? 0;
  return hours * rate;
}

/**
 * Total wage cost across shifts. If closeTimes is given, each open shift is
 * capped at its own business date's close time.
 */
export function dayWageCost(shifts: Shift[], nowISO: string, closeTimes?: CloseTimes | null): number {
  return shifts.reduce((sum, s) => {
    const cap = closeTimes ? shiftCapISO(s.business_date, closeTimes) : undefined;
    return sum + shiftCost(s, nowISO, cap);
  }, 0);
}

/** Wage cost as a % of the day's take. Null until there's a take to divide by. */
export function wagePercent(wageCost: number, totalTaken: number | null): number | null {
  if (totalTaken == null || totalTaken <= 0) return null;
  return (wageCost / totalTaken) * 100;
}

/** True while a shift is still open (no clock-out). */
export function isOnShift(shift: Shift): boolean {
  return shift.clock_out == null;
}

/** An open shift whose time is already past the venue close — a missed clock-out. */
export function isForgottenClockOut(shift: Shift, nowISO: string, capISO: string | null): boolean {
  if (shift.clock_out != null || !capISO) return false;
  return new Date(nowISO).getTime() > new Date(capISO).getTime();
}
