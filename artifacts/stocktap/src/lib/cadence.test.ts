import { describe, expect, it } from "vitest";
import {
  cadenceLabel,
  calculateNextDueAt,
  deriveCadenceStatus,
  sortCadenceStatuses,
  validateCadenceDays,
} from "./cadence";

describe("stocktake cadence dates", () => {
  it("calculates a weekly due date from the last completed count", () => {
    const due = calculateNextDueAt("2026-07-06T09:00:00.000Z", 7);
    expect(due.toISOString()).toBe("2026-07-13T09:00:00.000Z");
  });

  it("moves the calculated date forward to the preferred weekday", () => {
    const due = calculateNextDueAt("2026-07-01T09:00:00.000Z", 7, 1);
    expect(due.getDay()).toBe(1);
    expect(due.toISOString()).toBe("2026-07-13T09:00:00.000Z");
  });

  it("rejects invalid cadence and weekday values", () => {
    expect(() => validateCadenceDays(0)).toThrow(/between 1 and 365/);
    expect(() => validateCadenceDays(366)).toThrow(/between 1 and 365/);
    expect(() => calculateNextDueAt("2026-07-01T09:00:00.000Z", 7, 8)).toThrow(/between 0 and 6/);
  });

  it("uses friendly preset and custom labels", () => {
    expect(cadenceLabel(7)).toBe("Weekly");
    expect(cadenceLabel(21)).toBe("Every 21 days");
  });
});

describe("stocktake cadence health", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");

  it("marks an enabled schedule with no history as immediately due", () => {
    expect(deriveCadenceStatus({ enabled: true, cadenceDays: 7, now })).toMatchObject({
      health: "not_started",
      daysUntilDue: 0,
      label: "First count due",
    });
  });

  it("marks a missed schedule overdue with the number of calendar days", () => {
    expect(deriveCadenceStatus({
      enabled: true,
      cadenceDays: 7,
      lastCountedAt: "2026-07-01T12:00:00.000Z",
      now,
    })).toMatchObject({
      health: "overdue",
      daysUntilDue: -6,
      label: "6 days overdue",
    });
  });

  it("marks tomorrow as due soon", () => {
    expect(deriveCadenceStatus({
      enabled: true,
      cadenceDays: 7,
      lastCountedAt: "2026-07-08T12:00:00.000Z",
      now,
    })).toMatchObject({
      health: "due_soon",
      daysUntilDue: 1,
      label: "Due tomorrow",
    });
  });

  it("keeps future schedules on track", () => {
    expect(deriveCadenceStatus({
      enabled: true,
      cadenceDays: 28,
      lastCountedAt: "2026-07-01T12:00:00.000Z",
      now,
    })).toMatchObject({
      health: "on_track",
      daysUntilDue: 15,
      label: "Due in 15 days",
    });
  });

  it("does not surface disabled schedules as actionable", () => {
    expect(deriveCadenceStatus({ enabled: false, cadenceDays: 7, now })).toEqual({
      health: "disabled",
      nextDueAt: null,
      daysUntilDue: null,
      label: "Reminders off",
    });
  });

  it("sorts overdue and never-counted work ahead of future work", () => {
    const rows = [
      { id: "future", ...deriveCadenceStatus({ enabled: true, cadenceDays: 28, lastCountedAt: "2026-07-01T12:00:00.000Z", now }) },
      { id: "disabled", ...deriveCadenceStatus({ enabled: false, cadenceDays: 7, now }) },
      { id: "new", ...deriveCadenceStatus({ enabled: true, cadenceDays: 7, now }) },
      { id: "late", ...deriveCadenceStatus({ enabled: true, cadenceDays: 7, lastCountedAt: "2026-07-01T12:00:00.000Z", now }) },
    ];

    expect(sortCadenceStatuses(rows).map((row) => row.id)).toEqual(["late", "new", "future", "disabled"]);
  });
});
