import { PAYMENT_METHOD_LABELS, type Issuer, type Receipt } from "@repo/lib/billing/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/** A payment's receipt, as its link shows it. Print-friendly. */
export function ReceiptDocument({ receipt: { payment: p, invoice }, issuer, scope }: { receipt: Receipt; issuer: Issuer; scope: Omit<TenantScope, "tenantId"> }) {
  const money = (n: number) => formatAmount(scope, n);
  const contact = [issuer.phone, issuer.email].filter(Boolean).join(" · ");
  const rows: [string, string][] = [
    ["Received from", invoice.billTo.name],
    ["Date", formatDay(scope, p.receivedOn)],
    ["Method", PAYMENT_METHOD_LABELS[p.method]],
    ...(p.reference ? ([["Reference", p.reference]] as [string, string][]) : []),
    ["For invoice", invoice.number],
    ["Invoice total", money(invoice.total)],
    ["Balance now", money(invoice.balance)],
  ];

  return (
    <article className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs sm:p-8 print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{issuer.name}</h1>
          {issuer.address ? <p className="whitespace-pre-line text-sm text-muted">{issuer.address}</p> : null}
          {contact ? <p className="text-sm text-muted">{contact}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Receipt</p>
          <p className="text-lg font-semibold tnum">{p.receiptNo}</p>
        </div>
      </header>
      {p.voidedAt ? (
        <p className="rounded-[var(--radius)] bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-400">
          This payment was voided{p.voidReason ? `: ${p.voidReason}` : "."}
        </p>
      ) : null}
      <div className="text-center">
        <p className="text-xs font-medium text-muted">Amount received</p>
        <p className={`text-3xl font-semibold tnum ${p.voidedAt ? "line-through" : ""}`}>{money(p.amount)}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right tnum">{value}</dd>
          </div>
        ))}
      </dl>
      {p.note ? <p className="text-sm text-muted">{p.note}</p> : null}
      <p className="text-center text-xs text-muted">Thank you.</p>
    </article>
  );
}
