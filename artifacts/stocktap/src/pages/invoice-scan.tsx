import React from "react";
import { useLocation } from "wouter";
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
import { useProducts } from "@/hooks/api";
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
    review: "Needs review",
    committing: "Saving",
    committed: "Committed",
    failed: "Scan failed",
  }[status];
}

function confidenceText(confidence: number | null): string {
  if (confidence == null) return "No automatic match";
  if (confidence >= 0.85) return `${Math.round(confidence * 100)}% strong match`;
  if (confidence >= 0.55) return `${Math.round(confidence * 100)}% possible match`;
  return `${Math.round(confidence * 100)}% weak match`;
}

function InvoiceLineEditor({
  line,
  products,
}: {
  line: DeliveryDocumentLineRow;
  products: Array<{ id: string; name: string }>;
}) {
  const updateLine = useUpdateDeliveryDocumentLine();
  const { toast } = useToast();
  const [productId, setProductId] = React.useState(line.matched_product_id ?? "none");
  const [quantity, setQuantity] = React.useState(String(line.purchase_quantity));
  const [unitCost, setUnitCost] = React.useState(penceToPoundsInput(line.unit_cost_pence));
  const [lineTotal, setLineTotal] = React.useState(penceToPoundsInput(line.line_total_pence));

  React.useEffect(() => {
    setProductId(line.matched_product_id ?? "none");
    setQuantity(String(line.purchase_quantity));
    setUnitCost(penceToPoundsInput(line.unit_cost_pence));
    setLineTotal(penceToPoundsInput(line.line_total_pence));
  }, [line.id, line.matched_product_id, line.purchase_quantity, line.unit_cost_pence, line.line_total_pence]);

  const save = async (nextStatus = line.review_status) => {
    const parsedQuantity = Number(quantity);
    const costPence = poundsInputToPence(unitCost);
    const totalPence = poundsInputToPence(lineTotal);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast({ title: "Quantity required", description: "Enter a quantity greater than zero.", variant: "destructive" });
      return;
    }
    if (nextStatus === "accepted" && (productId === "none" || costPence == null)) {
      toast({ title: "Product and cost required", description: "Accepted lines need a matched product and unit cost.", variant: "destructive" });
      return;
    }
    try {
      await updateLine.mutateAsync({
        id: line.id,
        documentId: line.document_id,
        matched_product_id: productId === "none" ? null : productId,
        purchase_quantity: parsedQuantity,
        unit_cost_pence: costPence,
        line_total_pence: totalPence,
        review_status: nextStatus,
      });
      toast({ title: nextStatus === "ignored" ? "Line ignored" : nextStatus === "accepted" ? "Line accepted" : "Line updated" });
    } catch (error: any) {
      toast({ title: "Could not update line", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Card className={line.review_status === "ignored" ? "opacity-60" : ""} data-testid={`invoice-line-${line.id}`}>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{line.raw_description}</div>
            <div className="text-xs text-muted-foreground mt-1">Line {line.line_number} · {confidenceText(line.match_confidence)}</div>
          </div>
          <Badge className={line.review_status === "accepted" ? "bg-green-100 text-green-800" : line.review_status === "ignored" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800"}>
            {line.review_status}
          </Badge>
        </div>

        {line.review_status !== "ignored" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Match to venue product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="mt-1" data-testid={`select-invoice-product-${line.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No product selected</SelectItem>
                  {products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Quantity</Label>
                <Input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 tabular-nums" />
              </div>
              <div>
                <Label className="text-xs">Unit cost £</Label>
                <Input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="mt-1 tabular-nums" />
              </div>
              <div>
                <Label className="text-xs">Line total £</Label>
                <Input type="number" min="0" step="0.01" value={lineTotal} onChange={(event) => setLineTotal(event.target.value)} className="mt-1 tabular-nums" />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={() => save("unmatched")} disabled={updateLine.isPending}>Save</Button>
          <Button variant="outline" size="sm" onClick={() => save("ignored")} disabled={updateLine.isPending}>
            <XCircle className="w-3.5 h-3.5 mr-1" /> Ignore
          </Button>
          <Button size="sm" onClick={() => save("accepted")} disabled={updateLine.isPending}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept
          </Button>
        </div>
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
  products: Array<{ id: string; name: string }>;
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
        description: `${result.line_count} line${result.line_count === 1 ? "" : "s"} extracted · review every row before committing.`,
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
        title: "Invoice committed",
        description: `${result.delivery_count} purchase row${result.delivery_count === 1 ? "" : "s"} · ${formatGBP(result.total_pence / 100)} recorded.`,
      });
    } catch (error: any) {
      toast({ title: "Invoice not committed", description: error.message, variant: "destructive" });
    }
  };

  if (document.status === "uploaded" || document.status === "failed") {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          {document.status === "failed" ? <AlertCircle className="w-10 h-10 mx-auto text-destructive" /> : <FileSearch className="w-10 h-10 mx-auto text-primary" />}
          <div>
            <div className="font-semibold">{document.status === "failed" ? "The previous scan failed" : "Ready to scan"}</div>
            <p className="text-sm text-muted-foreground mt-1">AI creates a draft only. No stock or financial record is saved until a manager reviews and commits it.</p>
          </div>
          {document.extraction_error && <p className="text-xs text-destructive rounded-lg bg-destructive/10 p-3">{document.extraction_error}</p>}
          <Button className="w-full" onClick={extract} disabled={extractDocument.isPending}>
            {extractDocument.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSearch className="w-4 h-4 mr-2" />}
            {document.status === "failed" ? "Try scan again" : "Extract invoice draft"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (document.status === "extracting" || document.status === "committing") {
    return (
      <Card><CardContent className="p-10 text-center space-y-3"><Loader2 className="w-9 h-9 mx-auto animate-spin text-primary" /><div className="font-medium">{document.status === "extracting" ? "Reading delivery note…" : "Committing approved rows…"}</div></CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Invoice details</div>
              <p className="text-xs text-muted-foreground mt-1">Check these against the original document.</p>
            </div>
            <Badge className={documentStatusClasses(document.status)}>{humanStatus(document.status)}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>Supplier</Label><Input className="mt-1" value={supplier} onChange={(event) => setSupplier(event.target.value)} disabled={document.status === "committed"} /></div>
            <div><Label>Invoice reference</Label><Input className="mt-1" value={invoiceRef} onChange={(event) => setInvoiceRef(event.target.value)} disabled={document.status === "committed"} /></div>
            <div><Label>Invoice date</Label><Input type="date" className="mt-1" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} disabled={document.status === "committed"} /></div>
          </div>
          {document.status !== "committed" && <Button variant="outline" className="w-full" onClick={saveHeader} disabled={updateDocument.isPending}>Save invoice details</Button>}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/40 p-2"><div className="text-xs text-muted-foreground">Subtotal</div><div className="font-semibold tabular-nums">{document.subtotal_pence == null ? "—" : formatGBP(document.subtotal_pence / 100)}</div></div>
            <div className="rounded-lg bg-muted/40 p-2"><div className="text-xs text-muted-foreground">VAT</div><div className="font-semibold tabular-nums">{document.vat_pence == null ? "—" : formatGBP(document.vat_pence / 100)}</div></div>
            <div className="rounded-lg bg-muted/40 p-2"><div className="text-xs text-muted-foreground">Document total</div><div className="font-semibold tabular-nums">{document.total_pence == null ? "—" : formatGBP(document.total_pence / 100)}</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Extracted lines</h2>
          <p className="text-xs text-muted-foreground">{progress.accepted} accepted · {progress.unresolved} unresolved · {progress.ignored} ignored</p>
        </div>
        <div className="font-bold tabular-nums">{formatGBP(progress.totalPence / 100)}</div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((index) => <div key={index} className="h-32 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : lines.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No line items were extracted. Try a clearer photo.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {lines.map((line) => <InvoiceLineEditor key={line.id} line={line} products={products} />)}
        </div>
      )}

      {document.status !== "committed" && (
        <Card className={progress.canCommit ? "border-green-500/40" : "border-amber-500/40"}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">Manager approval required</div>
                <p className="text-xs text-muted-foreground mt-1">Committing creates purchase and stock-movement records only for accepted rows.</p>
              </div>
            </div>
            {progress.commitErrors.length > 0 && (
              <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                {progress.commitErrors.map((message) => <li key={message}>• {message}</li>)}
              </ul>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full h-12 font-bold" disabled={!progress.canCommit || commitDocument.isPending} data-testid="button-commit-invoice">
                  Commit {progress.accepted} approved line{progress.accepted === 1 ? "" : "s"} · {formatGBP(progress.totalPence / 100)}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Commit this reviewed invoice?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This creates {progress.accepted} purchase and stock-movement record{progress.accepted === 1 ? "" : "s"}. Ignored and unresolved rows will not be posted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Review again</AlertDialogCancel>
                  <AlertDialogAction onClick={commit}>Commit approved rows</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function InvoiceScan() {
  const { venue, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { data: products = [] } = useProducts(venue?.id);
  const { data: documents = [], isLoading, refetch } = useDeliveryDocuments(venue?.id);
  const uploadDocument = useUploadDeliveryDocument();
  const extractDocument = useExtractDeliveryDocument();
  const [selectedDocumentId, setSelectedDocumentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (selectedDocumentId && documents.some((document) => document.id === selectedDocumentId)) return;
    if (documents[0]) setSelectedDocumentId(documents[0].id);
  }, [documents, selectedDocumentId]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;

  const handleFile = async (file: File | undefined) => {
    if (!file || !venue?.id || !user?.id) return;
    try {
      const created = await uploadDocument.mutateAsync({ venueId: venue.id, userId: user.id, file });
      setSelectedDocumentId(created.document_id);
      toast({
        title: created.duplicate ? "This document was already uploaded" : "Document uploaded privately",
        description: created.duplicate ? "The existing draft has been opened instead of creating a duplicate." : "Starting secure extraction now.",
      });
      if (!created.duplicate || created.status === "uploaded" || created.status === "failed") {
        await extractDocument.mutateAsync({ venueId: venue.id, documentId: created.document_id });
      }
      await refetch();
    } catch (error: any) {
      toast({ title: "Could not process document", description: error.message, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!venue?.id || !user?.id) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => setLocation("/ledger")} className="text-muted-foreground" aria-label="Back to stock movements"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-primary">Scan Delivery Note</h1>
          <p className="text-xs text-muted-foreground">Private upload · AI draft · human approval</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-24 space-y-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ReceiptText className="w-6 h-6 text-primary shrink-0" />
              <div>
                <div className="font-semibold">Photograph or upload a supplier document</div>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG or WebP up to 10MB. StockTap detects duplicates before creating another draft.</p>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <Button className="w-full h-12 font-bold" onClick={() => fileRef.current?.click()} disabled={uploadDocument.isPending || extractDocument.isPending} data-testid="button-upload-invoice">
              {uploadDocument.isPending || extractDocument.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              {uploadDocument.isPending ? "Uploading privately…" : extractDocument.isPending ? "Reading document…" : "Take photo or upload"}
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
                    {document.supplier || document.original_filename} · {humanStatus(document.status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="h-40 rounded-xl bg-muted animate-pulse" />
        ) : selectedDocument ? (
          <InvoiceReviewPanel document={selectedDocument} venueId={venue.id} products={products.map((product) => ({ id: product.id, name: product.name }))} />
        ) : (
          <Card><CardContent className="p-10 text-center space-y-3"><Upload className="w-10 h-10 mx-auto text-muted-foreground/40" /><div className="text-sm text-muted-foreground">Upload your first delivery note to create a review draft.</div></CardContent></Card>
        )}
      </div>
    </div>
  );
}
