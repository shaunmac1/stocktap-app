import { describe, it, expect } from "vitest";
import { buildEntrySheet, entryFromTotal, entrySheetCsv, entrySheetText, entrySheetTsv, sizeLabel } from "./entry-sheet";

const PINT = 568.261;
const lines = [
  { prod: { id: "w", name: "Wine Merlot CYT", category: "wines", counting_method: "tenths", size_ml: 750 }, entries: [{ method: "tenths", full_containers: 3, part_value: 5, ml_remaining: 3.5 * 750 }] },
  { prod: { id: "g", name: "Gin Gordons", category: "spirits", counting_method: "tenths", size_ml: 700 }, entries: [{ method: "tenths", full_containers: 2, part_value: 7, ml_remaining: 2.7 * 700 }] },
  { prod: { id: "a", name: "absolut", category: "spirits", counting_method: "weigh", size_ml: 700 }, entries: [{ method: "weigh", full_containers: 0, part_value: null, ml_remaining: 0.25 * 700 }] },
  { prod: { id: "c", name: "Lager Carlsberg", category: "draught_lager", counting_method: "keg_weight", container_l: 50 }, entries: [{ method: "keg_weight", full_containers: 1, part_value: 0, ml_remaining: 88 * PINT }, { method: "keg_weight", full_containers: 0, part_value: 21, ml_remaining: 21 * PINT }] },
  { prod: { id: "h", name: "Ale Hobgoblin", category: "draught_ale", counting_method: "dipstick", container_l: 40.9 }, entries: [{ method: "dipstick", full_containers: 0, part_value: 0, ml_remaining: 37 * PINT }] },
  { prod: { id: "b", name: "PPL Becks 275ml", category: "packaged", counting_method: "each", size_ml: 275 }, entries: [{ method: "each", full_containers: null, part_value: 63, ml_remaining: 63 * 275 }] },
  { prod: { id: "k", name: "Crisps McCoys Salted 45g", category: "packaged", counting_method: "each" }, entries: [{ method: "each", full_containers: null, part_value: 31, ml_remaining: 31 }] },
  { prod: { id: "p", name: "Postmix Pepsi", category: "postmix", counting_method: "litre", container_l: 12 }, entries: [{ method: "litre", full_containers: null, part_value: null, ml_remaining: 17250 }] },
  { prod: { id: "t", name: "Mixer Britvic Tonic 200ml", category: "minerals", counting_method: "dozen", size_ml: 200, pack_size: 24 }, entries: [{ method: "dozen", full_containers: 2, part_value: 5, ml_remaining: 53 * 200 }] },
  { prod: { id: "z", name: "Nothing counted", category: "spirits" }, entries: [] },
];
const rows = buildEntrySheet(lines as any);
const row = (id: string) => rows.find(r => r.id === id)!;

describe("entry sheet in stocktake-sheet order", () => {
  it("categories A to Z, then products A to Z whatever their capitals", () => {
    expect(rows.map(r => r.id)).toEqual(["h", "c", "t", "k", "b", "p", "a", "g", "w"]);
  });
  it("leaves out lines with nothing counted", () => { expect(rows.find(r => r.id === "z")).toBeUndefined(); });
  it("draught: gallons and pints, both spots added", () => {
    expect(row("c")).toMatchObject({ unit: "Gallon 8 Pint", whole: "13", part: "5", spoken: "13 gal 5 pt" });
    expect(row("h")).toMatchObject({ whole: "4", part: "5" });
  });
  it("bottles: full bottles and tenths, with the bottle size in the unit", () => {
    expect(row("g")).toMatchObject({ unit: "10 70cl", whole: "2", part: "7", spoken: "2 bottles 7 tenths" });
    expect(row("w")).toMatchObject({ unit: "10 75cl", whole: "3", part: "5" });
    expect(row("a")).toMatchObject({ whole: "0", part: "2½", spoken: "0 bottles 2½ tenths" });
  });
  it("packaged: dozens and singles, even when the case is a 24", () => {
    expect(row("b")).toMatchObject({ unit: "Dozen 12 Each", whole: "5", part: "3", spoken: "5 doz 3 (63 singles)" });
    expect(row("t")).toMatchObject({ whole: "4", part: "5" });
  });
  it("snacks each, postmix litres, neither with a part", () => {
    expect(row("k")).toMatchObject({ unit: "Each", whole: "31", part: null });
    expect(row("p")).toMatchObject({ unit: "Litre", whole: "17.25", part: null, spoken: "17.25 litres" });
  });
  it("size labels", () => { expect([700, 750, 1000, 1500, 187, 500, null].map(sizeLabel)).toEqual(["70cl", "75cl", "1L", "1.5L", "187ml", "50cl", "70cl"]); });
  it("text, tab-separated and CSV all carry the same figures", () => {
    const text = entrySheetText(rows, "The Red Lion", "13 Nov 2026");
    expect(text).toContain("DRAUGHT ALE\nAle Hobgoblin: 4 gal 5 pt\n\nDRAUGHT LAGER\nLager Carlsberg: 13 gal 5 pt");
    expect(text).toContain("SPIRITS\nabsolut: 0 bottles 2½ tenths\nGin Gordons: 2 bottles 7 tenths");
    expect(entrySheetTsv(rows).split("\n")[2]).toBe("Draught Lager\tLager Carlsberg\tGallon 8 Pint\t13\t5");
    expect(entrySheetCsv(rows, "The Red Lion", "13 Nov 2026")).toContain("Postmix,Postmix Pepsi,Litre,17.25,\n");
  });
});

describe("counts stored as one total per product (older counts, audit imports)", () => {
  const becks = { id: "b", name: "PPL Becks 275ml", category: "packaged", counting_method: "each", size_ml: 275 };
  const gin = { id: "g", name: "Gin Gordons", category: "spirits", counting_method: "tenths", size_ml: 700 };
  const keg = { id: "c", name: "Lager Carlsberg", category: "draught_lager", counting_method: "keg_weight", container_l: 50 };
  const sheet = (prod: any, ml: number, count?: number | null) => buildEntrySheet([{ prod, entries: [entryFromTotal(prod, ml, count)] }])[0];
  it("units from the stored count", () => { expect(sheet(becks, 63 * 275, 63)).toMatchObject({ whole: "5", part: "3" }); });
  it("units from ml when no count was stored", () => { expect(sheet(becks, 30 * 275, null)).toMatchObject({ whole: "2", part: "6" }); });
  it("bottles and draught straight from ml", () => {
    expect(sheet(gin, 2.7 * 700)).toMatchObject({ whole: "2", part: "7" });
    expect(sheet(keg, 109 * 568.261)).toMatchObject({ whole: "13", part: "5" });
  });
});
