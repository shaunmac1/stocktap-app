// StockTap reports its own faults. When something breaks on a landlord's phone we should
// hear about it from the phone, not from the landlord. A fault is saved on the phone first
// (a cellar has no signal) and sent up when there is one.
//
// What is sent: what went wrong, which screen, which app version, signal or not.
// What is never sent: prices, counts, names or anything typed into the app.
import { supabase } from "./supabase";

export interface Fault {
  kind: "crash" | "error" | "promise" | "sync" | "count";
  message: string;
  stack: string | null;
  route: string;
  build: string;
  online: boolean;
  venue_id: string | null;
  happened_at: string;
}

const KEY = "stocktap:faults";
const MAX_KEPT = 30;
const SAME_FAULT_GAP_MS = 10 * 60_000;

// Things that are not faults in StockTap: no signal is normal in a cellar and the app is
// built to carry on without it; the others are browser noise.
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch/i, /NetworkError/i, /Load failed/i, /network request failed/i,
  /AbortError/i, /signal timed out/i, /The operation was aborted/i,
  /Importing a module script failed/i, /dynamically imported module/i,
];

export function isNoise(message: string): boolean {
  return !message.trim() || NOISE.some(rx => rx.test(message));
}

/** Strip anything that could carry what the user typed: keep the route, drop the query. */
export function cleanRoute(href: string): string {
  try { return new URL(href, "http://x").pathname.slice(0, 80); } catch { return "/"; }
}

/** Add a fault to the list unless the same one was already noted in the last 10 minutes. */
export function addFault(list: Fault[], f: Fault): Fault[] {
  const t = Date.parse(f.happened_at);
  const dup = list.some(x => x.kind === f.kind && x.message === f.message && Math.abs(t - Date.parse(x.happened_at)) < SAME_FAULT_GAP_MS);
  if (dup) return list;
  return [...list, f].slice(-MAX_KEPT);
}

export function buildFault(kind: Fault["kind"], err: unknown, ctx: { href: string; build: string; online: boolean; venueId: string | null; now?: Date }): Fault | null {
  const e = err as any;
  const message = String(e?.message ?? e?.error_description ?? e ?? "").slice(0, 400);
  if (isNoise(message)) return null;
  const stack = typeof e?.stack === "string" ? e.stack.split("\n").slice(0, 8).join("\n").slice(0, 1200) : null;
  return { kind, message, stack, route: cleanRoute(ctx.href), build: ctx.build, online: ctx.online, venue_id: ctx.venueId, happened_at: (ctx.now ?? new Date()).toISOString() };
}

const read = (): Fault[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (l: Fault[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage full or private mode: nothing to do */ } };

/** The built file name changes with every release, so it tells us which version broke. */
function buildId(): string {
  try {
    const s = [...document.querySelectorAll("script[src]")].map(x => (x as HTMLScriptElement).src).find(x => /assets\/index-/.test(x));
    return s ? (/index-([\w-]+)\.js/.exec(s)?.[1] ?? "?") : "dev";
  } catch { return "?"; }
}

let flushing = false;
/** Send saved faults up. Safe to call any time: does nothing with no signal or nobody signed in. */
export async function flushFaults(): Promise<number> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const list = read();
  if (list.length === 0) return 0;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return 0;
    const { error } = await (supabase as any).from("client_faults").insert(list.map(f => ({ ...f, ua: navigator.userAgent.slice(0, 200) })));
    if (error) return 0; // kept on the phone, tried again later
    // Keep anything noted while this was sending.
    const sent = new Set(list.map(f => f.happened_at + f.message));
    write(read().filter(f => !sent.has(f.happened_at + f.message)));
    return list.length;
  } catch { return 0; } finally { flushing = false; }
}

export function reportFault(kind: Fault["kind"], err: unknown): void {
  try {
    const f = buildFault(kind, err, {
      href: window.location.href, build: buildId(), online: navigator.onLine,
      venueId: (() => { try { return localStorage.getItem("venue_id"); } catch { return null; } })(),
    });
    if (!f) return;
    const before = read(); const after = addFault(before, f);
    if (after === before) return;
    write(after);
    setTimeout(() => { void flushFaults(); }, 1500);
  } catch { /* reporting a fault must never cause one */ }
}

let started = false;
export function initFaultReporting(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", e => reportFault("error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", e => reportFault("promise", e.reason));
  window.addEventListener("online", () => { void flushFaults(); });
  setTimeout(() => { void flushFaults(); }, 5000);
}
