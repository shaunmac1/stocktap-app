import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Camera, Check, ClipboardPaste, Loader2, PackagePlus, Search, Truck, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAddProduct, useProducts, useUpdateProduct } from "@/hooks/api";
import { useRecordManualDelivery } from "@/hooks/useDeliveries";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  parseDeliveryNote, readPack, matchLine, matchStrength, lineAmount, lineReference, deliveredAtIso,
  deliveryRefLabel, draftProductFromLine, nameTokens,
  type DeliveryNote, type DeliveryNoteLine, type PackInfo, type MatchableProduct, type LineAmount, type MatchStrength,
} from "@/lib/delivery-note";

type RowState = {
  line: DeliveryNoteLine;
  pack: PackInfo;
  ref: string;
  product: MatchableProduct | null;
  strength: MatchStrength;
  bySku: boolean;
  amount: LineAmount | null;
  qty: string;
  include: boolean;
  already: boolean;
  picking: boolean;
};

function buildRow(line: DeliveryNoteLine, note: DeliveryNote, products: MatchableProduct[], venueId: string): RowState {
  const pack = readPack(line.description);
  const m = matchLine(line, pack, products);
  const strength = matchStrength(m);
  const amount = m.product ? lineAmount(line, pack, m.product) : null;
  return {
    line, pack, ref: lineReference(venueId, note, line),
    product: m.product, strength, bySku: m.bySku, amount,
    qty: amount ? String(amount.purchaseQty) : "",
    include: strength !== "none", already: false, picking: false,
  };
}

function withProduct(row: RowState, p: MatchableProduct): RowState {
  const amount = lineAmount(row.line, row.pack, p);
  return { ...row, product: p, strength: "sure", amount, qty: String(amount.purchaseQty), include: true, picking: false };
}

function unitWord(p: MatchableProduct): string {
  const m = p.counting_method ?? "";
  if (["keg_weight", "dipstick", "tenths_pints"].includes(m) || (p.category ?? "").startsWith("draught_")) return p.category === "draught_ale" ? "casks/kegs" : "kegs";
  if (m === "litre") return p.container_l ? `× ${p.container_l}L box` : "litre bottles";
  if (m === "dozen") return `packs of ${p.pack_size ?? 12}`;
  if (m === "each" || m === "count") return "units";
  return "bottles";
}

const SAMPLE_HINT = "Open the delivery email, select everything (Ctrl+A or long-press → Select all), copy, then paste it here.";

export default function Delivery() {
  const { venue, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: productsRaw } = useProducts(venue?.id);
  const products = useMemo(() => (productsRaw ?? []) as unknown as MatchableProduct[], [productsRaw]);
  const addProduct = useAddProduct();
  const updateProduct = useUpdateProduct();
  const recordDelivery = useRecordManualDelivery();

  const [text, setText] = useState("");
  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ added: number; skipped: number; already: number; ref: string | null } | null>(null);

  const read = async () => {
    if (!venue?.id) return;
    const n = parseDeliveryNote(text);
    if (n.lines.length === 0) {
      toast({ title: "No delivery lines found", description: "Copy the whole email, including the table of products and quantities.", variant: "destructive" });
      return;
    }
    let built = n.lines.map(l => buildRow(l, n, products, venue.id));
    // Lines already added from this same email
    const { data } = await supabase.from("deliveries").select("client_reference" as "*").eq("venue_id", venue.id).in("client_reference" as never, built.map(r => r.ref) as never);
    const seen = new Set(((data ?? []) as unknown as Array<{ client_reference: string | null }>).map(d => d.client_reference));
    built = built.map(r => seen.has(r.ref) ? { ...r, already: true, include: false } : r);
    setNote(n);
    setRows(built);
    window.scrollTo({ top: 0 });
  };

  const setRow = (i: number, patch: Partial<RowState> | ((r: RowState) => RowState)) =>
    setRows(rs => rs.map((r, k) => k === i ? (typeof patch === "function" ? patch(r) : { ...r, ...patch }) : r));

  const addToLibrary = async (i: number) => {
    const row = rows[i];
    if (!venue?.id) return;
    const d = draftProductFromLine(row.line, row.pack);
    try {
      const created = await addProduct.mutateAsync({
        venue_id: venue.id, name: d.name, type: d.type as never, unit: d.unit, category: d.category as never,
        counting_method: d.counting_method as never, size_ml: d.size_ml, container_l: d.container_l,
        container_type: d.container_type as never, sku: d.sku, density: 1,
      } as never);
      setRow(i, r => withProduct(r, created as unknown as MatchableProduct));
      toast({ title: "Added to your library", description: d.name });
    } catch (err: any) {
      toast({ title: "Couldn't add it", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  const searchResults = (q: string) => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [] as MatchableProduct[];
    const qt = nameTokens(q);
    return products
      .map(p => {
        const name = p.name.toLowerCase();
        const pt = new Set(nameTokens(p.name));
        const s = (name.includes(t) ? 2 : 0) + qt.filter(x => pt.has(x)).length;
        return { p, s };
      })
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
      .slice(0, 6)
      .map(x => x.p);
  };

  const toAdd = rows.filter(r => r.include && r.product && !r.already && parseFloat(r.qty) > 0);
  const counts = {
    sure: rows.filter(r => !r.already && r.product && r.strength === "sure").length,
    check: rows.filter(r => !r.already && r.product && r.strength === "check").length,
    none: rows.filter(r => !r.already && !r.product).length,
    already: rows.filter(r => r.already).length,
  };

  const save = async () => {
    if (!venue?.id || !user?.id || !note) return;
    setSaving(true); setProgress(0);
    const refLabel = deliveryRefLabel(note);
    const notes = [note.salesOrder ? `Sales order ${note.salesOrder}` : null, note.po ? `PO ${note.po}` : null, "Pasted from delivery email"].filter(Boolean).join(" · ");
    let added = 0, already = 0;
    try {
      for (const r of toAdd) {
        const p = r.product!;
        const purchaseQty = parseFloat(r.qty);
        const scaled = r.amount ? r.amount.quantityMl * (purchaseQty / (r.amount.purchaseQty || purchaseQty)) : 0;
        const result = await recordDelivery.mutateAsync({
          p_venue_id: venue.id,
          p_product_id: p.id,
          p_purchase_quantity: purchaseQty,
          p_quantity_ml: Math.round(scaled * 1000) / 1000,
          p_unit_cost_pence: Math.max(0, Math.round((p.cost_price ?? 0) * 100)),
          p_client_reference: r.ref,
          p_invoice_ref: refLabel,
          p_supplier: note.supplier,
          p_to_location_id: null,
          p_notes: notes,
          p_delivered_at: deliveredAtIso(note),
        });
        if (result.created) added++; else already++;
        // Remember the supplier's code so this line matches exactly next time.
        const code = r.line.codes[1] ?? r.line.codes[0];
        if (code && !p.sku) {
          try { await updateProduct.mutateAsync({ id: p.id, venue_id: venue.id, sku: code } as never); } catch { /* not essential */ }
        }
        setProgress(n => n + 1);
      }
      queryClient.invalidateQueries({ queryKey: ["deliveries", venue.id] });
      queryClient.invalidateQueries({ queryKey: ["movements", venue.id] });
      setDone({ added, already: already + counts.already, skipped: rows.length - toAdd.length - counts.already, ref: refLabel });
      window.scrollTo({ top: 0 });
    } catch (err: any) {
      toast({ title: "Stopped part way", description: `${added} lines saved. ${String(err?.message ?? err)} Paste again to finish, nothing will be added twice.`, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setText(""); setNote(null); setRows([]); setDone(null); setProgress(0); };

  const header = (
    <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
      <button onClick={() => (note && !done ? reset() : setLocation("/"))} className="text-muted-foreground" aria-label="Back" data-testid="button-delivery-back">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-primary">Add a delivery</h1>
        <div className="text-xs text-muted-foreground truncate">
          {note ? [note.supplier, note.date ? new Date(`${note.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : null, deliveryRefLabel(note)].filter(Boolean).join(" · ") : "Paste the supplier's delivery email"}
        </div>
      </div>
    </div>
  );

  if (done) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex-1 overflow-auto p-4 pb-24 space-y-4">
          <div className="rounded-2xl border border-[#3FAE74]/40 bg-[#3FAE74]/10 p-5 text-center space-y-2" data-testid="delivery-done">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#3FAE74] text-white flex items-center justify-center"><Check className="w-6 h-6" /></div>
            <div className="text-lg font-bold" data-testid="text-delivery-added">{done.added} {done.added === 1 ? "line" : "lines"} added</div>
            <div className="text-sm text-muted-foreground">
              {done.ref ?? "Delivery"}{done.already ? ` · ${done.already} already in` : ""}{done.skipped ? ` · ${done.skipped} skipped` : ""}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={reset} data-testid="button-paste-another">Paste another</Button>
            <Link href="/ledger"><Button className="w-full" data-testid="button-see-movements">See stock movements</Button></Link>
          </div>
          <Link href="/orders" className="block"><Button variant="secondary" className="w-full" data-testid="button-see-orders">See what to order now</Button></Link>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex-1 overflow-auto p-4 pb-24 space-y-4">
          <Link href="/invoice-scan" className="block">
            <Button className="w-full h-14 text-base font-bold" data-testid="button-delivery-photo"><Camera className="w-5 h-5 mr-2" /> Photograph the delivery note</Button>
          </Link>
          <p className="text-xs text-center text-muted-foreground">or</p>
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold"><ClipboardPaste className="w-5 h-5 text-primary" /> Paste the delivery email</div>
            <p className="text-sm text-muted-foreground">{SAMPLE_HINT} StockTap reads the products and quantities and matches them to your library. You check it before anything is saved.</p>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"Today's delivery\nDate 28/09/2026\n318  27763  Strongbow Cider 11g Keg  2\n…"}
              className="min-h-[220px] font-mono text-xs"
              data-testid="input-delivery-text"
            />
            <Button className="w-full h-12 text-base font-bold" disabled={text.trim().length < 10 || !products.length} onClick={read} data-testid="button-read-delivery">
              <Truck className="w-5 h-5 mr-2" /> Read delivery
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const pill = (r: RowState) => {
    if (r.already) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Already added</span>;
    if (!r.product) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#E5544B]/15 text-[#E5544B]">Not in library</span>;
    if (!r.include) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Skipped</span>;
    if (r.strength === "check") return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#E0A343]/20 text-[#B07A1F]">Check</span>;
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#3FAE74]/15 text-[#2E8A5A]">Matched</span>;
  };

  return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 overflow-auto p-4 pb-40 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center" data-testid="delivery-summary">
          <div className="rounded-xl border border-border bg-card p-2"><div className="text-xl font-bold tabular-nums">{counts.sure}</div><div className="text-[11px] text-muted-foreground">Matched</div></div>
          <div className="rounded-xl border border-border bg-card p-2"><div className="text-xl font-bold tabular-nums text-[#B07A1F]">{counts.check}</div><div className="text-[11px] text-muted-foreground">To check</div></div>
          <div className="rounded-xl border border-border bg-card p-2"><div className="text-xl font-bold tabular-nums text-[#E5544B]">{counts.none}</div><div className="text-[11px] text-muted-foreground">Not in library</div></div>
        </div>
        {counts.already > 0 && <p className="text-xs text-muted-foreground">{counts.already} {counts.already === 1 ? "line was" : "lines were"} already added from this email and won't be added again.</p>}

        {rows.map((r, i) => (
          <div key={r.ref} className={`rounded-xl border bg-card p-3 space-y-2 ${r.already || (!r.include && r.product) ? "opacity-60" : ""} ${!r.product && !r.already ? "border-[#E5544B]/40" : r.strength === "check" && r.include ? "border-[#E0A343]/50" : "border-border"}`} data-testid={`delivery-line-${i}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-snug">{r.line.description}</div>
                <div className="text-xs text-muted-foreground">Qty {r.line.qty}{r.pack.perQty > 1 ? ` × ${r.pack.label}` : r.pack.kind !== "unit" ? ` × ${r.pack.label}` : ""}</div>
              </div>
              {pill(r)}
            </div>

            {r.product && !r.picking && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
                <div className="min-w-0 text-sm"><span className="text-muted-foreground">→ </span><span className="font-medium" data-testid={`delivery-line-${i}-product`}>{r.product.name}</span></div>
                {!r.already && <button className="text-xs font-semibold text-primary underline shrink-0" onClick={() => { setSearch(""); setRow(i, { picking: true }); }} data-testid={`button-change-product-${i}`}>Change</button>}
              </div>
            )}

            {r.picking && (
              <div className="space-y-2 rounded-lg border border-border p-2">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a product in your library" className="h-9" data-testid={`input-pick-product-${i}`} />
                  <button onClick={() => setRow(i, { picking: false })} aria-label="Cancel" className="text-muted-foreground"><X className="w-4 h-4" /></button>
                </div>
                {searchResults(search).map(p => (
                  <button key={p.id} className="w-full text-left text-sm px-2 py-2 rounded-md hover:bg-muted border border-transparent hover:border-border" onClick={() => setRow(i, row => withProduct(row, p))} data-testid={`pick-result-${p.id}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {r.product && r.include && !r.already && !r.picking && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Adds</span>
                <Input type="number" inputMode="decimal" step="any" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} className="h-9 w-24 tabular-nums" data-testid={`input-line-qty-${i}`} />
                <span className="text-sm text-muted-foreground">{unitWord(r.product)}</span>
              </div>
            )}
            {r.amount?.warning && r.include && <p className="text-xs text-[#B07A1F]">{r.amount.warning}. Check it's the right product.</p>}

            {!r.already && !r.picking && (
              <div className="flex flex-wrap gap-2">
                {!r.product && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setSearch(""); setRow(i, { picking: true }); }} data-testid={`button-pick-${i}`}><Search className="w-4 h-4 mr-1" /> Pick a product</Button>
                    <Button size="sm" variant="outline" onClick={() => addToLibrary(i)} disabled={addProduct.isPending} data-testid={`button-add-to-library-${i}`}><PackagePlus className="w-4 h-4 mr-1" /> Add to library</Button>
                  </>
                )}
                {r.product && (
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setRow(i, { include: !r.include })} data-testid={`button-skip-${i}`}>
                    {r.include ? "Skip this line" : "Include this line"}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="fixed left-0 right-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <Button className="w-full h-12 text-base font-bold" disabled={saving || toAdd.length === 0} onClick={save} data-testid="button-save-delivery">
          {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving {progress} of {toAdd.length}</> : <>Add delivery · {toAdd.length} {toAdd.length === 1 ? "line" : "lines"}</>}
        </Button>
      </div>
    </div>
  );
}
