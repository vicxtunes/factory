"use client";

import type { ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { OrderCardView } from "@repo/ui/chat/OrderCard";
import type { OrderCardKind, OrderCardState } from "@repo/lib/chat/types";
import type { OrderPaymentState } from "@repo/lib/wallet/types";

export function orderState(p: Partial<OrderCardState>): OrderCardState {
  return {
    orderId: "o1",
    orderNo: "20260022",
    viewerIsClient: true,
    orderHref: "#",
    readyCount: 0,
    collectedCount: 0,
    itemCount: 3,
    ...p,
  };
}

export function payment(amount: number | null, paid: number): OrderPaymentState {
  return {
    orderId: "o1",
    amount,
    paid,
    due: amount == null ? null : Math.max(amount - paid, 0),
    payable: amount != null,
    walletBalance: null,
    paymentBreakdown: [],
  };
}

export function Card(p: {
  card: OrderCardKind;
  body: string;
  state: OrderCardState;
  payment?: OrderPaymentState | null;
  latest?: boolean;
  actions?: string[];
  error?: string;
}) {
  const actions: ReactNode[] = (p.actions ?? []).map((label, i) => (
    <Button key={label} type="button" variant={i === 0 ? "primary" : "secondary"} className="min-h-10 font-semibold">
      {label}
    </Button>
  ));
  return (
    <OrderCardView
      card={p.card}
      body={p.body}
      time="09:41"
      state={p.state}
      payment={p.payment ?? null}
      latest={p.latest ?? true}
      error={p.error ?? null}
      actions={actions}
      orderHref={p.state.orderHref}
    />
  );
}
