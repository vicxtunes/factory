import { Suspense } from "react";
import Link from "next/link";

import { ChatApp } from "@/components/chat/ChatApp";
import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import { Header } from "@/components/ui/Header";
import { HomeBar } from "@/components/ui/HomeBar";
import {
  getClientSession,
  getDashboardSession,
  getDesignerSession,
  getWorkerSession,
} from "@/lib/auth/session";
import type { ParticipantRef } from "@/lib/chat/types";
import { fetchNotifications } from "@/lib/queries";

import { ClientShell } from "@/app/client-side/shell";
import { DashboardShell } from "@/app/dashboard/shell";
import { getMyNotifications as getMyWorkerNotifications, logoutWorker } from "@/app/factory/actions";
import { LogoutButton as WorkerLogoutButton } from "@/app/factory/logout-button";
import { getMyNotifications as getMyDesignerNotifications, logoutDesigner } from "@/app/graphics/actions";
import { LogoutButton as DesignerLogoutButton } from "@/app/graphics/logout-button";

export const metadata = { title: "Chat — Order Tracker" };
export const dynamic = "force-dynamic";

// One chat page for every surface. Like /support, it renders inside the
// visitor's own navigation (dashboard sidebar, factory/graphics header, client
// portal) so nobody is stranded on a chrome-less page. Session precedence
// matches resolveActor() in lib/audit/log.ts, which the chat module itself
// uses to identify the caller — so the shell and the data always agree.

function Chat({ viewer }: { viewer: ParticipantRef }) {
  // ChatApp reads ?c= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <ChatApp viewer={viewer} />
    </Suspense>
  );
}

/** Header + home bar shared by the two PIN surfaces (factory, graphics). */
function PinSurfaceChrome({
  surface,
  boardHref,
  name,
  fetchNotifications: fetchMine,
  logout,
  logoutButton,
  children,
}: {
  surface: string;
  boardHref: string;
  name: string;
  fetchNotifications: Parameters<typeof NotificationBell>[0]["fetchNotifications"];
  logout: () => Promise<void>;
  logoutButton: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <Header
        surface={surface}
        right={
          <>
            <Link
              href={boardHref}
              className="hidden text-white/70 hover:text-white text-xs underline-offset-2 hover:underline sm:inline"
            >
              Back to board
            </Link>
            <NotificationBell
              fetchNotifications={fetchMine}
              triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            />
            <span className="hidden text-white/80 sm:inline">{name}</span>
            {logoutButton}
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
        {children}
      </main>
      <HomeBar
        tabs={[
          { href: boardHref, label: "Board", icon: "dashboard" },
          { href: "/chat", label: "Chat", icon: "chat" },
          { href: "/support", label: "Support", icon: "support" },
        ]}
        logout={logout}
        afterLogout={boardHref}
      />
    </>
  );
}

export default async function ChatPage() {
  const dashboard = await getDashboardSession();
  if (dashboard) {
    const notifications = await fetchNotifications(10);
    return (
      <DashboardShell
        email={dashboard.email}
        fullName={dashboard.fullName}
        avatarUrl={dashboard.avatarUrl}
        role={dashboard.role}
        notifications={notifications}
      >
        <Chat viewer={{ type: "dashboard_user", id: dashboard.userId }} />
      </DashboardShell>
    );
  }

  const designer = await getDesignerSession();
  if (designer) {
    return (
      <PinSurfaceChrome
        surface="Graphics"
        boardHref="/graphics"
        name={designer.name}
        fetchNotifications={getMyDesignerNotifications}
        logout={logoutDesigner}
        logoutButton={<DesignerLogoutButton />}
      >
        <Chat viewer={{ type: "designer", id: designer.designer_id }} />
      </PinSurfaceChrome>
    );
  }

  const worker = await getWorkerSession();
  if (worker) {
    return (
      <PinSurfaceChrome
        surface="Factory"
        boardHref="/factory"
        name={worker.name}
        fetchNotifications={getMyWorkerNotifications}
        logout={logoutWorker}
        logoutButton={<WorkerLogoutButton />}
      >
        <Chat viewer={{ type: "worker", id: worker.worker_id }} />
      </PinSurfaceChrome>
    );
  }

  const client = await getClientSession();
  if (client) {
    return (
      <ClientShell signedIn name={client.name} avatarUrl={client.avatarUrl}>
        <Chat viewer={{ type: "client", id: client.client_id }} />
      </ClientShell>
    );
  }

  return (
    <>
      <Header surface="Chat" />
      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-muted">Sign in to use chat.</p>
        <p className="flex flex-wrap justify-center gap-3 text-sm font-medium text-brand-600">
          <Link href="/client-side">Client portal</Link>
          <Link href="/dashboard">Staff dashboard</Link>
          <Link href="/factory">Factory</Link>
          <Link href="/graphics">Graphics</Link>
        </p>
      </main>
    </>
  );
}
