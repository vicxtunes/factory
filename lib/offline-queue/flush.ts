import { flushQueuedUploads } from "./enqueue";

let started = false;

// Mounted once (components/pwa/OfflineBanner.tsx, root layout) so it's
// active on every surface regardless of where a photo gets queued
// (/factory, /graphics). Deliberately event-driven, not Background Sync —
// Safari/iOS doesn't support Background Sync and this app targets mobile
// Safari, so the queue only flushes while the app is open (foreground or
// alive-in-background), not fully closed. That's an accepted limitation.
export function startOfflineQueueFlush(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const flush = () => {
    void flushQueuedUploads();
  };

  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flush();
  });
  flush();
}
