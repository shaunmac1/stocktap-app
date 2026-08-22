import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, ClipboardPaste, Check, ArrowRight } from "lucide-react";
import {
  parseCsv, guessFieldForHeader, mapRows, OUT_CATEGORIES, IN_CATEGORIES,
  type FinanceField, type FinanceDirection,
} from "@/lib/finance";
import { useImportFinanceEntries } from "@/hooks/useFinance";

const FIELD_OPTIONS: { value: FinanceField; label: string }[] = [
  { value: "entry_date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "supplier", label: "Supplier / payee" },
  { value: "description", label: "Description" },
  { value: "reference", label: "Reference" },
  { value: "due_date", label: "Due date" },
  { value: "category", label: "Category (from sheet)" },
  { value: "status", label: "Status (from sheet)" },
  { value: "ignore", label: "— ignore —" },
];

export function FinanceImport({
  venueId, onDone,
}: { venueId: string; onDone: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const importer = useImportFinanceEntries();
  const [phase, setPhase] = useState<"input" | "map">("input");
  const [pasteText, setPasteText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<FinanceField[]>([]);
  const [direction, setDirection] = useState<FinanceDirection>("out");
  const [defaultCategory, setDefaultCategory] = useState<string>("stock");
  const [defaultStatus, setDefaultStatus] = useState<"paid" | "due">("paid");

  function ingest(text: string) {
    const rows = parseCsv(text.trim());
    if (rows.length < 2) {
      toast({ title: "Nothing to import", description: "Add a header row plus at least one row of data.", variant: "destructive" });
      return;
    }
    const hdr = rows[0].map((h) => h.trim());
    setHeaders(hdr);
    setDataRows(rows.slice(1));
    setMapping(hdr.map(guessFieldForHeader));
    setPhase("map");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    ingest(text);
    if (fileRef.current) fileRef.current.value = "";
  }

  const parsed = useMemo(() => mapRows(mapping, dataRows), [mapping, dataRows]);
  const validRows = parsed.filter((r) => r.valid);
  const categories = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;

  async function save() {
    if (!validRows.length) {
      toast({ title: "No valid rows", description: "Map a Date column and an Amount column so rows can be read.", variant: "destructive" });
      return;
    }
    const known = new Set(categories.map((c) => c.value));
    const rows = validRows.map((r) => {
      const status: "paid" | "due" | "received" =
        r.status === "paid" || r.status === "due" || r.status === "received"
          ? r.status
          : direction === "in" ? "received" : defaultStatus;
      return {
        venue_id: venueId,
        direction,
        entry_date: r.entry_date!,
        due_date: r.due_date,
        category: r.category && known.has(r.category) ? r.category : defaultCategory,
        supplier: r.supplier,
        description: r.description,
        amount: r.amount!,
        status,
        reference: r.reference,
        source: "import" as const,
      };
    });
    try {
      const n = await importer.mutateAsync(rows);
      toast({ title: `Imported ${n} ${n === 1 ? "entry" : "entries"}`, description: "You can edit or delete any of them on the Finances screen." });
      onDone();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  if (phase === "input") {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-semibold text-sm">Import your existing sheet</div>
          <p className="text-[12px] text-muted-foreground">
            Bring in takings, spending, supplier or rent payments and wages from any spreadsheet.
            Upload a CSV, or copy the cells straight from Excel / Google Sheets and paste below.
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} data-testid="button-finance-upload">
            <Upload className="w-4 h-4 mr-1.5" /> Upload a CSV file
          </Button>
          <div className="text-center text-[11px] text-muted-foreground">or paste rows</div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Date, Supplier, Amount, Reference\n22/08/2026, Marston's, 1200.00, INV-1"}
            className="w-full h-28 rounded-md border border-border p-2 text-xs font-mono"
            data-testid="textarea-finance-paste"
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => ingest(pasteText)} disabled={!pasteText.trim()} data-testid="button-finance-parse">
              <ClipboardPaste className="w-4 h-4 mr-1.5" /> Read these rows
            </Button>
            <Button variant="outline" onClick={onDone}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // map phase
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="font-semibold text-sm">Check the columns, then import</div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">These are…</label>
            <div className="flex gap-1 mt-1">
              {(["out", "in"] as FinanceDirection[]).map((d) => (
                <button key={d} onClick={() => { setDirection(d); setDefaultCategory(d === "in" ? "takings" : "stock"); }}
                  className={`flex-1 text-xs py-1.5 rounded border ${direction === d ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
                  data-testid={`button-direction-${d}`}>
                  {d === "out" ? "Money out" : "Money in"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">Default category</label>
            <select value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}
              className="w-full h-8 mt-1 rounded-md border border-border px-2 text-xs" data-testid="select-default-category">
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[240px] overflow-auto">
          {headers.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 text-xs truncate font-medium">{h || `Column ${i + 1}`}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <select
                value={mapping[i]}
                onChange={(e) => setMapping((m) => m.map((v, j) => (j === i ? (e.target.value as FinanceField) : v)))}
                className="w-[150px] h-8 rounded-md border border-border px-2 text-xs"
                data-testid={`select-map-${i}`}
              >
                {FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-muted p-2.5 text-[12px]">
          <span className="font-semibold text-primary">{validRows.length}</span> of {parsed.length} rows ready to import.
          {parsed.length - validRows.length > 0 && (
            <span className="text-amber-700"> {parsed.length - validRows.length} skipped (need a valid date + amount).</span>
          )}
        </div>

        {validRows.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden text-[11px]">
            <div className="grid grid-cols-3 gap-1 bg-muted px-2 py-1 font-semibold"><span>Date</span><span>Supplier</span><span className="text-right">Amount</span></div>
            {validRows.slice(0, 4).map((r, i) => (
              <div key={i} className="grid grid-cols-3 gap-1 px-2 py-1 border-t border-border">
                <span>{r.entry_date}</span><span className="truncate">{r.supplier || "—"}</span><span className="text-right tabular-nums">£{r.amount!.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} disabled={importer.isPending || !validRows.length} data-testid="button-finance-import-save">
            {importer.isPending ? "Importing…" : <><Check className="w-4 h-4 mr-1.5" />Import {validRows.length} {validRows.length === 1 ? "entry" : "entries"}</>}
          </Button>
          <Button variant="outline" onClick={() => setPhase("input")}>Back</Button>
        </div>
      </CardContent>
    </Card>
  );
}
