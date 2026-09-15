"use client";

import { useOffline } from "next/offline";

// Used as a route-level loading.tsx fallback so Next has a prefetchable
// shell boundary per surface (this app doesn't use Cache Components) — see
// node_modules/next/dist/docs/01-app/02-guides/offline-support.md, "Without
// Cache Components". Swaps its message when the wait is actually a dropped
// connection rather than a normal slow load.
export function ConnectivityLoading() {
  const isOffline = useOffline();

  return (
    <main className="flex min-h-svh items-center justify-center px-6 text-center text-sm text-muted">
      {isOffline ? "Waiting for connection…" : "Loading…"}
    </main>
  );
}
