/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  // Payloads we send are always JSON (packages/lib/push/send.ts), but a
  // non-JSON payload (e.g. DevTools' "Push" test with plain text) must not
  // throw here — an uncaught error in this handler skips showNotification()
  // entirely, and a push event that doesn't show a notification is a
  // spec violation some browsers penalize by revoking the subscription.
  let data: PushPayload;
  try {
    data = event.data.json() as PushPayload;
  } catch {
    data = { title: "AMING", body: event.data.text() };
  }

  const url = data.url ?? "/";
  const isChat = url.includes("/chat?c=");
  event.waitUntil(
    (async () => {
      // Nothing to announce about a chat that's on screen right now.
      if (isChat) {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (windows.some((w) => w.focused && w.url.endsWith(url))) return;
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon-192.png",
        data: { url },
        // One chat, one notification: a newer message replaces the last, rather than stacking.
        ...(isChat ? { tag: url } : {}),
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
