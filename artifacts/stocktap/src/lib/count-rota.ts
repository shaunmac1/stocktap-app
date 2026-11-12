/**
 * A stocktake a day: one group of lines per weekday, so the whole pub is counted every
 * week in ten-minute bites. The landlord sets the rota once; staff just see "Today's count".
 */
import { isHidden } from "./hidden-products";

export type CountGroupKey = "kegs" | "bottles" | "minerals" | "wine" | "spirits_a" | "spirits_b";
export interface CountGroup { key: CountGroupKey; label: string; blurb: string }

export const COUNT_GROUPS: CountGroup[] = [
  { key: "kegs", label: "Kegs and casks", blurb: "Full ones, then gallons on the gauge" },
  { key: "bottles", label: "Bottles and cans", blurb: "Full cases, then loose" },
  { key: "minerals", label: "Minerals", blurb: "Soft drinks, tonics, juices and postmix" },
  { key: "wine", label: "Wine", blurb: "Full bottles, then tenths" },
  { key: "spirits_a", label: "Spirits A to L", blurb: "Full bottles, then tenths" },
  { key: "spirits_b", label: "Spirits M to Z", blurb: "Full bottles, then tenths" },
];
export const groupLabel = (k: CountGroupKey | null | undefined) => COUNT_GROUPS.find(g => g.key === k)?.label ?? "";

/** 0 = Sunday … 6 = Saturday, as Date.getDay(). null = no count that day. */
export type CountRota = Array<CountGroupKey | null>;
/** Thursday is kegs because that's order day for most Marston's pubs; Saturday is left alone. */
export const DEFAULT_ROTA: CountRota = ["spirits_b", "bottles", "minerals", "wine", "kegs", "spirits_a", null];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const KEYS = new Set(COUNT_GROUPS.map(g => g.key));
export function readRota(features: unknown): CountRota {
  const raw = (features as any)?.count_rota;
  if (!Array.isArray(raw) || raw.length !== 7) return [...DEFAULT_ROTA];
  return raw.map(v => (typeof v === "string" && KEYS.has(v as CountGroupKey) ? (v as CountGroupKey) : null));
}

type P = { id: string; name: string; category?: string | null; hidden_at?: string | null; is_template?: boolean | null };

function inGroup(p: P, key: CountGroupKey): boolean {
  const c = p.category ?? "";
  if (key === "kegs") return c.startsWith("draught_");
  if (key === "bottles") return c === "packaged";
  if (key === "minerals") return c === "minerals" || c === "postmix";
  if (key === "wine") return c === "wines";
  if (c !== "spirits") return false;
  const first = (p.name.trim()[0] ?? "").toUpperCase();
  const early = first >= "A" && first <= "L";
  return key === "spirits_a" ? early : !early; // digits and anything odd go in the second half
}

/** The lines a group covers: hidden lines and templates never count. */
export function linesFor<T extends P>(key: CountGroupKey, products: T[]): T[] {
  return products.filter(p => !isHidden(p as any) && p.is_template !== true && inGroup(p, key));
}

export function groupOf(p: P): CountGroupKey | null {
  for (const g of COUNT_GROUPS) if (inGroup(p, g.key)) return g.key;
  return null;
}

export interface GroupStatus {
  key: CountGroupKey; label: string; lines: number;
  /** when any line in the group was last counted */
  lastAt: string | null;
  /** lines counted since the start of this week (Monday) */
  countedThisWeek: number;
}
export interface RotaToday {
  today: GroupStatus | null;
  /** already counted today */
  doneToday: boolean;
  /** rota groups whose day has passed this week without a count, oldest first */
  overdue: GroupStatus[];
  /** distinct lines counted since Monday, across everything */
  linesThisWeek: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Monday 00:00 of the week `now` is in. */
export function weekStart(now: Date): Date {
  const d = startOfDay(now); const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); return d;
}

/**
 * @param lastCounted product id -> ISO time it was last counted (a real count, not a delivery)
 */
export function rotaToday<T extends P>(rota: CountRota, products: T[], lastCounted: Record<string, string>, now = new Date()): RotaToday {
  const ws = weekStart(now).toISOString(), sod = startOfDay(now).toISOString();
  const status = (key: CountGroupKey): GroupStatus => {
    const lines = linesFor(key, products);
    let lastAt: string | null = null, week = 0;
    for (const p of lines) { const t = lastCounted[p.id]; if (!t) continue; if (!lastAt || t > lastAt) lastAt = t; if (t >= ws) week++; }
    return { key, label: groupLabel(key), lines: lines.length, lastAt, countedThisWeek: week };
  };
  const todayKey = rota[now.getDay()];
  const today = todayKey ? status(todayKey) : null;
  const doneToday = !!today && !!today.lastAt && today.lastAt >= sod;
  // Days already gone this week, Monday first, not counting today.
  const overdue: GroupStatus[] = []; const seen = new Set<CountGroupKey>();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  for (let i = 0; i < daysSinceMonday; i++) {
    const key = rota[(1 + i) % 7];
    if (!key || key === todayKey || seen.has(key)) continue; seen.add(key);
    const s = status(key);
    if (s.lines > 0 && s.countedThisWeek === 0) overdue.push(s);
  }
  const linesThisWeek = products.filter(p => (lastCounted[p.id] ?? "") >= ws).length;
  return { today: today && today.lines > 0 ? today : null, doneToday, overdue, linesThisWeek };
}

/** "about 10 minutes" from how many lines there are (roughly 25 seconds a line). */
export function minutesFor(lines: number): string {
  const m = Math.max(2, Math.round((lines * 25) / 60 / 5) * 5 || 2);
  return `about ${m} minutes`;
}
