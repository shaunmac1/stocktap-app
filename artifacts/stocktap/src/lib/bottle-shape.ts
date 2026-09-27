/**
 * Bottle outlines and fill curves for tenths counting.
 *
 * A bottle outline is an SVG path in a 1000 x 1000 box (bottle standing on y ~948).
 * A fill curve maps volume fraction (fill, 0..1) to the liquid height (y, 0..1 of the
 * box, measured from the bottom). Tenths are tenths of the drink in the bottle, so on a
 * bottle with a shoulder the 9/10 and 10/10 marks sit closer together than on a straight
 * cylinder. Curves are estimated from the bottle outline and are a counting guide, not a
 * measurement.
 */
export type FillPoint = { y: number; fill: number };

export const GENERIC_BOTTLE_PATH = "M548 70 L548 84 L548 99 L540 114 L540 129 L540 144 L540 159 L540 174 L540 189 L540 203 L540 218 L540 233 L540 248 L540 263 L547 278 L562 293 L584 308 L608 322 L632 337 L653 352 L666 367 L670 382 L670 397 L670 412 L670 427 L670 442 L670 456 L670 471 L670 486 L670 501 L670 516 L670 531 L670 546 L670 561 L670 575 L670 590 L670 605 L670 620 L670 635 L670 650 L670 665 L670 680 L670 695 L670 709 L670 724 L670 739 L670 754 L670 769 L670 784 L670 799 L670 814 L670 828 L670 843 L670 858 L670 873 L670 888 L670 903 L670 918 L668 933 L658 948 L342 948 L332 933 L330 918 L330 903 L330 888 L330 873 L330 858 L330 843 L330 828 L330 814 L330 799 L330 784 L330 769 L330 754 L330 739 L330 724 L330 709 L330 695 L330 680 L330 665 L330 650 L330 635 L330 620 L330 605 L330 590 L330 575 L330 561 L330 546 L330 531 L330 516 L330 501 L330 486 L330 471 L330 456 L330 442 L330 427 L330 412 L330 397 L330 382 L333 367 L346 352 L367 337 L391 322 L415 308 L437 293 L452 278 L459 263 L460 248 L460 233 L460 218 L460 203 L460 189 L460 174 L460 159 L460 144 L460 129 L460 114 L452 99 L452 84 L452 70 Z";
export const GENERIC_FILL_CURVE: FillPoint[] = [{"y": 0.078, "fill": 0.0}, {"y": 0.136, "fill": 0.1}, {"y": 0.195, "fill": 0.2}, {"y": 0.254, "fill": 0.3}, {"y": 0.313, "fill": 0.4}, {"y": 0.372, "fill": 0.5}, {"y": 0.431, "fill": 0.6}, {"y": 0.49, "fill": 0.7}, {"y": 0.548, "fill": 0.8}, {"y": 0.607, "fill": 0.9}, {"y": 0.682, "fill": 1.0}];

function sortedCurve(curve: FillPoint[] | null | undefined): FillPoint[] {
  const c = (Array.isArray(curve) ? curve : []).filter(
    p => p && Number.isFinite(p.y) && Number.isFinite(p.fill),
  );
  if (c.length < 2) return GENERIC_FILL_CURVE;
  return c.slice().sort((a, b) => a.fill - b.fill);
}

/** Liquid height (0..1 from bottom of box) for a fill fraction (0..1). */
export function fillToY(curve: FillPoint[] | null | undefined, fill: number): number {
  const c = sortedCurve(curve);
  const f = Math.max(0, Math.min(1, fill));
  if (f <= c[0].fill) return c[0].y;
  for (let i = 1; i < c.length; i++) {
    if (f <= c[i].fill) {
      const lo = c[i - 1], hi = c[i];
      const t = hi.fill === lo.fill ? 0 : (f - lo.fill) / (hi.fill - lo.fill);
      return lo.y + t * (hi.y - lo.y);
    }
  }
  return c[c.length - 1].y;
}

/** Fill fraction (0..1) for a liquid height (0..1 from bottom of box). */
export function yToFill(curve: FillPoint[] | null | undefined, y: number): number {
  const c = sortedCurve(curve).slice().sort((a, b) => a.y - b.y);
  if (y <= c[0].y) return 0;
  if (y >= c[c.length - 1].y) return 1;
  for (let i = 1; i < c.length; i++) {
    if (y <= c[i].y) {
      const lo = c[i - 1], hi = c[i];
      const t = hi.y === lo.y ? 0 : (y - lo.y) / (hi.y - lo.y);
      return Math.max(0, Math.min(1, lo.fill + t * (hi.fill - lo.fill)));
    }
  }
  return 1;
}

/** Bounding box of an outline path made of M/L commands with integer or decimal coords. */
export function pathBounds(path: string | null | undefined): { x0: number; y0: number; x1: number; y1: number } {
  const nums = (path ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 4) return pathBounds(GENERIC_BOTTLE_PATH);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

/** A usable outline: the product's own, or the generic bottle. */
export function outlineFor(path: string | null | undefined): string {
  return typeof path === "string" && path.length > 20 && path.length < 20000 && /^M[MLZ0-9 .\-]+$/.test(path) ? path : GENERIC_BOTTLE_PATH;
}

/** Round a tenths value to one decimal place and clamp to 0..10. */
export function clampTenths(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.round(Math.max(0, Math.min(10, t)) * 10) / 10;
}
