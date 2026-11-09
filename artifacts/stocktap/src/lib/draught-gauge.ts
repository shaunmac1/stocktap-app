/**
 * Helpers for reading draught off a keg gauge (gallons + pints, 8 pints to the gallon),
 * the same units Venners prints as "Gallon 8 Pint".
 */
export const LITRES_PER_GALLON_EXACT = 4.54609;

/** Part keg read as gallons + pints → pints. Pints are clamped to 0–7. */
export function gaugeToPints(gallons: number, pints: number): number {
  const g = Math.max(0, Math.floor(Number.isFinite(gallons) ? gallons : 0));
  const p = Math.max(0, Math.min(7, Math.floor(Number.isFinite(pints) ? pints : 0)));
  return g * 8 + p;
}

/** Pints → whole gallons + leftover pints (0–7), rounded to the nearest pint. */
export function pintsToGauge(totalPints: number): { gallons: number; pints: number } {
  const p = Math.max(0, Math.round(totalPints));
  return { gallons: Math.floor(p / 8), pints: p % 8 };
}

/** "10 gal 3 pt" */
export function formatGauge(totalPints: number): string {
  const { gallons, pints } = pintsToGauge(totalPints);
  return `${gallons} gal ${pints} pt`;
}

/** Which side of a two-scale keg gauge to read: "up to 22G" or "36G". Null when size unknown. */
export function gaugeScaleFor(containerL: number | null | undefined): string | null {
  if (!containerL || containerL <= 0) return null;
  const gal = containerL / LITRES_PER_GALLON_EXACT;
  return gal > 22.5 ? "36G" : "up to 22G";
}
