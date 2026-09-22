"use client";

import { usePathname } from "next/navigation";

import type { NotificationRow } from "@/lib/types";

import { NotificationMenu } from "./notification-menu";
import { UserMenu } from "./user-menu";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/orders": "Office Orders",
  "/dashboard/orders/new": "New order",
  "/dashboard/order-approvals": "Client Orders",
  "/dashboard/marketing": "Marketing carousel",
  "/dashboard/workers": "Workers & stations",
  "/dashboard/designers": "Graphics designers",
  "/dashboard/admins": "Dashboard admins",
  "/dashboard/support": "Support reports",
  "/dashboard/announcements": "Announcements",
  "/support": "Support",
};

export function DashboardTopbar({
  email,
  fullName,
  avatarUrl,
  role,
  notifications,
}: {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  notifications: NotificationRow[];
}) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="relative ml-auto flex items-center gap-3">
        <NotificationMenu initial={notifications} />
        <UserMenu email={email} fullName={fullName} avatarUrl={avatarUrl} role={role} />
      </div>
    </header>
  );
}
