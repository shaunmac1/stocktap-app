import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getUncachableStripeClient, getStripeWebhookSecret } from "./stripeClient";

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for webhook processing.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function setVenueTier(
  stripeCustomerId: string,
  tier: "free" | "pro" | "premium",
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("venues")
    .update({ tier, updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", stripeCustomerId);
  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

async function attachCustomerToVenue(
  stripeCustomerId: string,
  venueId: string,
  tier: "pro" | "premium",
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("venues")
    .update({ stripe_customer_id: stripeCustomerId, tier, updated_at: new Date().toISOString() })
    .eq("id", venueId);
  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

async function tierFromSubscription(
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<"free" | "pro" | "premium"> {
  const active = sub.status === "active" || sub.status === "trialing";
  if (!active) return "free";

  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) return "pro";

  const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
  const product = price.product as Stripe.Product | string;
  const productName = typeof product === "string" ? null : product.name;
  if (productName === "StockTap Premium") return "premium";
  if (price.lookup_key?.includes("premium")) return "premium";
  return "pro";
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "Webhook payload must be a Buffer. " +
        "Ensure the webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const stripe = await getUncachableStripeClient();
    const webhookSecret = await getStripeWebhookSecret();

    if (!webhookSecret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is not set. Refusing to process unverified webhook.",
      );
    }

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const venueId = session.metadata?.venue_id;
        const customerId = typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
        if (venueId && customerId) {
          // Expand subscription to get price info
          const subId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
          let tier: "pro" | "premium" = "pro";
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
            const t = await tierFromSubscription(stripe, sub);
            if (t === "premium") tier = "premium";
          }
          await attachCustomerToVenue(customerId, venueId, tier);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const tier = await tierFromSubscription(stripe, sub);
        await setVenueTier(customerId, tier);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await setVenueTier(customerId, "free");
        break;
      }

      default:
        break;
    }
  }
}
