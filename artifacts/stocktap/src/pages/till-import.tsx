import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, FileUp, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMovements, useProducts, useStocktakes } from "@/hooks/api";
import { useDeliveries } from "@/hooks/useDeliveries";
import { useStocktakeReadingsFor } from "@/hooks/useStockAudits";
import { useSaveTillMemory, useSaveTillSales, useTillMemory, useTillSalesInPeriod } from "@/hooks/useTillImport";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/calculations";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { fileToBase64, prepareImage } from "@/lib/image";
import { mergeTillPhotoRows, tillPhotoRowsToCsv, type TillPhotoRow } from "@/lib/till-photo";
import {
  detectTillType, findHeaderRow, guessGenericMapping, parseCsvRows, parseTillFile,
  type GenericMapping, type TillParseResult, type TillType,
} from "@/lib/till-import";
import {
  defaultServe, detectServe, perTillItem, planMatches, recallMapping, remember, rememberMapping, SERVE_LABELS, servesFor, soldUnitMl, soldUnitsFor,
  type MatchProduct, type PlannedLine, type ServeKind,
} from "@/lib/till-matching";
import {
  buildTillVariance, DEFAULT_TOLERANCE, describeAmount, soldUnitInBase, varianceTotals,
  type VarianceProduct, type VarianceRow,
} from "@/lib/till-variance";

const TILLS: Array<{ id: TillType; label: string; help: string }> = [
  { id: "sharp", label: "Sharp", help: "On the till: turn the key to SD CARD, pick 1 SAVING, then SALES DATA. Put the SD card in your phone or computer and pick the CSV file it saved. Sharp support is in beta until we have checked a real Sharp file." },
  { id: "casio", label: "Casio", help: "Do your Z read with the SD card in. On the card open CASIO, then XZ, then the year and month. Pick the file that starts Z004 (that's the PLU sales). X004 works too. This follows the file layout in Casio's own manual." },
  { id: "generic", label: "Other CSV", help: "Any till that saves a product sales report as a CSV. You say which column is which once, and StockTap remembers it." },
];

const selectCls = "w-full h-10 rounded-lg border border-input bg-background px-2 text-sm";
const niceDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

type Edit = { productId: string | null; serve: ServeKind; custom: number | null; touched: boolean };

/** A serve that fits the chosen product (a "half" carried over to a gin becomes a single). */
function fitServe(p: MatchProduct, serve: ServeKind): ServeKind {
  const ok = servesFor(p);
  if (serve === "unit" || ok.includes(serve)) return serve;
  return ok[0];
}

export default function TillImport() {
  const { venue } = useAuth();
  const venueId = venue?.id;
  const measureMl = venue?.measure_ml ?? 25;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: productsRaw } = useProducts(venueId);
  const products = useMemo(() => ((productsRaw ?? []) as unknown as (MatchProduct & VarianceProduct)[]).filter(p => (p as any).is_template !== true), [productsRaw]);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const { data: stocktakes = [] } = useStocktakes(venueId);
  const counts = useMemo(() => (stocktakes as any[])
    .filter(s => s.status === "closed" && s.closed_at)
    .sort((a, b) => String(b.closed_at).localeCompare(String(a.closed_at))), [stocktakes]);

  // ── Period between two counts ──
  const [openId, setOpenId] = useState("");
  const [closeId, setCloseId] = useState("");
  useEffect(() => {
    if (counts.length >= 2 && !openId && !closeId) { setCloseId(counts[0].id); setOpenId(counts[1].id); }
  }, [counts, openId, closeId]);
  const opening = counts.find(c => c.id === openId);
  const closing = counts.find(c => c.id === closeId);
  const periodOk = !!opening && !!closing && String(opening.closed_at) < String(closing.closed_at);
  const periodStart = opening?.closed_at?.slice(0, 10);
  const saleDate = closing?.closed_at?.slice(0, 10);

  // ── File ──
  const [till, setTill] = useState<TillType>(() => { try { return (localStorage.getItem("till-import:type") as TillType) || "sharp"; } catch { return "sharp"; } });
  // A photo of the report is read as an "any till" file, without changing the till the pub has saved.
  const [fromPhoto, setFromPhoto] = useState(false);
  useEffect(() => { if (fromPhoto) return; try { localStorage.setItem("till-import:type", till); } catch { /* ignore */ } }, [till, fromPhoto]);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoSets, setPhotoSets] = useState<TillPhotoRow[][]>([]);
  const readPhotos = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length || !venueId) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast({ title: "No signal", description: "Reading a photo needs a connection. Try again when you're back online.", variant: "destructive" });
      return;
    }
    try {
      const sets = [...photoSets];
      for (let i = 0; i < files.length; i++) {
        setPhotoBusy(files.length > 1 ? `Reading photo ${i + 1} of ${files.length}…` : "Reading the sales report…");
        const img = await prepareImage(files[i]);
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/read-till-photo`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ venue_id: venueId, image_base64: await fileToBase64(img), media_type: "image/jpeg" }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || "Couldn't read that photo. Try a clearer, straight-on photo.");
        sets.push(Array.isArray(data.rows) ? data.rows : []);
      }
      const merged = mergeTillPhotoRows(sets);
      if (!merged.length) { toast({ title: "No product sales found on that photo", description: "It needs to be the report that lists each product and how many were sold.", variant: "destructive" }); return; }
      setPhotoSets(sets);
      setFromPhoto(true); setTill("generic");
      setFileName(`${sets.length} ${sets.length === 1 ? "photo" : "photos"} of the sales report`);
      setText(tillPhotoRowsToCsv(merged));
    } catch (e: any) {
      toast({ title: "Couldn't read the photo", description: e?.message ?? "Try again.", variant: "destructive" });
    } finally {
      setPhotoBusy(null);
      if (camRef.current) camRef.current.value = "";
      if (libRef.current) libRef.current.value = "";
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const { data: memory } = useTillMemory(venueId);
  const saveMemory = useSaveTillMemory();
  const rows = useMemo(() => (till === "generic" && text ? parseCsvRows(text) : []), [till, text]);
  const [headerRow, setHeaderRow] = useState(0);
  const headers = rows[headerRow] ?? [];
  const [mapping, setMapping] = useState<Partial<GenericMapping>>({});
  useEffect(() => {
    if (till !== "generic" || !rows.length) return;
    const h = findHeaderRow(rows);
    setHeaderRow(h);
    const remembered = memory ? recallMapping(memory, rows[h] ?? []) : null;
    setMapping(remembered ?? guessGenericMapping(rows[h] ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [till, text]);

  const parsed: TillParseResult | null = useMemo(() => {
    if (!text) return null;
    if (till === "generic") {
      if (!mapping.name && !mapping.plu) return null;
      if (!mapping.qty) return null;
      return parseTillFile("generic", text, { ...mapping, name: mapping.name ?? "", qty: mapping.qty, headerRow } as GenericMapping);
    }
    return parseTillFile(till, text);
  }, [text, till, mapping, headerRow]);
  const guessedType = useMemo(() => (text ? detectTillType(text) : null), [text]);

  // ── Matching ──
  const plan: PlannedLine[] = useMemo(
    () => (parsed && memory ? planMatches(till, parsed.lines, products, memory) : []),
    [parsed, memory, products, till],
  );
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  useEffect(() => { setEdits({}); }, [plan]);
  const current = (pl: PlannedLine): Edit => edits[pl.key] ?? { productId: pl.productId, serve: pl.serve, custom: pl.custom, touched: false };
  const setEdit = (pl: PlannedLine, e: Partial<Edit>) => setEdits(prev => ({ ...prev, [pl.key]: { ...current(pl), ...e, touched: true } }));
  const [ignored, setIgnored] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const m: Record<string, boolean> = {};
    for (const pl of plan) if (pl.status === "ignored") m[pl.key] = true;
    setIgnored(m);
  }, [plan]);

  const tally = useMemo(() => {
    let matched = 0, check = 0, none = 0, skip = 0;
    for (const pl of plan) {
      const e = current(pl);
      if (ignored[pl.key]) skip++;
      else if (!e.productId) none++;
      else if (pl.status === "suggested" && !e.touched) check++;
      else matched++;
    }
    return { matched, check, none, skip };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, edits, ignored]);

  // ── Saving ──
  const { data: existing = [] } = useTillSalesInPeriod(periodOk ? venueId : undefined, periodStart, saleDate);
  const [replace, setReplace] = useState(true);
  const saveSales = useSaveTillSales();
  const [step, setStep] = useState<"pick" | "check" | "result">("pick");

  async function confirm() {
    if (!venueId || !saleDate || !periodStart || !memory) return;
    let mem = memory;
    const out: Array<{ product_id: string | null; product_name_raw: string; quantity_sold: number; revenue_pence: number | null; unit_price_pence: number | null }> = [];
    for (const pl of plan) {
      const e = current(pl);
      if (ignored[pl.key]) { mem = remember(mem, till, pl.line, { productId: null, serve: e.serve }); continue; }
      if (!e.productId) continue;
      const p = productById.get(e.productId);
      if (!p) continue;
      const serve = fitServe(p, e.serve);
      mem = remember(mem, till, pl.line, { productId: e.productId, serve, custom: e.custom });
      const sold = Math.round(soldUnitsFor({ ...pl, serve, custom: e.custom }, p, measureMl) * 1000) / 1000;
      const pence = pl.line.value != null ? Math.round(pl.line.value * 100) : null;
      out.push({
        product_id: p.id,
        product_name_raw: `${pl.line.name}${pl.line.plu ? ` (PLU ${pl.line.plu})` : ""}`,
        quantity_sold: sold,
        revenue_pence: pence,
        unit_price_pence: pence != null && pl.line.qty ? Math.round(pence / pl.line.qty) : null,
      });
    }
    if (till === "generic" && mapping.qty) mem = rememberMapping(mem, headers, { ...mapping, name: mapping.name ?? "", qty: mapping.qty, headerRow } as GenericMapping);
    try {
      await saveMemory.mutateAsync({ venueId, memory: mem });
      const n = await saveSales.mutateAsync({ venueId, saleDate, periodStart, rows: out, replace: replace && existing.length > 0 });
      toast({ title: `${n} till ${n === 1 ? "line" : "lines"} saved`, description: "Here's how the till compares with your counts." });
      setStep("result");
    } catch (err: any) {
      toast({ title: "Couldn't save the till sales", description: err?.message ?? "Give it another go.", variant: "destructive" });
    }
  }

  function reset() { setText(""); setFileName(""); setEdits({}); setPhotoSets([]); setStep("pick"); }

  const header = (
    <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
      <button onClick={() => (step === "check" ? setStep("pick") : step === "result" ? reset() : setLocation("/reports"))} className="text-muted-foreground" aria-label="Back" data-testid="button-till-back">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-primary">Import till sales</h1>
        <div className="text-xs text-muted-foreground truncate">
          {periodOk ? `${niceDate(opening.closed_at)} to ${niceDate(closing.closed_at)}` : "What the till sold between two counts"}
        </div>
      </div>
    </div>
  );

  if (counts.length < 2) {
    return (
      <div className="flex flex-col h-full">{header}
        <div className="p-4 space-y-3" data-testid="till-need-counts">
          <p className="text-sm font-semibold">You need two finished counts first</p>
          <p className="text-sm text-muted-foreground">Till sales are compared with the stock used between two counts. Finish a stocktake, do the next one, then bring in the till sales for the days in between.</p>
          <Button className="w-full" onClick={() => setLocation("/stocktake")}>Go to stocktake</Button>
        </div>
      </div>
    );
  }

  // ── Step 3: till vs counts ──
  if (step === "result") {
    return (
      <div className="flex flex-col h-full">{header}
        <div className="flex-1 overflow-auto p-4 pb-24 space-y-3">
          <TillVariance venueId={venueId!} opening={opening} closing={closing} products={products} measureMl={measureMl} />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" onClick={reset} data-testid="button-till-another">Import another</Button>
            <Button onClick={() => setLocation("/reports")} data-testid="button-till-reports">Back to reports</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: check matches ──
  if (step === "check" && parsed) {
    return (
      <div className="flex flex-col h-full">{header}
        <div className="flex-1 overflow-auto p-4 pb-40 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center" data-testid="till-summary">
            <div className="rounded-xl border border-border bg-card p-2"><div className="text-xl font-bold tabular-nums" data-testid="till-count-matched">{tally.matched}</div><div className="text-[11px] text-muted-foreground">Matched</div></div>
            <div className="rounded-xl border border-border bg-card p-2"><div className="text-xl font-bold tabular-nums text-[#B07A1F]" data-testid="till-count-check">{tally.check}</div><div className="text-[11px] text-muted-foreground">To check</div></div>
            <div className="rounded-xl border border-border bg-card p-2"><div className="text-xl font-bold tabular-nums text-[#E5544B]" data-testid="till-count-none">{tally.none}</div><div className="text-[11px] text-muted-foreground">Not matched</div></div>
          </div>
          <p className="text-xs text-muted-foreground">Check each line once. StockTap remembers your choices for this pub, so next time they're already done. Food, pool and anything that isn't stock: tap "Not stock".</p>
          {plan.map(pl => {
            const e = current(pl);
            const p = e.productId ? productById.get(e.productId) : undefined;
            const skip = !!ignored[pl.key];
            const sugIds = new Set(pl.suggestions.map(s => s.productId));
            const serves = p ? servesFor(p) : [];
            const serve: ServeKind = p ? fitServe(p, e.serve) : e.serve;
            const per = p ? perTillItem(p, serve === "unit" && soldUnitMl(p, measureMl) == null ? "each" : serve, measureMl, e.custom) : 0;
            const tone = skip ? "border-border opacity-60" : !e.productId ? "border-[#E5544B]/50" : pl.status === "suggested" && !e.touched ? "border-[#B07A1F]/60" : "border-[#3FAE74]/50";
            return (
              <div key={pl.key} className={`rounded-xl border ${tone} bg-card p-3 space-y-2`} data-testid={`till-line-${pl.line.plu ?? pl.line.name}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{pl.line.name}</div>
                    <div className="text-[11px] text-muted-foreground">{pl.line.plu ? `PLU ${pl.line.plu} · ` : ""}{pl.status === "remembered" ? "remembered" : pl.status === "suggested" && !e.touched ? "best guess, please check" : ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold tabular-nums ${pl.line.qty < 0 ? "text-[#E5544B]" : ""}`}>{pl.line.qty} sold</div>
                    {pl.line.value != null && <div className="text-[11px] text-muted-foreground tabular-nums">{formatGBP(pl.line.value)}</div>}
                  </div>
                </div>
                {!skip && (
                  <select className={selectCls} value={e.productId ?? ""} onChange={ev => {
                    const np = ev.target.value ? productById.get(ev.target.value) : undefined;
                    setEdit(pl, { productId: np?.id ?? null, serve: np ? fitServe(np, detectServe(pl.line.name) ?? defaultServe(np)) : e.serve });
                  }} data-testid={`till-product-${pl.key}`} aria-label={`Product for ${pl.line.name}`}>
                    <option value="">Pick the product…</option>
                    {pl.suggestions.length > 0 && <optgroup label="Best guesses">{pl.suggestions.map(s => <option key={s.productId} value={s.productId}>{s.name}</option>)}</optgroup>}
                    <optgroup label="All products">{products.filter(x => !sugIds.has(x.id)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                  </select>
                )}
                {!skip && p && (
                  <div className="flex items-center gap-2">
                    <select className={selectCls} value={serve} onChange={ev => setEdit(pl, { serve: ev.target.value as ServeKind })} data-testid={`till-serve-${pl.key}`} aria-label="Each one sold is">
                      {serve === "unit" && <option value="unit">{SERVE_LABELS.unit}</option>}
                      {serves.map(s => <option key={s} value={s}>{SERVE_LABELS[s]}</option>)}
                    </select>
                    {serve === "custom" && (
                      <input type="number" inputMode="decimal" step="0.01" min="0" className="w-24 h-10 rounded-lg border border-input bg-background px-2 text-sm" value={e.custom ?? ""} onChange={ev => setEdit(pl, { custom: ev.target.value ? Number(ev.target.value) : null })} aria-label="Serves per item" />
                    )}
                  </div>
                )}
                {!skip && p && (
                  <div className="text-[11px] text-muted-foreground" data-testid={`till-uses-${pl.key}`}>
                    Uses {describeAmount(pl.line.qty * per * soldUnitInBase(p, measureMl), p, measureMl)} of {p.name}
                  </div>
                )}
                <button type="button" className="text-xs font-semibold text-muted-foreground underline" onClick={() => setIgnored(prev => ({ ...prev, [pl.key]: !skip }))} data-testid={`till-skip-${pl.key}`}>
                  {skip ? "Undo: this is stock" : "Not stock, leave it out"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="fixed bottom-16 left-0 right-0 p-3 bg-background/95 border-t border-border space-y-2 max-w-2xl mx-auto">
          {existing.length > 0 && (
            <label className="flex items-start gap-2 text-xs" data-testid="till-replace">
              <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="mt-0.5" />
              <span>Replace the {existing.length} till {existing.length === 1 ? "line" : "lines"} already saved for these dates (so nothing is counted twice)</span>
            </label>
          )}
          {tally.none > 0 && <p className="text-[11px] text-muted-foreground">{tally.none} not matched {tally.none === 1 ? "line" : "lines"} will be left out.</p>}
          <Button className="w-full h-12 font-bold" disabled={tally.matched + tally.check === 0 || saveSales.isPending || saveMemory.isPending} onClick={confirm} data-testid="button-till-confirm">
            {saveSales.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : `Save ${tally.matched + tally.check} ${tally.matched + tally.check === 1 ? "line" : "lines"} and compare`}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 1: pick till, period and file ──
  const tillHelp = TILLS.find(t => t.id === till)!;
  const reportOutside = parsed?.meta.date && periodStart && saleDate && (parsed.meta.date < periodStart || parsed.meta.date > saleDate);
  return (
    <div className="flex flex-col h-full">{header}
      <div className="flex-1 overflow-auto p-4 pb-24 space-y-4">
        <section className="space-y-2">
          <div className="text-sm font-semibold">1. Which till?</div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {TILLS.map(t => (
              <button key={t.id} type="button" role="radio" aria-checked={till === t.id} onClick={() => setTill(t.id)} data-testid={`till-type-${t.id}`}
                className={`h-12 rounded-xl border text-sm font-semibold ${till === t.id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{t.label}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{tillHelp.help}</p>
          <p className="text-xs text-muted-foreground" data-testid="till-beta-note">Beta: send us your till file and we'll set it up for you. Email it to <a className="font-semibold text-primary underline" href="mailto:hello@stocktap.net?subject=My%20till%20file">hello@stocktap.net</a>.</p>
        </section>

        <section className="space-y-2">
          <div className="text-sm font-semibold">2. Which dates?</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">From the count on
              <select className={selectCls + " mt-1"} value={openId} onChange={e => setOpenId(e.target.value)} data-testid="till-open-count">
                {counts.map(c => <option key={c.id} value={c.id}>{niceDate(c.closed_at)}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">To the count on
              <select className={selectCls + " mt-1"} value={closeId} onChange={e => setCloseId(e.target.value)} data-testid="till-close-count">
                {counts.map(c => <option key={c.id} value={c.id}>{niceDate(c.closed_at)}</option>)}
              </select>
            </label>
          </div>
          {!periodOk && <p className="text-xs text-[#E5544B]">Pick an earlier count first, then a later one.</p>}
          <p className="text-xs text-muted-foreground">Use a Z read (or reads) covering exactly these days, so the till and the counts line up.</p>
          {periodOk && existing.length > 0 && (
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => setStep("result")} data-testid="button-till-see-existing">
              Till sales already saved for these dates. See till vs counts →
            </button>
          )}
        </section>

        <section className="space-y-2">
          <div className="text-sm font-semibold">3. The sales report: a photo or the till's file</div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="input-till-photo-camera" onChange={e => readPhotos(e.target.files)} />
          <input ref={libRef} type="file" accept="image/*" multiple className="hidden" data-testid="input-till-photo" onChange={e => readPhotos(e.target.files)} />
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2" data-testid="card-till-photo-all">
            <div className="text-sm font-semibold">No file from your till? Photograph the report</div>
            <p className="text-xs text-muted-foreground">The printout or the screen that lists each product and how many sold. Every line is read: draught, bottles, spirits, wine, soft drinks. A long roll can be several photos.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-11 font-bold" disabled={!!photoBusy} onClick={() => camRef.current?.click()} data-testid="button-till-photo-camera">Take a photo</Button>
              <Button variant="outline" className="h-11" disabled={!!photoBusy} onClick={() => libRef.current?.click()} data-testid="button-till-photo-library">Choose photos</Button>
            </div>
            {photoBusy && <div className="text-xs font-semibold text-primary" data-testid="till-photo-busy">{photoBusy}</div>}
            {fromPhoto && photoSets.length > 0 && !photoBusy && (
              <div className="text-xs text-muted-foreground" data-testid="till-photo-read">Read {photoSets.length} {photoSets.length === 1 ? "photo" : "photos"}. Add another if the report carries on.</div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv,.CSV,.txt,text/csv,text/plain" className="hidden" data-testid="input-till-file"
            onChange={async e => { const f = e.target.files?.[0]; if (f) { if (fromPhoto) { setFromPhoto(false); setPhotoSets([]); try { setTill((localStorage.getItem("till-import:type") as TillType) || "sharp"); } catch { setTill("sharp"); } } setFileName(f.name); setText(await f.text()); } e.target.value = ""; }} />
          <Button variant="outline" className="w-full h-12" onClick={() => fileRef.current?.click()} data-testid="button-till-file">
            <FileUp className="w-4 h-4 mr-2" /> {fileName ? `Picked: ${fileName}` : "Pick the file"}
          </Button>
          {text && guessedType && guessedType !== "generic" && guessedType !== till && (
            <button type="button" className="w-full text-left text-xs rounded-lg border border-[#B07A1F]/50 bg-[#B07A1F]/10 p-2" onClick={() => setTill(guessedType)} data-testid="till-type-hint">
              This looks like a {guessedType === "casio" ? "Casio" : "Sharp"} file. Tap to read it as {guessedType === "casio" ? "Casio" : "Sharp"}.
            </button>
          )}
          {till === "generic" && rows.length > 0 && !fromPhoto && (
            <div className="rounded-xl border border-border p-3 space-y-2" data-testid="till-mapper">
              <div className="text-xs font-semibold">Which column is which?</div>
              {([
                ["name", "Product name", true], ["plu", "PLU or code (if there is one)", false], ["qty", "Quantity sold", true], ["value", "Money taken, inc VAT (if there is one)", false],
              ] as const).map(([k, label, req]) => (
                <label key={k} className="block text-xs text-muted-foreground">{label}{req ? " *" : ""}
                  <select className={selectCls + " mt-1"} value={(mapping as any)[k] ?? ""} onChange={e => setMapping(m => ({ ...m, [k]: e.target.value || null }))} data-testid={`till-map-${k}`}>
                    <option value="">Not in this file</option>
                    {headers.filter(Boolean).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
              <label className="block text-xs text-muted-foreground">Headings are on row
                <select className={selectCls + " mt-1"} value={headerRow} onChange={e => setHeaderRow(Number(e.target.value))} data-testid="till-map-row">
                  {rows.slice(0, 15).map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter(Boolean).slice(0, 4).join(" · ").slice(0, 50)}</option>)}
                </select>
              </label>
            </div>
          )}
          {parsed && (
            <div className="rounded-xl border border-border p-3 text-sm space-y-1" data-testid="till-preview">
              {parsed.lines.length
                ? <div className="font-semibold">{parsed.lines.length} products found · {parsed.lines.reduce((s, l) => s + l.qty, 0).toLocaleString("en-GB")} sold{parsed.lines.some(l => l.value != null) ? ` · ${formatGBP(parsed.lines.reduce((s, l) => s + (l.value ?? 0), 0))}` : ""}</div>
                : <div className="font-semibold">No product sales found yet</div>}
              {parsed.meta.date && <div className="text-xs text-muted-foreground">Report date {new Date(parsed.meta.date + "T12:00:00").toLocaleDateString("en-GB")}{parsed.meta.mode ? ` · ${parsed.meta.mode} read` : ""}</div>}
              {reportOutside && <div className="text-xs text-amber-700">The report date isn't between the two counts. Check you've picked the right file or dates.</div>}
              {parsed.warnings.map((w, i) => <div key={i} className="text-xs text-amber-700 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}</div>)}
              {parsed.skipped.length > 0 && <div className="text-xs text-muted-foreground">Left out {parsed.skipped.length} total or blank {parsed.skipped.length === 1 ? "row" : "rows"}, like “{parsed.skipped[0]}”.</div>}
            </div>
          )}
        </section>

        <Button className="w-full h-12 font-bold" disabled={!periodOk || !parsed?.lines.length || !memory} onClick={() => setStep("check")} data-testid="button-till-next">
          Next: check the matches
        </Button>
        <p className="text-[11px] text-muted-foreground">Nothing is saved until you confirm on the next screen.</p>
      </div>
    </div>
  );
}

/** Till vs counts for one period, from the till sales saved for it. */
function TillVariance({ venueId, opening, closing, products, measureMl }: {
  venueId: string; opening: any; closing: any; products: VarianceProduct[]; measureMl: number;
}) {
  const periodStart = opening.closed_at.slice(0, 10), saleDate = closing.closed_at.slice(0, 10);
  const { data: sales = [], isLoading: l1 } = useTillSalesInPeriod(venueId, periodStart, saleDate);
  const { data: readings = [], isLoading: l2 } = useStocktakeReadingsFor(venueId, [opening.id, closing.id]);
  const { data: deliveries = [] } = useDeliveries(venueId, periodStart, saleDate);
  const { data: movements = [] } = useMovements(venueId);
  const [pct, setPct] = useState(() => { try { const v = Number(localStorage.getItem("till-import:tol")); return v > 0 && v <= 20 ? v : 3; } catch { return 3; } });
  useEffect(() => { try { localStorage.setItem("till-import:tol", String(pct)); } catch { /* ignore */ } }, [pct]);
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const rows: VarianceRow[] = useMemo(() => buildTillVariance({
    products,
    opening: { id: opening.id, closed_at: opening.closed_at },
    closing: { id: closing.id, closed_at: closing.closed_at },
    readings: readings as any,
    deliveries: deliveries as any,
    wastage: (movements as any[]).filter(m => m.movement_type === "wastage"),
    sales: sales as any,
    defaultMeasureMl: measureMl,
    tolerance: { ...DEFAULT_TOLERANCE, pct: pct / 100 },
  }), [products, opening, closing, readings, deliveries, movements, sales, measureMl, pct]);
  const shown = rows.filter(r => r.soldOnTill !== 0 || r.status !== "ok" || (r.usedByCounts ?? 0) !== 0);
  const totals = varianceTotals(shown);

  if (l1 || l2) return <p className="text-sm text-muted-foreground text-center py-8">Working it out…</p>;
  if (!sales.length) return <p className="text-sm text-muted-foreground text-center py-8" data-testid="till-variance-empty">No till sales saved for these dates yet.</p>;

  return (
    <div className="space-y-3" data-testid="till-variance">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-border bg-card p-2"><div className={`text-base font-bold tabular-nums ${totals.atCost > 0.005 ? "text-[#E5544B]" : ""}`} data-testid="till-total-cost">{formatGBP(totals.atCost)}</div><div className="text-[11px] text-muted-foreground">Unaccounted at cost</div></div>
        <div className="rounded-xl border border-border bg-card p-2"><div className={`text-base font-bold tabular-nums ${totals.atSale > 0.005 ? "text-[#E5544B]" : ""}`} data-testid="till-total-sale">{formatGBP(totals.atSale)}</div><div className="text-[11px] text-muted-foreground">At till prices</div></div>
        <div className="rounded-xl border border-border bg-card p-2"><div className="text-base font-bold tabular-nums" data-testid="till-total-flagged">{totals.flagged}</div><div className="text-[11px] text-muted-foreground">To look at</div></div>
      </div>
      <p className="text-xs text-muted-foreground">Used by your counts (first count + deliveries − second count − wastage) against what the till says it sold. A line is flagged when the gap is more than
        {" "}<select className="inline h-7 rounded border border-input bg-background px-1 text-xs" value={pct} onChange={e => setPct(Number(e.target.value))} data-testid="till-tolerance" aria-label="Tolerance">
          {[2, 3, 5, 10].map(v => <option key={v} value={v}>{v}%</option>)}
        </select>{" "}of what was used (and more than 2 pints, 2 measures or 2 items).</p>
      {shown.map(r => {
        const p = byId.get(r.productId)!;
        const colour = r.status === "loss" ? "border-[#E5544B]/60" : r.status === "over" ? "border-[#B07A1F]/60" : r.status === "ok" ? "border-[#3FAE74]/40" : "border-border";
        return (
          <div key={r.productId} className={`rounded-xl border ${colour} bg-card p-3`} data-testid={`till-var-${r.productId}`} data-status={r.status}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-sm min-w-0 truncate">{r.name}</div>
              {r.status !== "not_counted" && r.unexplained != null && (
                <div className={`text-sm font-bold tabular-nums shrink-0 ${r.status === "loss" ? "text-[#E5544B]" : r.status === "over" ? "text-[#B07A1F]" : "text-muted-foreground"}`}>{describeAmount(r.unexplained, p, measureMl, true)}</div>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {r.soldOnTill === 0 ? "Nothing matched to this on the till" : `Till sold ${describeAmount(r.soldOnTill, p, measureMl)}`}
              {r.usedByCounts != null ? ` · counts say ${describeAmount(r.usedByCounts - r.wastage, p, measureMl)} used${r.wastage ? ` (after ${describeAmount(r.wastage, p, measureMl)} wastage)` : ""}` : ""}
            </div>
            {r.status === "not_counted"
              ? <div className="text-xs text-muted-foreground mt-1">Not in both counts, so it can't be compared yet.</div>
              : (
                <div className="text-xs mt-1">
                  <span className={r.status === "loss" ? "text-[#E5544B] font-semibold" : r.status === "over" ? "text-[#B07A1F] font-semibold" : "text-[#3FAE74] font-semibold"}>
                    {r.status === "loss" ? "More used than the till sold" : r.status === "over" ? "Till sold more than was used" : "Within tolerance"}
                  </span>
                  {r.atCost != null && <> · {formatGBP(r.atCost)} at cost</>}
                  {r.atSale != null && <> · {formatGBP(r.atSale)} at sale price</>}
                </div>
              )}
            {r.status === "over" && <div className="text-[11px] text-muted-foreground mt-1">Usually a wrong till button, a delivery not added, or a miscount.</div>}
          </div>
        );
      })}
    </div>
  );
}
