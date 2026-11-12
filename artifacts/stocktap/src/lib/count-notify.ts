import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { groupLabel, type CountGroupKey } from "@/lib/count-rota";

const KEY = "stocktap:pending-count-pings";
type Ping = { notify_venue: string; title: string; body: string; url: string; tag: string };
const readPings = (): Ping[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const writePings = (p: Ping[]) => { try { localStorage.setItem(KEY, JSON.stringify(p.slice(-20))); } catch { /* private mode */ } };

async function send(ping: Ping): Promise<boolean> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return false;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(ping),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

/** Pings that couldn't go (count finished with no signal) are sent once the count has uploaded. */
export async function flushCountPings(): Promise<number> {
  const pings = readPings();
  if (pings.length === 0) return 0;
  const left: Ping[] = []; let sent = 0;
  for (const p of pings) { if (await send(p)) sent++; else left.push(p); }
  writePings(left);
  return sent;
}

/**
 * A member of staff finished a count: ping the owner and managers' phones. If there's no
 * signal the ping waits on the phone and goes when the count uploads; either way the count
 * shows on the owner's Home.
 */
export async function notifyCountFinished(venueId: string, info: { lines: number; group: CountGroupKey | null; stocktakeId: string; byStaff: boolean }): Promise<void> {
  if (!info.byStaff) return;
  const what = info.group ? groupLabel(info.group) : "Stock count";
  const ping: Ping = {
    notify_venue: venueId,
    title: `${what} counted`,
    body: `${info.lines} ${info.lines === 1 ? "line" : "lines"} counted. Tap to see the sheet.`,
    url: `/stocktake?view=${info.stocktakeId}`,
    tag: `count-${info.stocktakeId}`,
  };
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!online || !(await send(ping))) writePings([...readPings(), ping]);
}
