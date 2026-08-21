import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isAnonymousSession } from "@/lib/auth-utils";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Venue = Database["public"]["Tables"]["venues"]["Row"];

// ─── Dev bypass ──────────────────────────────────────────────────────────────
// ONLY active when ALL THREE conditions are true:
//   1. Running in a Vite dev build (import.meta.env.DEV)
//   2. VITE_DEV_BYPASS_AUTH=true
//   3. VITE_DEV_EMAIL + VITE_DEV_PASSWORD are both set
//
// Anonymous sign-in is intentionally disabled — it mints a new Supabase user
// every time the session is lost (cache clear / new browser), which silently
// creates a new empty venue and loses all existing stocktake history.
// Use a real email/password dev account for a durable local identity.
//
// Setup:
//   1. Supabase Dashboard → Authentication → Users → "Add user" (email + password)
//   2. Set VITE_DEV_EMAIL and VITE_DEV_PASSWORD in Replit Secrets
//   3. VITE_DEV_BYPASS_AUTH=true is already set in the dev environment
//
// Only honoured in development builds. RLS stays fully ON.
const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL as string | undefined;
const DEV_PASS = import.meta.env.VITE_DEV_PASSWORD as string | undefined;

export const DEV_BYPASS =
  import.meta.env.DEV &&
  import.meta.env.VITE_DEV_BYPASS_AUTH === "true" &&
  !!DEV_EMAIL &&
  !!DEV_PASS;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SIGN_IN_TIMEOUT_MS = 8000;

/** Race a Supabase auth call against a timeout so a hung network request can't leave the UI stuck forever. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms — check network / Supabase status`)), ms)
    ),
  ]);
}

async function doBypassSignIn(): Promise<{ userId: string | null; error: string | null }> {
  // DEV_BYPASS only activates when VITE_DEV_EMAIL + VITE_DEV_PASSWORD are set,
  // so DEV_EMAIL and DEV_PASS are guaranteed non-empty here.
  console.log("[DEV_BYPASS] signing in with dev account…");
  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email: DEV_EMAIL!, password: DEV_PASS! }),
      SIGN_IN_TIMEOUT_MS,
      "Dev password sign-in"
    );
    if (!error && data.user) {
      console.log("[DEV_BYPASS] signed in OK:", data.user.id);
      return { userId: data.user.id, error: null };
    }
    console.error("[DEV_BYPASS] sign-in failed:", error?.message);
    return { userId: null, error: `Dev sign-in failed: ${error?.message}` };
  } catch (err: any) {
    return { userId: null, error: `Dev sign-in failed: ${err?.message}` };
  }
}

async function ensureDevVenue(userId: string): Promise<Venue | null> {
  const { data: members } = await supabase
    .from("venue_members")
    .select("venue_id")
    .eq("user_id", userId);

  if (members && members.length > 0) {
    const { data: v } = await supabase
      .from("venues")
      .select("*")
      .eq("id", members[0].venue_id)
      .single();
    if (!v) return null;
    // Ensure dev venue is always pro — in case it was created before this was enforced.
    if (v.tier !== "pro") {
      await supabase.from("venues").update({ tier: "pro" }).eq("id", v.id);
      return { ...v, tier: "pro" } as typeof v;
    }
    return v;
  }

  const { data: venue, error: vErr } = await supabase
    .from("venues")
    .insert({ owner_id: userId, name: "Dev Venue", measure_ml: 25, tier: "pro" })
    .select()
    .single();
  if (vErr || !venue) {
    console.error("[DEV_BYPASS] venue insert failed:", vErr?.message, vErr?.code);
    return null;
  }

  await supabase
    .from("venue_members")
    .insert({ venue_id: venue.id, user_id: userId, role: "owner" });

  await supabase.from("profiles").upsert({
    user_id: userId,
    full_name: "Dev User",
    default_view: "tenths",
  }, { onConflict: "user_id" });

  localStorage.setItem("venue_id", venue.id);
  console.log("[DEV_BYPASS] Dev Venue created:", venue.id);
  return venue;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Offline-first profile/venue cache ───────────────────────────────────────
// The stocktake data itself lives in Dexie and works fully offline, but the
// auth gate used to block on a live profiles/venues fetch with no timeout and
// no fallback — on a flaky connection (pub cellar, mobile signal) the app hung
// on the loading spinner forever even though everything it needed was on
// device. These helpers persist the last-known profile+venue so startup can
// hydrate instantly and revalidate in the background.
const CACHE_PROFILE_KEY = "stocktap:cached_profile";
const CACHE_VENUE_KEY = "stocktap:cached_venue";

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota/private-mode — non-fatal */
  }
}

function clearProfileVenueCache(): void {
  try {
    localStorage.removeItem(CACHE_PROFILE_KEY);
    localStorage.removeItem(CACHE_VENUE_KEY);
  } catch {
    /* noop */
  }
}

const PROFILE_FETCH_TIMEOUT_MS = 6000;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  venue: Venue | null;
  loading: boolean;
  /** True when we have a user but the venue fetch failed AND no cache exists — show retry, not venue-setup. */
  venueFetchFailed: boolean;
  bypassError: string | null;
  retryBypass: () => void;
  signOut: () => Promise<void>;
  refreshVenue: () => Promise<void>;
  /** True while the user has a PASSWORD_RECOVERY session and hasn't set their new password yet. */
  passwordRecoveryPending: boolean;
  /** Clear the recovery flag after a successful password update. */
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [venueFetchFailed, setVenueFetchFailed] = useState(false);
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  // Ref so onAuthStateChange always reads the latest value without stale closures
  const bypassPending = useRef(DEV_BYPASS);

  /** Hydrate profile+venue from the on-device cache. Returns true if a venue was restored. */
  const hydrateFromCache = (): boolean => {
    const cachedProfile = readCache<Profile>(CACHE_PROFILE_KEY);
    const cachedVenue = readCache<Venue>(CACHE_VENUE_KEY);
    if (cachedProfile) setProfile(cachedProfile);
    if (cachedVenue) setVenue(cachedVenue);
    return !!cachedVenue;
  };

  const fetchProfileAndVenue = async (userId: string) => {
    const hasCache = !!readCache<Venue>(CACHE_VENUE_KEY);
    try {
      const { data: prof } = await withTimeout(
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        PROFILE_FETCH_TIMEOUT_MS,
        "Profile fetch"
      );
      if (prof) {
        setProfile(prof);
        writeCache(CACHE_PROFILE_KEY, prof);
      }

      const { data: members } = await withTimeout(
        supabase.from("venue_members").select("venue_id").eq("user_id", userId),
        PROFILE_FETCH_TIMEOUT_MS,
        "Venue membership fetch"
      );

      if (members && members.length > 0) {
        let venueId = localStorage.getItem("venue_id");
        if (!venueId || !members.some((m) => m.venue_id === venueId)) {
          venueId = members[0].venue_id;
          localStorage.setItem("venue_id", venueId);
        }
        const { data: v } = await withTimeout(
          supabase.from("venues").select("*").eq("id", venueId!).single(),
          PROFILE_FETCH_TIMEOUT_MS,
          "Venue fetch"
        );
        if (v) {
          setVenue(v);
          writeCache(CACHE_VENUE_KEY, v);
          setVenueFetchFailed(false);
        }
      } else if (DEV_BYPASS) {
        const v = await ensureDevVenue(userId);
        if (v) setVenue(v);
      } else {
        // Server says: genuinely no venue → real venue-setup case.
        setVenue(null);
        clearProfileVenueCache();
        setVenueFetchFailed(false);
      }
    } catch (err) {
      // Network failure / timeout — NOT "no venue". Fall back to cache so the
      // app opens offline; only surface a retry screen when there is no cache.
      console.warn("[Auth] profile/venue fetch failed — using cached copy:", err);
      const restored = hydrateFromCache();
      setVenueFetchFailed(!restored);
    }
  };

  const refreshVenue = async () => {
    if (user) await fetchProfileAndVenue(user.id);
  };

  const runBypass = async () => {
    bypassPending.current = true;
    setBypassError(null);
    setLoading(true);

    const { error } = await doBypassSignIn();

    if (error) {
      bypassPending.current = false;
      setBypassError(error);
      setLoading(false);
    }
    // On success: onAuthStateChange fires with the session → fetchProfileAndVenue → setLoading(false)
    // bypassPending is cleared in the onAuthStateChange handler
  };

  const retryBypass = () => runBypass();

  useEffect(() => {
    // Bug 4 backstop: if session restore never resolves (stale token, network
    // drop), stop blocking the UI after SIGN_IN_TIMEOUT_MS. IMPORTANT: do NOT
    // sign out here — destroying the stored session also destroys offline
    // access to on-device stocktake data. Just unblock; the Supabase client
    // keeps retrying its token refresh in the background.
    let hangTimer = window.setTimeout(() => {
      console.warn("[Auth] Session restore timed out — unblocking UI (session left intact)");
      bypassPending.current = false;
      hydrateFromCache();
      setLoading(false);
    }, SIGN_IN_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Bug 4: immediately evict stale anonymous sessions — they are no longer
      // supported and attempting to use one hangs the Supabase token-refresh
      // cycle, preventing loading from ever reaching false.
      if (isAnonymousSession(session)) {
        console.warn("[Auth] Anonymous session detected — signing out and falling through to landing page");
        await supabase.auth.signOut();
        return; // onAuthStateChange will re-fire with null session → normal no-session path
      }

      // Password recovery: Supabase fires this event when the user follows a
      // reset-password link.  Set the flag so AppShell keeps the user on the
      // /auth page (instead of routing to the dashboard) until they've set a
      // new password.  The session is valid so supabase.auth.updateUser() will
      // work from the set-password form.
      if (event === "PASSWORD_RECOVERY") {
        window.clearTimeout(hangTimer);
        setSession(session);
        setUser(session?.user ?? null);
        setPasswordRecoveryPending(true);
        setLoading(false);
        return;
      }

      window.clearTimeout(hangTimer);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        bypassPending.current = false;
        // Offline-first startup: if we have a cached venue, unblock the UI
        // immediately and revalidate in the background — the app's data layer
        // (Dexie) works fully offline, so the auth gate must never hold the
        // whole app hostage to a slow or dead network.
        const restoredFromCache = hydrateFromCache();
        if (restoredFromCache) {
          setLoading(false);
          void fetchProfileAndVenue(session.user.id); // background revalidate
        } else {
          await fetchProfileAndVenue(session.user.id);
          setLoading(false);
        }
      } else {
        // No session — only unblock loading if we're not waiting for the bypass
        if (bypassPending.current) return;
        setProfile(null);
        setVenue(null);
        setVenueFetchFailed(false);
        clearProfileVenueCache();
        if (!DEV_BYPASS) localStorage.removeItem("venue_id");
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Defense in depth: also catch anonymous sessions from getSession
      // (onAuthStateChange normally fires first, but belt-and-suspenders)
      if (isAnonymousSession(session)) {
        await supabase.auth.signOut();
        return;
      }
      if (session) {
        window.clearTimeout(hangTimer);
        bypassPending.current = false;
        return; // onAuthStateChange already handled it
      }
      if (DEV_BYPASS) {
        await runBypass();
      } else {
        window.clearTimeout(hangTimer);
        bypassPending.current = false;
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(hangTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearPasswordRecovery = () => setPasswordRecoveryPending(false);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, venue, loading, venueFetchFailed, bypassError, retryBypass, signOut, refreshVenue, passwordRecoveryPending, clearPasswordRecovery }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
