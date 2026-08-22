# End-to-end "test as the user" harness

Every feature is driven through the real UI in a headless browser against the
real Supabase database before we call it done. Unit tests + build are necessary
but not sufficient — they don't catch runtime/config/UX breakage (e.g. a build
shipping without a Supabase URL, or a setup dead-end). This harness does.

## Why the proxy
The sandbox browser can't reach `*.supabase.co` (egress allowlist), but Node can.
`sbproxy.cjs` runs a localhost:8899 proxy that forwards to Supabase, and we build
the app with `VITE_SUPABASE_URL=http://localhost:8899` so the browser only talks
to localhost. The server must live in the SAME shell call as the Playwright run
(background servers are reaped between calls), so start-server + run-script in one
bash invocation.

## Run it
```bash
cd artifacts/stocktap
# 1. proxy (survives across calls once started)
node e2e/sbproxy.cjs &            # -> :8899
# 2. test users (confirm them via SQL: update auth.users set email_confirmed_at=now())
NODE_PATH=<supabase-js path> node e2e/signup.cjs owner.test+e2e@stocktap.net 'TestPass!2926'
NODE_PATH=<supabase-js path> node e2e/signup.cjs staff.test+e2e@stocktap.net 'TestPass!2926'
# 3. build against the proxy, into a throwaway dir (never deploy this build)
VITE_SUPABASE_URL=http://localhost:8899 VITE_SUPABASE_ANON_KEY=<anon> \
  PORT=5000 BASE_PATH=/ npx vite build --outDir /tmp/e2e-dist
# 4. serve + drive, in ONE call
node e2e/static.cjs & SPID=$!; sleep 3
node e2e/e2e-owner.cjs      # owner: login, venue setup, team, checks, rota
node e2e/e2e-staff.cjs      # staff: redeem code, clock in, checks, money-hidden asserts
kill $SPID
# 5. clean up: delete the E2E venue + users from the DB afterwards
```
Screenshots land in `/tmp/e2e/*.png` — review them, don't just trust exit codes.
`static.cjs` serves `/tmp/e2e-dist` as an SPA on :5173.

## Deploy safety
`src/lib/supabase.ts` carries committed public fallbacks for the Supabase URL +
anon key (the anon key ships in every bundle anyway), so a build never silently
ships without a database URL just because the gitignored `.env` is absent in a
fresh checkout. Still, after every deploy, fetch the live bundle and confirm it
contains the Supabase URL (see DEPLOY_RUNBOOK).
