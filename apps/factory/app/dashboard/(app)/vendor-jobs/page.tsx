import { redirect } from "next/navigation";
import { after } from "next/server";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { SettleDispute } from "@repo/ui/vendors/SettleDispute";
import { getDashboardSession } from "@repo/lib/auth/session";
import { autoReleaseAt, vendorTake, type JobView } from "@repo/lib/vendors/core";
import { vendorJobs } from "@repo/lib/vendors/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendor jobs" };

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

// Studios' payments to vendors that Aming holds (packages/lib/vendors →
// jobs): disputes for the boss to settle (release to the
// vendor, or refund the studio), and delivered work waiting on a studio,
// released on its own two days after delivery. Opening it also settles
// what's overdue.
export default async function VendorJobsPage() {
  const session = await getDashboardSession();
  if (session?.role !== "boss") redirect("/dashboard");
  after(() => vendorJobs.sweepOverdue());
  const jobs = await vendorJobs.needingAttention();
  const disputes = jobs.filter((j) => j.status === "disputed");
  const waiting = jobs.filter((j) => j.status === "delivered");
  const held = jobs.reduce((sum, j) => sum + j.price, 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        Money studios paid in for vendors&apos; work, held by Aming until it&apos;s released or refunded. {held ? `${money(held)} held on the jobs below.` : null}
      </p>
      <section className="space-y-3">
        <SectionLabel>Disputes</SectionLabel>
        {disputes.length ? (
          <ul className="space-y-3">
            {disputes.map((j) => (
              <li key={j.id} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
                <JobSummary job={j} />
                <p className="rounded-xl bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/15 dark:text-error-400">
                  {j.disputedBy === "studio" ? j.studio.name : j.vendor.name}: &ldquo;{j.disputeReason}&rdquo;
                </p>
                <SettleDispute id={j.id} vendorName={j.vendor.name} studioName={j.studio.name} price={j.price} take={vendorTake(j.price)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">No disputes.</p>
        )}
      </section>
      <section className="space-y-3">
        <SectionLabel>Delivered, waiting on the studio</SectionLabel>
        {waiting.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {waiting.map((j) => (
              <li key={j.id} className="p-4">
                <JobSummary job={j} />
                <p className="mt-2 text-xs text-muted">
                  Released to the vendor {new Date(autoReleaseAt(j)!).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} unless the studio answers.
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">Nothing waiting.</p>
        )}
      </section>
    </div>
  );
}

function JobSummary({ job }: { job: JobView }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">
          {job.studio.name} → {job.vendor.name}
        </p>
        <p className="text-sm text-muted">{job.projectTitle}</p>
        <p className="mt-1 line-clamp-2 text-sm">{job.brief}</p>
      </div>
      <div className="text-right text-sm">
        <p className="font-semibold tabular-nums">{money(job.price)}</p>
        <p className="text-xs text-muted">held · delivered {job.deliveredAt ? new Date(job.deliveredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "not yet"}</p>
      </div>
    </div>
  );
}
