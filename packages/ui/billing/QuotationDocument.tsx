import { QUOTATION_STATUS_LABELS, type Issuer, type Quotation } from "@repo/lib/billing/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BillingDocument } from "./BillingDocument";
import { QuotationStatusBadge } from "./StatusBadges";

/** The quotation, as the client sees it on the link and the studio on its page. */
export function QuotationDocument({ quotation: q, issuer, scope }: { quotation: Quotation; issuer: Issuer; scope: Omit<TenantScope, "tenantId"> }) {
  const dates: [string, string][] = [["Date", formatDay(scope, q.issuedAt)]];
  if (q.validUntil) dates.push(["Valid until", formatDay(scope, q.validUntil)]);
  if (q.status !== "open") dates.push(["Status", `${QUOTATION_STATUS_LABELS[q.status]}${q.respondedAt ? ` on ${formatDay(scope, q.respondedAt)}` : ""}`]);

  return (
    <BillingDocument
      title="Quotation"
      number={q.number}
      badge={<QuotationStatusBadge status={q.status} />}
      issuer={issuer}
      billTo={q.billTo}
      dates={dates}
      lines={q.lines}
      totals={q}
      notes={q.notes}
      scope={scope}
      after={
        q.status === "declined" && q.declineReason ? (
          <section className="text-sm print:hidden">
            <p className="text-xs font-medium text-muted">Reason given</p>
            <p className="whitespace-pre-line">{q.declineReason}</p>
          </section>
        ) : null
      }
    />
  );
}
