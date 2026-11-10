/**
 * Till figures from a photo of the till's product sales report (X or Z read), until the till
 * APIs are in. The scanner returns plain rows (name + quantity); this works out pints per
 * draught line: "CARLING PT 120" + "CARLING HALF 14" = 127 pints.
 */
import { detectServe, nameSimilarity } from "./till-matching";

export interface TillPhotoRow { name: string; qty: number; value?: number | null }
export interface TillPhotoLine { id: string; name: string }
export interface TillPhotoResult {
  /** product id -> pints sold */
  pints: Record<string, number>;
  /** which till rows went into each line, for showing the working */
  used: Record<string, TillPhotoRow[]>;
  /** rows that looked like draught (said pint/half) but matched no line */
  unmatched: TillPhotoRow[];
  /** everything else on the report (spirits, food, soft drinks) */
  ignored: number;
}

const SERVE_PINTS: Record<string, number> = { pint: 1, half: 0.5, third: 1 / 3, two_thirds: 2 / 3 };
export const TILL_PHOTO_MATCH = 0.6;

/** The same row photographed twice (overlapping photos of a long roll) only counts once. */
export function mergeTillPhotoRows(sets: TillPhotoRow[][]): TillPhotoRow[] {
  const seen = new Set<string>(); const out: TillPhotoRow[] = [];
  for (const set of sets) {
    const inThis = new Set<string>();
    for (const r of set) {
      const key = `${r.name.toLowerCase().replace(/\s+/g, " ").trim()}|${r.qty}`;
      if (seen.has(key) && !inThis.has(key)) continue;
      inThis.add(key); out.push(r);
    }
    inThis.forEach(k => seen.add(k));
  }
  return out;
}

export function tillPhotoToPints(rows: TillPhotoRow[], lines: TillPhotoLine[]): TillPhotoResult {
  const pints: Record<string, number> = {}; const used: Record<string, TillPhotoRow[]> = {};
  const unmatched: TillPhotoRow[] = []; let ignored = 0;
  for (const r of rows) {
    const qty = Number(r.qty);
    if (!r.name || !Number.isFinite(qty) || qty <= 0) continue;
    const serve = detectServe(r.name);
    const draughtServe = serve != null && serve in SERVE_PINTS;
    if (serve != null && !draughtServe) { ignored++; continue; } // doubles, glasses, bottles
    let best: TillPhotoLine | null = null, bestScore = 0, second = 0;
    for (const l of lines) {
      const s = nameSimilarity(r.name, l.name);
      if (s > bestScore) { second = bestScore; bestScore = s; best = l; } else if (s > second) second = s;
    }
    // A clear winner only: two lines that sound alike (Fosters / Fosters 3.4%) are left for the landlord.
    if (best && bestScore >= TILL_PHOTO_MATCH && bestScore - second >= 0.05) {
      const each = draughtServe ? SERVE_PINTS[serve as string] : 1;
      pints[best.id] = (pints[best.id] ?? 0) + qty * each;
      (used[best.id] ||= []).push(r);
    } else if (draughtServe) unmatched.push(r);
    else ignored++;
  }
  for (const id of Object.keys(pints)) pints[id] = Math.round(pints[id] * 10) / 10;
  return { pints, used, unmatched, ignored };
}
