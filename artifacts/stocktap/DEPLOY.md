# StockTap deploy (from source)

Live: https://stocktap.net, Cloudflare Worker `gentle-silence-f69f` (static assets + `/api/stripe/*` +
`/api/invoices/:id/extract` proxy + nightly `0 3 * * *` tier reconcile). Config: `wrangler.jsonc`.

## App
    pnpm install --frozen-lockfile            # from the workspace root
    cd artifacts/stocktap
    pnpm run typecheck && pnpm test           # 236 unit tests
    CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./deploy-from-source.sh staging   # workers.dev copy
    CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./deploy-from-source.sh           # live

`deploy-from-source.sh` first copies any guide the daily content engine has published to live into
`public/`, so a source deploy never removes a guide. Commit those files after deploying.

Roll back: Cloudflare dashboard > Workers > gentle-silence-f69f > Deployments > previous version.

## Guides only (no rebuild)
The daily content engine uses `mirror-deploy.sh` (project doc `stocktap/DEPLOY_RUNBOOK.md`): it mirrors the
live site, overlays new guide HTML + sitemap + guides index, and redeploys. It does not need this repo.

## Worker
`worker/index.js` is plain JavaScript (no build). Secrets live on the Worker (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
SUPABASE_SERVICE_ROLE_KEY); `--keep-vars` preserves them and the dashboard vars.

## Supabase
Project `nyqohgaxvqypdvdmpyix`. Schema: `supabase/schema.sql` plus migrations applied through the Supabase MCP
(named in project doc `stocktap/BUNDLE_PATCHES_AUG2026.md`). Edge functions: `supabase/functions/*`
(`extract-invoice` needs `service_config` keys `anthropic_api_key`, `vision_model`).
