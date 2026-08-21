import Stripe from "stripe";
import { logger } from "./lib/logger";

async function getStripeCredentials(): Promise<{
  secretKey: string;
  webhookSecret: string | undefined;
}> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const isProduction = process.env.NODE_ENV === "production";
  const xReplitToken = isProduction && process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe integration not connected. Connect Stripe via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status}`);
  }

  const data = await resp.json() as {
    items?: Array<{
      environment?: string;
      settings?: { secret?: string; secret_key?: string; webhook_secret?: string; account_id?: string };
    }>;
  };
  const items = data.items ?? [];

  // The connector API returns ALL connections for this connector (dev AND
  // production) in one response — it does NOT filter by the token used to
  // call it. We must explicitly pick the item matching the current runtime
  // environment instead of blindly taking items[0] (which is the dev
  // connection, causing production to silently use sandbox/test keys).
  const wantEnvironment = isProduction ? "production" : "development";
  const match = items.find((item) => item.environment === wantEnvironment);
  if (isProduction && !match) {
    // FAIL CLOSED: in production, silently falling back to the dev connection
    // would mean taking real customers to a Stripe TEST checkout. Refuse instead.
    throw new Error(
      "No PRODUCTION Stripe connection found in the Replit connector. " +
      "Open Integrations → Stripe and connect the live account for production.",
    );
  }
  const settings = (match ?? items[0])?.settings;

  const secretKey = settings?.secret ?? settings?.secret_key;
  if (!secretKey) {
    throw new Error(
      "Stripe integration not connected or missing secret key. Connect Stripe via the Integrations tab.",
    );
  }

  logger.info(
    {
      tokenType: xReplitToken.startsWith("depl") ? "depl" : "repl",
      wantEnvironment,
      matchedEnvironment: match?.environment ?? "fallback:items[0]",
      keyMode: secretKey.startsWith("sk_live") ? "live" : secretKey.startsWith("sk_test") ? "test" : "unknown",
      accountId: settings?.account_id,
    },
    "Resolved Stripe connector credentials",
  );

  return { secretKey, webhookSecret: settings?.webhook_secret };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeWebhookSecret(): Promise<string | undefined> {
  // Primary: read from Replit Secret (set this to your whsec_... value)
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    return process.env.STRIPE_WEBHOOK_SECRET;
  }
  // Fallback: connector proxy (no-op for Stripe connector which has no webhook_secret field)
  try {
    const { webhookSecret } = await getStripeCredentials();
    return webhookSecret;
  } catch {
    return undefined;
  }
}
