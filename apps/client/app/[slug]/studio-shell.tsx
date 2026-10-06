"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ClientsIcon, ShowroomIcon } from "@repo/ui/icons";

import { StudioMark } from "../studio/_workspace/shell";

/** How a studio presents itself on its public pages. */
export interface PublicStudio {
  name: string;
  logoUrl: string | null;
  slug: string;
}

// A studio's public pages in the same frame as Aming's (../shell.tsx): the
// studio's mark and menu on the left (md+), a top bar with the page's title
// and "Log in" (or the signed-in client's way to their page). Browsing never
// needs signing in; "Log in" only offers it.
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
  const pathname = usePathname();
  const home = `/${studio.slug}`;
  const items = [
    { href: home, label: "Showroom", Icon: ShowroomIcon, active: pathname === home || pathname.startsWith(`${home}/s/`) || pathname.startsWith(`${home}/gallery/`) },
    ...(signedInAs ? [{ href: `${home}/me`, label: "My page", Icon: ClientsIcon, active: pathname.startsWith(`${home}/me`) }] : []),
  ];

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-border bg-surface md:flex">
        <Link href={home} className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-5">
          <StudioMark brand={studio} size="md" />
          <span className="truncate font-semibold">{studio.name}</span>
        </Link>
        <nav aria-label={studio.name} className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {items.map(({ href, label, Icon, active }) => (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={`menu-item ${active ? "menu-item-active" : "menu-item-inactive"}`}>
                  <Icon className={`h-5 w-5 ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex min-h-screen flex-col md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          {/* Phones have no side menu: the studio's mark leads the bar instead. */}
          <Link href={home} className="md:hidden" aria-label={studio.name}>
            <StudioMark brand={studio} size="sm" />
          </Link>
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
