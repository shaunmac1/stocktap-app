import { Router, type IRouter } from "express";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

// Both prices — returns { pro, premium }. Pass ?interval=year for annual pricing.
router.get("/stripe/prices", async (req, res) => {
  try {
    const interval = req.query.interval === "year" ? "year" : "month";
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });

    const matches = (name: string) => (p: (typeof prices.data)[number]) => {
      const prod = p.product as { name?: string; active?: boolean } | null;
      return prod?.active && prod?.name === name && p.recurring?.interval === interval;
    };

    const pro = prices.data.find(matches("StockTap")) ?? null;
    const premium = prices.data.find(matches("StockTap Premium")) ?? null;

    if (!pro && !premium) {
      res.status(404).json({
        error: `No StockTap ${interval}ly prices found. Add ${interval}ly recurring prices to the StockTap and StockTap Premium products in Stripe.`,
      });
      return;
    }

    res.json({ prices: { pro, premium } });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Legacy single-price endpoint — returns Pro price for backward compat
router.get("/stripe/price", async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ active: true, limit: 20, expand: ["data.product"] });
    const price = prices.data.find((p) => {
      const prod = p.product as { name?: string; active?: boolean } | null;
      return prod?.active && prod?.name === "StockTap";
    }) ?? null;
    if (!price) {
      res.status(404).json({ error: "StockTap price not found. Run the seed script." });
      return;
    }
    res.json({ price });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Subscription status — looks up by stripe_customer_id stored on venue
router.get("/stripe/subscription/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!customerId) {
      res.json({ subscription: null });
      return;
    }
    const stripe = await getUncachableStripeClient();
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
    });
    const sub = subs.data[0] ?? null;
    if (!sub) {
      res.json({ subscription: null });
      return;
    }
    res.json({
      subscription: {
        id: sub.id,
        status: sub.status,
        trial_end: sub.trial_end,
        current_period_end: sub.items?.data[0]?.current_period_end ?? null,
        cancel_at_period_end: sub.cancel_at_period_end,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create Stripe Checkout Session — accepts explicit priceId
router.post("/stripe/checkout", async (req, res) => {
  try {
    const { email, venueId, priceId, successUrl, cancelUrl } = req.body as {
      email: string;
      venueId: string;
      priceId?: string;
      successUrl: string;
      cancelUrl: string;
    };
    if (!email || !venueId || !successUrl || !cancelUrl) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const stripe = await getUncachableStripeClient();

    // Find or create Stripe customer keyed by venue_id metadata
    const existing = await stripe.customers.search({
      query: `metadata["venue_id"]:"${venueId}"`,
      limit: 1,
    });
    let customerId: string;
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { venue_id: venueId },
      });
      customerId = customer.id;
    }

    // Resolve price — use explicit priceId if provided, else fall back to Pro price
    let resolvedPriceId = priceId;
    if (!resolvedPriceId) {
      const prices = await stripe.prices.list({ active: true, limit: 20, expand: ["data.product"] });
      const fallback = prices.data.find((p) => {
        const prod = p.product as { name?: string; active?: boolean } | null;
        return prod?.active && prod?.name === "StockTap";
      });
      if (!fallback) {
        res.status(404).json({ error: "No active StockTap price found. Run the seed script first." });
        return;
      }
      resolvedPriceId = fallback.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: {
        trial_period_days: 14,
        metadata: { venue_id: venueId },
      },
      metadata: { venue_id: venueId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Open Stripe Customer Portal for billing management
router.post("/stripe/portal", async (req, res) => {
  try {
    const { stripeCustomerId, returnUrl } = req.body as {
      stripeCustomerId: string;
      returnUrl: string;
    };
    if (!stripeCustomerId || !returnUrl) {
      res.status(400).json({ error: "Missing stripeCustomerId or returnUrl" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    res.json({ url: portalSession.url });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
