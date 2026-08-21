export type CatalogueType = "spirit" | "gin" | "vodka" | "whisky" | "rum" | "liqueur" | "wine" | "sparkling" | "vermouth" | "syrup" | "cordial" | "packaged";

/**
 * Legacy shape retained for the custom-product form while the global catalogue
 * now lives behind protected database RPCs. No calibration rows are bundled in
 * the client application.
 */
export interface CatalogueEntry {
  name: string;
  type: CatalogueType;
  sizeMl: number | null;
  fullWeightG: number | null;
  emptyWeightG: number | null;
  density: number;
  abv: number | null;
  hasWeights: boolean;
}

/**
 * Deliberately empty. Search and multi-add use `search_catalogue_items` and
 * `add_catalogue_items_to_venue`, so raw calibration data is not shipped in the
 * JavaScript bundle.
 */
export const CATALOGUE: CatalogueEntry[] = [];

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
}

/**
 * Loose, case-insensitive relevance score used for duplicate checks against a
 * venue's own products. Server catalogue ranking is handled inside the search RPC.
 */
export function scoreNameMatch(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;

  if (n === q) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 85;
  if (n.includes(q)) return 70;

  const qWords = q.split(" ").filter(Boolean);
  const nWords = n.split(" ").filter(Boolean);
  if (qWords.length === 0 || nWords.length === 0) return 0;

  const matchedWords = qWords.filter((queryWord) =>
    nWords.some((nameWord) => nameWord === queryWord || nameWord.startsWith(queryWord) || queryWord.startsWith(nameWord)),
  );
  if (matchedWords.length === 0) return 0;

  const coverage = matchedWords.length / qWords.length;
  if (coverage < 0.5) return 0;
  return Math.round(30 + coverage * 30);
}

export interface CatalogueMatch {
  entry: CatalogueEntry;
  score: number;
}

export const MATCH_THRESHOLD = 40;

/** @deprecated Global catalogue matching is server-side. */
export function matchCatalogue(_query: string, _limit = 5): CatalogueMatch[] {
  return [];
}

/** @deprecated Global catalogue matching is server-side. */
export function bestCatalogueMatch(_query: string): CatalogueMatch | null {
  return null;
}

/** Find the best match in a venue-owned list without exposing global calibration rows. */
export function findBestNameMatch<T extends { name: string }>(query: string, items: T[]): { item: T; score: number } | null {
  if (query.trim().length < 2) return null;
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = scoreNameMatch(query, item.name);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}
