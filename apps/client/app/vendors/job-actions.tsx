"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { deliverJob, respondToJob, sendSamples, withdrawFromJob } from "@repo/lib/vendors/actions";
import type { JobStatus } from "@repo/lib/vendors/core";

/**
 * What the vendor can do with a job now: answer a request, send the samples,
 * deliver the work, or give it up (the studio's money goes back).
 */
export function JobActions({ id, status, wide }: { id: string; status: JobStatus; wide?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [pending, start] = useTransition();

  function act(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      setConfirmWithdraw(false);
      router.refresh();
    });
  }

  const size = wide ? "min-h-11 flex-1" : "";
  let buttons: React.ReactNode = null;
  if (status === "requested") {
    buttons = (
      <>
        <Button variant="secondary" className={size} disabled={pending} onClick={() => act(() => respondToJob(id, false))}>
          Decline
        </Button>
        <Button className={size} loading={pending} onClick={() => act(() => respondToJob(id, true))}>
          Accept
        </Button>
      </>
    );
  } else if (status === "samples") {
    buttons = (
      <Button className={size} loading={pending} onClick={() => act(() => sendSamples(id))}>
        Samples are in the folder: send them
      </Button>
    );
  } else if (status === "in_progress") {
    buttons = confirmWithdraw ? (
      <>
        <Button variant="secondary" className={size} disabled={pending} onClick={() => setConfirmWithdraw(false)}>
          Keep the job
        </Button>
        <Button className={size} loading={pending} onClick={() => act(() => withdrawFromJob(id))}>
          Give it up: refund the studio
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" className={size} disabled={pending} onClick={() => setConfirmWithdraw(true)}>
          I can&apos;t do it
        </Button>
        <Button className={size} loading={pending} onClick={() => act(() => deliverJob(id))}>
          Mark as delivered
        </Button>
      </>
    );
  }
  if (!buttons) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
