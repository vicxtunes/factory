"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { recordPayment, voidPayment } from "@repo/lib/billing/actions";
import { PAYMENT_METHOD_LABELS, type Invoice, type PaymentMethod } from "@repo/lib/billing/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * The studio records money received against an invoice (never more than
 * what's left) and sees every payment with its receipt link. A mistaken
 * payment is voided with a reason, never deleted.
 */
export function PaymentsPanel({
  invoice,
  receiptUrls,
  today,
  scope,
}: {
  invoice: Invoice;
  /** Payment id → its receipt link. */
  receiptUrls: Record<string, string>;
  /** The studio's today, "yyyy-mm-dd": the default payment date. */
  today: string;
  scope: Omit<TenantScope, "tenantId">;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(invoice.balance));
  const [method, setMethod] = useState<PaymentMethod>("mobile_money");
  const [receivedOn, setReceivedOn] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const money = (n: number) => formatAmount(scope, n);
  const open = !invoice.voidedAt && invoice.balance > 0;

  function record(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = amount.trim() === "" ? Number.NaN : Number(amount.replace(/[,\s]/g, ""));
    start(async () => {
      const res = await recordPayment(invoice.id, { amount: value, method, receivedOn, reference, note });
      if (!res.ok) return setError(res.error);
      setReference("");
      setNote("");
      router.refresh();
    });
  }

  function cancel(paymentId: string) {
    const reason = window.prompt("Why void this payment? (kept with the record)");
    if (!reason) return;
    setError(null);
    start(async () => {
      const res = await voidPayment(paymentId, reason);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs print:hidden">
      <p className="text-sm font-semibold">Payments</p>
      {open ? (
        <form onSubmit={record} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Amount (${scope.currency})`} hint={`${money(invoice.balance)} left`}>
              <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" required />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Received on">
              <TextInput type="date" value={receivedOn} max={today} onChange={(e) => setReceivedOn(e.target.value)} required />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reference" hint="Transaction ID, cheque number…">
              <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
            </Field>
            <Field label="Note">
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>
          </div>
          <Button type="submit" loading={pending}>
            Record payment
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">{invoice.voidedAt ? "This invoice is void." : "Paid in full."}</p>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {invoice.payments.length ? (
        <ul className="divide-y divide-border text-sm">
          {invoice.payments.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-start justify-between gap-2 py-2 ${p.voidedAt ? "text-muted" : ""}`}>
              <div>
                <p className={p.voidedAt ? "line-through" : "font-medium"}>
                  {money(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]}
                </p>
                <p className="text-xs text-muted">
                  {formatDay(scope, p.receivedOn)} · {p.receiptNo}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.voidedAt ? ` · void: ${p.voidReason}` : ""}
                </p>
              </div>
              {p.voidedAt ? null : (
                <div className="flex gap-3 text-xs">
                  <a href={receiptUrls[p.id]} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
                    Receipt
                  </a>
                  <button type="button" onClick={() => cancel(p.id)} className="text-error-600 hover:underline dark:text-error-400">
                    Void
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
