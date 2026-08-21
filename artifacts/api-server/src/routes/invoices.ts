import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { authenticatedUserId, getSupabaseAdmin, requireVenueMember } from "../lib/supabaseAdmin";
import {
  INVOICE_EXTRACTION_SCHEMA,
  buildDraftInvoiceLines,
  extractResponseOutputText,
  majorCurrencyToPence,
  normalizeExtractedInvoice,
} from "../lib/invoiceExtraction";

const router: IRouter = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function statusForError(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("session") || normalized.includes("bearer")) return 401;
  if (normalized.includes("access denied")) return 403;
  if (normalized.includes("not found")) return 404;
  if (normalized.includes("unsupported") || normalized.includes("too large") || normalized.includes("invalid")) return 400;
  return 500;
}

router.post("/invoices/:documentId/extract", async (req: Request, res: Response) => {
  const rawDocumentId = req.params.documentId;
  const documentId = Array.isArray(rawDocumentId) ? rawDocumentId[0] : rawDocumentId;
  if (!documentId || !UUID_PATTERN.test(documentId)) {
    res.status(400).json({ error: "Invalid document ID." });
    return;
  }

  const admin = getSupabaseAdmin();
  let documentVenueId: string | null = null;

  try {
    const userId = await authenticatedUserId(req.headers.authorization);
    const { data: document, error: documentError } = await admin
      .from("delivery_documents")
      .select("id, venue_id, file_path, mime_type, status")
      .eq("id", documentId)
      .maybeSingle();
    if (documentError) throw documentError;
    if (!document) throw new Error("Delivery document not found.");
    documentVenueId = document.venue_id;
    await requireVenueMember(userId, document.venue_id);

    if (document.status === "committed") {
      res.status(409).json({ error: "A committed invoice cannot be extracted again." });
      return;
    }
    if (document.status === "review") {
      const { count } = await admin
        .from("delivery_document_lines")
        .select("id", { count: "exact", head: true })
        .eq("document_id", document.id);
      res.json({ document_id: document.id, status: "review", line_count: count ?? 0, reused: true });
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(document.mime_type)) throw new Error("Unsupported delivery document type.");

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      res.status(503).json({ error: "Invoice scanning is not configured yet." });
      return;
    }
    const model = process.env.OPENAI_INVOICE_MODEL ?? "gpt-4o";

    await admin
      .from("delivery_documents")
      .update({ status: "extracting", extraction_error: null, extraction_model: model })
      .eq("id", document.id);

    const { data: sourceFile, error: downloadError } = await admin.storage
      .from("delivery-documents")
      .download(document.file_path);
    if (downloadError || !sourceFile) throw new Error(`Could not download delivery document: ${downloadError?.message ?? "unknown error"}`);
    if (sourceFile.size > MAX_DOCUMENT_BYTES) throw new Error("Delivery document is too large.");

    const bytes = Buffer.from(await sourceFile.arrayBuffer());
    const imageUrl = `data:${document.mime_type};base64,${bytes.toString("base64")}`;
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Extract this hospitality delivery note or supplier invoice.",
                "Return purchase quantities in the supplier's purchase units, such as cases, bottles, boxes or kegs.",
                "Do not treat deposits, delivery charges, discounts, credits, VAT rows or totals as products.",
                "Do not guess unreadable prices or quantities; use null where permitted.",
              ].join(" "),
            },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "stocktap_delivery_document",
            strict: true,
            schema: INVOICE_EXTRACTION_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const responsePayload = await openAiResponse.json() as unknown;
    if (!openAiResponse.ok) {
      const errorMessage = (responsePayload as any)?.error?.message ?? `OpenAI request failed with ${openAiResponse.status}`;
      throw new Error(errorMessage);
    }

    const outputText = extractResponseOutputText(responsePayload);
    const extracted = normalizeExtractedInvoice(JSON.parse(outputText));

    const { data: products, error: productsError } = await admin
      .from("products")
      .select("id, name, vendor, sku")
      .eq("venue_id", document.venue_id);
    if (productsError) throw productsError;

    const lines = buildDraftInvoiceLines(extracted, products ?? []).map((line) => ({
      document_id: document.id,
      ...line,
    }));

    const { error: deleteError } = await admin
      .from("delivery_document_lines")
      .delete()
      .eq("document_id", document.id);
    if (deleteError) throw deleteError;

    if (lines.length > 0) {
      const { error: linesError } = await admin.from("delivery_document_lines").insert(lines);
      if (linesError) throw linesError;
    }

    const { error: updateError } = await admin
      .from("delivery_documents")
      .update({
        status: "review",
        supplier: extracted.supplier,
        invoice_ref: extracted.invoice_ref,
        invoice_date: extracted.invoice_date,
        currency: extracted.currency,
        subtotal_pence: majorCurrencyToPence(extracted.subtotal),
        vat_pence: majorCurrencyToPence(extracted.vat),
        total_pence: majorCurrencyToPence(extracted.total),
        extraction_error: null,
        extraction_model: model,
      })
      .eq("id", document.id);
    if (updateError) throw updateError;

    res.json({
      document_id: document.id,
      status: "review",
      line_count: lines.length,
      matched_count: lines.filter((line) => line.matched_product_id).length,
      ignored_count: lines.filter((line) => line.review_status === "ignored").length,
      reused: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invoice extraction failed.";
    logger.error({ err: error, documentId, venueId: documentVenueId }, "Invoice extraction failed");
    if (documentVenueId) {
      try {
        await admin
          .from("delivery_documents")
          .update({ status: "failed", extraction_error: message.slice(0, 500) })
          .eq("id", documentId)
          .neq("status", "committed");
      } catch (updateErr) {
        logger.warn({ err: updateErr, documentId }, "Could not update document status to failed");
      }
    }
    res.status(statusForError(message)).json({ error: message });
  }
});

export default router;
