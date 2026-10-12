"use client";

import { DocumentPayBar } from "@repo/ui/billing/DocumentPayBar";
import { BankDetails } from "@repo/ui/payments/PaymentMethods";
import { checkInvoiceLinkPayment, payInvoiceLink } from "@repo/lib/invoices/actions";
import type { InvoiceView } from "@repo/lib/invoices/types";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

/**
 * Pinned under the factory's invoice on its link: what's left to pay and
 * "Pay", by MTN / Airtel in full or in part, with the bank details as the
 * other way. No sign-in: holding the link is the permission.
 */
export function InvoiceLinkPayBar({
  token,
  invoice,
  due,
  scope,
}: {
  token: string;
  invoice: InvoiceView;
  due: { label: string; date: string; away: string | null; late: boolean } | null;
  scope: Pick<TenantScope, "currency" | "locale">;
}) {
  const cancelled = invoice.order.cancelled;
  const settled = invoice.balance <= 0 || cancelled;
  return (
    <DocumentPayBar
      kind="invoice"
      token={token}
      number={invoice.invoiceNo}
      status={<InvoiceStatusBadge status={invoice.status} />}
      from={invoice.issuer.companyName}
      to={invoice.client.name}
      amount={settled ? invoice.amount : invoice.balance}
      amountLabel={cancelled ? "Total" : settled ? "Paid" : invoice.paid > 0 ? "Left to pay" : "To pay"}
      due={due}
      payable={!settled}
      pay={{ start: (amount, phone) => payInvoiceLink(token, { amount, phone }), check: checkInvoiceLinkPayment }}
      payNote={
        <details className="rounded-2xl border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Pay by bank instead</summary>
          <div className="mt-3">
            <BankDetails reference={invoice.order.orderNo} />
          </div>
        </details>
      }
      scope={scope}
    />
  );
}
