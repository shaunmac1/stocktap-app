# Count-screen test with a local stand-in backend

Drives the real UI (stocktake, spot check, landing) against `mock.cjs`, a tiny local
Supabase stand-in with made-up data. No real accounts, no production data, safe to run anywhere.

    cd artifacts/stocktap
    VITE_SUPABASE_URL=http://localhost:8899 VITE_SUPABASE_ANON_KEY=anon PORT=5000 BASE_PATH=/ npx vite build --outDir /tmp/ui-dist
    cd e2e/local-mock
    node mock.cjs & node static.cjs & sleep 1
    node run.cjs      # weigh-a-full-bottle prompt, tenths slider/bottle, tenths-instead, upgrade to weighing (24 checks)
    node run3.cjs     # spot check tenths bottle
    node run4.cjs     # landing copy rules (no invented stats, no fake urgency)

Restart `mock.cjs` between runs (it keeps state in memory). Screenshots land in /tmp/uitest/shots.
