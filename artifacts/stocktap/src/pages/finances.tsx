import React, { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Plus, Upload, Trash2, Pencil, Wallet, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { formatGBP } from "@/lib/calculations";
import {
  OUT_CATEGORIES, IN_CATEGORIES, categoryLabel, summarise, withinRange,
  type FinanceEntry, type FinanceDirection,
} from "@/lib/finance";
import { useFinanceEntries, useAddFinanceEntry, useUpdateFinanceEntry, useDeleteFinanceEntry } from "@/hooks/useFinance";
import { FinanceImport } from "@/components/FinanceImport";

type Period = "week" | "month" | "year" | "all";

function isoToday(): string { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function periodStart(p: Period): string {
  const today = isoToday();
  if (p === "week") return addDaysISO(today, -6);
  if (p === "month") return today.slice(0, 8) + "01";
  if (p === "year") return today.slice(0, 4) + "-01-01";
  return "0001-01-01";
}
const PERIOD_LABELS: Record<Period, string> = { week: "7 days", month: "This month", year: "This year", all: "All time" };

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface DraftEntry {
  id?: string;
  direction: FinanceDirection;
  entry_date: string;
  category: string;
  supplier: string;
  description: string;
  amount: string;
  status: "paid" | "due" | "received";
  due_date: string;
  reference: string;
}

const emptyDraft = (): DraftEntry => ({
  direction: "out", entry_date: isoToday(), category: "stock", supplier: "",
  description: "", amount: "", status: "paid", due_date: "", reference: "",
});

export default function Finances() {
  const { venue } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: entries, isLoading } = useFinanceEntries(venue?.id);
  const addEntry = useAddFinanceEntry();
  const updateEntry = useUpdateFinanceEntry();
  const deleteEntry = useDeleteFinanceEntry();

  const [period, setPeriod] = useState<Period>("month");
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<DraftEntry | null>(null);

  const from = periodStart(period);
  const to = isoToday();
  const inRange = useMemo(() => withinRange(entries ?? [], from, period === "all" ? "9999-12-31" : to), [entries, from, to, period]);
  const summary = useMemo(() => summarise(inRange), [inRange]);

  const categories = editing?.direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;

  function openAdd() { setEditing(emptyDraft()); }
  function openEdit(e: FinanceEntry) {
    setEditing({
      id: e.id, direction: e.direction, entry_date: e.entry_date, category: e.category,
      supplier: e.supplier ?? "", description: e.description ?? "", amount: String(e.amount),
      status: e.status, due_date: e.due_date ?? "", reference: e.reference ?? "",
    });
  }

  async function saveDraft() {
    if (!editing || !venue?.id) return;
    const amt = parseFloat(editing.amount);
    if (!editing.entry_date || !isFinite(amt) || amt < 0) {
      toast({ title: "Check the entry", description: "A date and a valid amount are required.", variant: "destructive" });
      return;
    }
    const payload = {
      venue_id: venue.id,
      direction: editing.direction,
      entry_date: editing.entry_date,
      due_date: editing.status === "due" && editing.due_date ? editing.due_date : null,
      category: editing.category,
      supplier: editing.supplier.trim() || null,
      description: editing.description.trim() || null,
      amount: amt,
      status: editing.direction === "in" ? "received" as const : editing.status,
      reference: editing.reference.trim() || null,
      source: "manual" as const,
    };
    try {
      if (editing.id) await updateEntry.mutateAsync({ id: editing.id, ...payload });
      else await addEntry.mutateAsync(payload);
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  async function remove(e: FinanceEntry) {
    try { await deleteEntry.mutateAsync({ id: e.id, venue_id: e.venue_id }); }
    catch (err: any) { toast({ title: "Couldn't delete", description: err?.message ?? "Try again.", variant: "destructive" }); }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="text-muted-foreground" data-testid="button-finance-back">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">Finances</h1>
          <div className="text-xs text-muted-foreground">Money in, money out, and what's still owed</div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowImport(true)} data-testid="button-finance-import">
          <Upload className="w-4 h-4 mr-1" /> Import
        </Button>
        <Button size="sm" onClick={openAdd} data-testid="button-finance-add">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-24 space-y-4">
        {/* period */}
        <div className="flex gap-1.5">
          {(["week", "month", "year", "all"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 text-xs py-1.5 rounded-full border ${period === p ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
              data-testid={`button-period-${p}`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* summary */}
        <div className="grid grid-cols-2 gap-2">
          <Card><CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Money in</div>
            <div className="text-lg font-bold text-emerald-700 tabular-nums" data-testid="text-income">{formatGBP(summary.income)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingDown className="w-3.5 h-3.5 text-red-600" /> Money out</div>
            <div className="text-lg font-bold text-red-700 tabular-nums" data-testid="text-outgoings">{formatGBP(summary.outgoings)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="w-3.5 h-3.5 text-primary" /> Net</div>
            <div className={`text-lg font-bold tabular-nums ${summary.net >= 0 ? "text-emerald-700" : "text-red-700"}`} data-testid="text-net">{formatGBP(summary.net)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Still payable</div>
            <div className="text-lg font-bold text-amber-700 tabular-nums" data-testid="text-payable">{formatGBP(summary.payable)}</div>
          </CardContent></Card>
        </div>

        {/* list */}
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : inRange.length === 0 ? (
          <div className="text-center py-14 space-y-3">
            <Wallet className="mx-auto w-12 h-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nothing here yet</p>
            <p className="text-sm text-muted-foreground">Add an entry, or import your existing takings & spending sheet.</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={openAdd} data-testid="button-finance-add-first">Add entry</Button>
              <Button variant="outline" onClick={() => setShowImport(true)}>Import a sheet</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {inRange.map((e) => (
              <Card key={e.id} data-testid={`finance-row-${e.id}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-1.5 self-stretch rounded-full ${e.direction === "in" ? "bg-emerald-500" : "bg-red-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{e.supplier || categoryLabel(e.direction, e.category)}</span>
                      {e.status === "due" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">DUE</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {fmtDate(e.entry_date)} · {categoryLabel(e.direction, e.category)}{e.description ? ` · ${e.description}` : ""}
                    </div>
                  </div>
                  <div className={`text-sm font-bold tabular-nums shrink-0 ${e.direction === "in" ? "text-emerald-700" : "text-red-700"}`}>
                    {e.direction === "in" ? "+" : "−"}{formatGBP(e.amount)}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => openEdit(e)} className="p-1.5 text-muted-foreground hover:text-primary" data-testid={`button-edit-${e.id}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(e)} className="p-1.5 text-muted-foreground hover:text-destructive" data-testid={`button-delete-${e.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* import sheet */}
      <Sheet open={showImport} onOpenChange={setShowImport}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-auto">
          <SheetHeader><SheetTitle>Import finances</SheetTitle></SheetHeader>
          <div className="mt-3">
            {venue?.id && <FinanceImport venueId={venue.id} onDone={() => setShowImport(false)} />}
          </div>
        </SheetContent>
      </Sheet>

      {/* add / edit sheet */}
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-auto">
          <SheetHeader><SheetTitle>{editing?.id ? "Edit entry" : "Add entry"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-1">
                {(["out", "in"] as FinanceDirection[]).map((d) => (
                  <button key={d} onClick={() => setEditing({ ...editing, direction: d, category: d === "in" ? "takings" : "stock" })}
                    className={`flex-1 text-sm py-2 rounded-lg border ${editing.direction === d ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
                    data-testid={`button-edit-direction-${d}`}>
                    {d === "out" ? "Money out" : "Money in"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Date</label>
                  <Input type="date" value={editing.entry_date} onChange={(e) => setEditing({ ...editing, entry_date: e.target.value })} className="h-9" data-testid="input-entry-date" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Amount (£)</label>
                  <Input type="number" inputMode="decimal" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} className="h-9" placeholder="0.00" data-testid="input-entry-amount" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Category</label>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full h-9 rounded-md border border-border px-2 text-sm" data-testid="select-entry-category">
                  {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">{editing.direction === "in" ? "From (optional)" : "Supplier / payee (optional)"}</label>
                <Input value={editing.supplier} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} className="h-9" placeholder={editing.direction === "in" ? "e.g. Function booking" : "e.g. your pubco, brewery, utility"} data-testid="input-entry-supplier" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Description (optional)</label>
                <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="h-9" data-testid="input-entry-description" />
              </div>
              {editing.direction === "out" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Status</label>
                    <div className="flex gap-1 mt-1">
                      {(["paid", "due"] as const).map((s) => (
                        <button key={s} onClick={() => setEditing({ ...editing, status: s })}
                          className={`flex-1 text-xs py-1.5 rounded border ${editing.status === s ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
                          data-testid={`button-status-${s}`}>
                          {s === "paid" ? "Paid" : "Still owed"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editing.status === "due" && (
                    <div>
                      <label className="text-[11px] text-muted-foreground">Due date</label>
                      <Input type="date" value={editing.due_date} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} className="h-9" data-testid="input-entry-due" />
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-[11px] text-muted-foreground">Reference (optional)</label>
                <Input value={editing.reference} onChange={(e) => setEditing({ ...editing, reference: e.target.value })} className="h-9" placeholder="Invoice / statement no." data-testid="input-entry-reference" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={saveDraft} disabled={addEntry.isPending || updateEntry.isPending} data-testid="button-entry-save">
                  {editing.id ? "Save changes" : "Add entry"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
