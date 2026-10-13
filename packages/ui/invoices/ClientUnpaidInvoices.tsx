"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { Confirmation } from "@repo/ui/Confirmation";
import { PaymentMethods } from "@repo/ui/payments/PaymentMethods";
import type { ClientInvoiceRow } from "@repo/lib/invoices/types";
import { payOrdersFromWallet } from "@repo/lib/wallet/actions";
import { MOBILE_MONEY_MAX } from "@repo/lib/wallet/policy";

import { Panel, useMoney } from "../wallet/shared";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

// What the client owes, first thing on their Wallet page: the total, then
// every invoice with something still to pay (oldest first), each with a tick.
// "Pay" takes the ticked ones — one, several or all — from the wallet as far
// as it goes, by one MTN / Airtel prompt for the lot, or by bank.

export interface UnpaidInvoice extends ClientInvoiceRow {
  /** The due date as shown ("12 Oct 2026"), how far off it is ("3 days late"), and whether it has passed; null without a due date. */
  due: { date: string; away: string | null; late: boolean } | null;
}

export function ClientUnpaidInvoices({ invoices, walletBalance }: { invoices: UnpaidInvoice[]; walletBalance: number }) {
  const router = useRouter();
  const money = useMoney();
  // Unticked rather than ticked: everything starts ticked, and one paid off just drops out.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!invoices.length) return null;

  const sum = (rows: UnpaidInvoice[]) => rows.reduce((total, i) => total + i.balance, 0);
  const owed = sum(invoices);
  const late = invoices.filter((i) => i.due?.late);
  const chosen = invoices.filter((i) => !unticked.has(i.id));
  const total = sum(chosen);
  const fromWallet = Math.min(walletBalance, total);
  const count = (n: number) => `${n} invoice${n === 1 ? "" : "s"}`;
  // One MTN / Airtel prompt can't take more than this: said before they tap Pay, not after.
  const overLimit =
    total > MOBILE_MONEY_MAX ? (
      <p className="rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
        MTN and Airtel take up to {money(MOBILE_MONEY_MAX)} at a time.{" "}
        {chosen.length > 1 ? "Untick some to pay by mobile money, or pay these by bank." : "Pay this one by bank, or in parts from its own page (View)."}
      </p>
    ) : null;

  function toggle(id: string) {
    setUnticked((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function payFromWallet() {
    setError(null);
    start(async () => {
      const res = await payOrdersFromWallet(chosen.map((i) => i.orderId));
      if (!res.ok) return setError(res.error);
      setPaid(res.data.paidNow);
      router.refresh();
    });
  }

  function close() {
    setOpen(false);
    setPaid(null);
    setError(null);
  }

  return (
    <div className="space-y-3">
      <section
        aria-label="What you owe"
        className={`rounded-2xl border p-4 ${
          late.length
            ? "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10"
            : "border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10"
        }`}
      >
        <p className="text-xs uppercase tracking-wide text-muted">You owe</p>
        <p className="text-3xl font-extrabold tabular-nums">{money(owed)}</p>
        <p className="text-sm">
          {count(invoices.length)} to pay
          {late.length ? (
            <>
              {" · "}
              <span className="font-semibold text-error-700 dark:text-error-400">{money(sum(late))} overdue</span>
            </>
          ) : null}
        </p>
        <div className="mt-3">
          <Button
            onClick={() => {
              setUnticked(new Set());
              setOpen(true);
            }}
          >
            Pay all
          </Button>
        </div>
      </section>

      <Panel
        title="Unpaid invoices"
        aside={
          invoices.length > 1 ? (
            <button
              type="button"
              className="text-xs font-medium text-brand-600 underline-offset-2 hover:underline"
              onClick={() => setUnticked(chosen.length === invoices.length ? new Set(invoices.map((i) => i.id)) : new Set())}
            >
              {chosen.length === invoices.length ? "Clear all" : "Select all"}
            </button>
          ) : null
        }
      >
        <ul className="divide-y divide-border">
          {invoices.map((i) => (
            <li key={i.id} className="flex items-start gap-3 py-3">
              <input
                type="checkbox"
                id={`pay-${i.id}`}
                checked={!unticked.has(i.id)}
                onChange={() => toggle(i.id)}
                className="mt-0.5 size-5 shrink-0 accent-brand-500"
              />
              <label htmlFor={`pay-${i.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{i.invoiceNo}</span>
                  <InvoiceStatusBadge status={i.status} />
                </span>
                <span className={`block text-xs ${i.due?.late ? "font-medium text-error-600 dark:text-error-400" : "text-muted"}`}>
                  {i.due ? `Due ${i.due.date}${i.due.away ? ` · ${i.due.away}` : ""}` : "No due date"}
                </span>
                {i.paid > 0 ? (
                  <span className="block text-xs text-muted tabular-nums">
                    {money(i.paid)} paid of {money(i.amount)}
                  </span>
                ) : null}
              </label>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{money(i.balance)}</p>
                <a href={i.href} className="text-xs font-medium text-brand-600 underline">
                  View
                </a>
              </div>
            </li>
          ))}
        </ul>
        <Button className="mt-2 w-full" disabled={!chosen.length} onClick={() => setOpen(true)}>
          {chosen.length ? `Pay ${money(total)} · ${count(chosen.length)}` : "Tick the invoices to pay"}
        </Button>
        {overLimit ? <div className="mt-2">{overLimit}</div> : null}
      </Panel>

      <BottomSheet open={open} onClose={close} title={paid === null ? `Pay ${money(total)}` : undefined}>
        {paid !== null ? (
          <Confirmation
            title="Paid"
            action={
              <Button type="button" className="min-h-12 w-full rounded-full" onClick={close}>
                Done
              </Button>
            }
          >
            {money(paid)} from your wallet.
          </Confirmation>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {count(chosen.length)}: {chosen.map((i) => i.invoiceNo).join(", ")}
            </p>
            {walletBalance > 0 ? (
              <div className="space-y-1">
                <Button onClick={payFromWallet} loading={pending} className="w-full">
                  Pay {money(fromWallet)} from wallet
                </Button>
                <p className="text-xs text-muted">
                  Wallet balance {money(walletBalance)}
                  {fromWallet < total ? `: pays the oldest first; ${money(total - fromWallet)} will still be due.` : "."}
                </p>
                {error ? <p className="text-xs text-error-600">{error}</p> : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{walletBalance > 0 ? "Or pay by" : "Pay by"}</h3>
              {overLimit}
              <PaymentMethods
                // A new set of invoices is a new payment: don't keep a finished prompt on screen.
                key={chosen.map((i) => i.id).join()}
                orderNo={chosen.map((i) => i.orderNo).join(", ")}
                pay={{ orderIds: chosen.map((i) => i.orderId), amount: total }}
              />
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
