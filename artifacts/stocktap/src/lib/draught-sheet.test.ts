import { describe, it, expect } from "vitest";
import { buildDraughtSheet, draughtSheetCsv } from "./draught-sheet";

const keg = 50000; // 50L in ml
const carl = { id: "c", name: "Lager Carlsberg Pilsner 3.4%", category: "draught_lager", counting_method: "keg_weight", container_l: 50 };
const gold = { id: "g", name: "Ale Hobgoblin Gold", category: "draught_ale", counting_method: "dipstick", container_l: 40.9 };
const gin = { id: "x", name: "Gordon's", category: "spirits", counting_method: "weigh" };

describe("Venners-style draught sheet", () => {
  const rows = buildDraughtSheet([
    { prod: carl, entries: [{ ml_remaining: 9 * keg + 80 * 568.261, count_location_name: "Cellar" }, { ml_remaining: 4 * keg, count_location_name: "Outside store" }] },
    { prod: gold, entries: [{ ml_remaining: 181 * 568.261, count_location_name: "Cellar" }] },
    { prod: gin as any, entries: [{ ml_remaining: 500 }] },
  ]);
  it("only draught, ales before lagers like the Venners sheet", () => {
    expect(rows.map(r => r.name)).toEqual(["Ale Hobgoblin Gold", "Lager Carlsberg Pilsner 3.4%"]);
  });
  it("Whole gallons and Part pints, both stores added", () => {
    expect(rows[1]).toMatchObject({ unit: "Gallon 8 Pint", whole: 153, part: 0, pints: 1224 });
    expect(rows[1].spots).toEqual([{ name: "Cellar", whole: 109, part: 0 }, { name: "Outside store", whole: 44, part: 0 }]);
    expect(rows[0]).toMatchObject({ whole: 22, part: 5 });
  });
  it("CSV has a column pair per store", () => {
    const csv = draughtSheetCsv(rows, "Teal Farm", "9 Nov 2026");
    expect(csv.split("\n")[1]).toBe("Category,Product,Unit,Whole,Part,Pints,Cellar whole,Cellar part,Outside store whole,Outside store part");
    expect(csv).toContain("Draught Lager,Lager Carlsberg Pilsner 3.4%,Gallon 8 Pint,153,0,1224,109,0,44,0");
    expect(csv).toContain("Draught Ale,Ale Hobgoblin Gold,Gallon 8 Pint,22,5,181,22,5,0,0");
  });
});
