"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatLauncher } from "@repo/ui/chat/ChatLauncher";
import { NotificationBell } from "@repo/ui/notifications/NotificationBell";

import { getMyNotifications } from "./actions";
import { ClientUserMenu } from "./user-menu";

// Same shape as app/dashboard/topbar.tsx.

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/orders": "My Orders",
  "/history": "History",
  "/new": "Place order",
  "/showroom": "Showroom",
  "/settings": "Settings",
  "/studio": "My Studio",
  "/studio/clients": "Clients",
  "/studio/clients/new": "New client",
  "/studio/offerings": "Packages & Services",
  "/studio/offerings/new": "New package or service",
  "/studio/quotations": "Quotations",
  "/studio/quotations/new": "New quotation",
  "/support": "Support",
  "/chat": "Chat",
};

// A page without its own title (e.g. one studio client) takes its section's:
// the longest listed path it sits under.
function sectionTitle(pathname: string): string {
  const parent = Object.keys(PAGE_TITLES)
    .filter((path) => path !== "/" && pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? PAGE_TITLES[parent] : "Client Portal";
}

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
  const title = PAGE_TITLES[pathname] ?? sectionTitle(pathname);

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
          <Link href="/?signin=1" className="text-sm font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
