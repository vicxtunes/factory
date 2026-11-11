"use client";

import { useOffline } from "next/offline";

// Mounted once in the root layout so it's visible on every surface
// (dashboard, factory, graphics, display). Server Actions and navigations
// started while offline stay pending and retry automatically once the
// connection returns (see experimental.useOffline in next.config.ts) — this
// banner just explains why things look stuck. Uploads wait for the connection
// on their own (packages/ui/transfers).
//
// `showBanner={false}` hides the banner — the
// client portal uses it: its connectivity reading flickers true/false while
// the client is actually online (their network conditions and the extra
// Realtime/notification-polling traffic that app carries make useOffline's
// detection unreliable there), and a banner that contradicts what they can
// see is working does more harm than good.
export function OfflineBanner({ showBanner = true }: { showBanner?: boolean }) {
  const isOffline = useOffline();

  if (!isOffline || !showBanner) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] bg-[var(--urgent)] px-4 py-1.5 text-center text-xs font-medium text-white"
    >
      Offline — pending actions will complete once you&apos;re back online.
    </div>
  );
}
