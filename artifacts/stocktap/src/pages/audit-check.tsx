import React, { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { FileUp, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseVennersAudit, type ParsedAudit } from "@/lib/venners-audit";
import { pdfTextItems } from "@/lib/pdf-text";
import { formatBase, periodLabel } from "@/lib/stock-orders";
import { savePendingAudits, type PendingAudit } from "@/lib/pending-audits";
import type { StockAuditRow } from "@/hooks/useStockAudits";
import { UpDown, AllStock } from "@/pages/orders";
import { useAuth } from "@/contexts/AuthContext";
import { useSaveStockAudit } from "@/hooks/useStockAudits";

function toRow(p: PendingAudit, i: number): StockAuditRow {
  const s = p.audit.summary;
  return {
    id: `local-${i}`, venue_id: "", source: "venners", file_name: p.fileName, created_at: "",
    period_start: s.periodStart!, period_end: s.periodEnd!,
    days: s.days ?? Math.round((Date.parse(s.periodEnd!) - Date.parse(s.periodStart!)) / 864e5),
    summary: s, lines: p.audit.lines,
  };
}

/** Free, no-sign-up Venners audit check. The PDF is read in the browser; nothing is uploaded. */
export default function AuditCheck() {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PendingAudit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [tab, setTab] = useState<"updown" | "all">("updown");

  const rows = useMemo(() => items.map(toRow).sort((a, b) => b.period_end.localeCompare(a.period_end)), [items]);
  const audit = rows.find(r => r.id === view) ?? rows[0] ?? null;

  const read = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...items]; const errs: string[] = [];
    for (const f of Array.from(files)) {
      setBusy(f.name);
      try {
        const parsed: ParsedAudit = parseVennersAudit(await pdfTextItems(await f.arrayBuffer()));
        if (!parsed.lines.length || !parsed.summary.periodStart || !parsed.summary.periodEnd) throw new Error("not a Venners wet stock audit");
        const at = next.findIndex(x => x.audit.summary.periodStart === parsed.summary.periodStart && x.audit.summary.periodEnd === parsed.summary.periodEnd);
        if (at >= 0) next[at] = { audit: parsed, fileName: f.name }; else next.push({ audit: parsed, fileName: f.name });
      } catch (e: any) {
        errs.push(`${f.name}: ${String(e?.message ?? e)}`);
      }
    }
    setBusy(null); setItems(next); setErrors(errs); setView(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const { venue } = useAuth();
  const save = useSaveStockAudit();
  const start = async () => {
    if (venue?.id) {
      // Already signed in: save straight to the account.
      setBusy("your audits");
      for (const p of items) { try { await save.mutateAsync({ venueId: venue.id, audit: p.audit, fileName: p.fileName }); } catch { /* shown on the orders page */ } }
      setBusy(null);
      setLocation("/orders");
      return;
    }
    savePendingAudits(items);
    setLocation("/auth?mode=signup");
  };

  // Selling lines that were counted at nothing: what the bar has run out of.
  const outNow = useMemo(() => (audit ? audit.lines.filter(l => !l.delist && l.counted <= 0 && l.sold > 0).sort((a, b) => b.sold - a.sold) : []), [audit]);
  const [showAllOut, setShowAllOut] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="bg-[#111316] text-[#F3F1EC]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold"><span className="w-7 h-7 rounded-md bg-[#E0A343] inline-block" />StockTap</a>
          <a href="/auth" className="text-sm text-[#8A9099] hover:text-[#F3F1EC]">Sign in</a>
        </div>
        <div className="max-w-3xl mx-auto px-4 pt-2 pb-8">
          <div className="text-xs uppercase tracking-widest text-[#E0A343] mb-2">Free, no sign-up</div>
          <h1 className="text-3xl font-bold leading-tight mb-2">Check your Venners audit in 30 seconds.</h1>
          <p className="text-[#B9BEC6] text-sm max-w-xl">Drop in the wet stock audit PDF Venners emails you. See your result, what's up and down by category, the lines that cost you most, likely till-button mix-ups, and what you've run out of.</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 pb-24">
        <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3" data-testid="audit-check-upload">
          <FileUp className="w-9 h-9 mx-auto text-primary" />
          <Button className="w-full h-12 text-base" onClick={() => fileRef.current?.click()} disabled={!!busy} data-testid="button-audit-check-choose">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reading {busy}</> : items.length ? "Add another audit PDF" : "Choose your audit PDF"}
          </Button>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={e => read(e.target.files)} data-testid="input-audit-check-file" />
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Read on your own device. Nothing is uploaded or kept unless you create an account.</p>
          {errors.map(e => <p key={e} className="text-xs text-destructive" data-testid="audit-check-error">Couldn't read {e}. It needs to be a Venners wet stock audit PDF.</p>)}
        </div>

        {audit && (
          <>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="audit-check-summary">
              <b>{periodLabel(audit)}</b>: {audit.lines.length} lines read{items.find(p => p.audit.summary.periodEnd === audit.period_end)?.audit.problems.length ? ", some lines didn't add up" : ", every line adds up"}.
            </div>

            {outNow.length > 0 && (
              <div className="rounded-xl border border-[#E5544B]/30 bg-[#E5544B]/5 p-3" data-testid="audit-check-out">
                <div className="text-sm font-semibold mb-1">Selling, but counted at nothing ({outNow.length})</div>
                <ul className="text-sm divide-y divide-border/60">
                  {(showAllOut ? outNow : outNow.slice(0, 8)).map(l => (
                    <li key={l.name} className="py-1.5 flex justify-between gap-2"><span className="min-w-0 truncate">{l.name}</span><span className="text-muted-foreground shrink-0 tabular-nums">sold {formatBase(l.sold, l.base)}</span></li>
                  ))}
                </ul>
                {outNow.length > 8 && !showAllOut && <button type="button" onClick={() => setShowAllOut(true)} className="text-sm font-semibold text-primary mt-1" data-testid="button-out-all">Show all {outNow.length}</button>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(["updown", "all"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`h-9 rounded-lg text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid={`audit-check-tab-${t}`}>
                  {t === "updown" ? "Up & down" : "All stock"}
                </button>
              ))}
            </div>
            {tab === "updown" ? <UpDown audit={audit} audits={rows} setAudit={setView} /> : <AllStock audit={audit} audits={rows} setAudit={setView} />}

            <div className="rounded-2xl bg-[#111316] text-[#F3F1EC] p-4" data-testid="audit-check-cta">
              <div className="font-bold">Want the order list too?</div>
              <p className="text-xs text-[#B9BEC6] mt-1 mb-3">Start free and {items.length === 1 ? "this audit comes" : "these audits come"} with you. Add your deliveries and StockTap tells you what to order, with busy weeks built in. 14 days free with everything on, no card.</p>
              <Button className="w-full h-11 font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90" onClick={start} disabled={!!busy} data-testid="button-audit-check-start">{venue?.id ? "Save to my account" : "Start free and keep this audit"}</Button>
            </div>
            <div className="sticky bottom-3 rounded-xl bg-[#111316]/95 text-[#F3F1EC] pl-4 pr-2 py-2 shadow-xl flex items-center justify-between gap-3" data-testid="audit-check-sticky">
              <span className="text-sm font-semibold">Get your order list</span>
              <Button size="sm" className="h-9 font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90" onClick={start} disabled={!!busy} data-testid="button-audit-check-sticky">{venue?.id ? "Save" : "Start free"}</Button>
            </div>
          </>
        )}

        {!audit && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground space-y-2">
            <div className="font-semibold text-foreground">What you'll see</div>
            <p>Your result and gross profit against optimum, closing stock and takings per day.</p>
            <p>Up and down for every category, and the lines that cost or saved you the most.</p>
            <p>Lines that moved opposite ways by about the same amount, which usually means the wrong till button.</p>
            <p>Every line: opening, delivered, sold, what should be there and what was counted.</p>
          </div>
        )}
      </main>
    </div>
  );
}
