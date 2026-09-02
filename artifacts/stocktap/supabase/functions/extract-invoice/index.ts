import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Extracts a delivery note / invoice image into a review draft.
// POST { document_id } with the user's JWT. Service role is used only after membership is verified.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const STOP = new Set(["x","case","of","bottle","bottles","btl","btls","can","cans","pack","the","and","ltd","70cl","75cl","700ml","750ml","330ml","500ml","275ml","440ml","200ml","30l","50l","11g","9g","keg","cask","nrb","pet"]);
function norm(s: string) { return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
function tokens(s: string) { return new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t))); }
function sizeOf(s: string): number | null {
  const m = norm(s).match(/(\d+(?:\.\d+)?)\s*(cl|ml|l)\b/); if (!m) return null;
  const v = parseFloat(m[1]); return m[2] === "cl" ? v * 10 : m[2] === "l" ? v * 1000 : v;
}
function similarity(desc: string, p: { name: string; size_ml: number | null; container_l: number | null }) {
  const A = tokens(desc), B = tokens(p.name);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  const recall = inter / B.size;              // how much of the product name is covered
  const jac = inter / (A.size + B.size - inter);
  let score = 0.6 * recall + 0.4 * jac;
  const ds = sizeOf(desc); const ps = p.size_ml ?? (p.container_l ? p.container_l * 1000 : null);
  if (ds && ps) score += Math.abs(ds - ps) / Math.max(ds, ps) < 0.05 ? 0.15 : -0.15;
  return Math.max(0, Math.min(1, score));
}
function toPence(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[£,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in again." }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const documentId = body.document_id;
  if (!documentId) return json({ error: "Missing document_id" }, 400);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Your session has expired. Sign in again." }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: doc, error: docErr } = await admin.from("delivery_documents").select("*").eq("id", documentId).single();
  if (docErr || !doc) return json({ error: "Document not found" }, 404);

  const { data: venue } = await admin.from("venues").select("id, owner_id").eq("id", doc.venue_id).single();
  const { data: member } = await admin.from("venue_members").select("role").eq("venue_id", doc.venue_id).eq("user_id", userId).maybeSingle();
  const allowed = venue?.owner_id === userId || (member && ["owner", "manager"].includes(member.role));
  if (!allowed) return json({ error: "You don't have access to this document." }, 403);
  if (doc.status === "committed") return json({ error: "This document is already committed." }, 409);

  await admin.from("delivery_documents").update({ status: "extracting", extraction_error: null, updated_at: new Date().toISOString() }).eq("id", documentId);

  const fail = async (msg: string, status = 500) => {
    await admin.from("delivery_documents").update({ status: "failed", extraction_error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", documentId);
    return json({ error: msg }, status);
  };

  try {
    const { data: cfg } = await admin.from("service_config").select("key,value").in("key", ["anthropic_api_key", "vision_model"]);
    const conf: Record<string, string> = {}; for (const r of cfg || []) conf[r.key] = r.value;
    const apiKey = conf.anthropic_api_key; const model = conf.vision_model || "claude-sonnet-4-5-20250929";
    if (!apiKey) return await fail("Invoice scanning isn't configured yet.", 503);

    const { data: file, error: dlErr } = await admin.storage.from("delivery-documents").download(doc.file_path);
    if (dlErr || !file) return await fail("Could not read the uploaded image.");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ""; const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    const b64 = btoa(bin);
    const mime = ["image/jpeg", "image/png", "image/webp"].includes(doc.mime_type) ? doc.mime_type : "image/jpeg";

    const { data: products, error: prodErr } = await admin.from("products").select("id,name,size_ml,container_l,is_template").eq("venue_id", doc.venue_id).limit(1000);
    if (prodErr) console.error("products load failed", prodErr.message);
    const prods = (products || []).filter((p) => !p.is_template);

    const prompt = `You are reading a UK pub supplier delivery note or invoice. Extract the header and every product line.
Return ONLY minified JSON matching this shape, no prose:
{"supplier":string|null,"invoice_ref":string|null,"invoice_date":"YYYY-MM-DD"|null,"currency":"GBP","subtotal":number|null,"vat":number|null,"total":number|null,"lines":[{"description":string,"quantity":number,"unit":string|null,"unit_cost":number|null,"line_total":number|null}]}
Rules: money values are pounds as plain numbers (14.5 not "£14.50"). quantity is the number of units delivered (cases count as cases; put e.g. "case of 24" in unit). Skip non-product rows (subtotals, deposits, carriage) unless they are chargeable goods. If a value is unreadable use null.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4000,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
          { type: "text", text: prompt },
        ] }],
      }),
    });
    if (!resp.ok) { const t = await resp.text(); return await fail(`Scan service error (${resp.status}): ${t.slice(0, 200)}`); }
    const out = await resp.json();
    const text = (out.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return await fail("Couldn't read a delivery note in that image. Try a clearer, straight-on photo.", 422);
    let parsed: any; try { parsed = JSON.parse(m[0]); } catch { return await fail("Scan returned unreadable data. Try again.", 422); }
    const lines: any[] = Array.isArray(parsed.lines) ? parsed.lines : [];
    if (!lines.length) return await fail("No product lines were found on that document.", 422);

    await admin.from("delivery_document_lines").delete().eq("document_id", documentId);
    const rows = lines.map((l, i) => {
      let best: any = null, bestScore = 0;
      for (const p of prods) { const s = similarity(l.description || "", p); if (s > bestScore) { bestScore = s; best = p; } }
      let qty = Number(l.quantity);
      let unitCost = l.unit_cost;
      // "2 x case of 24" style lines: convert to units so stock movements are per bottle/can
      const packM = String(l.unit || l.description || "").match(/(?:case|pack|box|tray)\s*(?:of)?\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:x|pk|pack)\b/i);
      const pack = packM ? parseInt(packM[1] || packM[2], 10) : 0;
      if (pack > 1 && Number.isFinite(qty) && qty > 0 && best && !/keg|cask/i.test(best.name)) {
        qty = qty * pack;
        if (unitCost != null && Number.isFinite(Number(unitCost))) unitCost = Number(unitCost) / pack;
      }
      const matched = bestScore >= 0.45;
      return {
        document_id: documentId, line_number: i + 1,
        raw_description: String(l.description || "").slice(0, 300),
        purchase_quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit_label: l.unit ? String(l.unit).slice(0, 60) : null,
        unit_cost_pence: toPence(unitCost), line_total_pence: toPence(l.line_total),
        matched_product_id: matched ? best.id : null,
        match_confidence: matched ? Math.round(bestScore * 100) / 100 : null,
        review_status: "unmatched",
      };
    });
    const { error: insErr } = await admin.from("delivery_document_lines").insert(rows);
    if (insErr) return await fail(`Could not save lines: ${insErr.message}`);

    const dateOk = typeof parsed.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoice_date);
    const { error: upErr } = await admin.from("delivery_documents").update({
      status: "review", supplier: parsed.supplier ? String(parsed.supplier).slice(0, 120) : doc.supplier,
      invoice_ref: parsed.invoice_ref ? String(parsed.invoice_ref).slice(0, 80) : doc.invoice_ref,
      invoice_date: dateOk ? parsed.invoice_date : doc.invoice_date, currency: "GBP",
      subtotal_pence: toPence(parsed.subtotal), vat_pence: toPence(parsed.vat), total_pence: toPence(parsed.total),
      extraction_model: model, extraction_error: null, updated_at: new Date().toISOString(),
    }).eq("id", documentId);
    if (upErr) return await fail(`Could not update document: ${upErr.message}`);

    return json({ document_id: documentId, status: "review", lines: rows.length, matched: rows.filter((r) => r.matched_product_id).length });
  } catch (e) {
    return await fail((e as Error)?.message || "Extraction failed");
  }
});
