# StockTap — Feature Inventory

Generated as a snapshot for completeness auditing. One line per item, grouped by area.

## Screens / Routes

- `/` — Landing page (signed-out) or Home dashboard (signed-in) — hero includes a phone-frame carousel (weigh readout / spot-check variance / library) with a ready-to-fill founder video slot
- `/auth` — Sign in / sign up / venue setup / onboarding (import or first-weigh)
- `/library` — Product library (list, search, add, CSV import, quick weigh)
- `/stocktake` — Full stocktake session (location picker, weighing loop, summary)
- `/spot-check` — Daily spot check (product picker, quick or full weigh, till variance)
- `/reports` — Valuation, GP%, by-location, and AI insights reports
- `/settings` — Locations, Defaults, Offers, Team, Referral, Plan, Support, Suggestions link
- `/ledger` — Stock movement history (deliveries, transfers, wastage)
- `/suggestions` — Feature suggestions board (submit, upvote, status)
- 404 — Not-found catch-all

## Home Dashboard

- Total stock value hero figure + GP% summary
- Quick actions: start stocktake, start spot check, add bottle
- Recent readings list
- Settings icon (top bar) → `/settings`

## Product Library

- Product list with search/filter
- Add product sheet (name, category, measure override, cost/sell price)
- Quick "weigh now" sheet from the library
- CSV import with column mapping and bulk price entry
- Delivery entry sheet (invoice / ledger / mid-stocktake methods)

## Stocktake

- Past stocktakes list
- Location picker
- Multi-method weighing (full-bar units: bottle, keg weight, dipstick, tenths, etc.)
- Session summary (value, variance)

## Spot Check

- Product selection with staff tagging (`staff_on`, UUID array — never accusatory)
- Quick line-check mode (fast multi-product pass) and full weigh mode
- Till measures-sold entry
- £ variance result, red/green per sign convention

## Reports

- Valuation report (stock value by product) + CSV export (Pro)
- GP% analysis per product, "Watch" flag for low-GP items + CSV export (Pro)
- By-location value breakdown (Pro)
- AI insight engine — variance/drift flags (Premium)

## Settings — Locations tab

- Add / delete venue locations (cellar, bar, etc.)

## Settings — Defaults tab

- Venue name
- Measure system preset (UK / IE / US / EU / free-pour) — informational only
- Default measure size (ml), overridable per-product
- Display mode: Tenths (primary) vs Exact ml (secondary toggle)
- Delivery/order cycle length (days)

## Settings — Offers tab

- Special offers CRUD: name, offer price, start/end date, linked products

## Settings — Team tab

- View venue members and roles (owner / manager / staff)
- Remove members (owner/manager only)

## Settings — Referral tab

- Generate/copy/share personal referral code
- Track referral progress (pending / qualified)
- Reward: free Pro once referred venue has been on Pro continuously for 30 days

## Settings — Plan (Subscription) tab

- Current tier display (Free / Pro / Premium)
- Founding Landlord badge ("The Lock-In", first 20 venues) shown if applicable
- Monthly/annual billing toggle, prices pulled live from Stripe
- Start checkout (upgrade flow via Stripe Checkout)
- Open Stripe customer billing portal (self-service manage/cancel)

## Settings — Support (Help & Support section)

- In-app support ticket form (subject + message)
- Auto-categorisation (billing / technical / data / feature_request / other) via keyword matching
- Instant canned auto-reply shown in-app on submit
- Recent ticket history (last 3) with status
- Link to `/suggestions`
- Direct "email us" mailto fallback
- Sign out

## Suggestions Board (`/suggestions`)

- Submit a suggestion (title + optional detail)
- List of all suggestions app-wide, sorted by upvotes then recency
- Upvote / un-upvote, one vote per user per suggestion (enforced by DB unique constraint)
- Status labels: Under review / Planned / Building / Shipped
- Founding Landlord badge shown on suggestions submitted from a founding-landlord venue

## Authentication

- Email + password sign up / sign in (Supabase Auth)
- Google OAuth sign-in
- Anonymous dev-bypass sign-in (development only, `VITE_DEV_BYPASS_AUTH=true`)
- Venue setup on first sign-in (name, measure size)
- `founding_landlord` auto-badge: first 20 venues ever created

## Subscription Tiers / Feature Gates

- **Free**: 1 location max; core stocktake/spot-check/library features
- **Pro**: unlimited locations, CSV exports (valuation + GP), by-location report, ledger/stock movements
- **Premium**: everything in Pro + AI insight engine, demand forecasting hooks, multi-venue consolidated reports, priority support framing
- Billing interval: monthly or annual (annual priced via separate Stripe price IDs per product)

## PWA

- Installable / add-to-home-screen (vite-plugin-pwa)
- Offline-first local cache (Dexie) with background sync queue

## API Server (`artifacts/api-server`)

- `GET /healthz` — health check
- `GET /api/stripe/prices?interval=month|year` — list StockTap/StockTap Premium prices for the given billing interval
- `GET /api/stripe/price` — legacy default Pro monthly price (backward compatibility)
- `GET /api/stripe/subscription/:customerId` — current subscription status/tier for a customer
- `POST /api/stripe/checkout` — create a Stripe Checkout session (upgrade flow)
- `POST /api/stripe/portal` — create a Stripe Customer Portal session
- Stripe webhook handler — tier detection by product name, sets `venues.tier` and `pro_since`

## Database Tables (Supabase, all RLS-protected)

- `profiles`, `venues`, `venue_members`, `locations`, `products`, `stocktakes`, `readings`
- `special_offers`, `deliveries`, `support_tickets`, `till_entries`, `referrals`
- `feature_suggestions`, `feature_suggestion_votes`
