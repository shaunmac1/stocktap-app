import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, DEV_BYPASS } from "@/contexts/AuthContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { SyncBanner } from "@/components/SyncBanner";

import { requiresVenueSetup } from "@/lib/auth-utils";
import NotFound from "@/pages/not-found";
import Auth from "@/pages/auth";
import Landing from "@/pages/landing";
import Help from "@/pages/help";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import Home from "@/pages/home";
import Library from "@/pages/library";
import Stocktake from "@/pages/stocktake";
import SpotCheck from "@/pages/spot-check";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import Ledger from "@/pages/ledger";
import Suggestions from "@/pages/suggestions";
import InvoiceScan from "@/pages/invoice-scan";
import DailyBoard from "@/pages/daily-board";
import Team from "@/pages/team";
import { Layout } from "@/components/Layout";

const queryClient = new QueryClient();

// ─── Dev banner ───────────────────────────────────────────────────────────────
function DevBannerBar() {
  const { bypassError, retryBypass, loading } = useAuth();
  if (!DEV_BYPASS) return null;

  if (bypassError) {
    return (
      <div className="w-full bg-red-600 text-white text-xs font-medium px-3 py-2 shrink-0 z-[9999]">
        <div className="font-bold uppercase tracking-widest mb-1">DEV BYPASS FAILED</div>
        <pre className="whitespace-pre-wrap font-mono opacity-90 break-all mb-2 text-[10px]">{bypassError}</pre>
        <button
          onClick={retryBypass}
          className="bg-white text-red-700 font-bold text-xs px-3 py-1 rounded"
        >
          Retry bypass
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-400 text-amber-950 text-[11px] font-bold text-center py-1 px-2 tracking-widest uppercase shrink-0 select-none z-[9999]">
      {loading ? "DEV MODE — signing in…" : "DEV MODE — anonymous session — RLS on"}
    </div>
  );
}

function BypassLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Signing in to dev session…</p>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return DEV_BYPASS ? <BypassLoading /> : <div className="flex-1 flex items-center justify-center p-8">Loading…</div>;
  if (!user) return <Redirect to="/auth" />;
  return <Layout><Component /></Layout>;
}

// Stable route-level wrappers — defined at module scope so wouter always receives
// the same function reference as the `component` prop.  Passing a new arrow
// function on every AppRouter render would make React treat it as a brand-new
// component type on each render, unmounting and remounting the whole subtree
// (Library, Stocktake, etc.) on every navigation or auth-state change.
const HomeRouteAuth    = () => <ProtectedRoute component={Home} />;
const LibraryRoute     = () => <ProtectedRoute component={Library} />;
const StocktakeRoute   = () => <ProtectedRoute component={Stocktake} />;
const SpotCheckRoute   = () => <ProtectedRoute component={SpotCheck} />;
const ReportsRoute     = () => <ProtectedRoute component={Reports} />;
const SettingsRoute    = () => <ProtectedRoute component={Settings} />;
const LedgerRoute      = () => <ProtectedRoute component={Ledger} />;
const InvoiceScanRoute = () => <ProtectedRoute component={InvoiceScan} />;
const SuggestionsRoute = () => <ProtectedRoute component={Suggestions} />;
const DailyBoardRoute  = () => <ProtectedRoute component={DailyBoard} />;
const TeamRoute        = () => <ProtectedRoute component={Team} />;

function AppRouter({ authenticated }: { authenticated: boolean }) {
  return (
    <Switch>
      <Route path="/auth"          component={Auth} />
      <Route path="/help"          component={Help} />
      <Route path="/terms"         component={Terms} />
      <Route path="/privacy"       component={Privacy} />
      <Route path="/"              component={authenticated ? HomeRouteAuth : Landing} />
      <Route path="/daily-board"   component={DailyBoardRoute} />
      <Route path="/team"          component={TeamRoute} />
      <Route path="/library"       component={LibraryRoute} />
      <Route path="/stocktake"     component={StocktakeRoute} />
      <Route path="/spot-check"    component={SpotCheckRoute} />
      <Route path="/reports"       component={ReportsRoute} />
      <Route path="/settings"      component={SettingsRoute} />
      <Route path="/ledger"        component={LedgerRoute} />
      <Route path="/invoice-scan"  component={InvoiceScanRoute} />
      <Route path="/suggestions"   component={SuggestionsRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

// AuthenticatedApp: mounts after user + venue are confirmed, wraps in SyncProvider
function AuthenticatedApp() {
  return (
    <SyncProvider>
      <SyncBanner />
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppRouter authenticated />
      </WouterRouter>
    </SyncProvider>
  );
}

// AppShell: reads auth state, conditionally mounts SyncProvider.
//
// Loading is handled first — we show a spinner while auth state is being
// determined so AuthenticatedApp never mounts into a venue-less state.
//
// Three cases where we show the unauth router rather than AuthenticatedApp:
//   1. No user — normal unauthenticated landing
//   2. passwordRecoveryPending — user has a valid session but must set a new
//      password before we route them to the dashboard
//   3. needsVenueSetup — authenticated user whose venue-creation step was
//      never completed; Auth detects user && !venue and renders the venue-setup form
// Shown when the user is signed in but the venue fetch failed with no on-device
// cache (first login on a dead connection). Distinct from venue-setup — the
// account may well HAVE a venue; we just couldn't reach the server to find out.
function VenueFetchRetry() {
  const { refreshVenue } = useAuth();
  const [retrying, setRetrying] = React.useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
      <p className="font-semibold">Can't reach the server</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        You're signed in, but we couldn't load your venue. Check your connection and try again.
      </p>
      <button
        className="bg-primary text-primary-foreground font-medium px-4 py-2 rounded-md disabled:opacity-50"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          try { await refreshVenue(); } finally { setRetrying(false); }
        }}
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function AppShell() {
  const { user, venue, loading, venueFetchFailed, passwordRecoveryPending } = useAuth();
  const needsVenueSetup =
    !venueFetchFailed && requiresVenueSetup(loading, user, venue, passwordRecoveryPending);

  // Only show the full authenticated experience once loading has settled AND the
  // user has a complete account (user + venue).  Gating on !loading eliminates the
  // race where loading=true briefly lets AuthenticatedApp render without a venue.
  const showAuthenticatedApp = !loading && !!user && !passwordRecoveryPending && !needsVenueSetup;

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <DevBannerBar />
      <div className="flex-1 flex flex-col">
        {loading ? (
          DEV_BYPASS ? (
            <BypassLoading />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )
        ) : showAuthenticatedApp ? (
          <AuthenticatedApp />
        ) : user && venueFetchFailed && !venue ? (
          <VenueFetchRetry />
        ) : (
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {/* Render Auth directly for recovery/no-venue so useLocation() works */}
            {(passwordRecoveryPending || needsVenueSetup) ? (
              <Auth />
            ) : (
              <AppRouter authenticated={false} />
            )}
          </WouterRouter>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AppShell />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
