import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    let apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    let model = Deno.env.get("VISION_MODEL") ?? "";
    if (!apiKey || !model) {
      const { data: cfg } = await admin.from("service_config").select("key,value").in("key", ["anthropic_api_key", "vision_model"]);
      for (const r of cfg ?? []) {
        if (r.key === "anthropic_api_key" && !apiKey) apiKey = r.value;
        if (r.key === "vision_model" && !model) model = r.value;
      }
    }
    if (!model) model = "claude-3-5-sonnet-latest";
    if (!apiKey) return json({ error: "no_api_key", message: "Rota reading is not set up yet - an AI vision key needs adding." }, 503);

    const body = await req.json().catch(() => ({}));
    const imageData = body.image_base64 ?? "";
    const mediaType = body.media_type ?? "image/jpeg";
    const staffNames = Array.isArray(body.staff_names) ? body.staff_names : [];
    if (!imageData) return json({ error: "no_image" }, 400);

    const lines = [
      "You are reading a photo of a UK pub staff rota (weekly work schedule).",
      "Extract every shift you can see. Return ONLY a JSON array. No prose, no markdown code fences.",
      "Each array element is an object with these fields: name (text as written), area (one of: bar, kitchen, unknown), day (one of: mon, tue, wed, thu, fri, sat, sun, or empty string), start (time as HH:MM in 24-hour), end (time as HH:MM in 24-hour, or null), until_close (true or false).",
      "Set until_close to true and end to null when the sheet says close, til close, or late. Convert times like 5 or 5pm to 24-hour (17:00). A morning 11:30 open stays 11:30.",
      "Sections are often labelled Bar and Kitchen; if unclear use unknown.",
      staffNames.length ? ("Known staff names, use these spellings when they match: " + staffNames.join(", ") + ".") : "",
      "If a cell is blank the person is not working that day. Do not invent shifts.",
    ].filter(Boolean);
    const prompt = lines.join(" ");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageData } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: "vision_failed", status: resp.status, detail: t.slice(0, 500) }, 502);
    }
    const data = await resp.json();
    const text = (data.content ?? []).map((c) => c.text ?? "").join("").trim();
    let shifts = [];
    try {
      const a = text.indexOf("[");
      const b = text.lastIndexOf("]");
      shifts = JSON.parse(a >= 0 ? text.slice(a, b + 1) : text);
    } catch (_e) {
      return json({ error: "parse_failed", raw: text.slice(0, 500) }, 502);
    }
    return json({ shifts });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
