import { describe, it, expect } from "vitest";
import { fixMojibake } from "@/pages/library";
describe("scrambled names", () => {
  it("repairs UTF-8 read as Latin-1", () => {
    expect(fixMojibake("JÃ¤germeister Cold Brew")).toBe("Jägermeister Cold Brew");
    expect(fixMojibake("Spark C.Amica Prosecco RosÃ© 200ml")).toBe("Spark C.Amica Prosecco Rosé 200ml");
  });
  it("leaves good names alone", () => {
    expect(fixMojibake("Rosé")).toBe("Rosé");
    expect(fixMojibake("Gin Hendrick's")).toBe("Gin Hendrick's");
    expect(fixMojibake("Crème de Cassis £12")).toBe("Crème de Cassis £12");
  });
});

import { parseSizeMl } from "@/pages/library";
describe("parseSizeMl", () => {
  it("reads sizes with units", () => {
    expect(parseSizeMl("700")).toBe(700);
    expect(parseSizeMl("70cl")).toBe(700);
    expect(parseSizeMl("75 cl")).toBe(750);
    expect(parseSizeMl("0.7L")).toBe(700);
    expect(parseSizeMl("1.5 litre")).toBe(1500);
    expect(parseSizeMl("330ml")).toBe(330);
    expect(parseSizeMl("")).toBe(null);
  });
});
