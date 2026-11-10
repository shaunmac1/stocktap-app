import React from "react";
import { Link, useLocation } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileSearch,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useUpdateProduct } from "@/hooks/api";
import { prepareImage } from "@/lib/image";
import { isDraughtProduct, formatGauge } from "@/lib/draught-gauge";
import { containerSizeLabel } from "@/lib/container-sizes";
import {
  useCommitDeliveryDocument,
  useDeliveryDocumentLines,
  useDeliveryDocuments,
  useExtractDeliveryDocument,
  useUpdateDeliveryDocument,
  useUpdateDeliveryDocumentLine,
  useUploadDeliveryDocument,
  type DeliveryDocumentLineRow,
  type DeliveryDocumentRow,
} from "@/hooks/useInvoiceDocuments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/calculations";
import {
  invoiceReviewProgress,
  penceToPoundsInput,
  poundsInputToPence,
} from "@/lib/invoice-review";

function documentStatusClasses(status: DeliveryDocumentRow["status"]): string {
  if (status === "committed") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (status === "failed") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (status === "review") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
}

function humanStatus(status: DeliveryDocumentRow["status"]): string {
  return {
    uploaded: "Ready to scan",
    extracting: "Scanning",
    review: "To check",
    committing: "Saving",
    committed: "Added to stock",
    failed: "Scan failed",
  }[status];
}

function confidenceText(confidence: number | null): string {
  if (confidence == null) return "No automatic match";
  if (confidence >= 0.85) return `${Math.round(confidence * 100)}% strong match`;
  if (confidence >= 0.55) return `${Math.round(confidence * 100)}% possible match`;
  return `${Math.round(confidence * 100)}% weak match`;
}

type ScanProduct = { id: string; name: string; category?: string | null; counting_method?: string | null; container_l?: number | null; container_type?: string | null; pour_price?: number | null; hidden_at?: string | null };

/** "3 × 50L · 11 gal keg = 33 gal 0 pt" for draught, "24 × Coke 330ml" for the rest. */
function deliveredText(product: ScanProduct | undefined, qty: number): string {
  if (!product) return `${qty} delivered`;
  if (isDraughtProduct(product) && product.container_l) {
    const word = product.container_type === "cask" || product.counting_method === "dipstick" ? "cask" : "keg";
    const pints = (qty * Number(product.container_l) * 1000) / 568.261;
    return `${qty} × ${containerSizeLabel(Number(product.container_l), word)} = ${formatGauge(pints)}`;
  }
  return `${qty} delivered`;
}

function InvoiceLineEditor({
  line,
  products,
  venueId,
  locked,
}: {
  line: DeliveryDocumentLineRow;
  products: ScanProduct[];
  venueId: string;
  locked: boolean;
}) {
  const updateLine = useUpdateDeliveryDocumentLine();
  const updateProduct = useUpdateProduct();
  const { toast } = useToast();
  const [productId, setProductId] = React.useState(line.matched_product_id ?? "none");
  const [quantity, setQuantity] = React.useState(String(line.purchase_quantity));
  const [unitCost, setUnitCost] = React.useState(penceToPoundsInput(line.unit_cost_pence));
  const product = products.find((p) => p.id === productId);
  const [sellPrice, setSellPrice] = React.useState(product?.pour_price != null ? String(product.pour_price) : "");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setProductId(line.matched_product_id ?? "none");
    setQuantity(String(line.purchase_quantity));
    setUnitCost(penceToPoundsInput(line.unit_cost_pence));
  }, [line.id, line.matched_product_id, line.purchase_quantity, line.unit_cost_pence]);
  React.useEffect(() => {
    setSellPrice(product?.pour_price != null ? String(product.pour_price) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, product?.pour_price]);

  const draught = !!product && isDraughtProduct(product);
  const unitWord = draught ? (product?.container_type === "cask" || product?.counting_method === "dipstick" ? "cask" : "keg") : "unit";
  const needsProduct = line.review_status === "unmatched";
  const showForm = !locked && line.review_status !== "ignored" && (open || needsProduct);

  const save = async (nextStatus: DeliveryDocumentLineRow["review_status"]) => {
    const parsedQuantity = Number(quantity);
    if (nextStatus !== "ignored" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      toast({ title: "How many came?", description: "Enter a quantity greater than zero.", variant: "destructive" });
      return;
    }
    if (nextStatus === "accepted" && productId === "none") {
      toast({ title: "Pick the product", description: "Choose which of your products this line is, or skip it.", variant: "destructive" });
      return;
    }
    try {
      // No price on the note is fine: the delivery still goes onto stock, valued at £0 until a cost is added.
      const costPence = poundsInputToPence(unitCost) ?? (nextStatus === "accepted" ? 0 : null);
      await updateLine.mutateAsync({
        id: line.id,
        documentId: line.document_id,
        matched_product_id: productId === "none" ? null : productId,
        purchase_quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : line.purchase_quantity,
        unit_cost_pence: costPence,
        line_total_pence: null,
        review_status: nextStatus,
      });
      const sell = sellPrice.trim() === "" ? null : Number(sellPrice);
      if (nextStatus === "accepted" && product && sell != null && Number.isFinite(sell) && sell >= 0 && sell !== Number(product.pour_price ?? NaN)) {
        await updateProduct.mutateAsync({ id: product.id, venue_id: venueId, pour_price: sell, pour_price_estimated: false } as any);
      }
      setOpen(false);
    } catch (error: any) {
      toast({ title: "Could not save that line", description: error.message, variant: "destructive" });
    }
  };

  const pillClass = line.review_status === "accepted" ? "bg-green-100 text-green-800" : line.review_status === "ignored" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800";
  const pillText = line.review_status === "accepted" ? (locked ? "Added" : "Accepted") : line.review_status === "ignored" ? "Skipped" : "Pick product";

  return (
    <Card className={line.review_status === "ignored" ? "opacity-60" : ""} data-testid={`invoice-line-${line.id}`}>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{product?.name ?? line.raw_description}</div>
            <div className="text-xs text-muted-foreground mt-0.5" data-testid={`invoice-line-qty-${line.id}`}>
              {deliveredText(product, Number(line.purchase_quantity))}
              {line.unit_cost_pence ? ` · ${formatGBP(line.unit_cost_pence / 100)} each` : line.review_status === "accepted" ? " · no price yet" : ""}
            </div>
            {product && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">On the note: {line.raw_description}</div>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge className={pillClass}>{pillText}</Badge>
            {!locked && !needsProduct && (
              <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => (line.review_status === "ignored" ? save("unmatched") : setOpen((v) => !v))} data-testid={`button-edit-line-${line.id}`}>
                {line.review_status === "ignored" ? "Bring back" : open ? "Close" : "Change / prices"}
              </button>
            )}
          </div>
        </div>

        {showForm && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Which of your products is this?</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="mt-1" data-testid={`select-invoice-product-${line.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not picked yet</SelectItem>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">How many</Label>
                <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 tabular-nums" data-testid={`input-line-qty-${line.id}`} />
              </div>
              <div>
                <Label className="text-xs">Cost £ per {unitWord}</Label>
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="mt-1 tabular-nums" data-testid={`input-line-cost-${line.id}`} />
              </div>
              <div>
                <Label className="text-xs">Sell £ per {draught ? "pint" : "serve"}</Label>
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={sellPrice} onChange={(event) => setSellPrice(event.target.value)} className="mt-1 tabular-nums" disabled={!product} data-testid={`input-line-sell-${line.id}`} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Cost and sell price are saved on the product for next time. Special prices (happy hour, offers) are set in <Link href="/settings" className="underline">Settings › Special offers</Link>.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => save("ignored")} disabled={updateLine.isPending} data-testid={`button-skip-line-${line.id}`}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Skip this line
              </Button>
              <Button size="sm" onClick={() => save("accepted")} disabled={updateLine.isPending} data-testid={`button-accept-line-${line.id}`}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {needsProduct ? "Accept" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceReviewPanel({
  document,
  venueId,
  products,
}: {
  document: DeliveryDocumentRow;
  venueId: string;
  products: ScanProduct[];
}) {
  const { data: lines = [], isLoading } = useDeliveryDocumentLines(document.id);
  const updateDocument = useUpdateDeliveryDocument();
  const extractDocument = useExtractDeliveryDocument();
  const commitDocument = useCommitDeliveryDocument();
  const { toast } = useToast();
  const [supplier, setSupplier] = React.useState(document.supplier ?? "");
  const [invoiceRef, setInvoiceRef] = React.useState(document.invoice_ref ?? "");
  const [invoiceDate, setInvoiceDate] = React.useState(document.invoice_date ?? "");

  React.useEffect(() => {
    setSupplier(document.supplier ?? "");
    setInvoiceRef(document.invoice_ref ?? "");
    setInvoiceDate(document.invoice_date ?? "");
  }, [document.id, document.supplier, document.invoice_ref, document.invoice_date]);

  const progress = React.useMemo(() => invoiceReviewProgress(lines), [lines]);

  const saveHeader = async () => {
    try {
      await updateDocument.mutateAsync({
        id: document.id,
        venueId,
        supplier: supplier.trim() || null,
        invoice_ref: invoiceRef.trim() || null,
        invoice_date: invoiceDate || null,
      });
      toast({ title: "Invoice details saved" });
    } catch (error: any) {
      toast({ title: "Could not save details", description: error.message, variant: "destructive" });
    }
  };

  const extract = async () => {
    try {
      const result = await extractDocument.mutateAsync({ venueId, documentId: document.id });
      toast({
        title: result.reused ? "Existing review reopened" : "Delivery note scanned",
        description: `${result.line_count} line${result.line_count === 1 ? "" : "s"} read.`,
      });
    } catch (error: any) {
      toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    }
  };

  const commit = async () => {
    try {
      await saveHeader();
      const result = await commitDocument.mutateAsync({ venueId, documentId: document.id });
      toast({
        title: `${result.delivery_count} line${result.delivery_count === 1 ? "" : "s"} added to stock`,
        description: result.total_pence > 0 ? `${formatGBP(result.total_pence / 100)} of stock recorded.` : "They now show in stock on every screen.",
      });
    } catch (error: any) {
      toast({ title: "Not added to stock", description: error.message, variant: "destructive" });
    }
  };

  if (document.status === "uploaded" || document.status === "failed") {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          {document.status === "failed" ? <AlertCircle className="w-10 h-10 mx-auto text-destructive" /> : <FileSearch className="w-10 h-10 mx-auto text-primary" />}
          <div>
            <div className="font-semibold">{document.status === "failed" ? "The previous scan failed" : "Ready to scan"}</div>
            <p className="text-sm text-muted-foreground mt-1">StockTap reads the note and matches each line to your products.</p>
          </div>
          {document.extraction_error && <p className="text-xs text-destructive rounded-lg bg-destructive/10 p-3">{document.extraction_error}</p>}
          <Button className="w-full" onClick={extract} disabled={extractDocument.isPending}>
            {extractDocument.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSearch className="w-4 h-4 mr-2" />}
            {document.status === "failed" ? "Try the scan again" : "Read this note"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (document.status === "extracting" || document.status === "committing") {
    return (
      <Card><CardContent className="p-10 text-center space-y-3"><Loader2 className="w-9 h-9 mx-auto animate-spin text-primary" /><div className="font-medium">{document.status === "extracting" ? "Reading delivery note…" : "Adding to stock…"}</div></CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{document.supplier || "Delivery note"}</div>
              
            </div>
            <Badge className={documentStatusClasses(document.status)}>{humanStatus(document.status)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-scan-header">{[invoiceRef && `No. ${invoiceRef}`, invoiceDate && new Date(invoiceDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), document.total_pence != null && formatGBP(document.total_pence / 100)].filter(Boolean).join(" · ") || "No number or date read from the photo"}</p>
          {document.status !== "committed" && (
            <details>
              <summary className="text-xs font-semibold text-primary underline cursor-pointer">Change supplier, number or date</summary>
              <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label>Supplier</Label><Input className="mt-1" value={supplier} onChange={(event) => setSupplier(event.target.value)} /></div>
                <div><Label>Note or invoice number</Label><Input className="mt-1" value={invoiceRef} onChange={(event) => setInvoiceRef(event.target.value)} /></div>
                <div><Label>Date</Label><Input type="date" className="mt-1" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></div>
              </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/40 p-2"><div className="text-xs text-muted-foreground">Subtotal</div><div className="font-semibold tabular-nums">{document.subtotal_pence == null ? "—" : formatGBP(document.subtotal_pence / 100)}</div></div>
                <div className="rounded-lg bg-muted/40 p-2"><div className="text-xs text-muted-foreground">VAT</div><div className="font-semibold tabular-nums">{document.vat_pence == null ? "—" : formatGBP(document.vat_pence / 100)}</div></div>
                <div className="rounded-lg bg-muted/40 p-2"><div className="text-xs text-muted-foreground">Document total</div><div className="font-semibold tabular-nums">{document.total_pence == null ? "—" : formatGBP(document.total_pence / 100)}</div></div>
              </div>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{document.status === "committed" ? "Added to stock" : "What came in"}</h2>
          <p className="text-xs text-muted-foreground" data-testid="text-scan-progress">{progress.accepted} accepted{progress.unresolved ? ` · ${progress.unresolved} to pick` : ""}{progress.ignored ? ` · ${progress.ignored} skipped` : ""}</p>
        </div>
        {progress.totalPence > 0 && <div className="font-bold tabular-nums">{formatGBP(progress.totalPence / 100)}</div>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((index) => <div key={index} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : lines.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No lines were read. Try a clearer, straight-on photo.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {[...lines].sort((a, b) => Number(b.review_status === "unmatched") - Number(a.review_status === "unmatched") || a.line_number - b.line_number)
            .map((line) => <InvoiceLineEditor key={line.id} line={line} products={products} venueId={venueId} locked={document.status === "committed"} />)}
        </div>
      )}

      {document.status === "committed" ? (
        <Card className="border-green-500/40">
          <CardContent className="p-4 text-sm" data-testid="scan-committed">
            <div className="font-semibold text-green-700 dark:text-green-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> This delivery is on your stock.</div>
            <p className="text-muted-foreground mt-1">It shows as "In stock" in the Library and is included in the Morning line check.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="sticky bottom-20 z-10 rounded-2xl border border-border bg-card p-3 shadow-lg space-y-2">
          {progress.unresolved > 0 && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300" data-testid="text-scan-unresolved">
              {progress.unresolved} line{progress.unresolved === 1 ? "" : "s"} not matched yet. Pick the product or skip {progress.unresolved === 1 ? "it" : "them"}; anything left is not added.
            </p>
          )}
          <Button className="w-full h-12 font-bold" disabled={progress.accepted === 0 || commitDocument.isPending} onClick={commit} data-testid="button-commit-invoice">
            {commitDocument.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {progress.accepted === 0 ? "Accept a line to add it" : `Add ${progress.accepted} line${progress.accepted === 1 ? "" : "s"} to stock`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function InvoiceScan() {
  const { venue, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const libraryRef = React.useRef<HTMLInputElement>(null);
  const { data: products = [] } = useProducts(venue?.id);
  const { data: documents = [], isLoading, refetch } = useDeliveryDocuments(venue?.id);
  const uploadDocument = useUploadDeliveryDocument();
  const extractDocument = useExtractDeliveryDocument();
  const commitDocument = useCommitDeliveryDocument();
  const [selectedDocumentId, setSelectedDocumentId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const autoAdd = ((venue as any)?.features ?? {}).auto_add_deliveries === true;

  React.useEffect(() => {
    if (selectedDocumentId && documents.some((document) => document.id === selectedDocumentId)) return;
    if (documents[0]) setSelectedDocumentId(documents[0].id);
  }, [documents, selectedDocumentId]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;

  const handleFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length || !venue?.id || !user?.id) return;
    let added = 0, toCheck = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const page = files.length > 1 ? ` (photo ${i + 1} of ${files.length})` : "";
        setBusy(`Getting the photo ready${page}…`);
        const file = await prepareImage(files[i]);
        setBusy(`Sending${page}…`);
        const created = await uploadDocument.mutateAsync({ venueId: venue.id, userId: user.id, file });
        setSelectedDocumentId(created.document_id);
        if (created.duplicate && created.status === "committed") {
          toast({ title: "That note is already on your stock", description: "It was scanned before, so nothing was added twice." });
          continue;
        }
        if (!created.duplicate || created.status === "uploaded" || created.status === "failed") {
          setBusy(`Reading the note${page}…`);
          const result = await extractDocument.mutateAsync({ venueId: venue.id, documentId: created.document_id });
          const allClear = result.line_count > 0 && (result as any).accepted_count === result.line_count;
          if (autoAdd && allClear) {
            setBusy(`Adding to stock${page}…`);
            const done = await commitDocument.mutateAsync({ venueId: venue.id, documentId: created.document_id });
            added += done.delivery_count;
          } else toCheck++;
        } else toCheck++;
      }
      await refetch();
      if (added > 0) toast({ title: `${added} line${added === 1 ? "" : "s"} added to stock`, description: toCheck ? "One photo has lines to check below." : "Scanned and accepted. They now show in stock." });
      else if (toCheck > 0) toast({ title: "Delivery note read", description: "Check the list, then tap Add to stock." });
    } catch (error: any) {
      toast({ title: "Could not read that photo", description: error.message, variant: "destructive" });
      await refetch();
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  };

  const scanProducts = React.useMemo(() => (products as unknown as ScanProduct[]).filter((p) => (p as any).is_template !== true).sort((a, b) => a.name.localeCompare(b.name)), [products]);

  if (!venue?.id || !user?.id) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => setLocation("/ledger")} className="text-muted-foreground" aria-label="Back to stock movements"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-primary">Scan a delivery</h1>
          <p className="text-xs text-muted-foreground">Photo in, stock up. Costs and sell prices in the same place.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-24 space-y-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ReceiptText className="w-6 h-6 text-primary shrink-0" />
              <div>
                <div className="font-semibold">Photograph the delivery note</div>
                <p className="text-xs text-muted-foreground mt-1">One photo per page, straight on. {autoAdd ? "Lines StockTap is sure of go straight onto stock." : "You get one list to check, then one tap adds it to stock."}</p>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleFiles(event.target.files)} data-testid="input-scan-camera" />
            <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} data-testid="input-scan-library" />
            <Button className="w-full h-12 font-bold" onClick={() => fileRef.current?.click()} disabled={!!busy} data-testid="button-upload-invoice">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              {busy ?? "Take a photo"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => libraryRef.current?.click()} disabled={!!busy} data-testid="button-upload-library">
              <Upload className="w-4 h-4 mr-2" /> Pick photos already on this phone
            </Button>
          </CardContent>
        </Card>

        {documents.length > 0 && (
          <div>
            <Label>Document</Label>
            <Select value={selectedDocumentId ?? ""} onValueChange={setSelectedDocumentId}>
              <SelectTrigger className="mt-1" data-testid="select-delivery-document"><SelectValue /></SelectTrigger>
              <SelectContent>
                {documents.map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.supplier || "Delivery note"}{document.invoice_date ? ` · ${new Date(document.invoice_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} · {humanStatus(document.status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="h-40 rounded-xl bg-muted animate-pulse" />
        ) : selectedDocument ? (
          <InvoiceReviewPanel document={selectedDocument} venueId={venue.id} products={scanProducts} />
        ) : (
          <Card><CardContent className="p-10 text-center space-y-3"><Upload className="w-10 h-10 mx-auto text-muted-foreground/40" /><div className="text-sm text-muted-foreground">Photograph your first delivery note and it goes onto your stock.</div></CardContent></Card>
        )}
      </div>
    </div>
  );
}
