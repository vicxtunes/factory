import { QUOTATION_STATUS_LABELS, type Issuer, type Quotation } from "@repo/lib/billing/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { QuotationStatusBadge } from "./QuotationStatusBadge";

/**
 * The quotation itself, as the customer sees it on the link and the studio
 * sees it on its page. Print-friendly: "Print / Save as PDF" prints this.
 */
export function QuotationDocument({ quotation: q, issuer, scope }: { quotation: Quotation; issuer: Issuer; scope: Omit<TenantScope, "tenantId"> }) {
  const money = (n: number) => formatAmount(scope, n);
  const contact = [issuer.phone, issuer.email].filter(Boolean).join(" · ");

  return (
    <article className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs sm:p-8 print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{issuer.name}</h1>
          {issuer.address ? <p className="whitespace-pre-line text-sm text-muted">{issuer.address}</p> : null}
          {contact ? <p className="text-sm text-muted">{contact}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Quotation</p>
          <p className="text-lg font-semibold tnum">{q.number}</p>
          <div className="mt-1 print:hidden">
            <QuotationStatusBadge status={q.status} />
          </div>
        </div>
      </header>

      <section className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted">For</p>
          <p className="font-medium">{q.billTo.name}</p>
          {q.billTo.phone ? <p className="tnum">{q.billTo.phone}</p> : null}
          {q.billTo.email ? <p>{q.billTo.email}</p> : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
          <dt className="text-muted">Date</dt>
          <dd>{formatDay(scope, q.issuedAt)}</dd>
          {q.validUntil ? (
            <>
              <dt className="text-muted">Valid until</dt>
              <dd>{formatDay(scope, q.validUntil)}</dd>
            </>
          ) : null}
          {q.status !== "open" ? (
            <>
              <dt className="text-muted">Status</dt>
              <dd>
                {QUOTATION_STATUS_LABELS[q.status]}
                {q.respondedAt ? ` on ${formatDay(scope, q.respondedAt)}` : ""}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Item</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 pr-3 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={i} className="border-b border-border align-top last:border-0">
                <td className="py-2 pr-3">
                  <p className="font-medium">{l.description}</p>
                  {l.inclusions.length ? (
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                      {l.inclusions.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-right tnum">{l.quantity}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tnum">
                  {l.netUnitPrice !== l.unitPrice ? <span className="mr-1 text-xs text-muted line-through">{money(l.unitPrice)}</span> : null}
                  {money(l.netUnitPrice)}
                </td>
                <td className="whitespace-nowrap py-2 text-right tnum">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {q.discount > 0 ? (
          <>
            <dt className="text-muted">Subtotal</dt>
            <dd className="text-right tnum">{money(q.subtotal)}</dd>
            <dt className="text-muted">Discount</dt>
            <dd className="text-right tnum">−{money(q.discount)}</dd>
          </>
        ) : null}
        <dt className="font-semibold">Total</dt>
        <dd className="text-right text-base font-semibold tnum">{money(q.total)}</dd>
      </dl>

      {q.notes ? (
        <section className="text-sm">
          <p className="text-xs font-medium text-muted">Notes</p>
          <p className="whitespace-pre-line">{q.notes}</p>
        </section>
      ) : null}
      {q.status === "declined" && q.declineReason ? (
        <section className="text-sm print:hidden">
          <p className="text-xs font-medium text-muted">Reason given</p>
          <p className="whitespace-pre-line">{q.declineReason}</p>
        </section>
      ) : null}
    </article>
  );
}
