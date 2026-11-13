import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildEntrySheet, entrySheetCsv, entrySheetText, entrySheetTsv, readEntered, writeEntered, type EntrySheetProduct } from "@/lib/entry-sheet";

/**
 * "Ready to type in": the count in stocktake-sheet order with Whole and Part per line, a tick
 * for each line as it's typed into the pub company's stock system, and copy / email / download.
 */
export function EntrySheetCard({ lines, venueName, venueMeasureMl, stocktakeId }: {
  lines: { prod: EntrySheetProduct; entries: any[] }[];
  venueName: string; venueMeasureMl?: number | null; stocktakeId: string | null;
}) {
  const { toast } = useToast();
  const rows = useMemo(() => buildEntrySheet(lines, venueMeasureMl), [lines, venueMeasureMl]);
  const [entered, setEntered] = useState<string[]>(() => readEntered(stocktakeId));
  useEffect(() => { setEntered(readEntered(stocktakeId)); }, [stocktakeId]);
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  const done = rows.filter(r => entered.includes(r.id)).length;
  const toggle = (id: string) => {
    const next = entered.includes(id) ? entered.filter(x => x !== id) : [...entered, id];
    setEntered(next); writeEntered(stocktakeId, next);
  };
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const text = entrySheetText(rows, venueName, date);
  const copy = async () => {
    try { await navigator.clipboard.writeText(entrySheetTsv(rows)); toast({ title: "Copied", description: "Paste it into a spreadsheet, an email or a note." }); }
    catch { toast({ title: "Couldn't copy", description: "Your phone blocked it. Use Email or Download instead.", variant: "destructive" }); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([entrySheetCsv(rows, venueName, date)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${venueName.replace(/[^a-z0-9]+/gi, "-")}-stock-count-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const mailto = `mailto:?subject=${encodeURIComponent(`${venueName} stock count, ${date}`)}&body=${encodeURIComponent(text)}`;
  let cat = "";

  return (
    <section className="rounded-xl border border-border bg-card p-3 space-y-2" data-testid="entry-sheet">
      <button type="button" className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setOpen(o => !o)} data-testid="button-toggle-entry-sheet" aria-expanded={open}>
        <div>
          <h2 className="text-sm font-bold">Ready to type in</h2>
          <p className="text-xs text-muted-foreground">Stocktake sheet order, whole and part. Tick each line as you enter it in your stock system.</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-primary tabular-nums" data-testid="text-entry-progress">{done} of {rows.length} · {open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="outline" onClick={copy} data-testid="button-copy-entry-sheet">Copy</Button>
            <Button size="sm" variant="outline" asChild><a href={mailto} data-testid="link-email-entry-sheet">Email</a></Button>
            <Button size="sm" variant="outline" onClick={download} data-testid="button-download-entry-sheet">Download</Button>
          </div>
          <div className="divide-y divide-border">
            {rows.map(r => {
              const head = r.category !== cat ? (cat = r.category) : null;
              const ticked = entered.includes(r.id);
              return (
                <React.Fragment key={r.id}>
                  {head && <div className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground" data-testid={`entry-category-${head}`}>{head}</div>}
                  <button type="button" onClick={() => toggle(r.id)} aria-pressed={ticked}
                    className={`w-full flex items-center gap-3 py-2.5 text-left ${ticked ? "opacity-50" : ""}`} data-testid={`entry-row-${r.id}`}>
                    <span className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm font-bold ${ticked ? "bg-primary border-primary text-primary-foreground" : "border-border"}`} aria-hidden>{ticked ? "✓" : ""}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${ticked ? "line-through" : ""}`}>{r.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{r.unit}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="text-base font-bold">{r.whole}</span> <span className="text-[11px] text-muted-foreground">{r.wholeLabel}</span>
                      {r.part != null && <> <span className="text-base font-bold ml-1">{r.part}</span> <span className="text-[11px] text-muted-foreground">{r.partLabel}</span></>}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
