"use client";

import { AnnouncementPopup } from "@repo/ui/announcements/AnnouncementPopup";
import { InstallGate } from "@repo/ui/pwa/InstallGate";
import { NotificationGate } from "@repo/ui/pwa/NotificationGate";
import { HomeBar, type HomeBarLink } from "@repo/ui/HomeBar";

import { logoutDesigner } from "./actions";
import { GRAPHICS_NAV } from "./nav";
import { GraphicsSidebar } from "./sidebar";
import { GraphicsTopbar } from "./topbar";

// Phones: the daily loop (orders, chat) on the bar; Support and log out sit
// in "More" — the same split as the dashboard and client portal bars.
const ON_BAR = new Set(["/graphics", "/chat"]);
const links: HomeBarLink[] = GRAPHICS_NAV.flatMap((s) =>
  s.items.map((i) => ({ href: i.href, label: i.label, barLabel: i.barLabel, icon: i.icon, section: s.label ?? undefined })),
);
const barTabs = links.filter((l) => ON_BAR.has(l.href));
const moreLinks = links.filter((l) => !ON_BAR.has(l.href));

// The signed-in designer's frame: sidebar + sticky topbar + main, the same
// shape as app/client-side/shell.tsx and app/dashboard/shell.tsx. Used by
// /graphics and by /chat and /support for a designer session, so the
// navigation never changes under them. The signed-out login screen doesn't
// use it.
export function GraphicsShell({
  name,
  avatarUrl,
  children,
}: {
  name: string;
  avatarUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <GraphicsSidebar />
      <div className="flex min-h-screen flex-col md:pl-64">
        <GraphicsTopbar name={name} avatarUrl={avatarUrl} />
        {/* Extra bottom padding on mobile so content clears the fixed home bar. */}
        <main className="flex-1 bg-background px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-6">
          {children}
        </main>
      </div>
      <HomeBar tabs={barTabs} more={moreLinks} logout={logoutDesigner} afterLogout="/graphics" />
    </div>
  );
}
