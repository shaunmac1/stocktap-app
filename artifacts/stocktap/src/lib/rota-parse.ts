// Pure helpers for turning a parsed paper-rota into structured shifts:
// matching handwritten names to real staff, and day labels to dates.
import { addDaysISO, type RotaArea } from "./rota";

export interface ParsedShift {
  name: string;            // as read from the sheet
  area: RotaArea | "unknown";
  day: string;             // "mon".."sun" (normalised) or "" if unknown
  start: string;           // "HH:MM" 24h
  end: string | null;      // "HH:MM" or null
  until_close: boolean;
}

const DAY_INDEX: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/** Normalise any day label ("Monday", "MON", "tues") to "mon".."sun" or "". */
export function normaliseDay(label: string | null | undefined): string {
  if (!label) return "";
  const s = label.trim().toLowerCase().slice(0, 3);
  return s in DAY_INDEX ? s : "";
}

/** Date (yyyy-mm-dd) for a day label within the week starting weekStartISO (a Monday). */
export function dayToDate(dayLabel: string, weekStartISO: string): string | null {
  const key = normaliseDay(dayLabel);
  if (!(key in DAY_INDEX)) return null;
  return addDaysISO(weekStartISO, DAY_INDEX[key]);
}

export type MatchConfidence = "exact" | "first" | "partial" | "none";
export interface StaffLite { id: string; name: string }

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Best staff match for a handwritten name. Returns a single confident match, or
 * null staffId when there's no match or it's ambiguous (so the admin picks).
 */
export function matchStaffName(parsed: string, staff: StaffLite[]): { staffId: string | null; confidence: MatchConfidence } {
  const p = norm(parsed);
  if (!p) return { staffId: null, confidence: "none" };

  const exact = staff.filter((s) => norm(s.name) === p);
  if (exact.length === 1) return { staffId: exact[0].id, confidence: "exact" };
  if (exact.length > 1) return { staffId: null, confidence: "none" };

  const pFirst = p.split(" ")[0];
  const firstMatches = staff.filter((s) => norm(s.name).split(" ")[0] === pFirst);
  if (firstMatches.length === 1) return { staffId: firstMatches[0].id, confidence: "first" };
  if (firstMatches.length > 1) return { staffId: null, confidence: "none" }; // two Daves -> ask

  const partial = staff.filter((s) => {
    const n = norm(s.name);
    return n.startsWith(p) || p.startsWith(n) || n.split(" ")[0].startsWith(pFirst) || pFirst.startsWith(n.split(" ")[0]);
  });
  if (partial.length === 1) return { staffId: partial[0].id, confidence: "partial" };

  return { staffId: null, confidence: "none" };
}
