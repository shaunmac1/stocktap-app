import { describe, expect, it } from "vitest";
import {
  parseDeliveryNote, readPack, matchLine, matchStrength, lineAmount, lineReference,
  draftProductFromLine, deliveredAtIso, nameTokens, type MatchableProduct,
} from "./delivery-note";

// A Carlsberg Britvic "Today's delivery" email as it pastes out of Outlook (tab separated).
// Site name and order numbers are made up.
const NOTE = [
  "From: Cockpit <noreply@example.test>",
  "Subject: Today's Carlsberg Britvic Delivery",
  "Carlsberg Britvic",
  "Today's delivery",
  "Site\tSample Inn - MP&Bs",
  "Date\t28/09/2026",
  "Delivery window\t07:00 - 11:00",
  "Delivery Order 0400000001",
  "Sales Order 900000002",
  "PO 4500000003",
  "PA",
  "Custom",
  "Mat No\tMat No\tDescription\tQty",
  "43431\t113993\tKP DR Peanuts x 18\t1",
  "43434\t113994\tKP Salted Peanuts x 18\t1",
  "89267\t114831\tMcCoys Cheddar and Onion 36x45g\t1",
  "91001\t119465\tMcCoys Hot and Spicy 36x45g\t1",
  "ZKE",
  "Custom",
  "Mat No\tMat No\tDescription\tQty",
  "318\t27763\tStrongbow Cider 11g Keg CMBC Prod\t2",
  "148\t56615\tGuinness 11g Keg\t2",
  "90350\t27139\tPoretti 11g Keg\t1",
  "69353\t33193\tEstrella Damm 50L Keg\t4",
  "90601\t33808\t1664 Biere 50L Keg\t2",
  "91113\t37863\tOld Mout Flavourwave Multi 30L Keg\t2",
  "CT",
  "35428\t28093\tRobinsons FruitShoot App&BC 24x275ml BOT\t2",
  "3898\t56725\tJ2O Orange &Passion Fruit 24x275ml BOT\t2",
  "90791\t57994\tSunpride Cranberry 12x1L\t1",
  "90296\t56728\tBritvic Lime Cordial 12x1L PET\t1",
  "57804\t16607\tBritvic Low Cal Tonic Water 24x200ml BOT\t1",
  "90602\t34927\tStella Artois 0.0 6x4x330ml BOT\t1",
  "90676\t35130\tLovelli Prosecco 24x200ml BOT\t2",
  "91222\t39161\tRed Bull White Peach 12x250ml CAN\t1",
  "BO",
  "780\t61743\tCaptain Morgans Spiced Gold 70cl (C6)\t1",
  "90448\t34389\tHardys 202 MR Chard 75cl (C6)\t2",
  "90700\t35125\tArietta Pinot Grigio Rose 75cl (C6)\t2",
  "91110\t37862\tOld Mout Flavourwave Kiwi & Lime 250ml\t1",
  "PCE",
  "2142\t102845\tCO2 Cyl Med C-T Rented\t3",
  "BG",
  "47383\t38362\tPepsi Max BIB 1X12 H Yield\t2",
  "43876\t38356\tR White's Lemonade 12L BIB HY\t2",
  "43878\t38365\tPepsi 12L BIB Orange Connector\t1",
  "Carlsberg Britvic, Marston's House, Brewery Road, Wolverhampton",
].join("\n");

const P = (id: string, name: string, extra: Partial<MatchableProduct> = {}): MatchableProduct => ({ id, name, ...extra });
const LIB: MatchableProduct[] = [
  P("kp-s", "Nuts KP Original Salted", { category: "packaged", counting_method: "each" }),
  P("cc-o", "Crisps McCoys Cheese & Onion 45g", { category: "packaged", counting_method: "each" }),
  P("cc-h", "Crisps McCoys Hot 'N' Spicy 45g", { category: "packaged", counting_method: "each" }),
  P("cc-s", "Crisps McCoys Salted 45g", { category: "packaged", counting_method: "each" }),
  P("sb", "Cider Strongbow", { category: "draught_cider", counting_method: "keg_weight", container_l: 50 }),
  P("sbd", "Cider Strongbow Dark", { category: "draught_cider", counting_method: "keg_weight", container_l: 50 }),
  P("gu", "Stout Guinness", { category: "draught_stout", counting_method: "keg_weight", container_l: 50 }),
  P("gu0", "PPA Guinness 0% 538ml Can", { category: "packaged", counting_method: "each", size_ml: 538 }),
  P("po", "Lager Birra Poretti", { category: "draught_lager", counting_method: "keg_weight", container_l: 50 }),
  P("es", "Lager Estrella Damm", { category: "draught_lager", counting_method: "keg_weight", container_l: 50 }),
  P("es-b", "PPL Estrella Damm 330ml", { category: "packaged", counting_method: "each", size_ml: 330 }),
  P("kr", "Lager Bierre Kronenbourg", { category: "draught_lager", counting_method: "keg_weight", container_l: 50 }),
  P("om", "Cider Old Mout FlavourWave 30L Keg", { category: "draught_cider", counting_method: "keg_weight", container_l: 30 }),
  P("fs-ab", "Soft FruitShoot LS App/Blk 275ml", { category: "minerals", counting_method: "each", size_ml: 275 }),
  P("fs-o", "Soft FruitShoot LS Orange 275ml", { category: "minerals", counting_method: "each", size_ml: 275 }),
  P("j2o", "Soft J2O Orange & P/Fruit 275ml", { category: "minerals", counting_method: "each", size_ml: 275 }),
  P("sp-c", "Juice Sunpride Cranberry", { category: "minerals", counting_method: "litre", size_ml: 1000 }),
  P("cd-l", "Cordial Britvic Lime 12x1L", { category: "minerals", counting_method: "dozen", size_ml: 1000 }),
  P("ton", "Mixer Britvic Tonic 200ml", { category: "minerals", counting_method: "each", size_ml: 200 }),
  P("ton-s", "Mixer Britvic Tonic Slim 200ml", { category: "minerals", counting_method: "each", size_ml: 200 }),
  P("st0", "PPL Stella Artois 0% 330ml", { category: "packaged", counting_method: "each", size_ml: 330 }),
  P("st", "Lager Stella Artois", { category: "draught_lager", counting_method: "keg_weight", container_l: 45.5 }),
  P("lp", "Lovelli Prosecco", { category: "wines", counting_method: "weigh", size_ml: 750 }),
  P("lp-s", "Lovelli Prosecco (single serve)", { category: "wines", counting_method: "weigh", size_ml: 200 }),
  P("rb-p", "Soft Red Bull Peach 250ml", { category: "minerals", counting_method: "each", size_ml: 250 }),
  P("rb", "Soft Red Bull 250ml", { category: "minerals", counting_method: "each", size_ml: 250 }),
  P("cm", "Rum Captain Morgan", { category: "spirits", counting_method: "tenths", size_ml: 700 }),
  P("cm-s", "Rum Captain Morgan Spiced", { category: "spirits", counting_method: "tenths", size_ml: 700 }),
  P("hc", "Wine Chard Hardy's 202", { category: "wines", counting_method: "tenths", size_ml: 750 }),
  P("hr", "Wine Rose Hardy's Main Rd", { category: "wines", counting_method: "tenths", size_ml: 750 }),
  P("hs", "Wine Shiraz Hardy's 202", { category: "wines", counting_method: "tenths", size_ml: 750 }),
  P("ar", "Wine Pinot Blush Arietta", { category: "wines", counting_method: "tenths", size_ml: 750 }),
  P("co", "Wine Pinot G. Colverde", { category: "wines", counting_method: "tenths", size_ml: 750 }),
  P("om-kl", "Old Mout FW Cartridge Kiwi & Lime 250ml", { category: "minerals", counting_method: "litre", size_ml: 250 }),
  P("om-klb", "PPC Old Mout Kiwi & Lime 500ml", { category: "packaged", counting_method: "each", size_ml: 500 }),
  P("pm-m", "Postmix Pepsi Max", { category: "postmix", counting_method: "litre", container_l: 12 }),
  P("pm-p", "Postmix Pepsi", { category: "postmix", counting_method: "litre", container_l: 12 }),
  P("pm-d", "Postmix Pepsi Diet", { category: "postmix", counting_method: "litre", container_l: 12 }),
  P("pm-l", "Postmix Lemonade", { category: "postmix", counting_method: "litre", container_l: 12 }),
  P("tango", "Soft Tango Orange 330ml", { category: "minerals", counting_method: "each", size_ml: 330 }),
];

const note = parseDeliveryNote(NOTE);
const byDesc = (d: string) => note.lines.find(l => l.description.startsWith(d))!;
const matchOf = (d: string) => { const l = byDesc(d); return matchLine(l, readPack(l.description), LIB); };

describe("reading the email", () => {
  it("gets the header", () => {
    expect(note.supplier).toBe("Carlsberg Britvic");
    expect(note.date).toBe("2026-09-28");
    expect(note.time).toBe("07:00");
    expect(note.deliveryOrder).toBe("0400000001");
    expect(note.salesOrder).toBe("900000002");
    expect(note.po).toBe("4500000003");
  });
  it("gets every line and nothing else", () => {
    expect(note.lines).toHaveLength(26);
    expect(note.lines[0]).toMatchObject({ codes: ["43431", "113993"], description: "KP DR Peanuts x 18", qty: 1 });
    expect(byDesc("Estrella Damm 50L Keg").qty).toBe(4);
  });
  it("works when each cell is on its own line", () => {
    const cellPerLine = NOTE.replace(/\t/g, "\n");
    const n2 = parseDeliveryNote(cellPerLine);
    expect(n2.lines.map(l => [l.description, l.qty])).toEqual(note.lines.map(l => [l.description, l.qty]));
  });
  it("works when cells are separated by spaces", () => {
    const spaced = NOTE.replace(/\t/g, "  ");
    const n3 = parseDeliveryNote(spaced);
    expect(n3.lines).toHaveLength(26);
    expect(n3.lines.find(l => l.description.startsWith("Guinness"))!.qty).toBe(2);
  });
});

describe("what arrived", () => {
  it("reads kegs, boxes, packs and bottles", () => {
    expect(readPack("Strongbow Cider 11g Keg CMBC Prod")).toMatchObject({ kind: "keg", itemMl: 50000 });
    expect(readPack("Old Mout Flavourwave Multi 30L Keg")).toMatchObject({ kind: "keg", itemMl: 30000 });
    expect(readPack("Pepsi Max BIB 1X12 H Yield")).toMatchObject({ kind: "box", itemMl: 12000 });
    expect(readPack("R White's Lemonade 12L BIB HY")).toMatchObject({ kind: "box", itemMl: 12000 });
    expect(readPack("Robinsons FruitShoot App&BC 24x275ml BOT")).toMatchObject({ kind: "pack", perQty: 24, itemMl: 275 });
    expect(readPack("Stella Artois 0.0 6x4x330ml BOT")).toMatchObject({ perQty: 24, itemMl: 330 });
    expect(readPack("Sunpride Cranberry 12x1L")).toMatchObject({ perQty: 12, itemMl: 1000 });
    expect(readPack("McCoys Salted 36x45g")).toMatchObject({ perQty: 36, itemMl: null });
    expect(readPack("KP DR Peanuts x 18")).toMatchObject({ perQty: 18, itemMl: null });
    expect(readPack("Captain Morgans Spiced Gold 70cl (C6)")).toMatchObject({ kind: "bottle", perQty: 1, itemMl: 700 });
    expect(readPack("Hardys 202 MR Chard 75cl (C6)")).toMatchObject({ kind: "pack", perQty: 6, itemMl: 750 });
    expect(readPack("Old Mout Flavourwave Kiwi & Lime 250ml")).toMatchObject({ kind: "bottle", itemMl: 250 });
    expect(readPack("CO2 Cyl Med C-T Rented")).toMatchObject({ kind: "unit", perQty: 1 });
  });
});

describe("matching to the library", () => {
  const expectMatch: Array<[string, string]> = [
    ["KP Salted Peanuts", "kp-s"],
    ["McCoys Cheddar and Onion", "cc-o"],
    ["McCoys Hot and Spicy", "cc-h"],
    ["Strongbow Cider 11g", "sb"],
    ["Guinness 11g Keg", "gu"],
    ["Poretti 11g", "po"],
    ["Estrella Damm 50L", "es"],
    ["1664 Biere", "kr"],
    ["Old Mout Flavourwave Multi", "om"],
    ["Robinsons FruitShoot App&BC", "fs-ab"],
    ["J2O Orange", "j2o"],
    ["Sunpride Cranberry", "sp-c"],
    ["Britvic Lime Cordial", "cd-l"],
    ["Britvic Low Cal Tonic", "ton-s"],
    ["Stella Artois 0.0", "st0"],
    ["Lovelli Prosecco 24x200ml", "lp-s"],
    ["Red Bull White Peach", "rb-p"],
    ["Captain Morgans Spiced Gold", "cm-s"],
    ["Hardys 202 MR Chard", "hc"],
    ["Arietta Pinot Grigio Rose", "ar"],
    ["Old Mout Flavourwave Kiwi & Lime 250ml", "om-kl"],
    ["Pepsi Max BIB", "pm-m"],
    ["R White's Lemonade", "pm-l"],
    ["Pepsi 12L BIB", "pm-p"],
  ];
  for (const [desc, id] of expectMatch) {
    it(`${desc} → ${id}`, () => {
      const m = matchOf(desc);
      expect(m.product?.id).toBe(id);
    });
  }
  it("does not invent a match for things not in the library", () => {
    expect(matchOf("KP DR Peanuts").product).toBeNull();
    expect(matchOf("CO2 Cyl").product).toBeNull();
  });
  it("a keg never matches cans or bottles", () => {
    const m = matchOf("Guinness 11g Keg");
    expect(m.product?.id).not.toBe("gu0");
  });
  it("a remembered supplier code wins", () => {
    const l = byDesc("Pepsi 12L BIB");
    const lib = LIB.map(p => p.id === "pm-d" ? { ...p, sku: "38365" } : p);
    const m = matchLine(l, readPack(l.description), lib);
    expect(m).toMatchObject({ bySku: true, score: 1 });
    expect(m.product?.id).toBe("pm-d");
    expect(matchStrength(m)).toBe("sure");
  });
  it("tokens ignore category words and pack noise", () => {
    expect(nameTokens("Soft FruitShoot LS App/Blk 275ml")).toEqual(["fruitshoot", "ls", "apple", "blackcurrant"]);
    expect(nameTokens("Robinsons FruitShoot App&BC 24x275ml BOT")).toEqual(["fruitshoot", "apple", "blackcurrant"]);
  });
});

describe("amounts in each product's own units", () => {
  const amt = (d: string, id: string) => { const l = byDesc(d); return lineAmount(l, readPack(l.description), LIB.find(p => p.id === id)!); };
  it("kegs", () => {
    expect(amt("Estrella Damm 50L", "es")).toMatchObject({ purchaseQty: 4, quantityMl: 200000, label: "4 kegs", warning: null });
    expect(amt("Old Mout Flavourwave Multi", "om")).toMatchObject({ purchaseQty: 2, quantityMl: 60000 });
  });
  it("postmix boxes", () => {
    expect(amt("Pepsi Max BIB", "pm-m")).toMatchObject({ purchaseQty: 2, quantityMl: 144000, label: "2 boxes" });
  });
  it("bottles and cans by the unit", () => {
    expect(amt("Robinsons FruitShoot App&BC", "fs-ab")).toMatchObject({ purchaseQty: 48, label: "48 units" });
    expect(amt("Stella Artois 0.0", "st0")).toMatchObject({ purchaseQty: 24 });
    expect(amt("McCoys Cheddar and Onion", "cc-o")).toMatchObject({ purchaseQty: 36 });
  });
  it("cordial by the pack of 12", () => {
    expect(amt("Britvic Lime Cordial", "cd-l")).toMatchObject({ purchaseQty: 1, quantityMl: 12000 });
  });
  it("juice by the litre bottle", () => {
    expect(amt("Sunpride Cranberry", "sp-c")).toMatchObject({ purchaseQty: 12, quantityMl: 12000 });
  });
  it("wine by the case, spirits by the bottle", () => {
    expect(amt("Hardys 202 MR Chard", "hc")).toMatchObject({ purchaseQty: 12, label: "12 bottles" });
    expect(amt("Captain Morgans Spiced Gold", "cm-s")).toMatchObject({ purchaseQty: 1, label: "1 bottle" });
    expect(amt("Lovelli Prosecco 24x200ml", "lp-s")).toMatchObject({ purchaseQty: 48, quantityMl: 9600 });
  });
  it("Old Mout cartridge", () => {
    expect(amt("Old Mout Flavourwave Kiwi & Lime 250ml", "om-kl")).toMatchObject({ purchaseQty: 1, quantityMl: 250 });
  });
  it("warns when the keg size disagrees", () => {
    const l = byDesc("Old Mout Flavourwave Multi");
    const a = lineAmount(l, readPack(l.description), { ...LIB.find(p => p.id === "om")!, container_l: 50 });
    expect(a.warning).toMatch(/30L keg/);
  });
});

describe("safety", () => {
  it("the same line always gets the same reference, different lines differ", () => {
    const a = lineReference("v1", note, note.lines[0]);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(lineReference("v1", parseDeliveryNote(NOTE), parseDeliveryNote(NOTE).lines[0])).toBe(a);
    expect(lineReference("v1", note, note.lines[1])).not.toBe(a);
    expect(lineReference("v2", note, note.lines[0])).not.toBe(a);
  });
  it("uses the note's date and window", () => {
    expect(deliveredAtIso(note)).toBe(new Date("2026-09-28T07:00:00").toISOString());
  });
  it("drafts a sensible new product", () => {
    const l = byDesc("KP DR Peanuts");
    expect(draftProductFromLine(l, readPack(l.description))).toMatchObject({ name: "KP DR Peanuts x 18", category: "packaged", counting_method: "each", sku: "113993" });
    const k = byDesc("Guinness 11g Keg");
    expect(draftProductFromLine(k, readPack(k.description))).toMatchObject({ category: "draught_stout", counting_method: "keg_weight", container_l: 50 });
  });
});

describe("flavours don't cross", () => {
  it("Sunpride Cranberry does not match Sunpride Apple", () => {
    const l = byDesc("Sunpride Cranberry");
    const lib = LIB.filter(p => p.id !== "sp-c").concat([{ id: "sp-a", name: "Juice Sunpride Apple", category: "minerals", counting_method: "litre", size_ml: 1000 }]);
    expect(matchLine(l, readPack(l.description), lib).product).toBeNull();
  });
});

describe("from the first real delivery", () => {
  const lib: MatchableProduct[] = [
    { id: "ba", name: "PPC Bulmers Apple 500ml", category: "packaged", counting_method: "each", size_ml: 500 },
    { id: "br", name: "PPC Bulmers Red Berry 500ml", category: "packaged", counting_method: "each", size_ml: 500 },
  ];
  const line = (d: string) => ({ index: 0, codes: ["1", "2"], description: d, qty: 1 });
  it("Bulmers Original is the apple one; Red Berries is Red Berry", () => {
    expect(matchLine(line("Bulmers Original 12x500ml BOT"), readPack("Bulmers Original 12x500ml BOT"), lib).product?.id).toBe("ba");
    expect(matchLine(line("Bulmers Red Berries & Lime 12x500ml BOT"), readPack("Bulmers Red Berries & Lime 12x500ml BOT"), lib).product?.id).toBe("br");
  });
  it("labels keep a capital L", () => {
    expect(readPack("Sunpride Apple 12x1L").label).toBe("12 × 1L");
  });
});
