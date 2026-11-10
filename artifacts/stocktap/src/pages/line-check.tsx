import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Camera, Images, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useLatestReadingsByProduct, useAddReading, addTillEntry } from "@/hooks/api";
import { useDeliveries } from "@/hooks/useDeliveries";
import { useLineChecks, saveLineChecks, useInvalidateLineChecks, type LineCheckRow } from "@/hooks/useLineChecks";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { isHidden } from "@/lib/hidden-products";
import { isDraughtProduct, gaugeToPints, formatGauge, draughtAmount } from "@/lib/draught-gauge";
import { containerSizeLabel } from "@/lib/container-sizes";
import { lineCheck, shortPattern } from "@/lib/line-check";
import { CATEGORY_LABELS, formatGBP } from "@/lib/calculations";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { fileToBase64, prepareImage } from "@/lib/image";
import { mergeTillPhotoRows, tillPhotoToPints, type TillPhotoRow } from "@/lib/till-photo";

const P = 568.261;
type Draft = { full: string; gal: string; pt: number; till: string; waste: string };
const blank: Draft = { full: "", gal: "", pt: 0, till: "", waste: "" };
const ORDER = ["draught_ale", "draught_cider", "draught_lager", "draught_stout"];

/**
 * Morning line check: every draught line on one screen. Count it (full, gallons, pints),
 * type what the till sold, and see what's missing before the day starts.
 */
export default function LineCheck() {
  const { venue, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: products } = useProducts(venue?.id);
  const { data: lastBy = {} } = useLatestReadingsByProduct(venue?.id);
  const since = useMemo(() => new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), []);
  const { data: deliveries = [], isError: deliveriesFailed } = useDeliveries(venue?.id, since);
  const { data: history = [] } = useLineChecks(venue?.id);
  const invalidate = useInvalidateLineChecks();
  const addReading = useAddReading();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<LineCheckRow[] | null>(null);
  const [cleanAll, setCleanAll] = useState("");
  // Till figures read from a photo of the till's product report.
  const [photoSets, setPhotoSets] = useState<TillPhotoRow[][]>([]);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoInfo, setPhotoInfo] = useState<{ filled: number; unmatched: TillPhotoRow[]; ignored: number; used: Record<string, TillPhotoRow[]> } | null>(null);
  const camRef = React.useRef<HTMLInputElement>(null);
  const libRef = React.useRef<HTMLInputElement>(null);

  const lines = useMemo(() => (products ?? [])
    .filter(p => isDraughtProduct(p) && !isHidden(p as any) && p.container_l)
    .sort((a, b) => (ORDER.indexOf(a.category ?? "") - ORDER.indexOf(b.category ?? "")) || a.name.localeCompare(b.name)), [products]);

  const readTillPhotos = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length || !venue?.id) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast({ title: "No signal", description: "Reading a till photo needs a connection. Type the till pints in for now, or try again when you're back online.", variant: "destructive" });
      return;
    }
    try {
      const sets = [...photoSets];
      for (let i = 0; i < files.length; i++) {
        setPhotoBusy(files.length > 1 ? `Reading photo ${i + 1} of ${files.length}…` : "Reading the till report…");
        const img = await prepareImage(files[i]);
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/read-till-photo`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ venue_id: venue.id, image_base64: await fileToBase64(img), media_type: "image/jpeg" }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || "Couldn't read that photo. Try a clearer, straight-on photo.");
        sets.push(Array.isArray(data.rows) ? data.rows : []);
      }
      const res = tillPhotoToPints(mergeTillPhotoRows(sets), lines.map(p => ({ id: p.id, name: p.name })));
      setPhotoSets(sets);
      setDrafts(d => { const n = { ...d }; for (const [id, pints] of Object.entries(res.pints)) n[id] = { ...(n[id] ?? blank), till: String(pints) }; return n; });
      const filled = Object.keys(res.pints).length;
      setPhotoInfo({ filled, unmatched: res.unmatched, ignored: res.ignored, used: res.used });
      toast(filled
        ? { title: `Till pints filled in for ${filled} ${filled === 1 ? "line" : "lines"}`, description: "Check them against the report, then count each line." }
        : { title: "No keg or cask lines found on that report", description: "It needs to be the report that lists each product and how many were sold.", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Couldn't read the till photo", description: e?.message ?? "Try again.", variant: "destructive" });
    } finally {
      setPhotoBusy(null);
      if (camRef.current) camRef.current.value = "";
      if (libRef.current) libRef.current.value = "";
    }
  };
  const clearTillPhoto = () => {
    const ids = Object.keys(photoInfo?.used ?? {});
    setDrafts(d => { const n = { ...d }; for (const id of ids) if (n[id]) n[id] = { ...n[id], till: "" }; return n; });
    setPhotoSets([]); setPhotoInfo(null);
  };

  const set = (id: string, patch: Partial<Draft>) => setDrafts(d => ({ ...d, [id]: { ...(d[id] ?? blank), ...patch } }));
  const touched = (d?: Draft) => !!d && (d.full !== "" || d.gal !== "" || d.pt > 0);

  const calc = (p: any) => {
    const d = drafts[p.id] ?? blank;
    const last: any = (lastBy as any)[p.id] ?? null;
    const lastAt: string | null = last?.reading_at ?? null;
    const deliveredMl = (deliveries as any[]).filter(x => x.product_id === p.id && (!lastAt || x.delivered_at > lastAt)).reduce((a, x) => a + (Number(x.quantity_ml) || 0), 0);
    const full = Math.max(0, Math.floor(parseFloat(d.full) || 0));
    const partPints = gaugeToPints(parseFloat(d.gal) || 0, d.pt);
    const nowMl = full * Number(p.container_l) * 1000 + partPints * P;
    const till = d.till === "" ? null : Math.max(0, parseFloat(d.till) || 0);
    const wasteMl = Math.max(0, parseFloat(d.waste) || 0) * P;
    const lc = last ? lineCheck({ lastMl: Number(last.ml_remaining), deliveredMl, nowMl, tillUnits: till, unitMl: P, draught: true, pricePerUnit: p.pour_price ?? null, wasteMl }) : null;
    return { d, last, lastAt, deliveredMl, full, partPints, nowMl, till, wasteMl, lc };
  };

  const ready = lines.filter(p => touched(drafts[p.id]));

  const save = async () => {
    if (!venue?.id || !user?.id || ready.length === 0) return;
    setSaving(true);
    const now = new Date().toISOString();
    const rows: LineCheckRow[] = [];
    try {
      for (const p of ready) {
        const c = calc(p);
        await addReading.mutateAsync({ venue_id: venue.id, product_id: p.id, method: "keg_weight", ml_remaining: c.nowMl, user_id: user.id, reading_at: now, full_containers: c.full, part_value: c.partPints, is_line_check: true } as any);
        if (c.till != null && c.last) await addTillEntry({ venue_id: venue.id, product_id: p.id, measures_sold: c.till, period_start: c.lastAt!, period_end: now } as any);
        rows.push({
          id: crypto.randomUUID(), venue_id: venue.id, product_id: p.id, checked_at: now,
          last_ml: c.last ? Number(c.last.ml_remaining) : null, last_at: c.lastAt, delivered_ml: c.deliveredMl, now_ml: c.nowMl,
          full_containers: c.full, part_pints: c.partPints, till_units: c.till, waste_ml: c.wasteMl, unit_ml: P,
          gone_ml: c.lc ? c.lc.goneMl : null, missing_ml: c.lc?.missingMl ?? null,
          missing_value_pence: c.lc?.missingValue != null ? Math.round(c.lc.missingValue * 100) : null, user_id: user.id,
        });
      }
      const synced = await saveLineChecks(rows);
      invalidate(venue.id);
      qc.invalidateQueries({ queryKey: ["latest-readings-by-product", venue.id] });
      setDone(rows); setDrafts({});
      toast({ title: `${rows.length} ${rows.length === 1 ? "line" : "lines"} checked`, description: synced ? "Saved." : "Saved on this phone. It'll sync when you're back online." });
    } catch (err: any) {
      toast({ title: "Couldn't save the check", description: String(err?.message ?? err), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const nameOf = (id: string) => (products ?? []).find(p => p.id === id)?.name ?? "Line";
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const thisWeek = history.filter(h => h.checked_at >= weekAgo).length;

  const downloadLog = () => {
    const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["Date", "Time", "Line", "Last count (pints)", "Delivered since (pints)", "Counted now (pints)", "Counted now (gal pt)", "Gone (pints)", "Cleaning/waste (pints)", "Till sold (pints)", "Missing (pints)", "Missing (£)"];
    const pt = (ml: number | null) => ml == null ? "" : Math.round(ml / P);
    const body = history.map(h => { const t = new Date(h.checked_at); return [t.toLocaleDateString("en-GB"), t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), nameOf(h.product_id), pt(h.last_ml), pt(h.delivered_ml), pt(h.now_ml), formatGauge(h.now_ml / P), pt(h.gone_ml), pt(h.waste_ml), h.till_units ?? "", pt(h.missing_ml), h.missing_value_pence != null ? (h.missing_value_pence / 100).toFixed(2) : ""]; });
    const csv = [[`${venue?.name ?? "StockTap"} line check log`], head, ...body].map(r => r.map(esc).join(",")).join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `line-check-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const Result = ({ rows }: { rows: LineCheckRow[] }) => {
    const withTill = rows.filter(r => r.missing_ml != null);
    const short = withTill.filter(r => (r.missing_ml as number) / P > 0.5).sort((a, b) => (b.missing_ml as number) - (a.missing_ml as number));
    const totalPence = short.reduce((a, r) => a + (r.missing_value_pence ?? 0), 0);
    return (
      <section className="rounded-2xl border border-border bg-card p-4 space-y-2" data-testid="line-check-result">
        <h2 className="text-lg font-bold">{short.length === 0 ? (withTill.length ? "All balanced" : "Counts saved") : `${short.length} ${short.length === 1 ? "line" : "lines"} short${totalPence ? ` · ${formatGBP(totalPence / 100)}` : ""}`}</h2>
        {withTill.length === 0 && <p className="text-sm text-muted-foreground">No till figures this time, so these counts are the starting point for tomorrow's check.</p>}
        {short.map(r => {
          const pat = shortPattern(history.filter(h => h.product_id === r.product_id));
          return (
            <div key={r.id} className="rounded-xl border border-[#E5544B]/30 bg-[#E5544B]/10 p-3" data-testid={`short-${r.product_id}`}>
              <div className="font-semibold">{nameOf(r.product_id)}</div>
              <div className="text-sm text-[#C2372E] font-bold">Missing {Math.round((r.missing_ml as number) / P)} pints · {formatGauge((r.missing_ml as number) / P)}{r.missing_value_pence ? ` · ${formatGBP(r.missing_value_pence / 100)}` : ""}</div>
              {pat && <div className="text-xs font-semibold text-[#C2372E]" data-testid={`pattern-${r.product_id}`}>Pattern: {pat}</div>}
            </div>
          );
        })}
        {withTill.filter(r => Math.abs((r.missing_ml as number) / P) <= 0.5).length > 0 && (
          <p className="text-sm text-[#2F7A4F] font-semibold">{withTill.filter(r => Math.abs((r.missing_ml as number) / P) <= 0.5).map(r => nameOf(r.product_id)).join(", ")}: balanced</p>
        )}
        {withTill.filter(r => (r.missing_ml as number) / P < -0.5).map(r => (
          <p key={r.id} className="text-sm text-[#B26A00] font-semibold">{nameOf(r.product_id)}: till rang {Math.round(-(r.missing_ml as number) / P)} more pints than left the keg. Check the till buttons or the count.</p>
        ))}
      </section>
    );
  };

  let lastCat = "";
  return (
    <div className="flex flex-col h-full overflow-auto pb-40">
      <div className="p-4 bg-card border-b border-border sticky top-0 z-10 flex items-center gap-3">
        <Link href="/"><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft /></Button></Link>
        <div>
          <h1 className="text-xl font-bold text-primary">Morning line check</h1>
          <p className="text-xs text-muted-foreground" data-testid="text-week-count">{thisWeek} {thisWeek === 1 ? "check" : "checks"} logged in the last 7 days</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {done && <Result rows={done} />}

        <div className="rounded-xl border border-border bg-card p-3 space-y-2 text-sm" data-testid="card-till-photo">
          <div className="font-semibold">Till sales from a photo</div>
          <p className="text-xs text-muted-foreground">Print the till's product sales report (X or Z read) covering sales since your last check, and photograph it. Long roll? Take a few photos, top to bottom.</p>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => readTillPhotos(e.target.files)} data-testid="input-till-camera" />
          <input ref={libRef} type="file" accept="image/*" multiple className="hidden" onChange={e => readTillPhotos(e.target.files)} data-testid="input-till-library" />
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11 font-bold" disabled={!!photoBusy} onClick={() => camRef.current?.click()} data-testid="button-till-photo">
              {photoBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}{photoBusy ? "Reading…" : photoInfo ? "Add another photo" : "Take a photo"}
            </Button>
            <Button variant="outline" className="h-11" disabled={!!photoBusy} onClick={() => libRef.current?.click()} data-testid="button-till-library"><Images className="w-4 h-4 mr-2" /> Pick photos</Button>
          </div>
          {photoBusy && <p className="text-xs font-semibold text-primary" data-testid="text-till-busy">{photoBusy}</p>}
          {photoInfo && (
            <div className="rounded-lg border border-border bg-background p-2 space-y-1" data-testid="till-photo-summary">
              <div className="font-semibold">{photoInfo.filled} {photoInfo.filled === 1 ? "line" : "lines"} filled in from {photoSets.length} {photoSets.length === 1 ? "photo" : "photos"}</div>
              {photoInfo.unmatched.length > 0 && (
                <div className="text-xs font-semibold text-[#B26A00]" data-testid="till-photo-unmatched">
                  Not sure which line these are, so type them in by hand: {photoInfo.unmatched.map(r => `${r.name} × ${r.qty}`).join(", ")}
                </div>
              )}
              {photoInfo.ignored > 0 && <div className="text-xs text-muted-foreground">{photoInfo.ignored} other rows (spirits, bottles, food) left alone.</div>}
              <button type="button" className="text-xs font-semibold text-primary underline" onClick={clearTillPhoto} data-testid="button-till-clear">Clear the photo figures</button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2 text-sm">
          <span className="flex-1">Cleaned the lines since the last check? Pints poured away per line:</span>
          <input type="number" inputMode="decimal" min={0} placeholder="0" value={cleanAll} onChange={e => setCleanAll(e.target.value)} aria-label="Cleaning pints per line" className="h-10 w-16 rounded-lg border border-border bg-background text-center font-bold" data-testid="input-clean-all" />
          <Button size="sm" variant="outline" disabled={cleanAll === ""} onClick={() => setDrafts(d => { const n = { ...d }; for (const p of lines) n[p.id] = { ...(n[p.id] ?? blank), waste: cleanAll }; return n; })} data-testid="button-clean-all">Apply to all</Button>
        </div>
        {deliveriesFailed && <p className="text-sm font-semibold text-[#B26A00]">No signal, so deliveries can't be checked. Missing figures may be out until you're back online.</p>}

        {lines.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No draught lines with a keg size yet. Add them in the Library.</p>}

        {lines.map(p => {
          const c = calc(p);
          const head = p.category !== lastCat ? (lastCat = p.category ?? "", CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? "Draught") : null;
          const word = p.container_type === "cask" || p.counting_method === "dipstick" ? "cask" : "keg";
          const expectMl = (c.last ? Number(c.last.ml_remaining) : 0) + c.deliveredMl;
          const isTouched = touched(c.d);
          return (
            <React.Fragment key={p.id}>
              {head && <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2">{head}</h2>}
              <article className={`rounded-xl border p-3 space-y-2.5 ${isTouched ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`} data-testid={`line-${p.id}`}>
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {containerSizeLabel(Number(p.container_l), word)}
                    {c.last ? ` · had ${draughtAmount(expectMl)}${c.deliveredMl > 0 ? `, incl. ${formatGauge(c.deliveredMl / P)} delivered` : ""}` : c.deliveredMl > 0 ? ` · ${draughtAmount(c.deliveredMl)} delivered, not counted yet` : " · first check sets the starting point"}
                  </div>
                </div>
                <div className="grid grid-cols-[auto_auto_1fr] items-end gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Full {word}s
                    <input type="number" inputMode="numeric" min={0} placeholder="0" value={c.d.full} onChange={e => set(p.id, { full: e.target.value.replace(/[^0-9]/g, "") })} className="mt-1 block h-11 w-16 rounded-lg border border-border bg-background text-center text-xl font-bold" data-testid={`full-${p.id}`} />
                  </label>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gallons
                    <input type="number" inputMode="numeric" min={0} placeholder="0" value={c.d.gal} onChange={e => set(p.id, { gal: e.target.value.replace(/[^0-9]/g, "") })} className="mt-1 block h-11 w-16 rounded-lg border border-border bg-background text-center text-xl font-bold" data-testid={`gal-${p.id}`} />
                  </label>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">+ odd pints</div>
                    <div className="grid grid-cols-8 gap-0.5" role="radiogroup" aria-label={`Pints for ${p.name}`}>
                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                        <button key={n} type="button" role="radio" aria-checked={c.d.pt === n} onClick={() => set(p.id, { pt: n })} className={`h-11 rounded-md border text-sm font-bold ${c.d.pt === n && isTouched ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`} data-testid={`pt-${p.id}-${n}`}>{n}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {c.d.gal === "" && c.d.pt > 0 && (
                  <div className="rounded-lg border border-[#E0A343]/50 bg-[#E0A343]/10 p-2 text-sm" data-testid={`warn-pints-only-${p.id}`}>
                    <div className="font-semibold">Only {c.d.pt} {c.d.pt === 1 ? "pint" : "pints"} left in the open {word}?</div>
                    <button type="button" className="mt-1 h-10 w-full rounded-lg bg-primary text-primary-foreground font-bold" onClick={() => set(p.id, { gal: String(c.d.pt), pt: 0 })} data-testid={`button-pints-to-gallons-${p.id}`}>
                      No, the gauge said {c.d.pt} {c.d.pt === 1 ? "gallon" : "gallons"}
                    </button>
                  </div>
                )}
                {photoInfo?.used[p.id] && (
                  <div className="text-xs rounded-lg bg-primary/10 px-2 py-1.5" data-testid={`till-photo-${p.id}`}>
                    <span className="font-bold">Till photo: {c.d.till || 0} pints sold</span>
                    <span className="text-muted-foreground"> ({photoInfo.used[p.id].map(r => `${r.name} × ${r.qty}`).join(", ")})</span>
                    {!isTouched && <span className="text-muted-foreground">. Count this line to see what's missing.</span>}
                  </div>
                )}
                {isTouched && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <label className="flex-1 font-semibold" htmlFor={`till-${p.id}`}>Till: pints sold since last check</label>
                      <input id={`till-${p.id}`} type="number" inputMode="decimal" min={0} placeholder="?" value={c.d.till} onChange={e => set(p.id, { till: e.target.value })} className="h-10 w-20 rounded-lg border border-border bg-background text-center font-bold" data-testid={`till-${p.id}`} />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <label className="flex-1 text-muted-foreground" htmlFor={`waste-${p.id}`}>Cleaning or waste pints</label>
                      <input id={`waste-${p.id}`} type="number" inputMode="decimal" min={0} placeholder="0" value={c.d.waste} onChange={e => set(p.id, { waste: e.target.value })} className="h-10 w-20 rounded-lg border border-border bg-background text-center font-bold" data-testid={`waste-${p.id}`} />
                    </div>
                    <div className="rounded-lg bg-background border border-border px-3 py-2 text-sm" data-testid={`result-${p.id}`}>
                      <div className="flex justify-between"><span className="text-muted-foreground">Now</span><span className="font-bold tabular-nums">{draughtAmount(c.nowMl)}</span></div>
                      {c.lc && <div className="flex justify-between"><span className="text-muted-foreground">Gone</span><span className="font-bold tabular-nums">{c.lc.label(c.lc.goneMl)}</span></div>}
                      {c.lc?.missingUnits != null && (
                        <div className={`flex justify-between font-bold ${c.lc.missingUnits > 0.5 ? "text-[#C2372E]" : c.lc.missingUnits < -0.5 ? "text-[#B26A00]" : "text-[#2F7A4F]"}`}>
                          <span>{c.lc.missingUnits > 0.5 ? "Missing" : c.lc.missingUnits < -0.5 ? "Rung but not poured" : "Balanced"}</span>
                          <span className="tabular-nums">{Math.abs(c.lc.missingUnits) > 0.5 ? `${c.lc.label(Math.abs(c.lc.missingMl!))}${c.lc.missingValue != null ? ` · ${formatGBP(Math.abs(c.lc.missingValue))}` : ""}` : "within half a pint"}</span>
                        </div>
                      )}
                      {c.lc && c.lc.goneMl < -8 * P && <div className="text-xs font-semibold text-[#B26A00]">More here than last count plus deliveries. Check the count, or add the delivery.</div>}
                    </div>
                  </>
                )}
              </article>
            </React.Fragment>
          );
        })}

        <section className="rounded-xl border border-border bg-card p-3 space-y-2" data-testid="line-check-log">
          <h2 className="text-sm font-bold">Line check log</h2>
          <p className="text-xs text-muted-foreground">Every check is saved with its date and time: {history.length} in the last 60 days. Download it as proof of your line checks.</p>
          <Button variant="outline" size="sm" onClick={downloadLog} disabled={history.length === 0} data-testid="button-download-log">Download log (CSV)</Button>
        </section>
      </div>

      <div className="fixed left-0 right-0 z-20 px-4" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}>
        <Button size="lg" className="w-full h-14 text-lg font-bold shadow-lg" disabled={saving || ready.length === 0} onClick={save} data-testid="button-save-line-check">
          {saving ? "Saving..." : ready.length === 0 ? "Count a line to start" : `Save ${ready.length} line ${ready.length === 1 ? "check" : "checks"}`}
        </Button>
      </div>
    </div>
  );
}
