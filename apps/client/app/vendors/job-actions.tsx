"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { deliverJob, respondToJob } from "@repo/lib/vendors/actions";
import type { JobStatus } from "@repo/lib/vendors/core";

/** What the vendor can do with a job now: answer a request, or say the work is delivered. */
export function JobActions({ id, status, wide }: { id: string; status: JobStatus; wide?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function act(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  if (status !== "requested" && status !== "accepted") return null;
  const size = wide ? "min-h-11 flex-1" : "";
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {status === "requested" ? (
          <>
            <Button variant="secondary" className={size} disabled={pending} onClick={() => act(() => respondToJob(id, false))}>
              Decline
            </Button>
            <Button className={size} loading={pending} onClick={() => act(() => respondToJob(id, true))}>
              Accept
            </Button>
          </>
        ) : (
          <Button className={size} loading={pending} onClick={() => act(() => deliverJob(id))}>
            Mark as delivered
          </Button>
        )}
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
