import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { formatGBP } from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { useCashUps, useSaveCashUp, buildComparisons, entertainmentRoi, recentTrend, shiftISO } from "@/hooks/useDailyBoard";

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

  const [dateISO, setDateISO] = useState(todayISO());
  const existing = useMemo(
    () => cashUps.find((c) => c.business_date === dateISO) ?? null,
    [cashUps, dateISO]
  );

  const [total, setTotal] = useState("");
  const [wet, setWet] = useState("");
  const [dry, setDry] = useState("");
  const [whatWasOn, setWhatWasOn] = useState("");
  const [act, setAct] = useState("");
  const [fee, setFee] = useState("");
  const [showMore, setShowMore] = useState(false);

  // Load the selected day's saved values into the form.
  useEffect(() => {
    setTotal(existing?.total_taken != null ? String(existing.total_taken) : "");
    setWet(existing?.wet_sales != null ? String(existing.wet_sales) : "");
    setDry(existing?.dry_sales != null ? String(existing.dry_sales) : "");
    setWhatWasOn(existing?.what_was_on ?? "");
    setAct(existing?.act_or_match ?? "");
    setFee(existing?.fee != null ? String(existing.fee) : "");
    if (existing?.what_was_on || existing?.act_or_match || existing?.fee != null) setShowMore(true);
  }, [dateISO, existing?.id]);

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

  async function handleSave() {
    if (!venue?.id) return;
    const t = parseFloat(total);
    if (isNaN(t)) {
      toast({ title: "Pop in what you took", description: "Enter tonight's total to save the day." });
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
    { label: "Same day last week", value: comparisons.sameDayLastWeek },
    { label: "Last four same days", value: comparisons.lastFourSameDays },
    ...comparisons.yearsAgo.map((y) => ({
      label: `${y.years} year${y.years > 1 ? "s" : ""} ago`,
      value: y.total,
    })),
  ];

  const isFuture = dateISO >= todayISO();

  return (
    <div className="flex flex-col h-full overflow-auto pb-24">
      <div className="p-4 bg-card border-b border-border sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Daily Board</h1>
        <span className="text-xs text-muted-foreground truncate max-w-[45%]">{venue?.name ?? ""}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Previous day">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 text-center text-sm font-medium">{prettyDate(dateISO)}</div>
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

        {/* Hero: tonight's take */}
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-primary-foreground/75">
              {existing ? "Logged at" : "What did you take?"}
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
                className="w-full bg-primary-foreground/10 border border-primary-foreground/20 rounded-lg pl-9 pr-4 py-3 text-4xl font-bold text-primary-foreground placeholder:text-primary-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary-foreground/40"
              />
            </div>
          </CardContent>
        </Card>

        {/* Comparisons */}
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {rows.map((r, i) => {
              const d = delta(r.value);
              return (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">{r.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{r.value != null ? formatGBP(r.value) : "—"}</span>
                    {d != null && (
                      <span className={`text-xs flex items-center gap-0.5 ${d >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {d >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {formatGBP(Math.abs(d))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Entertainment ROI */}
        {roi && fee && parseFloat(fee) > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-1">Was it worth putting on?</div>
              <div className="text-sm text-foreground">
                {act ? <span className="font-semibold">{act}</span> : "Tonight"} took{" "}
                <span className={roi.uplift >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                  {roi.uplift >= 0 ? "+" : "−"}
                  {formatGBP(Math.abs(roi.uplift))}
                </span>{" "}
                vs a normal {new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}.
              </div>
              <div className={`text-sm mt-1 font-semibold ${roi.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                {roi.net >= 0
                  ? `The ${formatGBP(roi.fee)} act paid for itself and made ${formatGBP(roi.net)} on top.`
                  : `The ${formatGBP(roi.fee)} act cost you ${formatGBP(Math.abs(roi.net))} net.`}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Last 14 days trend */}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-3">Last 14 days</div>
            <div className="flex items-end gap-1 h-20">
              {trend.map((p, i) => {
                const h = p.total != null ? Math.max(4, Math.round((p.total / trendMax) * 72)) : 3;
                const isSel = p.date === dateISO;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col justify-end items-center"
                    title={`${p.date}: ${p.total != null ? formatGBP(p.total) : "—"}`}
                  >
                    <div
                      className={`w-full rounded-sm ${p.total != null ? (isSel ? "bg-primary" : "bg-primary/40") : "bg-muted"}`}
                      style={{ height: `${h}px` }}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Optional extras */}
        <button className="text-sm text-primary font-medium" onClick={() => setShowMore((s) => !s)}>
          {showMore ? "Hide extras" : "Add what was on, wet/dry split…"}
        </button>
        {showMore && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">What was on</label>
                <Input value={whatWasOn} onChange={(e) => setWhatWasOn(e.target.value)} placeholder="Nothing on / Quiz / Live act…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Act / match</label>
                  <Input value={act} onChange={(e) => setAct(e.target.value)} placeholder="Simply Lisa…" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Fee £</label>
                  <Input type="number" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Wet £</label>
                  <Input type="number" inputMode="decimal" value={wet} onChange={(e) => setWet(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Dry £</label>
                  <Input type="number" inputMode="decimal" value={dry} onChange={(e) => setDry(e.target.value)} placeholder="0.00" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Button className="w-full h-12 text-base font-semibold" onClick={handleSave} disabled={saveCashUp.isPending} data-testid="button-save-day">
          {saveCashUp.isPending ? "Saving…" : existing ? "Update the day" : "Save the day"}
        </Button>

        {cashUps.length === 0 && (
          <p className="text-xs text-muted-foreground text-center px-4 leading-relaxed">
            Log a few nights and the comparisons fill themselves in — same day last week, last year, and further back.
          </p>
        )}
      </div>
    </div>
  );
}
