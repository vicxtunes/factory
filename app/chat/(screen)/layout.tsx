import Link from "next/link";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { Header } from "@/components/ui/Header";
import {
  getClientSession,
  getDashboardSession,
  getDesignerSession,
  getWorkerSession,
} from "@/lib/auth/session";
import { clientPath } from "@/lib/client-portal/paths";
import { fetchNotifications } from "@/lib/queries";

import { ClientShell } from "@/app/client-side/shell";
import { DashboardShell } from "@/app/dashboard/shell";
import { WorkerChrome } from "@/app/factory/worker-chrome";
import { GraphicsShell } from "@/app/graphics/shell";

export const metadata = { title: "Chat — Order Tracker" };

// One chat screen for every surface. Like /support, it renders inside the
// visitor's own navigation (dashboard sidebar, factory/graphics header, client
// portal) so nobody is stranded on a chrome-less page. Session precedence
// matches resolveActor() in lib/audit/log.ts, which the chat module itself
// uses to identify the caller — so the shell and the data always agree.
//
// It's a layout rather than the page so the shell and ChatApp stay mounted
// while chatting: opening a conversation only changes ?c= (see ChatApp), and
// the inbox is loaded here with the page instead of after it. It sits in the
// (screen) group, below app/chat/loading.tsx, so a click on a Chat link shows
// the skeleton at once and prefetching never runs this layout's queries.

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
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
        <ChatScreen viewer={{ type: "dashboard_user", id: dashboard.userId }} exitHref="/dashboard" />
        {children}
      </DashboardShell>
    );
  }

  const designer = await getDesignerSession();
  if (designer) {
    return (
      <GraphicsShell name={designer.name} avatarUrl={designer.avatarUrl}>
        <ChatScreen viewer={{ type: "designer", id: designer.designer_id }} exitHref="/graphics" />
        {children}
      </GraphicsShell>
    );
  }

  const worker = await getWorkerSession();
  if (worker) {
    return (
      <WorkerChrome name={worker.name}>
        <ChatScreen viewer={{ type: "worker", id: worker.worker_id }} exitHref="/factory" />
        {children}
      </WorkerChrome>
    );
  }

  const client = await getClientSession();
  if (client) {
    return (
      <ClientShell signedIn name={client.name} avatarUrl={client.avatarUrl}>
        <ChatScreen viewer={{ type: "client", id: client.client_id }} exitHref={clientPath()} />
        {children}
      </ClientShell>
    );
  }

  return (
    <>
      <Header surface="Chat" />
      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-muted">Sign in to use chat.</p>
        <p className="flex flex-wrap justify-center gap-3 text-sm font-medium text-brand-600">
          <Link href={clientPath()}>Client portal</Link>
          <Link href="/dashboard">Staff dashboard</Link>
          <Link href="/factory">Factory</Link>
          <Link href="/graphics">Graphics</Link>
        </p>
      </main>
    </>
  );
}
