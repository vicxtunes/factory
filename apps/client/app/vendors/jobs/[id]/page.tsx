import { notFound } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { BackLink } from "@repo/ui/navigation/back";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { filesCaller } from "@repo/lib/files/access";
import { folderIdSchema } from "@repo/lib/files/core";
import { FileService } from "@repo/lib/files/service";
import { JOB_STATUS_LABELS, jobFee, jobIdSchema, reachesFolder, vendorTake } from "@repo/lib/vendors/core";
import { vendorJobs } from "@repo/lib/vendors/server";

import { VendorFrame } from "../../frame";
import { JobActions } from "../../job-actions";
import { requireVendor } from "../../vendor";

export const metadata = { title: "Job" };

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

// One job from a studio: what's needed, by when, for how much, and what the
// vendor can do now (accept or decline; mark it delivered). Once accepted,
// the project's folder is here: download the work, upload what's done.
export default async function VendorJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { session, vendor } = await requireVendor();
  const id = jobIdSchema.safeParse((await params).id);
  const job = id.success ? await vendorJobs.vendorJob(session.client_id, id.data) : null;
  if (!job) notFound();
  const { folder } = await searchParams;
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (folderId === undefined) notFound();

  return (
    <VendorFrame vendor={vendor} page="jobs">
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <BackLink href="/vendors/jobs">Jobs</BackLink>
        <header className="space-y-1">
          <p className="text-sm font-medium text-brand-600 dark:text-brand-400">{job.studio.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{job.projectTitle}</h1>
          <p className="text-sm text-muted">{JOB_STATUS_LABELS[job.status]}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <p className="whitespace-pre-line">{job.brief}</p>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted">Due</dt>
              <dd className="font-medium">{job.dueOn ? new Date(`${job.dueOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No date"}</dd>
            </div>
            <div>
              <dt className="text-muted">Price</dt>
              <dd className="font-medium tabular-nums">{money(job.price)}</dd>
            </div>
            <div>
              <dt className="text-muted">You receive</dt>
              <dd className="font-semibold tabular-nums">{money(vendorTake(job.price))}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">Aming keeps {money(jobFee(job.price))} (10%). The studio pays when it approves the delivered work.</p>
          <JobActions id={job.id} status={job.status} wide />
        </section>

        {reachesFolder(job.status) ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Project files</h2>
            <p className="text-sm text-muted">Download what the studio shared, and upload your finished work here.</p>
            <Loading skeleton={<RowsSkeleton />}>
              <JobFiles jobId={job.id} folderId={folderId} />
            </Loading>
          </section>
        ) : null}
      </div>
    </VendorFrame>
  );
}

async function JobFiles({ jobId, folderId }: { jobId: string; folderId: string | null }) {
  const via = { as: "job", id: jobId } as const;
  const { drive, scope, access } = await filesCaller(via);
  const found = await drive.list(scope, folderId, access);
  if (!found) notFound();
  if (folderId && FileService.missingPreviews(found)) after(() => drive.ensurePreviews(scope, folderId));
  return <FileBrowser listing={found} basePath={`/vendors/jobs/${jobId}`} scope={{ locale: scope.locale, timeZone: scope.timeZone }} via={via} topLabel="Project files" />;
}
