import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { HomeBar } from "@/components/ui/HomeBar";
import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getDesignerSession } from "@/lib/auth/session";
import {
  fetchActiveWorkersPublic,
  fetchAgents,
  fetchClients,
  fetchDesignerItems,
  fetchDesigners,
  fetchProductCatalog,
} from "@/lib/queries";

import { getMyNotifications, logoutDesigner } from "./actions";
import { Board } from "./board";
import { DesignerLogin } from "./login";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Graphics — Order Tracker" };
export const dynamic = "force-dynamic";

export default async function GraphicsPage() {
  const session = await getDesignerSession();

  if (!session) {
    const designers = await fetchDesigners(true);
    return (
      <>
        <Header surface="Graphics" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <DesignerLogin designers={designers} />
        </main>
      </>
    );
  }

  const [items, catalog, clients, agents, workers] = await Promise.all([
    fetchDesignerItems(session.designer_id),
    fetchProductCatalog(true),
    fetchClients(true),
    fetchAgents(true),
    fetchActiveWorkersPublic(),
  ]);

  return (
    <>
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <Header
        surface="Graphics"
        right={
          <>
            <Link
              href="/support"
              className="hidden text-white/70 hover:text-white text-xs underline-offset-2 hover:underline sm:inline"
            >
              Support
            </Link>
            <NotificationBell
              fetchNotifications={getMyNotifications}
              triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            />
            <span className="hidden text-white/80 sm:inline">{session.name}</span>
            <LogoutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-24 md:pb-4">
        <Board
          initialItems={items}
          designerId={session.designer_id}
          designerName={session.name}
          catalog={catalog}
          clients={clients}
          agents={agents}
          workers={workers}
        />
      </main>
      <HomeBar
        tabs={[
          { href: "/graphics", label: "Board", icon: "dashboard" },
          { href: "/support", label: "Support", icon: "support" },
        ]}
        logout={logoutDesigner}
        afterLogout="/graphics"
      />
    </>
  );
}
