import { describe, expect, it } from "vitest";
import {
  addDaysISO, weekStartISO, weekDaysISO, prettyTime, shiftRangeLabel, shiftsByArea, areaCounts,
  type RotaShift,
} from "./rota";

function mk(id: string, area: any, start: string, end: string | null, until_close = false): RotaShift {
  return { id, venue_id: "v1", staff_id: "s" + id, area, shift_date: "2026-08-21", start_time: start, end_time: end, until_close, note: null, created_at: "" };
}

describe("addDaysISO", () => {
  it("adds and subtracts across month ends", () => {
    expect(addDaysISO("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysISO("2026-08-01", -1)).toBe("2026-07-31");
    expect(addDaysISO("2026-08-21", 7)).toBe("2026-08-28");
  });
});

describe("weekStartISO", () => {
  it("returns the Monday of the week", () => {
    // 2026-08-21 is a Friday -> Monday is 2026-08-17
    expect(weekStartISO("2026-08-21")).toBe("2026-08-17");
    // Monday returns itself
    expect(weekStartISO("2026-08-17")).toBe("2026-08-17");
    // Sunday -> the Monday six days earlier
    expect(weekStartISO("2026-08-23")).toBe("2026-08-17");
  });
});

describe("weekDaysISO", () => {
  it("gives Mon..Sun for the week", () => {
    expect(weekDaysISO("2026-08-21")).toEqual([
      "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23",
    ]);
  });
});

describe("prettyTime", () => {
  it("formats 24h times to am/pm", () => {
    expect(prettyTime("11:30")).toBe("11:30am");
    expect(prettyTime("17:00")).toBe("5pm");
    expect(prettyTime("17:00:00")).toBe("5pm");
    expect(prettyTime("20:30")).toBe("8:30pm");
    expect(prettyTime("00:30")).toBe("12:30am");
    expect(prettyTime("12:00")).toBe("12pm");
    expect(prettyTime("")).toBe("");
  });
});

describe("shiftRangeLabel", () => {
  it("shows a time range", () => {
    expect(shiftRangeLabel({ start_time: "11:30", end_time: "17:00", until_close: false })).toBe("11:30am – 5pm");
  });
  it("shows 'close' when until_close", () => {
    expect(shiftRangeLabel({ start_time: "17:00", end_time: null, until_close: true })).toBe("5pm – close");
  });
});

describe("shiftsByArea", () => {
  it("filters by area and sorts by start", () => {
    const shifts = [mk("1", "bar", "17:00", null, true), mk("2", "bar", "11:30", "17:00"), mk("3", "kitchen", "11:30", "20:00")];
    expect(shiftsByArea(shifts, "bar").map((s) => s.id)).toEqual(["2", "1"]);
    expect(shiftsByArea(shifts, "kitchen").map((s) => s.id)).toEqual(["3"]);
  });
});

describe("areaCounts", () => {
  it("counts per area", () => {
    const shifts = [mk("1", "bar", "11:30", "17:00"), mk("2", "bar", "17:00", null, true), mk("3", "kitchen", "11:30", "20:00")];
    expect(areaCounts(shifts)).toEqual({ bar: 2, kitchen: 1 });
  });
});
