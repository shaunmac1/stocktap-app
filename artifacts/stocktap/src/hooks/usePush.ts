import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  VAPID_PUBLIC_KEY, isPushSupported, urlBase64ToUint8Array, subscriptionKeys,
} from "@/lib/push";

const subsTable = () => (supabase as any).from("push_subscriptions");

export type PushState = "unsupported" | "default" | "denied" | "granted";

export function usePush() {
  const { user, venue } = useAuth();
  const supported = isPushSupported();
  const [state, setState] = useState<PushState>(supported ? "default" : "unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reflect current permission + whether this device already has a subscription.
  useEffect(() => {
    if (!supported) { setState("unsupported"); return; }
    setState(Notification.permission as PushState);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, [supported]);

  const enable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supported) return { ok: false, error: "This device can't do notifications." };
    if (!user) return { ok: false, error: "Sign in first." };
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setState(perm as PushState);
      if (perm !== "granted") return { ok: false, error: perm === "denied" ? "Notifications are blocked in your browser settings." : "Notifications weren't allowed." };

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }
      const { p256dh, auth } = subscriptionKeys(sub);
      const { error } = await subsTable().upsert(
        {
          user_id: user.id,
          venue_id: venue?.id ?? null,
          endpoint: sub.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 300),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      setSubscribed(true);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Couldn't turn on reminders." };
    } finally {
      setBusy(false);
    }
  }, [supported, user, venue]);

  const disable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await subsTable().delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Couldn't turn off reminders." };
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, state, subscribed, busy, enable, disable };
}
