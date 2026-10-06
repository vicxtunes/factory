"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea } from "@repo/ui/Field";
import type { ReviewDecision, StudioStatus } from "@repo/lib/studio-access/core";
import { reviewStudio } from "@repo/lib/studio-access/actions";

const ASK: Record<Exclude<ReviewDecision, "approve">, { label: string; hint: string; button: string }> = {
  send_back: { label: "What should they change?", hint: "The studio sees this and can submit again.", button: "Send back" },
  suspend: { label: "Why is it suspended?", hint: "The studio sees this. Its page, workspace and client sign-in stop.", button: "Suspend" },
};

/**
 * The boss's decision on a studio: approve, send back with a reason, or
 * suspend with a reason. Approving works at any stage, without waiting for
 * the owner to submit, once it's set up (the server says what's missing).
 */
export function ReviewPanel({ studioId, status }: { studioId: string; status: StudioStatus }) {
  const router = useRouter();
  const [asking, setAsking] = useState<Exclude<ReviewDecision, "approve"> | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decide = (decision: ReviewDecision) =>
    start(async () => {
      setError(null);
      const res = await reviewStudio({ studioId, decision, note });
      if (!res.ok) return setError(res.error);
      setAsking(null);
      setNote("");
      router.refresh();
    });

  const canApprove = status !== "active";
  const settingUp = status === "onboarding" || status === "changes_requested";
  const canSendBack = status === "in_review";
  const canSuspend = status !== "suspended";

  return (
    <div className="space-y-3">
      {asking ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            decide(asking);
          }}
        >
          <Field label={ASK[asking].label} hint={ASK[asking].hint}>
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required autoFocus />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant={asking === "suspend" ? "danger" : "primary"} loading={pending}>
              {ASK[asking].button}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canApprove ? (
            <Button
              loading={pending}
              onClick={() => {
                if (settingUp && !window.confirm("They haven't submitted their studio for review yet. Open it now?")) return;
                decide("approve");
              }}
            >
              {status === "suspended" ? "Reinstate" : settingUp ? "Approve now" : "Approve"}
            </Button>
          ) : null}
          {canSendBack ? (
            <Button variant="secondary" onClick={() => setAsking("send_back")}>
              Send back
            </Button>
          ) : null}
          {canSuspend ? (
            <Button variant="danger" onClick={() => setAsking("suspend")}>
              Suspend
            </Button>
          ) : null}
        </div>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
