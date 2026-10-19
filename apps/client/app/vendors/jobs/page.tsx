import type { JobStatus, JobView } from "@repo/lib/vendors/core";
import { vendorJobs } from "@repo/lib/vendors/server";

import { VendorFrame } from "../frame";
import { JobList } from "../job-list";
import { requireVendor } from "../vendor";

export const metadata = { title: "Jobs" };

// Every job studios have sent the vendor, by where it is: requests to answer,
// work in progress, delivered and waiting to be paid, then paid, then the
// ones that ended (declined or cancelled). Each opens its page (./[id]).
const GROUPS: { title: string; statuses: JobStatus[]; answer?: boolean; empty?: string }[] = [
  { title: "Requests", statuses: ["requested"], answer: true, empty: "No requests waiting. Studios on Aming will send them here." },
  { title: "In progress", statuses: ["accepted"], empty: "Nothing in progress." },
  { title: "Waiting for payment", statuses: ["delivered"] },
  { title: "Paid", statuses: ["paid"] },
  { title: "Declined or cancelled", statuses: ["declined", "cancelled"] },
];

export default async function VendorJobsPage() {
  const { session, vendor } = await requireVendor();
  const jobs = await vendorJobs.forVendor(session.client_id);
  const groups = GROUPS.map((g) => ({ ...g, jobs: jobs.filter((j: JobView) => g.statuses.includes(j.status)) }));

  return (
    <VendorFrame vendor={vendor} page="jobs">
      <div className="space-y-8 px-4 py-6 sm:px-6 lg:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        {groups.map((g) =>
          g.jobs.length || g.empty ? (
            <section key={g.title} className="space-y-3">
              <h2 className="flex items-baseline gap-2 text-lg font-semibold">
                {g.title}
                {g.jobs.length ? <span className="text-sm font-normal text-muted">{g.jobs.length}</span> : null}
              </h2>
              {g.jobs.length ? (
                <JobList jobs={g.jobs} answer={g.answer} />
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{g.empty}</p>
              )}
            </section>
          ) : null,
        )}
      </div>
    </VendorFrame>
  );
}
