import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseVennersAudit, type PdfTextItem } from "./venners-audit";

const FIX = path.resolve(__dirname, "../../e2e/fixtures/venners");
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(FIX, `${n}.json`), "utf8")) as PdfTextItem[];
const ALL = ["WM7620260116", "WM7620260225", "WM7620260514", "WM7620260619", "WM7620260721", "WM7620260925"];

describe("Venners audit reader", () => {
  const sep = parseVennersAudit(load("WM7620260925"));
  it("reads the header", () => {
    expect(sep.summary).toMatchObject({
      periodStart: "2026-07-21", periodEnd: "2026-09-25", days: 66,
      closingStock: 12753.63, openingStock: 18097.92, revenue: 118374.45, purchases: 19688.29,
      result: 1474.83, resultPct: 1.25, gp: 74.62, optimumGp: 73.6, wastage: -49.34,
    });
    expect(sep.summary.categories.find(c => c.name === "Postmix")?.value).toBe(-303.96);
    expect(sep.summary.categories.find(c => c.name === "Draught Lager")?.value).toBe(2200.4);
    expect(sep.summary.adjustments.find(a => a.product === "Gas")).toMatchObject({ qty: -22, value: -770.42 });
  });
  it("reads all 351 lines and they all add up", () => {
    expect(sep.lines).toHaveLength(351);
    expect(sep.problems).toEqual([]);
    const total = sep.lines.reduce((s, l) => s + l.retail, 0);
    expect(total).toBeCloseTo(1474.89, 1);
  });
  it("reads the tricky lines", () => {
    const by = (n: string) => sep.lines.find(l => l.name.startsWith(n))!;
    expect(by("Postmix Pepsi Max")).toMatchObject({ base: "litres", counted: 92.4, variance: 165.106, category: "Postmix" });
    expect(by("Cider Inch")).toMatchObject({ base: "pints", counted: 89.747, category: "Draught cider" });
    expect(by("Ale John Smiths")).toMatchObject({ counted: 144, sold: 283.553, category: "Draught ale" });
    expect(by("Liqueur Jagermeister Coldbr")).toMatchObject({ base: "bottles", counted: 0.7 });
    expect(by("PPC Old Mout Berries 0%")).toMatchObject({ base: "units", counted: 29 });
    expect(by("Old Mout FW Cartridge Kiwi")).toMatchObject({ base: "ml", counted: 125 });
    expect(by("Vodka Smirnoff Rasp Crush")).toBeTruthy();
    expect(by("Lager Heineken 0.0%")).toMatchObject({ del: 14.078, ret: -14.078 });
  });
  it("every audit from the year reads cleanly", () => {
    for (const n of ALL) {
      const a = parseVennersAudit(load(n));
      expect(a.problems, n).toEqual([]);
      expect(a.lines.length, n).toBeGreaterThan(300);
      expect(a.summary.periodStart, n).toMatch(/^2026|^2025/);
      expect(a.summary.days, n).toBeGreaterThan(25);
      // Each category on page 2 matches its lines (Feb's summary shows Sundry with the sign flipped, so compare sizes)
      for (const c of a.summary.categories) {
        const lines = a.lines.filter(l => l.category.toLowerCase() === c.name.toLowerCase());
        if (!lines.length) continue;
        const sum = lines.reduce((s, l) => s + l.retail, 0);
        expect(Math.abs(Math.abs(sum) - Math.abs(c.value)), `${n} ${c.name}`).toBeLessThan(0.1);
      }
    }
  });
});
