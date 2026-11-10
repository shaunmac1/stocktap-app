import { describe, expect, it } from "vitest";
import { containerSizeFromName, containerSizeLabel, presetsFor } from "./container-sizes";
import { recomputeEntryMl } from "./stock-display";
import { ML_PER_PINT } from "./calculations";

describe("container size from the name", () => {
  it("reads litres, gallons and cask names", () => {
    expect(containerSizeFromName("Cider Inch's Riversider 30L Keg")).toEqual({ litres: 30, type: undefined });
    expect(containerSizeFromName("Cider Old Mout FlavourWave 30L Keg")?.litres).toBe(30);
    expect(containerSizeFromName("Lager 11 gal")).toEqual({ litres: 50, type: "keg" });
    expect(containerSizeFromName("Ale Pedigree Firkin")).toEqual({ litres: 40.91, type: "cask" });
    expect(containerSizeFromName("Cider Thatchers 20L BIB")).toEqual({ litres: 20, type: "bag_in_box" });
    expect(containerSizeFromName("Postmix Pepsi 12 litre")?.litres).toBe(12);
  });
  it("ignores can and bottle sizes", () => {
    expect(containerSizeFromName("Soft Tango Orange 330ml")).toBeNull();
    expect(containerSizeFromName("Gin 70cl")).toBeNull();
    expect(containerSizeFromName("Juice 1L")).toBeNull();
    expect(containerSizeFromName("Stout Guinness")).toBeNull();
  });
  it("labels and presets", () => {
    expect(containerSizeLabel(30, "keg")).toBe("30L · 6.6 gal keg");
    expect(containerSizeLabel(12, "postmix")).toBe("12L box");
    expect(containerSizeLabel(40.9, "cask")).toBe("Firkin 9 gal (40.9L)");
    expect(presetsFor("postmix").map(p => p.value)).toContain(12);
    expect(presetsFor("keg").map(p => p.value)).toEqual(expect.arrayContaining([30, 50]));
  });
});

describe("changing a keg size re-works the count", () => {
  it("kegs + pints follow the new size", () => {
    const e = { method: "keg_weight", full_containers: 1, part_value: 20, ml_remaining: 50000 + 20 * ML_PER_PINT };
    expect(recomputeEntryMl(e, { container_l: 30 })).toBeCloseTo(30000 + 20 * ML_PER_PINT, 6);
  });
  it("a total typed in gallons stays the same", () => {
    const e = { method: "keg_weight", full_containers: null, part_value: 89.747, ml_remaining: 89.747 * ML_PER_PINT };
    expect(recomputeEntryMl(e, { container_l: 30 })).toBeNull();
  });
  it("tenths of a keg and dip readings scale with the keg", () => {
    expect(recomputeEntryMl({ method: "tenths_pints", full_containers: 1, part_value: 5, ml_remaining: 75000 }, { container_l: 30 })).toBeCloseTo(45000, 6);
    expect(recomputeEntryMl({ method: "dipstick", full_containers: 0, part_value: 240, ml_remaining: 20450 }, { container_l: 20.5, old_container_l: 40.9 })).toBeCloseTo(10250, 3);
  });
  it("postmix litres don't change when the box size does", () => {
    expect(recomputeEntryMl({ method: "litre", full_containers: 0, part_value: 100.8, ml_remaining: 100800 }, { container_l: 10 })).toBeNull();
  });
});
