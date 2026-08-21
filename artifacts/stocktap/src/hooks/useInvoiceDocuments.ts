import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DeliveryDocumentRow {
  id: string;
  venue_id: string;
  uploaded_by: string;
  file_path: string;
  file_hash: string;
  original_filename: string;
  mime_type: string;
  status: "uploaded" | "extracting" | "review" | "committing" | "committed" | "failed";
  supplier: string | null;
  invoice_ref: string | null;
  invoice_date: string | null;
  currency: string;
  subtotal_pence: number | null;
  vat_pence: number | null;
  total_pence: number | null;
  extraction_model: string | null;
  extraction_error: string | null;
  committed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryDocumentLineRow {
  id: string;
  document_id: string;
  line_number: number;
  raw_description: string;
  purchase_quantity: number;
  unit_label: string | null;
  unit_cost_pence: number | null;
  line_total_pence: number | null;
  matched_product_id: string | null;
  match_confidence: number | null;
  review_status: "unmatched" | "accepted" | "ignored";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function useDeliveryDocuments(venueId: string | undefined) {
  return useQuery({
    queryKey: ["delivery-documents", venueId],
    queryFn: async () => {
      if (!venueId) return [] as DeliveryDocumentRow[];
      const { data, error } = await supabase
        .from("delivery_documents" as never)
        .select("*")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false });
      if (error) {
        if ((error as any).message?.includes("does not exist")) return [] as DeliveryDocumentRow[];
        throw error;
      }
      return (data ?? []) as unknown as DeliveryDocumentRow[];
    },
    enabled: !!venueId,
    staleTime: 10_000,
  });
}

export function useDeliveryDocumentLines(documentId: string | undefined) {
  return useQuery({
    queryKey: ["delivery-document-lines", documentId],
    queryFn: async () => {
      if (!documentId) return [] as DeliveryDocumentLineRow[];
      const { data, error } = await supabase
        .from("delivery_document_lines" as never)
        .select("*")
        .eq("document_id", documentId)
        .order("line_number");
      if (error) throw error;
      return (data ?? []) as unknown as DeliveryDocumentLineRow[];
    },
    enabled: !!documentId,
    staleTime: 5_000,
  });
}

export function useUploadDeliveryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ venueId, userId, file }: { venueId: string; userId: string; file: File }) => {
      const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
      if (!allowed.has(file.type)) throw new Error("Upload a JPG, PNG or WebP image.");
      if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("Image must be between 1 byte and 10MB.");

      const fileHash = await sha256Hex(file);
      const storagePath = `${venueId}/${userId}/${crypto.randomUUID()}.${extensionForMime(file.type)}`;
      const { error: uploadError } = await supabase.storage
        .from("delivery-documents")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      try {
        const { data, error } = await supabase.rpc(
          "create_delivery_document" as never,
          {
            p_venue_id: venueId,
            p_file_path: storagePath,
            p_file_hash: fileHash,
            p_original_filename: file.name,
            p_mime_type: file.type,
          } as never,
        );
        if (error) throw error;
        const result = (Array.isArray(data) ? data[0] : data) as unknown as { document_id: string; duplicate: boolean; status: string };
        if (!result?.document_id) throw new Error("Document record was not returned.");
        if (result.duplicate) {
          await supabase.storage.from("delivery-documents").remove([storagePath]);
        }
        return result;
      } catch (error) {
        await supabase.storage.from("delivery-documents").remove([storagePath]);
        throw error;
      }
    },
    onSuccess: (_result, args) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-documents", args.venueId] });
    },
  });
}

export function useExtractDeliveryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId }: { venueId: string; documentId: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session has expired. Sign in again.");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      try {
        const response = await fetch(`/api/invoices/${documentId}/extract`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? `Extraction failed with ${response.status}`);
        return payload as { document_id: string; status: string; line_count: number; matched_count: number; ignored_count: number; reused: boolean };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("Invoice scan timed out — the server took too long to respond. Please try again.");
        }
        throw err;
      }
    },
    onSuccess: (result, args) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-documents", args.venueId] });
      queryClient.invalidateQueries({ queryKey: ["delivery-document-lines", result.document_id] });
    },
  });
}

export function useUpdateDeliveryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, venueId: _venueId, ...updates }: Partial<DeliveryDocumentRow> & { id: string; venueId: string }) => {
      const { data, error } = await supabase
        .from("delivery_documents" as never)
        .update(updates as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-documents", args.venueId] });
    },
  });
}

export function useUpdateDeliveryDocumentLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, documentId: _documentId, ...updates }: Partial<DeliveryDocumentLineRow> & { id: string; documentId: string }) => {
      const { data, error } = await supabase
        .from("delivery_document_lines" as never)
        .update(updates as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-document-lines", args.documentId] });
    },
  });
}

export function useCommitDeliveryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId }: { venueId: string; documentId: string }) => {
      const { data, error } = await supabase.rpc(
        "commit_delivery_document" as never,
        { p_document_id: documentId } as never,
      );
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      return result as unknown as { delivery_count: number; movement_count: number; total_pence: number };
    },
    onSuccess: (_result, args) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-documents", args.venueId] });
      queryClient.invalidateQueries({ queryKey: ["delivery-document-lines", args.documentId] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", args.venueId] });
      queryClient.invalidateQueries({ queryKey: ["movements", args.venueId] });
    },
  });
}
