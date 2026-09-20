"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { logoutClient } from "./actions";
import {
  DashboardIcon,
  HistoryIcon,
  OrdersIcon,
  PlaceOrderIcon,
  SettingsIcon,
  ShowroomIcon,
  SupportIcon,
} from "./sidebar";

// Mobile home bar (public/design "Homebar"): a dark pill pinned to the bottom
// with four destinations plus a "more" menu; the active one sits in a white
// circle that slides between slots. Hidden from md up, where the sidebar takes
// over. Signed-in only — signed out there is just the public Showroom.

interface BarTab {
  href: string;
  label: string;
  icon: typeof OrdersIcon;
}

const MAIN_TABS: BarTab[] = [
  { href: "/client-side", label: "Dashboard", icon: DashboardIcon },
  { href: "/client-side/orders", label: "Orders", icon: OrdersIcon },
  { href: "/client-side/showroom", label: "Showroom", icon: ShowroomIcon },
  { href: "/support", label: "Support", icon: SupportIcon },
];

const MORE_TABS: BarTab[] = [
  { href: "/client-side/new", label: "Place Order", icon: PlaceOrderIcon },
  { href: "/client-side/history", label: "History", icon: HistoryIcon },
  { href: "/client-side/settings", label: "Settings", icon: SettingsIcon },
];

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

function isActive(pathname: string, href: string): boolean {
  return href === "/client-side" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function ClientMobileBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Close the "more" sheet on outside tap or Escape (and on any link tap below).
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

  const mainIndex = MAIN_TABS.findIndex((t) => isActive(pathname, t.href));
  const moreActive = MORE_TABS.some((t) => isActive(pathname, t.href));
  // Slot 4 is the "more" button: lit while its sheet is open or when the
  // current page lives in it.
  const slot = moreOpen || moreActive ? MAIN_TABS.length : mainIndex;

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {moreOpen ? (
        <div className="mb-2 ml-auto w-56 rounded-2xl border border-border bg-surface p-2 shadow-theme-lg">
          {MORE_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                  isActive(pathname, tab.href) ? "bg-brand-500/10 text-brand-600" : "text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await logoutClient();
                router.replace("/client-side");
                router.refresh();
              })
            }
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted disabled:opacity-50"
          >
            <LogoutIcon className="h-5 w-5" />
            Log out
          </button>
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className="relative grid h-16 grid-cols-5 rounded-full bg-gray-900 p-1.5 shadow-theme-lg ring-1 ring-white/10"
      >
        {slot >= 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1.5 left-1.5 flex w-[calc((100%-0.75rem)/5)] items-center justify-center transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${slot * 100}%)` }}
          >
            <span className="h-full aspect-square rounded-full bg-white" />
          </span>
        ) : null}

        {MAIN_TABS.map((tab, i) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              onClick={() => setMoreOpen(false)}
              aria-current={i === mainIndex && !moreOpen ? "page" : undefined}
              className={`relative z-10 flex items-center justify-center transition-colors duration-300 ${
                slot === i ? "text-gray-900" : "text-white"
              }`}
            >
              <Icon className="h-6 w-6" />
            </Link>
          );
        })}

        <button
          type="button"
          aria-label="More options"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          className={`relative z-10 flex items-center justify-center transition-colors duration-300 ${
            slot === MAIN_TABS.length ? "text-gray-900" : "text-white"
          }`}
        >
          <MoreIcon className="h-6 w-6" />
        </button>
      </nav>
    </div>
  );
}
