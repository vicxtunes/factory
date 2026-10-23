"use client";

import { Card, orderState, payment } from "./shared";

// The same cards for staff: no paying or confirming, Confirm payment for a sent receipt.
export default function OrderCardStaff() {
  const staff = orderState({ viewerIsClient: false });
  return (
    <div className="max-w-md">
      <Card card="received" body="Order 20260022 has been received" state={staff} payment={payment(450_000, 150_000)} actions={["Confirm payment"]} />
      <Card card="ready" body="Order 20260022 is ready for pickup" state={orderState({ viewerIsClient: false, readyCount: 3 })} />
      <Card
        card="ready"
        body="Order 20260019 is ready for pickup"
        state={orderState({ viewerIsClient: false, readyCount: 3 })}
        latest={false}
      />
      <Card
        card="received"
        body="Order 20260022 has been received"
        state={staff}
        payment={payment(450_000, 0)}
        actions={["Confirm payment"]}
        error="Generate the invoice before recording a payment."
      />
    </div>
  );
}
