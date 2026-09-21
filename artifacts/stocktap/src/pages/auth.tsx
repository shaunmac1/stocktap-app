import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { validateNewPassword, normaliseOtpCode } from "@/lib/auth-utils";

type AuthMode =
  | "login"
  | "signup"
  | "check_email"
  | "venue_setup"
  | "onboarding_import"
  | "onboarding_weigh"
  | "forgot_password"
  | "check_email_reset"
  | "set_password"
  | "otp_verify";

// Onboarding intent flag: sessionStorage timestamp with a 90-second TTL.
/**
 * Auth links (sign-in code, password reset, confirm, invite) land on
 * stocktap.net with `?token_hash=…&type=…` and are exchanged here, rather than
 * pointing at Supabase's verify endpoint. Gmail's link scanner prefetches
 * links; Supabase's endpoint burns the token on that prefetch, ours doesn't.
 * Module-level so a React StrictMode double-mount can't exchange it twice.
 */
type PendingLink =
  | { kind: "token"; type: string; tokenHash: string; started?: boolean }
  | { kind: "error"; type: string; message: string };
let pendingLink: PendingLink | null = null;
const EXPIRED_LINK_MESSAGE = "That link has expired or has already been used. Request a new one below.";

const ONBOARDING_FLAG = "st_onb";
const ONBOARDING_TTL_MS = 90_000;
function readOnboardingFlag(): boolean {
  try {
    const t = Number(sessionStorage.getItem(ONBOARDING_FLAG) || 0);
    return !!t && Date.now() - t < ONBOARDING_TTL_MS;
  } catch {
    return false;
  }
}
function setOnboardingFlag() {
  try { sessionStorage.setItem(ONBOARDING_FLAG, String(Date.now())); } catch { /* private mode */ }
}
function clearOnboardingFlag() {
  try { sessionStorage.removeItem(ONBOARDING_FLAG); } catch { /* private mode */ }
}

export default function Auth() {
  const {
    user,
    venue,
    loading: authLoading,
    refreshVenue,
    passwordRecoveryPending,
    clearPasswordRecovery,
    beginPasswordRecovery,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [venueName, setVenueName] = useState("");
  const [measureMl, setMeasureMl] = useState("25");
  const [referralCode, setReferralCode] = useState("");
  const [joinAsStaff, setJoinAsStaff] = useState(false);
  const [staffCode, setStaffCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>(() => {
    // Onboarding intent survives the provider remount that happens after venue
    // setup (refreshVenue → AuthProvider re-renders → this page remounts).
    if (readOnboardingFlag()) return "onboarding_import";
    return new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "login";
  });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Exchange a token_hash link that landed on our own domain (see pendingLink).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("error")) {
      const code = hash.get("error_code") || "";
      pendingLink = {
        kind: "error",
        type: params.get("type") || hash.get("type") || "",
        message: code === "otp_expired"
          ? EXPIRED_LINK_MESSAGE
          : hash.get("error_description")?.replace(/\+/g, " ") || "That link didn't work. Request a new one below.",
      };
      window.history.replaceState(null, "", window.location.pathname);
    } else if (params.get("token_hash") && params.get("type")) {
      pendingLink = { kind: "token", type: params.get("type")!, tokenHash: params.get("token_hash")! };
      window.history.replaceState(null, "", window.location.pathname);
      if (pendingLink.type === "recovery") beginPasswordRecovery();
    }
    const link = pendingLink;
    if (!link) return;
    if (link.kind === "error") {
      pendingLink = null;
      setAuthError(link.message);
      setMode(link.type === "recovery" ? "forgot_password" : "login");
      return;
    }
    if (link.kind === "token" && !link.started) {
      link.started = true;
      (async () => {
        setLoading(true);
        try {
          if (link.type === "recovery") {
            const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: "recovery" });
            if (error) throw error;
            pendingLink = null;
            setMode("set_password");
          } else {
            const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: "email" });
            if (error) throw error;
            pendingLink = null;
          }
        } catch {
          pendingLink = { kind: "error", type: link.type, message: EXPIRED_LINK_MESSAGE };
          setAuthError(EXPIRED_LINK_MESSAGE);
          setMode(link.type === "recovery" ? "forgot_password" : "login");
          clearPasswordRecovery();
        } finally {
          setLoading(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a password-recovery token is detected by AuthContext, switch directly
  // to the set-password form regardless of what mode we were in.
  useEffect(() => {
    if (passwordRecoveryPending) {
      setMode("set_password");
      setAuthError(null);
    }
  }, [passwordRecoveryPending]);

  // Route authenticated users with a venue to the dashboard.
  // Guard: skip if we're in the middle of a password-recovery flow.
  useEffect(() => {
    if (passwordRecoveryPending) return;
    if (!user || authLoading) return;
    if (mode === "onboarding_import" || mode === "onboarding_weigh") return;
    if (venue) {
      setLocation("/");
      return;
    }
    if (mode !== "venue_setup") {
      setMode("venue_setup");
    }
  }, [user, venue, authLoading, mode, passwordRecoveryPending]);

  // ── Email/password sign-in and sign-up ──────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setMode("check_email");
          return;
        }
        toast({ title: "Account created", description: "Welcome to StockTap" });
        setMode("venue_setup");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setLocation("/");
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Auth error:", err);
      const message = err?.message || err?.error_description || "Something went wrong. Please try again.";
      setAuthError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Google sign-in failed", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  // ── Magic link / OTP code ────────────────────────────────────────────────────
  // Supabase sends BOTH a clickable magic link AND a 6-digit OTP code in the
  // same email.  We show the 6-digit code entry instead of the link so that
  // Gmail's link-scanner prefetch cannot consume the token before the user
  // clicks — the code survives prefetch.
  const handleMagicLink = async () => {
    if (!email) {
      toast({
        title: "Enter your email first",
        description: "Type your email address above, then tap this again.",
        variant: "destructive",
      });
      return;
    }
    setMagicLinkLoading(true);
    setAuthError(null);
    try {
      const redirectTo =
        window.location.origin +
        import.meta.env.BASE_URL.replace(/\/$/, "") +
        "/auth";
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMode("otp_verify");
      toast({ title: "Code sent", description: `Check ${email} for your sign-in link.` });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setMagicLinkLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const code = normaliseOtpCode(otpCode);
    if (code.length !== 6) {
      setAuthError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;
      // onAuthStateChange fires next → AuthContext sets user → AppShell routes to dashboard
    } catch (err: any) {
      const message = err?.message || "Code incorrect or expired. Request a new one.";
      setAuthError(message);
      toast({ title: "Invalid code", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password ──────────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      const redirectTo =
        window.location.origin +
        import.meta.env.BASE_URL.replace(/\/$/, "") +
        "/auth";
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMode("check_email_reset");
    } catch (err: any) {
      const message = err?.message || "Something went wrong. Please try again.";
      setAuthError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Set new password (recovery flow) ─────────────────────────────────────────
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const validation = validateNewPassword(newPassword);
    if (!validation.valid) {
      setAuthError(validation.error);
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      clearPasswordRecovery();
      toast({ title: "Password updated", description: "You are now signed in." });
      setLocation("/");
    } catch (err: any) {
      const message = err?.message || "Something went wrong. Please try again.";
      setAuthError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Venue setup ───────────────────────────────────────────────────────────────
  // Staff joining an existing venue with a code — never creates a venue.
  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "You're not signed in", description: "Please sign in again to link your phone.", variant: "destructive" });
      setMode("login");
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.rpc("redeem_staff_code" as any, { p_code: staffCode.trim().toUpperCase() });
      if (error) throw error;
      await refreshVenue();
      toast({ title: "You're linked", description: "You can clock in from your phone now." });
      // AppShell will route to the clock screen once role === 'staff' loads.
    } catch (err: any) {
      const raw = (err?.message || "").toLowerCase();
      const message = raw.includes("invalid_code")
        ? "That code isn't right. Double-check it with your manager."
        : raw.includes("code_used")
        ? "That code is already linked to another phone."
        : err?.message || "Couldn't link your phone. Try again.";
      setAuthError(message);
      toast({ title: "Couldn't link", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVenueSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "You're not signed in",
        description: "Your session expired or your email isn't confirmed yet. Please sign in again to finish setup.",
        variant: "destructive",
      });
      setMode("login");
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const { data: venueData, error: venueError } = await supabase
        .from("venues")
        .insert({
          owner_id: user.id,
          name: venueName,
          measure_ml: parseInt(measureMl),
          tier: "free",
        })
        .select()
        .single();
      if (venueError) throw venueError;

      const { error: memberError } = await supabase
        .from("venue_members")
        .insert({ venue_id: venueData.id, user_id: user.id, role: "owner" });
      if (memberError) throw memberError;

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, full_name: email.split("@")[0], default_view: "tenths" },
          { onConflict: "user_id" }
        );
      if (profileError) throw profileError;

      localStorage.setItem("venue_id", venueData.id);

      if (referralCode.trim()) {
        const { error: redeemError } = await supabase.rpc("redeem_referral_code", {
          p_code: referralCode.trim().toUpperCase(),
          p_venue_id: venueData.id,
        });
        if (redeemError) {
          toast({ title: "Referral code not applied", description: redeemError.message, variant: "destructive" });
        } else {
          toast({ title: "Referral code applied", description: "Thanks for using an invite!" });
        }
      }

      // Set the flag and the mode BEFORE refreshVenue: the venue refresh remounts
      // this page and the flag is what brings the onboarding step back.
      setOnboardingFlag();
      setMode("onboarding_import");
      // Make sure the remounted app lands on this page, not on Home, whatever
      // URL the user reached venue setup from.
      setLocation("/auth");
      await refreshVenue();
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Venue setup error:", err);
      const message = err?.message || err?.error_description || "Something went wrong. Please try again.";
      setAuthError(message);
      toast({ title: "Error setting up venue", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Panels ────────────────────────────────────────────────────────────────────

  if (mode === "set_password") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center text-primary">Set new password</CardTitle>
            <p className="text-center text-sm text-muted-foreground mt-1">
              Choose a new password for your account.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  data-testid="input-confirm-password"
                />
              </div>
              {authError && (
                <p className="text-sm text-destructive" role="alert" data-testid="text-auth-error">
                  {authError}
                </p>
              )}
              <Button type="submit" className="w-full h-12" disabled={loading}>
                {loading ? "Saving…" : "Set password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "otp_verify") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center text-primary">Enter sign-in code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              We've sent a 6-digit code to{" "}
              <strong className="text-foreground">{email}</strong>. Enter it below, or tap the button in the email.
            </p>
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-code">6-digit code</Label>
                <Input
                  id="otp-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  className="text-center text-2xl font-mono tracking-[0.4em] h-14"
                  value={otpCode}
                  onChange={(e) => setOtpCode(normaliseOtpCode(e.target.value))}
                  data-testid="input-otp-code"
                  autoFocus
                />
              </div>
              {authError && (
                <p className="text-sm text-destructive" role="alert" data-testid="text-auth-error">
                  {authError}
                </p>
              )}
              <Button type="submit" className="w-full h-12" disabled={loading || otpCode.length !== 6}>
                {loading ? "Verifying…" : "Sign in"}
              </Button>
            </form>
            <Button
              type="button"
              variant="link"
              className="w-full text-sm"
              onClick={handleMagicLink}
              disabled={magicLinkLoading}
            >
              {magicLinkLoading ? "Sending…" : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode("login"); setAuthError(null); setOtpCode(""); }}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "forgot_password") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center text-primary">Reset your password</CardTitle>
            <p className="text-center text-sm text-muted-foreground mt-1">
              Enter your email and we'll send a reset link.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-reset-email"
                />
              </div>
              {authError && (
                <p className="text-sm text-destructive" role="alert" data-testid="text-auth-error">
                  {authError}
                </p>
              )}
              <Button type="submit" className="w-full h-12" disabled={loading || !email}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode("login"); setAuthError(null); }}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "check_email_reset") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center text-primary">Check your email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              We've sent a password reset link to{" "}
              <strong className="text-foreground">{email}</strong>. Click it and you'll be taken
              back here to set your new password.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode("login"); setAuthError(null); }}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "check_email") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center text-primary">Check your email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              We've sent a confirmation link to{" "}
              <strong className="text-foreground">{email}</strong>. Open it, then come back and
              sign in to finish setting up your venue.
            </p>
            <Button
              className="w-full h-12"
              onClick={() => setMode("login")}
              data-testid="button-check-email-done"
            >
              I've confirmed — sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "onboarding_import") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center text-primary">Your first count, in twenty minutes</CardTitle>
            <p className="text-center text-sm text-muted-foreground mt-1">
              Pick your 20 biggest sellers, put each open bottle on the scale, and you'll have your first real
              number. Prices and the rest of the range can come after.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full h-12"
              onClick={() => {
                clearOnboardingFlag();
                setLocation("/first-count");
              }}
              data-testid="button-onboarding-first-count"
            >
              Pick my 20 biggest sellers and count them
            </Button>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                clearOnboardingFlag();
                setLocation("/library?starter=1");
              }}
              data-testid="button-onboarding-starter"
            >
              Import the full UK pub catalogue instead (140+ lines)
            </Button>
            {/* "Import my own CSV" is hidden until the importer matches rows to the
                calibrated catalogue; the catalogue is the reliable path for now. */}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                clearOnboardingFlag();
                setMode("onboarding_weigh");
              }}
            >
              Skip — add bottles manually
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "onboarding_weigh") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center text-primary">Weigh your first bottle</CardTitle>
            <p className="text-center text-sm text-muted-foreground mt-1">
              Add a bottle to your library, then weigh it to see your first reading. Takes about 30
              seconds.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Add a bottle in your Library</li>
              <li>Place it on your kitchen scales</li>
              <li>Enter the gram reading — StockTap does the rest</li>
            </ol>
            <Button className="w-full h-12 mt-2" onClick={() => setLocation("/library")}>
              Go to Library
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setLocation("/")}>
              Skip — go to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "venue_setup") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-primary">
              {joinAsStaff ? "Join your team" : "Setup Venue"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {joinAsStaff ? (
              <form onSubmit={handleJoinTeam} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="staffCode">Your code</Label>
                  <Input
                    id="staffCode"
                    required
                    value={staffCode}
                    onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 4F2A9C"
                    className="uppercase tracking-widest text-center text-lg font-mono"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the code your manager gave you to link this phone. You'll be able to clock in and out — that's it.
                  </p>
                </div>
                {authError && (
                  <p className="text-sm text-destructive" role="alert">{authError}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Linking…" : "Link my phone"}
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground underline underline-offset-2"
                  onClick={() => { setJoinAsStaff(false); setAuthError(null); }}
                >
                  I'm setting up a venue instead
                </button>
              </form>
            ) : (
            <form onSubmit={handleVenueSetup} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="venueName">Venue Name</Label>
                <Input
                  id="venueName"
                  required
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="The Red Lion"
                />
              </div>
              <div className="space-y-3">
                <Label>Default Measure</Label>
                <RadioGroup value={measureMl} onValueChange={setMeasureMl} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="25" id="r25" />
                    <Label htmlFor="r25">25ml</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="35" id="r35" />
                    <Label htmlFor="r35">35ml</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="referralCode">Referral code (optional)</Label>
                <Input
                  id="referralCode"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="e.g. REDLION4F2A"
                  className="uppercase"
                  data-testid="input-referral-code"
                />
                <p className="text-xs text-muted-foreground">
                  Got a code from another venue? Enter it here — they'll get a free month of Pro once
                  you've been on Pro for 30 days.
                </p>
              </div>
              {authError && (
                <p className="text-sm text-destructive" role="alert" data-testid="text-auth-error">
                  {authError}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Complete Setup"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline underline-offset-2"
                onClick={() => { setJoinAsStaff(true); setAuthError(null); }}
              >
                Joining a team? Enter your code instead
              </button>
            </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Default: login / signup ───────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center text-primary">StockTap</CardTitle>
          <p className="text-center text-muted-foreground text-sm">
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "login" && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs text-muted-foreground font-normal"
                    onClick={() => { setMode("forgot_password"); setAuthError(null); }}
                    data-testid="button-forgot-password"
                  >
                    Forgot password?
                  </Button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {authError && (
              <p className="text-sm text-destructive" role="alert" data-testid="text-auth-error">
                {authError}
              </p>
            )}
            <Button type="submit" className="w-full h-12 text-lg font-medium" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Sign Up"}
            </Button>
          </form>
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 gap-2"
            onClick={handleGoogleSignIn}
            disabled={loading}
            data-testid="button-google-signin"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.87c2.27-2.09 3.58-5.17 3.58-8.84Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-3.02c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.12A12 12 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.61H1.27a12 12 0 0 0 0 10.78l4-3.12Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.12C6.22 6.87 8.87 4.75 12 4.75Z"
              />
            </svg>
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="link"
            className="w-full mt-2 h-auto py-1 text-sm"
            onClick={handleMagicLink}
            disabled={magicLinkLoading}
            data-testid="button-magic-link"
          >
            {magicLinkLoading ? "Sending…" : "Email me a sign-in code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full mt-2"
            onClick={() => {
              setAuthError(null);
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
