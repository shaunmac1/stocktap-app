// Pure, testable logic for the Team module (staff + live wage cost).
// No Supabase / React imports so it can be unit-tested in isolation.

export interface Staff {
  id: string;
  venue_id: string;
  name: string;
  hourly_rate: number | null;
  active: boolean;
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

/** Hours worked on a shift. Open shifts (no clock_out) run up to nowISO. */
export function shiftDurationHours(clockIn: string, clockOut: string | null, nowISO: string): number {
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut ?? nowISO).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const hours = (end - start) / 3_600_000;
  return hours > 0 ? hours : 0;
}

/** Cost of a single shift, using the rate snapshot taken at clock-in. */
export function shiftCost(shift: Shift, nowISO: string): number {
  const hours = shiftDurationHours(shift.clock_in, shift.clock_out, nowISO);
  const rate = shift.rate_snapshot ?? 0;
  return hours * rate;
}

/** Total wage cost across a set of shifts (open shifts counted live). */
export function dayWageCost(shifts: Shift[], nowISO: string): number {
  return shifts.reduce((sum, s) => sum + shiftCost(s, nowISO), 0);
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
