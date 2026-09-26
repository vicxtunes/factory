"use client";

import { useOffline } from "next/offline";

// Shown on top of a loading skeleton when the wait is really a dropped
// connection, not a slow load (this used to be ConnectivityLoading's
// spinner message; see node_modules/next/dist/docs/01-app/02-guides/offline-support.md).
export function OfflineNotice() {
  const isOffline = useOffline();
  if (!isOffline) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-0 top-3 z-[60] mx-auto w-fit rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-theme-lg"
    >
      Waiting for connection…
    </p>
  );
}
