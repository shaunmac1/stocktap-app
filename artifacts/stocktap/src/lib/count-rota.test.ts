import { describe, expect, it } from "vitest";
import { DEFAULT_ROTA, linesFor, groupOf, readRota, rotaToday, weekStart, minutesFor } from "./count-rota";

const products = [
  { id: "k1", name: "Lager Carlsberg", category: "draught_lager" },
  { id: "k2", name: "Ale Hobgoblin Gold", category: "draught_ale" },
  { id: "k3", name: "Lager Old One", category: "draught_lager", hidden_at: "2026-11-01T00:00:00Z" },
  { id: "b1", name: "PPL Budweiser 330ml", category: "packaged" },
  { id: "m1", name: "Soft J2O Orange", category: "minerals" },
  { id: "m2", name: "Postmix Cola", category: "postmix" },
  { id: "w1", name: "Colverde Pinot Grigio", category: "wines" },
  { id: "s1", name: "Gin Gordons 70cl", category: "spirits" },
  { id: "s2", name: "Whisky Famous Grouse", category: "spirits" },
  { id: "s3", name: "1800 Tequila", category: "spirits" },
];
// Thursday 12 Nov 2026, 09:00 local
const thu = new Date(2026, 10, 12, 9, 0);
const iso = (d: number, h = 9) => new Date(2026, 10, d, h).toISOString();

describe("groups", () => {
  it("kegs and casks cover every draught line, never hidden ones", () => {
    expect(linesFor("kegs", products).map(p => p.id)).toEqual(["k1", "k2"]);
  });
  it("minerals includes postmix", () => {
    expect(linesFor("minerals", products).map(p => p.id)).toEqual(["m1", "m2"]);
  });
  it("spirits split in two by name; digits go in the second half", () => {
    expect(linesFor("spirits_a", products).map(p => p.id)).toEqual(["s1"]);
    expect(linesFor("spirits_b", products).map(p => p.id)).toEqual(["s2", "s3"]);
  });
  it("every visible line belongs to exactly one group", () => {
    for (const p of products) expect(groupOf(p)).not.toBeNull();
  });
});

describe("rota", () => {
  it("default: Thursday is kegs, Saturday is off", () => {
    expect(DEFAULT_ROTA[4]).toBe("kegs");
    expect(DEFAULT_ROTA[6]).toBeNull();
  });
  it("reads a saved rota, ignoring rubbish", () => {
    expect(readRota({ count_rota: ["wine", "kegs", null, "nonsense", "kegs", null, null] })).toEqual(["wine", "kegs", null, null, "kegs", null, null]);
    expect(readRota({})).toEqual(DEFAULT_ROTA);
    expect(readRota({ count_rota: ["wine"] })).toEqual(DEFAULT_ROTA);
  });
  it("week starts Monday", () => {
    expect(weekStart(thu).getDate()).toBe(9);
    expect(weekStart(new Date(2026, 10, 15, 12)).getDate()).toBe(9); // Sunday belongs to the week before
  });
  it("Thursday: today's count is kegs, 2 lines, not done", () => {
    const r = rotaToday(DEFAULT_ROTA, products, {}, thu);
    expect(r.today?.key).toBe("kegs");
    expect(r.today?.lines).toBe(2);
    expect(r.doneToday).toBe(false);
  });
  it("done once a line in the group has been counted today", () => {
    expect(rotaToday(DEFAULT_ROTA, products, { k1: iso(12, 8) }, thu).doneToday).toBe(true);
    expect(rotaToday(DEFAULT_ROTA, products, { k1: iso(11, 8) }, thu).doneToday).toBe(false);
  });
  it("overdue: Monday to Wednesday groups not counted this week, in day order", () => {
    const r = rotaToday(DEFAULT_ROTA, products, { m1: iso(10) }, thu); // minerals done Tuesday
    expect(r.overdue.map(o => o.key)).toEqual(["bottles", "wine"]);
  });
  it("last week's count doesn't clear this week's", () => {
    const r = rotaToday(DEFAULT_ROTA, products, { b1: iso(5) }, thu);
    expect(r.overdue.map(o => o.key)).toContain("bottles");
  });
  it("counts distinct lines done this week", () => {
    expect(rotaToday(DEFAULT_ROTA, products, { k1: iso(12, 8), m1: iso(10), b1: iso(5) }, thu).linesThisWeek).toBe(2);
  });
  it("a day off has no count", () => {
    expect(rotaToday(DEFAULT_ROTA, products, {}, new Date(2026, 10, 14, 9)).today).toBeNull();
  });
  it("a group with no lines is not offered", () => {
    expect(rotaToday(DEFAULT_ROTA, products.filter(p => !p.category.startsWith("draught")), {}, thu).today).toBeNull();
  });
  it("time estimate", () => {
    expect(minutesFor(12)).toBe("about 5 minutes");
    expect(minutesFor(54)).toBe("about 25 minutes");
    expect(minutesFor(2)).toBe("about 2 minutes");
  });
});
