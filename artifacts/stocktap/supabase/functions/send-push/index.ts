import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const VAPID_PUBLIC = "BNYsRG-wUSUgtW6ADlk6VugSbQ7ExhQBBk97Sj88b7tdzvcEAFMBhBFuaZr4HlHcjmVRqQhfzZsjZPXV8pBDM9k";
// Private key: prefer the platform secret; fall back to the deployed constant.
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "SET_VAPID_PRIVATE_KEY_SECRET";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Identify the caller from their JWT.
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE);

    // Phase 1: a signed-in user can only push to their OWN devices (a safe
    // self-test). Broadcasting to staff will be a service-triggered path later.
    const targetUserIds = [user.id];
    const { data: subs, error } = await admin
      .from("push_subscriptions").select("*").in("user_id", targetUserIds);
    if (error) return json({ error: error.message }, 500);

    webpush.setVapidDetails("mailto:hello@stocktap.net", VAPID_PUBLIC, VAPID_PRIVATE);
    const payload = JSON.stringify({
      title: body.title ?? "StockTap",
      body: body.body ?? "This is a test reminder.",
      url: body.url ?? "/",
      tag: body.tag,
    });

    let sent = 0, failed = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
    return json({ sent, failed, devices: subs?.length ?? 0 });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
