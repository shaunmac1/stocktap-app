import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  combineTillLines, detectDelimiter, detectTillType, findHeaderRow, guessGenericMapping, parseCasioCsv,
  parseCsvRows, parseGenericCsv, parseSharpCsv, parseTillDate, parseTillFile, parseTillNumber, splitCsvLine,
} from "./till-import";

// All fixture files are SYNTHETIC: built from the manuals' documented layouts (Casio) or a
// guessed layout (Sharp, generic). They say so on their first line.
const FIX = path.join(__dirname, "__fixtures__", "till");
const read = (n: string) => fs.readFileSync(path.join(FIX, n), "utf8");

describe("parseTillNumber", () => {
  it.each([
    ["412", 412], ["2,018.80", 2018.8], ["£1,682.33", 1682.33], ["-£8.17", -8.17], ["£-8.17", -8.17],
    ["12.50-", -12.5], ["3-", -3], ["(3.20)", -3.2], ["−2", -2], [" 0.00 ", 0], ["1 234.50", 1234.5],
    ["GBP 5", 5], ["5.", 5], [".5", 0.5],
  ])("%s → %s", (raw, want) => expect(parseTillNumber(raw)).toBeCloseTo(want as number, 6));
  it.each(["", "abc", "1,2", "12abc", "--", null, undefined])("%s is not a number", raw => expect(parseTillNumber(raw as any)).toBeNull());
});

describe("parseTillDate", () => {
  it("reads UK, Casio and ISO dates", () => {
    expect(parseTillDate("16-03-2015")).toBe("2015-03-16");
    expect(parseTillDate("07/11/2026")).toBe("2026-11-07");
    expect(parseTillDate("7.11.26")).toBe("2026-11-07");
    expect(parseTillDate("2026-11-07")).toBe("2026-11-07");
    expect(parseTillDate("31/13/2026")).toBeNull();
    expect(parseTillDate("PLU")).toBeNull();
  });
});

describe("CSV reading", () => {
  it("copes with Casio's spaces around commas and padded quoted values", () => {
    expect(splitCsvLine('"MODE " , "X     "')).toEqual(["MODE", "X"]);
    expect(splitCsvLine('"0014" , "FISH & CHIPS, PEAS  " , "17" , "212.50"')).toEqual(["0014", "FISH & CHIPS, PEAS", "17", "212.50"]);
  });
  it("handles doubled quotes, empty fields and a trailing delimiter", () => {
    expect(splitCsvLine('1,"6"" sub",,2,')).toEqual(["1", '6" sub', "", "2", ""]);
  });
  it("detects semicolon and tab files", () => {
    expect(detectDelimiter("a;b;c\n1;2;3\n4;5;6")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("Name,Qty\nCarling,£1,234.00")).toBe(",");
  });
  it("strips a byte-order mark, blank lines and joins a quoted line break", () => {
    const rows = parseCsvRows('﻿a,b\r\n\r\n"x\ny",2\n');
    expect(rows).toEqual([["a", "b"], ["x\ny", "2"]]);
  });
});

describe("Casio SD-card PLU file (documented layout, synthetic data)", () => {
  const r = parseCasioCsv(read("casio-SE-S100-Z004_07.CSV"));
  it("reads the header block", () => {
    expect(r.meta).toMatchObject({ machine: "MC#01", mode: "Z", zCounter: "0042", date: "2026-11-07", time: "23:41" });
    expect(r.warnings).toEqual([]);
  });
  it("reads PLU lines, nets off the refund and drops unsold PLUs", () => {
    const carling = r.lines.find(l => l.name === "CARLING PINT")!;
    expect(carling).toEqual({ plu: "0001", name: "CARLING PINT", qty: 410, value: 2009 });
    expect(r.lines.find(l => /UNUSED/.test(l.name))).toBeUndefined();
    expect(r.lines).toHaveLength(13);
    expect(r.lines.find(l => l.plu === "0014")!.name).toBe("FISH & CHIPS, PEAS");
  });
  it("totals add up", () => {
    const qty = r.lines.reduce((s, l) => s + l.qty, 0);
    expect(qty).toBe(412 + 57 + 198 + 21 + 143 + 38 + 64 + 29 + 88 + 73 + 40 + 31 + 17 - 2);
  });
  it("is detected as Casio", () => expect(detectTillType(read("casio-SE-S100-Z004_07.CSV"))).toBe("casio"));
  it("says so when the grand-total file is picked instead of the PLU file", () => {
    const g = parseCasioCsv(read("casio-SE-S100-Z020_07.CSV"));
    expect(g.lines).toEqual([]);
    expect(g.warnings.join(" ")).toMatch(/grand total file/);
    expect(g.warnings.join(" ")).toMatch(/X read/);
  });
  it("finds columns by name when Casio adds fields", () => {
    const t = '"MACHINE ","MC#01"\n"RECORD ","DESCRIPTOR ","PRICE ","QUANTITY/No ","AMOUNT "\n"0001","CARLING PINT","4.90","10","49.00"';
    expect(parseCasioCsv(t).lines).toEqual([{ plu: "0001", name: "CARLING PINT", qty: 10, value: 49 }]);
  });
  it("warns on a file that isn't Casio at all", () => {
    expect(parseCasioCsv("Name,Qty\nCarling,10").warnings[0]).toMatch(/doesn't look like a Casio/);
  });
});

describe("Sharp SD-card sales CSV (layout unverified, synthetic data)", () => {
  it("reads the PLU section of a report dump and ignores departments and clerks", () => {
    const r = parseSharpCsv(read("sharp-XE-A307-sales-sections.csv"));
    expect(r.meta.date).toBe("2026-11-07");
    expect(r.meta.mode).toBe("Z");
    expect(r.lines.map(l => l.name)).toEqual(["CARLING PINT", "CARLING HALF", "GUINNESS PINT", "GORDONS GIN SGL", "GORDONS GIN DBL", "CRISPS C&O"]);
    expect(r.lines[0]).toEqual({ plu: "1", name: "CARLING PINT", qty: 410, value: 2009 });
    expect(r.lines.find(l => l.name === "CRISPS C&O")!.value).toBe(132);
    expect(r.lines.some(l => /DRAUGHT|SHAUN/.test(l.name))).toBe(false);
    expect(r.warnings).toEqual([]);
  });
  it("reads a file with column headings, trailing-minus refunds and stops at the next section", () => {
    const r = parseSharpCsv(read("sharp-XE-A207-plu-columns.csv"));
    expect(r.lines).toEqual([
      { plu: "00001", name: "CARLING PINT", qty: 412, value: 2018.8 },
      { plu: "00002", name: "CARLING HALF", qty: 57, value: 145.35 },
      { plu: "00005", name: "GORDONS GIN SGL", qty: 140, value: 490 },
    ]);
  });
  it("is detected as Sharp", () => expect(detectTillType(read("sharp-XE-A307-sales-sections.csv"))).toBe("sharp"));
  it("explains what to do when nothing is found", () => {
    expect(parseSharpCsv("hello\nworld").warnings[0]).toMatch(/Other CSV/);
  });
});

describe("Generic CSV with a column mapper", () => {
  const text = read("generic-any-till.csv");
  const rows = parseCsvRows(text);
  it("finds the header row below the report title", () => expect(findHeaderRow(rows)).toBe(2));
  it("guesses the columns, preferring the gross (inc VAT) money column", () => {
    expect(guessGenericMapping(rows[2])).toEqual({ plu: "Code", name: "Item Description", qty: "Qty Sold", value: "Gross £" });
  });
  it("parses with the guessed mapping, skipping the grand total", () => {
    const m = guessGenericMapping(rows[2]);
    const r = parseGenericCsv(text, { ...(m as any), headerRow: 2 });
    expect(r.lines).toHaveLength(6);
    expect(r.lines[0]).toEqual({ plu: "101", name: "Carling Pint", qty: 412, value: 2018.8 });
    expect(r.lines.find(l => l.plu === "999")).toEqual({ plu: "999", name: "Refund - Carling Pint", qty: -2, value: -9.8 });
    expect(r.skipped).toContain("Grand Total");
  });
  it("works without a PLU column and finds header row itself", () => {
    const r = parseGenericCsv("Item,Sold,Takings\nCarling,10,£49.00\nCarling,2,£9.80", { name: "Item", qty: "Sold", value: "Takings" });
    expect(r.lines).toEqual([{ plu: null, name: "Carling", qty: 12, value: 58.8 }]);
  });
  it("asks for columns when the mapping is incomplete", () => {
    expect(parseGenericCsv(text, { name: "Nope", qty: "Nope" }).warnings[0]).toMatch(/Pick which column/);
    expect(parseTillFile("generic", text, null).warnings[0]).toMatch(/column/);
  });
  it("is not mistaken for a Casio or Sharp file", () => expect(detectTillType(text)).toBe("generic"));
});

describe("combineTillLines", () => {
  it("merges the same PLU even with leading zeros, and keeps null values null", () => {
    expect(combineTillLines([
      { plu: "007", name: "A", qty: 2, value: null },
      { plu: "7", name: "A", qty: -1, value: null },
      { plu: null, name: "B  b", qty: 1, value: 1 },
      { plu: null, name: "b b", qty: 1, value: 2 },
    ])).toEqual([{ plu: "007", name: "A", qty: 1, value: null }, { plu: null, name: "B  b", qty: 2, value: 3 }]);
  });
});
