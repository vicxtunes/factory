import Link from "next/link";

import { JOB_STATUS_LABELS, vendorTake, type JobView } from "@repo/lib/vendors/core";

import { JobActions } from "./job-actions";

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

/** Jobs as rows that open their page; requests can be answered right in the list (`answer`). */
export function JobList({ jobs, answer }: { jobs: JobView[]; answer?: boolean }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {jobs.map((j) => (
        <li key={j.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Link href={`/vendors/jobs/${j.id}`} className="min-w-0 flex-1 hover:underline">
            <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{j.studio.name}</p>
            <p className="truncate font-semibold">{j.projectTitle}</p>
            <p className="line-clamp-1 text-sm text-muted">{j.brief}</p>
          </Link>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
            <span className="flex-1 text-sm sm:flex-none">
              <span className="font-semibold tabular-nums">{money(vendorTake(j.price))}</span>
              <span className="text-muted"> · {j.status === "requested" ? (j.dueOn ? `due ${j.dueOn}` : "no due date") : JOB_STATUS_LABELS[j.status]}</span>
            </span>
            {answer ? <JobActions id={j.id} status={j.status} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
