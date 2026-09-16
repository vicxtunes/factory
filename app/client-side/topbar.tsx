"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NotificationBell } from "@/components/notifications/NotificationBell";

import { getMyNotifications } from "./actions";
import { ClientUserMenu } from "./user-menu";

// Same shape as app/dashboard/topbar.tsx.

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/client-side": "Dashboard",
  "/client-side/orders": "My Orders",
  "/client-side/history": "History",
  "/client-side/new": "Place order",
  "/client-side/showroom": "Showroom",
  "/client-side/settings": "Settings",
};

export function ClientTopbar({
  signedIn,
  name,
  onToggleSidebar,
}: {
  signedIn: boolean;
  name: string | null;
  onToggleSidebar: () => void;
}) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Client Portal";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle menu"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-gray-100 dark:hover:bg-white/5 md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="relative ml-auto flex items-center gap-3">
        {signedIn && name ? (
          <>
            <NotificationBell fetchNotifications={getMyNotifications} />
            <ClientUserMenu name={name} />
          </>
        ) : (
          <Link href="/client-side" className="text-sm font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
