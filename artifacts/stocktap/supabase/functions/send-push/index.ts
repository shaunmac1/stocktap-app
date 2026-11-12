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

    // By default a signed-in user can only push to their OWN devices (a safe self-test).
    // notify_venue: a member of that pub tells its owner and managers something happened
    // (a staff count finished). Only members can do it, it only ever reaches that pub's
    // owner and managers, and never the caller themselves.
    let targetUserIds = [user.id];
    if (typeof body.notify_venue === "string" && body.notify_venue) {
      const venueId = body.notify_venue;
      const { data: venue } = await admin.from("venues").select("id, owner_id").eq("id", venueId).maybeSingle();
      const { data: members } = await admin.from("venue_members").select("user_id, role").eq("venue_id", venueId);
      const isMember = !!venue && (venue.owner_id === user.id || (members ?? []).some((m) => m.user_id === user.id));
      if (!isMember) return json({ error: "not a member of this pub" }, 403);
      const admins = new Set<string>([venue!.owner_id, ...(members ?? []).filter((m) => m.role === "owner" || m.role === "manager").map((m) => m.user_id)]);
      admins.delete(user.id);
      targetUserIds = Array.from(admins);
      if (targetUserIds.length === 0) return json({ sent: 0, failed: 0, devices: 0 });
    }
    const { data: subs, error } = await admin
      .from("push_subscriptions").select("*").in("user_id", targetUserIds);
    if (error) return json({ error: error.message }, 500);

    webpush.setVapidDetails("mailto:hello@stocktap.net", VAPID_PUBLIC, VAPID_PRIVATE);
    const payload = JSON.stringify({
      title: String(body.title ?? "StockTap").slice(0, 80),
      body: String(body.body ?? "This is a test reminder.").slice(0, 200),
      url: typeof body.url === "string" && body.url.startsWith("/") ? body.url.slice(0, 200) : "/",
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
