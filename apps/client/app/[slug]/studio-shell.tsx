"use client";

import Link from "next/link";

import { PortalStayIn } from "@repo/ui/studio-portal/PortalForms";

import { StudioMark } from "../studio/_workspace/shell";

/** How a studio presents itself on its public pages. */
export interface PublicStudio {
  name: string;
  logoUrl: string | null;
  slug: string;
}

// A studio's public pages: no side menu (owner, 2026-11-18), just a top bar
// with the studio's mark and name (back to the showroom), the page's title
// and "Log in" (or the signed-in client's way to their page). Browsing never
// needs signing in; "Log in" only offers it. A signed-in client's every visit
// renews their sign-in, so they stay signed in for good.
export function StudioShell({
  studio,
  signedInAs,
  title,
  children,
}: {
  studio: PublicStudio;
  /** The client signed in at this studio on this device, if any. */
  signedInAs: string | null;
  title: string;
  children: React.ReactNode;
}) {
  const home = `/${studio.slug}`;

  return (
    <div className="min-h-screen">
      {signedInAs ? <PortalStayIn slug={studio.slug} /> : null}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <Link href={home} className="flex min-w-0 shrink-0 items-center gap-2.5" aria-label={studio.name}>
            <StudioMark brand={studio} size="sm" />
            <span className="hidden max-w-48 truncate font-semibold sm:inline">{studio.name}</span>
          </Link>
          <span aria-hidden className="hidden text-muted sm:inline">/</span>
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {signedInAs ? (
              <Link href={`${home}/me`} className="text-sm font-medium text-brand-600 hover:underline">
                {signedInAs.split(/\s+/)[0]} · My page
              </Link>
            ) : (
              <Link href={`${home}?signin=1`} className="text-sm font-medium text-brand-600 hover:underline">
                Log in
              </Link>
            )}
          </div>
        </header>
        <main className="flex-1 bg-background px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
