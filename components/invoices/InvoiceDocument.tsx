"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { STATUS_LABELS } from "@/lib/invoices/policy";
import type { InvoiceStatus, InvoiceView } from "@/lib/invoices/types";
import { METHOD_LABELS } from "@/lib/wallet/policy";

// The invoice itself, as the client sees it on their link and as it prints.
// Staff see the same document (so there are no surprises), with their tools
// around it. Everything after `children` is printed too, so callers pass
// only content that belongs on paper (e.g. how to pay).

const STATUS_TONES: Record<InvoiceStatus, string> = {
  unpaid: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500",
  partially_paid: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  paid: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function date(value: string): string {
  // A plain "YYYY-MM-DD" (due / delivery date) is a calendar day, not an
  // instant: read it as local midnight so it never shows as the day before.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function InvoiceDocument({ invoice, children }: { invoice: InvoiceView; children?: ReactNode }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const showUnits = invoice.lines.some((l) => l.unitPrice != null);

  return (
    <article className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs sm:p-8 print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="h-8 w-auto" />
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-extrabold tracking-tight">Invoice</h1>
          <p className="text-sm font-semibold tabular-nums">{invoice.invoiceNo}</p>
          <div className="mt-1">
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
      </header>

      <section className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Billed to</p>
          <p className="font-semibold">{invoice.client.name}</p>
          {invoice.client.phone ? <p className="text-muted">{invoice.client.phone}</p> : null}
          {invoice.client.email ? <p className="text-muted">{invoice.client.email}</p> : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
          <dt className="text-muted">Issued</dt>
          <dd className="text-right tabular-nums">{date(invoice.issuedAt)}</dd>
          {invoice.dueDate ? (
            <>
              <dt className="text-muted">Due</dt>
              <dd className="text-right tabular-nums">{date(invoice.dueDate)}</dd>
            </>
          ) : null}
          <dt className="text-muted">Order</dt>
          <dd className="text-right tabular-nums">{invoice.order.orderNo}</dd>
          {invoice.order.deliveryDate ? (
            <>
              <dt className="text-muted">Delivery</dt>
              <dd className="text-right tabular-nums">{date(invoice.order.deliveryDate)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {invoice.order.cancelled ? (
        <p className="rounded-xl bg-gray-100 p-3 text-sm dark:bg-white/5">
          This order was cancelled{invoice.order.cancelReason ? ` — ${invoice.order.cancelReason}` : ""}. Anything paid
          has been returned to the client&apos;s wallet.
        </p>
      ) : null}

      <section>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              {showUnits ? <th className="hidden py-2 text-right font-medium sm:table-cell print:table-cell">Unit price</th> : null}
              {showUnits ? <th className="py-2 text-right font-medium">Amount</th> : null}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={i} className="border-b border-border align-top">
                <td className="py-2 pr-2">
                  <p className="font-medium">{line.description}</p>
                  {line.detail ? <p className="text-xs text-muted">{line.detail}</p> : null}
                  <p className="text-xs text-muted print:hidden">Status: {line.progress}</p>
                </td>
                <td className="py-2 text-right tabular-nums">{line.qty}</td>
                {showUnits ? (
                  <td className="hidden py-2 text-right tabular-nums sm:table-cell print:table-cell">
                    {line.unitPrice != null ? money(line.unitPrice) : ""}
                  </td>
                ) : null}
                {showUnits ? <td className="py-2 text-right tabular-nums">{line.lineTotal != null ? money(line.lineTotal) : ""}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Total</dt>
          <dd className="text-right font-semibold tabular-nums">{money(invoice.amount)}</dd>
          <dt className="text-muted">Paid</dt>
          <dd className="text-right tabular-nums">{money(invoice.paid)}</dd>
          <div className="col-span-2 border-t border-border" aria-hidden />
          <dt className="font-semibold">Balance due</dt>
          <dd className="text-right text-lg font-extrabold tabular-nums">{money(invoice.balance)}</dd>
        </dl>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Payment history</h2>
        {invoice.payments.length ? (
          <ul className="divide-y divide-border text-sm">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.kind === "refund" ? "Refund to wallet" : p.method === "wallet" ? "Paid from wallet" : METHOD_LABELS[p.method]}
                  </p>
                  <p className="break-words text-xs text-muted">
                    {[date(p.createdAt), p.reference ? `Ref ${p.reference}` : null, p.note].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className={`shrink-0 font-semibold tabular-nums ${p.kind === "refund" ? "text-muted" : ""}`}>
                  {p.kind === "refund" ? "−" : ""}
                  {money(p.amount)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No payments yet.</p>
        )}
      </section>

      {invoice.notes ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Notes</h2>
          <p className="whitespace-pre-line text-sm text-muted">{invoice.notes}</p>
        </section>
      ) : null}

      {children}
    </article>
  );
}
