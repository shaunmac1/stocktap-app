/**
 * Demand forecasting — Premium tier only.
 *
 * Uses day-of-week seasonality from readings history to suggest par levels
 * and order quantities. All calculations are pure / offline-capable.
 */

export interface ReadingPoint {
  ml_remaining: number;
  reading_at: string;
}

export interface DaySeasonality {
  dayIndex: number; // 0 = Sunday … 6 = Saturday
  dayName: string;
  factor: number;   // 1.0 = average day
}

export interface ForecastResult {
  avgMlPerDay: number;
  seasonality: DaySeasonality[];
  parLevelMl: number;
  orderQtyMl: number;
  orderQtyBottles: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function calcDayOfWeekSeasonality(readings: ReadingPoint[]): DaySeasonality[] {
  const flat: DaySeasonality[] = DAY_NAMES.map((n, i) => ({ dayIndex: i, dayName: n, factor: 1 }));
  if (readings.length < 4) return flat;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime(),
  );

  const dayTotals = new Array<number>(7).fill(0);
  const dayCounts = new Array<number>(7).fill(0);

  for (let i = 0; i < sorted.length - 1; i++) {
    const t1 = new Date(sorted[i].reading_at).getTime();
    const t2 = new Date(sorted[i + 1].reading_at).getTime();
    const days = (t2 - t1) / 86_400_000;
    if (days <= 0 || days > 14) continue;
    const consumed = sorted[i].ml_remaining - sorted[i + 1].ml_remaining;
    if (consumed <= 0) continue;
    const mlPerDay = consumed / days;
    const dow = new Date(sorted[i].reading_at).getDay();
    dayTotals[dow] += mlPerDay;
    dayCounts[dow]++;
  }

  const avgs = dayCounts.map((c, i) => (c > 0 ? dayTotals[i] / c : null));
  const known = avgs.filter((v): v is number => v !== null);
  if (known.length === 0) return flat;
  const globalAvg = known.reduce((a, b) => a + b, 0) / known.length;

  return DAY_NAMES.map((name, i) => ({
    dayIndex: i,
    dayName: name,
    factor: avgs[i] != null ? avgs[i]! / globalAvg : 1,
  }));
}

export function calcParLevel(avgMlPerDay: number, orderCycleDays: number, safetyFactor = 1.25): number {
  return avgMlPerDay * orderCycleDays * safetyFactor;
}

export function calcOrderQuantity(parLevelMl: number, currentMl: number): number {
  return Math.max(0, parLevelMl - currentMl);
}

export function calcForecast(
  currentMlRemaining: number,
  readings: ReadingPoint[],
  sizeMl: number,
  orderCycleDays = 21,
): ForecastResult {
  const empty: ForecastResult = {
    avgMlPerDay: 0,
    seasonality: DAY_NAMES.map((n, i) => ({ dayIndex: i, dayName: n, factor: 1 })),
    parLevelMl: 0,
    orderQtyMl: 0,
    orderQtyBottles: 0,
  };
  if (readings.length < 2) return empty;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime(),
  );
  const spanDays =
    (new Date(sorted[sorted.length - 1].reading_at).getTime() - new Date(sorted[0].reading_at).getTime()) /
    86_400_000;
  if (spanDays <= 0) return empty;

  let totalConsumed = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const c = sorted[i].ml_remaining - sorted[i + 1].ml_remaining;
    if (c > 0) totalConsumed += c;
  }

  const avgMlPerDay = totalConsumed / spanDays;
  const seasonality = calcDayOfWeekSeasonality(readings);
  const parLevelMl = calcParLevel(avgMlPerDay, orderCycleDays);
  const orderQtyMl = calcOrderQuantity(parLevelMl, currentMlRemaining);
  const orderQtyBottles = sizeMl > 0 ? Math.ceil(orderQtyMl / sizeMl) : 0;

  return { avgMlPerDay, seasonality, parLevelMl, orderQtyMl, orderQtyBottles };
}
