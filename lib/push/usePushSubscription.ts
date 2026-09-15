"use client";

import { useEffect, useState, useTransition } from "react";

import { hasPushSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/push/actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Shared by components/push/PushOptIn.tsx (header button, every surface)
// and components/pwa/NotificationGate.tsx (blocking prompt for installed
// apps without push enabled) — same subscribe/unsubscribe flow, two
// different entry points.
export function usePushSubscription() {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    hasPushSubscription().then(setSubscribed);
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
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
        });
        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          setError("Subscription is missing required fields.");
          onDone?.(false);
          return;
        }
        const res = await subscribeToPush({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
        if (!res.ok) {
          setError(res.error);
          onDone?.(false);
          return;
        }
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
      setSubscribed(false);
    });
  }

  return { supported, subscribed, pending, error, subscribe, unsubscribe };
}
