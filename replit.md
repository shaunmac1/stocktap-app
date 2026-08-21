# StockTap

Mobile-first PWA for UK pubs, bars and restaurants to do stock-taking by weight — catch losses before they become a problem.

## Run & Operate

- `pnpm --filter @workspace/stocktap run dev` — run the StockTap frontend (port 18320)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + wouter routing
- Data: Supabase (auth + Postgres + RLS) — direct client, no Express backend
- PWA: vite-plugin-pwa (installable, add-to-home-screen)
- CSV: papaparse

## Where things live

- `artifacts/stocktap/` — the StockTap frontend PWA
- `artifacts/stocktap/src/lib/calculations.ts` — all weight/stock math (source of truth)
- `artifacts/stocktap/src/lib/database.types.ts` — TypeScript types for all Supabase tables
- `artifacts/stocktap/src/lib/supabase.ts` — Supabase client singleton
- `artifacts/stocktap/src/hooks/api.ts` — React Query + Supabase hooks
- `artifacts/stocktap/src/contexts/AuthContext.tsx` — auth + venue context (DEV_BYPASS exported)
- `artifacts/stocktap/src/components/DevBanner.tsx` — amber DEV MODE banner
- `artifacts/stocktap/supabase/schema.sql` — SQL to run in Supabase dashboard (all tables + RLS)

## Screens

| Route | Screen |
|---|---|
| `/auth` | Sign in / Sign up / Venue setup |
| `/` | Home / Dashboard |
| `/library` | Product Library |
| `/stocktake` | Stocktake flow |
| `/spot-check` | Daily spot check |
| `/reports` | Valuation + GP% reports |
| `/settings` | Locations / Defaults / Team / Referral / Subscription |

## Architecture decisions

- **No Express backend** — all data goes directly through the Supabase JS client; RLS enforces access control.
- **Supabase auth** — email+password; profile + venue created on first sign-up.
- **All calculations in one file** — `calculations.ts` is the source of truth for all weight/stock math.
- **Tenths display** — primary display mode (0–10 scale); "Exact ml" is secondary toggle.
- **Venue-scoped RLS** — every table has `venue_id` and RLS policies that check `venue_members`.
- **DEV_BYPASS** — `VITE_DEV_BYPASS_AUTH=true` (dev env only) triggers anonymous Supabase sign-in and auto-creates "Dev Venue". Requires Anonymous sign-ins enabled in Supabase Dashboard → Authentication → Providers → Anonymous. RLS stays fully ON.

## Setup (one-time)

1. Run `artifacts/stocktap/supabase/schema.sql` in the Supabase SQL Editor.
2. Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Replit Secrets.
3. For dev bypass: enable Anonymous sign-ins in Supabase; `VITE_DEV_BYPASS_AUTH=true` is already set in the development environment.

## Product

UK hospitality stock-taking tool. Managers weigh bottles on a scale and enter the gram reading on their phone. The app calculates ml remaining, tenths (0–10 scale), value, and GP%. Spot checks compare weight-derived sales against the till to surface variance.

## User preferences

- No emojis in the UI.
- All prices labelled "ex-VAT".
- Slider estimates always labelled "Rough estimate — not exact".
- Currency always GBP (£).
- Negative variance = red (money missing), positive = green.

## Design direction

Build to this — do not use default template styling.

**The feel:** a precision instrument for professional operators — calm, confident, number-forward, trustworthy. British, pub-trade-adjacent, grown-up. Never kitsch (no cartoon beer mugs, no emoji as icons). Think "premium tool," not "startup landing page."

**Theme:** dark-first (premium feel, easy on eyes in dim cellars), with a proper light mode toggle. Numbers are the hero of every screen.

**Colour palette (use these tokens, not defaults):**
- Base/background: near-black charcoal `#111316` (dark) / warm off-white `#F7F6F3` (light)
- Surface/cards: `#1A1D21` (dark) / `#FFFFFF` (light); subtle borders `#2A2E34` / `#E7E4DE`
- Signature accent: warm amber/copper `#E0A343` (whisky/beer/copper — deliberately not generic SaaS indigo)
- Money-out/variance loss: `#E5544B` · Money-safe/good GP: `#3FAE74`
- Text: high-contrast off-white `#F3F1EC` (dark) / ink `#1A1D21` (light); muted `#8A9099`
- Banned: purple/indigo gradients, neon, rainbow charts

**Typography:**
- UI/headings: Space Grotesk or General Sans
- Numbers/data: tabular figures (`font-feature-settings: 'tnum'`) or mono (Geist Mono / JetBrains Mono) — weights, £, tenths must align crisply like a precision readout

**Layout & components:**
- Generous whitespace, strong hierarchy, large legible numbers. Radius 10–12px, subtle depth (1px borders + faint shadow, NOT heavy drop-shadows).
- Mobile-first, bottom tab bar (Home · Stocktake · Spot-check · Library · More) — one-handed, thumb-reachable.
- Big tap targets; large custom number pad for weight entry (cold hands, cellar).
- Avoid default "hero + three feature cards" and identical shadcn-card grids.

**Signature moments (make beautiful):**
- The weigh readout = the hero. Big ml/tenths number, three readouts (tenths · measures left · sold-since-check + £), variance in clear red/green.
- The daily spot-check result — £ variance shown boldly, calm but unmistakable.
- Onboarding "weigh your first bottle" — polished, guided first-win, not a form.

**Micro-interactions (subtle, purposeful):**
- Quick count-up animation when result lands; tactile "logged" confirmation; smooth, fast screen transitions. Nothing bouncy or gimmicky.

**Reference apps (craft level, not look):** Linear, Monzo/Revolut, Superhuman/Things.

## Gotchas

- Supabase schema must be applied before the app will function.
- `measure_ml` on a product overrides the venue default if set.
- `readings.staff_on` is a UUID[] (array of user IDs), not names — used for shift review, never accusatory language.
- PWA icons (`pwa-192x192.png`, `pwa-512x512.png`) need to be placed in `artifacts/stocktap/public/` for full PWA install support.
- The `handle_new_user` trigger auto-creates a `profiles` row on sign-up — including anonymous sign-ups — so profile upsert in `ensureDevVenue` is an upsert not an insert (idempotent).
