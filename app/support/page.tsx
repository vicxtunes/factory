import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { HomeBar } from "@/components/ui/HomeBar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PushOptIn } from "@/components/push/PushOptIn";
import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import {
  getClientSession,
  getDashboardSession,
  getDesignerSession,
  getWorkerSession,
} from "@/lib/auth/session";
import { fetchNotifications } from "@/lib/queries";

import { DashboardShell } from "@/app/dashboard/shell";
import { ClientShell } from "@/app/client-side/shell";
import { getMyNotifications as getMyWorkerNotifications, logoutWorker } from "@/app/factory/actions";
import { LogoutButton as WorkerLogoutButton } from "@/app/factory/logout-button";
import { getMyNotifications as getMyDesignerNotifications, logoutDesigner } from "@/app/graphics/actions";
import { LogoutButton as DesignerLogoutButton } from "@/app/graphics/logout-button";

import { ClientSupportContent } from "./client-support";
import { SupportForm } from "./support-form";

export const metadata = { title: "Support — Order Tracker" };
export const dynamic = "force-dynamic";

// Same self-service content everywhere (report form + notification opt-in),
// but wrapped in whichever surface's own navigation the visitor came from —
// a bare, chrome-less page here would strand them without their sidebar/
// board link. Checked in the same precedence resolveActor() uses.
function SupportPageContent() {
  return (
    // No px/py here — each caller below already provides the right outer
    // padding for its own surface (the shells' <main>, or the plain <main>
    // wrappers further down); doubling up on top of that squeezed the
    // content badly on narrow phones.
    <div className="mx-auto w-full max-w-lg space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <p className="mt-1 text-xs text-muted">
          Get alerted the moment something needs your attention — new statuses, delays, and more.
        </p>
        <div className="mt-3">
          <PushOptIn triggerClassName="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border bg-surface px-4 text-sm font-medium shadow-theme-xs hover:bg-background" />
        </div>
      </section>

      <SupportForm />
    </div>
  );
}

export default async function SupportPage() {
  // Same precedence as resolveActor() (lib/audit/log.ts): dashboard,
  // designer, worker, client.
  const dashboardSession = await getDashboardSession();
  if (dashboardSession) {
    const notifications = await fetchNotifications(10);
    return (
      <DashboardShell
        email={dashboardSession.email}
        fullName={dashboardSession.fullName}
        avatarUrl={dashboardSession.avatarUrl}
        role={dashboardSession.role}
        notifications={notifications}
      >
        <SupportPageContent />
      </DashboardShell>
    );
  }

  const designerSession = await getDesignerSession();
  if (designerSession) {
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
                href="/graphics"
                className="hidden text-white/70 hover:text-white text-xs underline-offset-2 hover:underline sm:inline"
              >
                Back to board
              </Link>
              <NotificationBell
                fetchNotifications={getMyDesignerNotifications}
                triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              />
              <span className="hidden text-white/80 sm:inline">{designerSession.name}</span>
              <DesignerLogoutButton />
            </>
          }
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
          <SupportPageContent />
        </main>
        <HomeBar
          tabs={[
            { href: "/graphics", label: "Board", icon: "dashboard" },
            { href: "/chat", label: "Chat", icon: "chat" },
            { href: "/support", label: "Support", icon: "support" },
          ]}
          logout={logoutDesigner}
          afterLogout="/graphics"
        />
      </>
    );
  }

  const workerSession = await getWorkerSession();
  if (workerSession) {
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
                fetchNotifications={getMyWorkerNotifications}
                triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              />
              <span className="hidden text-white/80 sm:inline">{workerSession.name}</span>
              <WorkerLogoutButton />
            </>
          }
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
          <SupportPageContent />
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

  const clientSession = await getClientSession();
  if (clientSession) {
    return (
      <ClientShell signedIn name={clientSession.name} avatarUrl={clientSession.avatarUrl}>
        <ClientSupportContent />
      </ClientShell>
    );
  }

  // Not signed in anywhere — bare page, same as before.
  return (
    <>
      <Header surface="Support" />
      <main className="flex-1 px-4 py-8">
        <SupportPageContent />
      </main>
    </>
  );
}
