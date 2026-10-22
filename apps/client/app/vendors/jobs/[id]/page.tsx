import { notFound } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { BackLink } from "@repo/ui/navigation/back";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { filesCaller } from "@repo/lib/files/access";
import { folderIdSchema } from "@repo/lib/files/core";
import { FileService } from "@repo/lib/files/service";
import { autoReleaseAt, isHeld, JOB_STAGE_LABELS, jobFee, jobStage, jobIdSchema, reachesFolder, vendorTake, type JobView } from "@repo/lib/vendors/core";
import { vendorJobs } from "@repo/lib/vendors/server";

import { VendorFrame } from "../../frame";
import { JobActions } from "../../job-actions";
import { requireVendor } from "../../vendor";

export const metadata = { title: "Job" };

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

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
          <h1 className="text-2xl font-semibold tracking-tight">{job.rental ? `${job.rental.quantity} × ${job.rental.item}` : (job.projectTitle ?? "A job")}</h1>
          <p className="text-sm text-muted">{JOB_STAGE_LABELS[jobStage(job.status)]}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <p className="whitespace-pre-line">{job.brief}</p>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {job.rental ? (
              <div>
                <dt className="text-muted">Days</dt>
                <dd className="font-medium">
                  {longDay(job.rental.startsOn)} to {longDay(job.rental.endsOn)}
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-muted">Due</dt>
                <dd className="font-medium">{job.dueOn ? longDay(job.dueOn) : "No date"}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted">Price</dt>
              <dd className="font-medium tabular-nums">{money(job.price)}</dd>
            </div>
            <div>
              <dt className="text-muted">You receive</dt>
              <dd className="font-semibold tabular-nums">{money(vendorTake(job.price))}</dd>
            </div>
          </dl>
          {job.samplesWanted ? (
            <div className="rounded-xl bg-background p-3 text-sm">
              <p className="font-medium">Samples first</p>
              <p className="text-muted">{job.samplesWanted}</p>
            </div>
          ) : null}
          <p className="text-xs text-muted">{moneyLine(job)}</p>
          {job.status === "disputed" && job.disputeReason ? (
            <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
              {job.disputedBy === "studio" ? "The studio" : "You"} raised a dispute: &ldquo;{job.disputeReason}&rdquo;. Aming is looking into it.
            </p>
          ) : null}
          {job.rental && job.status === "in_progress" ? (
            <p className="rounded-xl bg-background p-3 text-sm">
              {job.handedOverAt ? `With the studio until ${longDay(job.rental.endsOn)}: mark it back once it's returned.` : `Hand it over on ${longDay(job.rental.startsOn)}, then say so here.`}
            </p>
          ) : null}
          <JobActions id={job.id} status={job.status} dueOn={job.dueOn} rental={job.rental !== null} handedOver={job.handedOverAt !== null} wide />
        </section>

        {!job.rental && reachesFolder(job.status) ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Job folder</h2>
            <p className="text-sm text-muted">
              {job.status === "samples" ? "Upload your samples here, then send them." : "Download what the studio shared, and upload your work here."}
            </p>
            {job.folderId ? (
              <Loading skeleton={<RowsSkeleton />}>
                <JobFiles jobId={job.id} folderId={folderId} />
              </Loading>
            ) : (
              // Made before jobs had folders, or its folder was deleted: the studio gives it one on the project.
              <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
                {job.studio.name} hasn&apos;t given this job a folder yet. You&apos;ll be told when they do.
              </p>
            )}
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

/** Where the job's money is, in a line. */
function moneyLine(job: JobView): string {
  const fee = `Aming keeps ${money(jobFee(job.price))} (10%).`;
  if (job.status === "paid") return `Paid: ${money(vendorTake(job.price))} went to your wallet.`;
  if (job.status === "refunded") return "The studio's money was refunded.";
  const release = autoReleaseAt(job);
  if (release) {
    const when = new Date(release).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return `${money(job.price)} is held by Aming. It's released to you when the studio approves, or on its own ${when} if they don't answer. ${fee}`;
  }
  if (isHeld(job.status)) return `${money(job.price)} is held by Aming: it's yours once the work is delivered and approved. ${fee}`;
  return `The studio pays ${money(job.price)} in to Aming before the work starts; it's held until the work is approved. ${fee}`;
}
