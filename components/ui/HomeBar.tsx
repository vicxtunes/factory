"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  AdminsIcon,
  AgentsIcon,
  AnnouncementIcon,
  ClientsIcon,
  DashboardIcon,
  DesignersIcon,
  DisplayIcon,
  MarketingIcon,
  OrdersIcon,
  ProductsIcon,
  SupportIcon,
  WorkersIcon,
} from "@/app/dashboard/sidebar";
import { HistoryIcon, PlaceOrderIcon, SettingsIcon, ShowroomIcon } from "@/app/client-side/sidebar";

// Mobile "home bar" shared by every signed-in surface (client portal, staff
// dashboard, factory floor, graphics). A brand-toned pill pinned to the
// bottom: a few primary destinations, a sliding circle marking where you are,
// and a "more" button for everything else plus log out.
//
// Why a bottom bar: on a phone the primary nav is otherwise hidden behind a
// hamburger at the top-left, the hardest place to reach one-handed. The bar
// keeps the 3–4 places people actually go a thumb-tap away, and pushes the
// long tail into "more" so the bar never gets crowded (the count of primary
// tabs is what sets the slot width — see `slots` below).
//
// Icons are passed by name, not as components: the factory and graphics pages
// are server components, and functions can't cross the server→client boundary.

const ICONS = {
  dashboard: DashboardIcon,
  orders: OrdersIcon,
  clients: ClientsIcon,
  agents: AgentsIcon,
  products: ProductsIcon,
  marketing: MarketingIcon,
  workers: WorkersIcon,
  designers: DesignersIcon,
  admins: AdminsIcon,
  support: SupportIcon,
  display: DisplayIcon,
  announcements: AnnouncementIcon,
  history: HistoryIcon,
  placeOrder: PlaceOrderIcon,
  settings: SettingsIcon,
  showroom: ShowroomIcon,
} as const;

export type HomeBarIcon = keyof typeof ICONS;

export interface HomeBarLink {
  href: string;
  label: string;
  icon: HomeBarIcon;
  /** Match only this exact path (for section roots like /dashboard). */
  exact?: boolean;
  newTab?: boolean;
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5.5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="18.5" cy="12" r="1.75" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M18 12H9m9 0-3-3m3 3-3 3"
      />
    </svg>
  );
}

function isActive(pathname: string, link: HomeBarLink): boolean {
  if (link.newTab) return false;
  return link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

// Tailwind needs the class names spelled out, so the breakpoint is a lookup
// rather than a template string. Surfaces with a sidebar (client portal at
// md, staff dashboard at lg) hand over to it at the width it appears.
const HIDE_FROM = { md: "md:hidden", lg: "lg:hidden" } as const;

export function HomeBar({
  tabs,
  more = [],
  logout,
  afterLogout,
  hideFrom = "md",
}: {
  /** Primary destinations, 1–4. */
  tabs: HomeBarLink[];
  /** Everything else, shown in the "more" sheet. */
  more?: HomeBarLink[];
  /** Server action that ends the session; adds a Log out row to the sheet. */
  logout?: () => Promise<void>;
  afterLogout?: string;
  hideFrom?: keyof typeof HIDE_FROM;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Close the sheet on outside tap or Escape (link taps close it directly).
  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const hasMore = more.length > 0 || !!logout;
  const slots = tabs.length + (hasMore ? 1 : 0);
  const tabIndex = tabs.findIndex((t) => isActive(pathname, t));
  const moreActive = more.some((t) => isActive(pathname, t));
  // The "more" slot lights up while its sheet is open, or when the current
  // page lives inside it — the indicator should always say where you are.
  const activeSlot = hasMore && (moreOpen || moreActive) ? tabs.length : tabIndex;

  return (
    <div
      ref={ref}
      className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${HIDE_FROM[hideFrom]}`}
    >
      {moreOpen ? (
        <div className="mb-2 ml-auto max-h-[60vh] w-60 overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-theme-lg">
          {more.map((link) => {
            const Icon = ICONS[link.icon];
            const active = isActive(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                target={link.newTab ? "_blank" : undefined}
                rel={link.newTab ? "noopener noreferrer" : undefined}
                onClick={() => setMoreOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${
                  active
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
          {logout ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await logout();
                  if (afterLogout) router.replace(afterLogout);
                  router.refresh();
                })
              }
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-muted hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/5 ${
                more.length ? "mt-1 border-t border-border pt-1" : ""
              }`}
            >
              <LogoutIcon className="h-5 w-5" />
              Log out
            </button>
          ) : null}
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className="relative grid h-16 rounded-full bg-brand-950 p-1.5 shadow-theme-lg ring-1 ring-brand-800/60"
        style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}
      >
        {activeSlot >= 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1.5 left-1.5 flex items-center justify-center transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `calc((100% - 0.75rem) / ${slots})`, transform: `translateX(${activeSlot * 100}%)` }}
          >
            <span className="aspect-square h-full rounded-full bg-brand-500" />
          </span>
        ) : null}

        {tabs.map((tab, i) => {
          const Icon = ICONS[tab.icon];
          const current = i === activeSlot;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              target={tab.newTab ? "_blank" : undefined}
              rel={tab.newTab ? "noopener noreferrer" : undefined}
              aria-label={tab.label}
              aria-current={current ? "page" : undefined}
              onClick={() => setMoreOpen(false)}
              className={`relative z-10 flex items-center justify-center rounded-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-brand-300 ${
                current ? "text-brand-950" : "text-brand-100"
              }`}
            >
              <Icon className="h-6 w-6" />
            </Link>
          );
        })}

        {hasMore ? (
          <button
            type="button"
            aria-label="More options"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className={`relative z-10 flex items-center justify-center rounded-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-brand-300 ${
              activeSlot === tabs.length ? "text-brand-950" : "text-brand-100"
            }`}
          >
            <MoreIcon className="h-6 w-6" />
          </button>
        ) : null}
      </nav>
    </div>
  );
}
