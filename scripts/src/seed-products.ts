/**
 * Creates the StockTap product and £19/mo price in Stripe.
 * Idempotent — safe to run multiple times.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */

async function getStripeCredentials(): Promise<{ secretKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Connect Stripe via the Integrations tab before running this script.");
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) throw new Error(`Failed to fetch Stripe credentials: ${resp.status}`);
  const data = await resp.json() as { items?: Array<{ settings?: { secret_key?: string } }> };
  const key = data.items?.[0]?.settings?.secret_key;
  if (!key) throw new Error("Stripe not connected — no secret_key found.");
  return { secretKey: key };
}

async function main() {
  const { default: Stripe } = await import("stripe");
  const { secretKey } = await getStripeCredentials();
  const stripe = new Stripe(secretKey);

  console.log("Checking for existing StockTap product...");
  const existing = await stripe.products.search({
    query: "name:'StockTap' AND active:'true'",
  });

  if (existing.data.length > 0) {
    const prod = existing.data[0];
    console.log(`StockTap product already exists: ${prod.id}`);
    const prices = await stripe.prices.list({ product: prod.id, active: true });
    if (prices.data.length > 0) {
      prices.data.forEach((p) =>
        console.log(`  Active price: ${p.id}  ${p.unit_amount ? p.unit_amount / 100 : "?"}  ${p.currency}/${p.recurring?.interval ?? "one_time"}`),
      );
    } else {
      console.log("  No active prices. Creating £19/mo...");
      const price = await stripe.prices.create({
        product: prod.id,
        unit_amount: 1900,
        currency: "gbp",
        recurring: { interval: "month" },
      });
      console.log(`  Created: ${price.id}`);
    }
    return;
  }

  console.log("Creating StockTap product...");
  const product = await stripe.products.create({
    name: "StockTap",
    description: "Stock-taking by weight for UK pubs, bars and restaurants. Catch losses before they become a problem.",
  });
  console.log(`Created product: ${product.id}`);

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1900,
    currency: "gbp",
    recurring: { interval: "month" },
  });
  console.log(`Created price: ${price.id}  £19.00/month`);
  console.log("Done. Run this again to verify.");
}

main().catch((err: unknown) => {
  console.error("Error:", (err as Error).message);
  process.exit(1);
});
