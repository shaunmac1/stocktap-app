/**
 * Packaged lines sold whole (bottled and canned beer, cider, J2O, Red Bull, mixers, crisps):
 * counted the way they are stored — full cases in the cellar, loose ones on the bar — and
 * always saved as the total number of single units, so cost price stays "per bottle" and
 * every report, GP and till check is unchanged.
 *
 * pack_size on an "each" line is the case size. 1 means "singles only, no cases".
 */

export interface PackagedProductLike {
  name?: string | null;
  category?: string | null;
  counting_method?: string | null;
  size_ml?: number | null;
  pack_size?: number | null;
}

/** Case sizes offered on the count screen. */
export const CASE_SIZE_CHOICES = [6, 8, 10, 12, 15, 18, 20, 24, 30, 36] as const;

const SNACK = /\b(crisps?|nuts?|peanuts|scratchings|snacks?|popcorn|pretzels?|crackling|biltong|jerky)\b/i;
const CAN = /\bcans?\b/i;

/** True for a line counted in single units (the "each" method). */
export function isCountedEach(p: PackagedProductLike): boolean {
  return p.counting_method === "each" || p.counting_method === "count";
}

/**
 * The usual UK trade case size for a line, as a starting suggestion the landlord confirms
 * with one tap. Null when there is no sensible guess (snacks, unknown sizes).
 */
export function suggestedCaseSize(p: PackagedProductLike): number | null {
  const name = p.name ?? "";
  if (SNACK.test(name)) return null;
  const ml = p.size_ml ?? 0;
  if (ml <= 0) return null;
  // Mixers, juices, J2O, Red Bull, 275/330ml beers and alcopops, 440ml cans.
  if (ml <= 460) return 24;
  // 500–568ml bottles and cans (cider, wheat beer, ale, Guinness).
  if (ml <= 600) return 12;
  return null;
}

/** What one unit is called on screen. */
export function unitNoun(p: PackagedProductLike, n: number): string {
  const name = p.name ?? "";
  if (SNACK.test(name)) return n === 1 ? "bag" : "bags";
  if (CAN.test(name)) return n === 1 ? "can" : "cans";
  return n === 1 ? "bottle" : "bottles";
}

/** The case size to count in, or null when the line is singles only / not yet set. */
export function caseSizeOf(p: PackagedProductLike): number | null {
  const s = p.pack_size ?? null;
  return s != null && s > 1 ? Math.round(s) : null;
}

/** Ask "how does this come?" when a counted-each line has never had its case size set. */
export function needsCaseSizeAnswer(p: PackagedProductLike): boolean {
  return isCountedEach(p) && (p.pack_size == null || p.pack_size <= 0);
}

/** Total single units from full cases + loose. */
export function totalUnits(cases: number, loose: number, caseSize: number | null): number {
  const c = Math.max(0, Math.floor(cases || 0));
  const l = Math.max(0, Math.floor(loose || 0));
  return (caseSize && caseSize > 1 ? c * caseSize : 0) + l;
}

/** Split a unit total back into full cases + loose. */
export function splitCases(units: number, caseSize: number | null): { cases: number; loose: number } {
  const u = Math.max(0, Math.round(units || 0));
  if (!caseSize || caseSize <= 1) return { cases: 0, loose: u };
  return { cases: Math.floor(u / caseSize), loose: u % caseSize };
}

/** Venners-style dozens: 79 → "6 doz 7". */
export function dozens(units: number): string {
  const u = Math.max(0, Math.round(units || 0));
  return `${Math.floor(u / 12)} doz ${u % 12}`;
}

/**
 * Every way the line is counted, side by side, like the draught lines:
 * "79 bottles · 6 doz 7 · 3 cases + 7".
 */
export function packagedBreakdown(units: number, p: PackagedProductLike): string {
  const u = Math.max(0, Math.round(units || 0));
  const parts = [`${u} ${unitNoun(p, u)}`];
  if (!SNACK.test(p.name ?? "")) parts.push(dozens(u));
  const cs = caseSizeOf(p);
  if (cs) {
    const { cases, loose } = splitCases(u, cs);
    parts.push(`${cases} ${cases === 1 ? "case" : "cases"} + ${loose}`);
  }
  return parts.join(" · ");
}

/*
 * Case sizes set on the count screen, saved on the phone first so it works with no
 * signal in the cellar, then sent to the server (same pattern as hiding a line).
 */
const PENDING_KEY = "stocktap:pending-case-size";
type PendingCases = Record<string, number>; // product id -> pack_size

export function readPendingCaseSizes(): PendingCases {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}") as PendingCases; } catch { return {}; }
}
function writePending(p: PendingCases) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* storage blocked: server save still runs */ }
}
export function queueCaseSize(id: string, size: number) { const p = readPendingCaseSizes(); p[id] = size; writePending(p); }
export function clearPendingCaseSize(id: string) { const p = readPendingCaseSizes(); delete p[id]; writePending(p); }

/** Lay any not-yet-synced case size on top of a product list. */
export function applyPendingCaseSizes<T extends { id: string; pack_size?: number | null }>(list: T[]): T[] {
  const p = readPendingCaseSizes();
  if (Object.keys(p).length === 0) return list;
  return list.map(x => (x.id in p ? { ...x, pack_size: p[x.id] } : x));
}

/**
 * Every bottle, can and bag line that has never been told how it comes, with the usual size
 * as a starting point, for setting them all on one screen instead of one count at a time.
 */
export function caseSizePlan<T extends PackagedProductLike & { id: string; hidden_at?: string | null }>(
  products: T[],
): Array<{ product: T; suggested: number | null }> {
  return products
    .filter(p => !p.hidden_at && needsCaseSizeAnswer(p))
    .map(p => ({ product: p, suggested: suggestedCaseSize(p) }))
    .sort((a, b) => (b.suggested ?? 0) - (a.suggested ?? 0) || (a.product.name ?? "").localeCompare(b.product.name ?? ""));
}
