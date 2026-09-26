import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/Skeleton";

import { OfflineNotice } from "./OfflineNotice";

// Page frames for loading.tsx files. Pages on these surfaces render their own
// chrome (there's no shared layout above them), so a loading state must draw
// the frame too — otherwise the header/sidebar vanish and pop back in.

/** Screen-reader text + offline notice every skeleton page carries. */
function LoadingAnnouncement() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading…
      </span>
      <OfflineNotice />
    </>
  );
}

/**
 * Client portal: sidebar (desktop), sticky topbar and main area — the same
 * shape as app/client-side/shell.tsx.
 */
export function ClientFrameSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" aria-busy="true">
      <LoadingAnnouncement />
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col gap-2 border-r border-border bg-surface px-6 py-5 md:flex">
        <Skeleton className="mb-6 h-8 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </aside>
      <div className="flex min-h-screen flex-col md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
          <Skeleton className="h-5 w-32" />
          <div className="ml-auto flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </header>
        <main className="flex-1 bg-background px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

/**
 * Factory, graphics, support and display: the navy header strip from
 * components/ui/Header.tsx above a centred content column.
 */
export function HeaderFrameSkeleton({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement />
      <header className="header-strip">
        <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-3 ${wide ? "" : "max-w-6xl"}`}>
          <Skeleton onDark className="h-7 w-32" />
          <div className="flex items-center gap-3">
            <Skeleton onDark className="h-9 w-9 rounded-lg" />
            <Skeleton onDark className="hidden h-4 w-24 sm:block" />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-3 py-4 ${wide ? "" : "max-w-6xl"}`}>{children}</main>
    </div>
  );
}

/** Inside an existing layout that already draws the chrome (the dashboard). */
export function ContentSkeleton({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true">
      <LoadingAnnouncement />
      {children}
    </div>
  );
}
