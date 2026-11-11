import { describe, expect, it } from "vitest";
import { mergeTillPhotoRows, tillPhotoToPints } from "./till-photo";

const lines = [
  { id: "carl", name: "Carlsberg Pilsner 3.4%" },
  { id: "krono", name: "Kronenbourg 1664" },
  { id: "hob", name: "Hobgoblin Gold" },
  { id: "guin", name: "Guinness" },
];

describe("tillPhotoToPints", () => {
  it("adds pints and halves for a line", () => {
    const r = tillPhotoToPints([{ name: "CARLSBERG PT", qty: 120 }, { name: "CARLSBERG HALF", qty: 14 }], lines);
    expect(r.pints.carl).toBe(127);
    expect(r.used.carl).toHaveLength(2);
  });
  it("handles 1/2 and till abbreviations", () => {
    const r = tillPhotoToPints([{ name: "GUIN 1/2", qty: 5 }, { name: "Guinness Pint", qty: 40 }], lines);
    expect(r.pints.guin).toBe(42.5);
  });
  it("ignores spirits, wine and food", () => {
    const r = tillPhotoToPints([{ name: "GORDONS DBL", qty: 9 }, { name: "Large Merlot 250", qty: 3 }, { name: "Fish & Chips", qty: 11 }], lines);
    expect(r.pints).toEqual({});
    expect(r.ignored).toBe(3);
  });
  it("keeps a draught-looking row it can't place for the landlord", () => {
    const r = tillPhotoToPints([{ name: "MADRI PINT", qty: 30 }], lines);
    expect(r.pints).toEqual({});
    expect(r.unmatched).toEqual([{ name: "MADRI PINT", qty: 30 }]);
  });
  it("skips zero and broken quantities", () => {
    const r = tillPhotoToPints([{ name: "Hobgoblin Gold Pint", qty: 0 }, { name: "Hobgoblin Gold Pint", qty: NaN as any }], lines);
    expect(r.pints).toEqual({});
  });
  it("does not guess between two lines that sound the same", () => {
    const r = tillPhotoToPints([{ name: "FOSTERS PINT", qty: 50 }], [{ id: "a", name: "Fosters" }, { id: "b", name: "Fosters 3.4%" }]);
    expect(Object.keys(r.pints).length + r.unmatched.length).toBe(1);
  });
});

describe("mergeTillPhotoRows", () => {
  it("counts a row once when two photos overlap", () => {
    const a = [{ name: "Carlsberg Pint", qty: 120 }, { name: "Guinness Pint", qty: 40 }];
    const b = [{ name: "Guinness Pint", qty: 40 }, { name: "Hobgoblin Gold Pint", qty: 22 }];
    expect(mergeTillPhotoRows([a, b])).toHaveLength(3);
  });
  it("keeps genuine repeats inside one photo", () => {
    expect(mergeTillPhotoRows([[{ name: "Carlsberg Pint", qty: 5 }, { name: "Carlsberg Pint", qty: 5 }]])).toHaveLength(2);
  });
});

import { tillPhotoRowsToCsv } from "./till-photo";
import { guessGenericMapping, parseCsvRows, parseTillFile, type GenericMapping } from "./till-import";
describe("a photo of the report goes through the same import as a till file, every line kept", () => {
  const rows = [
    { name: "CARLSBERG PT", qty: 150, value: 720 }, { name: "GORDONS GIN 25ML", qty: 42, value: 151.2 },
    { name: 'J2O "APPLE, MANGO"', qty: 31, value: null }, { name: "PINOT GRIGIO 175", qty: 18 }, { name: "", qty: 4 }, { name: "VOID", qty: 0 },
  ];
  it("reads back name, quantity and money for spirits, wine and soft drinks, not just draught", () => {
    const csv = tillPhotoRowsToCsv(rows as any);
    const headers = parseCsvRows(csv)[0];
    const m = guessGenericMapping(headers);
    expect(m.name).toBe("Product"); expect(m.qty).toBe("Quantity"); expect(m.value).toBe("Value");
    const r = parseTillFile("generic", csv, { ...m, name: m.name!, qty: m.qty!, headerRow: 0 } as GenericMapping);
    expect(r.lines.map(l => [l.name, l.qty, l.value])).toEqual([
      ["CARLSBERG PT", 150, 720], ["GORDONS GIN 25ML", 42, 151.2], ['J2O "APPLE, MANGO"', 31, null], ["PINOT GRIGIO 175", 18, null],
    ]);
  });
});
