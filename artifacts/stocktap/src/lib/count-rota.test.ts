import { describe, expect, it } from "vitest";
import { DEFAULT_ROTA, linesFor, groupOf, readRota, readStaffGroups, rotaToday, weekStart, minutesFor, spiritGroup, groupsLabel, groupStatus } from "./count-rota";

const products = [
  { id: "k1", name: "Lager Carlsberg", category: "draught_lager" },
  { id: "k2", name: "Ale Hobgoblin Gold", category: "draught_ale" },
  { id: "k3", name: "Lager Old One", category: "draught_lager", hidden_at: "2026-11-01T00:00:00Z" },
  { id: "b1", name: "PPL Budweiser 330ml", category: "packaged" },
  { id: "m1", name: "Soft J2O Orange", category: "minerals" },
  { id: "m2", name: "Postmix Cola", category: "postmix" },
  { id: "w1", name: "Colverde Pinot Grigio", category: "wines" },
  { id: "g1", name: "Gin Gordons 70cl", category: "spirits", type: "spirit" },
  { id: "g2", name: "Tanqueray", category: "spirits", type: "gin" },
  { id: "v1", name: "Absolut Vanilia", category: "spirits", type: "vodka" },
  { id: "h1", name: "Whisky Famous Grouse", category: "spirits", type: "spirit" },
  { id: "h2", name: "Bell's", category: "spirits", type: "whisky" },
  { id: "r1", name: "Rum The Kraken", category: "spirits", type: "spirit" },
  { id: "l1", name: "Liqueur Baileys", category: "spirits", type: "spirit" },
  { id: "l2", name: "Bacardi Ginger", category: "spirits", type: "liqueur" },
  { id: "l3", name: "Brandy Courvoisier VSOP", category: "spirits", type: "spirit" },
];
// Thursday 12 Nov 2026, 09:00 local
const thu = new Date(2026, 10, 12, 9, 0);
const iso = (d: number, h = 9) => new Date(2026, 10, d, h).toISOString();
const ids = (k: any) => linesFor(k, products).map(p => p.id);

describe("groups", () => {
  it("kegs and casks cover every draught line, never hidden ones", () => {
    expect(ids("kegs")).toEqual(["k1", "k2"]);
  });
  it("minerals includes postmix", () => {
    expect(ids("minerals")).toEqual(["m1", "m2"]);
  });
  it("spirits go on their own shelf: by the first word of the name, else by type", () => {
    expect(ids("gin")).toEqual(["g1", "g2"]);
    expect(ids("vodka")).toEqual(["v1"]);
    expect(ids("whisky")).toEqual(["h1", "h2"]);
    expect(ids("rum")).toEqual(["r1"]);
  });
  it("liqueurs and the rest takes everything else on the back bar, flavoured rums included", () => {
    expect(ids("liqueurs")).toEqual(["l1", "l2", "l3"]);
    expect(spiritGroup({ id: "x", name: "Bacardi Ginger", type: "liqueur" })).toBe("liqueurs");
    expect(spiritGroup({ id: "x", name: "Whiskey Jamesons" })).toBe("whisky");
  });
  it("every visible line belongs to exactly one group", () => {
    for (const p of products) expect(groupOf(p)).not.toBeNull();
    const all = ["kegs", "bottles", "minerals", "wine", "gin", "vodka", "whisky", "rum", "liqueurs"].flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(products.length - 1);
  });
  it("names several groups in plain English", () => {
    expect(groupsLabel(["gin"])).toBe("Gin");
    expect(groupsLabel(["gin", "vodka"])).toBe("Gin and Vodka");
    expect(groupsLabel(["gin", "vodka", "whisky"])).toBe("Gin, Vodka and Whisky");
  });
});

describe("rota", () => {
  it("default: Thursday is kegs, Friday gin vodka and whisky, Saturday is off", () => {
    expect(DEFAULT_ROTA[4]).toEqual(["kegs"]);
    expect(DEFAULT_ROTA[5]).toEqual(["gin", "vodka", "whisky"]);
    expect(DEFAULT_ROTA[6]).toEqual([]);
  });
  it("every group is on the default rota once", () => {
    expect(DEFAULT_ROTA.flat().sort()).toEqual(["bottles", "gin", "kegs", "liqueurs", "minerals", "rum", "vodka", "whisky", "wine"]);
  });
  it("reads a saved rota: lists, old single values, and rubbish", () => {
    expect(readRota({ count_rota: [["wine", "gin"], "kegs", null, "nonsense", ["kegs", "kegs"], [], ["spirits_a"]] })).toEqual([["wine", "gin"], ["kegs"], [], [], ["kegs"], [], []]);
    expect(readRota({})).toEqual(DEFAULT_ROTA);
    expect(readRota({ count_rota: ["wine"] })).toEqual(DEFAULT_ROTA);
  });
  it("staff groups: not set means follow the rota; set means exactly those", () => {
    expect(readStaffGroups({})).toBeNull();
    expect(readStaffGroups({ staff_groups: ["gin", "vodka", "nope"] })).toEqual(["gin", "vodka"]);
    expect(readStaffGroups({ staff_groups: [] })).toEqual([]);
  });
  it("week starts Monday", () => {
    expect(weekStart(thu).getDate()).toBe(9);
    expect(weekStart(new Date(2026, 10, 15, 12)).getDate()).toBe(9); // Sunday belongs to the week before
  });
  it("Thursday: today's count is kegs, 2 lines, not done", () => {
    const r = rotaToday(DEFAULT_ROTA, products, {}, thu);
    expect(r.today.map(t => t.key)).toEqual(["kegs"]);
    expect(r.today[0].lines).toBe(2);
    expect(r.today[0].doneToday).toBe(false);
  });
  it("Friday: three groups, each with its own done state", () => {
    const fri = new Date(2026, 10, 13, 9);
    const r = rotaToday(DEFAULT_ROTA, products, { g1: iso(13, 8) }, fri);
    expect(r.today.map(t => [t.key, t.doneToday])).toEqual([["gin", true], ["vodka", false], ["whisky", false]]);
  });
  it("done once a line in the group has been counted today, not yesterday", () => {
    expect(rotaToday(DEFAULT_ROTA, products, { k1: iso(12, 8) }, thu).today[0].doneToday).toBe(true);
    expect(rotaToday(DEFAULT_ROTA, products, { k1: iso(11, 8) }, thu).today[0].doneToday).toBe(false);
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
    expect(rotaToday(DEFAULT_ROTA, products, {}, new Date(2026, 10, 14, 9)).today).toEqual([]);
  });
  it("a group with no lines is not offered", () => {
    expect(rotaToday(DEFAULT_ROTA, products.filter(p => !p.category.startsWith("draught")), {}, thu).today).toEqual([]);
  });
  it("one group's status on its own (what staff are set to count)", () => {
    const s = groupStatus("gin", products, { g1: iso(12, 8) }, thu);
    expect([s.lines, s.countedThisWeek, s.doneToday]).toEqual([2, 1, true]);
  });
  it("time estimate", () => {
    expect(minutesFor(12)).toBe("about 5 minutes");
    expect(minutesFor(54)).toBe("about 25 minutes");
    expect(minutesFor(2)).toBe("about 2 minutes");
  });
});
