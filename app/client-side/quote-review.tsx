"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextArea } from "@/components/ui/Field";
import type { OrderItemWithOrder } from "@/lib/types";

import { respondToQuote } from "./actions";

// The client's side of the receptionist quote/approval loop (see
// app/dashboard/order-approval-queue.tsx for the receptionist's side).
// Opened from ClientOrderCard's drawer in place of the usual item detail
// whenever the order hasn't been released to production yet — see
// orders-board.tsx. Realtime already refetches the board on any `orders`
// update (orders-board.tsx's channel subscription), so this only needs to
// close the drawer on success, not force a refresh itself.
export function ClientQuoteReview({
  orderId,
  order,
  onDone,
}: {
  orderId: string;
  order: OrderItemWithOrder["order"];
  onDone: () => void;
}) {
  const [decliningWithNote, setDecliningWithNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(decision: "approve" | "changes_requested") {
    setError(null);
    start(async () => {
      const res = await respondToQuote(orderId, decision, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  if (order.approval_status === "pending_review") {
    return <p className="text-sm text-muted">We&apos;re reviewing this order — a quote is on its way.</p>;
  }

  if (order.approval_status === "changes_requested") {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted">
          You asked for changes{order.client_decision_note ? `: "${order.client_decision_note}"` : ""}. We&apos;re
          working on a new quote.
        </p>
      </div>
    );
  }

  if (order.approval_status === "approved") {
    return (
      <p className="text-sm text-muted">
        You approved this order at{" "}
        <span className="font-semibold text-foreground">${order.quoted_price?.toFixed(2)}</span> — we&apos;re
        sending it into production.
      </p>
    );
  }

  // awaiting_client_approval
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Quoted price</p>
        <p className="text-3xl font-extrabold tabular-nums">${order.quoted_price?.toFixed(2)}</p>
      </div>

      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}

      {decliningWithNote ? (
        <div className="space-y-3">
          <Field label="What would you like changed? (optional)">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" disabled={pending} onClick={() => submit("changes_requested")}>
              Send request
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setDecliningWithNote(false)}>
              Never mind
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="primary" disabled={pending} onClick={() => submit("approve")}>
            Approve
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setDecliningWithNote(true)}>
            Request changes
          </Button>
        </div>
      )}
    </div>
  );
}
