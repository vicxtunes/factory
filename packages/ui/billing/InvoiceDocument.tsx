import { PAYMENT_METHOD_LABELS, type Invoice, type Issuer } from "@repo/lib/billing/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BillingDocument } from "./BillingDocument";
import { InvoiceStatusBadge } from "./StatusBadges";

/** The invoice with what's been paid and what's left, as the client sees it on the link and the studio on its page. */
export function InvoiceDocument({ invoice: inv, issuer, scope }: { invoice: Invoice; issuer: Issuer; scope: Omit<TenantScope, "tenantId"> }) {
  const money = (n: number) => formatAmount(scope, n);
  const dates: [string, string][] = [["Date", formatDay(scope, inv.issuedAt)]];
  if (inv.dueDate) dates.push(["Due", formatDay(scope, inv.dueDate)]);
  const received = inv.payments.filter((p) => !p.voidedAt);

  return (
    <BillingDocument
      title="Invoice"
      number={inv.number}
      badge={<InvoiceStatusBadge status={inv.status} />}
      issuer={issuer}
      billTo={inv.billTo}
      dates={dates}
      lines={inv.lines}
      totals={inv}
      notes={inv.notes}
      scope={scope}
      after={
        <>
          {inv.voidedAt ? (
            <p className="rounded-[var(--radius)] bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-400">
              This invoice is void{inv.voidReason ? `: ${inv.voidReason}` : "."}
            </p>
          ) : (
            <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Paid</dt>
              <dd className="text-right tnum">{money(inv.paid)}</dd>
              <dt className="font-semibold">Balance</dt>
              <dd className="text-right font-semibold tnum">{money(inv.balance)}</dd>
            </dl>
          )}
          {received.length ? (
            <section className="text-sm">
              <p className="mb-1 text-xs font-medium text-muted">Payments received</p>
              <ul className="divide-y divide-border">
                {received.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-1">
                    <span>
                      {formatDay(scope, p.receivedOn)} · {PAYMENT_METHOD_LABELS[p.method]}
                      <span className="text-muted"> · {p.receiptNo}</span>
                    </span>
                    <span className="tnum">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      }
    />
  );
}
