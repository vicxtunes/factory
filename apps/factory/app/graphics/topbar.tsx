"use client";

import { usePathname } from "next/navigation";

import { ChatLauncher } from "@repo/ui/chat/ChatLauncher";
import { NotificationBell } from "@repo/ui/notifications/NotificationBell";

import { getMyNotifications } from "./actions";
import { GRAPHICS_NAV } from "./nav";
import { DesignerUserMenu } from "./user-menu";

// Same shape as app/client-side/topbar.tsx. The title is the current page's
// nav label, so it can't drift from the sidebar.
const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  GRAPHICS_NAV.flatMap((s) => s.items.map((i) => [i.href, i.label])),
);

export function GraphicsTopbar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Graphics";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="relative ml-auto flex items-center gap-3">
        <ChatLauncher />
        <NotificationBell fetchNotifications={getMyNotifications} />
        <DesignerUserMenu name={name} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
