/**
 * Hiding a line the pub no longer stocks. Saved on the phone first so it works
 * offline in the cellar, then sent to the server when there's signal.
 * Hiding never deletes: past counts and readings are kept.
 */
const KEY = "stocktap:pending-hidden";
type Pending = Record<string, string | null>; // product id -> hidden_at (null = shown again)

export const isHidden = (p: { hidden_at?: string | null } | null | undefined): boolean => !!p?.hidden_at;

export function readPendingHidden(): Pending {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Pending; } catch { return {}; }
}
function write(p: Pending) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked: server save still runs */ }
}
export function queueHidden(id: string, hiddenAt: string | null) { const p = readPendingHidden(); p[id] = hiddenAt; write(p); }
export function clearPendingHidden(id: string) { const p = readPendingHidden(); delete p[id]; write(p); }

/** Lay any not-yet-synced hide/show on top of a product list. */
export function applyPendingHidden<T extends { id: string; hidden_at?: string | null }>(list: T[]): T[] {
  const p = readPendingHidden();
  if (Object.keys(p).length === 0) return list;
  return list.map(x => (x.id in p ? { ...x, hidden_at: p[x.id] } : x));
}
