import { describe, expect, it } from "vitest";
import { isAnonymousSession, validateNewPassword, normaliseOtpCode, requiresVenueSetup } from "./auth-utils";

describe("isAnonymousSession", () => {
  it("returns true for stale anonymous Supabase sessions", () => {
    expect(isAnonymousSession({
      user: { app_metadata: { provider: "anonymous" } },
    } as any)).toBe(true);
  });

  it("returns false for email/password sessions", () => {
    expect(isAnonymousSession({
      user: { app_metadata: { provider: "email" } },
    } as any)).toBe(false);
  });

  it("returns false for Google OAuth sessions", () => {
    expect(isAnonymousSession({
      user: { app_metadata: { provider: "google", providers: ["google"] } },
    } as any)).toBe(false);
  });

  it("returns false for sessions where app_metadata has no provider field", () => {
    expect(isAnonymousSession({
      user: { app_metadata: {} },
    } as any)).toBe(false);
  });

  it("returns false for null session (no stored session — normal first-visit)", () => {
    expect(isAnonymousSession(null)).toBe(false);
  });

  it("returns false for session with null user", () => {
    expect(isAnonymousSession({ user: null } as any)).toBe(false);
  });
});

describe("validateNewPassword", () => {
  it("accepts passwords of exactly 8 characters", () => {
    expect(validateNewPassword("exactly8")).toEqual({ valid: true, error: null });
  });

  it("accepts passwords longer than 8 characters", () => {
    expect(validateNewPassword("SecurePassw0rd!")).toEqual({ valid: true, error: null });
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = validateNewPassword("short");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/8 character/);
  });

  it("rejects empty string", () => {
    const result = validateNewPassword("");
    expect(result.valid).toBe(false);
    expect(result.error).not.toBeNull();
  });

  it("rejects a 7-character password", () => {
    expect(validateNewPassword("seven77").valid).toBe(false);
  });
});

describe("normaliseOtpCode", () => {
  it("returns digits as-is", () => {
    expect(normaliseOtpCode("123456")).toBe("123456");
  });

  it("strips spaces from a pasted code", () => {
    expect(normaliseOtpCode("1 2 3 4 5 6")).toBe("123456");
  });

  it("strips dashes and other non-digit characters", () => {
    expect(normaliseOtpCode("12-34-56")).toBe("123456");
  });

  it("limits output to 6 digits", () => {
    expect(normaliseOtpCode("1234567890")).toBe("123456");
  });

  it("returns empty string for non-digit input", () => {
    expect(normaliseOtpCode("abcdef")).toBe("");
  });

  it("handles partial input (fewer than 6 digits)", () => {
    expect(normaliseOtpCode("123")).toBe("123");
  });
});

// ── requiresVenueSetup ────────────────────────────────────────────────────────
// This guard is the single source of truth for routing venue-less users to the
// onboarding screen.  It must return true for every sign-in method (email,
// Google, OTP/magic-link) when auth has loaded but the user has no venue.
const USER = { id: "user-123" };
const VENUE = { id: "venue-456" };

describe("requiresVenueSetup", () => {
  it("returns true: authenticated user with no venue membership (the bug scenario)", () => {
    expect(requiresVenueSetup(false, USER, null, false)).toBe(true);
  });

  it("returns true: user is defined but venue is undefined (pre-fetch race)", () => {
    expect(requiresVenueSetup(false, USER, undefined, false)).toBe(true);
  });

  it("returns false while auth is still loading (venue fetch may be in-flight)", () => {
    expect(requiresVenueSetup(true, USER, null, false)).toBe(false);
  });

  it("returns false when the user has a venue", () => {
    expect(requiresVenueSetup(false, USER, VENUE, false)).toBe(false);
  });

  it("returns false when the user is not authenticated", () => {
    expect(requiresVenueSetup(false, null, null, false)).toBe(false);
  });

  it("returns false during password-recovery flow (recovery takes priority over venue setup)", () => {
    expect(requiresVenueSetup(false, USER, null, true)).toBe(false);
  });

  it("returns false when both user and venue are null (unauthenticated, no venue)", () => {
    expect(requiresVenueSetup(false, null, null, false)).toBe(false);
  });
});
