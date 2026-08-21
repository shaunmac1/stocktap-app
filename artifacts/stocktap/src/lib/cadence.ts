export type CadenceHealth = "not_started" | "overdue" | "due_soon" | "on_track" | "disabled";

export interface CadenceStatusInput {
  enabled: boolean;
  cadenceDays: number;
  preferredWeekday?: number | null;
  lastCountedAt?: string | null;
  now?: Date;
}

export interface CadenceStatusResult {
  health: CadenceHealth;
  nextDueAt: Date | null;
  daysUntilDue: number | null;
  label: string;
}

export const CADENCE_PRESETS = [
  { days: 1, label: "Daily" },
  { days: 7, label: "Weekly" },
  { days: 14, label: "Fortnightly" },
  { days: 28, label: "Every 4 weeks" },
  { days: 30, label: "Monthly" },
  { days: 90, label: "Quarterly" },
  { days: 365, label: "Yearly" },
] as const;

export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
] as const;

const DAY_MS = 86_400_000;

export function validateCadenceDays(days: number): number {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Cadence must be a whole number between 1 and 365 days.");
  }
  return days;
}

export function cadenceLabel(days: number): string {
  return CADENCE_PRESETS.find((preset) => preset.days === days)?.label ?? `Every ${days} days`;
}

export function calculateNextDueAt(
  lastCountedAt: string | Date,
  cadenceDays: number,
  preferredWeekday?: number | null,
): Date {
  validateCadenceDays(cadenceDays);
  const last = lastCountedAt instanceof Date ? new Date(lastCountedAt) : new Date(lastCountedAt);
  if (Number.isNaN(last.getTime())) throw new Error("Last counted date is invalid.");

  const next = new Date(last.getTime() + cadenceDays * DAY_MS);
  if (preferredWeekday == null) return next;
  if (!Number.isInteger(preferredWeekday) || preferredWeekday < 0 || preferredWeekday > 6) {
    throw new Error("Preferred weekday must be between 0 and 6.");
  }

  const moveForward = (preferredWeekday - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + moveForward);
  return next;
}

function calendarDayDifference(a: Date, b: Date): number {
  const aMidnight = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bMidnight = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((aMidnight - bMidnight) / DAY_MS);
}

export function deriveCadenceStatus(input: CadenceStatusInput): CadenceStatusResult {
  if (!input.enabled) {
    return { health: "disabled", nextDueAt: null, daysUntilDue: null, label: "Reminders off" };
  }

  validateCadenceDays(input.cadenceDays);
  const now = input.now ?? new Date();
  if (!input.lastCountedAt) {
    return { health: "not_started", nextDueAt: now, daysUntilDue: 0, label: "First count due" };
  }

  const nextDueAt = calculateNextDueAt(input.lastCountedAt, input.cadenceDays, input.preferredWeekday);
  const daysUntilDue = calendarDayDifference(nextDueAt, now);

  if (nextDueAt.getTime() <= now.getTime()) {
    const overdueDays = Math.max(0, -daysUntilDue);
    return {
      health: "overdue",
      nextDueAt,
      daysUntilDue,
      label: overdueDays === 0 ? "Due today" : `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
    };
  }

  if (daysUntilDue <= 2) {
    return {
      health: "due_soon",
      nextDueAt,
      daysUntilDue,
      label: daysUntilDue === 0 ? "Due today" : daysUntilDue === 1 ? "Due tomorrow" : `Due in ${daysUntilDue} days`,
    };
  }

  return {
    health: "on_track",
    nextDueAt,
    daysUntilDue,
    label: `Due in ${daysUntilDue} days`,
  };
}

export function sortCadenceStatuses<T extends { health: CadenceHealth; nextDueAt: Date | null }>(rows: T[]): T[] {
  const priority: Record<CadenceHealth, number> = {
    overdue: 0,
    not_started: 1,
    due_soon: 2,
    on_track: 3,
    disabled: 4,
  };
  return [...rows].sort((a, b) => {
    const byHealth = priority[a.health] - priority[b.health];
    if (byHealth !== 0) return byHealth;
    return (a.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER);
  });
}
