import Link from "next/link";

import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import { Header } from "@/components/ui/Header";
import { HomeBar } from "@/components/ui/HomeBar";

import { getMyNotifications, logoutWorker } from "./actions";
import { LogoutButton } from "./logout-button";

// The factory worker's page frame (header with board link, bell and logout;
// phone home bar) for the shared screens a worker can open outside their
// board — /chat and /support.
export function WorkerChrome({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <Header
        surface="Factory"
        right={
          <>
            <Link
              href="/factory"
              className="hidden text-white/70 hover:text-white text-xs underline-offset-2 hover:underline sm:inline"
            >
              Back to board
            </Link>
            <NotificationBell
              fetchNotifications={getMyNotifications}
              triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            />
            <span className="hidden text-white/80 sm:inline">{name}</span>
            <LogoutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
        {children}
      </main>
      <HomeBar
        tabs={[
          { href: "/factory", label: "Board", icon: "dashboard" },
          { href: "/chat", label: "Chat", icon: "chat" },
          { href: "/support", label: "Support", icon: "support" },
        ]}
        logout={logoutWorker}
        afterLogout="/factory"
      />
    </>
  );
}
