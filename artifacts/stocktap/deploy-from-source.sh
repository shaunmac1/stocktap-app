#!/usr/bin/env bash
# StockTap: build from source and deploy to the live Cloudflare Worker.
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./deploy-from-source.sh [staging]
#
# 1. Pulls any static file the content engine has published to live since the last commit
#    (guides, tools, sitemap, guides index, IndexNow key) into public/ so a source deploy never
#    deletes a published guide. Commit those files afterwards.
# 2. Builds with Vite, regenerates asset-manifest.txt (mirror-deploy.sh depends on it).
# 3. Safety guard: current-feature marker must be in the bundle; file count must not shrink.
# 4. wrangler deploy --keep-vars (secrets and dashboard vars stay on the Worker).
# 5. Verifies key URLs and the Stripe prices endpoint.
set -euo pipefail
cd "$(dirname "$0")"
SITE="https://stocktap.net"; UA="Mozilla/5.0 stocktap-deploy"
CFG="wrangler.jsonc"; [ "${1:-}" = "staging" ] && CFG="wrangler.staging.jsonc"
: "${CLOUDFLARE_API_TOKEN:?}"; : "${CLOUDFLARE_ACCOUNT_ID:?}"

echo "== 1. sync live-only static files into public/"
curl -fsS -A "$UA" "$SITE/asset-manifest.txt?cb=$(date +%s)" -o /tmp/live-manifest.txt
spa_hash=$(curl -fsS -A "$UA" "$SITE/" | sha256sum | cut -d' ' -f1)
live_count=$(grep -v -e '\.br$' -e '\.gz$' -e '/assets/index-' /tmp/live-manifest.txt | wc -l)
while read -r p; do
  case "$p" in ""|*.br|*.gz|/assets/*|/index.html|/sw.js|/workbox-*|/registerSW.js|/manifest.webmanifest|/asset-manifest.txt) continue;; esac
  fp="$p"; case "$p" in */index.html) fp="${p%index.html}";; *.html) fp="${p%.html}";; esac
  # Always refresh the files the content engine regenerates; otherwise only fetch what we lack.
  case "$p" in /sitemap.xml|/guides/index.html) ;; *) [ -f "public$p" ] && continue;; esac
  mkdir -p "public$(dirname "$p")"
  curl -fsS -A "$UA" "$SITE$fp" -o "public$p.tmp"
  if [ "$(sha256sum < "public$p.tmp" | cut -d' ' -f1)" = "$spa_hash" ]; then rm "public$p.tmp"; echo "skip (SPA shell): $p"; continue; fi
  sed -i '/static.cloudflareinsights.com\/beacon.min.js/d' "public$p.tmp" 2>/dev/null || true
  mv "public$p.tmp" "public$p"; echo "synced $p"
done < /tmp/live-manifest.txt

echo "== 2. build"
PORT=5173 BASE_PATH=/ NODE_ENV=production pnpm run build >/tmp/build.log 2>&1 || { tail -30 /tmp/build.log; exit 2; }
grep -E "index-.*\.js " /tmp/build.log || true
( cd dist/public && find . -type f | sed 's|^\./|/|' | sort | grep -v '^/asset-manifest.txt$' > asset-manifest.txt )

echo "== 3. guard"
grep -l "VAT to reclaim" dist/public/assets/index-*.js >/dev/null || { echo "FATAL: feature marker missing from bundle. NOT deploying."; exit 4; }
new_count=$(cd dist/public && find . -type f ! -name '*.br' ! -name '*.gz' | grep -v '/assets/index-' | wc -l)
[ "$new_count" -ge "$live_count" ] || { echo "FATAL: build has $new_count files, live has $live_count. NOT deploying."; exit 5; }
node --check worker/index.js

echo "== 4. deploy ($CFG)"
npx --yes wrangler@latest deploy --config "$CFG" --keep-vars

if [ "$CFG" = "wrangler.jsonc" ]; then
  echo "== 5. verify"
  cb=$(date +%s); fail=0
  for u in / /stocktake /guides/ /sitemap.xml /6e9836f45eadb56141e747d35bce38c6.txt; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -A "$UA" "$SITE$u?cb=$cb"); echo "$code $u"; [ "$code" = 200 ] || fail=1; done
  curl -s "$SITE/api/stripe/prices" | grep -q '"unit_amount"' && echo "stripe ok" || { echo "WARN: stripe prices not returning amounts"; fail=1; }
  [ $fail = 0 ] && echo "DEPLOY VERIFIED" || { echo "VERIFY FAILED: roll back in Cloudflare (Workers > gentle-silence-f69f > Deployments)"; exit 6; }
fi
