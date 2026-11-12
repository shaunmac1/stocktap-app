import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffCounts, useStaffCountsInProgress } from "@/hooks/useCountRota";

const KEY = "stocktap:seen-staff-counts";
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };

/** "Counted by Sam at 11:42, 23 lines": counts someone else finished in the last two days. */
export function StaffCountsCard() {
  const { venue, user } = useAuth();
  const { data: counts = [] } = useStaffCounts(venue?.id, user?.id);
  const [seen, setSeen] = useState<string[]>(readSeen);
  const { data: inProgress = [] } = useStaffCountsInProgress(venue?.id, user?.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const fresh = counts.filter(c => !seen.includes(c.stocktakeId));
  if (fresh.length === 0 && inProgress.length === 0) return null;
  const dismiss = (id: string) => { const next = [...seen, id].slice(-50); setSeen(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ } };
  return (
    <div className="space-y-2" data-testid="staff-counts">
      {inProgress.map(c => (
        <div key={c.stocktakeId} className="rounded-xl border-2 border-[#E0A343]/60 bg-[#E0A343]/10 p-4" data-testid={`staff-counting-${c.stocktakeId}`}>
          <div className="font-bold">{c.by === "Your team" ? "Your team are counting" : `${c.by} is counting`}</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {c.lines.length} {c.lines.length === 1 ? "line" : "lines"} so far, last one at {new Date(c.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Not sent in yet.
          </div>
          <button type="button" className="mt-3 w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold" onClick={() => setOpenId(openId === c.stocktakeId ? null : c.stocktakeId)} data-testid={`button-staff-counting-toggle-${c.stocktakeId}`}>
            {openId === c.stocktakeId ? "Hide" : "See what's counted so far"}
          </button>
          {openId === c.stocktakeId && (
            <ul className="mt-3 divide-y divide-border text-sm" data-testid={`staff-counting-lines-${c.stocktakeId}`}>
              {c.lines.map(l => (
                <li key={l.productId} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{l.name}</span>
                  <span className="font-bold whitespace-nowrap">{l.short}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {fresh.map(c => (
        <div key={c.stocktakeId} className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-4" data-testid={`staff-count-${c.stocktakeId}`}>
          <div className="font-bold">Counted by {c.by}</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {c.lines} {c.lines === 1 ? "line" : "lines"}, {new Date(c.at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href={`/stocktake?view=${c.stocktakeId}`} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-bold text-primary-foreground" data-testid={`button-view-staff-count-${c.stocktakeId}`}>See the count</Link>
            <button type="button" className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold" onClick={() => dismiss(c.stocktakeId)} data-testid={`button-dismiss-staff-count-${c.stocktakeId}`}>Got it</button>
          </div>
        </div>
      ))}
    </div>
  );
}
