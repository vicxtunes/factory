"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@repo/ui/Button";
import { ClientInvoiceLink } from "@repo/ui/invoices/ClientInvoiceLink";
import { OrderPayButton } from "@repo/ui/payments/OrderPayButton";
import { useMoney } from "@repo/ui/wallet/shared";
import { getOrderCardState, sendMessage } from "@repo/lib/chat/actions";
import { uploadChatAttachment } from "@repo/lib/chat/client/upload";
import type { ChatMessage, OrderCardState } from "@repo/lib/chat/types";
import { confirmOrderCollected } from "@repo/lib/orders/collect";
import { getOrderPayment } from "@repo/lib/wallet/actions";
import type { OrderPaymentState } from "@repo/lib/wallet/types";

import { formatMessageTime } from "./format";

/**
 * Aming's card for one moment of an order, in the order's chat with its
 * client: "received" (what's paid, with Pay / Attach receipt / invoice) or
 * "ready for pickup" (Confirm received). What it shows is read fresh, so it
 * reads "Paid" or "Collected" once that's done, for everyone in the thread.
 * `version` changes when the thread does, so the card looks again.
 */
export function OrderCard({
  message,
  version,
  onPosted,
}: {
  message: ChatMessage;
  version: number;
  /** After the card itself adds to the thread (a receipt sent, collection confirmed). */
  onPosted: () => void;
}) {
  const money = useMoney();
  const [state, setState] = useState<OrderCardState | null>(null);
  const [payment, setPayment] = useState<OrderPaymentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    let cancelled = false;
    readCard(message).then((read) => {
      if (cancelled || !read) return;
      setState(read.state);
      setPayment(read.payment);
    });
    return () => {
      cancelled = true;
    };
  }, [message]);

  // Again when the thread changes, and when they come back from paying.
  useEffect(() => load(), [load, version]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

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
    load();
    onPosted();
  }

  const client = state?.viewerIsClient ?? false;
  const paidInFull = payment?.due === 0;
  const collected = !!state && state.itemCount > 0 && state.collectedCount === state.itemCount;

  return (
    <div className="my-3 flex justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
          Aming · {formatMessageTime(message.createdAt)}
        </p>
        <p className="mt-1 text-sm font-semibold">{message.body}</p>

        {message.card === "received" ? (
          payment ? (
            paidInFull ? (
              <p className="mt-2 text-sm font-medium text-success-600 dark:text-success-500">✓ Paid in full</p>
            ) : payment.amount == null ? (
              <p className="mt-2 text-sm text-muted">The price is being confirmed.</p>
            ) : (
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <Figure label="Total" value={money(payment.amount)} />
                <Figure label="Paid" value={money(payment.paid)} />
                <Figure label="Due" value={money(payment.due ?? 0)} strong />
              </dl>
            )
          ) : null
        ) : state ? (
          collected ? (
            <p className="mt-2 text-sm font-medium text-success-600 dark:text-success-500">✓ Collected</p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {client ? "Tap Confirm received once you've collected it." : "Waiting for the client to confirm they collected it."}
            </p>
          )
        ) : null}

        {error ? <p className="mt-2 text-xs text-error-600">{error}</p> : null}

        {state ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {client && message.card === "received" && payment && !paidInFull ? (
              <>
                <OrderPayButton orderId={state.orderId} orderNo={state.orderNo} />
                <Button type="button" variant="secondary" className="min-h-10" loading={busy} disabled={busy} onClick={() => fileRef.current?.click()}>
                  Attach receipt
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => sendReceipt(e.target.files?.[0])}
                />
              </>
            ) : null}
            {client && message.card === "received" ? <ClientInvoiceLink orderId={state.orderId} /> : null}
            {client && message.card === "ready" && !collected && state.readyCount > 0 ? (
              <Button type="button" className="min-h-10 font-semibold" loading={busy} disabled={busy} onClick={confirmCollected}>
                Confirm received
              </Button>
            ) : null}
            <Link href={state.orderHref} className="ml-auto text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              Open order ›
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The card's state and, for "received", the order's payment (null for designers, who can't see it). */
async function readCard(message: ChatMessage): Promise<{ state: OrderCardState; payment: OrderPaymentState | null } | null> {
  const res = await getOrderCardState(message.conversationId);
  if (!res.ok) return null;
  if (message.card !== "received") return { state: res.data, payment: null };
  const pay = await getOrderPayment(res.data.orderId);
  return { state: res.data, payment: pay.ok ? pay.data : null };
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 px-2 py-1.5 dark:bg-white/5">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold" : "font-medium"}>{value}</dd>
    </div>
  );
}
