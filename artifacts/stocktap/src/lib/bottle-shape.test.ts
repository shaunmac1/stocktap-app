import { describe, expect, it } from "vitest";
import { GENERIC_BOTTLE_PATH, GENERIC_FILL_CURVE, clampTenths, fillToY, outlineFor, pathBounds, yToFill } from "./bottle-shape";

describe("bottle fill curves", () => {
  it("generic curve runs from empty to full and rises steadily", () => {
    expect(GENERIC_FILL_CURVE).toHaveLength(11);
    for (let i = 1; i < GENERIC_FILL_CURVE.length; i++) {
      expect(GENERIC_FILL_CURVE[i].y).toBeGreaterThan(GENERIC_FILL_CURVE[i - 1].y);
    }
  });
  it("fillToY and yToFill round-trip", () => {
    for (const f of [0, 0.05, 0.3, 0.5, 0.77, 1]) {
      expect(yToFill(null, fillToY(null, f))).toBeCloseTo(f, 6);
    }
  });
  it("clamps out-of-range values", () => {
    expect(fillToY(null, -1)).toBe(GENERIC_FILL_CURVE[0].y);
    expect(fillToY(null, 2)).toBe(GENERIC_FILL_CURVE[10].y);
    expect(yToFill(null, 0)).toBe(0);
    expect(yToFill(null, 0.99)).toBe(1);
  });
  it("uses the product's own curve when given", () => {
    const curve = [{ y: 0.1, fill: 0 }, { y: 0.5, fill: 0.5 }, { y: 0.6, fill: 1 }];
    expect(fillToY(curve, 0.5)).toBeCloseTo(0.5, 6);
    expect(fillToY(curve, 0.75)).toBeCloseTo(0.55, 6); // shoulder: top half of the drink is only 0.1 high
    expect(yToFill(curve, 0.3)).toBeCloseTo(0.25, 6);
  });
  it("falls back to the generic curve for bad data", () => {
    expect(fillToY([{ y: NaN, fill: 0 }] as any, 0.5)).toBe(fillToY(null, 0.5));
    expect(fillToY("nonsense" as any, 0.5)).toBe(fillToY(null, 0.5));
  });
});

describe("bottle outlines", () => {
  it("finds the bounding box of an outline", () => {
    expect(pathBounds("M10 20 L30 40 L5 100 Z")).toEqual({ x0: 5, y0: 20, x1: 30, y1: 100 });
  });
  it("uses the generic bottle when the outline is missing or junk", () => {
    expect(outlineFor(null)).toBe(GENERIC_BOTTLE_PATH);
    expect(outlineFor("<script>")).toBe(GENERIC_BOTTLE_PATH);
    expect(outlineFor("M548 70 L548 84 L540 114 Z")).toBe("M548 70 L548 84 L540 114 Z");
  });
});

describe("clampTenths", () => {
  it("keeps tenths between 0 and 10, one decimal place", () => {
    expect(clampTenths(-2)).toBe(0);
    expect(clampTenths(12)).toBe(10);
    expect(clampTenths(4.26)).toBe(4.3);
    expect(clampTenths(NaN)).toBe(0);
  });
});
