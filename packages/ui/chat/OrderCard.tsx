"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { ClientInvoiceLink } from "@repo/ui/invoices/ClientInvoiceLink";
import { OrderPayButton } from "@repo/ui/payments/OrderPayButton";
import { useMoney } from "@repo/ui/wallet/shared";
import { getOrderCardState, sendMessage } from "@repo/lib/chat/actions";
import { uploadChatAttachment } from "@repo/lib/chat/client/upload";
import type { ChatMessage, OrderCardKind, OrderCardState } from "@repo/lib/chat/types";
import { confirmOrderCollected } from "@repo/lib/orders/collect";
import { getOrderPayment } from "@repo/lib/wallet/actions";
import type { OrderPaymentState } from "@repo/lib/wallet/types";

import { formatMessageTime } from "./format";

// Staff only, so clients never download it.
const StaffInvoicePanel = dynamic(() => import("@repo/ui/invoices/StaffInvoicePanel").then((m) => m.StaffInvoicePanel));

/**
 * Aming's cards in an order's chat with its client (packages/lib/chat README,
 * "Order cards"). The thread reads the order once (useOrderCards) and every
 * card shows it, so they all read "Paid" or "Collected" as soon as it's true.
 */

export interface OrderCards {
  state: OrderCardState | null;
  /** Null for designers, who can't see payments. */
  payment: OrderPaymentState | null;
  reload: () => void;
}

/** The order behind a client order thread's cards, read again when `version` changes and on focus. */
export function useOrderCards(conversationId: string, enabled: boolean, version: number): OrderCards {
  const [state, setState] = useState<OrderCardState | null>(null);
  const [payment, setPayment] = useState<OrderPaymentState | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getOrderCardState(conversationId).then(async (res) => {
      if (cancelled || !res.ok) return;
      const pay = await getOrderPayment(res.data.orderId);
      if (cancelled) return;
      setState(res.data);
      setPayment(pay.ok ? pay.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled, version, nonce]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [enabled, reload]);

  return { state, payment, reload };
}

/** One live card: the view plus what its buttons do. */
export function OrderCard({
  message,
  latest,
  order,
  onPosted,
}: {
  message: ChatMessage;
  /** The newest card of its kind in the thread: only that "ready" card offers Confirm received. */
  latest: boolean;
  order: OrderCards;
  /** After the card adds to the thread (a receipt sent, collection confirmed). */
  onPosted: () => void;
}) {
  const { state, payment, reload } = order;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function sendReceipt(file: File | undefined) {
    if (!file || !state) return;
    setBusy(true);
    setError(null);
    try {
      const upload = await uploadChatAttachment(message.conversationId, file);
      if (!upload.ok) return setError(upload.error);
      const res = await sendMessage({
        conversationId: message.conversationId,
        body: `Payment receipt for order ${state.orderNo}`,
        replyToId: null,
        attachments: [upload.attachment],
      });
      if (!res.ok) return setError(res.error);
      onPosted();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmCollected() {
    if (!state) return;
    setBusy(true);
    setError(null);
    const res = await confirmOrderCollected(state.orderId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    reload();
    onPosted();
  }

  const client = !!state?.viewerIsClient;
  const staff = !!state && !client && !!payment;
  const due = payment?.due ?? 0;
  const actions: ReactNode[] = [];

  if (state && message.card === "received") {
    if (client && payment && due > 0) {
      actions.push(
        <OrderPayButton
          key="pay"
          orderId={state.orderId}
          orderNo={state.orderNo}
          onDone={() => {
            reload();
            onPosted();
          }}
        />,
        <Button key="receipt" type="button" variant="secondary" className="min-h-10" loading={busy} disabled={busy} onClick={() => fileRef.current?.click()}>
          Attach receipt
        </Button>,
      );
    }
    if (client) actions.push(<ClientInvoiceLink key="invoice" orderId={state.orderId} />);
    if (staff && due > 0) {
      actions.push(
        <Button key="record" type="button" className="min-h-10 font-semibold" onClick={() => setRecording(true)}>
          Confirm payment
        </Button>,
      );
    }
  }
  if (state && message.card === "payment" && client) actions.push(<ClientInvoiceLink key="invoice" orderId={state.orderId} />);
  if (state && message.card === "ready" && latest && client && state.readyCount > 0) {
    actions.push(
      <Button key="collect" type="button" className="min-h-10 font-semibold" loading={busy} disabled={busy} onClick={confirmCollected}>
        Confirm pickup
      </Button>,
    );
  }

  return (
    <>
      <OrderCardView
        card={message.card ?? "received"}
        body={message.body}
        time={formatMessageTime(message.createdAt)}
        state={state}
        payment={payment}
        latest={latest}
        error={error}
        actions={actions}
        orderHref={state?.orderHref ?? null}
      />
      {message.card === "received" ? (
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => sendReceipt(e.target.files?.[0])} />
      ) : null}
      {staff && state ? (
        <BottomSheet open={recording} onClose={() => setRecording(false)} title={`Payment for order ${state.orderNo}`}>
          <p className="mb-3 text-sm text-muted">Check the client&apos;s receipt in the chat, then record what was paid.</p>
          <StaffInvoicePanel orderId={state.orderId} onChanged={reload} />
        </BottomSheet>
      ) : null}
    </>
  );
}

/**
 * What a card looks like, from plain data (also used by the design room).
 * `state`/`payment` are the order now; `actions` are its buttons.
 */
export function OrderCardView({
  card,
  body,
  time,
  state,
  payment,
  latest,
  error,
  actions,
  orderHref,
}: {
  card: OrderCardKind;
  body: string;
  time: string;
  state: OrderCardState | null;
  payment: OrderPaymentState | null;
  latest: boolean;
  error: string | null;
  actions: ReactNode[];
  orderHref: string | null;
}) {
  const money = useMoney();
  const collected = !!state && state.itemCount > 0 && state.collectedCount === state.itemCount;
  const waiting = state ? state.itemCount - state.collectedCount : 0;
  let headline = body;
  if (state && card === "received") headline = "Order received";
  if (state && card === "ready" && latest) {
    headline = collected
      ? "Order collected"
      : state.readyCount > 0
        ? "Ready for pickup"
        : "Nothing waiting for pickup";
  }

  let status: ReactNode = null;
  if (card === "received" && payment) {
    status =
      payment.due === 0 ? (
        "Paid in full"
      ) : payment.amount == null ? (
        "Price being confirmed"
      ) : (
        <>Due {money(payment.due ?? 0)}</>
      );
  } else if (card === "ready" && state && latest) {
    status = collected
      ? null
      : state.readyCount === 0
        ? "Nothing waiting for pickup"
        : state.readyCount === waiting
          ? waiting === 1
            ? "1 item ready"
            : `${waiting} items ready`
          : `${state.readyCount} of ${waiting} items ready`;
  }

  return (
    <div className="my-2 flex justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="font-medium">{state ? `Order #${state.orderNo}` : "Order update"}</span>
          <span>{time}</span>
        </div>
        <p className="mt-1 text-sm font-semibold">{headline}</p>
        {status ? <p className="mt-1 text-sm text-muted">{status}</p> : null}
        {error ? <p className="mt-1 text-xs text-error-600">{error}</p> : null}
        {actions.length || orderHref ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actions}
            {orderHref ? (
              <Link href={orderHref} className="ml-auto inline-flex min-h-10 items-center text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                Open order
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
