"use client";

import { usePathname } from "next/navigation";

import type { NotificationRow } from "@/lib/types";

import { NotificationMenu } from "./notification-menu";
import { UserMenu } from "./user-menu";

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/orders": "Orders & items",
  "/dashboard/orders/new": "New order",
  "/dashboard/workers": "Workers & stations",
  "/dashboard/designers": "Graphics designers",
  "/dashboard/admins": "Dashboard admins",
};

export function DashboardTopbar({
  email,
  role,
  notifications,
  onToggleSidebar,
}: {
  email: string | null;
  role: string;
  notifications: NotificationRow[];
  onToggleSidebar: () => void;
}) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle menu"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-gray-100 dark:hover:bg-white/5 lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <NotificationMenu initial={notifications} />
        <UserMenu email={email} role={role} />
      </div>
    </header>
  );
}
