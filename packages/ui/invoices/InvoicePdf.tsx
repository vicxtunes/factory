"use client";

import { useCallback } from "react";

import { PdfPreview } from "@repo/ui/pdf/PdfPreview";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import type { InvoiceView } from "@repo/lib/invoices/types";

import { invoicePdf } from "./pdf";

/**
 * The invoice (or pro forma) exactly as its PDF prints, page by page, with
 * a Download button. `download={false}`: a draft before it's issued, or a
 * viewer that has its own.
 */
export function InvoicePdf({ invoice, download = true }: { invoice: InvoiceView; download?: boolean }) {
  const symbol = useCurrencySymbol();
  const build = useCallback(() => invoicePdf(invoice, symbol), [invoice, symbol]);
  const title = `${invoice.kind === "proforma" ? "Pro forma invoice" : "Invoice"} ${invoice.invoiceNo}`;
  return <PdfPreview build={build} title={title} fileName={download ? `${invoice.invoiceNo}.pdf` : undefined} />;
}
