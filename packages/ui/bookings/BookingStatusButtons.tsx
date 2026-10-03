"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { setBookingStatus } from "@repo/lib/bookings/actions";
import { nextStatuses, type BookingStatus } from "@repo/lib/bookings/core";

const ACTIONS: Record<BookingStatus, { label: string; variant: "primary" | "secondary" | "danger" }> = {
  confirmed: { label: "Confirm", variant: "primary" },
  completed: { label: "Mark completed", variant: "primary" },
  tentative: { label: "Back to tentative", variant: "secondary" },
  cancelled: { label: "Cancel booking", variant: "danger" },
};

/** The moves this booking's status allows: confirm, complete, cancel, reopen. */
export function BookingStatusButtons({ bookingId, status }: { bookingId: string; status: BookingStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const moves = nextStatuses(status);
  if (moves.length === 0) return null;

  function move(to: BookingStatus) {
    if (to === "cancelled" && !window.confirm("Cancel this booking?")) return;
    setError(null);
    start(async () => {
      const res = await setBookingStatus(bookingId, to);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {moves.map((to) => (
          <Button key={to} type="button" variant={ACTIONS[to].variant} onClick={() => move(to)} disabled={pending}>
            {to === "tentative" && status === "cancelled" ? "Reopen" : ACTIONS[to].label}
          </Button>
        ))}
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
