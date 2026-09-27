"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { InfoTip } from "@/components/ui/InfoTip";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { STATUS_LABELS } from "@/lib/invoices/policy";
import type { InvoiceStatus, InvoiceView } from "@/lib/invoices/types";
import { PAYMENT_METHODS } from "@/lib/payments/details";
import { METHOD_LABELS } from "@/lib/wallet/policy";

import { formatInvoiceDate } from "./format";
import { documentLabels } from "./labels";

// The invoice itself, as the client sees it on their link and as it prints —
// laid out like the business's existing invoices: company header, Bill To and
// invoice details, a priced line table with the grand total, then what's been
// paid, terms, payment instructions and the signature line. The PDF
// (./pdf.ts) follows the same layout. Things only useful on screen (each
// item's progress) are hidden when printing.

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

/**
 * A line's product name and its catalog description. Wide screens and print
 * show the description under the name; phones have no room for it, so they
 * get an ⓘ that shows it as a tooltip.
 */
function LineTitle({ title, description }: { title: string; description: string | null }) {
  return (
    <>
      <p className="font-bold">
        {title}
        {description ? (
          <InfoTip label={`About ${title}`} className="ml-1 sm:hidden print:hidden">
            {description}
          </InfoTip>
        ) : null}
      </p>
      {description ? <p className="hidden text-xs text-muted sm:block print:block">{description}</p> : null}
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-right font-semibold">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </>
  );
}

export function InvoiceDocument({ invoice, children }: { invoice: InvoiceView; children?: ReactNode }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const { issuer } = invoice;
  const contact = [issuer.phone, issuer.email].filter(Boolean).join(" · ");
  const labels = documentLabels(invoice);
  const showPaid = invoice.kind === "invoice" || invoice.paid > 0;

  return (
    <article className="space-y-6 rounded-2xl border border-border bg-surface p-5 text-sm shadow-theme-xs sm:p-8 print:border-0 print:p-0 print:shadow-none">
      <header className="grid grid-cols-[auto_1fr] items-center gap-4 border-b border-border pb-5 sm:grid-cols-[auto_1fr_auto]">
        <Image src="/icon-192.png" alt={issuer.companyName} width={64} height={64} className="h-14 w-14 rounded-xl sm:h-16 sm:w-16" />
        <div className="min-w-0 sm:text-center">
          <p className="text-lg font-bold">{issuer.companyName}</p>
          {issuer.address ? <p className="text-xs text-muted">{issuer.address}</p> : null}
          {contact ? <p className="break-words text-xs text-muted">{contact}</p> : null}
        </div>
        <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
          <h1 className="text-xl font-extrabold tracking-wide">{labels.title}</h1>
          <div className="sm:mt-1">
            {invoice.kind === "proforma" ? (
              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/5 dark:text-gray-400">
                Estimate
              </span>
            ) : (
              <InvoiceStatusBadge status={invoice.status} />
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="font-bold">BILL TO</p>
          <p>{invoice.client.name}</p>
          {invoice.client.phone ? <p className="text-muted">{invoice.client.phone}</p> : null}
          {invoice.client.email ? <p className="text-muted">{invoice.client.email}</p> : null}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 justify-self-start sm:justify-self-end">
          <MetaRow label={labels.number} value={invoice.invoiceNo} />
          <MetaRow label={labels.date} value={formatInvoiceDate(invoice.issuedAt)} />
          {invoice.dueDate ? <MetaRow label="Due Date:" value={formatInvoiceDate(invoice.dueDate)} /> : null}
          <MetaRow label="Order#" value={invoice.order.orderNo} />
        </dl>
      </section>

      {invoice.order.cancelled ? (
        <p className="rounded-xl bg-gray-100 p-3 dark:bg-white/5">
          This order was cancelled{invoice.order.cancelReason ? ` — ${invoice.order.cancelReason}` : ""}. Anything paid
          has been returned to the client&apos;s wallet.
        </p>
      ) : null}

      <section>
        <table className="w-full">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-100 text-left text-xs font-bold uppercase dark:border-white/10 dark:bg-white/5">
              <th className="px-2 py-2 w-8">#</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="hidden px-2 py-2 text-right sm:table-cell print:table-cell">Price</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={line.itemId} className="border-b border-border align-top">
                <td className="px-2 py-3">{i + 1}</td>
                <td className="px-2 py-3">
                  <LineTitle title={line.title} description={line.description} />
                  {line.detail ? <p className="text-xs text-muted">{line.detail}</p> : null}
                  {/* Price moves under the name on phones, where there's no room for its own column. */}
                  {line.unitPrice != null ? (
                    <p className="text-xs text-muted sm:hidden print:hidden">@ {money(line.unitPrice)}</p>
                  ) : labels.unpriced ? (
                    <p className="text-xs font-medium text-warning-700 sm:hidden print:hidden dark:text-warning-500">{labels.unpriced}</p>
                  ) : null}
                  <p className="text-[11px] text-muted print:hidden">Status: {line.progress}</p>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">
                  {line.qty}
                  {line.unit ? <span className="text-muted"> {line.unit}</span> : null}
                </td>
                <td className="hidden whitespace-nowrap px-2 py-3 text-right tabular-nums sm:table-cell print:table-cell">
                  {line.unitPrice != null ? money(line.unitPrice) : <span className="text-xs text-muted">{labels.unpriced}</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">
                  {line.lineTotal != null ? money(line.lineTotal) : <span className="text-xs text-muted">{labels.unpriced}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto]">
          <dt className="border-b border-gray-300 bg-gray-100 px-3 py-2 font-bold dark:border-white/10 dark:bg-white/5">{labels.total}</dt>
          <dd className="border-b border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums dark:border-white/10 dark:bg-white/5">
            {money(invoice.amount)}
          </dd>
          {labels.unpriced ? (
            <dd className="col-span-2 px-3 pt-1 text-right text-xs text-muted">+ photo books, to be confirmed</dd>
          ) : null}
          {showPaid ? (
            <>
              <dt className="px-3 pt-2 text-muted">Paid</dt>
              <dd className="px-3 pt-2 text-right tabular-nums">{money(invoice.paid)}</dd>
              <dt className="px-3 py-1 font-semibold">Balance due</dt>
              <dd className="px-3 py-1 text-right text-lg font-extrabold tabular-nums">{money(invoice.balance)}</dd>
            </>
          ) : null}
        </dl>
        {labels.note ? <p className="mt-3 rounded-xl bg-gray-100 p-3 text-xs text-muted dark:bg-white/5">{labels.note}</p> : null}
      </section>

      {invoice.payments.length ? (
        <section>
          <h2 className="mb-1 font-bold">Payment history</h2>
          <ul className="divide-y divide-border">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.kind === "refund" ? "Refund to wallet" : p.method === "wallet" ? "Paid from wallet" : METHOD_LABELS[p.method]}
                  </p>
                  <p className="break-words text-xs text-muted">
                    {[formatInvoiceDate(p.createdAt), p.reference ? `Ref ${p.reference}` : null, p.note].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className={`shrink-0 font-semibold tabular-nums ${p.kind === "refund" ? "text-muted" : ""}`}>
                  {p.kind === "refund" ? "−" : ""}
                  {money(p.amount)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {invoice.notes ? (
        <section>
          <h2 className="mb-1 font-bold">Notes</h2>
          <p className="whitespace-pre-line text-muted">{invoice.notes}</p>
        </section>
      ) : null}

      <section className="grid gap-6 sm:grid-cols-[3fr_2fr] print:grid-cols-[3fr_2fr] print:break-inside-avoid">
        {issuer.terms.length ? (
          <div>
            <h2 className="font-bold">Terms &amp; Conditions:</h2>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {issuer.terms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div />
        )}
        <div>
          <h2 className="font-bold">Payment Instructions</h2>
          {PAYMENT_METHODS.map((m) => (
            <div key={m.id} className="mt-1">
              <p className="font-medium">{m.title}</p>
              {m.fields.map((f) => (
                <p key={f.label} className="text-muted">
                  {f.label}: <span className="text-foreground tabular-nums">{f.value}</span>
                </p>
              ))}
            </div>
          ))}
          <p className="mt-1 text-xs text-muted">Reference: {invoice.order.orderNo}</p>
        </div>
      </section>

      {issuer.signatureCompany ? (
        <section className="flex justify-end print:break-inside-avoid">
          <div className="text-right">
            <p className="text-base font-bold">For, {issuer.signatureCompany}</p>
            <div className="mt-14 border-t border-gray-400 pt-1 text-xs tracking-wide">AUTHORIZED SIGNATURE</div>
          </div>
        </section>
      ) : null}

      {children}
    </article>
  );
}
