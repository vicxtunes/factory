"use client";

import { useEffect, useState, useTransition } from "react";

import { subscribeToPush, unsubscribeFromPush } from "@repo/lib/push/actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const serverKey = () => urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!);

/** Subscribes this device with the server's current key and saves it for the signed-in person. */
async function saveNewSubscription(registration: ServiceWorkerRegistration): Promise<{ ok: true } | { ok: false; error: string }> {
  const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey() as BufferSource });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, error: "Subscription is missing required fields." };
  return subscribeToPush({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

// Once a page load, on a device that already allows notifications: a
// subscription made with an older server key (the key changed when the apps
// moved servers) is refused by the push service, so it's replaced with one
// made with today's key, and one the server lost is saved again. Nobody has
// to turn notifications off and on.
//
// Only an "on" is remembered for the page load: an "off" is checked again on
// the next screen, and turning notifications on or off here updates it, so
// the notification screen doesn't come back on another page after they were
// turned on.
let refreshing: Promise<boolean> | null = null;
function refreshSubscription(): Promise<boolean> {
  if (refreshing) return refreshing;
  const check: Promise<boolean> = (async () => {
    if (Notification.permission !== "granted") return false;
    const registration = await navigator.serviceWorker.ready;
    const current = await registration.pushManager.getSubscription();
    if (current && sameKey(current.options.applicationServerKey, serverKey())) {
      const json = current.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) return false;
      // This phone has a working subscription: if saving it again fails (no
      // network, or the app was updated since this page loaded), it's still
      // on; it's saved again next time.
      return subscribeToPush({ endpoint: current.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }).then(
        (res) => res.ok,
        () => true,
      );
    }
    if (current) {
      await unsubscribeFromPush(current.endpoint);
      await current.unsubscribe();
    }
    return (await saveNewSubscription(registration)).ok;
  })()
    .catch(() => false)
    .then((on) => {
      if (!on && refreshing === check) refreshing = null;
      return on;
    });
  refreshing = check;
  return check;
}

// The subscribe/unsubscribe flow behind every "turn on notifications" button
// (packages/ui/push/PushOptIn.tsx in the header, the notifications page's card).
export function usePushSubscription() {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    // This device, not the person: a row saved from another phone, or one the
    // push service now refuses, doesn't count as on.
    refreshSubscription().then(setSubscribed);
  }, [supported]);

  function subscribe(onDone?: (ok: boolean) => void) {
    setError(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("Notifications permission was not granted.");
          onDone?.(false);
          return;
        }
        const res = await saveNewSubscription(await navigator.serviceWorker.ready);
        if (!res.ok) {
          setError(res.error);
          onDone?.(false);
          return;
        }
        refreshing = Promise.resolve(true);
        setSubscribed(true);
        onDone?.(true);
      } catch {
        setError("Couldn't enable notifications on this device.");
        onDone?.(false);
      }
    });
  }

  function unsubscribe() {
    setError(null);
    start(async () => {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      refreshing = null;
      setSubscribed(false);
    });
  }

  return { supported, subscribed, pending, error, subscribe, unsubscribe };
}
