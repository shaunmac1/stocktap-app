// Pure, testable logic for the Daily Board. No Supabase / React imports here so
// it can be unit-tested in isolation.

/** One nightly cash-up for a venue. Mirrors public.cash_ups. */
export interface CashUp {
  id: string;
  venue_id: string;
  business_date: string; // yyyy-mm-dd
  till_name: string | null;
  float_amount: number | null;
  z_read: number | null;
  cash_counted: number | null;
  card_taken: number | null;
  total_taken: number | null;
  variance: number | null;
  wet_sales: number | null;
  dry_sales: number | null;
  what_was_on: string | null;
  act_or_match: string | null;
  fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CashUpUpsert = { venue_id: string; business_date: string } & Partial<
  Omit<CashUp, "id" | "venue_id" | "business_date" | "created_at" | "updated_at">
>;

/** Shift a yyyy-mm-dd date by whole days, in UTC (DST-safe). */
export function shiftISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build a date -> total_taken lookup once, for reuse. */
function totalsByDate(cashUps: CashUp[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const c of cashUps) m.set(c.business_date, c.total_taken);
  return m;
}

export interface Comparisons {
  sameDayLastWeek: number | null;
  lastFourSameDays: number | null;
  yearsAgo: { years: number; total: number | null }[];
}

/**
 * Like-for-like comparisons for a given date, keeping the same weekday:
 * same day last week, the average of the last four same-weekdays, and the
 * same weekday roughly 1/2/3 years ago (52-week multiples).
 */
export function buildComparisons(cashUps: CashUp[], dateISO: string): Comparisons {
  const byDate = totalsByDate(cashUps);
  const at = (days: number) => byDate.get(shiftISO(dateISO, days)) ?? null;

  const sameDayLastWeek = at(-7);
  const fourVals = [-7, -14, -21, -28]
    .map((n) => at(n))
    .filter((v): v is number => v != null);
  const lastFourSameDays = fourVals.length
    ? fourVals.reduce((a, b) => a + b, 0) / fourVals.length
    : null;
  const yearsAgo = [1, 2, 3].map((y) => ({ years: y, total: at(-364 * y) }));

  return { sameDayLastWeek, lastFourSameDays, yearsAgo };
}

export interface EntertainmentRoi {
  baseline: number; // a normal same-weekday take (last-four average)
  uplift: number; // tonight minus baseline
  fee: number; // cost of the act
  net: number; // uplift minus fee — positive means it paid for itself
}

/**
 * Did the act pay for itself? Compares tonight's take against a normal
 * same-weekday night (the last-four-same-days average) and nets off the fee.
 * Returns null when there isn't enough history or no take/fee to judge.
 */
export function entertainmentRoi(
  cashUps: CashUp[],
  dateISO: string,
  total: number | null,
  fee: number | null,
): EntertainmentRoi | null {
  if (total == null || fee == null) return null;
  const baseline = buildComparisons(cashUps, dateISO).lastFourSameDays;
  if (baseline == null) return null;
  const uplift = total - baseline;
  return { baseline, uplift, fee, net: uplift - fee };
}

export interface TrendPoint {
  date: string;
  total: number | null;
}

/**
 * The last `days` days up to and including dateISO, oldest first, for a
 * simple trend chart. Missing days come back as null.
 */
export function recentTrend(cashUps: CashUp[], dateISO: string, days = 14): TrendPoint[] {
  const byDate = totalsByDate(cashUps);
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftISO(dateISO, -i);
    points.push({ date, total: byDate.get(date) ?? null });
  }
  return points;
}
