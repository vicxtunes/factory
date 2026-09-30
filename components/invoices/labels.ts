// Wording shared by the web invoice (./InvoiceDocument.tsx) and the PDF
// (./pdf.ts), which differs between a real invoice and a pro forma.

import type { InvoiceView } from "@/lib/invoices/types";

/** The wording that differs between a real invoice and a pro forma (estimate). */
export function documentLabels(invoice: Pick<InvoiceView, "kind" | "complete">) {
  const pro = invoice.kind === "proforma";
  return {
    title: pro ? "PRO FORMA INVOICE" : "INVOICE",
    number: pro ? "Pro forma#" : "Invoice#",
    date: pro ? "Date:" : "Invoice Date:",
    total: pro ? "ESTIMATED TOTAL" : "GRAND TOTAL",
    /** Shown in the price column for a line that isn't priced yet. */
    unpriced: pro && !invoice.complete ? "To be confirmed" : "",
    note: !pro
      ? null
      : invoice.complete
        ? "This is a pro forma invoice: an estimate at our current prices. It becomes final once we confirm your order."
        : "This is a pro forma invoice: an estimate at our current prices. Photo books are priced after we call you to confirm the details, so the total will change.",
  };
}
