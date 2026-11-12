import React from "react";
import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { useRotaToday } from "@/hooks/useCountRota";
import { COUNT_GROUPS, DAY_NAMES, minutesFor } from "@/lib/count-rota";

/**
 * "Today's count": the one group to count today, one tap to start. Used on the owner's Home
 * and as the whole of the staff count screen. `base` is where the count screen lives.
 */
export function TodaysCountCard({ base = "/stocktake", showOthers = false }: { base?: string; showOthers?: boolean }) {
  const { on, status, weeklyTarget } = useRotaToday();
  if (!on || !status) return null;
  const { today, doneToday, overdue, linesThisWeek } = status;
  const day = DAY_NAMES[new Date().getDay()];
  return (
    <div className="space-y-2" data-testid="todays-count">
      {today ? (
        doneToday ? (
          <div className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-4" data-testid="card-todays-count-done">
            <div className="flex items-center gap-2 font-bold text-green-700 dark:text-green-400"><CheckCircle2 className="w-5 h-5" /> {today.label} counted today</div>
            <div className="text-xs text-muted-foreground mt-1">{today.countedThisWeek} of {today.lines} lines done this week. <Link href={`${base}?group=${today.key}`} className="underline font-semibold">Carry on or recount</Link></div>
          </div>
        ) : (
          <Link href={`${base}?group=${today.key}`} className="block">
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-4 flex items-center justify-between gap-3" data-testid="card-todays-count">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{day}'s count</div>
                <div className="text-lg font-bold" data-testid="text-todays-group">{today.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5" data-testid="text-todays-detail">{today.lines} lines, {minutesFor(today.lines)}</div>
              </div>
              <span className="shrink-0 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Start</span>
            </div>
          </Link>
        )
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="card-todays-count-off">No count set for {day}.</div>
      )}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-[#E0A343]/50 bg-[#E0A343]/10 p-3 text-sm" data-testid="card-count-overdue">
          <div className="font-semibold">Not counted yet this week</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {overdue.map(o => (
              <Link key={o.key} href={`${base}?group=${o.key}`} className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold" data-testid={`button-overdue-${o.key}`}>{o.label} ({o.lines})</Link>
            ))}
          </div>
        </div>
      )}
      {weeklyTarget ? (
        <div className="rounded-xl border border-border bg-card p-3" data-testid="card-weekly-target">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold" data-testid="text-lines-this-week">{linesThisWeek} of {weeklyTarget} lines counted this week</span>
            <span className="text-xs text-muted-foreground">{linesThisWeek >= weeklyTarget ? `${linesThisWeek - weeklyTarget} over` : `${weeklyTarget - linesThisWeek} to go`}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${linesThisWeek >= weeklyTarget ? "bg-green-600" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.round((linesThisWeek / weeklyTarget) * 100))}%` }} /></div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground px-1" data-testid="text-lines-this-week">{linesThisWeek} {linesThisWeek === 1 ? "line" : "lines"} counted so far this week.</div>
      )}
      {showOthers && (
        <details className="rounded-xl border border-border bg-card p-3 text-sm" data-testid="count-something-else">
          <summary className="font-semibold cursor-pointer">Count something else</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {COUNT_GROUPS.map(g => (
              <Link key={g.key} href={`${base}?group=${g.key}`} className="rounded-lg border border-border bg-background px-3 py-3 text-sm font-semibold text-center" data-testid={`button-group-${g.key}`}>{g.label}</Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
