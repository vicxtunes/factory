import { Header } from "@/components/ui/Header";
import { PushOptIn } from "@/components/push/PushOptIn";

import { SupportForm } from "./support-form";

export const metadata = { title: "Support — Order Tracker" };
export const dynamic = "force-dynamic";

// Shared across every surface (dashboard, client portal, factory, graphics)
// — the report form and notification opt-in used to be duplicated as
// topbar/header buttons on each one; both submitSupportReport/
// getMySupportReports and the push opt-in flow already resolve whichever
// actor is signed in (resolveActor()/usePushSubscription), so one page
// works for all of them instead of four copies.
export default function SupportPage() {
  return (
    <>
      <Header surface="Support" />
      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-8">
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
      </main>
    </>
  );
}
