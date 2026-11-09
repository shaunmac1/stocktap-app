import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ClipboardCopy, FileUp, Loader2, Minus, Plus, Share2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useStocktakes } from "@/hooks/api";
import { useDeliveries } from "@/hooks/useDeliveries";
import { useDeleteStockAudit, useSaveStockAudit, useStockAudits, useStocktakeReadingsFor, type StockAuditRow } from "@/hooks/useStockAudits";
import { buildCountAudits } from "@/lib/count-audits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseVennersAudit, type AuditLine } from "@/lib/venners-audit";
import { pdfTextItems } from "@/lib/pdf-text";
import {
  buildPatterns, deliveredBase, formatBase, lineKey, matchAuditLine, offsettingPairs, orderList, orderText, packLabel,
  periodLabel, periodTag, revenuePerDay, type Basis, type OrderProductLike, type OrderRow,
} from "@/lib/stock-orders";

type Tab = "order" | "updown" | "all" | "audits";

const money = (x: number, signed = false) =>
  (signed && x > 0.004 ? "+" : x < -0.004 ? "−" : "") + "£" + Math.abs(x).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const perWeek = (rate: number, base: AuditLine["base"]) => `${formatBase(rate * 7, base)}${base === "units" ? " units" : ""}`;

function store(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
function load(k: string) { try { return localStorage.getItem(k); } catch { return null; } }

export default function Orders() {
  const { venue } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: vennersAudits = [], isLoading } = useStockAudits(venue?.id);
  const { data: productsRaw } = useProducts(venue?.id);
  const products = useMemo(() => (productsRaw ?? []) as unknown as OrderProductLike[], [productsRaw]);

  // No Venners? Build the same thing from StockTap's own closed stocktakes.
  const { data: stocktakes = [] } = useStocktakes(venue?.id);
  const closedCounts = useMemo(() => (stocktakes as any[]).filter(s => s.status === "closed" && s.closed_at), [stocktakes]);
  const closedIds = useMemo(() => closedCounts.map(s => s.id as string), [closedCounts]);
  const firstClosed = useMemo(() => closedCounts.map(s => s.closed_at as string).sort()[0], [closedCounts]);
  const { data: countReadings = [] } = useStocktakeReadingsFor(vennersAudits.length ? undefined : venue?.id, closedIds);
  const { data: countDeliveries = [] } = useDeliveries(vennersAudits.length || closedIds.length < 2 ? undefined : venue?.id, firstClosed?.slice(0, 10));
  const countAudits = useMemo(
    () => (vennersAudits.length ? [] : buildCountAudits(closedCounts as any, countReadings as any, countDeliveries as any, products as any)) as unknown as StockAuditRow[],
    [vennersAudits.length, closedCounts, countReadings, countDeliveries, products],
  );
  const usingCounts = !vennersAudits.length && countAudits.length > 0;
  const audits = usingCounts ? countAudits : vennersAudits;
  const saveAudit = useSaveStockAudit();
  const deleteAudit = useDeleteStockAudit();

  const [tabState, setTabState] = useState<Tab>(() => (load("orders:tab") as Tab) || "order");
  const setTab = (t: Tab) => { setTabState(t); store("orders:tab", t); };
  // Counts have no till data, so no up and down, and nothing to manage on an Audits tab.
  const tab: Tab = usingCounts && (tabState === "updown" || tabState === "audits") ? "order" : tabState;
  const [cover, setCover] = useState(() => { const v = Number(load("orders:cover")); return v >= 3 && v <= 28 ? v : 10; });
  const [busy, setBusy] = useState(() => Number(load("orders:busy")) || 0);
  const [basisId, setBasisId] = useState(() => load("orders:basis") || "latest");
  const [adjust, setAdjust] = useState<Record<string, number>>({});
  const [auditForView, setAuditForView] = useState<string | null>(null);

  const { order: sorted } = useMemo(() => buildPatterns(audits), [audits]);
  const latest = sorted[sorted.length - 1] ?? null;
  const sinceDays = latest ? Math.max(0, Math.floor((Date.now() - new Date(latest.period_end + "T12:00:00").getTime()) / 864e5)) : 0;

  // Deliveries added in StockTap since the last count
  const { data: deliveries = [] } = useDeliveries(venue?.id, latest?.period_end);

  // Which product in the library each audit line is
  const productByKey = useMemo(() => {
    const m = new Map<string, OrderProductLike>();
    if (!latest || !products.length) return m;
    for (const l of latest.lines) {
      const p = matchAuditLine(l, products);
      if (p) m.set(lineKey(l.name), p);
    }
    return m;
  }, [latest, products]);

  const deliveredOn = useMemo(() => {
    const out = new Map<string, Array<{ day: number; qty: number }>>();
    if (!latest) return out;
    const countAt = new Date(latest.period_end + "T12:00:00").getTime();
    const keyByProduct = new Map<string, string>();
    productByKey.forEach((p, k) => { if (!keyByProduct.has(p.id)) keyByProduct.set(p.id, k); });
    const lineByKey = new Map(latest.lines.map(l => [lineKey(l.name), l]));
    for (const d of deliveries) {
      if (d.delivered_at.slice(0, 10) < latest.period_end) continue;
      const key = keyByProduct.get(d.product_id);
      const line = key ? lineByKey.get(key) : null;
      const p = key ? productByKey.get(key) : null;
      if (!key || !line || !p) continue;
      const day = Math.max(0, Math.floor((Date.parse(d.delivered_at) - countAt) / 864e5 + 1e-9));
      const list = out.get(key) ?? []; list.push({ day, qty: deliveredBase(d as any, line.base, p) }); out.set(key, list);
    }
    return out;
  }, [deliveries, latest, productByKey]);
  const deliveredLines = [...deliveredOn.values()].filter(v => v.some(d => d.qty > 0)).length;

  const basis: Basis = basisId === "latest" ? { kind: "latest" } : basisId === "average" ? { kind: "average" } : basisId === "busiest" ? { kind: "busiest" } : { kind: "period", auditId: basisId };
  const result = useMemo(() => orderList(audits, { basis, busyPct: busy, coverDays: cover, sinceDays }, { deliveredOn, productFor: k => productByKey.get(k) ?? null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audits, basisId, busy, cover, sinceDays, deliveredOn, productByKey]);

  useEffect(() => { store("orders:cover", String(cover)); }, [cover]);
  useEffect(() => { store("orders:busy", String(busy)); }, [busy]);
  useEffect(() => { store("orders:basis", basisId); }, [basisId]);
  useEffect(() => { setAdjust({}); }, [basisId, busy, cover]);

  const qtyOf = (r: OrderRow) => adjust[r.key] ?? r.suggested;
  const toOrder = result.rows.filter(r => qtyOf(r) > 0);
  const text = orderText(result.rows.map(r => ({ name: r.name, category: r.category, pack: r.pack, qty: qtyOf(r) })), cover);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast({ title: "Order copied", description: "Paste it into an email or message to your rep." }); }
    catch { toast({ title: "Couldn't copy", description: "Try Share instead.", variant: "destructive" }); }
  };
  const share = async () => {
    if ((navigator as any).share) { try { await (navigator as any).share({ title: "Order", text }); } catch { /* cancelled */ } }
    else copy();
  };

  // ─── Import ────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const importFiles = async (files: FileList | null) => {
    if (!files || !venue?.id) return;
    for (const f of Array.from(files)) {
      setImporting(f.name);
      try {
        const items = await pdfTextItems(await f.arrayBuffer());
        const parsed = parseVennersAudit(items);
        if (!parsed.lines.length) throw new Error("This doesn't look like a Venners audit with a Stock Count Variance section.");
        await saveAudit.mutateAsync({ venueId: venue.id, audit: parsed, fileName: f.name });
        toast({
          title: `Added ${parsed.summary.periodStart ? periodLabel({ period_start: parsed.summary.periodStart, period_end: parsed.summary.periodEnd! }) : f.name}`,
          description: `${parsed.lines.length} lines${parsed.problems.length ? ` · ${parsed.problems.length} didn't add up, check them` : ", every line adds up"}`,
        });
      } catch (err: any) {
        toast({ title: `Couldn't read ${f.name}`, description: String(err?.message ?? err), variant: "destructive" });
      }
    }
    setImporting(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const view: StockAuditRow | null = (audits.find(a => a.id === auditForView) ?? (latest as StockAuditRow | null)) || null;

  const header = (
    <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="text-muted-foreground" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-primary">Stock &amp; Orders</h1>
          <div className="text-xs text-muted-foreground truncate" data-testid="orders-subtitle">
            {latest ? (usingCounts ? `From your stocktakes · ${periodLabel(latest).split(" – ")[1] ?? ""}` : `Last audit ${periodLabel(latest)} · ${audits.length} ${audits.length === 1 ? "audit" : "audits"}`) : "What to order, from your counts"}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={!!importing} data-testid="button-add-audit">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4 mr-1" />}{importing ? "" : "Add audit"}
        </Button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={e => importFiles(e.target.files)} data-testid="input-audit-file" />
      </div>
      {latest && (
        <div className={`mt-3 grid ${usingCounts ? "grid-cols-2" : "grid-cols-4"} gap-1 rounded-xl border border-border bg-muted/40 p-1`} role="tablist">
          {((usingCounts ? [["order", "Order"], ["all", "All stock"]] : [["order", "Order"], ["updown", "Up & down"], ["all", "All stock"], ["audits", "Audits"]]) as Array<[Tab, string]>).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`h-9 rounded-lg text-xs font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid={`tab-${t}`}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );

  if (isLoading) return <div className="flex flex-col h-full">{header}<div className="p-4 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div></div>;

  if (!latest) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex-1 overflow-auto p-4 pb-24">
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 mb-3 space-y-2" data-testid="orders-counts-hint">
            <div className="text-lg font-bold">Your order list builds from your stocktakes</div>
            <p className="text-sm text-muted-foreground">
              Between two stocktakes StockTap works out what each line sold, adds your deliveries, and tells you what to order, in kegs, cases and boxes, with busy weeks built in.{" "}
              {closedIds.length === 0 ? "Close your first stocktake, then one more, and it's ready." : closedIds.length === 1 ? "You've closed one stocktake. Close one more and it's ready." : "Your closed stocktakes don't share any counted lines yet. Count the same lines next time."}
            </p>
            <Button variant="outline" className="w-full h-11" onClick={() => setLocation("/stocktake")} data-testid="button-go-stocktake">Go to Stocktake</Button>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3 text-center" data-testid="orders-empty">
            <FileUp className="w-10 h-10 mx-auto text-primary" />
            <div className="text-lg font-bold">Use Venners? Add your audit</div>
            <p className="text-sm text-muted-foreground">Pick the audit PDF Venners emails you. StockTap reads every line: what's up and down, what you've got, and what to order. Add older audits too and it learns your busy times.</p>
            <Button className="w-full h-12" onClick={() => fileRef.current?.click()} disabled={!!importing} data-testid="button-add-first-audit">
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reading {importing}</> : "Choose audit PDF"}
            </Button>
          </div>
          <button type="button" onClick={() => setLocation("/reports?tab=order")} className="mt-3 w-full text-left rounded-xl border border-border bg-card p-4" data-testid="link-par-order-guide">
            <div className="font-semibold text-sm">Need an order today?</div>
            <div className="text-xs text-muted-foreground mt-1">Set a par level on each line in the Library and the par-level order guide works from your latest count straight away. It's in Reports, under Order →</div>
          </button>
        </div>
      </div>
    );
  }

  const revs = audits.slice().sort((x, y) => x.period_end.localeCompare(y.period_end)).map(a => ({ a, rpd: revenuePerDay(a) ?? (((a.summary as any)?.usedValue ?? 0) / (a.days || 1)) }));
  const maxRpd = Math.max(1, ...revs.map(r => r.rpd));

  return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 overflow-auto p-4 pb-28 space-y-4">
        {tab === "order" && (
          <>
            <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="cover" className="text-sm font-semibold">Order enough to last</label>
                  <span className="text-lg font-bold tabular-nums" data-testid="text-cover">{cover} days</span>
                </div>
                <input id="cover" type="range" min={3} max={28} value={cover} onChange={e => setCover(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" data-testid="input-cover" />
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">How busy will it be?</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 10, 25, 50].map(v => (
                    <button key={v} onClick={() => setBusy(v)} aria-pressed={busy === v}
                      className={`h-10 rounded-lg border text-sm font-semibold ${busy === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`} data-testid={`busy-${v}`}>
                      {v === 0 ? "Normal" : `+${v}%`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">Base it on</div>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {([["latest", usingCounts ? "Last count" : "Last audit"], ["average", "Year average"], ["busiest", "Busiest time"]] as Array<[string, string]>).map(([id, label]) => (
                    <button key={id} onClick={() => setBasisId(id)} aria-pressed={basisId === id}
                      className={`h-10 rounded-lg border text-xs font-semibold ${basisId === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`} data-testid={`basis-${id}`}>{label}</button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mb-1.5">Or pick a period. {usingCounts ? "Bars are stock used per day, at cost." : "Bars are takings per day."}</div>
                <div className="flex items-end gap-1.5 h-28" data-testid="busy-chart">
                  {revs.map(({ a, rpd }) => {
                    const on = basisId === a.id;
                    const tag = periodTag(a);
                    return (
                      <button key={a.id} onClick={() => setBasisId(a.id)} aria-pressed={on} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end" data-testid={`period-${a.id}`}>
                        <span className="text-[10px] tabular-nums text-muted-foreground">£{Math.round(rpd).toLocaleString("en-GB")}</span>
                        <div className={`w-full rounded-t-md ${on ? "bg-primary" : "bg-primary/25"}`} style={{ height: `${Math.max(8, (rpd / maxRpd) * 64)}px` }} />
                        <span className={`text-[10px] leading-tight text-center ${on ? "font-bold text-primary" : "text-muted-foreground"}`}>{tag ?? periodLabel(a).split(" – ")[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="text-stock-basis">
                Stock now = your {new Date(latest.period_end + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} count, less {sinceDays} {sinceDays === 1 ? "day's" : "days'"} sales{deliveredLines ? `, plus ${deliveredLines} delivered ${deliveredLines === 1 ? "line" : "lines"} added since` : ""}. Delisted lines are left out.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 sticky top-0">
              <div className="text-sm"><span className="font-bold tabular-nums" data-testid="text-order-lines">{toOrder.length}</span> <span className="text-muted-foreground">lines to order</span></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copy} data-testid="button-copy-order"><ClipboardCopy className="w-4 h-4 mr-1" /> Copy</Button>
                <Button size="sm" onClick={share} data-testid="button-share-order"><Share2 className="w-4 h-4 mr-1" /> Share</Button>
              </div>
            </div>

            {([["out", "Out now", "Selling lines with nothing left", "text-[#E5544B]"], ["low", "Running low", "Will run out within a week", "text-[#B07A1F]"], ["top", "Top up", `Enough for now, not for ${cover} days`, "text-primary"]] as const).map(([g, title, sub, cls]) => {
              const rows = result.rows.filter(r => r.group === g);
              if (!rows.length) return null;
              return (
                <section key={g} className="space-y-2" data-testid={`order-group-${g}`}>
                  <div className="flex items-baseline gap-2"><h2 className={`text-base font-bold ${cls}`}>{title}</h2><span className="text-xs text-muted-foreground">{rows.length} · {sub}</span></div>
                  {rows.map(r => <OrderCard key={r.key} r={r} qty={qtyOf(r)} setQty={q => setAdjust(a => ({ ...a, [r.key]: Math.max(0, q) }))} order={sorted} basisId={basisId} />)}
                </section>
              );
            })}
            {!result.rows.length && <p className="text-sm text-muted-foreground text-center py-6">Nothing to order for {cover} days.</p>}
            {result.covered.length > 0 && (
              <details className="rounded-xl border border-border bg-card p-3" data-testid="order-covered">
                <summary className="text-sm font-semibold cursor-pointer">Enough in for {cover} days ({result.covered.length})</summary>
                <p className="text-xs text-muted-foreground mt-2">These sell, but you've got enough for now, so nothing to order this time.</p>
                <ul className="mt-2 space-y-1.5 text-sm">{result.covered.map(c => (
                  <li key={c.key} className="flex justify-between gap-2" data-testid={`covered-${c.key}`}>
                    <span className="min-w-0">{c.name}{c.delivered > 0 && <span className="block text-[10px] text-muted-foreground">incl. {formatBase(c.delivered, c.base)} delivered</span>}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0 text-right">{formatBase(Math.max(0, c.now), c.base)}{c.base === "units" ? " units" : ""}<span className="block text-[10px]">lasts {Math.floor(c.daysLeft)} days</span></span>
                  </li>
                ))}</ul>
              </details>
            )}
            {result.slow.length > 0 && (
              <details className="rounded-xl border border-border bg-card p-3">
                <summary className="text-sm font-semibold cursor-pointer">Out, but barely sells ({result.slow.length})</summary>
                <p className="text-xs text-muted-foreground mt-2">Sells less than one pack a month and none left. Your call.</p>
                <ul className="mt-2 space-y-1 text-sm">{result.slow.map(s => <li key={s.key} className="flex justify-between gap-2"><span className="min-w-0">{s.name}</span><span className="text-muted-foreground tabular-nums shrink-0">{perWeek(s.soldPerWeek / 7, s.base)} a week</span></li>)}</ul>
              </details>
            )}
          </>
        )}

        {tab === "updown" && view && <UpDown audit={view} audits={audits} setAudit={setAuditForView} />}
        {tab === "all" && view && <AllStock audit={view} audits={audits} setAudit={setAuditForView} />}
        {tab === "audits" && (
          <div className="space-y-3">
            {[...audits].reverse().map(a => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3" data-testid={`audit-${a.period_end}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{periodTag(a) ? `${periodTag(a)} · ` : ""}{periodLabel(a)} {a.period_end.slice(0, 4)}</div>
                  <div className="text-xs text-muted-foreground">{a.days} days · {a.lines.length} lines · £{Math.round(revenuePerDay(a) ?? 0).toLocaleString("en-GB")} a day{a.summary?.result != null && <> · <span className="whitespace-nowrap">result {money(a.summary.result, true)}</span></>}</div>
                </div>
                <button className="text-muted-foreground p-2" aria-label="Remove audit" onClick={async () => {
                  if (!venue?.id) return;
                  try { await deleteAudit.mutateAsync({ id: a.id, venueId: venue.id }); toast({ title: "Audit removed" }); }
                  catch (err: any) { toast({ title: "Couldn't remove it", description: String(err?.message ?? err), variant: "destructive" }); }
                }} data-testid={`button-delete-audit-${a.period_end}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={!!importing}>
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reading {importing}</> : <><FileUp className="w-4 h-4 mr-2" /> Add another audit PDF</>}
            </Button>
            <p className="text-xs text-muted-foreground">Older audits teach the order list your busy times: Christmas, big match weeks, summer. Adding the same audit twice just updates it.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ r, qty, setQty, order, basisId }: { r: OrderRow; qty: number; setQty: (n: number) => void; order: StockAuditRow[] | any[]; basisId: string }) {
  const maxRate = Math.max(0.0001, ...r.pattern.rates.map(x => x ?? 0));
  return (
    <article className={`rounded-xl border bg-card p-3 space-y-2 border-l-4 ${r.group === "out" ? "border-l-[#E5544B]" : r.group === "low" ? "border-l-[#E0A343]" : "border-l-border"} border-border`} data-testid={`order-row-${r.key}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-semibold text-sm leading-snug">{r.name}</div><div className="text-[11px] text-muted-foreground">{r.category}</div></div>
        <div className="flex items-end gap-0.5 h-7 shrink-0" title="Sales per day in each audit period" aria-label="Sales by period">
          {r.pattern.rates.map((x, i) => (
            <div key={i} className={`w-1.5 rounded-sm ${order[i]?.id === basisId ? "bg-primary" : "bg-primary/30"}`} style={{ height: `${Math.max(2, ((x ?? 0) / maxRate) * 28)}px` }} />
          ))}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-muted-foreground">In stock now</dt><dd className="font-semibold tabular-nums">{r.now <= 0.001 ? <span className="text-[#E5544B]">None</span> : `${formatBase(r.now, r.base)}${r.base === "units" ? " units" : ""}`}</dd>{r.delivered > 0 && <dd className="text-[10px] text-muted-foreground">incl. {formatBase(r.delivered, r.base)} delivered</dd>}</div>
        <div><dt className="text-muted-foreground">Sells a week</dt><dd className="font-semibold tabular-nums">{perWeek(r.rate, r.base)}</dd></div>
        <div><dt className="text-muted-foreground">Lasts</dt><dd className="font-semibold tabular-nums">{r.now <= 0.001 ? <span className="text-[#E5544B]">Out</span> : r.daysLeft < 1 ? "under a day" : `${Math.floor(r.daysLeft)} ${Math.floor(r.daysLeft) === 1 ? "day" : "days"}`}</dd></div>
      </dl>
      <div className="flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
        <div className="text-xs text-muted-foreground">{qty !== r.suggested ? `Suggested ${packLabel(r.pack, r.suggested)}` : "Order"}</div>
        <div className="flex items-center gap-2">
          <button className="h-9 w-9 rounded-lg border border-border flex items-center justify-center" onClick={() => setQty(qty - 1)} aria-label="One less" data-testid={`qty-minus-${r.key}`}><Minus className="w-4 h-4" /></button>
          <div className="min-w-[7.5rem] text-center font-bold text-primary tabular-nums" data-testid={`qty-${r.key}`}>{packLabel(r.pack, qty)}</div>
          <button className="h-9 w-9 rounded-lg border border-border flex items-center justify-center" onClick={() => setQty(qty + 1)} aria-label="One more" data-testid={`qty-plus-${r.key}`}><Plus className="w-4 h-4" /></button>
        </div>
      </div>
    </article>
  );
}

function AuditPicker({ audit, audits, setAudit }: { audit: StockAuditRow; audits: StockAuditRow[]; setAudit: (id: string) => void }) {
  return (
    <select value={audit.id} onChange={e => setAudit(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm" data-testid="select-audit">
      {[...audits].reverse().map(a => <option key={a.id} value={a.id}>{periodTag(a) ? `${periodTag(a)} · ` : ""}{periodLabel(a)} {a.period_end.slice(0, 4)}</option>)}
    </select>
  );
}

export function UpDown({ audit, audits, setAudit }: { audit: StockAuditRow; audits: StockAuditRow[]; setAudit: (id: string) => void }) {
  const s = audit.summary ?? ({} as any);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    audit.lines.forEach(l => m.set(l.category, (m.get(l.category) ?? 0) + l.retail));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [audit]);
  const max = Math.max(1, ...cats.map(c => Math.abs(c[1])));
  const pairs = offsettingPairs(audit.lines);
  const losses = [...audit.lines].filter(l => l.retail < 0).sort((a, b) => a.retail - b.retail).slice(0, 10);
  const gains = [...audit.lines].filter(l => l.retail > 0).sort((a, b) => b.retail - a.retail).slice(0, 10);
  const tile = (label: string, value: string, sub: string, cls = "", id?: string) => (
    <div className="rounded-xl border border-border bg-card p-3"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`} data-testid={id}>{value}</div><div className="text-[11px] text-muted-foreground">{sub}</div></div>
  );
  return (
    <div className="space-y-4">
      <AuditPicker audit={audit} audits={audits} setAudit={setAudit} />
      <div className="grid grid-cols-2 gap-2">
        {tile("Result", s.result != null ? money(s.result, true) : "–", s.resultPct != null ? `${(s.result ?? 0) >= 0 ? "Up" : "Down"} · ${s.resultPct}% of takings` : "", (s.result ?? 0) >= 0 ? "text-[#2E8A5A]" : "text-[#E5544B]", "text-result")}
        {tile("Gross profit", s.gp != null ? `${s.gp}%` : "–", s.optimumGp != null ? `Optimum ${s.optimumGp}%` : "")}
        {tile("Closing stock", s.closingStock != null ? money(s.closingStock) : "–", "At cost")}
        {tile("Takings", s.revenue != null ? money(s.revenue) : "–", `£${Math.round(revenuePerDay(audit) ?? 0).toLocaleString("en-GB")} a day`)}
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-sm font-semibold mb-1">By category</div>
        <div className="text-xs text-muted-foreground mb-2">Right is up (more stock than the till says), left is down.</div>
        <div className="space-y-1.5" data-testid="updown-categories">
          {cats.map(([c, v]) => {
            const w = (Math.abs(v) / max) * 42;
            const inside = Math.abs(v) / max > 0.55;
            return (
              <div key={c} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs">
                <span className="truncate">{c}</span>
                <div className="relative h-5">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                  <div className={`absolute top-0.5 h-4 rounded ${v >= 0 ? "bg-[#3FAE74]" : "bg-[#E5544B]"}`} style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}>
                    {inside && <span className={`absolute inset-0 flex items-center px-1 text-[10px] font-semibold text-white whitespace-nowrap tabular-nums ${v >= 0 ? "justify-end" : "justify-start"}`}>{money(v, true)}</span>}
                  </div>
                  {!inside && <span className="absolute top-0.5 text-[10px] tabular-nums text-muted-foreground whitespace-nowrap" style={v >= 0 ? { left: `calc(50% + ${w}% + 4px)` } : { right: `calc(50% + ${w}% + 4px)` }}>{money(v, true)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {(pairs.length > 0 || (s.adjustments?.length ?? 0) > 0) && (
        <div className="space-y-2">
          {pairs.map(p => (
            <div key={p.down.name} className="rounded-xl border border-[#E0A343]/50 bg-[#E0A343]/10 p-3 text-sm" data-testid="insight-offset">
              <div className="font-semibold">{p.down.name.replace(/^(Postmix|Lager|Cider) /, "")} down, {p.ups.map(u => u.name.replace(/^(Postmix|Lager|Cider) /, "")).join(" and ")} up</div>
              <p className="text-xs mt-1">{p.down.name} is {formatBase(p.down.variance, p.down.base, true)} ({money(p.down.retail, true)}) while {p.ups.map(u => `${u.name} is ${formatBase(u.variance, u.base, true)} (${money(u.retail, true)})`).join(" and ")}. If one is poured but rung through the till as the other, it looks exactly like this. Worth checking the till buttons.</p>
            </div>
          ))}
          {(s.adjustments?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="font-semibold">Adjustments{s.wastage != null ? ` and wastage` : ""}</div>
              <p className="text-xs mt-1 text-muted-foreground">{s.adjustments.map((a: any) => `${a.product} ${a.qty} (${money(a.value, true)})`).join(", ")}{s.wastage != null ? `. Wastage through Beanstore ${money(s.wastage, true)}.` : ""}</p>
            </div>
          )}
        </div>
      )}
      {[["Biggest losses", losses], ["Biggest gains", gains]].map(([title, list]) => (
        <div key={title as string} className="rounded-xl border border-border bg-card p-3">
          <div className="text-sm font-semibold mb-2">{title as string}</div>
          <ul className="divide-y divide-border">
            {(list as AuditLine[]).map(l => (
              <li key={l.name} className="py-2 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0"><div className="truncate">{l.name}</div><div className="text-[11px] text-muted-foreground">{l.category}</div></div>
                <div className="text-right shrink-0 tabular-nums"><div className={l.retail >= 0 ? "text-[#2E8A5A] font-semibold" : "text-[#E5544B] font-semibold"}>{money(l.retail, true)}</div><div className="text-[11px] text-muted-foreground">{formatBase(l.variance, l.base, true)}</div></div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AllStock({ audit, audits, setAudit }: { audit: StockAuditRow; audits: StockAuditRow[]; setAudit: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [showAll, setShowAll] = useState(false);
  const cats = [...new Set(audit.lines.map(l => l.category))].sort();
  const list = audit.lines.filter(l => (!cat || l.category === cat) && (!q || l.name.toLowerCase().includes(q.toLowerCase())) && (showAll || l.open || l.del || l.sold || l.counted || l.variance));
  const z = (x: number, b: AuditLine["base"]) => (Math.abs(x) < 0.0005 ? "–" : formatBase(x, b));
  return (
    <div className="space-y-3">
      <AuditPicker audit={audit} audits={audits} setAudit={setAudit} />
      <div className="grid grid-cols-2 gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a product" className="h-10" data-testid="input-allstock-search" />
        <select value={cat} onChange={e => setCat(e.target.value)} className="h-10 rounded-lg border border-border bg-card px-2 text-sm" data-testid="select-allstock-category">
          <option value="">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show lines with no stock or movement</label>
      <div className="space-y-3" data-testid="allstock-table">
        {cats.filter(c => !cat || c === cat).map(c => {
          const rows = list.filter(l => l.category === c);
          if (!rows.length) return null;
          const tot = rows.reduce((s, l) => s + l.retail, 0);
          return (
            <div key={c} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/60 text-sm font-bold">
                <span>{c}</span>
                <span className={`tabular-nums ${tot >= 0 ? "text-[#2E8A5A]" : "text-[#E5544B]"}`}>{money(tot, true)}</span>
              </div>
              <ul className="divide-y divide-border/60">
                {rows.map(l => (
                  <li key={l.name} className="px-3 py-2.5" data-testid="allstock-row">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-sm font-medium leading-snug">{l.name}{l.delist && <span className="ml-1 text-[9px] px-1 rounded bg-[#E0A343]/20 text-[#B07A1F] align-middle">DELIST</span>}</div>
                      <div className="text-right shrink-0 tabular-nums leading-tight">
                        <div className={`text-sm font-semibold ${l.retail > 0 ? "text-[#2E8A5A]" : l.retail < 0 ? "text-[#E5544B]" : "text-muted-foreground"}`}>{l.retail ? money(l.retail, true) : "–"}</div>
                        <div className="text-[11px] text-muted-foreground">{Math.abs(l.variance) < 0.0005 ? "level" : formatBase(l.variance, l.base, true)}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 grid grid-cols-5 gap-1 text-[10px] leading-tight">
                      {([["Opening", l.open], ["In", l.del], ["Sold", l.sold], ["Should be", l.expected], ["Counted", l.counted]] as Array<[string, number]>).map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <div className="text-muted-foreground">{k}</div>
                          <div className={`tabular-nums truncate ${k === "Counted" ? "font-semibold" : ""}`}>{z(v, l.base)}</div>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
