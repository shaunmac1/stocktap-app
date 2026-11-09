import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Users } from "lucide-react";
import { formatGBP } from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { useCashUps, useSaveCashUp, buildComparisons, entertainmentRoi, recentTrend, shiftISO, weekRows, monthRows, weekStartOf, type WeekRow } from "@/hooks/useDailyBoard";
import { useFinanceEntries } from "@/hooks/useFinance";
import { TakingsImport } from "@/components/TakingsImport";

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const today = todayISO();
  if (dateISO === today) return "Today";
  if (dateISO === shiftISO(today, -1)) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function DailyBoard() {
  const { venue } = useAuth();
  const { toast } = useToast();
  const { data: cashUps = [] } = useCashUps(venue?.id);
  const saveCashUp = useSaveCashUp();
  const { data: finance = [] } = useFinanceEntries(venue?.id);
  const [view, setView] = useState<"day" | "weeks" | "months">("day");
  const [importOpen, setImportOpen] = useState(false);
  const wagesByWeek = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of finance) if (e.direction === "out" && e.category === "wages") {
      const k = weekStartOf(e.entry_date); m.set(k, (m.get(k) ?? 0) + Number(e.amount));
    }
    return m;
  }, [finance]);
  const weeks = useMemo(() => weekRows(cashUps, wagesByWeek), [cashUps, wagesByWeek]);
  const months = useMemo(() => monthRows(cashUps), [cashUps]);

  const [dateISO, setDateISOraw] = useState(todayISO());
  const existing = useMemo(
    () => cashUps.find((c) => c.business_date === dateISO) ?? null,
    [cashUps, dateISO]
  );

  type Form = { total: string; wet: string; dry: string; whatWasOn: string; act: string; fee: string };
  const fromSaved = (c: typeof existing): Form => ({
    total: c?.total_taken != null ? Number(c.total_taken).toFixed(2) : "",
    wet: c?.wet_sales != null ? Number(c.wet_sales).toFixed(2) : "",
    dry: c?.dry_sales != null ? Number(c.dry_sales).toFixed(2) : "",
    whatWasOn: c?.what_was_on ?? "",
    act: c?.act_or_match ?? "",
    fee: c?.fee != null ? Number(c.fee).toFixed(2) : "",
  });
  const [form, setForm] = useState<Form>(() => fromSaved(existing));
  // Unsaved edits are kept per day, so flicking back a day never loses what you typed.
  const [drafts, setDrafts] = useState<Record<string, Form>>({});
  const [showMore, setShowMore] = useState(false);
  const { total, wet, dry, whatWasOn, act, fee } = form;
  const set = (k: keyof Form) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const setTotal = set("total"), setWet = set("wet"), setDry = set("dry"), setWhatWasOn = set("whatWasOn"), setAct = set("act"), setFee = set("fee");
  const saved = fromSaved(existing);
  const NUM: (keyof Form)[] = ["total", "wet", "dry", "fee"];
  const same = (k: keyof Form) => {
    if (!NUM.includes(k)) return saved[k].trim() === form[k].trim();
    const a = saved[k].trim(), b = form[k].trim();
    return a === b || (a !== "" && b !== "" && parseFloat(a) === parseFloat(b));
  };
  const dirty = (Object.keys(saved) as (keyof Form)[]).some(k => !same(k));

  const setDateISO = (next: string) => {
    if (next === dateISO) return;
    setDrafts(d => { const n = { ...d }; if (dirty) n[dateISO] = form; else delete n[dateISO]; return n; });
    setDateISOraw(next);
  };

  // Load the selected day: an unsaved draft first, otherwise what's saved.
  useEffect(() => {
    const f = drafts[dateISO] ?? fromSaved(existing);
    setForm(f);
    setShowMore(!!(f.whatWasOn || f.act || f.fee || f.wet || f.dry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO, existing?.id, existing?.updated_at]);

  const totalNum = parseFloat(total);
  const comparisons = useMemo(() => buildComparisons(cashUps, dateISO), [cashUps, dateISO]);
  const trend = useMemo(() => recentTrend(cashUps, dateISO, 14), [cashUps, dateISO]);
  const roi = useMemo(
    () =>
      entertainmentRoi(
        cashUps,
        dateISO,
        isNaN(totalNum) ? null : totalNum,
        fee ? parseFloat(fee) : null,
      ),
    [cashUps, dateISO, totalNum, fee],
  );
  const trendMax = useMemo(
    () => Math.max(1, ...trend.map((p) => p.total ?? 0)),
    [trend],
  );

  const delta = (past: number | null) => {
    if (past == null || isNaN(totalNum) || totalNum <= 0) return null;
    return totalNum - past;
  };

  const weekday = new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const bad = (v: string) => v.trim() !== "" && (isNaN(parseFloat(v)) || parseFloat(v) < 0);
  const wetN = parseFloat(wet), dryN = parseFloat(dry);
  const splitGap = !isNaN(wetN) && !isNaN(dryN) && !isNaN(totalNum) ? Math.round((totalNum - wetN - dryN) * 100) / 100 : null;

  async function handleSave() {
    if (!venue?.id) return;
    const t = parseFloat(total);
    if (isNaN(t)) {
      toast({ title: "Pop in what you took", description: "Enter the day's total to save it." });
      return;
    }
    if ([total, wet, dry, fee].some(bad)) {
      toast({ title: "Check the numbers", description: "Takings, wet, dry and the fee can't be less than £0.", variant: "destructive" });
      return;
    }
    try {
      await saveCashUp.mutateAsync({
        venue_id: venue.id,
        business_date: dateISO,
        total_taken: t,
        wet_sales: wet ? parseFloat(wet) : null,
        dry_sales: dry ? parseFloat(dry) : null,
        what_was_on: whatWasOn.trim() || null,
        act_or_match: act.trim() || null,
        fee: fee ? parseFloat(fee) : null,
      });
      setDrafts(d => { const n = { ...d }; delete n[dateISO]; return n; });
      toast({ title: "Day saved", description: `${prettyDate(dateISO)} logged at ${formatGBP(t)}.` });
    } catch (e: any) {
      toast({
        title: "Couldn't save",
        description: e?.message ?? "Give it another go in a moment.",
        variant: "destructive",
      });
    }
  }

  const rows = [
    { label: `Last ${weekday}`, value: comparisons.sameDayLastWeek },
    { label: `Average of the last 4 ${weekday}s`, value: comparisons.lastFourSameDays },
    ...comparisons.yearsAgo.map((y) => ({
      label: `Same ${weekday} ${y.years} year${y.years > 1 ? "s" : ""} ago`,
      value: y.total,
    })),
  ];
  const unsavedDays = Object.keys(drafts).filter(d => d !== dateISO).sort();

  const isFuture = dateISO >= todayISO();

  return (
    <div className="flex flex-col h-full overflow-auto pb-24">
      <div className="p-4 bg-card border-b border-border sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Daily Board</h1>
        <span className="text-xs text-muted-foreground truncate max-w-[45%]">{venue?.name ?? ""}</span>
      </div>

      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Daily Board view">
          {(["day", "weeks", "months"] as const).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`h-9 rounded-lg text-sm font-semibold ${view === v ? "bg-card shadow-sm text-primary" : "text-muted-foreground"}`}
              data-testid={`board-view-${v}`}>
              {v === "day" ? "Day" : v === "weeks" ? "Weeks" : "Months"}
            </button>
          ))}
        </div>
      </div>

      {view === "weeks" && <WeeksView weeks={weeks} cashUps={cashUps} openDay={(d) => { setDateISO(d); setView("day"); window.scrollTo(0, 0); }} />}
      {view === "months" && <MonthsView months={months} />}

      {view === "day" && <div className="p-4 space-y-4">
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Previous day">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <label className="flex-1 relative text-center cursor-pointer" data-testid="board-date-label">
            <span className="text-sm font-medium underline decoration-dotted underline-offset-4">{prettyDate(dateISO)}</span>
            <span className="block text-[11px] text-muted-foreground">Tap to pick a date</span>
            <input
              type="date"
              aria-label="Pick a date"
              data-testid="input-board-date"
              max={todayISO()}
              value={dateISO}
              onChange={(e) => { if (e.target.value && e.target.value <= todayISO()) setDateISO(e.target.value); }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDateISO(shiftISO(dateISO, 1))}
            disabled={isFuture}
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {dateISO !== todayISO() && (
          <button type="button" className="w-full text-sm font-semibold text-primary -mt-2" onClick={() => setDateISO(todayISO())} data-testid="button-board-today">Back to today</button>
        )}

        {/* Hero: tonight's take */}
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-primary-foreground/75">
              {existing && !dirty ? "Logged at" : dateISO === todayISO() ? "What did you take tonight?" : `What did you take ${prettyDate(dateISO) === "Yesterday" ? "yesterday" : "that day"}?`}
            </div>
            <div className="mt-2 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-foreground/70 text-2xl">£</span>
              <input
                inputMode="decimal"
                type="number"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
                data-testid="input-daily-total"
                min="0"
                aria-invalid={bad(total)}
                className="w-full bg-primary-foreground/10 border border-primary-foreground/20 rounded-lg pl-9 pr-4 py-3 text-4xl font-bold text-primary-foreground placeholder:text-primary-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary-foreground/40"
              />
            </div>
            {bad(total) && <div className="text-xs mt-2 font-semibold" data-testid="text-total-invalid">That can't be less than £0.</div>}
            {dirty && existing && !bad(total) && <div className="text-xs mt-2 text-primary-foreground/80" data-testid="text-unsaved">Changed, not saved yet. Saved figure {existing.total_taken != null ? formatGBP(existing.total_taken) : "—"}.</div>}
          </CardContent>
        </Card>

        {unsavedDays.length > 0 && (
          <div className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm" data-testid="board-unsaved-days">
            You've typed figures for {unsavedDays.map(d => prettyDate(d)).join(", ")} but not saved {unsavedDays.length === 1 ? "it" : "them"}.{" "}
            <button type="button" className="font-semibold text-primary underline" onClick={() => setDateISO(unsavedDays[unsavedDays.length - 1])}>Go back to {prettyDate(unsavedDays[unsavedDays.length - 1])}</button>
          </div>
        )}

        {/* Comparisons */}
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {rows.map((r, i) => {
              const d = delta(r.value);
              return (
                <div key={i} className="flex items-center justify-between gap-2 px-4 py-3">
                  <span className="text-sm text-muted-foreground">{r.label}</span>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="font-semibold tabular-nums whitespace-nowrap">{r.value != null ? formatGBP(r.value) : "—"}</span>
                    {d != null && (
                      <span className={`text-xs flex items-center gap-0.5 whitespace-nowrap tabular-nums ${d >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {d >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {d >= 0 ? "+" : "−"}{formatGBP(Math.abs(d))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Entertainment ROI */}
        {fee && parseFloat(fee) > 0 && !isNaN(totalNum) && totalNum >= 0 && (
          <Card data-testid="board-worth-it">
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-1">Was it worth putting on?</div>
              {roi ? (
                <>
                  <div className="text-sm text-foreground">
                    {act ? <span className="font-semibold">{act}</span> : "The night"} took {formatGBP(totalNum)}. A normal {weekday} is {formatGBP(roi.baseline)}, so that's{" "}
                    <span className={roi.uplift >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                      {formatGBP(Math.abs(roi.uplift))} {roi.uplift >= 0 ? "more" : "less"}
                    </span>.
                  </div>
                  <div className={`text-sm mt-1 font-semibold ${roi.net >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-worth-it-verdict">
                    {roi.net >= 0
                      ? `The ${formatGBP(roi.fee)} act paid for itself and made ${formatGBP(roi.net)} on top.`
                      : `After the ${formatGBP(roi.fee)} fee, it cost you ${formatGBP(Math.abs(roi.net))}.`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">Takings only, before stock and staff. A normal {weekday} is the average of your last 4.</div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Log a few more {weekday}s and this tells you if the act paid for itself.</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Last 14 days trend */}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-3 flex justify-between"><span>Last 14 days</span><span>Tap a bar to open that day</span></div>
            <div className="flex items-end gap-1 h-20">
              {trend.map((p, i) => {
                const h = p.total != null ? Math.max(4, Math.round((p.total / trendMax) * 72)) : 3;
                const isSel = p.date === dateISO;
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setDateISO(p.date)}
                    className="flex-1 h-full flex flex-col justify-end items-center"
                    aria-label={`${prettyDate(p.date)}: ${p.total != null ? formatGBP(p.total) : "nothing logged"}`}
                    title={`${prettyDate(p.date)}: ${p.total != null ? formatGBP(p.total) : "—"}`}
                    data-testid={`trend-bar-${p.date}`}
                  >
                    <div
                      className={`w-full rounded-sm ${p.total != null ? (isSel ? "bg-primary" : "bg-primary/40") : isSel ? "bg-primary/60" : "bg-muted"}`}
                      style={{ height: `${h}px` }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {trend.map((p, i) => (
                <div key={i} className={`flex-1 text-center text-[10px] ${p.date === dateISO ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {new Date(p.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Team & wages entry */}
        <Link href="/team">
          <Card className="active:scale-[0.99] transition-transform">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Team &amp; wages</div>
                <div className="text-xs text-muted-foreground">Clock staff in, see your wage % against the take</div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        {/* Optional extras */}
        <button type="button" className="text-sm text-primary font-medium" onClick={() => setShowMore((s) => !s)} data-testid="button-board-extras">
          {showMore ? "Hide extras" : "Add what was on, wet/dry split…"}
        </button>
        {showMore && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">What was on</label>
                <Input value={whatWasOn} onChange={(e) => setWhatWasOn(e.target.value)} placeholder="Nothing on / Quiz / Live act…" data-testid="input-board-what-on" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Act / match</label>
                  <Input value={act} onChange={(e) => setAct(e.target.value)} placeholder="Band, singer, the match…" data-testid="input-board-act" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Fee £</label>
                  <Input type="number" inputMode="decimal" min="0" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" data-testid="input-board-fee" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Wet £</label>
                  <Input type="number" inputMode="decimal" min="0" value={wet} onChange={(e) => setWet(e.target.value)} placeholder="0.00" data-testid="input-board-wet" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Dry £</label>
                  <Input type="number" inputMode="decimal" min="0" value={dry} onChange={(e) => setDry(e.target.value)} placeholder="0.00" data-testid="input-board-dry" />
                </div>
              </div>
              {splitGap != null && Math.abs(splitGap) >= 0.01 && (
                <div className="text-xs text-amber-700" data-testid="text-split-gap">
                  Wet and dry add up to {formatGBP(wetN + dryN)}, which is {formatGBP(Math.abs(splitGap))} {splitGap > 0 ? "less" : "more"} than the total you took.
                </div>
              )}
              {[wet, dry, fee].some(bad) && <div className="text-xs text-destructive">Amounts can't be less than £0.</div>}
            </CardContent>
          </Card>
        )}

        <Button className="w-full h-12 text-base font-semibold" onClick={handleSave} disabled={saveCashUp.isPending || (!!existing && !dirty)} data-testid="button-save-day">
          {saveCashUp.isPending ? "Saving…" : existing ? (dirty ? "Update the day" : "Saved") : "Save the day"}
        </Button>

        {cashUps.length === 0 && (
          <p className="text-xs text-muted-foreground text-center px-4 leading-relaxed">
            Log a few nights and the comparisons fill themselves in — same day last week, last year, and further back.
          </p>
        )}
      </div>}

      <div className="px-4 pb-4">
        <Button variant="outline" className="w-full" onClick={() => setImportOpen(true)} data-testid="button-open-takings-import">
          {cashUps.length < 60 ? "Got past takings in a spreadsheet? Bring them in" : "Bring in more past takings"}
        </Button>
      </div>
      {venue?.id && <TakingsImport open={importOpen} onOpenChange={setImportOpen} venueId={venue.id} existing={cashUps} />}
    </div>
  );
}

const weekLabel = (start: string) => new Date(start + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

function Change({ now, then }: { now: number; then: number | null }) {
  if (then == null || then <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  const d = now - then; const p = pct(now, then)!;
  return (
    <span className={`text-xs font-semibold tabular-nums ${d >= 0 ? "text-green-600" : "text-red-600"}`}>
      {d >= 0 ? "+" : "−"}{formatGBP(Math.abs(d))} ({d >= 0 ? "+" : "−"}{Math.abs(p).toFixed(0)}%)
    </span>
  );
}

function WeeksView({ weeks, cashUps, openDay }: { weeks: WeekRow[]; cashUps: { business_date: string; total_taken: number | null }[]; openDay: (d: string) => void }) {
  const [shown, setShown] = useState(12);
  const [open, setOpen] = useState<string | null>(null);
  const byDate = useMemo(() => new Map(cashUps.map(c => [c.business_date, c.total_taken])), [cashUps]);
  if (!weeks.length) return <p className="p-6 text-sm text-muted-foreground text-center">Log a few nights and your weeks build up here.</p>;
  const [cur, ...rest] = weeks;
  const full = rest.filter(w => w.days === 7);
  const recent = full.slice(0, 4);
  const avg4 = recent.length ? recent.reduce((a, w) => a + w.total, 0) / recent.length : null;
  const withWages = full.filter(w => w.wagePct != null).slice(0, 4);
  const wage4 = withWages.length ? withWages.reduce((a, w) => a + (w.wages ?? 0), 0) / withWages.reduce((a, w) => a + w.total, 0) * 100 : null;
  const max = Math.max(1, ...weeks.slice(0, shown).map(w => Math.max(w.total, w.lastYear ?? 0)));
  return (
    <div className="p-4 space-y-4" data-testid="board-weeks">
      <Card className="bg-primary text-primary-foreground border-none shadow-md">
        <CardContent className="p-5">
          <div className="text-sm font-medium text-primary-foreground/75">Week of {weekLabel(cur.start)}{cur.days < 7 ? ` · ${cur.days} of 7 days in` : ""}</div>
          <div className="text-4xl font-bold mt-1 tabular-nums" data-testid="text-week-total">{formatGBP(cur.total)}</div>
          {cur.lastYearSoFar != null && (
            <div className="text-sm mt-2" data-testid="text-week-vs-last-year">
              Same days last year {formatGBP(cur.lastYearSoFar)} ·{" "}
              <span className="font-semibold">{cur.total >= cur.lastYearSoFar ? "up" : "down"} {formatGBP(Math.abs(cur.total - cur.lastYearSoFar))}</span>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Average full week, last 4</div>
          <div className="text-lg font-bold tabular-nums" data-testid="text-week-avg">{avg4 != null ? formatGBP(avg4) : "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Wages as % of takings, last 4</div>
          <div className="text-lg font-bold tabular-nums" data-testid="text-week-wage-pct">{wage4 != null ? `${wage4.toFixed(1)}%` : "—"}</div>
        </CardContent></Card>
      </div>
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          <div className="px-3 py-2 text-[11px] text-muted-foreground flex justify-between"><span>Week of</span><span>vs same week last year</span></div>
          {weeks.slice(0, shown).map(w => (
            <div key={w.start} className="px-3 py-2.5" data-testid={`week-row-${w.start}`}>
              <button type="button" className="w-full text-left" onClick={() => setOpen(o => (o === w.start ? null : w.start))} aria-expanded={open === w.start} data-testid={`week-toggle-${w.start}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{open === w.start ? "▾ " : "▸ "}{weekLabel(w.start)}{w.days < 7 && <span className="text-[11px] text-muted-foreground"> · {w.days} days</span>}</span>
                <span className="text-sm font-bold tabular-nums">{formatGBP(w.total)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-muted relative overflow-hidden">
                  {(w.days === 7 ? w.lastYear : w.lastYearSoFar) != null && <div className="absolute inset-y-0 left-0 bg-foreground/20 rounded-full" style={{ width: `${((w.days === 7 ? w.lastYear : w.lastYearSoFar)! / max) * 100}%` }} />}
                  <div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: `${(w.total / max) * 100}%`, opacity: 0.85 }} />
                </div>
                <span className="shrink-0 min-w-[120px] text-right"><Change now={w.total} then={w.days === 7 ? w.lastYear : w.lastYearSoFar} /></span>
              </div>
              {w.wagePct != null && w.days === 7 && <div className="text-[11px] text-muted-foreground mt-0.5">Wages {formatGBP(w.wages!)} · {w.wagePct.toFixed(1)}% of takings</div>}
              </button>
              {open === w.start && (
                <div className="mt-2 rounded-lg bg-muted/50 divide-y divide-border" data-testid={`week-days-${w.start}`}>
                  {Array.from({ length: 7 }, (_, i) => shiftISO(w.start, i)).map(d => {
                    const v = byDate.get(d) ?? null, ly = byDate.get(shiftISO(d, -364)) ?? null;
                    return (
                      <button type="button" key={d} onClick={() => openDay(d)} className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left" data-testid={`week-day-${d}`}>
                        <span className="text-xs">{new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums">{v != null ? formatGBP(v) : "—"}</span>
                          <span className="min-w-[104px] text-right">{v != null ? <Change now={v} then={ly} /> : <span className="text-xs text-muted-foreground">not logged</span>}</span>
                        </span>
                      </button>
                    );
                  })}
                  <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">Tap a day to open it. Compared with the same day last year.</div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {shown < weeks.length && (
        <Button variant="outline" className="w-full" onClick={() => setShown(n => n + 12)} data-testid="button-more-weeks">Show earlier weeks</Button>
      )}
      <p className="text-[11px] text-muted-foreground text-center">Tap a week to see its days. Weeks run Sunday to Saturday. Last year is the same seven days 52 weeks back, so a Saturday is always compared with a Saturday.</p>
    </div>
  );
}

function MonthsView({ months }: { months: ReturnType<typeof monthRows> }) {
  if (!months.length) return <p className="p-6 text-sm text-muted-foreground text-center">Log a few nights and your months build up here.</p>;
  const max = Math.max(1, ...months.slice(0, 12).map(m => Math.max(m.total, m.lastYear ?? 0)));
  const label = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const complete = (m: { month: string; days: number }) => m.days === new Date(Date.UTC(+m.month.slice(0, 4), +m.month.slice(5, 7), 0)).getUTCDate();
  const last12 = months.filter(m => complete(m) && m.lastYear != null).slice(0, 12);
  const nowSum = last12.reduce((a, m) => a + m.total, 0), thenSum = last12.reduce((a, m) => a + (m.lastYear ?? 0), 0);
  return (
    <div className="p-4 space-y-4" data-testid="board-months">
      {last12.length >= 3 && (
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-primary-foreground/75">Last {last12.length} full months vs the same months a year before</div>
            <div className="text-4xl font-bold mt-1 tabular-nums" data-testid="text-months-total">{formatGBP(nowSum)}</div>
            <div className="text-sm mt-2">{formatGBP(thenSum)} the year before · <span className="font-semibold">{nowSum >= thenSum ? "up" : "down"} {formatGBP(Math.abs(nowSum - thenSum))} ({Math.abs(pct(nowSum, thenSum) ?? 0).toFixed(1)}%)</span></div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {months.map(m => (
            <div key={m.month} className="px-3 py-2.5" data-testid={`month-row-${m.month}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{label(m.month)}{m.days < new Date(Date.UTC(+m.month.slice(0, 4), +m.month.slice(5, 7), 0)).getUTCDate() && <span className="text-[11px] text-muted-foreground"> · {m.days} days</span>}</span>
                <span className="text-sm font-bold tabular-nums">{formatGBP(m.total)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-muted relative overflow-hidden">
                  {m.lastYear != null && <div className="absolute inset-y-0 left-0 bg-foreground/20 rounded-full" style={{ width: `${(m.lastYear / max) * 100}%` }} />}
                  <div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: `${Math.min(100, (m.total / max) * 100)}%`, opacity: 0.85 }} />
                </div>
                <span className="shrink-0 min-w-[120px] text-right">{complete(m) ? <Change now={m.total} then={m.lastYear} /> : <span className="text-xs text-muted-foreground">so far</span>}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground text-center">Grey bar is the same month last year.</p>
    </div>
  );
}
