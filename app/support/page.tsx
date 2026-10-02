import { Header } from "@/components/ui/Header";
import { PushOptIn } from "@/components/push/PushOptIn";
import {
  getClientSession,
  getDashboardSession,
  getDesignerSession,
  getWorkerSession,
} from "@/lib/auth/session";
import { fetchNotifications } from "@/lib/queries";
import { fetchResolvedReportNotices, mergeNotices } from "@/lib/support/notices";

import { DashboardShell } from "@/app/dashboard/shell";
import { ClientShell } from "@/app/client-side/shell";
import { ClientSupportContent } from "@/app/client-side/support-content";
import { WorkerChrome } from "@/app/factory/worker-chrome";
import { GraphicsShell } from "@/app/graphics/shell";

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
    const [events, notices] = await Promise.all([
      fetchNotifications(10),
      fetchResolvedReportNotices({ type: "dashboard_user", id: dashboardSession.userId }),
    ]);
    const notifications = mergeNotices(events, notices, 10);
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
      <GraphicsShell name={designerSession.name} avatarUrl={designerSession.avatarUrl}>
        <SupportPageContent />
      </GraphicsShell>
    );
  }

  const workerSession = await getWorkerSession();
  if (workerSession) {
    return (
      <WorkerChrome name={workerSession.name}>
        <SupportPageContent />
      </WorkerChrome>
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
