"use client";

import { useEffect } from "react";
import { useOffline } from "next/offline";

import { startOfflineQueueFlush } from "@/lib/offline-queue/flush";

// Mounted once in the root layout so it's visible on every surface
// (dashboard, factory, graphics, display). Server Actions and navigations
// started while offline stay pending and retry automatically once the
// connection returns (see experimental.useOffline in next.config.ts) — this
// banner just explains why things look stuck. Also the one place the
// offline media-upload queue's flush listener gets started, since it needs
// to run regardless of which surface the user is on.
export function OfflineBanner() {
  const isOffline = useOffline();

  useEffect(() => {
    startOfflineQueueFlush();
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] bg-[var(--urgent)] px-4 py-1.5 text-center text-xs font-medium text-white"
    >
      Offline — pending actions will complete once you&apos;re back online.
    </div>
  );
}
