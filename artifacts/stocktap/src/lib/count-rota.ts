/**
 * A stocktake a day: one group of lines per weekday, so the whole pub is counted every
 * week in ten-minute bites. The landlord sets the rota once; staff just see "Today's count".
 */
import { isHidden } from "./hidden-products";

export type CountGroupKey = "kegs" | "bottles" | "minerals" | "wine" | "gin" | "vodka" | "whisky" | "rum" | "liqueurs";
export interface CountGroup { key: CountGroupKey; label: string; blurb: string }

export const COUNT_GROUPS: CountGroup[] = [
  { key: "kegs", label: "Kegs and casks", blurb: "Full ones, then gallons on the gauge" },
  { key: "bottles", label: "Bottles and cans", blurb: "Full cases, then loose" },
  { key: "minerals", label: "Minerals", blurb: "Soft drinks, tonics, juices and postmix" },
  { key: "wine", label: "Wine", blurb: "Full bottles, then tenths" },
  { key: "gin", label: "Gin", blurb: "Full bottles, then tenths" },
  { key: "vodka", label: "Vodka", blurb: "Full bottles, then tenths" },
  { key: "whisky", label: "Whisky", blurb: "Full bottles, then tenths" },
  { key: "rum", label: "Rum", blurb: "Full bottles, then tenths" },
  { key: "liqueurs", label: "Liqueurs and the rest", blurb: "Liqueurs, brandy, port, vermouth and anything else on the back bar" },
];
export const groupLabel = (k: CountGroupKey | null | undefined) => COUNT_GROUPS.find(g => g.key === k)?.label ?? "";
/** "Gin and Vodka", "Whisky, Rum and Liqueurs and the rest" */
export function groupsLabel(keys: CountGroupKey[]): string {
  const l = keys.map(groupLabel).filter(Boolean);
  return l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}

/** 0 = Sunday … 6 = Saturday, as Date.getDay(). Each day holds the groups to count; [] = no count. */
export type CountRota = CountGroupKey[][];
/** Thursday is kegs because that's order day for most Marston's pubs; Saturday is left alone. */
export const DEFAULT_ROTA: CountRota = [["rum", "liqueurs"], ["bottles"], ["minerals"], ["wine"], ["kegs"], ["gin", "vodka", "whisky"], []];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const KEYS = new Set<string>(COUNT_GROUPS.map(g => g.key));
const cleanKeys = (v: unknown): CountGroupKey[] => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return Array.from(new Set(arr.filter((x): x is CountGroupKey => typeof x === "string" && KEYS.has(x))));
};
export function readRota(features: unknown): CountRota {
  const raw = (features as any)?.count_rota;
  if (!Array.isArray(raw) || raw.length !== 7) return DEFAULT_ROTA.map(d => [...d]);
  return raw.map(cleanKeys);
}
/**
 * What staff are asked to count. null = nothing chosen, so staff follow the day's rota.
 * A landlord can keep staff off the cellar by choosing, say, gin and vodka.
 */
export function readStaffGroups(features: unknown): CountGroupKey[] | null {
  const raw = (features as any)?.staff_groups;
  return Array.isArray(raw) ? cleanKeys(raw) : null;
}

type P = { id: string; name: string; category?: string | null; type?: string | null; hidden_at?: string | null; is_template?: boolean | null };

const SPIRIT_WORDS: Record<string, CountGroupKey> = { gin: "gin", vodka: "vodka", whisky: "whisky", whiskey: "whisky", bourbon: "whisky", rum: "rum" };
/** Which spirit shelf a line is on: from the first word of its name ("Gin Gordons"), else its type. */
export function spiritGroup(p: P): CountGroupKey {
  const first = p.name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (SPIRIT_WORDS[first]) return SPIRIT_WORDS[first];
  const t = (p.type ?? "").toLowerCase();
  if (SPIRIT_WORDS[t]) return SPIRIT_WORDS[t];
  return "liqueurs";
}

function inGroup(p: P, key: CountGroupKey): boolean {
  const c = p.category ?? "";
  if (key === "kegs") return c.startsWith("draught_");
  if (key === "bottles") return c === "packaged";
  if (key === "minerals") return c === "minerals" || c === "postmix";
  if (key === "wine") return c === "wines";
  return c === "spirits" && spiritGroup(p) === key;
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
  /** a line in the group has been counted today */
  doneToday: boolean;
}
export interface RotaToday {
  /** today's groups that have lines, in rota order */
  today: GroupStatus[];
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

export function groupStatus<T extends P>(key: CountGroupKey, products: T[], lastCounted: Record<string, string>, now = new Date()): GroupStatus {
  const ws = weekStart(now).toISOString(), sod = startOfDay(now).toISOString();
  const lines = linesFor(key, products);
  let lastAt: string | null = null, week = 0;
  for (const p of lines) { const t = lastCounted[p.id]; if (!t) continue; if (!lastAt || t > lastAt) lastAt = t; if (t >= ws) week++; }
  return { key, label: groupLabel(key), lines: lines.length, lastAt, countedThisWeek: week, doneToday: !!lastAt && lastAt >= sod };
}

/**
 * @param lastCounted product id -> ISO time it was last counted (a real count, not a delivery)
 */
export function rotaToday<T extends P>(rota: CountRota, products: T[], lastCounted: Record<string, string>, now = new Date()): RotaToday {
  const ws = weekStart(now).toISOString();
  const todayKeys = rota[now.getDay()] ?? [];
  const today = todayKeys.map(k => groupStatus(k, products, lastCounted, now)).filter(g => g.lines > 0);
  // Days already gone this week, Monday first, not counting today.
  const overdue: GroupStatus[] = []; const seen = new Set<CountGroupKey>(todayKeys);
  const daysSinceMonday = (now.getDay() + 6) % 7;
  for (let i = 0; i < daysSinceMonday; i++) {
    for (const key of rota[(1 + i) % 7] ?? []) {
      if (seen.has(key)) continue; seen.add(key);
      const s = groupStatus(key, products, lastCounted, now);
      if (s.lines > 0 && s.countedThisWeek === 0) overdue.push(s);
    }
  }
  const linesThisWeek = products.filter(p => (lastCounted[p.id] ?? "") >= ws).length;
  return { today, overdue, linesThisWeek };
}

/** "about 10 minutes" from how many lines there are (roughly 25 seconds a line). */
export function minutesFor(lines: number): string {
  const m = Math.max(2, Math.round((lines * 25) / 60 / 5) * 5 || 2);
  return `about ${m} minutes`;
}
