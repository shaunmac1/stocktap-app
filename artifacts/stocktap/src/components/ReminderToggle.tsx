import React from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePush } from "@/hooks/usePush";
import { isIOS, isStandalone } from "@/lib/push";

/** "Turn on reminders" control. Compact by default; used on clock + admin screens. */
export function ReminderToggle({ className = "" }: { className?: string }) {
  const { supported, state, subscribed, busy, enable, disable } = usePush();
  const { toast } = useToast();

  if (!supported) return null;

  // iOS only delivers web push once the app is added to the home screen.
  if (isIOS() && !isStandalone()) {
    return (
      <div className={`rounded-xl border border-border bg-card p-3 text-center ${className}`}>
        <div className="text-sm font-medium flex items-center justify-center gap-1.5"><Bell className="w-4 h-4 text-primary" /> Get shift reminders</div>
        <p className="text-[11px] text-muted-foreground mt-1">On iPhone: tap Share, then “Add to Home Screen”, open it from there, and you’ll be able to turn on reminders.</p>
      </div>
    );
  }

  async function on() {
    const r = await enable();
    toast(r.ok
      ? { title: "Reminders on", description: "We'll nudge you about shifts and checks." }
      : { title: "Couldn't turn on", description: r.error, variant: "destructive" });
  }
  async function off() {
    const r = await disable();
    if (!r.ok) toast({ title: "Couldn't turn off", description: r.error, variant: "destructive" });
    else toast({ title: "Reminders off" });
  }

  if (state === "denied") {
    return (
      <div className={`rounded-xl border border-border bg-card p-3 text-center ${className}`}>
        <div className="text-sm font-medium flex items-center justify-center gap-1.5"><BellOff className="w-4 h-4 text-muted-foreground" /> Reminders blocked</div>
        <p className="text-[11px] text-muted-foreground mt-1">Notifications are blocked for this site. Turn them back on in your browser settings to get reminders.</p>
      </div>
    );
  }

  if (subscribed) {
    return (
      <button onClick={off} disabled={busy} className={`w-full rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-center gap-2 text-sm font-medium text-emerald-800 disabled:opacity-60 ${className}`}>
        <Check className="w-4 h-4" /> Reminders on · tap to turn off
      </button>
    );
  }

  return (
    <Button variant="outline" className={`w-full ${className}`} onClick={on} disabled={busy}>
      <Bell className="w-4 h-4 mr-1.5" /> {busy ? "Turning on…" : "Turn on reminders"}
    </Button>
  );
}
