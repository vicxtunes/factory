"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextArea } from "@/components/ui/Field";
import { Collapsible, PriceHero } from "@/components/order/OrderSummary";
import { PaymentMethods } from "@/components/payments/PaymentMethods";
import type { OrderItemWithOrder } from "@/lib/types";

import { respondToQuote } from "./actions";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";

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
  const symbol = useCurrencySymbol();
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
    return <p className="text-sm text-muted">Thanks! We&apos;ll call you shortly to confirm the details of this order before it goes into production.</p>;
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
      <div className="space-y-3">
        <PriceHero
          label="Amount to pay"
          price={formatMoney(order.quoted_price, symbol)}
          note={
            <>
              You approved this price, and we&apos;re sending the order into production. Use{" "}
              <span className="font-semibold text-foreground">{order.order_no}</span> as your payment reference.
            </>
          }
        />
        <HowToPay orderNo={order.order_no} />
      </div>
    );
  }

  // awaiting_client_approval: the price and the decision come first.
  return (
    <div className="space-y-3">
      <PriceHero
        label="Quoted price"
        price={formatMoney(order.quoted_price, symbol)}
        note={<>For order <span className="font-semibold text-foreground">{order.order_no}</span>. Approve it to start production.</>}
      >
        {decliningWithNote ? null : (
          <>
            <Button variant="primary" loading={pending} disabled={pending} onClick={() => submit("approve")}>
              Approve
            </Button>
            <Button variant="secondary" loading={pending} disabled={pending} onClick={() => setDecliningWithNote(true)}>
              Request changes
            </Button>
          </>
        )}
      </PriceHero>

      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}

      {decliningWithNote ? (
        <div className="space-y-3">
          <Field label="What would you like changed? (optional)">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" loading={pending} disabled={pending} onClick={() => submit("changes_requested")}>
              Send request
            </Button>
            <Button variant="secondary" loading={pending} disabled={pending} onClick={() => setDecliningWithNote(false)}>
              Never mind
            </Button>
          </div>
        </div>
      ) : null}

      <HowToPay orderNo={order.order_no} />
    </div>
  );
}

// Instructions only: the price is already shown once, at the top.
function HowToPay({ orderNo }: { orderNo: string }) {
  return (
    <Collapsible title="How to pay" summary="Bank or mobile money">
      <PaymentMethods orderNo={orderNo} />
    </Collapsible>
  );
}
