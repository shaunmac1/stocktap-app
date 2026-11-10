import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Reads a photo of a till product-sales report (X/Z read) into plain rows: name + quantity sold.
// POST { venue_id, image_base64, media_type } with the user's JWT. Nothing is stored.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in again." }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const venueId = body.venue_id, b64 = body.image_base64;
  if (!venueId || typeof b64 !== "string" || b64.length < 100) return json({ error: "Missing photo." }, 400);
  if (b64.length > 9_000_000) return json({ error: "That photo is too big. Take it again a little further back." }, 413);
  const mime = ["image/jpeg", "image/png", "image/webp"].includes(body.media_type) ? body.media_type : "image/jpeg";

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Your session has expired. Sign in again." }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: venue } = await admin.from("venues").select("id, owner_id").eq("id", venueId).maybeSingle();
  const { data: member } = await admin.from("venue_members").select("role").eq("venue_id", venueId).eq("user_id", userId).maybeSingle();
  if (!venue || !(venue.owner_id === userId || member)) return json({ error: "You don't have access to this pub." }, 403);

  const { data: cfg } = await admin.from("service_config").select("key,value").in("key", ["anthropic_api_key", "vision_model"]);
  const conf: Record<string, string> = {}; for (const r of cfg || []) conf[r.key] = r.value;
  if (!conf.anthropic_api_key) return json({ error: "Photo reading isn't set up yet." }, 503);
  const model = conf.vision_model || "claude-sonnet-4-5-20250929";

  const prompt = `This is a photo of a UK pub till report listing products sold (an X read, Z read, PLU or product sales report), on a till roll, a printout or a screen.
Extract every product row. Return ONLY minified JSON, no prose:
{"report_date":"YYYY-MM-DD"|null,"rows":[{"name":string,"qty":number,"value":number|null}]}
Rules: name is the product text exactly as printed (keep words like PINT, HALF, 1/2, DBL). qty is the QUANTITY SOLD, not the money; if a row shows both, the quantity is usually the smaller whole number and the money has two decimals. value is the money taken in pounds as a plain number, or null. Skip totals, department/group totals, payment types (cash, card), VAT, discounts, refunds, no-sales and headers. If a number is unreadable, leave that row out rather than guess. If this is not a till sales report return {"report_date":null,"rows":[]}.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": conf.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 8000,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
          { type: "text", text: prompt },
        ] }],
      }),
    });
    if (!resp.ok) { const t = await resp.text(); console.error("vision error", resp.status, t.slice(0, 300)); return json({ error: `Photo reading service error (${resp.status}). Try again.` }, 502); }
    const out = await resp.json();
    const text = (out.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "Couldn't read a till report in that photo. Try a clearer, straight-on photo." }, 422);
    let parsed: any; try { parsed = JSON.parse(m[0]); } catch { return json({ error: "The photo came back unreadable. Try again." }, 422); }
    const rows = (Array.isArray(parsed.rows) ? parsed.rows : [])
      .map((r: any) => ({ name: String(r?.name ?? "").slice(0, 120).trim(), qty: Number(r?.qty), value: r?.value == null ? null : Number(r.value) }))
      .filter((r: any) => r.name && Number.isFinite(r.qty) && r.qty > 0 && r.qty < 100000)
      .slice(0, 600);
    if (!rows.length) return json({ error: "No product sales were found in that photo. It needs to be the report that lists each product and how many were sold." }, 422);
    const dateOk = typeof parsed.report_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.report_date);
    return json({ rows, report_date: dateOk ? parsed.report_date : null });
  } catch (e) {
    return json({ error: (e as Error)?.message || "Photo reading failed" }, 500);
  }
});
