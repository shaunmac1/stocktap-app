import { describe, it, expect } from "vitest";
import {
  parseMoney, parseDate, parseCsv, guessFieldForHeader, mapRows, summarise, withinRange,
  normaliseStatus,
  type FinanceEntry, type FinanceField,
} from "./finance";

describe("parseDate calendar validation", () => {
  it("rejects impossible calendar dates", () => {
    expect(parseDate("2026-13-40")).toBeNull();
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("30/02/2026")).toBeNull();
    expect(parseDate("29/02/2027")).toBeNull(); // not a leap year
  });
  it("accepts real edge dates", () => {
    expect(parseDate("29/02/2028")).toBe("2028-02-29"); // leap year
    expect(parseDate("2026-08-31")).toBe("2026-08-31");
  });
});

describe("normaliseStatus", () => {
  it("maps owed-style words to 'due'", () => {
    for (const s of ["Outstanding", "UNPAID", "owing", "Overdue", "Due", "to pay", "not paid"])
      expect(normaliseStatus(s)).toBe("due");
  });
  it("maps paid-style words to 'paid'", () => {
    for (const s of ["Paid", "SETTLED", "cleared"]) expect(normaliseStatus(s)).toBe("paid");
  });
  it("returns null for unknown/empty", () => {
    expect(normaliseStatus("")).toBeNull();
    expect(normaliseStatus("banana")).toBeNull();
    expect(normaliseStatus(null)).toBeNull();
  });
});

describe("guessFieldForHeader — status vs amount", () => {
  it("maps a lone Paid/Status column to status, not amount", () => {
    expect(guessFieldForHeader("Paid")).toBe("status");
    expect(guessFieldForHeader("Status")).toBe("status");
    expect(guessFieldForHeader("Outstanding")).toBe("status");
  });
  it("still maps money columns to amount", () => {
    expect(guessFieldForHeader("Amount Paid")).toBe("amount");
    expect(guessFieldForHeader("Total Amount Payable")).toBe("amount");
  });
});

describe("mapRows sign handling", () => {
  it("flags negative/bracketed amounts while storing the absolute value", () => {
    const rows = mapRows(["entry_date", "amount"], [["01/08/2026", "(50.00)"], ["02/08/2026", "20"]]);
    expect(rows[0]).toMatchObject({ amount: 50, negative: true, valid: true });
    expect(rows[1]).toMatchObject({ amount: 20, negative: false, valid: true });
  });
});

describe("parseMoney", () => {
  it("parses plain and formatted numbers", () => {
    expect(parseMoney("1234.5")).toBe(1234.5);
    expect(parseMoney("£1,234.50")).toBe(1234.5);
    expect(parseMoney("  £ 99 ")).toBe(99);
    expect(parseMoney(42)).toBe(42);
  });
  it("treats parens and minus as negative", () => {
    expect(parseMoney("(45.00)")).toBe(-45);
    expect(parseMoney("-12.30")).toBe(-12.3);
  });
  it("returns null for blanks/junk", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("n/a")).toBeNull();
    expect(parseMoney(".")).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses ISO", () => { expect(parseDate("2026-08-22")).toBe("2026-08-22"); });
  it("parses DD/MM/YYYY (UK)", () => {
    expect(parseDate("22/08/2026")).toBe("2026-08-22");
    expect(parseDate("1/2/26")).toBe("2026-02-01");
    expect(parseDate("22-08-2026")).toBe("2026-08-22");
  });
  it("parses '12 Aug 2026' style", () => {
    expect(parseDate("12 Aug 2026")).toBe("2026-08-12");
    expect(parseDate("5 September 2025")).toBe("2025-09-05");
  });
  it("rejects impossible/empty", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("32/13/2026")).toBeNull();
    expect(parseDate("hello")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("splits simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("handles quoted fields with commas and quotes", () => {
    expect(parseCsv('name,note\n"Smith, John","said ""hi"""')).toEqual([
      ["name", "note"],
      ["Smith, John", 'said "hi"'],
    ]);
  });
  it("handles CRLF and drops empty lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("guessFieldForHeader", () => {
  it("maps common headers", () => {
    expect(guessFieldForHeader("Date")).toBe("entry_date");
    expect(guessFieldForHeader("Due Date")).toBe("due_date");
    expect(guessFieldForHeader("Total Amount Payable")).toBe("amount");
    expect(guessFieldForHeader("Supplier")).toBe("supplier");
    expect(guessFieldForHeader("Payee")).toBe("supplier");
    expect(guessFieldForHeader("Invoice No")).toBe("reference");
    expect(guessFieldForHeader("Notes")).toBe("description");
    expect(guessFieldForHeader("Category")).toBe("category");
    expect(guessFieldForHeader("random")).toBe("ignore");
  });
});

describe("mapRows", () => {
  const mapping: FinanceField[] = ["entry_date", "supplier", "amount", "reference"];
  it("maps and validates rows", () => {
    const rows = mapRows(mapping, [
      ["22/08/2026", "Marston's", "£1,200.00", "INV-1"],
      ["23/08/2026", "Britvic", "(50)", "INV-2"],
      ["bad", "X", "nope", ""],
    ]);
    expect(rows[0]).toMatchObject({ entry_date: "2026-08-22", supplier: "Marston's", amount: 1200, reference: "INV-1", valid: true });
    expect(rows[1]).toMatchObject({ amount: 50, valid: true }); // abs value
    expect(rows[2].valid).toBe(false);
  });
});

describe("summarise", () => {
  const e = (direction: "in" | "out", amount: number, status: "paid" | "due" | "received" = "paid"): FinanceEntry => ({
    id: Math.random().toString(), venue_id: "v", direction, entry_date: "2026-08-01",
    due_date: null, category: "x", supplier: null, description: null, amount, status, reference: null, source: "manual",
  });
  it("computes income, outgoings, net and payable", () => {
    const s = summarise([e("in", 1000), e("out", 300, "paid"), e("out", 200, "due")]);
    expect(s.income).toBe(1000);
    expect(s.outgoings).toBe(500);
    expect(s.net).toBe(500);
    expect(s.payable).toBe(200);
    expect(s.count).toBe(3);
  });
});

describe("withinRange", () => {
  const mk = (d: string): FinanceEntry => ({
    id: d, venue_id: "v", direction: "out", entry_date: d, due_date: null, category: "x",
    supplier: null, description: null, amount: 1, status: "paid", reference: null, source: "manual",
  });
  it("filters inclusive of both ends", () => {
    const rows = withinRange([mk("2026-07-31"), mk("2026-08-01"), mk("2026-08-31"), mk("2026-09-01")], "2026-08-01", "2026-08-31");
    expect(rows.map((r) => r.entry_date)).toEqual(["2026-08-01", "2026-08-31"]);
  });
});
