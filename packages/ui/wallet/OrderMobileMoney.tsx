"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getOrderPayment, payOrderWithMobileMoney } from "@repo/lib/wallet/actions";
import type { MobileNetwork } from "@repo/lib/wallet/policy";
import type { OrderPaymentState } from "@repo/lib/wallet/types";

import { MobileMoneyPay } from "./MobileMoneyPay";

// An order's MTN / Airtel payment (inside "How to pay"): the prompt for
// what's still due, once the order can be paid. Works wherever the order id
// is known — the order drawer, the shared invoice, the proforma.

const note = "rounded-xl border border-border px-4 py-3 text-sm text-muted";

export function OrderMobileMoney({ orderId, network }: { orderId: string; network: MobileNetwork }) {
  const [state, setState] = useState<OrderPaymentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrderPayment(orderId).then((res) => {
      if (cancelled) return;
      if (res.ok) setState(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Not signed in (the invoice link works without an account), or not this client's order.
  if (error) {
    return (
      <p className={note}>
        <Link href="/?signin=1" className="font-medium text-brand-600 underline">
          Sign in
        </Link>{" "}
        to pay.
      </p>
    );
  }
  if (!state) return <p className={note}>Loading…</p>;
  if (state.due === 0) return <p className={`${note} font-medium text-success-600 dark:text-success-500`}>✓ Paid in full</p>;
  if (!state.payable || state.due == null) return <p className={note}>Available once we confirm your order.</p>;

  return (
    <MobileMoneyPay
      amount={state.due}
      network={network}
      start={(phone) => payOrderWithMobileMoney(orderId, phone)}
      onDone={() => getOrderPayment(orderId).then((res) => res.ok && setState(res.data))}
    />
  );
}
