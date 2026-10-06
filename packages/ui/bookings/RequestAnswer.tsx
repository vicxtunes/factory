"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { confirmBookingRequest, declineBookingRequest } from "@repo/lib/booking-requests/actions";

/**
 * A client's online request: Confirm (the booking is confirmed, the invoice
 * for its package made and its project started, then the project opens) or
 * Decline (cancelled).
 */
export function RequestAnswer({ bookingId, projectsPath }: { bookingId: string; projectsPath: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
      <div>
        <p className="text-sm font-semibold">Booked online, waiting for your answer</p>
        <p className="text-xs text-muted">Confirming makes the invoice for the package and starts the project.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          loading={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await confirmBookingRequest(bookingId);
              if (!res.ok) return setError(res.error);
              router.push(`${projectsPath}/${res.data.projectId}`);
            })
          }
        >
          Confirm request
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Decline this request?")) return;
            start(async () => {
              setError(null);
              const res = await declineBookingRequest(bookingId);
              if (!res.ok) return setError(res.error);
              router.refresh();
            });
          }}
        >
          Decline
        </Button>
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </section>
  );
}
