import type { ReactNode } from "react";

import type { BillTo, Issuer, Line, Totals } from "@repo/lib/billing/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * The layout every billing document shares (quotation, invoice): the
 * issuing business, who it's for, its dates, the lines and totals, notes.
 * Print-friendly. `after` goes under the totals (paid / balance, payments).
 */
export function BillingDocument({
  title,
  number,
  badge,
  issuer,
  billTo,
  dates,
  lines,
  totals,
  notes,
  after,
  scope,
}: {
  title: string;
  number: string;
  badge: ReactNode;
  issuer: Issuer;
  billTo: BillTo;
  /** Label → already formatted value, e.g. ["Due", "31 Oct 2026"]. */
  dates: [string, string][];
  lines: Line[];
  totals: Totals;
  notes: string | null;
  after?: ReactNode;
  scope: Pick<TenantScope, "currency" | "locale">;
}) {
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
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</p>
          <p className="text-lg font-semibold tnum">{number}</p>
          <div className="mt-1">{badge}</div>
        </div>
      </header>

      <section className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted">For</p>
          <p className="font-medium">{billTo.name}</p>
          {billTo.phone ? <p className="tnum">{billTo.phone}</p> : null}
          {billTo.email ? <p>{billTo.email}</p> : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
          {dates.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
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
            {lines.map((l, i) => (
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
        {totals.discount > 0 ? (
          <>
            <dt className="text-muted">Subtotal</dt>
            <dd className="text-right tnum">{money(totals.subtotal)}</dd>
            <dt className="text-muted">Discount</dt>
            <dd className="text-right tnum">−{money(totals.discount)}</dd>
          </>
        ) : null}
        <dt className="font-semibold">Total</dt>
        <dd className="text-right text-base font-semibold tnum">{money(totals.total)}</dd>
      </dl>

      {after}

      {notes ? (
        <section className="text-sm">
          <p className="text-xs font-medium text-muted">Notes</p>
          <p className="whitespace-pre-line">{notes}</p>
        </section>
      ) : null}
    </article>
  );
}
