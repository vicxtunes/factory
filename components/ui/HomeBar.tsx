"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
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
import { HistoryIcon, PaymentIcon, PlaceOrderIcon, SettingsIcon, ShowroomIcon } from "@/app/client-side/sidebar";
import { ChatIcon } from "@/components/chat/icons";

// Mobile "home bar" shared by every signed-in surface (client portal, staff
// dashboard, factory floor, graphics). A flat, full-width bar pinned to the
// bottom: a few primary destinations, a brand-orange circle behind the current
// one, and a "more" button for everything else plus log out.
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
  chat: ChatIcon,
  history: HistoryIcon,
  payment: PaymentIcon,
  placeOrder: PlaceOrderIcon,
  settings: SettingsIcon,
  showroom: ShowroomIcon,
} as const;

export type HomeBarIcon = keyof typeof ICONS;

export interface HomeBarLink {
  href: string;
  label: string;
  icon: HomeBarIcon;
  /** Shorter text for the bar itself when `label` is too long to fit under an icon. */
  barLabel?: string;
  /** Match only this exact path (for section roots like /dashboard). */
  exact?: boolean;
  newTab?: boolean;
  /** "More" sheet only: a heading shown above the first link of each section. */
  section?: string;
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

// One slot's visual: the icon centred inside a circle, caption underneath.
// The circle is the icon's own wrapper (filled brand orange when current,
// transparent otherwise), so the icon is centred in it by construction — no
// separately positioned indicator to drift out of alignment on different
// screen widths. Colours come from the app's theme tokens, so it follows
// light/dark mode. Caption truncates rather than wraps to keep the bar height
// fixed; the icon alone isn't always obvious, so every slot names itself.
function BarItem({
  current,
  label,
  children,
}: {
  current: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ${
          current ? "bg-brand-600 text-white" : "text-muted"
        }`}
      >
        {children}
      </span>
      <span
        className={`mt-0.5 w-full truncate px-0.5 text-center text-[10px] leading-tight ${
          current ? "font-semibold text-brand-600 dark:text-brand-400" : "font-medium text-muted"
        }`}
      >
        {label}
      </span>
    </>
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
    <div ref={ref} className={`fixed inset-x-0 bottom-0 z-40 ${HIDE_FROM[hideFrom]}`}>
      {moreOpen ? (
        <div className="mb-2 ml-auto mr-3 max-h-[60vh] w-60 overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-theme-lg">
          {more.map((link, i) => {
            const Icon = ICONS[link.icon];
            const active = isActive(pathname, link);
            const heading = link.section && link.section !== more[i - 1]?.section ? link.section : null;
            return (
              <Fragment key={link.href}>
                {heading ? (
                  <p className={`px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted ${i > 0 ? "mt-2 border-t border-border pt-3" : "pt-1"}`}>
                    {heading}
                  </p>
                ) : null}
                <Link
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
              </Fragment>
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

      {/* Flat, full-width bar: edge to edge, top hairline, safe-area padding
          inside the surface so it reads as one piece on notched phones. */}
      <nav
        aria-label="Primary"
        className="grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pt-1.5"
        style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab, i) => {
          const Icon = ICONS[tab.icon];
          const current = i === activeSlot;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              target={tab.newTab ? "_blank" : undefined}
              rel={tab.newTab ? "noopener noreferrer" : undefined}
              aria-current={current ? "page" : undefined}
              onClick={() => setMoreOpen(false)}
              className="flex min-w-0 flex-col items-center pb-1.5 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <BarItem current={current} label={tab.barLabel ?? tab.label}>
                <Icon className="h-6 w-6" />
              </BarItem>
            </Link>
          );
        })}

        {hasMore ? (
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className="flex min-w-0 flex-col items-center pb-1.5 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <BarItem current={activeSlot === tabs.length} label="More">
              <MoreIcon className="h-6 w-6" />
            </BarItem>
          </button>
        ) : null}
      </nav>
    </div>
  );
}
