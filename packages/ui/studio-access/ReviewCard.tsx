import type { StudioForReview } from "@repo/lib/studio-access/core";

import { ReviewPanel } from "./ReviewPanel";
import { StudioStatusBadge } from "./StatusBadge";

/** What the boss checks before deciding on a studio, and the decision buttons. */
export function ReviewCard({ studio, publicUrl, dateFormat }: { studio: StudioForReview; publicUrl: string | null; dateFormat: Intl.DateTimeFormat }) {
  const sameName = studio.ownerName.toLowerCase() === studio.clientName.toLowerCase();
  const rows: [string, React.ReactNode][] = [
    ["Owner", studio.ownerName || "Not given yet"],
    ["Aming client", <>{studio.clientName}{studio.ownerName && !sameName ? <span className="ml-1 text-xs text-warning-600">(different from the owner&apos;s name)</span> : null}</>],
    ["Business phone", studio.phone ?? "Not given yet"],
    ["Verified email", studio.ownerEmail ?? "Not verified yet"],
    ["Public page", publicUrl ?? "Not chosen yet"],
    ["Submitted", studio.submittedAt ? dateFormat.format(new Date(studio.submittedAt)) : "Not yet"],
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
          {studio.logoUrl ? (
            // A short-lived signed link to the private bucket.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">No logo</span>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{studio.name}</p>
            <StudioStatusBadge status={studio.status} />
          </div>
          {studio.reviewNote ? <p className="whitespace-pre-line text-sm text-muted">Last note: {studio.reviewNote}</p> : null}
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="mt-0.5 text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {studio.status === "onboarding" || studio.status === "changes_requested" ? (
        <p className="text-sm text-muted">The owner is still setting up. You can review once they submit.</p>
      ) : null}
      <ReviewPanel studioId={studio.tenantId} status={studio.status} />
    </section>
  );
}
