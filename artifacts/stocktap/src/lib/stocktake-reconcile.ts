/**
 * The list of counts must be the same on every device. The phone's own copy is only the
 * answer when there's no signal. With signal, the server's list wins, plus anything this
 * device has made or changed that hasn't been sent yet.
 *
 * Before this, a device that held ANY count locally never asked the server again: a count
 * finished on the phone never showed on the laptop, and a count removed on the server stayed
 * forever on a device that had once seen it.
 */
export interface StocktakeRow { id: string; venue_id?: string | null; opened_at?: string | null; _temp?: number | null; [k: string]: unknown }

export function reconcileStocktakes<T extends StocktakeRow>(
  local: T[],
  server: T[],
  /** ids with a change still waiting in this device's sync queue */
  pendingIds: Set<string>,
): { list: T[]; put: T[]; remove: string[] } {
  const localById = new Map(local.map(l => [l.id, l]));
  const serverIds = new Set(server.map(s => s.id));
  // On the server: use it, unless this device has an unsent change to that count.
  const fromServer = server.map(s => (pendingIds.has(s.id) && localById.has(s.id) ? localById.get(s.id)! : s));
  // Only on this device: keep it if it was made here and not sent yet. Otherwise it has been
  // removed on the server (or belongs to an old session) and goes.
  const unsent = local.filter(l => !serverIds.has(l.id) && (l._temp === 1 || pendingIds.has(l.id)));
  const remove = local.filter(l => !serverIds.has(l.id) && !(l._temp === 1 || pendingIds.has(l.id))).map(l => l.id);
  const put = server.filter(s => !(pendingIds.has(s.id) && localById.has(s.id)));
  const list = [...fromServer, ...unsent].sort((a, b) => String(b.opened_at ?? "").localeCompare(String(a.opened_at ?? "")));
  return { list, put, remove };
}
