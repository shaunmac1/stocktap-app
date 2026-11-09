import { useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/calculations";
import { useImportCashUps, type CashUp } from "@/hooks/useDailyBoard";
import { parseTakingsTable } from "@/lib/daily-board";

const nice = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Paste (or pick a CSV of) past nightly takings: one row per day, a date and what you took. */
export function TakingsImport({ open, onOpenChange, venueId, existing }: { open: boolean; onOpenChange: (o: boolean) => void; venueId: string; existing: CashUp[] }) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useImportCashUps();
  const { toast } = useToast();
  const table = useMemo(() => parseTakingsTable(text), [text]);
  const [pick, setPick] = useState<number | null>(null);
  const col = table.columns[pick != null && pick < table.columns.length ? pick : table.best];
  const parsed = col ?? { rows: [], skipped: text.trim() ? text.split(/\r?\n/).filter(l => l.trim()).map(l => l.trim().slice(0, 60)) : [], duplicates: 0, label: "" };
  const have = useMemo(() => new Set(existing.filter(c => c.total_taken != null).map(c => c.business_date)), [existing]);
  const overwrite = parsed.rows.filter(r => have.has(r.date)).length;
  const total = parsed.rows.reduce((a, r) => a + r.total, 0);
  const days = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? "day" : "days"}`;
  const biggest = parsed.rows.reduce<{ date: string; total: number } | null>((b, r) => (!b || r.total > b.total ? r : b), null);

  async function go() {
    try {
      const n = await save.mutateAsync({ venue_id: venueId, rows: parsed.rows });
      toast({ title: `${days(n)} brought in`, description: "Your weeks, months and last-year comparisons are filled in." });
      setText(""); setPick(null); onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Couldn't bring them in", description: e?.message ?? "Give it another go.", variant: "destructive" });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto p-4" data-testid="takings-import-sheet">
        <SheetHeader className="text-left mb-3">
          <SheetTitle>Bring in past takings</SheetTitle>
          <p className="text-xs text-muted-foreground">Paste from your spreadsheet, or pick the CSV your till gives you. One row per day works, and so do reports with the days across the top. If there's more than one money column, you pick which one is what you took.</p>
          <a href="/guides/import-takings-from-your-till" target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary" data-testid="link-till-guides">How to get this out of your till →</a>
        </SheetHeader>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"08/03/2023\t777.50\n09/03/2023\t1,570.46\n10/03/2023\t3,558.43"}
          className="w-full h-40 rounded-lg border border-input bg-background p-3 text-sm font-mono"
          data-testid="input-takings-paste"
        />
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setPick(null); setText(await f.text()); } e.target.value = ""; }} />
        <Button variant="outline" className="w-full mt-2" onClick={() => fileRef.current?.click()} data-testid="button-takings-file">Pick a CSV file</Button>
        {table.columns.length > 1 && (
          <div className="mt-3" data-testid="takings-column-picker">
            <label className="text-xs font-semibold">Which {table.across ? "row" : "column"} is what you took?</label>
            <div className="mt-1 grid gap-1.5">
              {table.columns.map((c, i) => {
                const on = (pick ?? table.best) === i;
                return (
                  <button type="button" key={i} onClick={() => setPick(i)} data-testid={`takings-col-${i}`} aria-pressed={on}
                    className={`text-left rounded-lg border px-3 py-2 text-sm flex justify-between gap-2 ${on ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>
                    <span className="truncate">{c.label}</span>
                    <span className="tabular-nums text-xs text-muted-foreground shrink-0">{c.rows.length} days · e.g. {formatGBP(c.rows[c.rows.length - 1]?.total ?? 0)}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Pick the total including VAT, the same figure you'd put on the Board each night.</p>
          </div>
        )}
        {text.trim() && (
          <div className="mt-3 rounded-xl border border-border p-3 text-sm space-y-1" data-testid="takings-import-preview">
            {parsed.rows.length ? (
              <>
                <div className="font-semibold">{days(parsed.rows.length)} · {formatGBP(total)}</div>
                <div className="text-xs text-muted-foreground">{parsed.rows.length === 1 ? nice(parsed.rows[0].date) : `${nice(parsed.rows[0].date)} to ${nice(parsed.rows[parsed.rows.length - 1].date)}`}</div>
                {biggest && parsed.rows.length > 1 && <div className="text-xs text-muted-foreground" data-testid="takings-import-biggest">Biggest day {formatGBP(biggest.total)} on {nice(biggest.date)}. If that looks wrong, check the columns.</div>}
                {overwrite > 0 && <div className="text-xs text-amber-700">{overwrite} of these days already {overwrite === 1 ? "has" : "have"} takings. {overwrite === 1 ? "It" : "They"}'ll be updated to {overwrite === 1 ? "this figure" : "these figures"}.</div>}
                {parsed.duplicates > 0 && <div className="text-xs text-amber-700">{parsed.duplicates} dates were in twice. The last one is used.</div>}
              </>
            ) : <div className="text-sm">No rows with a date and an amount yet.</div>}
            {parsed.skipped.length > 0 && <div className="text-xs text-muted-foreground" data-testid="takings-import-skipped">Left out {parsed.skipped.length} row{parsed.skipped.length === 1 ? "" : "s"} without a date and amount, like “{parsed.skipped[0]}”.</div>}
          </div>
        )}
        <Button className="w-full h-12 mt-3 font-semibold" disabled={!parsed.rows.length || save.isPending} onClick={go} data-testid="button-takings-import">
          {save.isPending ? "Bringing them in…" : parsed.rows.length ? `Bring in ${days(parsed.rows.length)}` : "Bring them in"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
