import type { ParsedAudit } from "@/lib/venners-audit";

/**
 * Audits read on the free audit check (before sign-up) wait here, in this browser only, so they can
 * be saved to the new account straight after sign-up. Nothing leaves the phone until then.
 */
const KEY = "stocktap:pending-audits";

export interface PendingAudit { audit: ParsedAudit; fileName: string }

export function loadPendingAudits(): PendingAudit[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function savePendingAudits(list: PendingAudit[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export function clearPendingAudits() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
