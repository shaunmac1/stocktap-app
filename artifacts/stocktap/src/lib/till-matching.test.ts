import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AUTO_SUGGEST_SCORE, detectServe, emptyTillMemory, headerFingerprint, memoryKey, nameSimilarity, perTillItem, planMatches,
  readTillMemory, recall, recallMapping, remember, rememberMapping, servesFor, soldUnitMl, soldUnitsFor, suggestProducts,
  type MatchProduct,
} from "./till-matching";
import { costPerSoldUnit } from "./inventory-reporting";
import { parseCasioCsv } from "./till-import";

const PINT = 568.261;

// A small made-up pub library.
export const PRODUCTS: MatchProduct[] = [
  { id: "carling", name: "Carling 11G", category: "draught_lager", counting_method: "keg_weight", unit: "count", type: "packaged", container_l: 50, cost_price: 165, pour_price: 4.9 },
  { id: "guinness", name: "Guinness Draught 11G", category: "draught_stout", counting_method: "keg_weight", unit: "count", type: "packaged", container_l: 50, cost_price: 190, pour_price: 5.8 },
  { id: "gordons", name: "Gordon's London Dry Gin 70cl", category: "spirits", counting_method: "weigh", unit: "weigh", type: "gin", size_ml: 700, cost_price: 14, pour_price: 3.5 },
  { id: "tanq", name: "Tanqueray London Dry Gin 70cl", category: "spirits", counting_method: "weigh", unit: "weigh", type: "gin", size_ml: 700, cost_price: 17, pour_price: 4 },
  { id: "wine", name: "House Wine Sauvignon Blanc 75cl", category: "wines", counting_method: "tenths", unit: "weigh", type: "wine", size_ml: 750, cost_price: 6.5, pour_price: 5.5 },
  { id: "merlot", name: "Merlot Red 75cl", category: "wines", counting_method: "tenths", unit: "weigh", type: "wine", size_ml: 750, cost_price: 6, pour_price: 5.5 },
  { id: "crisps", name: "Crisps McCoys Cheese & Onion 45g", category: "packaged", counting_method: "each", unit: "count", type: "packaged", size_ml: null, cost_price: 0.5, pour_price: 1.5 },
  { id: "pmax", name: "Postmix Pepsi Max", category: "postmix", counting_method: "litre", unit: "count", type: "packaged", container_l: 12, pack_size: 84, cost_price: 52, pour_price: 3 },
  { id: "pepsi", name: "Postmix Pepsi", category: "postmix", counting_method: "litre", unit: "count", type: "packaged", container_l: 12, pack_size: 84, cost_price: 52, pour_price: 3 },
  { id: "j2o", name: "J2O Orange & Passion 275ml", category: "minerals", counting_method: "dozen", unit: "count", type: "packaged", size_ml: 275, pack_size: 24, cost_price: 18, pour_price: 2.8 },
];

describe("detectServe", () => {
  it.each([
    ["CARLING HALF", "half"], ["Carling 1/2", "half"], ["GUIN ½", "half"], ["CARLING PINT", "pint"], ["CARL PT", "pint"],
    ["GORDONS GIN SGL", "single"], ["GORDONS GIN DBL", "double"], ["Gordon's Gin (double)", "double"],
    ["HOUSE WINE 175", "glass175"], ["HOUSE WINE 250", "glass250"], ["Merlot Large Glass", "glass250"], ["SML GLS WHITE", "glass125"],
    ["HOUSE RED BTL", "bottle"], ["Schooner IPA", "two_thirds"], ["CIDER 1/3", "third"],
  ])("%s → %s", (name, serve) => expect(detectServe(name)).toBe(serve));
  it("returns null when the name doesn't say", () => {
    expect(detectServe("CRISPS C&O")).toBeNull();
    expect(detectServe("Bottled Peroni")).toBeNull();
  });
});

describe("serves and units", () => {
  const p = Object.fromEntries(PRODUCTS.map(x => [x.id, x]));
  it("one sold unit matches costPerSoldUnit in inventory-reporting", () => {
    for (const prod of PRODUCTS) {
      const ml = soldUnitMl(prod, 25);
      const cpsu = costPerSoldUnit(prod, 25)!;
      if (ml == null) continue;
      const cap = prod.category === "postmix" ? (prod.pack_size ?? 72) * 1000 : prod.container_l ? prod.container_l * 1000 : prod.size_ml!;
      expect(cpsu).toBeCloseTo((prod.cost_price! / cap) * ml, 6);
    }
  });
  it("draught is sold by the pint, spirits by the measure, wine by the 175ml glass, crisps each", () => {
    expect(soldUnitMl(p.carling, 25)).toBeCloseTo(PINT, 2);
    expect(soldUnitMl(p.gordons, 25)).toBe(25);
    expect(soldUnitMl(p.gordons, 35)).toBe(35);
    expect(soldUnitMl(p.wine, 25)).toBe(175);
    expect(soldUnitMl(p.crisps, 25)).toBeNull();
    expect(soldUnitMl(p.j2o, 25)).toBeNull();
    expect(soldUnitMl({ ...p.wine, size_ml: 187 }, 25)).toBe(187);
  });
  it("how much one till item is, in sold units", () => {
    expect(perTillItem(p.carling, "half", 25)).toBe(0.5);
    expect(perTillItem(p.carling, "pint", 25)).toBe(1);
    expect(perTillItem(p.carling, "two_thirds", 25)).toBeCloseTo(0.6667, 4);
    expect(perTillItem(p.gordons, "double", 25)).toBe(2);
    expect(perTillItem(p.gordons, "single", 25)).toBe(1);
    expect(perTillItem(p.gordons, "bottle", 25)).toBe(28);
    expect(perTillItem(p.wine, "glass250", 25)).toBeCloseTo(1.4286, 4);
    expect(perTillItem(p.wine, "glass125", 25)).toBeCloseTo(0.7143, 4);
    expect(perTillItem(p.wine, "bottle", 25)).toBeCloseTo(4.2857, 4);
    expect(perTillItem(p.crisps, "each", 25)).toBe(1);
    expect(perTillItem(p.crisps, "pint", 25)).toBe(1); // items ignore volume serves
    expect(perTillItem(p.pmax, "half", 25)).toBe(0.5);
    expect(perTillItem(p.gordons, "custom", 25, 3)).toBe(3);
    expect(perTillItem(p.gordons, "custom", 25, -1)).toBe(1);
  });
  it("offers serves that make sense for each kind of product", () => {
    expect(servesFor(p.carling)).toContain("half");
    expect(servesFor(p.gordons)).toEqual(["single", "double", "bottle", "custom"]);
    expect(servesFor(p.wine)).toContain("glass250");
    expect(servesFor(p.crisps)).toEqual(["each", "custom"]);
  });
});

describe("name matching", () => {
  it("scores till shorthand against library names", () => {
    expect(nameSimilarity("CARLING PINT", "Carling 11G")).toBeGreaterThanOrEqual(AUTO_SUGGEST_SCORE);
    expect(nameSimilarity("CARL PT", "Carling 11G")).toBeGreaterThanOrEqual(AUTO_SUGGEST_SCORE);
    expect(nameSimilarity("GORDONS GIN DBL", "Gordon's London Dry Gin 70cl")).toBeGreaterThanOrEqual(AUTO_SUGGEST_SCORE);
    expect(nameSimilarity("POOL TABLE", "Carling 11G")).toBe(0);
  });
  it("keeps variants apart (Pepsi Max is not Pepsi)", () => {
    const s = suggestProducts({ plu: "10", name: "PEPSI MAX PINT", qty: 1, value: null }, PRODUCTS);
    expect(s[0].productId).toBe("pmax");
    const plain = suggestProducts({ plu: "11", name: "PEPSI PINT", qty: 1, value: null }, PRODUCTS);
    expect(plain[0].productId).toBe("pepsi");
  });
  it("prefers the right gin", () => {
    expect(suggestProducts({ plu: null, name: "TANQ GIN SGL", qty: 1, value: null }, PRODUCTS)[0].productId).toBe("tanq");
    expect(suggestProducts({ plu: null, name: "GORD GIN SGL", qty: 1, value: null }, PRODUCTS)[0].productId).toBe("gordons");
  });
  it("an exact PLU / SKU hit wins outright", () => {
    const withSku = PRODUCTS.map(x => (x.id === "crisps" ? { ...x, sku: "0009" } : x));
    const s = suggestProducts({ plu: "9", name: "SNACK", qty: 1, value: null }, withSku);
    expect(s[0]).toMatchObject({ productId: "crisps", score: 1 });
  });
  it("understands crisp shorthand (C&O = cheese & onion)", () => {
    const s = suggestProducts({ plu: "9", name: "CRISPS C&O", qty: 1, value: null }, PRODUCTS);
    expect(s[0]?.productId).toBe("crisps");
    expect(s[0].score).toBeGreaterThanOrEqual(AUTO_SUGGEST_SCORE);
  });
  it("suggests nothing for things that aren't stock", () => {
    expect(suggestProducts({ plu: "13", name: "POOL TABLE", qty: 31, value: 31 }, PRODUCTS)).toEqual([]);
  });
});

describe("remembering choices per pub", () => {
  it("keys by till type, PLU and name; a reused PLU with a new name is not trusted", () => {
    let mem = emptyTillMemory();
    mem = remember(mem, "casio", { plu: "0001", name: "CARLING PINT" }, { productId: "carling", serve: "pint" });
    expect(recall(mem, "casio", { plu: "1", name: "Carling  Pint" })).toEqual({ productId: "carling", serve: "pint" });
    expect(recall(mem, "casio", { plu: "1", name: "FOSTERS PINT" })).toBeNull();
    expect(recall(mem, "sharp", { plu: "1", name: "CARLING PINT" })).toBeNull();
    expect(memoryKey("generic", { plu: null, name: " Carling Pint " })).toBe("generic:name:carling pint");
  });
  it("remembers the Other CSV columns by header row", () => {
    const headers = ["Code", "Item Description", "Qty Sold", "Gross £"];
    const mem = rememberMapping(emptyTillMemory(), headers, { name: "Item Description", qty: "Qty Sold", value: "Gross £", plu: "Code", headerRow: 2 });
    expect(recallMapping(mem, [" code", "ITEM DESCRIPTION", "Qty Sold", "Gross £"])?.qty).toBe("Qty Sold");
    expect(recallMapping(mem, ["Other"])).toBeNull();
    expect(headerFingerprint(["A ", "", "b"])).toBe("a|b");
  });
  it("reads saved memory tolerantly", () => {
    expect(readTillMemory("{not json")).toEqual(emptyTillMemory());
    expect(readTillMemory(null)).toEqual(emptyTillMemory());
    expect(readTillMemory({ matches: { k: { productId: null, serve: "unit" } } }).matches.k.productId).toBeNull();
  });
});

describe("planMatches on the synthetic Casio file", () => {
  const FIX = path.join(__dirname, "__fixtures__", "till");
  const lines = parseCasioCsv(fs.readFileSync(path.join(FIX, "casio-SE-S100-Z004_07.CSV"), "utf8")).lines;
  it("first import: suggests confident matches with the right serve, leaves the rest for the landlord", () => {
    const plan = planMatches("casio", lines, PRODUCTS, emptyTillMemory());
    const by = (n: string) => plan.find(p => p.line.name === n)!;
    expect(by("CARLING HALF")).toMatchObject({ productId: "carling", serve: "half", status: "suggested" });
    expect(by("GUINNESS PINT")).toMatchObject({ productId: "guinness", serve: "pint", status: "suggested" });
    expect(by("GORDONS GIN DBL")).toMatchObject({ productId: "gordons", serve: "double" });
    expect(by("PEPSI MAX HALF")).toMatchObject({ productId: "pmax", serve: "half" });
    expect(by("POOL TABLE")).toMatchObject({ productId: null, status: "unmatched" });
    expect(by("FISH & CHIPS, PEAS").status).toBe("unmatched");
  });
  it("second import: remembered matches and ignored lines come back without asking", () => {
    let mem = emptyTillMemory();
    mem = remember(mem, "casio", { plu: "0007", name: "HOUSE WINE 175" }, { productId: "wine", serve: "glass175" });
    mem = remember(mem, "casio", { plu: "0013", name: "POOL TABLE" }, { productId: null, serve: "unit" });
    mem = remember(mem, "casio", { plu: "0009", name: "CRISPS C&O" }, { productId: "deleted-product", serve: "each" });
    const plan = planMatches("casio", lines, PRODUCTS, mem);
    const by = (n: string) => plan.find(p => p.line.name === n)!;
    expect(by("HOUSE WINE 175")).toMatchObject({ productId: "wine", status: "remembered" });
    expect(by("POOL TABLE")).toMatchObject({ productId: null, status: "ignored" });
    // remembered product no longer in the library → fall back to suggesting
    expect(by("CRISPS C&O").status).not.toBe("remembered");
  });
  it("turns till items into sold units for sales_records", () => {
    const plan = planMatches("casio", lines, PRODUCTS, emptyTillMemory());
    const half = plan.find(p => p.line.name === "CARLING HALF")!;
    expect(soldUnitsFor(half, PRODUCTS[0], 25)).toBe(28.5);
    const dbl = plan.find(p => p.line.name === "GORDONS GIN DBL")!;
    expect(soldUnitsFor(dbl, PRODUCTS[2], 25)).toBe(76);
    expect(soldUnitsFor({ ...dbl, serve: "unit" }, PRODUCTS[6], 25)).toBe(38); // items: 1 each
  });
});
