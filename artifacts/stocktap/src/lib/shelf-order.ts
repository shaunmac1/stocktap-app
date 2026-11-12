/**
 * Count in the order you walk it. A pub can save its shelf order (fridge by fridge, left to
 * right, top to bottom); lines on that list come first, in that order, and anything not on
 * it follows by name. Category sections stay as they are, so a "wine day" is still wine.
 */
export function readShelfOrder(features: unknown): string[] {
  const raw = (features as any)?.count_order;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

export function shelfComparator<T extends { id: string; name: string }>(order: string[]): (a: T, b: T) => number {
  const pos = new Map(order.map((id, i) => [id, i]));
  return (a, b) => {
    const pa = pos.get(a.id), pb = pos.get(b.id);
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return a.name.localeCompare(b.name);
  };
}
