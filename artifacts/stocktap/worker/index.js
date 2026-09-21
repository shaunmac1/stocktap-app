
var STRIPE_API = "https://api.stripe.com/v1";
var json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
function toForm(obj, prefix = "") {
  const params = new URLSearchParams();
  const walk = (o, pfx) => {
    for (const [k, v] of Object.entries(o)) {
      if (v === void 0 || v === null) continue;
      const key = pfx ? `${pfx}[${k}]` : k;
      if (typeof v === "object" && !Array.isArray(v)) walk(v, key);
      else if (Array.isArray(v)) v.forEach((item, i) => {
        if (typeof item === "object") walk(item, `${key}[${i}]`);
        else params.append(`${key}[${i}]`, String(item));
      });
      else params.append(key, String(v));
    }
  };
  walk(obj, prefix);
  return params;
}
async function stripe(env, method, path, body) {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": "2024-06-20"
    }
  };
  if (body) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = toForm(body).toString();
  }
  const res = await fetch(`${STRIPE_API}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Stripe ${res.status}`;
    const err = new Error(msg);
    err.stripe = data?.error;
    err.status = res.status;
    throw err;
  }
  return data;
}
var tierForProduct = (env, productId) => productId === env.STRIPE_PREMIUM_PRODUCT ? "premium" : productId === env.STRIPE_PRO_PRODUCT ? "pro" : null;
var mapSub = (s) => s && {
  id: s.id,
  status: s.status,
  trial_end: s.trial_end ?? null,
  current_period_end: s.current_period_end,
  cancel_at_period_end: !!s.cancel_at_period_end
};
async function handlePrices(env, url) {
  const interval = url.searchParams.get("interval") === "year" ? "year" : "month";
  if (!env.STRIPE_SECRET_KEY) return json({ prices: { pro: null, premium: null } });
  const pick = async (productId) => {
    if (!productId) return null;
    const list = await stripe(
      env,
      "GET",
      `/prices?product=${productId}&active=true&limit=100&expand[]=data.product`
    );
    const match = (list.data || []).find(
      (p) => p.recurring && p.recurring.interval === interval && p.active
    );
    if (!match) return null;
    return {
      id: match.id,
      unit_amount: match.unit_amount,
      currency: match.currency,
      lookup_key: match.lookup_key ?? null,
      product: { name: match.product?.name ?? "StockTap" }
    };
  };
  try {
    const [pro, premium] = await Promise.all([
      pick(env.STRIPE_PRO_PRODUCT),
      pick(env.STRIPE_PREMIUM_PRODUCT)
    ]);
    return json({ prices: { pro, premium } });
  } catch (e) {
    return json({ prices: { pro: null, premium: null }, error: e.message }, 200);
  }
}
async function handleCheckout(env, request) {
  if (!env.STRIPE_SECRET_KEY)
    return json({ error: "Billing isn't switched on yet. Please try again shortly." }, 503);
  const { email, venueId, priceId, successUrl, cancelUrl, trialEndsAt } = await request.json().catch(() => ({}));
  if (!venueId || !priceId) return json({ error: "Missing venue or plan." }, 400);
  // Every new venue already gets an automatic 14-day Pro trial from the database
  // (venues.trial_ends_at). If the customer picks a plan mid-trial, Stripe's trial
  // must end on the SAME date, not restart a fresh 14 days. Stripe needs trial_end
  // at least 48h out; nearer than that we just fall back to the default 14 days.
  let trialEndUnix = null;
  if (trialEndsAt) {
    const ms = Date.parse(trialEndsAt);
    if (Number.isFinite(ms) && ms - Date.now() > 48 * 3600 * 1000) trialEndUnix = Math.floor(ms / 1000);
  }
  const sep = successUrl && successUrl.includes("?") ? "&" : "?";
  const successWithId = `${successUrl}${sep}session_id={CHECKOUT_SESSION_ID}`;
  const body = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successWithId,
    cancel_url: cancelUrl,
    client_reference_id: venueId,
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
    metadata: { venue_id: venueId },
    // 14-day trial, no card needed up front (matches the published offer). If no card is
    // added by the end of the trial the subscription cancels and the venue drops to Free.
    payment_method_collection: "if_required",
    subscription_data: {
      metadata: { venue_id: venueId },
      ...(trialEndUnix ? { trial_end: trialEndUnix } : { trial_period_days: 14 }),
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
    }
  };
  if (email && /@/.test(email) && !email.endsWith("@stocktap.dev")) body.customer_email = email;
  try {
    const session = await stripe(env, "POST", "/checkout/sessions", body);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message || "Checkout failed" }, 400);
  }
}
async function handleSubscription(env, customerId) {
  if (!env.STRIPE_SECRET_KEY || !customerId) return json({ subscription: null });
  try {
    const list = await stripe(
      env,
      "GET",
      `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=1`
    );
    const sub = (list.data || [])[0];
    // Self-heal: if the latest subscription is no longer live, make sure the venue is on Free.
    if (sub && sub.metadata?.venue_id && !["active", "trialing", "past_due"].includes(sub.status)) {
      try { await applyTier(env, sub.metadata.venue_id, "free", sub.customer); } catch {}
    }
    return json({ subscription: mapSub(sub) ?? null });
  } catch (e) {
    return json({ subscription: null, error: e.message }, 200);
  }
}
async function handlePortal(env, request) {
  if (!env.STRIPE_SECRET_KEY)
    return json({ error: "Billing isn't switched on yet." }, 503);
  const { stripeCustomerId, returnUrl } = await request.json().catch(() => ({}));
  if (!stripeCustomerId) return json({ error: "No customer on file." }, 400);
  try {
    const session = await stripe(env, "POST", "/billing_portal/sessions", {
      customer: stripeCustomerId,
      return_url: returnUrl
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message || "Portal failed" }, 400);
  }
}
async function handleConfirm(env, url) {
  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: "not_configured" }, 503);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return json({ ok: false, error: "missing_session" }, 400);
  try {
    const session = await stripe(
      env,
      "GET",
      `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`
    );
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    const venueId = session.metadata?.venue_id || session.client_reference_id;
    if (!paid || !venueId) return json({ ok: false });
    let tier = "pro";
    if (session.subscription && typeof session.subscription === "object")
      tier = await tierFromSubscription(env, session.subscription);
    await applyTier(env, venueId, tier, session.customer);
    return json({ ok: true, tier });
  } catch (e) {
    return json({ ok: false, error: e.message }, 200);
  }
}
var enc = new TextEncoder();
var toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
async function verifyStripeSignature(secret, header, payload) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const t = parts.t;
  const sig = parts.v1;
  if (!t || !sig) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  return timingSafeEqual(toHex(mac), sig);
}
async function applyTier(env, venueId, tier, customerId) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/stripe_apply_tier`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      p_secret: env.STRIPE_BRIDGE_SECRET,
      p_venue: venueId,
      p_tier: tier,
      p_customer: customerId ?? null
    })
  });
  if (!res.ok) throw new Error(`tier update failed: ${res.status} ${await res.text()}`);
}
async function tierFromSubscription(env, sub) {
  const live = ["active", "trialing", "past_due"].includes(sub.status);
  if (!live) return "free";
  const productId = sub.items?.data?.[0]?.price?.product;
  return tierForProduct(env, productId) || "free";
}
async function handleWebhook(env, request) {
  const payload = await request.text();
  const ok = await verifyStripeSignature(
    env.STRIPE_WEBHOOK_SECRET,
    request.headers.get("Stripe-Signature"),
    payload
  );
  if (!ok) return json({ error: "bad signature" }, 400);
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const obj = event.data?.object || {};
  try {
    if (event.type === "checkout.session.completed") {
      const venueId = obj.metadata?.venue_id || obj.client_reference_id;
      const customer = obj.customer;
      let tier = "pro";
      if (obj.subscription) {
        const sub = await stripe(
          env,
          "GET",
          `/subscriptions/${obj.subscription}?expand[]=items.data.price`
        );
        tier = await tierFromSubscription(env, sub);
      }
      if (venueId) await applyTier(env, venueId, tier, customer);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created" || event.type === "customer.subscription.deleted") {
      const venueId = obj.metadata?.venue_id;
      const customer = obj.customer;
      const tier = event.type === "customer.subscription.deleted" ? "free" : await tierFromSubscription(env, obj);
      if (venueId) await applyTier(env, venueId, tier, customer);
    }
  } catch (e) {
    return json({ error: e.message }, 500);
  }
  return json({ received: true });
}
async function reconcileTiers(env) {
  if (!env.STRIPE_SECRET_KEY) return { skipped: true };
  const best = /* @__PURE__ */ new Map();
  const rank = { free: 0, pro: 1, premium: 2 };
  let starting_after = null;
  for (let page = 0; page < 5; page++) {
    const q = `/subscriptions?status=all&limit=100&expand[]=data.items.data.price${starting_after ? `&starting_after=${starting_after}` : ""}`;
    const list = await stripe(env, "GET", q);
    for (const sub of list.data || []) {
      const venueId = sub.metadata?.venue_id;
      if (!venueId) continue;
      const tier = await tierFromSubscription(env, sub);
      const cur = best.get(venueId);
      if (!cur || rank[tier] > rank[cur.tier]) best.set(venueId, { tier, customer: sub.customer });
    }
    if (!list.has_more || !list.data?.length) break;
    starting_after = list.data[list.data.length - 1].id;
  }
  let applied = 0;
  for (const [venueId, { tier, customer }] of best) {
    try { await applyTier(env, venueId, tier, customer); applied++; } catch {}
  }
  return { venues: best.size, applied, paying: [...best.entries()].filter(([, v]) => v.tier !== "free").map(([id]) => id) };
}
// Every new venue gets 14 days of Pro from a DB trigger (venues.trial_ends_at).
// Nightly, drop venues whose trial has run out back to Free -- except any that
// now have a real Stripe subscription (reconcileTiers just told us who those are).
async function expireTrials(env, keepVenueIds) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.STRIPE_BRIDGE_SECRET) return { skipped: true };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/expire_venue_trials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ p_secret: env.STRIPE_BRIDGE_SECRET, p_keep: keepVenueIds || [] })
  });
  if (!res.ok) throw new Error(`expire_venue_trials ${res.status}: ${await res.text()}`);
  return { expired: await res.json() };
}
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    const invMatch = p.match(/^\/api\/invoices\/([0-9a-f-]{36})\/extract$/);
    if (invMatch && request.method === "POST") {
      // Delivery-note extraction runs in the Supabase Edge Function (has service role + vision key).
      const auth = request.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return json({ error: "Sign in again." }, 401);
      try {
        const r = await fetch(`${env.SUPABASE_URL}/functions/v1/extract-invoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: auth, apikey: env.SUPABASE_ANON_KEY },
          body: JSON.stringify({ document_id: invMatch[1] })
        });
        const text = await r.text();
        return new Response(text, { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      } catch (e) {
        return json({ error: e.message || "Scan service unavailable" }, 502);
      }
    }
    if (p.startsWith("/api/stripe/")) {
      if (p === "/api/stripe/prices" && request.method === "GET")
        return handlePrices(env, url);
      if (p === "/api/stripe/checkout" && request.method === "POST")
        return handleCheckout(env, request);
      if (p === "/api/stripe/portal" && request.method === "POST")
        return handlePortal(env, request);
      if (p === "/api/stripe/confirm" && request.method === "POST")
        return handleConfirm(env, url);
      if (p === "/api/stripe/webhook" && request.method === "POST")
        return handleWebhook(env, request);
      const subMatch = p.match(/^\/api\/stripe\/subscription\/(.+)$/);
      if (subMatch && request.method === "GET")
        return handleSubscription(env, decodeURIComponent(subMatch[1]));
      return json({ error: "Not found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      let paying = [];
      try { const r = await reconcileTiers(env); paying = r.paying || []; } catch {}
      try { await expireTrials(env, paying); } catch {}
    })());
  }
};
export {
  index_default as default
};
