import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) throw new Error("Missing bearer token.");
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new Error("Missing bearer token.");
  return token;
}

export async function authenticatedUserId(authorization: string | undefined): Promise<string> {
  const admin = getSupabaseAdmin();
  const token = bearerToken(authorization);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired session.");
  return data.user.id;
}

export async function requireVenueMember(userId: string, venueId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const [{ data: venue }, { data: membership }] = await Promise.all([
    admin.from("venues").select("owner_id").eq("id", venueId).maybeSingle(),
    admin.from("venue_members").select("role").eq("venue_id", venueId).eq("user_id", userId).maybeSingle(),
  ]);
  if (venue?.owner_id !== userId && !membership) throw new Error("Venue access denied.");
}
