/**
 * Days-of-cover engine (Pro feature).
 *
 * Derives average daily consumption from the readings history and flags
 * products that need to be ordered before the next ordering window closes.
 * All calculations are pure — no Supabase calls — so they work offline.
 */

export interface ReadingPoint {
  ml_remaining: number;
  reading_at: string;
}

export interface CoverageResult {
  avgMlPerDay: number;
  daysOfCover: number;
  orderFlag: boolean;
}

/**
 * Average daily consumption (ml/day) from a set of readings.
 * Pairs consecutive readings in chronological order; skips intervals
 * where stock went UP (deliveries) so they don't dilute the rate.
 */
export function calcDailyConsumption(readings: ReadingPoint[]): number {
  if (readings.length < 2) return 0;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime(),
  );

  let totalConsumedMl = 0;
  let totalDays = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const t1 = new Date(sorted[i].reading_at).getTime();
    const t2 = new Date(sorted[i + 1].reading_at).getTime();
    const days = (t2 - t1) / 86_400_000;
    if (days <= 0 || days > 60) continue; // ignore same-day or huge gaps
    const consumed = sorted[i].ml_remaining - sorted[i + 1].ml_remaining;
    if (consumed <= 0) continue; // delivery or no change
    totalConsumedMl += consumed;
    totalDays += days;
  }

  return totalDays > 0 ? totalConsumedMl / totalDays : 0;
}

/**
 * How many days of stock remain at the given consumption rate.
 */
export function calcDaysOfCover(mlRemaining: number, mlPerDay: number): number {
  if (mlPerDay <= 0) return Infinity;
  return mlRemaining / mlPerDay;
}

/**
 * Returns true when an order should be placed now.
 * Flag fires when days-of-cover < orderCycleDays × 1.2 (built-in safety buffer).
 */
export function calcOrderFlag(daysOfCover: number, orderCycleDays: number): boolean {
  if (!isFinite(daysOfCover)) return false;
  return daysOfCover < orderCycleDays * 1.2;
}

export function calcCoverage(
  currentMlRemaining: number,
  readings: ReadingPoint[],
  orderCycleDays = 21,
): CoverageResult {
  const avgMlPerDay = calcDailyConsumption(readings);
  const daysOfCover = calcDaysOfCover(currentMlRemaining, avgMlPerDay);
  const orderFlag = calcOrderFlag(daysOfCover, orderCycleDays);
  return { avgMlPerDay, daysOfCover, orderFlag };
}
