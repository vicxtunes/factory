"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { paymentMethodLabel } from "@repo/lib/wallet/policy";
import { getOrderPayment, payOrderFromWallet, refundOrderToWallet } from "@repo/lib/wallet/actions";
import type { OrderPaymentState } from "@repo/lib/wallet/types";

import { parseAmount, useMoney } from "./shared";
import { clientPath } from "@repo/lib/client-portal/paths";

// An order's payment state, dropped into an order screen by order id.
// Loads its own data, so the order screens don't need to know about wallets.
//
//   <ClientOrderPayment>  the client: paid / still to pay, "Pay from wallet"
//                         (MTN / Airtel is in the order's "How to pay")
//   <StaffOrderPayment>   staff: paid / still to pay, "Refund to wallet"

function useOrderPayment(orderId: string) {
  const [state, setState] = useState<OrderPaymentState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrderPayment(orderId).then((res) => {
      if (cancelled) return;
      if (res.ok) setState(res.data);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return { state, setState, loadError };
}

function PaidSummary({ state }: { state: OrderPaymentState }) {
  const money = useMoney();
  if (state.paid <= 0) return null;
  if (state.due === 0) {
    return (
      <p className="text-sm font-semibold text-success-600 dark:text-success-500">
        ✓ Paid in full · {money(state.paid)}
      </p>
    );
  }
  return (
    <p className="text-sm">
      Paid <span className="font-semibold tabular-nums">{money(state.paid)}</span> · Still to pay{" "}
      <span className="font-semibold tabular-nums">{money(state.due ?? 0)}</span>
    </p>
  );
}

export function ClientOrderPayment({ orderId }: { orderId: string }) {
  const router = useRouter();
  const money = useMoney();
  const { state, setState } = useOrderPayment(orderId);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Nothing to show until the order can take a payment (priced, confirmed,
  // not cancelled) — unless money was already paid, which is always shown.
  if (!state || (!state.payable && state.paid <= 0)) return null;

  const balance = state.walletBalance ?? 0;
  const due = state.due ?? 0;
  const take = Math.min(balance, due);

  function pay() {
    const message =
      take < due
        ? `Pay ${money(take)} from your wallet? ${money(due - take)} will still be due on this order.`
        : `Pay ${money(take)} from your wallet?`;
    if (!window.confirm(message)) return;
    setError(null);
    start(async () => {
      const res = await payOrderFromWallet(orderId);
      if (!res.ok) return setError(res.error);
      setState(res.data);
      router.refresh();
    });
  }

  return (
    <section aria-label="Payment" className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <PaidSummary state={state} />
      {state.payable && due > 0 ? (
        balance > 0 ? (
          <>
            <Button onClick={pay} loading={pending} className="w-full">
              Pay {money(take)} from wallet
            </Button>
            <p className="text-xs text-muted">
              Wallet balance {money(balance)}
              {take < due ? ` — covers part of this order; ${money(due - take)} will still be due.` : "."}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            <Link href={clientPath("/payment")} className="font-medium text-brand-600 underline">
              Add funds to your wallet
            </Link>{" "}
            to pay {state.paid > 0 ? "the rest of this order" : "for this order"} from your balance.
          </p>
        )
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </section>
  );
}

export function StaffOrderPayment({ orderId }: { orderId: string }) {
  const money = useMoney();
  const { state, setState } = useOrderPayment(orderId);
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!state || state.paid <= 0) return null;

  const breakdown = state.paymentBreakdown ?? [];

  function refund() {
    const value = amount.trim() ? parseAmount(amount) : null;
    if (value != null && (!Number.isInteger(value) || value <= 0 || value > state!.paid)) {
      return setError(`Enter an amount up to ${money(state!.paid)}, or leave it empty to refund everything.`);
    }
    if (!reason.trim()) return setError("Give a reason — the client sees it in their wallet history.");
    setError(null);
    start(async () => {
      const res = await refundOrderToWallet(orderId, value, reason);
      if (!res.ok) return setError(res.error);
      const fresh = await getOrderPayment(orderId);
      if (fresh.ok) setState(fresh.data);
      setRefunding(false);
      setAmount("");
      setReason("");
    });
  }

  return (
    <section aria-label="Payment" className="space-y-2 rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {breakdown.length
              ? breakdown.map((entry) => `${paymentMethodLabel(entry.method, "Payment received")} ${money(entry.amount)}`).join(" · ")
              : "Payment received"}
          </p>
          <PaidSummary state={state} />
        </div>
        {!refunding ? (
          <Button variant="secondary" className="min-h-8 text-xs" onClick={() => setRefunding(true)}>
            Refund to wallet
          </Button>
        ) : null}
      </div>
      {refunding ? (
        <div className="space-y-2">
          <Field label="Amount" hint={`Leave empty to refund everything paid (${money(state.paid)}).`}>
            <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Reason">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" className="min-h-9 text-xs" loading={pending} onClick={refund}>
              Refund
            </Button>
            <button type="button" className="text-xs text-muted" onClick={() => setRefunding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </section>
  );
}
