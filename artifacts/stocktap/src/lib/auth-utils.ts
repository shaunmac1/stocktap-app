import type { Session } from "@supabase/supabase-js";

/**
 * Returns true if the session belongs to an anonymous Supabase user.
 *
 * Anonymous auth was used in very early builds of StockTap. The session is
 * persisted to localStorage, so browsers that ran those builds will restore it
 * on every subsequent load. The new auth flow no longer supports anonymous
 * sessions — they have no venue and no valid refresh token — and restoring one
 * causes the Supabase client to attempt a token refresh that can hang
 * indefinitely, leaving the app stuck on the loading splash.
 *
 * Detecting and evicting these sessions immediately on startup is the primary
 * fix; the SIGN_IN_TIMEOUT_MS hang-timer in AuthContext is the backstop.
 */
export function isAnonymousSession(session: Session | null): boolean {
  if (!session?.user) return false;
  return session.user.app_metadata?.provider === "anonymous";
}

/**
 * Validates a new password for the reset-password flow.
 * Returns { valid: true, error: null } on success, or { valid: false, error: "..." }.
 */
export function validateNewPassword(password: string): { valid: boolean; error: string | null } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters." };
  }
  return { valid: true, error: null };
}

/**
 * Strips non-digit characters and limits to 6 digits for OTP entry.
 * Suitable for normalising user input from a numeric code field before
 * calling supabase.auth.verifyOtp().
 */
export function normaliseOtpCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

/**
 * Returns true when an authenticated user still needs to complete venue setup.
 *
 * This can happen for any sign-in method (email+password, Google OAuth, magic
 * link / OTP) if the user's account was created but the venue-creation step
 * was never finished.  The app must route these users to the venue-setup form
 * and must not render the dashboard or library without a venue.
 *
 * Guards:
 *   - loading=true  → not safe to decide yet (fetchProfileAndVenue is in flight)
 *   - !user         → unauthenticated, handled by the normal auth gate
 *   - passwordRecoveryPending → recovery flow takes priority; venue setup
 *                               happens after the new password is set
 */
export function requiresVenueSetup(
  loading: boolean,
  user: { id: string } | null | undefined,
  venue: { id: string } | null | undefined,
  passwordRecoveryPending: boolean,
): boolean {
  return !loading && !!user && !venue && !passwordRecoveryPending;
}
