import { describe, expect, it } from "vitest";
import { normaliseDay, dayToDate, matchStaffName } from "./rota-parse";

const staff = [
  { id: "a", name: "Dave Smith" },
  { id: "b", name: "Libby" },
  { id: "c", name: "James" },
  { id: "d", name: "Jan" },
];

describe("normaliseDay", () => {
  it("normalises long, short and mixed labels", () => {
    expect(normaliseDay("Monday")).toBe("mon");
    expect(normaliseDay("MON")).toBe("mon");
    expect(normaliseDay("fri")).toBe("fri");
    expect(normaliseDay("Sun")).toBe("sun");
  });
  it("returns empty for junk", () => {
    expect(normaliseDay("payday")).toBe("");
    expect(normaliseDay("")).toBe("");
    expect(normaliseDay(null)).toBe("");
  });
});

describe("dayToDate", () => {
  it("maps day labels to dates in the Monday-anchored week", () => {
    // week starting Mon 2026-08-17
    expect(dayToDate("mon", "2026-08-17")).toBe("2026-08-17");
    expect(dayToDate("Friday", "2026-08-17")).toBe("2026-08-21");
    expect(dayToDate("sun", "2026-08-17")).toBe("2026-08-23");
  });
  it("is null for junk", () => {
    expect(dayToDate("payday", "2026-08-17")).toBeNull();
  });
});

describe("matchStaffName", () => {
  it("matches an exact full name", () => {
    expect(matchStaffName("Dave Smith", staff)).toEqual({ staffId: "a", confidence: "exact" });
  });
  it("matches on first name", () => {
    expect(matchStaffName("Dave", staff)).toEqual({ staffId: "a", confidence: "first" });
    expect(matchStaffName("libby", staff)).toEqual({ staffId: "b", confidence: "exact" });
  });
  it("is ambiguous when two share a first name", () => {
    const two = [{ id: "a", name: "Dave Smith" }, { id: "e", name: "Dave Jones" }];
    expect(matchStaffName("Dave", two)).toEqual({ staffId: null, confidence: "none" });
  });
  it("does a partial match on a near miss", () => {
    expect(matchStaffName("Jame", staff).staffId).toBe("c"); // Jame -> James
  });
  it("returns none for an unknown name", () => {
    expect(matchStaffName("Zoltan", staff)).toEqual({ staffId: null, confidence: "none" });
    expect(matchStaffName("", staff)).toEqual({ staffId: null, confidence: "none" });
  });
});
