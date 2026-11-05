"use client";

import { useEffect, useState } from "react";

import { flushQueuedUploads, queuedState, QUEUE_CHANGED_EVENT, QUEUE_PROGRESS_EVENT } from "@repo/lib/offline-queue/enqueue";

import { Button } from "../Button";

// The photos of an order just placed, uploading in the background from the
// device's queue (packages/lib/offline-queue). The order already exists, so
// the person can see it's placed while the photos go up, and is warned before
// leaving the page while any are still on their way.
export function UploadQueueStatus({ uploads }: { uploads: { id: string; name: string }[] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    window.addEventListener(QUEUE_CHANGED_EVENT, rerender);
    window.addEventListener(QUEUE_PROGRESS_EVENT, rerender);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, rerender);
      window.removeEventListener(QUEUE_PROGRESS_EVENT, rerender);
    };
  }, []);

  const rows = uploads.map((u) => ({ ...u, ...queuedState(u.id) }));
  const done = rows.filter((r) => r.state === "done").length;
  const failed = rows.filter((r) => r.state === "failed");
  const busy = rows.some((r) => r.state === "waiting" || r.state === "uploading");

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  if (!rows.length) return null;
  if (done === rows.length) {
    return (
      <p className="rounded-[var(--radius)] border border-success-100 bg-success-50 p-3 text-sm font-medium text-success-700">
        All {rows.length} photo{rows.length === 1 ? "" : "s"} uploaded.
      </p>
    );
  }

  const current = rows.find((r) => r.state === "uploading");
  return (
    <div className={`space-y-2 rounded-[var(--radius)] border p-3 text-sm ${failed.length && !busy ? "border-error-100 bg-error-50 text-error-700" : "border-warning-100 bg-warning-50 text-warning-700"}`}>
      <p className="font-medium">
        Photos: {done} of {rows.length} uploaded
        {current ? ` · "${current.name}" ${Math.round(current.progress * 100)}%` : ""}
      </p>
      {busy ? <p>Keep this page open until they finish. If you leave, they finish next time you open Aming with internet.</p> : null}
      {failed.length ? (
        <div className="space-y-2">
          <p>Not uploaded yet (kept on this device, Aming has been told):</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {failed.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
          {!busy ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => void flushQueuedUploads()}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
