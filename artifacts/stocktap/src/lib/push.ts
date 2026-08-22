// Web-push client helpers. The VAPID public key is safe to ship (it's public);
// the matching private key lives only in the send-push edge function secret.
export const VAPID_PUBLIC_KEY =
  "BNYsRG-wUSUgtW6ADlk6VugSbQ7ExhQBBk97Sj88b7tdzvcEAFMBhBFuaZr4HlHcjmVRqQhfzZsjZPXV8pBDM9k";

/** True if this browser can do web push at all. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iOS only allows web push once the PWA is installed to the home screen. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
}

/** True when running as an installed PWA (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

/** VAPID key must be passed to PushManager.subscribe as a Uint8Array. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Extract the base64url keys a server needs from a PushSubscription. */
export function subscriptionKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const json = sub.toJSON();
  return { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" };
}
