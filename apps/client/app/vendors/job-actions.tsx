"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { deliverJob, respondToJob, sendSamples, withdrawFromJob } from "@repo/lib/vendors/actions";
import type { JobStatus } from "@repo/lib/vendors/core";

/** "Friday 7 November". */
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * What the vendor can do with a job now: answer a request (accepting commits
 * to deliver by its due day, or a day they set when it has none), send the
 * samples, deliver the work, or give it up (the studio's money goes back).
 */
export function JobActions({ id, status, dueOn, wide }: { id: string; status: JobStatus; dueOn: string | null; wide?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [promised, setPromised] = useState(false);
  const [deliverBy, setDeliverBy] = useState(dueOn ?? "");
  const [pending, start] = useTransition();

  function act(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      setConfirmWithdraw(false);
      setAccepting(false);
      router.refresh();
    });
  }

  const size = wide ? "min-h-11 flex-1" : "";
  let buttons: React.ReactNode = null;
  if (status === "requested") {
    buttons = (
      <>
        <Button variant="secondary" className={size} disabled={pending} onClick={() => act(() => respondToJob(id, { accept: false }))}>
          Decline
        </Button>
        <Button
          className={size}
          disabled={pending}
          onClick={() => {
            setError(null);
            setPromised(false);
            setAccepting(true);
          }}
        >
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
  // Today in Kampala: the earliest day a vendor can promise.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {error && !accepting ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <FormSheet open={accepting} onClose={() => setAccepting(false)} title="Accept this job">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => respondToJob(id, { accept: true, deliverBy }));
          }}
        >
          {dueOn ? (
            <>
              <p className="text-sm text-muted">The studio needs this delivered by:</p>
              <p className="text-lg font-semibold">{longDay(dueOn)}</p>
              <label className="flex items-start gap-3 rounded-xl border border-border p-3">
                <input type="checkbox" checked={promised} onChange={(e) => setPromised(e.target.checked)} className="mt-0.5 size-4 accent-brand-500" />
                <span className="text-sm">
                  I&apos;ll deliver the work by <strong>{longDay(dueOn)}</strong>.
                </span>
              </label>
            </>
          ) : (
            <Field label="I'll deliver by" hint="The studio gave no date: the day you choose becomes the job's deadline.">
              <TextInput type="date" min={today} value={deliverBy} onChange={(e) => setDeliverBy(e.target.value)} required />
            </Field>
          )}
          <p className="text-xs text-muted">Studios count on this date. If you can&apos;t make it, tell them early, or give the job up so they&apos;re refunded.</p>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="min-h-12 w-full" loading={pending} disabled={dueOn ? !promised : !deliverBy}>
            Accept and commit
          </Button>
        </form>
      </FormSheet>
    </div>
  );
}
