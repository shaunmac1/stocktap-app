import { useEffect, useState } from "react";

/** The bundle this page is running, e.g. "assets/index-AbC123.js". */
function runningBundle(): string | null {
  const s = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map(x => x.src).find(x => /\/assets\/index-[^/]+\.js/.test(x));
  const m = s?.match(/assets\/index-[^/?#]+\.js/);
  return m ? m[0] : null;
}

/**
 * A phone app kept open in the background can go days without reloading, so it never picks up a
 * new release. Each time the app comes back to the front (and every 30 minutes) we ask the server
 * which bundle is live; if it differs we offer a one-tap update. We never reload on our own, so a
 * half-typed count is never lost.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const current = runningBundle();
    if (!current) return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== "visible") return;
      try {
        const html = await (await fetch(`/?v=${Date.now()}`, { cache: "no-store" })).text();
        const live = html.match(/assets\/index-[^"'/?#]+\.js/)?.[0];
        if (live && live !== current) setReady(true);
      } catch { /* offline: try again later */ }
    };
    check();
    document.addEventListener("visibilitychange", check);
    const t = window.setInterval(check, 30 * 60 * 1000);
    return () => { stop = true; document.removeEventListener("visibilitychange", check); window.clearInterval(t); };
  }, []);
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="fixed left-3 right-3 z-[90] rounded-xl bg-primary text-primary-foreground shadow-lg px-4 py-3 text-sm font-semibold flex items-center justify-between"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
      data-testid="banner-update-ready"
    >
      <span>New version of StockTap ready</span>
      <span className="underline">Tap to update</span>
    </button>
  );
}
