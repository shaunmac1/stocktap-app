import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { ClipboardCheck, AlertTriangle, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useMyShiftStatus,
  useStaffClockIn,
  useStaffClockOut,
  staffClockErrorMessage,
} from "@/hooks/useStaffClock";
import { useOutstandingToday } from "@/hooks/useChecks";
import { useMyRota } from "@/hooks/useRota";
import { shiftRangeLabel, AREA_LABELS } from "@/lib/rota";
import { shiftCapISO, type CloseTimes } from "@/lib/wages";

function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "3h 24m" from a clock-in time up to now. */
function elapsed(sinceISO: string | null | undefined, nowMs: number): string {
  if (!sinceISO) return "";
  const ms = nowMs - new Date(sinceISO).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

export default function Clock() {
  const { profile, venue, signOut } = useAuth();
  const { toast } = useToast();
  const { data: status, isLoading, refetch } = useMyShiftStatus();
  const clockIn = useStaffClockIn();
  const clockOut = useStaffClockOut();
  const outstanding = useOutstandingToday(venue?.id);
  const { data: myShiftsToday = [] } = useMyRota(localTodayISO(), localTodayISO());

  // Ticks once a minute so the on-shift elapsed time stays live without spinning the CPU.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const onShift = !!status?.on_shift;
  const busy = clockIn.isPending || clockOut.isPending;
  const firstName = (status?.name || profile?.full_name || "").split(" ")[0];

  // Past-close clock-out nudge: if they're still on shift after the venue's
  // close time for today, remind them to clock out.
  const closeTimes = (venue as any)?.close_times as CloseTimes | undefined;
  const capISO = closeTimes ? shiftCapISO(localTodayISO(), closeTimes) : null;
  const pastClose = onShift && capISO != null && nowMs > new Date(capISO).getTime();
  const capLabel = capISO ? new Date(capISO).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }) : "";

  async function handleToggle() {
    try {
      if (onShift) {
        await clockOut.mutateAsync();
        toast({ title: "Clocked out", description: "Have a good one." });
      } else {
        await clockIn.mutateAsync();
        toast({ title: "Clocked in", description: "You're on shift." });
      }
      refetch();
    } catch (err) {
      toast({ title: "Couldn't do that", description: staffClockErrorMessage(err), variant: "destructive" });
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <div>
          <div className="text-primary text-xl font-bold leading-none">StockTap</div>
          {status?.venue && <div className="text-xs text-muted-foreground mt-1">{status.venue}</div>}
        </div>
        <button
          onClick={() => signOut()}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          Sign out
        </button>
      </div>

      {/* Past-close clock-out reminder */}
      {pastClose && (
        <div className="mx-4 mt-1 mb-1 rounded-xl bg-amber-50 border border-amber-300 p-3 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <span className="font-semibold">Still on shift.</span> The venue closed around {capLabel} — tap the button to clock out.
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        <div className="text-center">
          {firstName && (
            <p className="text-2xl font-semibold text-foreground">Hi {firstName}</p>
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground mt-2">Loading…</p>
          ) : onShift ? (
            <div className="mt-3">
              <p className="text-base text-muted-foreground">You're on shift</p>
              <p className="text-4xl font-bold text-primary mt-1 tabular-nums">
                {elapsed(status?.since, nowMs)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">since {timeLabel(status?.since)}</p>
            </div>
          ) : (
            <p className="text-base text-muted-foreground mt-3">You're clocked out</p>
          )}
        </div>

        {/* Your shift today from the rota */}
        {myShiftsToday.length > 0 && (
          <div className="w-full max-w-xs rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">You're on today</div>
            {myShiftsToday.map((s) => (
              <div key={s.id} className="text-sm font-semibold mt-0.5">
                {AREA_LABELS[s.area] ?? s.area}: {shiftRangeLabel(s)}
              </div>
            ))}
          </div>
        )}

        {/* Big clock button */}
        <button
          onClick={handleToggle}
          disabled={busy || isLoading}
          className={[
            "w-56 h-56 rounded-full flex flex-col items-center justify-center gap-1",
            "text-white text-2xl font-bold shadow-xl transition-transform active:scale-95",
            "disabled:opacity-60 disabled:active:scale-100",
            onShift ? "bg-red-600 shadow-red-600/30" : "bg-primary shadow-primary/30",
          ].join(" ")}
        >
          {busy ? (
            <span className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span className="text-lg font-medium opacity-90">Tap to</span>
              <span>{onShift ? "Clock out" : "Clock in"}</span>
            </>
          )}
        </button>

        <p className="text-xs text-muted-foreground text-center max-w-[15rem]">
          {onShift
            ? "Don't forget to clock out at the end of your shift."
            : "Tap in when you start. It only takes a second."}
        </p>

        {/* Checks-due nudge */}
        {outstanding.total > 0 && (
          <Link href="/checks" className="w-full max-w-xs">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3 active:scale-[0.98] transition-transform">
              <ClipboardCheck className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-primary">{outstanding.total} check{outstanding.total === 1 ? "" : "s"} still to do</div>
                <div className="text-[11px] text-muted-foreground">
                  {[outstanding.temps ? `${outstanding.temps} temperature${outstanding.temps === 1 ? "" : "s"}` : null, outstanding.checklist ? `${outstanding.checklist} on the lists` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-primary shrink-0" />
            </div>
          </Link>
        )}
      </div>

      <div className="pb-8" />
    </div>
  );
}
