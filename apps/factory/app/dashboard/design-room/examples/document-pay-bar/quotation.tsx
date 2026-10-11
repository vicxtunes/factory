import { DocumentPayBar } from "@repo/ui/billing/DocumentPayBar";
import { QuotationStatusBadge } from "@repo/ui/billing/StatusBadges";

// Pinned under a quotation on its link (open it full screen, or in the
// Mobile frame): the summary and the one action. On a sample token, so
// "Approve & Pay" opens the sheet but a payment can't start.
export default function DocumentPayBarQuotation() {
  return (
    <div className="relative min-h-[420px]">
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">The quotation, as its PDF</p>
      <DocumentPayBar
        kind="quotation"
        token="sample"
        number="QUO-0012"
        status={<QuotationStatusBadge status="open" />}
        from="Dementa Studios"
        to="Grace Nakato"
        amount={2_500_000}
        amountLabel="Total"
        due={{ label: "Valid until", date: "25 Oct 2026", away: "in 14 days", late: false }}
        payable
        scope={{ currency: "UGX", locale: "en-UG" }}
      />
    </div>
  );
}
