import { useQuery, useMutation } from "@tanstack/react-query";

const API_BASE = "/api";

export interface StripePrice {
  id: string;
  unit_amount: number;
  currency: string;
  lookup_key: string | null;
  product: { name: string } | string;
}

export interface StripeSub {
  id: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | string;
  trial_end: number | null;
  current_period_end: number;
  cancel_at_period_end: boolean;
}

export interface StripePrices {
  pro: StripePrice | null;
  premium: StripePrice | null;
}

export function useStripePrices(interval: "month" | "year" = "month") {
  return useQuery<StripePrices>({
    queryKey: ["stripe-prices", interval],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/stripe/prices?interval=${interval}`);
        if (!res.ok) return { pro: null, premium: null };
        const data = await res.json() as { prices?: StripePrices; pro?: StripePrice; premium?: StripePrice };
        if (data.prices) return data.prices;
        return { pro: data.pro ?? null, premium: data.premium ?? null };
      } catch {
        return { pro: null, premium: null };
      }
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** @deprecated use useStripePrices */
export function useStripePrice() {
  const { data, isLoading, error } = useStripePrices();
  return {
    data: data?.pro ?? null,
    isLoading,
    error,
  };
}

export function useStripeSubscription(stripeCustomerId: string | null | undefined) {
  return useQuery<StripeSub | null>({
    queryKey: ["stripe-subscription", stripeCustomerId],
    queryFn: async () => {
      if (!stripeCustomerId) return null;
      try {
        const res = await fetch(`${API_BASE}/stripe/subscription/${stripeCustomerId}`);
        if (!res.ok) return null;
        const { subscription } = await res.json() as { subscription: StripeSub | null };
        return subscription ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!stripeCustomerId,
    staleTime: 2 * 60_000,
    retry: false,
  });
}

export function useStartCheckout() {
  return useMutation({
    mutationFn: async ({ email, venueId, priceId, trialEndsAt }: { email: string; venueId: string; priceId: string; trialEndsAt?: string | null }) => {
      // Anonymous dev-bypass sessions have no email; use a venue-scoped placeholder
      // so Stripe can still create/find a customer record during testing.
      const resolvedEmail = email || `venue-${venueId}@stocktap.dev`;
      const base = window.location.origin;
      const successUrl = `${base}/settings?tab=subscription&checkout=success`;
      const cancelUrl = `${base}/settings?tab=subscription`;
      const res = await fetch(`${API_BASE}/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resolvedEmail, venueId, priceId, successUrl, cancelUrl, trialEndsAt: trialEndsAt ?? null }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      return data as { url: string };
    },
    onSuccess: ({ url }) => { window.location.href = url; },
  });
}

export function useOpenPortal() {
  return useMutation({
    mutationFn: async (stripeCustomerId: string) => {
      const returnUrl = `${window.location.origin}/settings?tab=subscription`;
      const res = await fetch(`${API_BASE}/stripe/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeCustomerId, returnUrl }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Portal failed");
      return data as { url: string };
    },
    onSuccess: ({ url }) => { window.location.href = url; },
  });
}

/** Where the venue is in its automatic 14-day no-card Pro trial (set by a DB trigger on venue creation). */
export function venueTrial(venue: { tier?: string; trial_ends_at?: string | null } | null | undefined): {
  active: boolean;
  daysLeft: number;
  endsAt: Date | null;
} {
  if (!venue?.trial_ends_at) return { active: false, daysLeft: 0, endsAt: null };
  const endsAt = new Date(venue.trial_ends_at);
  const remainingMs = endsAt.getTime() - Date.now();
  return {
    active: venue.tier !== "free" && remainingMs > 0,
    daysLeft: Math.max(0, Math.ceil(remainingMs / 86_400_000)),
    endsAt,
  };
}
