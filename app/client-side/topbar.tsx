"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatLauncher } from "@/components/chat/ChatLauncher";
import { NotificationBell } from "@/components/notifications/NotificationBell";

import { getMyNotifications } from "./actions";
import { ClientUserMenu } from "./user-menu";

// Same shape as app/dashboard/topbar.tsx.

const PAGE_TITLES: Record<string, string> = {
  "/client-side": "Dashboard",
  "/client-side/orders": "My Orders",
  "/client-side/history": "History",
  "/client-side/new": "Place order",
  "/client-side/showroom": "Showroom",
  "/client-side/settings": "Settings",
  "/support": "Support",
  "/chat": "Chat",
};

export function ClientTopbar({
  signedIn,
  name,
  avatarUrl,
}: {
  signedIn: boolean;
  name: string | null;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Client Portal";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="relative ml-auto flex items-center gap-3">
        {signedIn && name ? (
          <>
            <ChatLauncher />
            <NotificationBell fetchNotifications={getMyNotifications} />
            <ClientUserMenu name={name} avatarUrl={avatarUrl} />
          </>
        ) : (
          <Link href="/client-side?signin=1" className="text-sm font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
