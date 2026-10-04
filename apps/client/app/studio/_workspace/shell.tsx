"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { HomeBar, type HomeBarLink } from "@repo/ui/HomeBar";
import { NotificationBell } from "@repo/ui/notifications/NotificationBell";
import {
  AgentsIcon,
  BackIcon,
  CalendarIcon,
  ClientsIcon,
  DashboardIcon,
  InvoiceIcon,
  PaymentIcon,
  ProductsIcon,
  SettingsIcon,
  ShowroomIcon,
  StudioIcon,
  TasksIcon,
} from "@repo/ui/icons";

import { getMyNotifications, logoutClient } from "../../actions";
import { ClientUserMenu } from "../../user-menu";
import { isCurrentStudioPage, STUDIO_NAV, STUDIO_TABS, studioPageTitle, type StudioNavItem } from "./nav";

/** How the studio presents itself in its own workspace. */
export interface StudioBrand {
  name: string;
  logoUrl: string | null;
  /** The studio's public page, once it has an address. */
  publicHref: string | null;
}

const ICONS: Partial<Record<StudioNavItem["icon"], typeof DashboardIcon>> = {
  dashboard: DashboardIcon,
  calendar: CalendarIcon,
  studio: StudioIcon,
  tasks: TasksIcon,
  agents: AgentsIcon,
  clients: ClientsIcon,
  invoice: InvoiceIcon,
  payment: PaymentIcon,
  products: ProductsIcon,
  showroom: ShowroomIcon,
  settings: SettingsIcon,
};

function StudioMark({ brand, size }: { brand: StudioBrand; size: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A logo that failed before the page was interactive never fires onError.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setBroken(true);
  }, []);
  const box = size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs";
  if (brand.logoUrl && !broken) {
    // A studio's own upload (R2): a plain img, so no remote-image config is needed.
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={img} src={brand.logoUrl} alt="" onError={() => setBroken(true)} className={`${box} shrink-0 rounded-lg object-cover`} />;
  }
  const initials = brand.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className={`${box} grid shrink-0 place-items-center rounded-lg bg-brand-500 font-semibold text-white`}>
      {initials || "S"}
    </span>
  );
}

// Desktop/tablet (md+): the studio's mark and name, its menu, and the way back to Aming.
function StudioSidebar({ brand }: { brand: StudioBrand }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-5">
        <StudioMark brand={brand} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{brand.name}</p>
          <p className="text-xs text-muted">My Studio</p>
        </div>
      </div>
      <nav aria-label="My Studio" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {STUDIO_NAV.map((section) => (
          <div key={section.id}>
            {section.label ? (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{section.label}</p>
            ) : null}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isCurrentStudioPage(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch
                      aria-current={active ? "page" : undefined}
                      className={`menu-item ${active ? "menu-item-active" : "menu-item-inactive"}`}
                    >
                      {Icon ? <Icon className={`h-5 w-5 ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} /> : null}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <Link href="/" className="menu-item menu-item-inactive">
          <BackIcon className="h-5 w-5 menu-item-icon-inactive" />
          Back to Aming
        </Link>
      </div>
    </aside>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function StudioTopbar({ brand, user }: { brand: StudioBrand; user: { name: string; avatarUrl: string | null } }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      {/* Phones have no sidebar: the studio's mark keeps them oriented. */}
      <span className="md:hidden">
        <StudioMark brand={brand} size="sm" />
      </span>
      <h1 className="truncate text-base font-semibold">{studioPageTitle(pathname)}</h1>
      <div className="relative ml-auto flex items-center gap-3">
        <Link
          href={brand.publicHref ?? "/studio/profile"}
          target={brand.publicHref ? "_blank" : undefined}
          title={brand.publicHref ? "Your studio's public page" : "Choose your studio's address first"}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <ExternalIcon className="h-4 w-4" />
          <span className="hidden sm:inline">View public page</span>
        </Link>
        <NotificationBell fetchNotifications={getMyNotifications} />
        <ClientUserMenu name={user.name} avatarUrl={user.avatarUrl} />
      </div>
    </header>
  );
}

// Phones: Dashboard, Bookings, Projects and Clients on the bar; the rest, and
// the way back to Aming, in "More".
function StudioHomeBar() {
  const items = STUDIO_NAV.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label ?? undefined })));
  const tabs: HomeBarLink[] = STUDIO_TABS.map((href) => items.find((i) => i.href === href)!).map((i) => ({
    href: i.href,
    label: i.label,
    icon: i.icon,
    exact: i.exact,
  }));
  const more: HomeBarLink[] = [
    ...items.filter((i) => !STUDIO_TABS.includes(i.href)),
    { href: "/", label: "Back to Aming", icon: "back" as const, exact: true, section: "Aming" },
  ];
  return <HomeBar tabs={tabs} more={more} logout={logoutClient} afterLogout="/" />;
}

/**
 * My Studio's own frame: the studio's workflow only, apart from the Aming
 * marketplace (which keeps ClientShell). "Back to Aming" returns there.
 */
export function StudioShell({
  brand,
  user,
  children,
}: {
  brand: StudioBrand;
  user: { name: string; avatarUrl: string | null };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <StudioSidebar brand={brand} />
      <div className="flex min-h-screen flex-col md:pl-64">
        <StudioTopbar brand={brand} user={user} />
        <main className="flex-1 bg-background px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-4">{children}</div>
        </main>
      </div>
      <StudioHomeBar />
    </div>
  );
}
