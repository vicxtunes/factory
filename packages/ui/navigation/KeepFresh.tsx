"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// Pages switch instantly because the router keeps recently visited (and
// prefetched) pages in memory (next.config.ts `staleTimes`). The catch: that
// copy can be a few minutes old. This quietly re-fetches the page in the
// background after such a switch, and when the app comes back to the
// foreground, so people see the page immediately and the latest data a
// moment later, without a skeleton in between (router.refresh() keeps the
// current screen up while it loads, and keeps what's typed into forms).

/** A page refreshed this recently isn't refreshed again on the next visit. */
const FRESH_FOR_MS = 15_000;
/** Coming back to the app after this long in the background refreshes it. */
const BACKGROUND_REFRESH_MS = 60_000;

const lastRefreshed = new Map<string, number>();

export function KeepFresh() {
  const pathname = usePathname();
  const router = useRouter();
  const firstRender = useRef(true);

  // After a client-side switch to another page.
  useEffect(() => {
    if (firstRender.current) {
      // A full page load was just rendered by the server: already fresh.
      firstRender.current = false;
      lastRefreshed.set(pathname, Date.now());
      return;
    }
    if (Date.now() - (lastRefreshed.get(pathname) ?? 0) < FRESH_FOR_MS) return;
    lastRefreshed.set(pathname, Date.now());
    router.refresh();
  }, [pathname, router]);

  // When the app is reopened (phone unlocked, tab switched back to).
  useEffect(() => {
    let hiddenAt = 0;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > BACKGROUND_REFRESH_MS) {
        lastRefreshed.set(window.location.pathname, Date.now());
        router.refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  return null;
}
