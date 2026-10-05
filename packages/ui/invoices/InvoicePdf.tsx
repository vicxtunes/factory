"use client";

import { useCallback } from "react";

import { PdfPreview } from "@repo/ui/pdf/PdfPreview";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import type { InvoiceView } from "@repo/lib/invoices/types";

import { invoicePdf } from "./pdf";

/**
 * The invoice (or pro forma) exactly as its PDF prints, page by page, with
 * a Download button. `draft`: a preview before it's issued, so no download.
 */
export function InvoicePdf({ invoice, draft = false }: { invoice: InvoiceView; draft?: boolean }) {
  const symbol = useCurrencySymbol();
  const build = useCallback(() => invoicePdf(invoice, symbol), [invoice, symbol]);
  const title = `${invoice.kind === "proforma" ? "Pro forma invoice" : "Invoice"} ${invoice.invoiceNo}`;
  return <PdfPreview build={build} title={title} fileName={draft ? undefined : `${invoice.invoiceNo}.pdf`} />;
}
