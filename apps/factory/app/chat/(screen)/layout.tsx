import Link from "next/link";

import { ChatScreen } from "@repo/ui/chat/ChatScreen";
import { Header } from "@repo/ui/Header";
import {
  getDashboardSession,
  getDesignerSession,
  getWorkerSession,
} from "@repo/lib/auth/session";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { fetchNotifications } from "@repo/lib/queries";

import { DashboardShell } from "@/app/dashboard/shell";
import { WorkerChrome } from "@/app/factory/worker-chrome";
import { GraphicsShell } from "@/app/graphics/shell";

export const metadata = { title: "Chat — Order Tracker" };

// One chat screen for every staff surface. Like /support, it renders inside
// the visitor's own navigation (dashboard sidebar, factory/graphics header)
// so nobody is stranded on a chrome-less page. Clients chat in the client
// app (apps/client/app/chat). Session precedence
// matches resolveActor() in packages/lib/audit/log.ts, which the chat module itself
// uses to identify the caller — so the shell and the data always agree.
//
// It's a layout rather than the page so the shell and ChatApp stay mounted
// while chatting: opening a conversation only changes ?c= (see ChatApp).

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

  return (
    <>
      <Header surface="Chat" />
      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-muted">Sign in to use chat.</p>
        <p className="flex flex-wrap justify-center gap-3 text-sm font-medium text-brand-600">
          <a href={clientUrl()}>Client portal</a>
          <Link href="/dashboard">Staff dashboard</Link>
          <Link href="/factory">Factory</Link>
          <Link href="/graphics">Graphics</Link>
        </p>
      </main>
    </>
  );
}
