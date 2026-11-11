"use client";

import { retryUploads, useTransfers } from "../transfers/store";
import { Button } from "../Button";

// The photos of an order just placed, uploading in the background (the
// transfers queue, packages/ui/transfers/store.ts). The order already exists,
// so the person can see it's placed and carry on using Aming while the photos
// go up; the transfers panel shows them on every page.
export function UploadQueueStatus({ uploads }: { uploads: { id: string; name: string }[] }) {
  const all = useTransfers((s) => s.uploads);
  const rows = uploads.map((u) => ({ ...u, job: all.find((j) => j.id === u.id) }));
  if (!rows.length) return null;

  const done = rows.filter((r) => r.job?.state === "done").length;
  const failed = rows.filter((r) => r.job?.state === "failed" || r.job?.state === "paused");
  const busy = rows.some((r) => r.job?.state === "waiting" || r.job?.state === "uploading");

  if (done === rows.length) {
    return (
      <p className="rounded-[var(--radius)] border border-success-100 bg-success-50 p-3 text-sm font-medium text-success-700">
        All {rows.length} photo{rows.length === 1 ? "" : "s"} uploaded.
      </p>
    );
  }

  const current = rows.find((r) => r.job?.state === "uploading");
  return (
    <div className={`space-y-2 rounded-[var(--radius)] border p-3 text-sm ${failed.length && !busy ? "border-error-100 bg-error-50 text-error-700" : "border-warning-100 bg-warning-50 text-warning-700"}`}>
      <p className="font-medium">
        Photos: {done} of {rows.length} uploaded
        {current?.job ? ` · "${current.name}" ${Math.round(current.job.progress * 100)}%` : ""}
      </p>
      {busy ? <p>You can keep using Aming while they upload. If you close it, they carry on next time you open Aming with internet.</p> : null}
      {failed.length ? (
        <div className="space-y-2">
          <p>Not uploaded yet:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {failed.map((r) => (
              <li key={r.id}>
                {r.name}
                {r.job?.note ? ` (${r.job.note})` : ""}
              </li>
            ))}
          </ul>
          {!busy && failed.some((r) => r.job?.state === "paused" || r.job?.retryable) ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => retryUploads(false, failed.map((r) => r.id))}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
