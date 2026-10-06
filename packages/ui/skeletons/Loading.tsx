import { Suspense, type ReactNode } from "react";

import { OfflineNotice } from "./OfflineNotice";

/**
 * A part of a page that loads data: `skeleton` (see ./blocks) stands in for it
 * until its data is ready, while the rest of the page (frame, titles, buttons,
 * anything that doesn't wait for data) shows at once.
 */
export function Loading({ skeleton, children }: { skeleton: ReactNode; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true">
          <span className="sr-only" role="status">
            Loading…
          </span>
          <OfflineNotice />
          {skeleton}
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
