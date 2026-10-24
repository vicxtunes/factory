"use client";

import { Card, orderState, payment } from "./shared";

// What the client sees in an order's chat, from received to collected.
export default function OrderCardClient() {
  const client = orderState({ viewerIsClient: true });
  return (
    <div className="max-w-md">
      <Card
        card="received"
        body="Order 20260022 has been received"
        state={client}
        payment={payment(450_000, 0)}
        actions={["Pay", "Attach receipt", "View invoice"]}
      />
      <Card card="received" body="Order 20260023 has been received" state={client} payment={payment(null, 0)} actions={["View pro forma invoice"]} />
      <Card card="payment" body="Payment received: UGX 450,000" state={client} actions={["View invoice"]} />
      <Card card="received" body="Order 20260022 has been received" state={client} payment={payment(450_000, 450_000)} actions={["View invoice"]} />
      <Card
        card="ready"
        body="Part of order 20260022 is ready for pickup"
        state={orderState({ readyCount: 2, itemCount: 3 })}
        actions={["Confirm received"]}
      />
      <Card card="ready" body="Order 20260022 is ready for pickup" state={orderState({ readyCount: 3 })} actions={["Confirm received"]} />
      <Card card="collected" body="Grace Namuli confirmed they received 3 items" state={client} />
      <Card card="ready" body="Order 20260022 is ready for pickup" state={orderState({ collectedCount: 3 })} />
    </div>
  );
}
